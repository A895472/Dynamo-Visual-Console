/**
 * Tokenizer para expresiones de reglas tipo SQL.
 * Convierte una cadena de texto en un array de tokens tipados.
 */

const TokenType = Object.freeze({
  FIELD: 'FIELD',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN',
  OPERATOR: 'OPERATOR',
  LOGICAL: 'LOGICAL',
  LPAREN: 'LPAREN',
  RPAREN: 'RPAREN',
  COMMA: 'COMMA',
  IN: 'IN',
  NOT_IN: 'NOT_IN',
  NOT: 'NOT',
  CONTAINS: 'CONTAINS',
  NOT_CONTAINS: 'NOT_CONTAINS',
  MATCHES: 'MATCHES',
  EOF: 'EOF',
});

const OPERATORS = ['!=', '=', '>', '<'];
const LOGICAL_OPS = ['AND', 'OR'];

class TokenizerError extends Error {
  constructor(message, position, input) {
    super(message);
    this.name = 'TokenizerError';
    this.position = position;
    this.input = input;
  }
}

function createToken(type, value, position, length) {
  return { type, value, position, length };
}

function tokenize(input) {
  const tokens = [];
  let pos = 0;

  function peek(offset = 0) {
    return input[pos + offset];
  }

  function remaining() {
    return input.substring(pos);
  }

  function skipWhitespace() {
    while (pos < input.length && /\s/.test(input[pos])) {
      pos++;
    }
  }

  function readString(quote) {
    const start = pos;
    pos++; // skip opening quote
    let value = '';
    while (pos < input.length && input[pos] !== quote) {
      if (input[pos] === '\\') {
        pos++;
        if (pos >= input.length) {
          throw new TokenizerError('Cadena sin terminar: secuencia de escape al final', start, input);
        }
      }
      value += input[pos];
      pos++;
    }
    if (pos >= input.length) {
      throw new TokenizerError(`Cadena sin terminar: falta la comilla de cierre ${quote}`, start, input);
    }
    pos++; // skip closing quote
    return createToken(TokenType.STRING, value, start, pos - start);
  }

  function readNumber() {
    const start = pos;
    let numStr = '';
    let hasDecimal = false;
    if (input[pos] === '-') {
      numStr += '-';
      pos++;
    }
    while (pos < input.length && /[0-9.]/.test(input[pos])) {
      if (input[pos] === '.') hasDecimal = true;
      numStr += input[pos];
      pos++;
    }
    const num = parseFloat(numStr);
    if (isNaN(num)) {
      throw new TokenizerError(`Número inválido: "${numStr}"`, start, input);
    }
    const tok = createToken(TokenType.NUMBER, num, start, pos - start);
    tok.hasDecimal = hasDecimal;
    return tok;
  }

  function readWord() {
    const start = pos;
    let word = '';
    while (pos < input.length && /[a-zA-Z0-9_.]/.test(input[pos])) {
      word += input[pos];
      pos++;
    }
    return { word, start, length: pos - start };
  }

  while (pos < input.length) {
    skipWhitespace();
    if (pos >= input.length) break;

    const ch = input[pos];
    const startPos = pos;

    if (ch === '(' ) {
      tokens.push(createToken(TokenType.LPAREN, '(', pos, 1));
      pos++;
      continue;
    }

    if (ch === ')') {
      tokens.push(createToken(TokenType.RPAREN, ')', pos, 1));
      pos++;
      continue;
    }

    if (ch === ',') {
      tokens.push(createToken(TokenType.COMMA, ',', pos, 1));
      pos++;
      continue;
    }

    if (ch === "'" || ch === '"') {
      tokens.push(readString(ch));
      continue;
    }

    const twoChar = input.substring(pos, pos + 2);
    if (twoChar === '>=' || twoChar === '<=') {
      throw new TokenizerError(`Operador "${twoChar}" no soportado. Usa ">" o "<"`, pos, input);
    }
    if (twoChar === '!=') {
      tokens.push(createToken(TokenType.OPERATOR, twoChar, pos, 2));
      pos += 2;
      continue;
    }

    if (ch === '=' || ch === '>' || ch === '<') {
      tokens.push(createToken(TokenType.OPERATOR, ch, pos, 1));
      pos++;
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '-' && pos + 1 < input.length && /[0-9]/.test(input[pos + 1]))) {
      tokens.push(readNumber());
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      const { word, start, length } = readWord();
      const upper = word.toUpperCase();

      if (upper === 'AND' || upper === 'OR') {
        tokens.push(createToken(TokenType.LOGICAL, upper, start, length));
      } else if (upper === 'IN') {
        tokens.push(createToken(TokenType.IN, 'IN', start, length));
      } else if (upper === 'NOT') {
        const savedPos = pos;
        skipWhitespace();
        if (pos < input.length) {
          const nextWordInfo = readWord();
          const nextUpper = nextWordInfo.word.toUpperCase();
          if (nextUpper === 'IN') {
            tokens.push(createToken(TokenType.NOT_IN, 'NOT IN', start, pos - start));
          } else if (nextUpper === 'CONTAINS') {
            tokens.push(createToken(TokenType.NOT_CONTAINS, 'NOT CONTAINS', start, pos - start));
          } else {
            pos = savedPos;
            tokens.push(createToken(TokenType.NOT, 'NOT', start, length));
          }
        } else {
          tokens.push(createToken(TokenType.NOT, 'NOT', start, length));
        }
      } else if (upper === 'CONTAINS') {
        tokens.push(createToken(TokenType.CONTAINS, 'CONTAINS', start, length));
      } else if (upper === 'MATCHES') {
        tokens.push(createToken(TokenType.MATCHES, 'MATCHES', start, length));
        // Read unquoted regex pattern if next char is not a quote
        skipWhitespace();
        if (pos < input.length && input[pos] !== "'" && input[pos] !== '"') {
          const rxStart = pos;
          let depth = 0;
          while (pos < input.length) {
            if (input[pos] === '(') depth++;
            else if (input[pos] === ')') { if (depth === 0) break; depth--; }
            else if (/\s/.test(input[pos]) && depth === 0) break;
            pos++;
          }
          if (pos > rxStart) {
            tokens.push(createToken(TokenType.STRING, input.substring(rxStart, pos), rxStart, pos - rxStart));
          }
        }
      } else if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push(createToken(TokenType.BOOLEAN, upper === 'TRUE', start, length));
      } else {
        tokens.push(createToken(TokenType.FIELD, word, start, length));
      }
      continue;
    }

    throw new TokenizerError(`Carácter inesperado: "${ch}"`, pos, input);
  }

  tokens.push(createToken(TokenType.EOF, null, pos, 0));
  return tokens;
}

export { tokenize, TokenType, TokenizerError };
