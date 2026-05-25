/**
 * Servidor de producción para CasaOS / Docker.
 * Sirve los estáticos del build de Vite y actúa como proxy hacia DynamoDB,
 * replicando la misma lógica del plugin plugins/dynamo-api.ts.
 *
 * Un único contenedor, un único puerto.
 */

import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DescribeTableCommand, DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb'
import { DeleteCommand, DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST_DIR = join(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT ?? '8080')
const REGION = process.env.DYNAMO_REGION ?? 'eu-west-1'

// ─── MIME types ───────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.webp': 'image/webp',
}

// ─── DynamoDB helpers ─────────────────────────────────────────────────────────

function getBaseClient(req: IncomingMessage): DynamoDBClient {
	const accessKeyId = req.headers['x-aws-access-key-id'] as string | undefined
	const secretAccessKey = req.headers['x-aws-secret-access-key'] as string | undefined
	const sessionToken = req.headers['x-aws-session-token'] as string | undefined

	if (!accessKeyId || !secretAccessKey) {
		throw new Error(
			'Se requieren credenciales AWS en las cabeceras (x-aws-access-key-id / x-aws-secret-access-key). ' +
				'Configúralas en Ajustes → credenciales del entorno.',
		)
	}

	return new DynamoDBClient({
		region: REGION,
		credentials: { accessKeyId, secretAccessKey, sessionToken },
	})
}

function getDocClient(req: IncomingMessage): DynamoDBDocumentClient {
	return DynamoDBDocumentClient.from(getBaseClient(req))
}

function riskForEnvironment(env: string): string {
	if (env === 'pro') return 'high'
	if (env === 'pre') return 'medium'
	return 'low'
}

async function readBody(req: IncomingMessage): Promise<unknown> {
	return new Promise((resolve, reject) => {
		let data = ''
		req.on('data', (chunk: Buffer) => {
			data += chunk.toString()
		})
		req.on('end', () => {
			try {
				resolve(data ? JSON.parse(data) : {})
			} catch {
				reject(new Error('Invalid JSON body'))
			}
		})
		req.on('error', reject)
	})
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	const json = JSON.stringify(body)
	res.writeHead(status, { 'Content-Type': 'application/json' })
	res.end(json)
}

function sendError(res: ServerResponse, status: number, message: string): void {
	sendJson(res, status, { error: message })
}

// ─── API handlers ─────────────────────────────────────────────────────────────

async function handleListTables(
	environment: string,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const base = getBaseClient(req)
	const names: string[] = []
	let lastKey: string | undefined

	do {
		const result = await base.send(new ListTablesCommand({ ExclusiveStartTableName: lastKey }))
		names.push(...(result.TableNames ?? []))
		lastKey = result.LastEvaluatedTableName
	} while (lastKey)

	const tables = await Promise.all(
		names.map(async (name) => {
			const desc = await base.send(new DescribeTableCommand({ TableName: name }))
			const t = desc.Table!
			const partitionKey =
				t.KeySchema?.find((k) => k.KeyType === 'HASH')?.AttributeName ?? 'id'
			const sortKey =
				t.KeySchema?.find((k) => k.KeyType === 'RANGE')?.AttributeName ?? null
			return {
				name,
				description: 'Managed through Dynamo Visual Console',
				partitionKey,
				sortKey,
				itemCount: t.ItemCount ?? 0,
				lastUpdated: t.CreationDateTime?.toISOString() ?? new Date().toISOString(),
				riskLevel: riskForEnvironment(environment),
			}
		}),
	)

	tables.sort((a, b) => a.name.localeCompare(b.name))
	sendJson(res, 200, tables)
}

async function handleListItems(
	_environment: string,
	tableName: string,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const doc = getDocClient(req)
	const items: Record<string, unknown>[] = []
	let lastKey: Record<string, unknown> | undefined

	do {
		const result = await doc.send(
			new ScanCommand({ TableName: tableName, ExclusiveStartKey: lastKey })
		)
		items.push(...(result.Items ?? []))
		lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined
	} while (lastKey)

	sendJson(res, 200, items)
}

async function handleSaveItem(
	_environment: string,
	tableName: string,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const item = await readBody(req)
	const doc = getDocClient(req)
	await doc.send(new PutCommand({ TableName: tableName, Item: item as Record<string, unknown> }))
	sendJson(res, 200, item)
}

async function handleDeleteItem(
	_environment: string,
	tableName: string,
	itemId: string,
	sortKeyValue: string | undefined,
	req: IncomingMessage,
	res: ServerResponse,
): Promise<void> {
	const base = getBaseClient(req)
	const desc = await base.send(new DescribeTableCommand({ TableName: tableName }))
	const keySchema = desc.Table?.KeySchema ?? []

	const key: Record<string, unknown> = {}
	for (const k of keySchema) {
		if (k.KeyType === 'HASH') key[k.AttributeName!] = itemId
		else if (k.KeyType === 'RANGE') {
			if (!sortKeyValue) {
				sendError(res, 400, 'Missing sortKeyValue')
				return
			}
			key[k.AttributeName!] = sortKeyValue
		}
	}

	const doc = getDocClient(req)
	await doc.send(new DeleteCommand({ TableName: tableName, Key: key }))
	res.writeHead(204)
	res.end()
}

// ─── Static file serving ──────────────────────────────────────────────────────

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
	const url = new URL(req.url ?? '/', 'http://localhost')
	let filePath = join(DIST_DIR, url.pathname)

	if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
		filePath = join(DIST_DIR, 'index.html')
	}

	const ext = extname(filePath)
	const mime = MIME[ext] ?? 'application/octet-stream'
	const stat = statSync(filePath)

	res.writeHead(200, {
		'Content-Type': mime,
		'Content-Length': stat.size,
		...(ext === '.html'
			? { 'Cache-Control': 'no-cache' }
			: { 'Cache-Control': 'public, max-age=31536000, immutable' }),
	})
	createReadStream(filePath).pipe(res)
}

// ─── HTTP server / router ─────────────────────────────────────────────────────

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
	const url = new URL(req.url ?? '/', 'http://localhost')
	const pathname = url.pathname
	const environment = url.searchParams.get('environment') ?? 'desa'

	// CORS preflight
	if (req.method === 'OPTIONS') {
		res.writeHead(204, {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Headers': '*',
			'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
		})
		res.end()
		return
	}

	if (pathname.startsWith('/api/')) {
		try {
			// GET /api/tables
			if (req.method === 'GET' && pathname === '/api/tables') {
				await handleListTables(environment, req, res)
				return
			}

			// GET|PUT /api/tables/:tableName/items
			const itemsMatch = /^\/api\/tables\/([^/]+)\/items$/.exec(pathname)
			if (itemsMatch) {
				const tableName = decodeURIComponent(itemsMatch[1])
				if (req.method === 'GET') {
					await handleListItems(environment, tableName, req, res)
					return
				}
				if (req.method === 'PUT') {
					await handleSaveItem(environment, tableName, req, res)
					return
				}
			}

			// DELETE /api/tables/:tableName/items/:itemId
			const deleteMatch = /^\/api\/tables\/([^/]+)\/items\/([^/]+)$/.exec(pathname)
			if (deleteMatch && req.method === 'DELETE') {
				const tableName = decodeURIComponent(deleteMatch[1])
				const itemId = decodeURIComponent(deleteMatch[2])
				const sortKeyValue = url.searchParams.get('sortKeyValue') ?? undefined
				await handleDeleteItem(environment, tableName, itemId, sortKeyValue, req, res)
				return
			}

			sendError(res, 404, 'Not found')
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Internal error'
			console.error('[dynamo-api]', message)
			sendError(res, 500, message)
		}
		return
	}

	// Resto → archivos estáticos (SPA)
	serveStatic(req, res)
})

server.listen(PORT, () => {
	console.log(`[dynamo-console] Servidor corriendo en puerto ${PORT}`)
})
