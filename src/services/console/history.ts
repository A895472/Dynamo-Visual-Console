import type { ConsoleItem } from '@/models/console'

const HISTORY_KEY = 'dynamo-console-item-history'
const MAX_HISTORY = 4

export interface HistoryEntry {
	/** Snapshot del item tal como estaba ANTES del guardado */
	snapshot: ConsoleItem
	/** ISO — momento en que se guardó la versión nueva (esta entrada es la anterior) */
	savedAt: string
}

type HistoryStore = Record<string, HistoryEntry[]>

const itemKey = (environment: string, tableName: string, itemId: string) =>
	`${environment}::${tableName}::${itemId}`

const readStore = (): HistoryStore => {
	try {
		const raw = localStorage.getItem(HISTORY_KEY)
		if (!raw) return {}
		return JSON.parse(raw) as HistoryStore
	} catch {
		return {}
	}
}

const writeStore = (store: HistoryStore) => {
	localStorage.setItem(HISTORY_KEY, JSON.stringify(store))
}

/**
 * Guarda el estado ANTERIOR del item en el historial, justo antes de sobrescribirlo.
 * Mantiene un máximo de MAX_HISTORY entradas por item (la más reciente primero).
 */
export const pushHistoryEntry = (
	environment: string,
	tableName: string,
	itemId: string,
	previousState: ConsoleItem
): void => {
	const store = readStore()
	const key = itemKey(environment, tableName, itemId)
	const existing = store[key] ?? []

	const entry: HistoryEntry = {
		snapshot: previousState,
		savedAt: new Date().toISOString(),
	}

	store[key] = [entry, ...existing].slice(0, MAX_HISTORY)
	writeStore(store)
}

/** Devuelve el historial de un item (más reciente primero). */
export const getItemHistory = (
	environment: string,
	tableName: string,
	itemId: string
): HistoryEntry[] => {
	const store = readStore()
	return store[itemKey(environment, tableName, itemId)] ?? []
}

/** Elimina todo el historial de un item concreto. */
export const clearItemHistory = (environment: string, tableName: string, itemId: string): void => {
	const store = readStore()
	delete store[itemKey(environment, tableName, itemId)]
	writeStore(store)
}
