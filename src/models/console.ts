export type TargetEnvironment = 'desa' | 'pre' | 'pro'

export const TARGET_ENVIRONMENTS: TargetEnvironment[] = ['desa', 'pre', 'pro']

/**
 * Entorno configurado por el usuario en modo remoto.
 * Puedes tener varios apuntando al mismo targetEnv con distintas credenciales.
 */
export interface CustomEnvironment {
	id: string // UUID generado al crear
	label: string // nombre visible en el desplegable
	targetEnv: TargetEnvironment // entorno AWS base al que apunta
	readonly: boolean // bloquea escritura/borrado
}

export interface ConsoleTableSummary {
	name: string
	description: string
	partitionKey: string
	sortKey?: string
	itemCount: number
	lastUpdated: string
	riskLevel: 'low' | 'medium' | 'high'
}

export interface ConsoleItem {
	id?: string
	[key: string]: unknown
}

export interface AwsCredentials {
	accessKeyId: string
	secretAccessKey: string
	sessionToken?: string
}

export interface ConsoleSettings {
	/** id del CustomEnvironment activo en remoto; TargetEnvironment en local */
	environment: string
	apiBaseUrl: string
	converterBaseUrl: string
	apiKey: string
	defaultTableName: string
	/** Entornos de solo lectura — modo local (npm run dev) */
	readonlyEnvironments: TargetEnvironment[]
	/** Lista libre de entornos configurados — modo remoto */
	customEnvironments: CustomEnvironment[]
}

export interface RuleConversionRequest {
	expression: string
	ruleName?: string
	description?: string
	environment: TargetEnvironment
}

export interface RuleConversionResult {
	expression: string
	ruleJson: Record<string, unknown>
}

export interface ConsoleDataset {
	tables: Record<TargetEnvironment, ConsoleTableSummary[]>
	items: Record<TargetEnvironment, Record<string, ConsoleItem[]>>
}

/** Una entrada de historial local: estado anterior de un item antes de guardarse. */
export interface HistoryEntry {
	snapshot: ConsoleItem
	savedAt: string
}
