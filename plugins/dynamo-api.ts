import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

import { DescribeTableCommand, DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb'
import { fromIni } from '@aws-sdk/credential-providers'
import {
	DeleteCommand,
	DynamoDBDocumentClient,
	PutCommand,
	ScanCommand,
} from '@aws-sdk/lib-dynamodb'

// Mapeo de entorno → perfil AWS de ~/.aws/credentials
// Sobreescribible por cada desarrollador en .env.local (no se commitea):
//   DYNAMO_PROFILE_DESA=miPerfilDesa
//   DYNAMO_PROFILE_PRE=miPerfilPre
//   DYNAMO_PROFILE_PRO=miPerfilPro
//   DYNAMO_REGION=eu-west-1
const PROFILE_MAP: Record<string, string> = {
	desa: process.env.DYNAMO_PROFILE_DESA ?? 'entornoDesa',
	pre: process.env.DYNAMO_PROFILE_PRE ?? 'entornoPre',
	pro: process.env.DYNAMO_PROFILE_PRO ?? 'entornoPro',
}

const REGION = process.env.DYNAMO_REGION ?? 'eu-west-1'

const clientCache = new Map<string, DynamoDBDocumentClient>()
const baseClientCache = new Map<string, DynamoDBClient>()

function getBaseClient(environment: string, req?: IncomingMessage): DynamoDBClient {
	// APP_MODE se lee en tiempo de request (no al importar el módulo) para que
	// refleje correctamente el valor que vite.config.ts asigna a process.env.APP_MODE
	// según el modo de arranque:
	//   npm run dev   → local  (usa perfiles de ~/.aws/credentials)
	//   npm run desa  → remote (requiere credenciales en cabeceras de cada request)
	const appMode = process.env.APP_MODE ?? 'local'

	// Si el request trae credenciales temporales en cabeceras, usarlas directamente
	// (no se cachean — cada request puede tener credenciales distintas)
	const accessKeyId = req?.headers['x-aws-access-key-id'] as string | undefined
	const secretAccessKey = req?.headers['x-aws-secret-access-key'] as string | undefined
	const sessionToken = req?.headers['x-aws-session-token'] as string | undefined

	if (accessKeyId && secretAccessKey) {
		return new DynamoDBClient({
			region: REGION,
			credentials: { accessKeyId, secretAccessKey, sessionToken },
		})
	}

	// En modo remoto, las credenciales son OBLIGATORIAS en las cabeceras.
	// No caemos a perfiles de ~/.aws para forzar el flujo de configuración manual.
	if (appMode === 'remote') {
		throw new Error(
			'Modo remoto: se requieren credenciales AWS en las cabeceras (x-aws-access-key-id / x-aws-secret-access-key). ' +
				'Configúralas en Ajustes → credenciales del entorno.'
		)
	}

	// Sin credenciales en cabeceras y modo local → usar perfil de ~/.aws/credentials
	if (!baseClientCache.has(environment)) {
		const profile = PROFILE_MAP[environment]
		if (!profile) throw new Error(`Entorno no configurado: ${environment}`)
		const client = new DynamoDBClient({
			region: REGION,
			credentials: fromIni({ profile }),
		})
		baseClientCache.set(environment, client)
	}
	return baseClientCache.get(environment)!
}

function getDocClient(environment: string, req?: IncomingMessage): DynamoDBDocumentClient {
	// Si hay credenciales en cabeceras, no podemos cachear por entorno
	const accessKeyId = req?.headers['x-aws-access-key-id'] as string | undefined
	if (accessKeyId) {
		return DynamoDBDocumentClient.from(getBaseClient(environment, req))
	}

	if (!clientCache.has(environment)) {
		clientCache.set(environment, DynamoDBDocumentClient.from(getBaseClient(environment)))
	}
	return clientCache.get(environment)!
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

function sendJson(res: ServerResponse, status: number, body: unknown) {
	const json = JSON.stringify(body)
	res.writeHead(status, { 'Content-Type': 'application/json' })
	res.end(json)
}

function sendError(res: ServerResponse, status: number, message: string) {
	sendJson(res, status, { error: message })
}

async function handleListTables(environment: string, req: IncomingMessage, res: ServerResponse) {
	const base = getBaseClient(environment, req)
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
			const partitionKey = t.KeySchema?.find((k) => k.KeyType === 'HASH')?.AttributeName ?? 'id'
			const sortKey = t.KeySchema?.find((k) => k.KeyType === 'RANGE')?.AttributeName ?? null
			return {
				name,
				description: 'Managed through Dynamo Visual Console',
				partitionKey,
				sortKey,
				itemCount: t.ItemCount ?? 0,
				lastUpdated: t.CreationDateTime?.toISOString() ?? new Date().toISOString(),
				riskLevel: riskForEnvironment(environment),
			}
		})
	)

	tables.sort((a, b) => a.name.localeCompare(b.name))
	sendJson(res, 200, tables)
}

async function handleListItems(
	environment: string,
	tableName: string,
	req: IncomingMessage,
	res: ServerResponse
) {
	const doc = getDocClient(environment, req)
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
	environment: string,
	tableName: string,
	req: IncomingMessage,
	res: ServerResponse
) {
	const item = await readBody(req)
	const doc = getDocClient(environment, req)
	await doc.send(new PutCommand({ TableName: tableName, Item: item as Record<string, unknown> }))
	sendJson(res, 200, item)
}

async function handleDeleteItem(
	environment: string,
	tableName: string,
	itemId: string,
	sortKeyValue: string | undefined,
	req: IncomingMessage,
	res: ServerResponse
) {
	const base = getBaseClient(environment, req)
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

	const doc = getDocClient(environment, req)
	await doc.send(new DeleteCommand({ TableName: tableName, Key: key }))
	res.writeHead(204)
	res.end()
}

export function dynamoApiPlugin(): Plugin {
	return {
		name: 'dynamo-api',
		configureServer(server) {
			server.middlewares.use(
				async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
					const url = new URL(req.url ?? '/', 'http://localhost')
					const pathname = url.pathname
					const environment = url.searchParams.get('environment') ?? 'desa'

					if (!pathname.startsWith('/api/tables')) {
						next()
						return
					}

					try {
						// GET /api/tables
						if (req.method === 'GET' && pathname === '/api/tables') {
							await handleListTables(environment, req, res)
							return
						}

						// GET /api/tables/:tableName/items
						const itemsMatch = pathname.match(/^\/api\/tables\/([^/]+)\/items$/)
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
						const deleteMatch = pathname.match(/^\/api\/tables\/([^/]+)\/items\/([^/]+)$/)
						if (deleteMatch && req.method === 'DELETE') {
							const tableName = decodeURIComponent(deleteMatch[1])
							const itemId = decodeURIComponent(deleteMatch[2])
							const sortKeyValue = url.searchParams.get('sortKeyValue') ?? undefined
							await handleDeleteItem(environment, tableName, itemId, sortKeyValue, req, res)
							return
						}

						next()
					} catch (err) {
						const message = err instanceof Error ? err.message : 'Internal error'
						console.error('[dynamo-api]', message)
						sendError(res, 500, message)
					}
				}
			)
		},
	}
}
