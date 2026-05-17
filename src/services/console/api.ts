import type {
	ConsoleItem,
	ConsoleSettings,
	ConsoleTableSummary,
	RuleConversionRequest,
	RuleConversionResult,
	TargetEnvironment,
} from '@/models/console'

import { localParseRule, localReverseRule } from '@/services/converter'

import {
	deleteMockItem,
	listMockItems,
	listMockTables,
	readCredentials,
	readEnvCredentials,
	readSettings,
	saveMockItem,
	writeSettings,
} from './storage'

const isRemoteMode = () => (import.meta.env.VITE_APP_MODE ?? 'local') === 'remote'

/**
 * En modo remoto, resuelve el TargetEnvironment real (desa/pre/pro)
 * a partir del id del CustomEnvironment seleccionado.
 * En modo local, envId es directamente el TargetEnvironment.
 */
const resolveTargetEnv = (settings: ConsoleSettings, envId: string): TargetEnvironment => {
	if (isRemoteMode()) {
		return settings.customEnvironments.find((e) => e.id === envId)?.targetEnv ?? 'desa'
	}
	return envId as TargetEnvironment
}

/** Cabeceras HTTP con credenciales. En remoto usa las del CustomEnvironment por id. */
const jsonHeaders = (settings: ConsoleSettings, credentialKey: string) => {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' }

	if (settings.apiKey.trim()) {
		headers['x-api-key'] = settings.apiKey.trim()
	}

	const creds = isRemoteMode()
		? (readEnvCredentials(credentialKey) ?? readCredentials())
		: readCredentials()

	if (creds) {
		headers['x-aws-access-key-id'] = creds.accessKeyId
		headers['x-aws-secret-access-key'] = creds.secretAccessKey
		if (creds.sessionToken) headers['x-aws-session-token'] = creds.sessionToken
	}

	return headers
}

const buildUrl = (baseUrl: string, path: string, environment: TargetEnvironment) => {
	const base = baseUrl.startsWith('/') ? `${window.location.origin}${baseUrl}` : baseUrl
	const url = new URL(`${base.replace(/\/$/, '')}${path}`)
	url.searchParams.set('environment', environment)
	return url.toString()
}

async function tryFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
	const response = await fetch(input, init)
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`)
	}

	return (await response.json()) as T
}

const normalizeArrayPayload = <T>(payload: unknown): T[] => {
	if (Array.isArray(payload)) {
		return payload as T[]
	}

	if (
		payload &&
		typeof payload === 'object' &&
		Array.isArray((payload as { value?: unknown[] }).value)
	) {
		return (payload as { value: T[] }).value
	}

	return []
}

const buildFallbackRule = (request: RuleConversionRequest): RuleConversionResult => ({
	expression: request.expression,
	ruleJson: {
		name: request.ruleName || 'Generated visual rule',
		value: {
			name: 'rawExpression',
			value1: {
				name: 'field',
				value1: 'expression',
				value2: 'String',
			},
			value2: {
				name: 'lit',
				value1: request.expression,
				value2: 'String',
			},
		},
		_metadata: {
			ruleName: request.ruleName || 'Generated visual rule',
			description: request.description || 'Fallback preview generated in frontend',
			environment: request.environment,
		},
		_sourceExpression: request.expression,
	},
})

export const consoleApi = {
	readSettings,
	writeSettings,
	/**
	 * Recibe el envId (CustomEnvironment.id en remoto, TargetEnvironment en local).
	 * Resuelve internamente a qué entorno AWS apunta y qué credenciales usar.
	 */
	async listTables(envId: string) {
		const settings = readSettings()
		const targetEnv = resolveTargetEnv(settings, envId)
		if (!settings.apiBaseUrl.trim()) {
			return listMockTables(targetEnv)
		}
		try {
			const payload = await tryFetch<unknown>(buildUrl(settings.apiBaseUrl, '/tables', targetEnv), {
				headers: jsonHeaders(settings, envId),
			})
			return normalizeArrayPayload<ConsoleTableSummary>(payload)
		} catch {
			return []
		}
	},
	async listItems(envId: string, tableName: string) {
		const settings = readSettings()
		const targetEnv = resolveTargetEnv(settings, envId)
		if (!settings.apiBaseUrl.trim()) {
			return listMockItems(targetEnv, tableName)
		}
		try {
			const payload = await tryFetch<unknown>(
				buildUrl(settings.apiBaseUrl, `/tables/${encodeURIComponent(tableName)}/items`, targetEnv),
				{ headers: jsonHeaders(settings, envId) }
			)
			return normalizeArrayPayload<ConsoleItem>(payload)
		} catch {
			return []
		}
	},
	async saveItem(envId: string, tableName: string, item: ConsoleItem) {
		const settings = readSettings()
		const targetEnv = resolveTargetEnv(settings, envId)
		if (!settings.apiBaseUrl.trim()) {
			return saveMockItem(targetEnv, tableName, item)
		}
		try {
			return await tryFetch<ConsoleItem>(
				buildUrl(settings.apiBaseUrl, `/tables/${encodeURIComponent(tableName)}/items`, targetEnv),
				{ method: 'PUT', headers: jsonHeaders(settings, envId), body: JSON.stringify(item) }
			)
		} catch {
			return saveMockItem(targetEnv, tableName, item)
		}
	},
	async deleteItem(envId: string, tableName: string, itemId: string) {
		const settings = readSettings()
		const targetEnv = resolveTargetEnv(settings, envId)
		if (!settings.apiBaseUrl.trim()) {
			deleteMockItem(targetEnv, tableName, itemId)
			return
		}
		try {
			await tryFetch<void>(
				buildUrl(
					settings.apiBaseUrl,
					`/tables/${encodeURIComponent(tableName)}/items/${encodeURIComponent(itemId)}`,
					targetEnv
				),
				{ method: 'DELETE', headers: jsonHeaders(settings, envId) }
			)
		} catch {
			deleteMockItem(targetEnv, tableName, itemId)
		}
	},
	encodeRule(request: RuleConversionRequest): RuleConversionResult {
		try {
			return localParseRule(request) as RuleConversionResult
		} catch {
			return buildFallbackRule(request)
		}
	},
	decodeRule(_envId: string, ruleJson: Record<string, unknown>): string {
		try {
			return localReverseRule(ruleJson).expression
		} catch {
			return typeof ruleJson._sourceExpression === 'string'
				? (ruleJson._sourceExpression as string)
				: JSON.stringify(ruleJson, null, 2)
		}
	},
}

export {
	readCredentials,
	writeCredentials,
	clearCredentials,
	readEnvCredentials,
	writeEnvCredentials,
	clearEnvCredentials,
} from './storage'
