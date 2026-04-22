/**
 * Parser de expresiones de reglas.
 * Construye un AST (Abstract Syntax Tree) a partir de tokens.
 * 
 * Gramática soportada:
 *   expression     → or_expr
 *   or_expr        → and_expr ( 'OR' and_expr )*
 *   and_expr       → comparison ( 'AND' comparison )*
 *   comparison     → '(' expression ')'
 *                   | field OPERATOR value
 *                   | field IN '(' value_list ')'
 *                   | field NOT IN '(' value_list ')'
 *                   | field CONTAINS value
 *                   | field NOT CONTAINS value
 */

import { TokenType, tokenize, TokenizerError } from './tokenizer.js';

class ParseError extends Error {
  constructor(message, token, input) {
    super(message);
    this.name = 'ParseError';
    this.token = token;
    this.position = token ? token.position : -1;
    this.input = input;
  }
}

const ASTNodeType = Object.freeze({
  COMPARISON: 'COMPARISON',
  LOGICAL: 'LOGICAL',
  GROUP: 'GROUP',
});

function createComparisonNode(field, operator, value, tokens) {
  return { type: ASTNodeType.COMPARISON, field, operator, value, tokens };
}

function createLogicalNode(operator, left, right) {
  return { type: ASTNodeType.LOGICAL, operator, left, right };
}

class Parser {
  constructor(input) {
    this.input = input;
    this.tokens = tokenize(input);
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos];
  }

  advance() {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  expect(type, errorMsg) {
    const token = this.peek();
    if (token.type !== type) {
      throw new ParseError(
        errorMsg || `Se esperaba ${type} pero se encontró ${token.type} ("${token.value}")`,
        token,
        this.input
      );
    }
    return this.advance();
  }

  parse() {
    const ast = this.parseOrExpr();
    const next = this.peek();
    if (next.type !== TokenType.EOF) {
      throw new ParseError(
        `Token inesperado después de la expresión: "${next.value}"`,
        next,
        this.input
      );
    }
    return ast;
  }

  parseOrExpr() {
    const operands = [this.parseAndExpr()];
    while (this.peek().type === TokenType.LOGICAL && this.peek().value === 'OR') {
      this.advance();
      operands.push(this.parseAndExpr());
    }
    if (operands.length === 1) return operands[0];
    return this.buildRightAssociative(operands, 'OR');
  }

  parseAndExpr() {
    const operands = [this.parsePrimary()];
    while (this.peek().type === TokenType.LOGICAL && this.peek().value === 'AND') {
      this.advance();
      operands.push(this.parsePrimary());
    }
    if (operands.length === 1) return operands[0];
    return this.buildRightAssociative(operands, 'AND');
  }

  buildRightAssociative(operands, operator) {
    if (operands.length === 1) return operands[0];
    if (operands.length === 2) {
      return createLogicalNode(operator, operands[0], operands[1]);
    }
    const right = this.buildRightAssociative(operands.slice(1), operator);
    return createLogicalNode(operator, operands[0], right);
  }

  parsePrimary() {
    const token = this.peek();

    if (token.type === TokenType.LPAREN) {
      this.advance();
      const expr = this.parseOrExpr();
      this.expect(TokenType.RPAREN, 'Se esperaba paréntesis de cierre ")"');
      return expr;
    }

    if (token.type === TokenType.FIELD) {
      return this.parseComparison();
    }

    throw new ParseError(
      `Se esperaba un campo o paréntesis de apertura, pero se encontró "${token.value}" (${token.type})`,
      token,
      this.input
    );
  }

  parseComparison() {
    const fieldToken = this.expect(TokenType.FIELD, 'Se esperaba un nombre de campo');
    const field = fieldToken.value;
    const opToken = this.peek();

    if (opToken.type === TokenType.OPERATOR) {
      this.advance();
      const operator = this.mapOperator(opToken.value);
      const valueInfo = this.parseValue();
      return createComparisonNode(field, operator, valueInfo, [fieldToken, opToken]);
    }

    if (opToken.type === TokenType.IN) {
      this.advance();
      const values = this.parseValueList();
      return createComparisonNode(field, 'IN', values, [fieldToken, opToken]);
    }

    if (opToken.type === TokenType.NOT_IN) {
      this.advance();
      const values = this.parseValueList();
      return createComparisonNode(field, 'NOT_IN', values, [fieldToken, opToken]);
    }

    if (opToken.type === TokenType.CONTAINS) {
      this.advance();
      const valueInfo = this.parseValue();
      return createComparisonNode(field, 'CONTAINS', valueInfo, [fieldToken, opToken]);
    }

    if (opToken.type === TokenType.NOT_CONTAINS) {
      this.advance();
      const valueInfo = this.parseValue();
      return createComparisonNode(field, 'NOT_CONTAINS', valueInfo, [fieldToken, opToken]);
    }

    if (opToken.type === TokenType.MATCHES) {
      this.advance();
      const valueInfo = this.parseValue();
      valueInfo.dataType = 'Regex';
      return createComparisonNode(field, 'MATCHES', valueInfo, [fieldToken, opToken]);
    }

    throw new ParseError(
      `Se esperaba un operador después del campo "${field}", pero se encontró "${opToken.value}"`,
      opToken,
      this.input
    );
  }

  parseValue() {
    const token = this.peek();

    if (token.type === TokenType.STRING) {
      this.advance();
      return { value: token.value, dataType: 'String' };
    }
    if (token.type === TokenType.NUMBER) {
      this.advance();
      return { value: token.value, dataType: token.hasDecimal ? 'Float' : (Number.isInteger(token.value) ? 'Int' : 'Float') };
    }
    if (token.type === TokenType.BOOLEAN) {
      this.advance();
      return { value: token.value, dataType: 'Boolean' };
    }
    if (token.type === TokenType.FIELD) {
      this.advance();
      const upper = token.value.toUpperCase();
      if (upper === 'NULL') {
        return { value: null, dataType: 'Null' };
      }
      return { value: token.value, dataType: 'String' };
    }

    throw new ParseError(
      `Se esperaba un valor (número, cadena, booleano) pero se encontró "${token.value}"`,
      token,
      this.input
    );
  }

  parseValueList() {
    this.expect(TokenType.LPAREN, 'Se esperaba paréntesis de apertura "(" después de IN/NOT IN');
    const values = [];
    const firstVal = this.parseValue();
    values.push(firstVal);

    while (this.peek().type === TokenType.COMMA) {
      this.advance();
      values.push(this.parseValue());
    }

    this.expect(TokenType.RPAREN, 'Se esperaba paréntesis de cierre ")" para la lista de valores');
    return values;
  }

  mapOperator(op) {
    const map = {
      '=': 'EQUALS',
      '!=': 'NOT_EQUALS',
      '>': 'GREATER_THAN',
      '<': 'LESS_THAN',
    };
    return map[op] || op;
  }
}

function parseRule(input) {
  if (!input || !input.trim()) {
    throw new ParseError('La expresión de regla está vacía', { position: 0 }, input);
  }
  const parser = new Parser(input.trim());
  return parser.parse();
}

export { parseRule, ParseError, ASTNodeType, Parser };
