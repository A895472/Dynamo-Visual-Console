import '../layout.scss'

import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router-dom'

import LanguageSelect from '@/components/elements/Languague/LanguagueSelect'
import { ThemeToggle } from '@/components/elements/Theme/ThemeToggle'
import { APP_NAME } from '@/utils/constants'

export const Header = () => {
	const active = 'link-active'
	const { t } = useTranslation()

	return (
		<header className='header'>
			<div className='container header__inner'>
				<Link to='/' className='link brand'>
					{APP_NAME}
				</Link>
				<nav className='nav'>
					<NavLink to='/' end className={({ isActive }) => (isActive ? active : 'link')}>
						{t('navigation.dashboard')}
					</NavLink>
					<NavLink to='/tables' className={({ isActive }) => (isActive ? active : 'link')}>
						{t('navigation.tables')}
					</NavLink>
					<NavLink to='/converter' className={({ isActive }) => (isActive ? active : 'link')}>
						{t('navigation.converter')}
					</NavLink>
					<NavLink to='/settings' className={({ isActive }) => (isActive ? active : 'link')}>
						{t('navigation.settings')}
					</NavLink>
					<ThemeToggle />
					<LanguageSelect />
				</nav>
			</div>
		</header>
	)
}
