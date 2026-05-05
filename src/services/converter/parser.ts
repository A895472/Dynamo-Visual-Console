import { TokenType, tokenize, TokenizerError } from './tokenizer'
import type { Token } from './tokenizer'

class ParseError extends Error {
	token: Token | null
	position: number
	input: string

	constructor(message: string, token: Token | { position: number } | null, input: string) {
		super(message)
		this.name = 'ParseError'
		this.token = token as Token | null
		this.position = token ? token.position : -1
		this.input = input
	}
}

const ASTNodeType = Object.freeze({
	COMPARISON: 'COMPARISON',
	LOGICAL: 'LOGICAL',
	GROUP: 'GROUP',
})

export interface ValueInfo {
	value: string | number | boolean | null
	dataType: string
	isFieldReference?: boolean
}

export interface ComparisonNode {
	type: typeof ASTNodeType.COMPARISON
	field: string
	operator: string
	value: ValueInfo | ValueInfo[]
	tokens: Token[]
}

export interface LogicalNode {
	type: typeof ASTNodeType.LOGICAL
	operator: string
	left: ASTNode
	right: ASTNode
}

export type ASTNode = ComparisonNode | LogicalNode

function createComparisonNode(
	field: string,
	operator: string,
	value: ValueInfo | ValueInfo[],
	tokens: Token[]
): ComparisonNode {
	return { type: ASTNodeType.COMPARISON, field, operator, value, tokens }
}

function createLogicalNode(operator: string, left: ASTNode, right: ASTNode): LogicalNode {
	return { type: ASTNodeType.LOGICAL, operator, left, right }
}

class Parser {
	private input: string
	private tokens: Token[]
	private pos: number

	constructor(input: string) {
		this.input = input
		this.tokens = tokenize(input)
		this.pos = 0
	}

	peek(): Token {
		return this.tokens[this.pos]
	}

	advance(): Token {
		const token = this.tokens[this.pos]
		this.pos++
		return token
	}

	expect(type: string, errorMsg?: string): Token {
		const token = this.peek()
		if (token.type !== type) {
			throw new ParseError(
				errorMsg || `Se esperaba ${type} pero se encontró ${token.type} ("${String(token.value)}")`,
				token,
				this.input
			)
		}
		return this.advance()
	}

	parse(): ASTNode {
		const ast = this.parseOrExpr()
		const next = this.peek()
		if (next.type !== TokenType.EOF) {
			throw new ParseError(
				`Token inesperado después de la expresión: "${String(next.value)}"`,
				next,
				this.input
			)
		}
		return ast
	}

	parseOrExpr(): ASTNode {
		const operands: ASTNode[] = [this.parseAndExpr()]
		while (this.peek().type === TokenType.LOGICAL && this.peek().value === 'OR') {
			this.advance()
			operands.push(this.parseAndExpr())
		}
		if (operands.length === 1) return operands[0]
		return this.buildRightAssociative(operands, 'OR')
	}

	parseAndExpr(): ASTNode {
		const operands: ASTNode[] = [this.parsePrimary()]
		while (this.peek().type === TokenType.LOGICAL && this.peek().value === 'AND') {
			this.advance()
			operands.push(this.parsePrimary())
		}
		if (operands.length === 1) return operands[0]
		return this.buildRightAssociative(operands, 'AND')
	}

	buildRightAssociative(operands: ASTNode[], operator: string): ASTNode {
		if (operands.length === 1) return operands[0]
		if (operands.length === 2) {
			return createLogicalNode(operator, operands[0], operands[1])
		}
		const right = this.buildRightAssociative(operands.slice(1), operator)
		return createLogicalNode(operator, operands[0], right)
	}

	parsePrimary(): ASTNode {
		const token = this.peek()

		if (token.type === TokenType.LPAREN) {
			this.advance()
			const expr = this.parseOrExpr()
			this.expect(TokenType.RPAREN, 'Se esperaba paréntesis de cierre ")"')
			return expr
		}

		if (token.type === TokenType.FIELD) {
			return this.parseComparison()
		}

		throw new ParseError(
			`Se esperaba un campo o paréntesis de apertura, pero se encontró "${String(token.value)}" (${token.type})`,
			token,
			this.input
		)
	}

	parseComparison(): ASTNode {
		const fieldToken = this.expect(TokenType.FIELD, 'Se esperaba un nombre de campo')
		const field = fieldToken.value as string
		const opToken = this.peek()

		if (opToken.type === TokenType.OPERATOR) {
			this.advance()
			const operator = this.mapOperator(opToken.value as string)
			const valueInfo = this.parseValue()
			return createComparisonNode(field, operator, valueInfo, [fieldToken, opToken])
		}

		if (opToken.type === TokenType.IN) {
			this.advance()
			const values = this.parseValueList()
			return createComparisonNode(field, 'IN', values, [fieldToken, opToken])
		}

		if (opToken.type === TokenType.NOT_IN) {
			this.advance()
			const values = this.parseValueList()
			return createComparisonNode(field, 'NOT_IN', values, [fieldToken, opToken])
		}

		if (opToken.type === TokenType.CONTAINS) {
			this.advance()
			const valueInfo = this.parseValue()
			return createComparisonNode(field, 'CONTAINS', valueInfo, [fieldToken, opToken])
		}

		if (opToken.type === TokenType.NOT_CONTAINS) {
			this.advance()
			const valueInfo = this.parseValue()
			return createComparisonNode(field, 'NOT_CONTAINS', valueInfo, [fieldToken, opToken])
		}

		if (opToken.type === TokenType.MATCHES) {
			this.advance()
			const valueInfo = this.parseValue()
			valueInfo.dataType = 'Regex'
			return createComparisonNode(field, 'MATCHES', valueInfo, [fieldToken, opToken])
		}

		throw new ParseError(
			`Se esperaba un operador después del campo "${field}", pero se encontró "${String(opToken.value)}"`,
			opToken,
			this.input
		)
	}

	parseValue(): ValueInfo {
		const token = this.peek()

		if (token.type === TokenType.STRING) {
			this.advance()
			return { value: token.value as string, dataType: 'String' }
		}
		if (token.type === TokenType.NUMBER) {
			this.advance()
			return {
				value: token.value as number,
				dataType: token.hasDecimal
					? 'Float'
					: Number.isInteger(token.value as number)
						? 'Int'
						: 'Float',
			}
		}
		if (token.type === TokenType.BOOLEAN) {
			this.advance()
			return { value: token.value as boolean, dataType: 'Boolean' }
		}
		if (token.type === TokenType.FIELD) {
			this.advance()
			const upper = (token.value as string).toUpperCase()
			if (upper === 'NULL') {
				return { value: null, dataType: 'Null' }
			}
			const FIELD_PATH_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$/
			const isFieldReference = FIELD_PATH_RE.test(token.value as string)
			return { value: token.value as string, dataType: 'String', isFieldReference }
		}

		throw new ParseError(
			`Se esperaba un valor (número, cadena, booleano) pero se encontró "${String(token.value)}"`,
			token,
			this.input
		)
	}

	parseValueList(): ValueInfo[] {
		this.expect(TokenType.LPAREN, 'Se esperaba paréntesis de apertura "(" después de IN/NOT IN')
		const values: ValueInfo[] = []
		const firstVal = this.parseValue()
		values.push(firstVal)

		while (this.peek().type === TokenType.COMMA) {
			this.advance()
			values.push(this.parseValue())
		}

		this.expect(TokenType.RPAREN, 'Se esperaba paréntesis de cierre ")" para la lista de valores')
		return values
	}

	mapOperator(op: string): string {
		const map: Record<string, string> = {
			'=': 'EQUALS',
			'!=': 'NOT_EQUALS',
			'>': 'GREATER_THAN',
			'<': 'LESS_THAN',
		}
		return map[op] ?? op
	}
}

function parseRule(input: string): ASTNode {
	if (!input || !input.trim()) {
		throw new ParseError('La expresión de regla está vacía', { position: 0 }, input ?? '')
	}
	const parser = new Parser(input.trim())
	return parser.parse()
}

export { parseRule, ParseError, ASTNodeType, Parser, TokenizerError }
