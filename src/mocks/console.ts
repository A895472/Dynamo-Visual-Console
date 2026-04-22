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
		desa: [
			{
				name: 'rules_console',
				description: 'Reglas funcionales para pruebas rápidas y validación visual.',
				partitionKey: 'id',
				itemCount: 2,
				lastUpdated: '2026-04-14T09:00:00Z',
				riskLevel: 'low',
			},
			{
				name: 'customer_profiles',
				description: 'Perfiles de cliente usados por el dashboard y reglas de routing.',
				partitionKey: 'id',
				itemCount: 3,
				lastUpdated: '2026-04-14T08:15:00Z',
				riskLevel: 'medium',
			},
		],
		pre: [
			{
				name: 'rules_console',
				description: 'Preproducción para ensayos con datos realistas.',
				partitionKey: 'id',
				itemCount: 1,
				lastUpdated: '2026-04-13T18:45:00Z',
				riskLevel: 'medium',
			},
		],
		pro: [
			{
				name: 'rules_console',
				description: 'Producción. Cambios bajo confirmación reforzada.',
				partitionKey: 'id',
				itemCount: 1,
				lastUpdated: '2026-04-12T11:10:00Z',
				riskLevel: 'high',
			},
		],
	},
	items: {
		desa: {
			rules_console: [
				{
					id: 'rule-001',
					name: 'Only urgente envios',
					environment: 'desa',
					expression: 'payload.mensaje.envio.urgente = true',
					active: true,
				},
				{
					id: 'rule-002',
					name: 'Servicio premium',
					environment: 'desa',
					expression: "payload.mensaje.envio.datosservicio.codservicio IN ('48', '63')",
					active: true,
				},
			],
			customer_profiles: [
				{
					id: 'cust-001',
					segment: 'B2C',
					country: 'ES',
					preferredChannel: 'web',
				},
				{
					id: 'cust-002',
					segment: 'B2B',
					country: 'PT',
					preferredChannel: 'api',
				},
				{
					id: 'cust-003',
					segment: 'SMB',
					country: 'ES',
					preferredChannel: 'office',
				},
			],
		},
		pre: {
			rules_console: [
				{
					id: 'rule-pre-001',
					name: 'Regla pre validada',
					environment: 'pre',
					expression: "payload.mensaje.envio.datosenvio.codpais = 'ES'",
					active: false,
				},
			],
		},
		pro: {
			rules_console: [
				{
					id: 'rule-pro-001',
					name: 'Regla productiva',
					environment: 'pro',
					expression: "payload.mensaje.envio.estado != 'CANCELADO'",
					active: true,
				},
			],
		},
	},
}
