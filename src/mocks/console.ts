import type { ConsoleDataset, ConsoleSettings } from '@/models/console'

export const DEFAULT_SETTINGS: ConsoleSettings = {
	environment: 'desa',
	apiBaseUrl: '/api',
	converterBaseUrl: '',
	apiKey: '',
	defaultTableName: 'rules_console',
	// Por defecto TODOS los entornos son de solo lectura (modo local).
	readonlyEnvironments: ['desa', 'pre', 'pro'],
	// Lista vacía: sin entornos configurados en remoto hasta que el usuario los añade.
	customEnvironments: [],
}

export const DEFAULT_DATASET: ConsoleDataset = {
	tables: {
		// No prefilled tables by default — keeps UI empty until user configures
		desa: [],
		pre: [],
		pro: [],
	},
	items: {
		// No items by default
		desa: {},
		pre: {},
		pro: {},
	},
}
