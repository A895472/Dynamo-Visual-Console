import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import type { ConsoleTableSummary } from '@/models/console'
import { TARGET_ENVIRONMENTS } from '@/models/console'
import { consoleApi } from '@/services/console/api'

import ConsoleDashboardComponent from '../components/ConsoleDashboardComponent'

const IS_REMOTE_MODE = (import.meta.env.VITE_APP_MODE ?? 'local') === 'remote'

export function ConsoleDashboard() {
	const { t } = useTranslation('console')
	const navigate = useNavigate()
	const [environment, setEnvironment] = useState<string>(consoleApi.readSettings().environment)
	const [tables, setTables] = useState<ConsoleTableSummary[]>([])

	// En remoto: lista de custom environments configurados. En local: los 3 fijos.
	const availableEnvironments = IS_REMOTE_MODE
		? consoleApi.readSettings().customEnvironments.map((e) => ({
				id: e.id,
				label: e.label ? `${e.label} (${e.targetEnv})` : `(sin nombre) (${e.targetEnv})`,
			}))
		: TARGET_ENVIRONMENTS.map((id) => ({ id, label: t(`environment.names.${id}`) }))

	useEffect(() => {
		const nextSettings = { ...consoleApi.readSettings(), environment }
		consoleApi.writeSettings(nextSettings)
		void consoleApi.listTables(environment).then(setTables)
	}, [environment])

	return (
		<ConsoleDashboardComponent
			environment={environment}
			availableEnvironments={availableEnvironments}
			tables={tables}
			onChangeEnvironment={setEnvironment}
			onOpenTable={(tableName) => navigate(`/tables?table=${encodeURIComponent(tableName)}`)}
		/>
	)
}
