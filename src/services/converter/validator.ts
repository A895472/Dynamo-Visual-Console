const VALID_OPERATORS = [
	'eq',
	'neq',
	'dist',
	'gt',
	'lt',
	'contains',
	'notContains',
	'pattern',
	'and',
	'or',
]
const VALID_DATA_TYPES = ['String', 'Int', 'Double', 'Float', 'Boolean', 'Null', 'Regex']

interface ValidationError {
	path: string
	message: string
}

interface ValidationResult {
	valid: boolean
	errors: ValidationError[]
}

interface DynamoSchemaNode {
	name?: string
	value?: DynamoSchemaInner
	[key: string]: unknown
}

interface DynamoSchemaInner {
	name?: string
	value1?: DynamoSchemaNode
	value2?: DynamoSchemaNode
}

function validateDynamoSchema(json: DynamoSchemaNode | string, path = 'root'): ValidationError[] {
	const errors: ValidationError[] = []

	if (typeof json === 'string') {
		try {
			json = JSON.parse(json) as DynamoSchemaNode
		} catch {
			return [{ path, message: 'JSON inválido: no se pudo parsear' }]
		}
	}

	if (!json || typeof json !== 'object') {
		return [{ path, message: 'Se esperaba un objeto' }]
	}

	if (!json.name && json.name !== '') {
		errors.push({ path: `${path}.name`, message: 'Falta la propiedad "name"' })
	}

	if (!json.value && json.value !== 0) {
		errors.push({ path: `${path}.value`, message: 'Falta la propiedad "value"' })
		return errors
	}

	const inner = json.value as DynamoSchemaInner

	if (typeof inner !== 'object') {
		errors.push({ path: `${path}.value`, message: 'La propiedad "value" debe ser un objeto' })
		return errors
	}

	if (!inner.name) {
		errors.push({ path: `${path}.value.name`, message: 'Falta el nombre del operador' })
		return errors
	}

	if (inner.name === 'field' || inner.name === 'lit') {
		return validateLeafNode(inner, `${path}.value`)
	}

	if (!VALID_OPERATORS.includes(inner.name)) {
		errors.push({
			path: `${path}.value.name`,
			message: `Operador desconocido: "${inner.name}". Válidos: ${VALID_OPERATORS.join(', ')}`,
		})
	}

	if (inner.name === 'and' || inner.name === 'or') {
		if (!inner.value1) {
			errors.push({ path: `${path}.value.value1`, message: 'Falta el operando izquierdo (value1)' })
		} else {
			errors.push(...validateDynamoSchema(inner.value1, `${path}.value.value1`))
		}
		if (!inner.value2) {
			errors.push({ path: `${path}.value.value2`, message: 'Falta el operando derecho (value2)' })
		} else {
			errors.push(...validateDynamoSchema(inner.value2, `${path}.value.value2`))
		}
	} else {
		if (!inner.value1) {
			errors.push({ path: `${path}.value.value1`, message: 'Falta el campo (value1)' })
		} else {
			errors.push(...validateFieldNode(inner.value1, `${path}.value.value1`))
		}
		if (!inner.value2) {
			errors.push({ path: `${path}.value.value2`, message: 'Falta el literal (value2)' })
		} else {
			errors.push(...validateLitNode(inner.value2, `${path}.value.value2`))
		}
	}

	return errors
}

function validateLeafNode(node: DynamoSchemaInner, path: string): ValidationError[] {
	const errors: ValidationError[] = []
	const leaf = node as unknown as Record<string, unknown>
	if (leaf.value1 === undefined) {
		errors.push({ path: `${path}.value1`, message: 'Falta value1' })
	}
	if (leaf.value2 === undefined) {
		errors.push({ path: `${path}.value2`, message: 'Falta value2 (tipo de dato)' })
	} else if (!VALID_DATA_TYPES.includes(leaf.value2 as string)) {
		errors.push({
			path: `${path}.value2`,
			message: `Tipo de dato inválido: "${leaf.value2 as string}". Válidos: ${VALID_DATA_TYPES.join(', ')}`,
		})
	}
	return errors
}

function validateFieldNode(node: DynamoSchemaNode, path: string): ValidationError[] {
	const errors: ValidationError[] = []
	if (node.name !== 'field') {
		errors.push({
			path: `${path}.name`,
			message: `Se esperaba "field" pero se encontró "${node.name ?? ''}"`,
		})
	}
	const value1 = node.value1 as unknown
	const value2 = node.value2 as unknown
	if (!value1 || typeof value1 !== 'string') {
		errors.push({ path: `${path}.value1`, message: 'Falta la ruta del campo o no es una cadena' })
	}
	if (!value2 || !VALID_DATA_TYPES.includes(value2 as string)) {
		errors.push({
			path: `${path}.value2`,
			message: `Tipo de dato del campo inválido: "${value2 as string}"`,
		})
	}
	return errors
}

function validateLitNode(node: DynamoSchemaNode, path: string): ValidationError[] {
	const errors: ValidationError[] = []
	if (node.name !== 'lit' && node.name !== 'field') {
		errors.push({
			path: `${path}.name`,
			message: `Se esperaba "lit" o "field" pero se encontrÃ³ "${node.name ?? ''}"`,
		})
	}
	const value1 = node.value1 as unknown
	const value2 = node.value2 as unknown
	if (value1 === undefined) {
		errors.push({ path: `${path}.value1`, message: 'Falta el valor del literal' })
	}
	if (!value2 || !VALID_DATA_TYPES.includes(value2 as string)) {
		errors.push({
			path: `${path}.value2`,
			message: `Tipo de dato del literal inválido: "${value2 as string}"`,
		})
	}
	return errors
}

function validateDynamoSchemaResult(json: DynamoSchemaNode | string): ValidationResult {
	const errors = validateDynamoSchema(json)
	return { valid: errors.length === 0, errors }
}

export { validateDynamoSchemaResult as validateDynamoSchema }
export type { ValidationResult, ValidationError }
