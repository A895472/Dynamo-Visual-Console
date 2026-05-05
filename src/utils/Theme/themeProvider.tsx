import { useEffect, useMemo, useState } from 'react'

import type { Theme } from '@/models/utils/Theme'

import { applyTheme, getInitialTheme } from './theme'
import { ThemeContext } from './theme-context'

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
	const [theme, setTheme] = useState<Theme>(getInitialTheme)

	useEffect(() => {
		applyTheme(theme)
	}, [])

	const value = useMemo(
		() => ({
			theme,
			toggle: () => {
				setTheme((t) => {
					const next: Theme = t === 'light' ? 'dark' : 'light'
					applyTheme(next)
					return next
				})
			},
		}),
		[theme]
	)

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
