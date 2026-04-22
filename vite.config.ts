import react from '@vitejs/plugin-react'
import { config as dotenvConfig } from 'dotenv'
import path from 'path'
import { defineConfig, loadEnv } from 'vite'

import { dynamoApiPlugin } from './plugins/dynamo-api'

// Carga .env.local (perfiles AWS personales, no commiteados) en process.env
// para que el plugin dynamo-api los pueda leer en tiempo de servidor.
dotenvConfig({ path: path.resolve(__dirname, '.env.local') })

// Directorios de entorno mapeados por modo Vite
const modeSubdirs: Record<string, string> = {
	dev: 'dev',
	prod: 'prod',
	desa: 'desa',
	pre: 'pre',
}

export default defineConfig(({ mode }) => {
	const envRoot = path.resolve(__dirname, 'enviroments')
	const common = loadEnv(mode, envRoot, 'VITE_')
	const modeSubdir = modeSubdirs[mode]
	const byModeDir = modeSubdir ? path.resolve(envRoot, modeSubdir) : envRoot
	const byMode = loadEnv(mode, byModeDir, 'VITE_')
	const env = { ...common, ...byMode }

	// Informar al plugin dynamo-api del modo de arranque
	// 'local' → usa perfiles ~/.aws/credentials
	// 'remote' → requiere credenciales en cabeceras HTTP (Settings → credenciales)
	process.env.APP_MODE = mode === 'dev' ? 'local' : 'remote'

	return {
		plugins: [react(), dynamoApiPlugin()],
		envDir: envRoot,
		resolve: { alias: { '@': path.resolve(__dirname, 'src') } },

		define: {
			'__APP_NAME__': JSON.stringify(env.VITE_APP_NAME ?? 'App'),
			// Exponer VITE_APP_MODE al navegador (import.meta.env.VITE_APP_MODE).
			// Vite no lo recoge automáticamente porque los .env están en subdirectorios.
			'import.meta.env.VITE_APP_MODE': JSON.stringify(env.VITE_APP_MODE ?? 'local'),
		},
	}
})
