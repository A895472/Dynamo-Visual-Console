import { generateDynamoRule } from './generator'
import { parseRule } from './parser'
import { dynamoJsonToText } from './reverser'
import { validateDynamoSchema } from './validator'

export interface ParseRequest {
	expression: string
	ruleName?: string
	description?: string
	environment?: string
}

export interface ParseResult {
	expression: string
	ruleJson: Record<string, unknown>
}

export interface ReverseResult {
	expression: string
}

export function localParseRule(request: ParseRequest): ParseResult {
	const { expression, ruleName, description, environment } = request
	if (typeof expression !== 'string' || expression.trim().length === 0) {
		throw new Error('expression is required')
	}

	const ast = parseRule(expression.trim())
	const ruleJson = generateDynamoRule(ast, { ruleName, description, environment })

	return {
		expression: expression.trim(),
		ruleJson: {
			...(ruleJson as unknown as Record<string, unknown>),
			_sourceExpression: expression.trim(),
		},
	}
}

export function localReverseRule(ruleJson: Record<string, unknown>): ReverseResult {
	if (!ruleJson || typeof ruleJson !== 'object') {
		throw new Error('ruleJson is required')
	}

	const expression = dynamoJsonToText(ruleJson as Parameters<typeof dynamoJsonToText>[0])
	return { expression }
}

export { validateDynamoSchema }
