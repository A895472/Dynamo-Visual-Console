const REVERSE_OPERATOR_MAP: Record<string, string> = {
	eq: '=',
	neq: '!=',
	dist: '!=',
	gt: '>',
	lt: '<',
	contains: 'CONTAINS',
	notContains: 'NOT CONTAINS',
	pattern: 'MATCHES',
}

interface DynamoInnerNode {
	name: string
	value1?: DynamoRuleNode | string | number | boolean | null
	value2?: DynamoRuleNode | string | number | boolean | null
}

interface DynamoRuleNode {
	name?: string
	value?: DynamoInnerNode
}

function formatValue(value: unknown, dataType: string): string {
	if (dataType === 'String') return `'${value as string}'`
	if (dataType === 'Regex') return `'${value as string}'`
	if (dataType === 'Boolean') return value ? 'true' : 'false'
	if (dataType === 'Null') return 'NULL'
	if ((dataType === 'Float' || dataType === 'Double') && Number.isInteger(value))
		return value + '.0'
	return String(value)
}

function reverseNode(node: DynamoRuleNode): string {
	if (!node || !node.value) {
		throw new Error('Nodo inválido: falta la propiedad "value"')
	}

	const inner = node.value

	if (inner.name === 'and' || inner.name === 'or') {
		return reverseLogical(inner)
	}

	if (REVERSE_OPERATOR_MAP[inner.name] !== undefined) {
		return reverseComparison(inner)
	}

	throw new Error(`Operador desconocido en nodo: "${inner.name}"`)
}

function reverseLogical(inner: DynamoInnerNode): string {
	const op = inner.name.toUpperCase()
	const leftExpr = reverseNode(inner.value1 as DynamoRuleNode)
	const rightExpr = reverseNode(inner.value2 as DynamoRuleNode)

	const leftStr = needsParens(inner.value1 as DynamoRuleNode, inner.name)
		? `(${leftExpr})`
		: leftExpr
	const rightStr = needsParens(inner.value2 as DynamoRuleNode, inner.name)
		? `(${rightExpr})`
		: rightExpr

	return `${leftStr} ${op} ${rightStr}`
}

function needsParens(node: DynamoRuleNode, parentOp: string): boolean {
	if (!node || !node.value) return false
	const childOp = node.value.name
	if (parentOp === 'and' && childOp === 'or') return true
	return false
}

function reverseComparison(inner: DynamoInnerNode): string {
	const operator = REVERSE_OPERATOR_MAP[inner.name]

	if (!inner.value1 || !inner.value2) {
		throw new Error('Comparación inválida: faltan value1 o value2')
	}

	const fieldNode = inner.value1 as DynamoInnerNode
	const litNode = inner.value2 as DynamoInnerNode
	const field = fieldNode.value1 as string
	const literal = litNode.value1
	const dataType = litNode.value2 as string

	if ((litNode as { name?: string }).name === 'field') {
		return `${field} ${operator} ${literal as string}`
	}
	return `${field} ${operator} ${formatValue(literal, dataType)}`
}

function collectInValues(
	node: DynamoRuleNode,
	field: string,
	op: string
): Array<{ value: unknown; dataType: string }> | null {
	if (!node || !node.value) return null
	const inner = node.value

	if (REVERSE_OPERATOR_MAP[inner.name] !== undefined) {
		const fieldNode = inner.value1 as DynamoInnerNode
		const litNode = inner.value2 as DynamoInnerNode
		if (fieldNode && fieldNode.value1 === field && inner.name === op) {
			return [{ value: litNode.value1, dataType: litNode.value2 as string }]
		}
		return null
	}

	if (
		(inner.name === 'or' && op === 'eq') ||
		(inner.name === 'and' && (op === 'neq' || op === 'dist'))
	) {
		const leftVals = collectInValues(inner.value1 as DynamoRuleNode, field, op)
		const rightVals = collectInValues(inner.value2 as DynamoRuleNode, field, op)
		if (leftVals && rightVals) {
			return [...leftVals, ...rightVals]
		}
	}

	return null
}

function tryCollapseToIn(node: DynamoRuleNode): string | null {
	if (!node || !node.value) return null
	const inner = node.value

	if (inner.name !== 'or' && inner.name !== 'and') return null

	const firstLeaf = findFirstComparison(node)
	if (!firstLeaf) return null

	const fieldNode = firstLeaf.value1 as DynamoInnerNode
	const field = fieldNode.value1 as string
	const op = firstLeaf.name

	if (op !== 'eq' && op !== 'neq' && op !== 'dist') return null

	const values = collectInValues(node, field, op)
	if (!values || values.length < 2) return null

	const keyword = op === 'eq' ? 'IN' : 'NOT IN'
	const formattedValues = values.map((v) => formatValue(v.value, v.dataType)).join(', ')
	return `${field} ${keyword} (${formattedValues})`
}

function findFirstComparison(node: DynamoRuleNode): DynamoInnerNode | null {
	if (!node || !node.value) return null
	const inner = node.value
	if (REVERSE_OPERATOR_MAP[inner.name] !== undefined) return inner
	if (inner.name === 'and' || inner.name === 'or') {
		return findFirstComparison(inner.value1 as DynamoRuleNode)
	}
	return null
}

function dynamoJsonToText(json: DynamoRuleNode | string, collapseIn = true): string {
	if (typeof json === 'string') {
		json = JSON.parse(json) as DynamoRuleNode
	}

	if (!json || !json.value) {
		throw new Error('JSON de regla inválido: falta la propiedad raíz "value"')
	}

	const rootNode: DynamoRuleNode = { value: json.value }

	if (collapseIn) {
		const collapsed = tryCollapseToIn(rootNode)
		if (collapsed) return collapsed
	}

	return reverseNode(rootNode)
}

export { dynamoJsonToText }
export type { DynamoRuleNode, DynamoInnerNode }
