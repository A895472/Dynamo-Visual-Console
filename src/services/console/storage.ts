import { DEFAULT_DATASET, DEFAULT_SETTINGS } from '@/mocks/console'
import type {
	AwsCredentials,
	ConsoleDataset,
	ConsoleItem,
	ConsoleSettings,
	TargetEnvironment,
} from '@/models/console'

const SETTINGS_KEY = 'dynamo-console-settings'
const DATASET_KEY = 'dynamo-console-mock-dataset'
const CREDENTIALS_KEY = 'dynamo-console-aws-credentials'

// ─── Credenciales globales (retrocompatibilidad / modo local) ────────────────

export const readCredentials = (): AwsCredentials | null => {
	try {
		const raw = localStorage.getItem(CREDENTIALS_KEY)
		if (!raw) return null
		return JSON.parse(raw) as AwsCredentials
	} catch {
		return null
	}
}

export const writeCredentials = (creds: AwsCredentials) => {
	localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(creds))
}

export const clearCredentials = () => {
	localStorage.removeItem(CREDENTIALS_KEY)
}

// ─── Credenciales por id de CustomEnvironment (modo remoto) ─────────────────

const envCredsKey = (id: string) => `${CREDENTIALS_KEY}-${id}`

export const readEnvCredentials = (id: string): AwsCredentials | null => {
	try {
		const raw = localStorage.getItem(envCredsKey(id))
		if (!raw) return null
		return JSON.parse(raw) as AwsCredentials
	} catch {
		return null
	}
}

export const writeEnvCredentials = (id: string, creds: AwsCredentials) => {
	localStorage.setItem(envCredsKey(id), JSON.stringify(creds))
}

export const clearEnvCredentials = (id: string) => {
	localStorage.removeItem(envCredsKey(id))
}

const cloneDataset = (): ConsoleDataset =>
	JSON.parse(JSON.stringify(DEFAULT_DATASET)) as ConsoleDataset

export const readSettings = (): ConsoleSettings => {
	try {
		const raw = localStorage.getItem(SETTINGS_KEY)
		if (!raw) {
			return DEFAULT_SETTINGS
		}

		const saved = JSON.parse(raw) as Partial<ConsoleSettings>
		// Si apiBaseUrl está vacía en localStorage, usar el DEFAULT
		if (!saved.apiBaseUrl?.trim()) {
			delete saved.apiBaseUrl
		}
		return {
			...DEFAULT_SETTINGS,
			...saved,
			// Garantizar que customEnvironments siempre es un array
			customEnvironments: saved.customEnvironments ?? DEFAULT_SETTINGS.customEnvironments,
		}
	} catch {
		return DEFAULT_SETTINGS
	}
}

export const writeSettings = (settings: ConsoleSettings) => {
	localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export const readDataset = (): ConsoleDataset => {
	try {
		const raw = localStorage.getItem(DATASET_KEY)
		if (!raw) {
			const seed = cloneDataset()
			localStorage.setItem(DATASET_KEY, JSON.stringify(seed))
			return seed
		}

		return JSON.parse(raw) as ConsoleDataset
	} catch {
		const seed = cloneDataset()
		localStorage.setItem(DATASET_KEY, JSON.stringify(seed))
		return seed
	}
}

const writeDataset = (dataset: ConsoleDataset) => {
	localStorage.setItem(DATASET_KEY, JSON.stringify(dataset))
}

export const listMockTables = (environment: TargetEnvironment) =>
	readDataset().tables[environment] ?? []

export const listMockItems = (environment: TargetEnvironment, tableName: string) => {
	const dataset = readDataset()
	return dataset.items[environment]?.[tableName] ?? []
}

export const saveMockItem = (
	environment: TargetEnvironment,
	tableName: string,
	item: ConsoleItem
) => {
	const dataset = readDataset()
	const tableItems = dataset.items[environment]?.[tableName] ?? []
	const nextItems = tableItems.filter((entry) => entry.id !== item.id)
	nextItems.unshift(item)

	if (!dataset.items[environment]) {
		dataset.items[environment] = {}
	}
	dataset.items[environment][tableName] = nextItems

	const tables = dataset.tables[environment] ?? []
	const existingTable = tables.find((table) => table.name === tableName)
	if (!existingTable) {
		tables.unshift({
			name: tableName,
			description: 'Tabla creada desde la consola visual.',
			partitionKey: 'id',
			itemCount: nextItems.length,
			lastUpdated: new Date().toISOString(),
			riskLevel: environment === 'pro' ? 'high' : environment === 'pre' ? 'medium' : 'low',
		})
		dataset.tables[environment] = tables
	} else {
		existingTable.itemCount = nextItems.length
		existingTable.lastUpdated = new Date().toISOString()
	}

	writeDataset(dataset)
	return item
}

export const deleteMockItem = (
	environment: TargetEnvironment,
	tableName: string,
	itemId: string
) => {
	const dataset = readDataset()
	const tableItems = dataset.items[environment]?.[tableName] ?? []
	const nextItems = tableItems.filter((entry) => entry.id !== itemId)

	if (!dataset.items[environment]) {
		dataset.items[environment] = {}
	}
	dataset.items[environment][tableName] = nextItems

	const table = dataset.tables[environment]?.find((entry) => entry.name === tableName)
	if (table) {
		table.itemCount = nextItems.length
		table.lastUpdated = new Date().toISOString()
	}

	writeDataset(dataset)
}
