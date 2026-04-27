import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import type { ConsoleItem, ConsoleTableSummary } from '@/models/console'
import { TARGET_ENVIRONMENTS } from '@/models/console'
import { consoleApi } from '@/services/console/api'

import TablesComponent from '../components/TablesComponent'

const IS_REMOTE_MODE = (import.meta.env.VITE_APP_MODE ?? 'local') === 'remote'

const confirmMutation = (environment: string, actionLabel: string) => {
	return window.confirm(
		`${actionLabel}. Vas a cambiar datos en ${environment.toUpperCase()}. ¿Seguro que quieres continuar?`
	)
}

const createNewItem = (items: ConsoleItem[], pkField: string): string => {
	const allKeys = Array.from(new Set(items.flatMap((item) => Object.keys(item))))
	const template: Record<string, unknown> = {}

	// PK siempre primero con valor de plantilla editable
	template[pkField] = `item-${Date.now()}`

	// Claves prioritarias que existan en la tabla
	for (const key of PRIORITY_EDITOR_KEYS) {
		if (key === pkField) continue
		if (allKeys.includes(key)) template[key] = ''
	}

	// Resto de claves de la tabla
	for (const key of allKeys) {
		if (key === pkField || PRIORITY_EDITOR_KEYS.includes(key)) continue
		template[key] = ''
	}

	return JSON.stringify(template, null, 2)
}
const PRIORITY_EDITOR_KEYS = ['id', 'destino', 'json_rule']

const orderItemForEditor = (item: ConsoleItem, pkField: string): ConsoleItem => {
	const pkValue = String(item[pkField] ?? '')
	const ordered: Record<string, unknown> = { [pkField]: pkValue }

	for (const key of PRIORITY_EDITOR_KEYS) {
		if (key === pkField) {
			continue
		}
		if (key in item) {
			ordered[key] = item[key]
		}
	}

	for (const key of Object.keys(item)) {
		if (key === pkField || PRIORITY_EDITOR_KEYS.includes(key)) {
			continue
		}
		ordered[key] = item[key]
	}

	return ordered as ConsoleItem
}

const sanitizeRuleJsonForStorage = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value.map(sanitizeRuleJsonForStorage)
	}

	if (value && typeof value === 'object') {
		const result: Record<string, unknown> = {}
		for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
			if (key === '_metadata' || key === '_sourceExpression') {
				continue
			}
			result[key] = sanitizeRuleJsonForStorage(entry)
		}
		return result
	}

	return value
}

const parseJsonRuleString = (raw: string): Record<string, unknown> | null => {
	try {
		const parsed = JSON.parse(raw) as unknown
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>
		}
	} catch {
		return null
	}

	return null
}

const extractRuleJsonFromItem = (item: ConsoleItem): Record<string, unknown> | null => {
	const explicitRule = item.ruleJson
	if (explicitRule && typeof explicitRule === 'object' && !Array.isArray(explicitRule)) {
		return explicitRule as Record<string, unknown>
	}

	if (typeof explicitRule === 'string') {
		const parsed = parseJsonRuleString(explicitRule)
		if (parsed) {
			return parsed
		}
	}

	const jsonRule = item.json_rule
	if (typeof jsonRule === 'string') {
		const parsed = parseJsonRuleString(jsonRule)
		if (parsed) {
			return parsed
		}
	}

	if (item.value && typeof item.value === 'object' && item.name && typeof item.name === 'string') {
		return item as Record<string, unknown>
	}

	return null
}

export function Tables() {
	const { t } = useTranslation('console')
	const settings = consoleApi.readSettings()
	const [environment, setEnvironment] = useState<string>(settings.environment)

	// Determinar si el entorno activo es de solo lectura
	const isReadonly = IS_REMOTE_MODE
		? (consoleApi.readSettings().customEnvironments.find((e) => e.id === environment)?.readonly ??
			true)
		: consoleApi.readSettings().readonlyEnvironments.includes(environment as 'desa' | 'pre' | 'pro')

	// Lista de entornos para el desplegable
	const availableEnvironments = IS_REMOTE_MODE
		? consoleApi.readSettings().customEnvironments.map((e) => ({
				id: e.id,
				label: e.label ? `${e.label} (${e.targetEnv})` : `(sin nombre) (${e.targetEnv})`,
			}))
		: TARGET_ENVIRONMENTS.map((id) => ({ id, label: t(`environment.names.${id}`) }))

	const [tables, setTables] = useState<ConsoleTableSummary[]>([])
	const [searchParams, setSearchParams] = useSearchParams()
	const [selectedTableName, setSelectedTableName] = useState(
		searchParams.get('table') ?? settings.defaultTableName
	)
	const [items, setItems] = useState<ConsoleItem[]>([])
	const [selectedItemId, setSelectedItemId] = useState('')
	const [editorValue, setEditorValue] = useState('')
	const [decodedValue, setDecodedValue] = useState('')
	const [decodedItemId, setDecodedItemId] = useState('')
	const [decodedDirty, setDecodedDirty] = useState(false)
	const [encodeModalOpen, setEncodeModalOpen] = useState(false)
	const [encodeExpression, setEncodeExpression] = useState('')
	const [errorMessage, setErrorMessage] = useState('')
	const [successMessage, setSuccessMessage] = useState('')
	const [autoEncodeEnabled, setAutoEncodeEnabled] = useState(false)
	const [editorMode, setEditorMode] = useState<'edit' | 'new' | 'duplicate'>('edit')
	const [isLoadingTables, setIsLoadingTables] = useState(false)
	const [isLoadingItems, setIsLoadingItems] = useState(false)
	const [isLoadingDecode, setIsLoadingDecode] = useState(false)

	useEffect(() => {
		setIsLoadingTables(true)
		const nextSettings = { ...consoleApi.readSettings(), environment }
		consoleApi.writeSettings(nextSettings)
		void consoleApi
			.listTables(environment)
			.then((nextTables) => {
				setTables(nextTables)
				setIsLoadingTables(false)
				if (nextTables.length === 0) {
					setSelectedTableName('')
					setItems([])
					return
				}

				const fallbackTable =
					nextTables.find((table) => table.name === selectedTableName)?.name ??
					nextTables.find((table) => table.name === settings.defaultTableName)?.name ??
					nextTables[0].name
				setSelectedTableName(fallbackTable)
			})
			.catch(() => {
				setIsLoadingTables(false)
			})
	}, [environment])

	useEffect(() => {
		if (!selectedTableName) {
			return
		}

		setIsLoadingItems(true)
		const nextSettings = { ...consoleApi.readSettings(), defaultTableName: selectedTableName }
		consoleApi.writeSettings(nextSettings)
		setDecodedValue('')
		setDecodedItemId('')
		void consoleApi
			.listItems(environment, selectedTableName)
			.then((nextItems) => {
				setItems(nextItems)
				setIsLoadingItems(false)
				if (nextItems.length === 0) {
					setSelectedItemId('')
					return
				}

				const exists = nextItems.some(
					(item) => String(item[tableKeys.partitionKey]) === selectedItemId
				)
				if (!exists && selectedItemId) {
					setSelectedItemId('')
				}
			})
			.catch(() => {
				setIsLoadingItems(false)
			})
	}, [environment, selectedTableName])

	// Mantener la URL sincronizada con la tabla seleccionada
	useEffect(() => {
		if (selectedTableName) {
			setSearchParams({ table: selectedTableName }, { replace: true })
		}
	}, [selectedTableName])

	// Atributos que tienen otros items de la tabla pero que el item en edición no tiene
	const selectedTable = tables.find((t) => t.name === selectedTableName)
	const tableKeys = {
		partitionKey: selectedTable?.partitionKey ?? 'id',
		sortKey: selectedTable?.sortKey,
	}

	const suggestedAttributes: string[] = (() => {
		if (!editorValue) return []
		try {
			const current = JSON.parse(editorValue) as Record<string, unknown>
			const currentKeys = new Set(Object.keys(current))
			const keyFields = new Set(
				[tableKeys.partitionKey, tableKeys.sortKey].filter(Boolean) as string[]
			)
			const PREDEFINED = [
				'responsable_solicitud',
				'fecha_creacion',
				'fecha_modificacion',
				'descripcion',
			]
			const fromItems = items.flatMap((item) => Object.keys(item))
			const allKeys = Array.from(new Set([...PREDEFINED, ...fromItems]))
			return allKeys.filter((k) => !currentKeys.has(k) && !keyFields.has(k))
		} catch {
			return []
		}
	})()

	const handleAddAttribute = (attrName: string, attrValue: string) => {
		if (!editorValue) return
		try {
			const parsed = JSON.parse(editorValue) as ConsoleItem
			let nextValue: unknown = attrValue
			try {
				nextValue = JSON.parse(attrValue)
			} catch {
				/* keep string */
			}
			const nextItem: ConsoleItem = { ...parsed, [attrName]: nextValue }
			setEditorValue(JSON.stringify(orderItemForEditor(nextItem, tableKeys.partitionKey), null, 2))
		} catch {
			/* ignore */
		}
	}

	const parseEditorItem = (): ConsoleItem | null => {
		try {
			return JSON.parse(editorValue) as ConsoleItem
		} catch {
			return null
		}
	}

	const reload = () => {
		if (!selectedTableName) {
			return
		}
		void consoleApi.listItems(environment, selectedTableName).then(setItems)
		void consoleApi.listTables(environment).then(setTables)
	}

	const decodeFromJsonRuleString = async (
		rawJsonRule: string,
		itemIdHint: string,
		showFeedback: boolean
	) => {
		const parsedRule = parseJsonRuleString(rawJsonRule)
		if (!parsedRule) {
			setDecodedValue('')
			setDecodedItemId('')
			setDecodedDirty(false)
			setIsLoadingDecode(false)
			if (showFeedback) {
				setErrorMessage('json_rule no es un JSON valido para descodificar.')
			}
			return
		}

		setIsLoadingDecode(true)

		try {
			const decoded = await consoleApi.decodeRule(environment, parsedRule)
			setDecodedValue(decoded)
			setDecodedItemId(itemIdHint)
			setEncodeExpression(decoded)
			setDecodedDirty(false)
			setIsLoadingDecode(false)
			if (showFeedback) {
				setSuccessMessage('json_rule descodificado correctamente.')
			}
		} catch (error) {
			setIsLoadingDecode(false)
			if (showFeedback) {
				setErrorMessage(
					error instanceof Error ? error.message : 'No se pudo descodificar json_rule.'
				)
			}
		}
	}

	const selectItemInEditor = (item: ConsoleItem) => {
		setErrorMessage('')
		const pkVal = String(item[tableKeys.partitionKey] ?? `__pk_${Date.now()}__`)
		setEditorMode('edit')
		setSelectedItemId(pkVal)
		const ordered = orderItemForEditor(item, tableKeys.partitionKey)
		setEditorValue(JSON.stringify(ordered, null, 2))
		setDecodedValue('')
		setDecodedItemId('')
		setDecodedDirty(false)
		if (typeof ordered.json_rule === 'string' && ordered.json_rule.trim().length > 0) {
			void decodeFromJsonRuleString(ordered.json_rule, pkVal, false)
		}
		setSuccessMessage(`Item ${pkVal} cargado en el editor.`)
	}

	const handleSaveItem = async () => {
		setErrorMessage('')
		setSuccessMessage('')

		if (isReadonly) {
			setErrorMessage('Este entorno es de solo lectura. No se pueden guardar cambios.')
			return
		}

		if (!selectedTableName) {
			setErrorMessage('Selecciona una tabla antes de guardar.')
			return
		}

		if (!confirmMutation(environment, 'Guardar item en DynamoDB')) {
			return
		}

		const parsed = parseEditorItem()
		if (!parsed) {
			setErrorMessage('El JSON final no es valido. Corrigelo antes de guardar.')
			return
		}

		try {
			await consoleApi.saveItem(environment, selectedTableName, parsed)
			setSuccessMessage(`Item ${String(parsed.id ?? '(sin id)')} guardado correctamente.`)
			reload()
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : 'No se pudo guardar el item.')
		}
	}

	const handleDeleteItem = async (itemId: string) => {
		setErrorMessage('')
		setSuccessMessage('')

		if (isReadonly) {
			setErrorMessage('Este entorno es de solo lectura. No se pueden borrar items.')
			return
		}

		if (!confirmMutation(environment, `Borrar ${itemId}`)) {
			return
		}

		try {
			await consoleApi.deleteItem(environment, selectedTableName, itemId)
			setSuccessMessage(`Item ${itemId} eliminado.`)
			reload()
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : 'No se pudo borrar el item.')
		}
	}

	const handleDecodeItem = async (item: ConsoleItem) => {
		setErrorMessage('')
		setSuccessMessage('')
		setDecodedValue('')

		const ruleJson = extractRuleJsonFromItem(item)
		if (!ruleJson) {
			setErrorMessage('No encuentro una regla JSON valida en este item para descodificarla.')
			return
		}

		try {
			const decoded = await consoleApi.decodeRule(environment, ruleJson)
			setDecodedItemId(String(item[tableKeys.partitionKey] ?? 'editor'))
			setDecodedValue(decoded)
			setEncodeExpression(decoded)
			setDecodedDirty(false)
			setSuccessMessage(
				`Item ${String(item[tableKeys.partitionKey] ?? 'sin-id')} descodificado correctamente.`
			)
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : 'No se pudo descodificar la regla del item.'
			)
		}
	}

	const handleDecodeEditor = async () => {
		setErrorMessage('')
		setSuccessMessage('')

		const parsed = parseEditorItem()
		if (!parsed) {
			setErrorMessage('El JSON final no es valido. Corrigelo antes de descodificar.')
			return
		}

		if (typeof parsed.json_rule !== 'string' || parsed.json_rule.trim().length === 0) {
			setErrorMessage('No hay json_rule valido en el editor.')
			return
		}

		await decodeFromJsonRuleString(
			parsed.json_rule,
			String(parsed.id ?? selectedItemId ?? 'editor'),
			true
		)
	}

	const applyExpressionToJsonRule = async (expression: string) => {
		const parsed = parseEditorItem()
		if (!parsed) {
			setErrorMessage('El JSON final no es valido. Corrigelo antes de aplicar la expresion.')
			return
		}

		if (!expression.trim()) {
			setErrorMessage('La expresion descodificada esta vacia.')
			return
		}

		const encoded = await consoleApi.encodeRule({
			expression: expression.trim(),
			ruleName: typeof parsed.name === 'string' ? parsed.name : undefined,
			description: typeof parsed.description === 'string' ? parsed.description : undefined,
			environment: environment as import('@/models/console').TargetEnvironment,
		})

		const cleanedRuleJson = sanitizeRuleJsonForStorage(encoded.ruleJson)
		const nextItem: ConsoleItem = {
			...parsed,
			json_rule: JSON.stringify(cleanedRuleJson),
		}

		delete nextItem.expression
		delete nextItem.ruleJson

		setEditorValue(JSON.stringify(orderItemForEditor(nextItem, tableKeys.partitionKey), null, 2))
		setDecodedItemId(String(nextItem[tableKeys.partitionKey] ?? selectedItemId ?? 'editor'))
		setDecodedDirty(false)
	}

	const handleDecodedExpressionChange = (value: string) => {
		setAutoEncodeEnabled(true)
		setDecodedValue(value)
		setDecodedDirty(true)
	}

	const onApplyDecodedExpression = async () => {
		setErrorMessage('')
		setSuccessMessage('')
		try {
			await applyExpressionToJsonRule(decodedValue)
			setSuccessMessage('Expresion aplicada y json_rule actualizado en el JSON final.')
		} catch (error) {
			setErrorMessage(
				error instanceof Error ? error.message : 'No se pudo aplicar la expresion a json_rule.'
			)
		}
	}

	useEffect(() => {
		if (!autoEncodeEnabled || !decodedDirty) {
			return
		}

		const expression = decodedValue.trim()
		if (!expression) {
			return
		}

		const timer = window.setTimeout(() => {
			void applyExpressionToJsonRule(expression).catch((error: unknown) => {
				setErrorMessage(
					error instanceof Error
						? error.message
						: 'No se pudo codificar el texto descodificado en json_rule.'
				)
			})
		}, 450)

		return () => window.clearTimeout(timer)
	}, [autoEncodeEnabled, decodedDirty, decodedValue])

	const handleStructuredFieldChange = (field: string, value: string) => {
		setErrorMessage('')
		const parsed = parseEditorItem()
		if (!parsed) {
			setErrorMessage('El JSON final no es valido. Corrigelo antes de editar campos estructurados.')
			return
		}

		if (field === 'json_rule') {
			setAutoEncodeEnabled(true)
			setDecodedValue(value)
			setDecodedDirty(true)
			setDecodedItemId(String(parsed[tableKeys.partitionKey] ?? selectedItemId ?? 'editor'))
			if (!value.trim()) {
				const nextItem: ConsoleItem = { ...parsed, json_rule: '' }
				setEditorValue(
					JSON.stringify(orderItemForEditor(nextItem, tableKeys.partitionKey), null, 2)
				)
				setDecodedDirty(false)
			}
			return
		}

		let nextValue: unknown = value
		const currentValue = parsed[field]
		if (typeof currentValue === 'number') {
			const num = Number(value)
			if (!Number.isNaN(num)) {
				nextValue = num
			}
		} else if (typeof currentValue === 'boolean') {
			nextValue = value.trim().toLowerCase() === 'true'
		} else if (currentValue && typeof currentValue === 'object') {
			try {
				nextValue = JSON.parse(value)
			} catch {
				setErrorMessage(`El campo ${field} debe contener JSON valido.`)
				return
			}
		}

		const nextItem: ConsoleItem = {
			...parsed,
			[field]: nextValue,
		}

		setEditorValue(JSON.stringify(orderItemForEditor(nextItem, tableKeys.partitionKey), null, 2))
		if (field === tableKeys.partitionKey) {
			setSelectedItemId(String(nextValue))
			if (decodedValue) {
				setDecodedItemId(String(nextValue))
			}
		}
	}

	const handleOpenEncodeModal = async () => {
		setErrorMessage('')
		const parsed = parseEditorItem()
		if (!parsed) {
			setErrorMessage('El JSON del editor no es valido. Corrigelo antes de codificar.')
			return
		}

		if (decodedValue.trim().length > 0) {
			setEncodeExpression(decodedValue)
			setEncodeModalOpen(true)
			return
		}

		if (typeof parsed.json_rule === 'string' && parsed.json_rule.trim().length > 0) {
			const parsedRule = parseJsonRuleString(parsed.json_rule)
			if (parsedRule) {
				try {
					const decoded = await consoleApi.decodeRule(environment, parsedRule)
					setEncodeExpression(decoded)
				} catch {
					setEncodeExpression('')
				}
			}
		}

		setEncodeModalOpen(true)
	}

	const handleApplyEncoding = async () => {
		setErrorMessage('')
		setSuccessMessage('')
		if (!encodeExpression.trim()) {
			setErrorMessage('La expresion a codificar esta vacia.')
			return
		}

		try {
			await applyExpressionToJsonRule(encodeExpression)
			setDecodedValue(encodeExpression.trim())
			setEncodeModalOpen(false)
			setSuccessMessage('Regla codificada y aplicada al editor.')
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : 'No se pudo codificar la expresion.')
		}
	}

	const handleDuplicateItem = (item: ConsoleItem) => {
		const pk = tableKeys.partitionKey
		const baseId = String(item[pk] ?? `item-${Date.now()}`)

		// Calcular sufijo: -copia, -copia-2, -copia-3...
		const existingIds = new Set(items.map((i) => String(i[pk] ?? '')))
		let newId = `${baseId}-copia`
		if (existingIds.has(newId)) {
			let n = 2
			while (existingIds.has(`${baseId}-copia-${n}`)) n++
			newId = `${baseId}-copia-${n}`
		}

		const duplicate: ConsoleItem = { ...item, [pk]: newId }
		setAutoEncodeEnabled(false)
		setDecodedValue('')
		setDecodedItemId('')
		setDecodedDirty(false)
		setEditorMode('duplicate')
		setSelectedItemId('__new__')
		setEditorValue(JSON.stringify(orderItemForEditor(duplicate, pk), null, 2))
		setSuccessMessage(`Duplicando ${baseId} → ${newId}. Edita y guarda para confirmar.`)
	}

	const handleNewItem = () => {
		setAutoEncodeEnabled(false)
		setEditorMode('new')
		setSelectedItemId('__new__')
		setDecodedValue('')
		setDecodedItemId('')
		setDecodedDirty(false)
		setEditorValue(createNewItem(items, tableKeys.partitionKey))
	}

	const editorParsed = parseEditorItem()
	const structuredFields = editorParsed
		? Object.entries(editorParsed).map(([key, value]) => {
				const computedValue =
					key === 'json_rule'
						? decodedValue
						: typeof value === 'string'
							? value
							: value === null
								? 'null'
								: typeof value === 'object'
									? JSON.stringify(value, null, 2)
									: String(value)

				return {
					key,
					value: computedValue,
					isJson: key !== 'json_rule' && value !== null && typeof value === 'object',
					isLong: computedValue.length > 120,
				}
			})
		: []

	return (
		<TablesComponent
			environment={environment}
			availableEnvironments={availableEnvironments}
			tables={tables}
			selectedTableName={selectedTableName}
			items={items}
			selectedItemId={selectedItemId}
			editorValue={editorValue}
			structuredFields={structuredFields}
			tableKeys={tableKeys}
			decodedValue={decodedValue}
			decodedItemId={decodedItemId}
			decodedDirty={decodedDirty}
			encodeModalOpen={encodeModalOpen}
			encodeExpression={encodeExpression}
			errorMessage={errorMessage}
			successMessage={successMessage}
			isLoadingTables={isLoadingTables}
			isLoadingItems={isLoadingItems}
			isLoadingDecode={isLoadingDecode}
			isReadonly={isReadonly}
			onEnvironmentChange={setEnvironment}
			onTableChange={setSelectedTableName}
			onEditorChange={setEditorValue}
			onStructuredFieldChange={handleStructuredFieldChange}
			onDecodedExpressionChange={handleDecodedExpressionChange}
			onApplyDecodedExpression={() => {
				void onApplyDecodedExpression()
			}}
			onSelectItem={selectItemInEditor}
			onDecodeItem={(item) => {
				void handleDecodeItem(item)
			}}
			onDecodeEditor={() => {
				void handleDecodeEditor()
			}}
			onOpenEncodeModal={() => {
				void handleOpenEncodeModal()
			}}
			onCloseEncodeModal={() => setEncodeModalOpen(false)}
			onEncodeExpressionChange={setEncodeExpression}
			onApplyEncoding={() => {
				void handleApplyEncoding()
			}}
			onSaveItem={() => {
				void handleSaveItem()
			}}
			onDeleteItem={(itemId) => {
				void handleDeleteItem(itemId)
			}}
			editorMode={editorMode}
			onNewItem={handleNewItem}
			onDuplicateItem={handleDuplicateItem}
			suggestedAttributes={suggestedAttributes}
			onAddAttribute={handleAddAttribute}
		/>
	)
}
