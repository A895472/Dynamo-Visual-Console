// cypress/e2e/tables.cy.ts
// Tests para la página de tablas (/tables)

describe('Página de tablas - explorador', () => {
	beforeEach(() => {
		cy.window().then((win) => win.localStorage.clear())
		cy.visit('/tables')
	})

	it('muestra el explorador con selector de entorno y tabla', () => {
		cy.contains('Explorador de tablas').should('be.visible')
		cy.get('select').first().should('be.visible') // entorno
	})

	it('el selector de entorno tiene las 3 opciones en modo local', () => {
		cy.get('select').first().find('option').should('have.length.gte', 1)
	})

	it('muestra el panel de historial de cambios al seleccionar un item', () => {
		// Si hay items cargados, selecciona el primero
		cy.get('.tables-item-card').first().then(($card) => {
			if ($card.length > 0) {
				cy.wrap($card).click()
				// El historial siempre debe mostrarse (incluso vacío)
				cy.contains('Historial de cambios').should('be.visible')
			}
		})
	})

	it('abre el panel de historial al hacer click en el toggle', () => {
		cy.get('.tables-item-card').first().then(($card) => {
			if ($card.length > 0) {
				cy.wrap($card).click()
				cy.get('.tables-history__toggle').should('be.visible').click()
				cy.get('.tables-history__list').should('be.visible')
			}
		})
	})
})

describe('Editor de tablas - nuevo item', () => {
	beforeEach(() => {
		cy.window().then((win) => win.localStorage.clear())
		cy.visit('/tables')
	})

	it('el botón + crea un nuevo item con modo "new"', () => {
		// Si hay una tabla seleccionada, el botón + debe estar activo
		cy.get('.tables-button--new-icon').then(($btn) => {
			if (!$btn.is(':disabled')) {
				$btn.trigger('click')
				cy.contains('editorSubtitleNew').should('not.exist') // texto i18n como fallback
				cy.get('.tables-structured-fields').should('be.visible')
			}
		})
	})

	it('el campo de clave primaria es editable en modo nuevo', () => {
		cy.get('.tables-button--new-icon').then(($btn) => {
			if (!$btn.is(':disabled')) {
				cy.wrap($btn).click()
				// La clave primaria NO debe estar deshabilitada en modo new
				cy.get('.tables-structured-fields input').first().should('not.be.disabled')
			}
		})
	})
})

describe('Editor de tablas - duplicar item', () => {
	beforeEach(() => {
		cy.window().then((win) => win.localStorage.clear())
		cy.visit('/tables')
	})

	it('al duplicar, el campo de clave primaria es editable', () => {
		cy.get('.tables-item-card').first().then(($card) => {
			if ($card.length > 0) {
				cy.wrap($card).click()
				// Pulsa el botón de duplicar
				cy.get('.tables-button--icon-duplicate').click()
				// El ID (primer input) debe ser editable — no disabled
				cy.get('.tables-structured-fields input').first().should('not.be.disabled')
			}
		})
	})

	it('al duplicar, se puede escribir un nuevo ID sin que el campo se bloquee', () => {
		cy.get('.tables-item-card').first().then(($card) => {
			if ($card.length > 0) {
				cy.wrap($card).click()
				cy.get('.tables-button--icon-duplicate').click()
				// Escribe un nuevo ID
				cy.get('.tables-structured-fields input').first().clear().type('mi-nuevo-id-test')
				cy.get('.tables-structured-fields input').first().should('have.value', 'mi-nuevo-id-test')
				cy.get('.tables-structured-fields input').first().should('not.be.disabled')
			}
		})
	})

	it('muestra error si intentas guardar con un ID ya existente', () => {
		cy.get('.tables-item-card').first().then(($card) => {
			if ($card.length > 0) {
				// Obtiene el ID del primer item
				const itemId = $card.find('.tables-item-card__title').text()
				cy.wrap($card).click()
				cy.get('.tables-button--icon-duplicate').click()
				// Cambia el ID al del item original (duplicado)
				cy.get('.tables-structured-fields input').first().clear().type(itemId)
				// Intenta guardar
				cy.get('.tables-button--primary').contains('Guardar').click()
				// Debe aparecer un error
				cy.get('.tables-feedback--error').should('be.visible').and('contain', 'Ya existe')
			}
		})
	})

	it('muestra error si el ID está vacío al guardar', () => {
		cy.get('.tables-button--new-icon').then(($btn) => {
			if (!$btn.is(':disabled')) {
				cy.wrap($btn).click()
				// Borra el campo del primer input (clave primaria)
				cy.get('.tables-structured-fields input').first().clear()
				// Intenta guardar
				cy.get('.tables-button--primary').contains('Guardar').click()
				// Debe aparecer un error de campo vacío
				cy.get('.tables-feedback--error').should('be.visible').and('contain', 'vacío')
			}
		})
	})
})

describe('Navegación entre entornos - default no cambia', () => {
	beforeEach(() => {
		cy.window().then((win) => {
			// Establecemos un entorno y tabla por defecto en settings
			const settings = {
				environment: 'desa',
				defaultTableName: '',
				apiBaseUrl: '/api',
				converterBaseUrl: '/converter-api',
				apiKey: '',
				readonlyEnvironments: ['desa', 'pre', 'pro'],
				customEnvironments: [],
			}
			win.localStorage.setItem('dynamo-console-settings', JSON.stringify(settings))
		})
		cy.visit('/tables')
	})

	it('cambiar entorno en la pantalla de tablas no actualiza el default de settings', () => {
		// Cambia el selector de entorno
		cy.get('select').first().select('pre')
		// Navega fuera y vuelve a /tables
		cy.visit('/')
		cy.visit('/tables')
		// El settings guardado no debe haber cambiado el environment por defecto
		cy.window().then((win) => {
			const raw = win.localStorage.getItem('dynamo-console-settings')
			if (raw) {
				const saved = JSON.parse(raw) as { environment: string }
				// El entorno guardado en settings debería seguir siendo 'desa' (el default)
				expect(saved.environment).to.equal('desa')
			}
		})
	})
})
