import '@/components/Console/components/console-shell.scss'
import './settings.scss'

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
	AwsCredentials,
	ConsoleSettings,
	ConsoleTableSummary,
	CustomEnvironment,
	TargetEnvironment,
} from '@/models/console'
import { TARGET_ENVIRONMENTS } from '@/models/console'
import { clearCredentials, readCredentials, writeCredentials } from '@/services/console/api'

const IS_REMOTE_MODE = (import.meta.env.VITE_APP_MODE ?? 'local') === 'remote'

interface Props {
	settings: ConsoleSettings
	feedback: string
	availableTables: ConsoleTableSummary[]
	onChange: (settings: ConsoleSettings) => void
	onSave: () => void
	onSaveEnvCredentials: (id: string, creds: AwsCredentials) => void
	onClearEnvCredentials: (id: string) => void
	readEnvCredentials: (id: string) => AwsCredentials | null
	onAddEnv: () => void
	onAddEnvsFromImport: (envs: Array<{ name: string; creds: AwsCredentials }>) => void
	onUpdateEnv: (id: string, patch: Partial<CustomEnvironment>) => void
	onDeleteEnv: (id: string) => void
}

// ── Parser de ~/.aws/credentials (formato INI) ───────────────────────────────
type AwsProfile = { accessKeyId: string; secretAccessKey: string; sessionToken?: string }

function parseAwsCredentialsFile(text: string): Record<string, AwsProfile> {
	const profiles: Record<string, AwsProfile> = {}
	let current = ''
	for (const raw of text.split('\n')) {
		const line = raw.trim()
		if (!line || line.startsWith('#') || line.startsWith(';')) continue
		const sectionMatch = /^\[(.+?)\]$/.exec(line)
		if (sectionMatch) {
			current = sectionMatch[1].replace(/^profile\s+/, '')
			profiles[current] = { accessKeyId: '', secretAccessKey: '' }
			continue
		}
		if (!current) continue
		const eqIdx = line.indexOf('=')
		if (eqIdx === -1) continue
		const key = line.slice(0, eqIdx).trim().toLowerCase()
		const val = line.slice(eqIdx + 1).trim()
		if (key === 'aws_access_key_id') profiles[current].accessKeyId = val
		else if (key === 'aws_secret_access_key') profiles[current].secretAccessKey = val
		else if (key === 'aws_session_token') profiles[current].sessionToken = val
	}
	return profiles
}

// ── Pill / badge reutilizable ────────────────────────────────────────────────
type PillVariant = 'accent' | 'success' | 'warning' | 'danger'

function Pill({ label, variant }: { label: string; variant: PillVariant }) {
	return (
		<span className='settings-pill' data-variant={variant}>
			{label}
		</span>
	)
}

// ── Combobox de tabla (filtra por cualquier parte del texto) ─────────────────
function TableCombobox({
	value,
	tables,
	onChange,
}: {
	value: string
	tables: ConsoleTableSummary[]
	onChange: (v: string) => void
}) {
	const [open, setOpen] = useState(false)
	const [query, setQuery] = useState(value)
	const wrapRef = useRef<HTMLDivElement>(null)

	// Sincronizar query cuando value cambia desde fuera
	useEffect(() => {
		setQuery(value)
	}, [value])

	// Cerrar al hacer click fuera
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				setOpen(false)
			}
		}
		document.addEventListener('mousedown', handler)
		return () => document.removeEventListener('mousedown', handler)
	}, [])

	const filtered = query.trim()
		? tables.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
		: tables

	return (
		<div ref={wrapRef} className='settings-combobox'>
			<input
				className='console-input'
				value={query}
				placeholder='—'
				onFocus={() => setOpen(true)}
				onChange={(e) => {
					setQuery(e.target.value)
					onChange(e.target.value)
					setOpen(true)
				}}
			/>
			{open && filtered.length > 0 && (
				<ul className='settings-combobox__list'>
					{filtered.map((t) => (
						<li
							key={t.name}
							className={`settings-combobox__option${t.name === value ? ' settings-combobox__option--active' : ''}`}
							onMouseDown={(e) => {
								e.preventDefault()
								onChange(t.name)
								setQuery(t.name)
								setOpen(false)
							}}>
							{t.name}
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SettingsComponent(props: Props) {
	const {
		settings,
		feedback,
		availableTables,
		onChange,
		onSave,
		onSaveEnvCredentials,
		onClearEnvCredentials,
		readEnvCredentials,
		onAddEnv,
		onAddEnvsFromImport,
		onUpdateEnv,
		onDeleteEnv,
	} = props
	const { t } = useTranslation('console')

	// ── Credenciales globales (modo local) ────────────────────────────────────
	const [creds, setCreds] = useState<AwsCredentials>(
		() => readCredentials() ?? { accessKeyId: '', secretAccessKey: '', sessionToken: '' }
	)
	const [credsFeedback, setCredsFeedback] = useState('')
	const hasActiveCreds = !!readCredentials()?.accessKeyId

	const handleSaveCreds = () => {
		if (!creds.accessKeyId.trim() || !creds.secretAccessKey.trim()) {
			setCredsFeedback(t('settings.feedbackCredsRequired'))
			return
		}
		writeCredentials({
			accessKeyId: creds.accessKeyId.trim(),
			secretAccessKey: creds.secretAccessKey.trim(),
			sessionToken: creds.sessionToken?.trim() || undefined,
		})
		setCredsFeedback(t('settings.feedbackCredsSaved'))
	}

	const handleClearCreds = () => {
		clearCredentials()
		setCreds({ accessKeyId: '', secretAccessKey: '', sessionToken: '' })
		setCredsFeedback(t('settings.feedbackCredsCleared'))
	}

	// ── Importar archivo de credenciales (modo local) ────────────────────────
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [importedProfiles, setImportedProfiles] = useState<Record<string, AwsProfile>>({})
	const [selectedProfile, setSelectedProfile] = useState('')
	const importHeaderRef = useRef<HTMLInputElement>(null)
	const [importFeedback, setImportFeedback] = useState('')

	const applyGlobalProfile = (profile: AwsProfile) => {
		setCreds({
			accessKeyId: profile.accessKeyId,
			secretAccessKey: profile.secretAccessKey,
			sessionToken: profile.sessionToken ?? '',
		})
		setCredsFeedback(t('settings.importApplied'))
	}

	// ── Credenciales por entorno (modo remoto) ────────────────────────────────
	const [envCreds, setEnvCreds] = useState<Record<string, AwsCredentials>>(() => {
		const init: Record<string, AwsCredentials> = {}
		for (const env of settings.customEnvironments) {
			init[env.id] = readEnvCredentials(env.id) ?? {
				accessKeyId: '',
				secretAccessKey: '',
				sessionToken: '',
			}
		}
		return init
	})
	const [envCredsFeedback, setEnvCredsFeedback] = useState<Record<string, string>>({})

	// Sincronizar envCreds cuando se añaden nuevos entornos (ej: importación)
	useEffect(() => {
		setEnvCreds((prev) => {
			const next = { ...prev }
			for (const env of settings.customEnvironments) {
				if (!(env.id in next)) {
					next[env.id] = readEnvCredentials(env.id) ?? {
						accessKeyId: '',
						secretAccessKey: '',
						sessionToken: '',
					}
				}
			}
			return next
		})
	}, [settings.customEnvironments])

	const getEnvCreds = (id: string): AwsCredentials =>
		envCreds[id] ?? { accessKeyId: '', secretAccessKey: '', sessionToken: '' }

	const setOneEnvCred = (id: string, patch: Partial<AwsCredentials>) => {
		setEnvCreds((prev) => ({ ...prev, [id]: { ...getEnvCreds(id), ...patch } }))
	}

	const handleSaveEnvCreds = (id: string): boolean => {
		const c = getEnvCreds(id)
		if (!c.accessKeyId.trim() || !c.secretAccessKey.trim()) {
			setEnvCredsFeedback((prev) => ({ ...prev, [id]: t('settings.feedbackCredsRequired') }))
			return false
		}
		onSaveEnvCredentials(id, {
			accessKeyId: c.accessKeyId.trim(),
			secretAccessKey: c.secretAccessKey.trim(),
			sessionToken: c.sessionToken?.trim() || undefined,
		})
		return true
	}

	const handleSaveAll = (id: string) => {
		const credsSaved = handleSaveEnvCreds(id)
		if (!credsSaved) return
		onSave()
		setEnvCredsFeedback((prev) => ({ ...prev, [id]: t('settings.feedbackSaved') }))
	}

	const handleClearEnvCreds = (id: string) => {
		onClearEnvCredentials(id)
		setEnvCreds((prev) => ({
			...prev,
			[id]: { accessKeyId: '', secretAccessKey: '', sessionToken: '' },
		}))
		setEnvCredsFeedback((prev) => ({ ...prev, [id]: t('settings.feedbackCredsCleared') }))
	}

	// ── Helpers modo local ────────────────────────────────────────────────────
	const toggleReadonly = (env: TargetEnvironment, checked: boolean) => {
		const next = checked
			? [...settings.readonlyEnvironments, env]
			: settings.readonlyEnvironments.filter((e) => e !== env)
		onChange({ ...settings, readonlyEnvironments: next })
	}

	const configuredEnvs = settings.customEnvironments
	const envName = (env: CustomEnvironment) => env.label.trim() || t('settings.envNameEmpty')

	// ── Render ────────────────────────────────────────────────────────────────
	return (
		<div className='console-shell'>
			{/* ── Panel: ajustes generales ── */}
			<section className='console-panel'>
				<div className='console-panel__header'>
					<div>
						<h1 className='console-panel__title'>{t('settings.title')}</h1>
						<p className='console-panel__subtitle'>{t('settings.subtitle')}</p>
					</div>
					{IS_REMOTE_MODE && <Pill label={t('settings.remoteMode')} variant='accent' />}
				</div>

				<div className='console-form'>
					<div className='console-form__grid'>
						<label className='console-label'>
							<span>{t('settings.environment')}</span>
							{IS_REMOTE_MODE && configuredEnvs.length === 0 ? (
								<p className='console-panel__subtitle settings-no-env'>
									{t('settings.noEnvSelected')}
								</p>
							) : (
								<select
									className='console-select'
									value={settings.environment}
									onChange={(e) => onChange({ ...settings, environment: e.target.value })}>
									{IS_REMOTE_MODE
										? configuredEnvs.map((env) => (
												<option key={env.id} value={env.id}>
													{env.label
														? `${env.label} (${env.targetEnv})`
														: `${t('settings.envNameEmpty')} (${env.targetEnv})`}
												</option>
											))
										: TARGET_ENVIRONMENTS.map((env) => (
												<option key={env} value={env}>
													{t(`environment.names.${env}`)}
												</option>
											))}
								</select>
							)}
						</label>

						<label className='console-label'>
							<span>{t('settings.defaultTable')}</span>
							<TableCombobox
								value={settings.defaultTableName}
								tables={availableTables}
								onChange={(v) => onChange({ ...settings, defaultTableName: v })}
							/>
						</label>
					</div>

					{/* Readonly — solo modo local */}
					{!IS_REMOTE_MODE && (
						<fieldset className='console-fieldset'>
							<legend className='console-label__text'>{t('settings.readonlyTitle')}</legend>
							<p className='console-panel__subtitle'>{t('settings.readonlySubtitle')}</p>
							<div className='console-form__grid'>
								{TARGET_ENVIRONMENTS.map((env) => (
									<label key={env} className='console-label console-label--checkbox'>
										<input
											type='checkbox'
											checked={settings.readonlyEnvironments.includes(env)}
											onChange={(e) => toggleReadonly(env, e.target.checked)}
										/>
										<span>{t(`environment.names.${env}`)}</span>
									</label>
								))}
							</div>
						</fieldset>
					)}

					<div className='console-actions'>
						<button
							type='button'
							className='console-button console-button--primary'
							onClick={onSave}>
							{t('settings.save')}
						</button>
					</div>
					{feedback && <div className='console-feedback console-feedback--success'>{feedback}</div>}
				</div>
			</section>

			{/* ── Panel: entornos personalizados (SOLO modo remoto) ── */}
			{IS_REMOTE_MODE && (
				<section className='console-panel'>
					<div className='console-panel__header'>
						<div>
							<h2 className='console-panel__title'>{t('settings.envConfigTitle')}</h2>
							<p className='console-panel__subtitle'>{t('settings.envConfigSubtitle')}</p>
						</div>
						<div className='settings-header-actions'>
							<input
								ref={importHeaderRef}
								type='file'
								className='settings-file-hidden'
								onChange={(e) => {
									const file = e.target.files?.[0]
									if (!file) return
									const reader = new FileReader()
									reader.onload = (ev) => {
										const text = ev.target?.result as string
										const profiles = parseAwsCredentialsFile(text)
										const envs = Object.entries(profiles).map(([name, p]) => ({
											name,
											creds: {
												accessKeyId: p.accessKeyId,
												secretAccessKey: p.secretAccessKey,
												sessionToken: p.sessionToken ?? '',
											},
										}))
										if (envs.length > 0) {
											onAddEnvsFromImport(envs)
											setImportFeedback(t('settings.importEnvsCreated', { count: envs.length }))
										} else {
											setImportFeedback(t('settings.importEnvsEmpty'))
										}
									}
									reader.readAsText(file)
									e.target.value = ''
								}}
							/>
							<button
								type='button'
								className='console-button console-button--secondary'
								onClick={() => importHeaderRef.current?.click()}>
								{t('settings.addEnvImport')}
							</button>
							<button
								type='button'
								className='console-button console-button--primary'
								onClick={onAddEnv}>
								{t('settings.addEnv')}
							</button>
						</div>
					</div>
					{importFeedback && (
						<div className='console-feedback console-feedback--success settings-import-feedback'>
							{importFeedback}
						</div>
					)}

					{configuredEnvs.length === 0 && (
						<div className='console-form'>
							<p className='console-panel__subtitle settings-no-env'>
								{t('settings.noEnvsConfigured')}
							</p>
						</div>
					)}

					{configuredEnvs.map((env) => {
						const hasActive = !!readEnvCredentials(env.id)?.accessKeyId
						const fb = envCredsFeedback[env.id] ?? ''
						const c = getEnvCreds(env.id)
						const hasName = !!env.label.trim()

						return (
							<div key={env.id} className='settings-env-card'>
								{/* Cabecera: nombre + badges */}
								<div className='settings-env-header'>
									<span
										className={`settings-env-name${hasName ? '' : ' settings-env-name--unnamed'}`}>
										{envName(env)}
									</span>
									<Pill label={env.targetEnv.toUpperCase()} variant='accent' />
									{env.readonly && (
										<Pill label={t('settings.envReadonlyBadge')} variant='warning' />
									)}
									{hasActive && <Pill label={t('settings.envActive')} variant='success' />}
								</div>

								{/* Config: nombre + base en grid 2 col; readonly en fila propia */}
								<div className='settings-env-config'>
									<label className='console-label'>
										<span>{t('settings.envName')}</span>
										<input
											className='console-input'
											placeholder={t('settings.envNamePlaceholder')}
											value={env.label}
											onChange={(e) => onUpdateEnv(env.id, { label: e.target.value })}
										/>
									</label>
									<label className='console-label'>
										<span>{t('settings.envBase')}</span>
										<select
											className='console-select'
											value={env.targetEnv}
											onChange={(e) =>
												onUpdateEnv(env.id, { targetEnv: e.target.value as TargetEnvironment })
											}>
											{TARGET_ENVIRONMENTS.map((te) => (
												<option key={te} value={te}>
													{te.toUpperCase()}
												</option>
											))}
										</select>
									</label>
									<label className='settings-env-readonly'>
										<input
											type='checkbox'
											checked={env.readonly}
											onChange={(e) => onUpdateEnv(env.id, { readonly: e.target.checked })}
										/>
										<span>{t('settings.envReadonly')}</span>
									</label>
								</div>

								{/* Credenciales AWS */}
								<div className='settings-creds-section'>
									<p className='settings-creds-title'>
										{t('settings.envCredsTitle')} — {envName(env)}
									</p>
									<div className='console-form__grid'>
										<label className='console-label'>
											<span>Access Key ID</span>
											<input
												className='console-input'
												placeholder='AKIAIOSFODNN7EXAMPLE'
												value={c.accessKeyId}
												onChange={(e) => setOneEnvCred(env.id, { accessKeyId: e.target.value })}
											/>
										</label>
										<label className='console-label'>
											<span>Secret Access Key</span>
											<input
												className='console-input'
												type='password'
												placeholder='wJalrXUtnFEMI/K7MDENG/...'
												value={c.secretAccessKey}
												onChange={(e) => setOneEnvCred(env.id, { secretAccessKey: e.target.value })}
											/>
										</label>
									</div>
									<label className='console-label settings-session-token'>
										<span>
											{t('settings.sessionToken')}{' '}
											<span className='settings-session-token__hint'>
												{t('settings.sessionTokenHint')}
											</span>
										</span>
										<textarea
											className='console-textarea settings-session-token__area'
											placeholder='FwoGZXIvYXdzE...'
											value={c.sessionToken ?? ''}
											onChange={(e) => setOneEnvCred(env.id, { sessionToken: e.target.value })}
										/>
									</label>
								</div>

								{/* Acciones: guardar + limpiar creds + eliminar */}
								<div className='settings-actions'>
									<button
										type='button'
										className='console-button console-button--primary'
										disabled={!hasName}
										title={!hasName ? t('settings.envNameRequired') : undefined}
										onClick={() => handleSaveAll(env.id)}>
										{t('settings.save')}
									</button>
									{!hasName && (
										<span className='settings-name-required'>{t('settings.envNameRequired')}</span>
									)}
									<button
										type='button'
										className='console-button console-button--secondary'
										onClick={() => handleClearEnvCreds(env.id)}>
										{t('settings.clearCreds')}
									</button>
									<button
										type='button'
										className='console-button console-button--danger'
										onClick={() => {
											if (window.confirm(t('settings.envDeleteConfirm', { name: envName(env) }))) {
												onDeleteEnv(env.id)
											}
										}}>
										{t('settings.envDelete')}
									</button>
								</div>
								{fb && (
									<div
										className={`console-feedback ${fb === t('settings.feedbackCredsRequired') ? 'console-feedback--error' : 'console-feedback--success'}`}>
										{fb}
									</div>
								)}
							</div>
						)
					})}
				</section>
			)}

			{/* ── Panel: credenciales globales (SOLO modo local) ── */}
			{!IS_REMOTE_MODE && (
				<section className='console-panel'>
					<div className='console-panel__header'>
						<div>
							<h2 className='console-panel__title'>{t('settings.globalCredsTitle')}</h2>
							<p className='console-panel__subtitle'>{t('settings.globalCredsSubtitle')}</p>
						</div>
						{hasActiveCreds && <Pill label={t('settings.envActive')} variant='success' />}
					</div>
					<div className='console-form'>
						{/* Importar archivo */}
						<div className='settings-import-row'>
							<input
								ref={fileInputRef}
								type='file'
								accept='.credentials,text/plain,'
								className='settings-file-hidden'
								onChange={(e) => {
									const file = e.target.files?.[0]
									if (!file) return
									const reader = new FileReader()
									reader.onload = (ev) => {
										const text = ev.target?.result as string
										const profiles = parseAwsCredentialsFile(text)
										setImportedProfiles(profiles)
										setSelectedProfile(Object.keys(profiles)[0] ?? '')
									}
									reader.readAsText(file)
									e.target.value = ''
								}}
							/>
							<button
								type='button'
								className='console-button console-button--secondary settings-import-btn'
								onClick={() => fileInputRef.current?.click()}>
								{t('settings.importFile')}
							</button>
							{Object.keys(importedProfiles).length > 0 && (
								<>
									<select
										className='console-select settings-import-select'
										value={selectedProfile}
										onChange={(e) => setSelectedProfile(e.target.value)}>
										{Object.keys(importedProfiles).map((p) => (
											<option key={p} value={p}>
												{p}
											</option>
										))}
									</select>
									<button
										type='button'
										className='console-button console-button--primary'
										disabled={!selectedProfile}
										onClick={() => {
											const profile = importedProfiles[selectedProfile]
											if (profile) applyGlobalProfile(profile)
										}}>
										{t('settings.importApply')}
									</button>
								</>
							)}
						</div>
						<div className='console-form__grid'>
							<label className='console-label'>
								<span>Access Key ID</span>
								<input
									className='console-input'
									placeholder='AKIAIOSFODNN7EXAMPLE'
									value={creds.accessKeyId}
									onChange={(e) => setCreds({ ...creds, accessKeyId: e.target.value })}
								/>
							</label>
							<label className='console-label'>
								<span>Secret Access Key</span>
								<input
									className='console-input'
									type='password'
									placeholder='wJalrXUtnFEMI/K7MDENG/...'
									value={creds.secretAccessKey}
									onChange={(e) => setCreds({ ...creds, secretAccessKey: e.target.value })}
								/>
							</label>
						</div>
						<label className='console-label settings-session-token'>
							<span>
								{t('settings.sessionToken')}{' '}
								<span className='settings-session-token__hint'>
									{t('settings.sessionTokenHintFull')}
								</span>
							</span>
							<textarea
								className='console-textarea settings-session-token__area settings-session-token__area--tall'
								placeholder='FwoGZXIvYXdzE...'
								value={creds.sessionToken ?? ''}
								onChange={(e) => setCreds({ ...creds, sessionToken: e.target.value })}
							/>
						</label>
						<div className='console-actions'>
							<button
								type='button'
								className='console-button console-button--primary'
								onClick={handleSaveCreds}>
								{t('settings.saveCreds')}
							</button>
							<button
								type='button'
								className='console-button console-button--secondary'
								onClick={handleClearCreds}>
								{t('settings.clearCreds')}
							</button>
						</div>
						{credsFeedback && (
							<div
								className={`console-feedback ${credsFeedback === t('settings.feedbackCredsRequired') ? 'console-feedback--error' : 'console-feedback--success'}`}>
								{credsFeedback}
							</div>
						)}
					</div>
				</section>
			)}
		</div>
	)
}
