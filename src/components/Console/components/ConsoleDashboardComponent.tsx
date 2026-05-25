import './console-shell.scss'

import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import type { ConsoleTableSummary } from '@/models/console'

interface Props {
	environment: string
	availableEnvironments: { id: string; label: string; targetEnv?: string }[]
	tables: ConsoleTableSummary[]
	onChangeEnvironment: (environment: string) => void
	onOpenTable: (tableName: string) => void
}

export default function ConsoleDashboardComponent(props: Props) {
	const { environment, availableEnvironments, tables, onChangeEnvironment, onOpenTable } = props
	const { t } = useTranslation('console')

	// En remoto usamos solo los entornos configurados; en local, el array completo
	const displayEnvironments = availableEnvironments.length > 0 ? availableEnvironments : []

	const totalItems = tables.reduce((count, table) => count + table.itemCount, 0)

	return (
		<div className='console-shell'>
			<section className='console-hero'>
				<p className='console-hero__eyebrow'>{t('hero.eyebrow')}</p>
				<h1 className='console-hero__title'>{t('hero.title')}</h1>
				<p className='console-hero__copy'>{t('hero.copy')}</p>
				<div className='console-actions'>
					<Link className='console-button console-button--primary' to='/tables'>
						{t('hero.primaryAction')}
					</Link>
					<Link className='console-button console-button--secondary' to='/converter'>
						{t('hero.secondaryAction')}
					</Link>
				</div>
			</section>

			<section className='console-grid'>
				<article className='console-panel console-panel--span-8'>
					<div className='console-panel__header'>
						<div>
							<h2 className='console-panel__title'>{t('environment.title')}</h2>
							<p className='console-panel__subtitle'>{t('environment.subtitle')}</p>
						</div>
					</div>
					<div className='console-environments'>
						{displayEnvironments.length === 0 ? (
							<div className='console-empty'>
								No hay entornos configurados. Ve a <strong>Ajustes</strong> y asigna un nombre a
								cada entorno que quieras usar.
							</div>
						) : (
						displayEnvironments.map(({ id: entry, label, targetEnv }) => {
							const active = entry === environment
							// En modo remoto el ID es un UUID; usamos targetEnv para el nivel de riesgo
							const riskEnv = targetEnv ?? entry
							const riskKey = riskEnv === 'pro' ? 'pro' : riskEnv === 'pre' ? 'pre' : 'desa'
								return (
									<button
										key={entry}
										type='button'
										className={`console-environment ${active ? 'console-environment--active' : ''}`}
										onClick={() => onChangeEnvironment(entry)}>
										<div className='console-row'>
											<strong>{label}</strong>
											<span
												className={`console-pill console-pill--${riskKey === 'pro' ? 'high' : riskKey === 'pre' ? 'medium' : 'low'}`}>
												{t(`environment.security.${riskKey}`)}
											</span>
										</div>
										<p className='console-panel__subtitle'>
											{t(`environment.descriptions.${riskKey}`)}
										</p>
									</button>
								)
							})
						)}
					</div>
				</article>

				<article className='console-panel console-panel--span-4'>
					<div className='console-panel__header'>
						<div>
							<h2 className='console-panel__title'>{t('summary.title')}</h2>
							<p className='console-panel__subtitle'>{t('summary.subtitle')}</p>
						</div>
					</div>
					<div className='console-kpis'>
						<div className='console-kpi'>
							<div className='console-kpi__label'>{t('summary.tables')}</div>
							<div className='console-kpi__value'>{tables.length}</div>
						</div>
						<div className='console-kpi'>
							<div className='console-kpi__label'>{t('summary.items')}</div>
							<div className='console-kpi__value'>{totalItems}</div>
						</div>

					</div>
				</article>

				<article className='console-panel'>
					<div className='console-panel__header'>
						<div>
							<h2 className='console-panel__title'>{t('tables.title')}</h2>
							<p className='console-panel__subtitle'>{t('tables.subtitle')}</p>
						</div>
						<Link className='console-button console-button--secondary' to='/tables'>
							{t('tables.manage')}
						</Link>
					</div>
					<div className='console-table-list'>
						{tables.map((table) => (
							<button
								key={table.name}
								type='button'
								className='console-table console-table--clickable'
								onClick={() => onOpenTable(table.name)}>
								<div className='console-row'>
									<strong>{table.name}</strong>
									<span className={`console-pill console-pill--${table.riskLevel}`}>
										{table.riskLevel.toUpperCase()}
									</span>
								</div>
								<p className='console-panel__subtitle'>{table.description}</p>
								<div className='console-metadata'>
									<span>{t('tables.partitionKey', { key: table.partitionKey })}</span>
									<span>{t('tables.itemsCount', { count: table.itemCount })}</span>
									<span>
										{t('tables.updatedAt', { value: new Date(table.lastUpdated).toLocaleString() })}
									</span>
								</div>
							</button>
						))}
					</div>
				</article>
			</section>
		</div>
	)
}
