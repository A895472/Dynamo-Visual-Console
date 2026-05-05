import { ASTNodeType } from './parser'
import type { ASTNode, ComparisonNode, LogicalNode, ValueInfo } from './parser'

const OPERATOR_MAP: Record<string, string> = {
	EQUALS: 'eq',
	NOT_EQUALS: 'dist',
	GREATER_THAN: 'gt',
	LESS_THAN: 'lt',
	CONTAINS: 'contains',
	NOT_CONTAINS: 'notContains',
	MATCHES: 'pattern',
}

const OPERATOR_SYMBOL: Record<string, string> = {
	EQUALS: '=',
	NOT_EQUALS: '!=',
	GREATER_THAN: '>',
	LESS_THAN: '<',
	CONTAINS: 'CONTAINS',
	NOT_CONTAINS: 'NOT CONTAINS',
	MATCHES: 'MATCHES',
}

function getFieldAlias(fieldPath: string): string {
	const parts = fieldPath.split('.')
	const lastPart = parts[parts.length - 1]
	return lastPart.charAt(0).toUpperCase() + lastPart.slice(1)
}

function formatLiteralValue(val: string | number | boolean | null): string {
	if (typeof val === 'string') return `'${val}'`
	return String(val)
}

function generateComparisonName(
	field: string,
	operator: string,
	value: ValueInfo | ValueInfo[]
): string {
	const alias = getFieldAlias(field)
	const symbol = OPERATOR_SYMBOL[operator] ?? operator

	if (Array.isArray(value)) {
		const vals = value.map((v) => formatLiteralValue(v.value)).join(', ')
		return `${alias} ${symbol} (${vals})`
	}

	if ((value as ValueInfo).isFieldReference) {
		return `${alias} ${symbol} ${String((value as ValueInfo).value)}`
	}
	return `${alias} ${symbol} ${formatLiteralValue(value.value)}`
}

interface DynamoLeafNode {
	name: string
	value1: string | number | boolean | null
	value2: string
}

interface DynamoInnerNode {
	name: string
	value1?: DynamoNode | DynamoLeafNode
	value2?: DynamoNode | DynamoLeafNode
}

interface DynamoNode {
	name: string
	value?: DynamoInnerNode
	_metadata?: Record<string, unknown>
	_sourceExpression?: string
}

function generateComparisonNode(node: ComparisonNode): DynamoNode {
	const { field, operator, value } = node

	if (operator === 'IN' || operator === 'NOT_IN') {
		return generateInNode(node)
	}

	const dynOp = OPERATOR_MAP[operator] ?? operator.toLowerCase()
	const name = generateComparisonName(field, operator, value as ValueInfo)
	const singleValue = value as ValueInfo
	const fieldType = singleValue.dataType === 'Regex' ? 'String' : singleValue.dataType

	return {
		name,
		value: {
			name: dynOp,
			value1: {
				name: 'field',
				value1: field,
				value2: fieldType,
			},
			value2: {
				name: singleValue.isFieldReference ? 'field' : 'lit',
				value1: singleValue.value as string | number | boolean | null,
				value2: singleValue.dataType,
			},
		},
	}
}

function generateInNode(node: ComparisonNode): DynamoNode {
	const { field, operator, value: values } = node
	const valuesArr = values as ValueInfo[]

	if (valuesArr.length === 1) {
		const singleOp = operator === 'IN' ? 'EQUALS' : 'NOT_EQUALS'
		return generateComparisonNode({
			type: ASTNodeType.COMPARISON,
			field,
			operator: singleOp,
			value: valuesArr[0],
			tokens: node.tokens,
		})
	}

	const logicalOp = operator === 'IN' ? 'or' : 'and'
	const compOp = operator === 'IN' ? 'EQUALS' : 'NOT_EQUALS'

	function buildTree(items: ValueInfo[], idx: number): DynamoNode {
		if (idx === items.length - 1) {
			return generateComparisonNode({
				type: ASTNodeType.COMPARISON,
				field,
				operator: compOp,
				value: items[idx],
				tokens: node.tokens,
			})
		}

		const left = generateComparisonNode({
			type: ASTNodeType.COMPARISON,
			field,
			operator: compOp,
			value: items[idx],
			tokens: node.tokens,
		})

		const right =
			idx === items.length - 2
				? generateComparisonNode({
						type: ASTNodeType.COMPARISON,
						field,
						operator: compOp,
						value: items[idx + 1],
						tokens: node.tokens,
					})
				: buildTree(items, idx + 1)

		const alias = getFieldAlias(field)
		const leftName = `${alias} = ${formatLiteralValue(items[idx].value)}`
		const rightNames = items.slice(idx + 1).map((v) => `${alias} = ${formatLiteralValue(v.value)}`)
		const groupName = `(${[leftName, ...rightNames].join(` ${logicalOp === 'or' ? 'OR' : 'AND'} `)})`

		return {
			name: groupName,
			value: {
				name: logicalOp,
				value1: left,
				value2: right,
			},
		}
	}

	return buildTree(valuesArr, 0)
}

function generateLogicalNode(node: LogicalNode): DynamoNode {
	const { operator, left, right } = node
	const dynOp = operator.toLowerCase()
	const leftResult = generateDynamo(left)
	const rightResult = generateDynamo(right)

	const name = `(${leftResult.name}) ${operator} (${rightResult.name})`

	return {
		name,
		value: {
			name: dynOp,
			value1: leftResult,
			value2: rightResult,
		},
	}
}

function generateDynamo(ast: ASTNode): DynamoNode {
	if (!ast) throw new Error('AST vacío')

	switch (ast.type) {
		case ASTNodeType.COMPARISON:
			return generateComparisonNode(ast as ComparisonNode)
		case ASTNodeType.LOGICAL:
			return generateLogicalNode(ast as LogicalNode)
		default:
			throw new Error(`Tipo de nodo desconocido: ${(ast as ASTNode).type}`)
	}
}

interface RuleMetadata {
	ruleName?: string
	description?: string
	environment?: string
	version?: string
	active?: boolean
}

function generateDynamoRule(ast: ASTNode, metadata: RuleMetadata = {}): DynamoNode {
	const ruleBody = generateDynamo(ast)

	const result: DynamoNode = {
		name: ruleBody.name,
		value: ruleBody.value,
	}

	if (metadata.ruleName ?? metadata.description ?? metadata.environment ?? metadata.version) {
		result._metadata = {}
		if (metadata.ruleName) result._metadata.ruleName = metadata.ruleName
		if (metadata.description) result._metadata.description = metadata.description
		if (metadata.environment) result._metadata.environment = metadata.environment
		if (metadata.version) result._metadata.version = metadata.version
		if (metadata.active !== undefined) result._metadata.active = metadata.active
	}

	return result
}

export { generateDynamoRule, generateDynamo }
export type { DynamoNode, DynamoInnerNode, RuleMetadata }
