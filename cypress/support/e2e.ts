// cypress/support/e2e.ts
// Punto de entrada del soporte E2E — importa comandos personalizados y plugins.
import './commands'

// Desactivar excepciones no capturadas que vengan del navegador durante los tests
Cypress.on('uncaught:exception', (_err, _runnable) => {
	// Evitamos que errores de la app fallen los tests de forma inesperada
	return false
})
