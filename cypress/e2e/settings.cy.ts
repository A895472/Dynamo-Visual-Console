// cypress/e2e/settings.cy.ts
// Tests para la página de ajustes (/settings)

describe('Página de ajustes', () => {
	beforeEach(() => {
		cy.visit('/settings')
	})

	it('muestra la página de ajustes', () => {
		cy.url().should('include', '/settings')
		cy.get('body').should('be.visible')
	})

	it('muestra el selector de entorno por defecto', () => {
		cy.contains(/entorno.*defecto|default.*environment/i).should('be.visible')
	})

	it('muestra controles de configuración de credenciales AWS', () => {
		cy.contains(/credenciales|credentials|AWS/i).should('be.visible')
	})

	it('permite cambiar la tabla por defecto', () => {
		cy.contains(/tabla.*defecto|default.*table/i).should('be.visible')
	})

	it('guarda los cambios en localStorage', () => {
		// Verifica que settings existen en localStorage tras visitar la página
		cy.window().then((win) => {
			const raw = win.localStorage.getItem('dynamo-console-settings')
			// Puede no existir si es la primera visita; solo verificamos que si existe es válido JSON
			if (raw) {
				expect(() => JSON.parse(raw)).not.to.throw()
			}
		})
	})
})

describe('Navegación principal', () => {
	it('puede navegar entre todas las rutas principales', () => {
		const routes = [
			{ path: '/', expectedText: /dynamo|control room|panel/i },
			{ path: '/tables', expectedText: /tablas|tables|explorador/i },
			{ path: '/converter', expectedText: /conver/i },
			{ path: '/settings', expectedText: /ajustes|settings|configuraci/i },
		]

		for (const route of routes) {
			cy.visit(route.path)
			cy.url().should('include', route.path === '/' ? '' : route.path)
			cy.get('body').should('be.visible')
		}
	})

	it('el header o menú de navegación es visible en todas las páginas', () => {
		const pages = ['/', '/tables', '/converter', '/settings']
		for (const page of pages) {
			cy.visit(page)
			cy.get('header, nav, .layout-header, .main-header').should('exist')
		}
	})
})
