import { createBrowserRouter } from 'react-router-dom'

import { ConsoleDashboard } from '@/components/Console/containers/ConsoleDashboard'
import Converter from '@/components/Converter/containers/Converter'
import { Settings } from '@/components/Settings/containers/Settings'
import { Tables } from '@/components/Tables/containers/Tables'
import { IndexLayout } from '@/layouts'

export const router = createBrowserRouter([
	{
		path: '/',
		element: <IndexLayout />,
		children: [
			{ index: true, element: <ConsoleDashboard /> },
			{ path: 'tables', element: <Tables /> },
			{ path: 'converter', element: <Converter /> },
			{ path: 'settings', element: <Settings /> },
			// { path: '*', element: <NotFound /> },
		],
	},
])
