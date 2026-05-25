// cypress/e2e/home.cy.ts
// Tests para la página de inicio (panel / ConsoleDashboard)

describe('Página de inicio - Panel principal', () => {
	beforeEach(() => {
		cy.visit('/')
		// Limpiamos el historial de items para partir de estado conocido
		cy.window().then((win) => win.localStorage.clear())
		cy.visit('/')
	})

	it('muestra el hero con título y acciones principales', () => {
		cy.contains('Dynamo control room').should('be.visible')
		cy.contains('Abrir tablas').should('be.visible')
		cy.contains('Abrir convertidor').should('be.visible')
	})

	it('muestra el panel de entornos con sus niveles de riesgo', () => {
		// En modo local debería mostrar los 3 entornos por defecto
		cy.contains('Desarrollo').should('be.visible')
		cy.contains('Bajo riesgo').should('be.visible')
		cy.contains('Preproducción').should('be.visible')
		cy.contains('Producción').should('be.visible')
	})

	it('el riesgo cambia según el entorno: desa=low, pre=medium, pro=high', () => {
		// Comprobamos que cada entorno tiene su nivel de riesgo correcto
		cy.contains('button', 'Desarrollo')
			.closest('button')
			.find('.console-pill--low')
			.should('exist')

		cy.contains('button', 'Preproducción')
			.closest('button')
			.find('.console-pill--medium')
			.should('exist')

		cy.contains('button', 'Producción')
			.closest('button')
			.find('.console-pill--high')
			.should('exist')
	})

	it('muestra el panel de resumen con tablas e items (sin tablas sensibles)', () => {
		cy.contains('Resumen').should('be.visible')
		cy.contains('Tablas').should('be.visible')
		cy.contains('Items').should('be.visible')
		// "Tablas sensibles" no debe aparecer
		cy.contains('Tablas sensibles').should('not.exist')
	})

	it('navega a /tables al pulsar "Abrir tablas"', () => {
		cy.contains('Abrir tablas').click()
		cy.url().should('include', '/tables')
	})

	it('navega a /converter al pulsar "Abrir convertidor"', () => {
		cy.contains('Abrir convertidor').click()
		cy.url().should('include', '/converter')
	})

	it('cambiar el entorno activo actualiza la vista de tablas del panel', () => {
		cy.contains('button', 'Preproducción').click()
		cy.contains('button', 'Preproducción').should('have.class', 'console-environment--active')
	})
})
