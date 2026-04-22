import { useCallback, useEffect, useRef, useState } from 'react'

import type { TargetEnvironment } from '@/models/console'
import { consoleApi } from '@/services/console/api'
import { ParseError, parseRule } from '@/services/converter/parser'
import { generateDynamoRule } from '@/services/converter/generator'
import { dynamoJsonToText } from '@/services/converter/reverser'
import { validateDynamoSchema } from '@/services/converter/validator'

import ConverterComponent from '../components/ConverterComponent'
import type {
	HistoryEntry,
	KnownField,
	MotorFields,
	ParseErrorInfo,
	Tab,
} from '../components/ConverterComponent'

// ─── Constants ───────────────────────────────────────────────────────────────

const KNOWN_FIELDS: KnownField[] = [
	{ path: 'payload.mensaje.envio.codaplicacion', type: 'Int' },
	{ path: 'payload.mensaje.envio.eventosenvio.evento.codevento', type: 'String' },
	{ path: 'payload.mensaje.envio.datosservicio.tipoprod.codupu', type: 'String' },
	{ path: 'payload.mensaje.envio.datosenvio.codproducto', type: 'String' },
	{ path: 'payload.mensaje.envio.datosenvio.referenciaenvio', type: 'String' },
	{ path: 'payload.mensaje.envio.datosenvio.codpais', type: 'String' },
	{ path: 'payload.mensaje.envio.datosservicio.codservicio', type: 'String' },
	{ path: 'payload.mensaje.envio.datosservicio.tiposervicio', type: 'String' },
	{ path: 'payload.mensaje.envio.datosservicio.modalidad', type: 'String' },
	{ path: 'payload.mensaje.envio.datosdir.codpostal', type: 'String' },
	{ path: 'payload.mensaje.envio.datosdir.provincia', type: 'String' },
	{ path: 'payload.mensaje.envio.datosdir.localidad', type: 'String' },
	{ path: 'payload.mensaje.envio.peso', type: 'Double' },
	{ path: 'payload.mensaje.envio.numpaquetes', type: 'Int' },
	{ path: 'payload.mensaje.envio.remitente.nombre', type: 'String' },
	{ path: 'payload.mensaje.envio.destinatario.nombre', type: 'String' },
	{ path: 'payload.mensaje.envio.estado', type: 'String' },
	{ path: 'payload.mensaje.envio.fecharecogida', type: 'String' },
	{ path: 'payload.mensaje.envio.fechaentrega', type: 'String' },
	{ path: 'payload.mensaje.envio.urgente', type: 'Boolean' },
]

const HISTORY_KEY = 'dynamo_rule_converter_history'
const MAX_HISTORY = 50

// ─── History helpers ──────────────────────────────────────────────────────────

function loadHistory(): HistoryEntry[] {
	try {
		return (JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryEntry[]) ?? []
	} catch {
		return []
	}
}

function saveHistoryEntry(ruleText: string, json: Record<string, unknown>) {
	const history = loadHistory()
	history.unshift({ id: Date.now(), ruleText, json, date: new Date().toISOString() })
	if (history.length > MAX_HISTORY) history.pop()
	localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

// ─── Container ────────────────────────────────────────────────────────────────

export default function Converter() {
	const settings = consoleApi.readSettings()
	const [saveEnvironment, setSaveEnvironment] = useState<TargetEnvironment>(settings.environment)
	const isReadonly = settings.readonlyEnvironments.includes(saveEnvironment)

	// Tabs
	const [activeTab, setActiveTab] = useState<Tab>('converter')

	// Converter tab
	const [expression, setExpression] = useState('')
	const [currentJson, setCurrentJson] = useState<Record<string, unknown> | null>(null)
	const [convertError, setConvertError] = useState<ParseErrorInfo | null>(null)
	const [convertSuccess, setConvertSuccess] = useState('')
	const textareaRef = useRef<HTMLTextAreaElement>(null)

	// Autocomplete
	const [acItems, setAcItems] = useState<KnownField[]>([])
	const [acIndex, setAcIndex] = useState(-1)
	const [acTarget, setAcTarget] = useState<{ start: number; end: number } | null>(null)

	// Motor de Reglas
	const [motor, setMotor] = useState<MotorFields>({
		id: '',
		destino: '',
		responsable: '',
		fechaCreacion: '',
		descripcion: '',
	})
	const [motorJson, setMotorJson] = useState<Record<string, unknown> | null>(null)
	const [motorError, setMotorError] = useState('')
	const [motorSuccess, setMotorSuccess] = useState('')

	// Save
	const [saveResult, setSaveResult] = useState('')
	const [saveError, setSaveError] = useState('')

	// Import
	const [importInput, setImportInput] = useState('')
	const [importOutput, setImportOutput] = useState('')
	const [importError, setImportError] = useState('')
	const [importSuccess, setImportSuccess] = useState('')
	const [importValidation, setImportValidation] = useState<
		Array<{ path: string; message: string; valid?: boolean }>
	>([])
	const fileInputRef = useRef<HTMLInputElement>(null)

	// History
	const [history, setHistory] = useState<HistoryEntry[]>([])
	useEffect(() => {
		if (activeTab === 'history') setHistory(loadHistory())
	}, [activeTab])

	// ─── Convert ─────────────────────────────────────────────────────────────

	const convert = useCallback(() => {
		setConvertError(null)
		setConvertSuccess('')
		setSaveResult('')
		setSaveError('')
		if (!expression.trim()) {
			setConvertError({
				title: 'Expresión vacía',
				detail: 'Escribe una regla en el campo de texto.',
				before: '',
				highlight: '',
				after: '',
			})
			return
		}
		try {
			const ast = parseRule(expression.trim())
			const json = generateDynamoRule(ast) as Record<string, unknown>
			setCurrentJson(json)
			saveHistoryEntry(expression.trim(), json)
			setConvertSuccess('Regla convertida correctamente')
		} catch (err) {
			if (err instanceof ParseError) {
				const pos = err.position ?? 0
				const tokenLen = (err.token as { length?: number } | null)?.length ?? 1
				setConvertError({
					title: err.message,
					detail: `Posición ${pos}`,
					before: expression.substring(0, pos),
					highlight: expression.substring(pos, pos + tokenLen) || ' ',
					after: expression.substring(pos + tokenLen),
				})
			} else {
				setConvertError({
					title: 'Error',
					detail: err instanceof Error ? err.message : String(err),
					before: '',
					highlight: '',
					after: '',
				})
			}
		}
	}, [expression])

	// ─── Autocomplete ─────────────────────────────────────────────────────────

	const handleExpressionChange = (value: string, cursorPos: number) => {
		setExpression(value)
		setConvertError(null)
		setConvertSuccess('')
		const textBefore = value.substring(0, cursorPos)
		const wordMatch = /([a-zA-Z_][a-zA-Z0-9_.]*)$/.exec(textBefore)
		if (!wordMatch || wordMatch[1].length < 2) {
			setAcItems([])
			return
		}
		const partial = wordMatch[1].toLowerCase()
		const matches = KNOWN_FIELDS.filter((f) => f.path.toLowerCase().includes(partial)).slice(0, 8)
		setAcItems(matches)
		setAcIndex(-1)
		setAcTarget({ start: cursorPos - wordMatch[1].length, end: cursorPos })
	}

	const selectAutocomplete = (path: string) => {
		if (!acTarget) return
		const before = expression.substring(0, acTarget.start)
		const after = expression.substring(acTarget.end)
		const newVal = before + path + after
		setExpression(newVal)
		setAcItems([])
		setAcTarget(null)
		setAcIndex(-1)
		const newPos = acTarget.start + path.length
		setTimeout(() => {
			textareaRef.current?.setSelectionRange(newPos, newPos)
			textareaRef.current?.focus()
		}, 0)
	}

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			e.preventDefault()
			convert()
			return
		}
		if (acItems.length === 0) return
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			setAcIndex((i) => Math.min(i + 1, acItems.length - 1))
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			setAcIndex((i) => Math.max(i - 1, 0))
		} else if ((e.key === 'Enter' || e.key === 'Tab') && acIndex >= 0) {
			e.preventDefault()
			selectAutocomplete(acItems[acIndex].path)
		} else if (e.key === 'Escape') {
			setAcItems([])
		}
	}

	// ─── Motor de Reglas ──────────────────────────────────────────────────────

	const generateMotor = () => {
		setMotorError('')
		setMotorSuccess('')
		if (!currentJson) {
			setMotorError('Primero convierte una expresión.')
			return
		}
		if (!motor.id.trim() || !motor.destino.trim()) {
			setMotorError('El ID y el Destino son obligatorios.')
			return
		}
		const result: Record<string, unknown> = {
			id: motor.id.trim(),
			destino: motor.destino.trim(),
		}
		if (motor.responsable.trim()) result.responsable_solicitud = motor.responsable.trim()
		if (motor.fechaCreacion.trim()) result.fecha_creacion = motor.fechaCreacion.trim()
		if (motor.descripcion.trim()) result.descripcion = motor.descripcion.trim()
		result.json_rule = currentJson
		setMotorJson(result)
		setMotorSuccess('JSON Motor de Reglas generado')
	}

	// ─── Copy / Download ──────────────────────────────────────────────────────

	const copyToClipboard = (text: string) => {
		void navigator.clipboard.writeText(text).catch(() => {
			const ta = document.createElement('textarea')
			ta.value = text
			document.body.appendChild(ta)
			ta.select()
			document.execCommand('copy')
			document.body.removeChild(ta)
		})
	}

	const downloadJson = (json: Record<string, unknown>, filename: string) => {
		const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = filename
		a.click()
		URL.revokeObjectURL(url)
	}

	// ─── Import ───────────────────────────────────────────────────────────────

	const importConvert = () => {
		setImportError('')
		setImportSuccess('')
		setImportValidation([])
		const raw = importInput.replace(/^\uFEFF/, '').trim()
		if (!raw) {
			setImportError('El campo está vacío.')
			return
		}
		try {
			const json = JSON.parse(raw) as Record<string, unknown>
			const text = dynamoJsonToText(json as Parameters<typeof dynamoJsonToText>[0])
			setImportOutput(text)
			setImportSuccess('JSON convertido a texto correctamente')
		} catch (err) {
			setImportError(err instanceof Error ? err.message : 'Error al procesar el JSON')
		}
	}

	const importValidate = () => {
		setImportValidation([])
		const raw = importInput.trim()
		if (!raw) return
		try {
			const json = JSON.parse(raw) as Record<string, unknown>
			const result = validateDynamoSchema(json as Parameters<typeof validateDynamoSchema>[0])
			if (result.valid) {
				setImportValidation([{ path: '', message: 'Esquema válido ✓', valid: true }])
			} else {
				setImportValidation(
					result.errors.map((e) => ({ path: e.path, message: e.message, valid: false }))
				)
			}
		} catch {
			setImportValidation([{ path: '', message: 'JSON inválido: error de sintaxis', valid: false }])
		}
	}

	const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return
		const reader = new FileReader()
		reader.onload = (ev) => setImportInput((ev.target?.result as string) ?? '')
		reader.readAsText(file)
		e.target.value = ''
	}

	// ─── History ──────────────────────────────────────────────────────────────

	const useHistoryEntry = (entry: HistoryEntry) => {
		setExpression(entry.ruleText)
		setCurrentJson(entry.json)
		setConvertSuccess('Cargado del historial')
		setConvertError(null)
		setActiveTab('converter')
	}

	const deleteHistoryEntry = (id: number) => {
		const updated = history.filter((h) => h.id !== id)
		localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
		setHistory(updated)
	}

	const clearHistory = () => {
		localStorage.removeItem(HISTORY_KEY)
		setHistory([])
	}

	// ─── Save to DynamoDB ─────────────────────────────────────────────────────

	const handleSaveToTable = async () => {
		setSaveResult('')
		setSaveError('')
		if (!motorJson) {
			setSaveError('Primero genera el JSON Motor de Reglas.')
			return
		}
		if (isReadonly) {
			setSaveError('Este entorno es de solo lectura.')
			return
		}
		if (!window.confirm(`Vas a guardar en ${saveEnvironment.toUpperCase()}. ¿Continuar?`)) return
		try {
			const currentSettings = consoleApi.readSettings()
			await consoleApi.saveItem(saveEnvironment, currentSettings.defaultTableName, {
				id: motor.id || `rule-${Date.now()}`,
				...motorJson,
			})
			setSaveResult(`Guardado en ${currentSettings.defaultTableName} (${saveEnvironment}).`)
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : 'No se pudo guardar.')
		}
	}

	return (
		<ConverterComponent
			activeTab={activeTab}
			onTabChange={setActiveTab}
			expression={expression}
			currentJson={currentJson}
			convertError={convertError}
			convertSuccess={convertSuccess}
			textareaRef={textareaRef}
			acItems={acItems}
			acIndex={acIndex}
			onExpressionChange={handleExpressionChange}
			onKeyDown={handleKeyDown}
			onSelectAutocomplete={selectAutocomplete}
			onHideAutocomplete={() => setAcItems([])}
			onConvert={convert}
			onCopyJson={() => currentJson && copyToClipboard(JSON.stringify(currentJson, null, 2))}
			onDownloadJson={() =>
				currentJson && downloadJson(currentJson, `${motor.id || 'regla_dynamo'}.json`)
			}
			motor={motor}
			motorJson={motorJson}
			motorError={motorError}
			motorSuccess={motorSuccess}
			onMotorChange={setMotor}
			onGenerateMotor={generateMotor}
			onCopyMotor={() => motorJson && copyToClipboard(JSON.stringify(motorJson, null, 2))}
			onDownloadMotor={() => motorJson && downloadJson(motorJson, `${motor.id || 'motor'}.json`)}
			saveEnvironment={saveEnvironment}
			saveResult={saveResult}
			saveError={saveError}
			isReadonly={isReadonly}
			onSaveEnvironmentChange={setSaveEnvironment}
			onSaveToTable={() => {
				void handleSaveToTable()
			}}
			importInput={importInput}
			importOutput={importOutput}
			importError={importError}
			importSuccess={importSuccess}
			importValidation={importValidation}
			fileInputRef={fileInputRef}
			onImportInputChange={setImportInput}
			onImportConvert={importConvert}
			onImportValidate={importValidate}
			onImportFile={() => fileInputRef.current?.click()}
			onFileLoad={handleFileLoad}
			onCopyImportOutput={() => copyToClipboard(importOutput)}
			history={history}
			onUseHistoryEntry={useHistoryEntry}
			onDeleteHistoryEntry={deleteHistoryEntry}
			onClearHistory={clearHistory}
		/>
	)
}
