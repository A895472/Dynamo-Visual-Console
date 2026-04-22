import './TablesComponent.scss'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ConsoleItem, ConsoleTableSummary, TargetEnvironment } from '@/models/console'

interface StructuredField {
	key: string
	value: string
	isJson: boolean
	isLong: boolean
}

interface Props {
	environment: string
	availableEnvironments: { id: string; label: string }[]
	tables: ConsoleTableSummary[]
	selectedTableName: string
	items: ConsoleItem[]
	selectedItemId: string
	editorValue: string
	structuredFields: StructuredField[]
	decodedValue: string
	decodedItemId: string
	decodedDirty: boolean
	encodeModalOpen: boolean
	encodeExpression: string
	errorMessage: string
	successMessage: string
	isLoadingTables: boolean
	isLoadingItems: boolean
	isLoadingDecode: boolean
	isReadonly: boolean
	onEnvironmentChange: (environment: string) => void
	onTableChange: (tableName: string) => void
	onEditorChange: (value: string) => void
	onStructuredFieldChange: (field: string, value: string) => void
	onDecodedExpressionChange: (value: string) => void
	onApplyDecodedExpression: () => void
	onSelectItem: (item: ConsoleItem) => void
	onDecodeItem: (item: ConsoleItem) => void
	onDecodeEditor: () => void
	onOpenEncodeModal: () => void
	onCloseEncodeModal: () => void
	onEncodeExpressionChange: (value: string) => void
	onApplyEncoding: () => void
	onSaveItem: () => void
	onDeleteItem: (itemId: string) => void
	onNewItem: () => void
}

export default function TablesComponent(props: Props) {
	const {
		environment,
		availableEnvironments,
		tables,
		selectedTableName,
		items,
		selectedItemId,
		editorValue,
		structuredFields,
		decodedValue,
		decodedItemId,
		decodedDirty,
		encodeModalOpen,
		encodeExpression,
		errorMessage,
		successMessage,
		isLoadingTables,
		isLoadingItems,
		isLoadingDecode,
		isReadonly,
		onEnvironmentChange,
		onTableChange,
		onEditorChange,
		onStructuredFieldChange,
		onDecodedExpressionChange,
		onApplyDecodedExpression,
		onSelectItem,
		onDecodeItem,
		onDecodeEditor,
		onOpenEncodeModal,
		onCloseEncodeModal,
		onEncodeExpressionChange,
		onApplyEncoding,
		onSaveItem,
		onDeleteItem,
		onNewItem,
	} = props
	const { t } = useTranslation('console')

	const [filterText, setFilterText] = useState('')

	useEffect(() => {
		setFilterText('')
	}, [selectedTableName, environment])

	const visibleItems = filterText.trim()
		? items.filter((item) => JSON.stringify(item).toLowerCase().includes(filterText.toLowerCase()))
		: items

	return (
		<div className='tables-page'>
			<section className='tables-panel tables-explorer'>
				<div className='tables-panel__header'>
					<div>
						<h1 className='tables-panel__title'>{t('tablesPage.title')}</h1>
						<p className='tables-panel__subtitle'>{t('tablesPage.subtitle')}</p>
					</div>
				</div>
				<div className='tables-explorer__controls'>
					{isReadonly && (
						<div className='tables-readonly-banner' style={{ gridColumn: '1 / -1' }}>
							<span className='tables-readonly-banner__icon'>🔒</span>
							<span>
								{t('tablesPage.readonlyBanner', {
									env:
										availableEnvironments.find((e) => e.id === environment)?.label ?? environment,
								})}
							</span>
						</div>
					)}
					<label className='tables-label'>
						<span>{t('tablesPage.environment')}</span>
						<select
							className='tables-select'
							value={environment}
							disabled={isLoadingTables}
							onChange={(event) => onEnvironmentChange(event.target.value as TargetEnvironment)}>
							{availableEnvironments.map(({ id, label }) => (
								<option key={id} value={id}>
									{label}
								</option>
							))}
						</select>
					</label>
					<label className='tables-label'>
						<span>{t('tablesPage.table')}</span>
						<div className='tables-select-wrapper'>
							<select
								className='tables-select'
								value={selectedTableName}
								disabled={tables.length === 0 || isLoadingTables || isLoadingItems}
								onChange={(event) => onTableChange(event.target.value)}>
								{tables.length === 0 ? <option value=''>{t('tablesPage.noTables')}</option> : null}
								{tables.map((table) => (
									<option key={table.name} value={table.name}>
										{table.name}
									</option>
								))}
							</select>
							{(isLoadingTables || isLoadingItems) && <div className='tables-spinner-inline' />}
						</div>
					</label>
				</div>
				{tables.length === 0 ? (
					<div className='tables-empty'>{t('tablesPage.noTablesHelp')}</div>
				) : null}
			</section>

			<section className='tables-workspace'>
				<article className='tables-panel tables-workspace__items'>
					<div className='tables-panel__header'>
						<div>
							<h2 className='tables-panel__title'>{t('tablesPage.items')}</h2>
							<p className='tables-panel__subtitle'>{t('tablesPage.itemsSubtitle')}</p>
						</div>
						{selectedTableName ? <span className='tables-pill'>{selectedTableName}</span> : null}
					</div>
				{!isLoadingItems && items.length > 0 && (
					<div className='tables-filter'>
						<input
							type='text'
							className='tables-filter__input'
							placeholder={t('tablesPage.filterPlaceholder')}
							value={filterText}
							onChange={(e) => setFilterText(e.target.value)}
						/>
						{filterText.trim() && (
							<span className='tables-filter__count'>
								{t('tablesPage.filterCount', { shown: visibleItems.length, total: items.length })}
							</span>
						)}
					</div>
				)}
				{isLoadingItems ? (
					<div className='tables-loading'>
						<div className='tables-spinner' />
						<p>{t('tablesPage.loadingItems')}</p>
					</div>
				) : items.length === 0 ? (
					<div className='tables-empty'>{t('tablesPage.empty')}</div>
				) : visibleItems.length === 0 ? (
					<div className='tables-empty'>{t('tablesPage.filterEmpty')}</div>
				) : (
					<div className='tables-items-list'>
						{visibleItems.map((item) => (
								<div
									key={item.id}
									className={`tables-item-card ${selectedItemId === String(item.id) ? 'tables-item-card--active' : ''}`}
									onClick={() => onSelectItem(item)}>
									<div className='tables-item-card__header'>
										<strong className='tables-item-card__title'>{String(item.id)}</strong>
										<div className='tables-actions'>
											<button
												type='button'
												className='tables-button tables-button--secondary'
												onClick={(event) => {
													event.stopPropagation()
													onSelectItem(item)
												}}>
												{t('tablesPage.edit')}
											</button>
											<button
												type='button'
												className='tables-button tables-button--secondary'
												onClick={(event) => {
													event.stopPropagation()
													onDecodeItem(item)
												}}>
												{t('tablesPage.decode')}
											</button>
											<span
												title={
													isReadonly
														? 'Entorno en modo lectura. Puedes cambiarlo en Ajustes'
														: undefined
												}>
												<button
													type='button'
													className='tables-button tables-button--danger'
													disabled={isReadonly}
													onClick={(event) => {
														event.stopPropagation()
														onDeleteItem(item.id)
													}}>
													{t('tablesPage.delete')}
												</button>
											</span>
										</div>
									</div>
									<pre className='tables-code tables-code--item'>
										{JSON.stringify(item, null, 2)}
									</pre>
								</div>
							))}
						</div>
					)}
				</article>

				<article className='tables-panel tables-workspace__editor'>
					<div className='tables-panel__header'>
						<div>
							<h2 className='tables-panel__title'>{t('tablesPage.editor')}</h2>
							<p className='tables-panel__subtitle'>{t('tablesPage.editorSubtitle')}</p>
						</div>
					</div>
					<div className='tables-structured-fields'>
						{structuredFields.map((field) => {
							const useTextarea = field.isJson || field.isLong || field.key === 'json_rule'
							return (
								<label key={field.key} className='tables-label'>
									<span>{field.key}</span>
									{useTextarea ? (
										<textarea
											className={`tables-textarea ${field.key === 'json_rule' ? 'tables-textarea--jsonrule' : ''}`}
											value={field.value}
											onChange={(event) => onStructuredFieldChange(field.key, event.target.value)}
										/>
									) : (
										<input
											type='text'
											className='tables-select'
											value={field.value}
											onChange={(event) => onStructuredFieldChange(field.key, event.target.value)}
										/>
									)}
								</label>
							)
						})}
					</div>
					<div className='tables-panel__subtitle tables-json-preview-title'>
						{t('tablesPage.finalJsonPreview')}
					</div>
					<textarea
						className='tables-textarea'
						value={editorValue}
						onChange={(event) => onEditorChange(event.target.value)}
					/>
					<div className='tables-actions'>
						<span
							title={
								isReadonly ? 'Entorno en modo lectura. Puedes cambiarlo en Ajustes' : undefined
							}>
							<button
								type='button'
								className='tables-button tables-button--primary'
								disabled={isReadonly}
								onClick={onSaveItem}>
								{t('tablesPage.save')}
							</button>
						</span>
						<button
							type='button'
							className='tables-button tables-button--secondary'
							disabled={isLoadingDecode}
							onClick={onDecodeEditor}>
							{t('tablesPage.decodeEditor')}
						</button>
						<button
							type='button'
							className='tables-button tables-button--secondary'
							onClick={onOpenEncodeModal}>
							{t('tablesPage.openEncodeModal')}
						</button>
						<span
							title={
								isReadonly ? 'Entorno en modo lectura. Puedes cambiarlo en Ajustes' : undefined
							}>
							<button
								type='button'
								className='tables-button tables-button--secondary'
								disabled={isReadonly}
								onClick={onNewItem}>
								{t('tablesPage.newItem')}
							</button>
						</span>
					</div>
					{decodedValue ? (
						<div className='tables-decoded'>
							<div className='tables-decoded__title'>
								{t('tablesPage.decodedTitle')}
								{decodedItemId ? ` · ${decodedItemId}` : ''}
							</div>
							<textarea
								className='tables-textarea tables-textarea--jsonrule'
								value={decodedValue}
								onChange={(event) => onDecodedExpressionChange(event.target.value)}
							/>
							<div className='tables-actions'>
								<button
									type='button'
									className='tables-button tables-button--primary'
									onClick={onApplyDecodedExpression}
									disabled={!decodedDirty}>
									{t('tablesPage.applyDecoded')}
								</button>
							</div>
						</div>
					) : null}
					{successMessage ? (
						<div className='tables-feedback tables-feedback--success'>{successMessage}</div>
					) : null}
					{errorMessage ? (
						<div className='tables-feedback tables-feedback--error'>{errorMessage}</div>
					) : null}
				</article>
			</section>

			{encodeModalOpen ? (
				<div className='tables-modal-overlay' onClick={onCloseEncodeModal}>
					<div className='tables-modal' onClick={(event) => event.stopPropagation()}>
						<div className='tables-modal__header'>
							<div>
								<h3 className='tables-modal__title'>{t('tablesPage.modalTitle')}</h3>
								<p className='tables-panel__subtitle'>{t('tablesPage.modalSubtitle')}</p>
							</div>
						</div>
						<label className='tables-label'>
							<span>{t('tablesPage.modalExpression')}</span>
							<textarea
								className='tables-textarea tables-textarea--modal'
								value={encodeExpression}
								onChange={(event) => onEncodeExpressionChange(event.target.value)}
							/>
						</label>
						<div className='tables-actions'>
							<button
								type='button'
								className='tables-button tables-button--primary'
								onClick={onApplyEncoding}>
								{t('tablesPage.modalApply')}
							</button>
							<button
								type='button'
								className='tables-button tables-button--secondary'
								onClick={onCloseEncodeModal}>
								{t('tablesPage.modalCancel')}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	)
}
