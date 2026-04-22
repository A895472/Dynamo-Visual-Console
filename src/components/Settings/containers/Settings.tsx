import { useState } from 'react'

import type { AwsCredentials, ConsoleSettings, CustomEnvironment } from '@/models/console'
import { consoleApi } from '@/services/console/api'
import {
	clearEnvCredentials,
	readEnvCredentials,
	writeEnvCredentials,
} from '@/services/console/api'

import SettingsComponent from '../components/SettingsComponent'

export function Settings() {
	const [settings, setSettings] = useState<ConsoleSettings>(consoleApi.readSettings())
	const [feedback, setFeedback] = useState('')

	const handleSave = () => {
		consoleApi.writeSettings(settings)
		setFeedback('Configuración guardada en el navegador.')
	}

	const handleSaveEnvCredentials = (id: string, creds: AwsCredentials) => {
		writeEnvCredentials(id, creds)
	}

	const handleClearEnvCredentials = (id: string) => {
		clearEnvCredentials(id)
	}

	const readEnvCreds = (id: string) => readEnvCredentials(id)

	const handleAddEnv = () => {
		const newEnv: CustomEnvironment = {
			id: `env-${Date.now()}`,
			label: '',
			targetEnv: 'desa',
			readonly: true,
		}
		const updated = { ...settings, customEnvironments: [...settings.customEnvironments, newEnv] }
		setSettings(updated)
		consoleApi.writeSettings(updated)
	}

	const handleUpdateEnv = (id: string, patch: Partial<CustomEnvironment>) => {
		const updated = {
			...settings,
			customEnvironments: settings.customEnvironments.map((e) =>
				e.id === id ? { ...e, ...patch } : e
			),
		}
		setSettings(updated)
	}

	const handleDeleteEnv = (id: string) => {
		clearEnvCredentials(id)
		const updated = {
			...settings,
			customEnvironments: settings.customEnvironments.filter((e) => e.id !== id),
		}
		setSettings(updated)
		consoleApi.writeSettings(updated)
	}

	return (
		<SettingsComponent
			settings={settings}
			feedback={feedback}
			onChange={setSettings}
			onSave={handleSave}
			onSaveEnvCredentials={handleSaveEnvCredentials}
			onClearEnvCredentials={handleClearEnvCredentials}
			readEnvCredentials={readEnvCreds}
			onAddEnv={handleAddEnv}
			onUpdateEnv={handleUpdateEnv}
			onDeleteEnv={handleDeleteEnv}
		/>
	)
}
