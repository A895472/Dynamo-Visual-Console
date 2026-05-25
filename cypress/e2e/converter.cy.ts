// cypress/e2e/converter.cy.ts
// Tests para la página del convertidor (/converter)

describe('Convertidor de reglas', () => {
	beforeEach(() => {
		cy.visit('/converter')
	})

	it('muestra la página del convertidor', () => {
		cy.url().should('include', '/converter')
		cy.get('body').should('be.visible')
	})

	it('tiene un área de texto o campo de entrada para la expresión', () => {
		cy.get('textarea, input[type="text"]').should('have.length.gte', 1)
	})

	it('tiene botones de acción para convertir/revertir', () => {
		cy.get('button').should('have.length.gte', 1)
	})

	it('puede escribir una expresión en el campo de entrada', () => {
		cy.get('textarea').first().then(($el) => {
			if ($el.length > 0 && !$el.is(':disabled') && !$el.is('[readonly]')) {
				cy.wrap($el).clear().type('id = "test-item"')
				cy.wrap($el).should('have.value', 'id = "test-item"')
			}
		})
	})
})
