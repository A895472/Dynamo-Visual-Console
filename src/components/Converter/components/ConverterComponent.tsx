import '@/components/Console/components/console-shell.scss'
import './converter.scss'

import type { RefObject } from 'react'

import type { TargetEnvironment } from '@/models/console'

// ─── Shared types (imported by container) ────────────────────────────────────

export type Tab = 'converter' | 'import' | 'history'

export interface ParseErrorInfo {
	title: string
	detail?: string
	highlight?: string
	before?: string
	after?: string
}

export interface KnownField {
	path: string
	type: string
}

export interface HistoryEntry {
	id: number
	ruleText: string
	json: Record<string, unknown>
	date: string
}

export interface MotorFields {
	id: string
	destino: string
	responsable: string
	fechaCreacion: string
	descripcion: string
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
	activeTab: Tab
	onTabChange: (tab: Tab) => void
	// Converter tab
	expression: string
	currentJson: Record<string, unknown> | null
	convertError: ParseErrorInfo | null
	convertSuccess: string
	textareaRef: RefObject<HTMLTextAreaElement | null>
	acItems: KnownField[]
	acIndex: number
	onExpressionChange: (value: string, cursorPos: number) => void
	onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
	onSelectAutocomplete: (path: string) => void
	onHideAutocomplete: () => void
	onConvert: () => void
	onCopyJson: () => void
	onDownloadJson: () => void
	// Motor de Reglas
	motor: MotorFields
	motorJson: Record<string, unknown> | null
	motorError: string
	motorSuccess: string
	onMotorChange: (motor: MotorFields) => void
	onGenerateMotor: () => void
	onCopyMotor: () => void
	onDownloadMotor: () => void
	// Save to table
	saveEnvironment: TargetEnvironment
	saveResult: string
	saveError: string
	isReadonly: boolean
	onSaveEnvironmentChange: (env: TargetEnvironment) => void
	onSaveToTable: () => void
	// Import tab
	importInput: string
	importOutput: string
	importError: string
	importSuccess: string
	importValidation: Array<{ path: string; message: string; valid?: boolean }>
	fileInputRef: RefObject<HTMLInputElement | null>
	onImportInputChange: (value: string) => void
	onImportConvert: () => void
	onImportValidate: () => void
	onImportFile: () => void
	onFileLoad: (e: React.ChangeEvent<HTMLInputElement>) => void
	onCopyImportOutput: () => void
	// History tab
	history: HistoryEntry[]
	onUseHistoryEntry: (entry: HistoryEntry) => void
	onDeleteHistoryEntry: (id: number) => void
	onClearHistory: () => void
}

// ─── JSON syntax highlighting ─────────────────────────────────────────────────

const JSON_TOKEN =
	/("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g

function JsonHighlight({ json }: { json: Record<string, unknown> }) {
	const text = JSON.stringify(json, null, 2)
	const parts: Array<[string, string?]> = []
	let last = 0
	JSON_TOKEN.lastIndex = 0
	let m: RegExpExecArray | null
	while ((m = JSON_TOKEN.exec(text)) !== null) {
		if (m.index > last) parts.push([text.slice(last, m.index)])
		const v = m[0]
		let cls: string | undefined
		if (v.startsWith('"')) {
			cls = v.endsWith(':') ? 'json-key' : 'json-string'
		} else if (v === 'true' || v === 'false') {
			cls = 'json-bool'
		} else if (v === 'null') {
			cls = 'json-null'
		} else {
			cls = 'json-number'
		}
		parts.push([v, cls])
		last = JSON_TOKEN.lastIndex
	}
	if (last < text.length) parts.push([text.slice(last)])
	return (
		<>
			{parts.map(([t, cls], i) =>
				cls ? (
					<span key={i} className={cls}>
						{t}
					</span>
				) : (
					t
				)
			)}
		</>
	)
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConverterComponent(props: Props) {
	const { activeTab, onTabChange } = props

	return (
		<div className='console-shell'>
			<nav className='converter-tabs'>
				<button
					type='button'
					className={`converter-tab${activeTab === 'converter' ? ' converter-tab--active' : ''}`}
					onClick={() => onTabChange('converter')}>
					Convertidor
				</button>
				<button
					type='button'
					className={`converter-tab${activeTab === 'import' ? ' converter-tab--active' : ''}`}
					onClick={() => onTabChange('import')}>
					Importar JSON
				</button>
				<button
					type='button'
					className={`converter-tab${activeTab === 'history' ? ' converter-tab--active' : ''}`}
					onClick={() => onTabChange('history')}>
					Historial
				</button>
			</nav>

			{activeTab === 'converter' && <ConverterTab {...props} />}
			{activeTab === 'import' && <ImportTab {...props} />}
			{activeTab === 'history' && <HistoryTab {...props} />}
		</div>
	)
}

// ─── Tab 1: Convertidor ───────────────────────────────────────────────────────

function ConverterTab(props: Props) {
	const {
		expression,
		currentJson,
		convertError,
		convertSuccess,
		textareaRef,
		acItems,
		acIndex,
		onExpressionChange,
		onKeyDown,
		onSelectAutocomplete,
		onHideAutocomplete,
		onConvert,
		onCopyJson,
		onDownloadJson,
		motor,
		motorJson,
		motorError,
		motorSuccess,
		onMotorChange,
		onGenerateMotor,
		onCopyMotor,
		onDownloadMotor,
		saveEnvironment,
		saveResult,
		saveError,
		isReadonly,
		onSaveEnvironmentChange,
		onSaveToTable,
	} = props

	return (
		<>
			<section className='console-panel'>
				<div className='console-panel__header'>
					<div>
						<h1 className='console-panel__title'>Convertidor de Reglas</h1>
						<p className='console-panel__subtitle'>
							Escribe la expresión y conviértela a JSON Dynamo. <kbd>Ctrl+Enter</kbd> para convertir
							rápidamente.
						</p>
					</div>
				</div>
				<div className='console-form'>
					<div className='converter-textarea-wrap'>
						<textarea
							ref={textareaRef}
							className='console-textarea'
							value={expression}
							placeholder="payload.mensaje.envio.datosservicio.codservicio = '48' AND payload.mensaje.envio.urgente = true"
							rows={5}
							onChange={(e) => onExpressionChange(e.target.value, e.target.selectionStart ?? 0)}
							onKeyDown={onKeyDown}
							onBlur={() => setTimeout(onHideAutocomplete, 150)}
						/>
						{acItems.length > 0 && (
							<ul className='converter-ac'>
								{acItems.map((item, i) => (
									<li
										key={item.path}
										className={`converter-ac__item${i === acIndex ? ' converter-ac__item--active' : ''}`}
										onMouseDown={(e) => {
											e.preventDefault()
											onSelectAutocomplete(item.path)
										}}>
										<span>{item.path}</span>
										<span className='converter-ac__type'>{item.type}</span>
									</li>
								))}
							</ul>
						)}
					</div>
					<div className='console-actions'>
						<button
							type='button'
							className='console-button console-button--primary'
							onClick={onConvert}>
							▶ Convertir a JSON
						</button>
					</div>
				</div>
			</section>

			{convertError && (
				<div className='console-feedback console-feedback--error'>
					<strong>{convertError.title}</strong>
					{convertError.detail ? <> — {convertError.detail}</> : null}
					{convertError.highlight ? (
						<div className='converter-pos'>
							{convertError.before}
							<span className='converter-pos__highlight'>{convertError.highlight}</span>
							{convertError.after}
						</div>
					) : null}
				</div>
			)}

			{convertSuccess && !convertError ? (
				<div className='console-feedback console-feedback--success'>{convertSuccess}</div>
			) : null}

			{currentJson ? (
				<section className='console-panel'>
					<div className='console-panel__header'>
						<h2 className='console-panel__title'>JSON Dynamo</h2>
						<div className='console-actions'>
							<button
								type='button'
								className='console-button console-button--secondary'
								onClick={onCopyJson}>
								Copiar
							</button>
							<button
								type='button'
								className='console-button console-button--secondary'
								onClick={onDownloadJson}>
								Descargar
							</button>
						</div>
					</div>
					<pre className='converter-code'>
						<JsonHighlight json={currentJson} />
					</pre>
				</section>
			) : null}

			<section className='console-panel'>
				<div className='console-panel__header'>
					<div>
						<h2 className='console-panel__title'>Motor de Reglas</h2>
						<p className='console-panel__subtitle'>
							Genera el JSON completo para guardar en DynamoDB.
						</p>
					</div>
				</div>
				<div className='console-form'>
					<div className='converter-motor-grid'>
						<label className='console-label'>
							<span>ID Regla</span>
							<input
								className='console-input'
								value={motor.id}
								placeholder='Ej: Trazabilidad2'
								onChange={(e) => onMotorChange({ ...motor, id: e.target.value })}
							/>
						</label>
						<label className='console-label'>
							<span>Destino</span>
							<input
								className='console-input'
								value={motor.destino}
								placeholder='Ej: awir-d-minerva-kin-dst-trazabilidad'
								onChange={(e) => onMotorChange({ ...motor, destino: e.target.value })}
							/>
						</label>
						<label className='console-label'>
							<span>Responsable solicitud</span>
							<input
								className='console-input'
								value={motor.responsable}
								placeholder='Ej: NOMBRE APELLIDO'
								onChange={(e) => onMotorChange({ ...motor, responsable: e.target.value })}
							/>
						</label>
						<label className='console-label'>
							<span>Fecha creación</span>
							<input
								className='console-input'
								value={motor.fechaCreacion}
								placeholder='Ej: 01-01-2025'
								onChange={(e) => onMotorChange({ ...motor, fechaCreacion: e.target.value })}
							/>
						</label>
						<label className='console-label converter-motor-full'>
							<span>Descripción</span>
							<input
								className='console-input'
								value={motor.descripcion}
								placeholder='Descripción de la regla'
								onChange={(e) => onMotorChange({ ...motor, descripcion: e.target.value })}
							/>
						</label>
					</div>
					<div className='console-actions'>
						<button
							type='button'
							className='console-button console-button--primary'
							onClick={onGenerateMotor}>
							▶ Generar JSON Motor de Reglas
						</button>
					</div>
					{motorError ? (
						<div className='console-feedback console-feedback--error'>{motorError}</div>
					) : null}
					{motorSuccess && !motorError ? (
						<div className='console-feedback console-feedback--success'>{motorSuccess}</div>
					) : null}
				</div>

				{motorJson ? (
					<>
						<div className='console-panel__header' style={{ marginTop: '1.25rem' }}>
							<h3 className='console-panel__title' style={{ fontSize: '0.95rem' }}>
								Motor JSON
							</h3>
							<div className='console-actions'>
								<button
									type='button'
									className='console-button console-button--secondary'
									onClick={onCopyMotor}>
									Copiar
								</button>
								<button
									type='button'
									className='console-button console-button--secondary'
									onClick={onDownloadMotor}>
									Descargar
								</button>
							</div>
						</div>
						<pre className='converter-code'>
							<JsonHighlight json={motorJson} />
						</pre>

						<div className='console-form' style={{ marginTop: '1rem' }}>
							<div className='console-form__grid'>
								<label className='console-label'>
									<span>Guardar en entorno</span>
									<select
										className='console-select'
										value={saveEnvironment}
										onChange={(e) => onSaveEnvironmentChange(e.target.value as TargetEnvironment)}>
										<option value='desa'>Desarrollo</option>
										<option value='pre'>Preproducción</option>
										<option value='pro'>Producción</option>
									</select>
								</label>
								<div className='console-label' style={{ justifyContent: 'flex-end' }}>
									<span
										title={
											isReadonly
												? 'Entorno en modo lectura. Puedes cambiarlo en Ajustes'
												: undefined
										}>
										<button
											type='button'
											className='console-button console-button--primary'
											disabled={isReadonly}
											onClick={onSaveToTable}>
											{isReadonly ? '🔒 Solo lectura' : '💾 Guardar en DynamoDB'}
										</button>
									</span>
								</div>
							</div>
							{saveResult ? (
								<div className='console-feedback console-feedback--success'>{saveResult}</div>
							) : null}
							{saveError ? (
								<div className='console-feedback console-feedback--error'>{saveError}</div>
							) : null}
						</div>
					</>
				) : null}
			</section>
		</>
	)
}

// ─── Tab 2: Importar JSON ─────────────────────────────────────────────────────

function ImportTab(props: Props) {
	const {
		importInput,
		importOutput,
		importError,
		importSuccess,
		importValidation,
		fileInputRef,
		onImportInputChange,
		onImportConvert,
		onImportValidate,
		onImportFile,
		onFileLoad,
		onCopyImportOutput,
	} = props

	return (
		<>
			<section className='console-panel'>
				<div className='console-panel__header'>
					<div>
						<h1 className='console-panel__title'>Importar JSON Dynamo</h1>
						<p className='console-panel__subtitle'>
							Pega un JSON de regla Dynamo para convertirlo a expresión de texto o validarlo.
						</p>
					</div>
				</div>
				<div className='console-form'>
					<textarea
						className='console-textarea'
						value={importInput}
						placeholder='{"name": "...", "value": {...}}'
						rows={8}
						onChange={(e) => onImportInputChange(e.target.value)}
					/>
					<div className='console-actions'>
						<button
							type='button'
							className='console-button console-button--primary'
							onClick={onImportConvert}>
							▶ Convertir a Texto
						</button>
						<button
							type='button'
							className='console-button console-button--secondary'
							onClick={onImportValidate}>
							✓ Validar
						</button>
						<button
							type='button'
							className='console-button console-button--secondary'
							onClick={onImportFile}>
							📂 Cargar archivo
						</button>
					</div>
					<input ref={fileInputRef} type='file' accept='.json' hidden onChange={onFileLoad} />
					{importError ? (
						<div className='console-feedback console-feedback--error'>{importError}</div>
					) : null}
					{importSuccess && !importError ? (
						<div className='console-feedback console-feedback--success'>{importSuccess}</div>
					) : null}
					{importValidation.length > 0 ? (
						<div
							className={`console-feedback ${
								importValidation.every((v) => v.valid)
									? 'console-feedback--success'
									: 'console-feedback--error'
							}`}>
							<ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
								{importValidation.map((v, i) => (
									<li key={i}>
										{v.path ? (
											<>
												<strong>{v.path}</strong>: {v.message}
											</>
										) : (
											v.message
										)}
									</li>
								))}
							</ul>
						</div>
					) : null}
				</div>
			</section>

			{importOutput ? (
				<section className='console-panel'>
					<div className='console-panel__header'>
						<h2 className='console-panel__title'>Expresión resultante</h2>
						<button
							type='button'
							className='console-button console-button--secondary'
							onClick={onCopyImportOutput}>
							Copiar
						</button>
					</div>
					<pre
						className='console-code console-code--decoded'
						style={{ minHeight: 'auto', fontSize: '0.95rem' }}>
						{importOutput}
					</pre>
				</section>
			) : null}
		</>
	)
}

// ─── Tab 3: Historial ─────────────────────────────────────────────────────────

function HistoryTab(props: Props) {
	const { history, onUseHistoryEntry, onDeleteHistoryEntry, onClearHistory } = props

	if (history.length === 0) {
		return (
			<div className='console-empty'>
				No hay entradas en el historial. Convierte una expresión para que aparezca aquí.
			</div>
		)
	}

	return (
		<>
			<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
				<button
					type='button'
					className='console-button console-button--danger'
					onClick={onClearHistory}>
					🗑 Limpiar todo
				</button>
			</div>
			<div className='console-environments'>
				{history.map((entry) => (
					<div key={entry.id} className='converter-history-entry'>
						<div className='converter-history-meta'>{new Date(entry.date).toLocaleString()}</div>
						<div className='converter-history-rule'>{entry.ruleText}</div>
						<div className='converter-history-actions'>
							<button
								type='button'
								className='console-button console-button--primary'
								onClick={() => onUseHistoryEntry(entry)}>
								Usar
							</button>
							<button
								type='button'
								className='console-button console-button--secondary'
								onClick={() => onDeleteHistoryEntry(entry.id)}>
								Eliminar
							</button>
						</div>
					</div>
				))}
			</div>
		</>
	)
}
