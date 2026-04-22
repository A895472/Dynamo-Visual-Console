/**
 * Convertidor de Reglas Dynamo - Bundle completo
 * Tokenizer + Parser + Generator + Reverser + Validator + App
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // TOKENIZER
  // ═══════════════════════════════════════════════════════════

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

    function skipWhitespace() {
      while (pos < input.length && /\s/.test(input[pos])) {
        pos++;
      }
    }

    function readString(quote) {
      const start = pos;
      pos++;
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
        throw new TokenizerError('Cadena sin terminar: falta la comilla de cierre ' + quote, start, input);
      }
      pos++;
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
        throw new TokenizerError('N\u00famero inv\u00e1lido: "' + numStr + '"', start, input);
      }
      var tok = createToken(TokenType.NUMBER, num, start, pos - start);
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

      var ch = input[pos];

      if (ch === '(') {
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

      var twoChar = input.substring(pos, pos + 2);
      if (twoChar === '>=' || twoChar === '<=') {
        throw new TokenizerError('Operador "' + twoChar + '" no soportado. Usa ">" o "<"', pos, input);
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
        var info = readWord();
        var upper = info.word.toUpperCase();

        if (upper === 'AND' || upper === 'OR') {
          tokens.push(createToken(TokenType.LOGICAL, upper, info.start, info.length));
        } else if (upper === 'IN') {
          tokens.push(createToken(TokenType.IN, 'IN', info.start, info.length));
        } else if (upper === 'NOT') {
          var savedPos = pos;
          skipWhitespace();
          if (pos < input.length) {
            var nextInfo = readWord();
            var nextUpper = nextInfo.word.toUpperCase();
            if (nextUpper === 'IN') {
              tokens.push(createToken(TokenType.NOT_IN, 'NOT IN', info.start, pos - info.start));
            } else if (nextUpper === 'CONTAINS') {
              tokens.push(createToken(TokenType.NOT_CONTAINS, 'NOT CONTAINS', info.start, pos - info.start));
            } else {
              pos = savedPos;
              tokens.push(createToken(TokenType.NOT, 'NOT', info.start, info.length));
            }
          } else {
            tokens.push(createToken(TokenType.NOT, 'NOT', info.start, info.length));
          }
        } else if (upper === 'CONTAINS') {
          tokens.push(createToken(TokenType.CONTAINS, 'CONTAINS', info.start, info.length));
        } else if (upper === 'MATCHES') {
          tokens.push(createToken(TokenType.MATCHES, 'MATCHES', info.start, info.length));
          // Read unquoted regex pattern if next char is not a quote
          skipWhitespace();
          if (pos < input.length && input[pos] !== "'" && input[pos] !== '"') {
            var rxStart = pos;
            var depth = 0;
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
          tokens.push(createToken(TokenType.BOOLEAN, upper === 'TRUE', info.start, info.length));
        } else {
          tokens.push(createToken(TokenType.FIELD, info.word, info.start, info.length));
        }
        continue;
      }

      throw new TokenizerError('Car\u00e1cter inesperado: "' + ch + '"', pos, input);
    }

    tokens.push(createToken(TokenType.EOF, null, pos, 0));
    return tokens;
  }

  // ═══════════════════════════════════════════════════════════
  // PARSER
  // ═══════════════════════════════════════════════════════════

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
  });

  function createComparisonNode(field, operator, value, tokens) {
    return { type: ASTNodeType.COMPARISON, field, operator, value, tokens };
  }

  function createLogicalNode(operator, left, right) {
    return { type: ASTNodeType.LOGICAL, operator, left, right };
  }

  function buildRightAssociative(operands, operator) {
    if (operands.length === 1) return operands[0];
    if (operands.length === 2) return createLogicalNode(operator, operands[0], operands[1]);
    var right = buildRightAssociative(operands.slice(1), operator);
    return createLogicalNode(operator, operands[0], right);
  }

  var OPERATOR_NAME_MAP = {
    '=': 'EQUALS', '!=': 'NOT_EQUALS', '>': 'GREATER_THAN',
    '<': 'LESS_THAN',
  };

  function parseRule(input) {
    if (!input || !input.trim()) {
      throw new ParseError('La expresi\u00f3n de regla est\u00e1 vac\u00eda', { position: 0 }, input);
    }
    input = input.trim();
    var tokens = tokenize(input);
    var pos = 0;

    function peek() { return tokens[pos]; }
    function advance() { return tokens[pos++]; }
    function expect(type, msg) {
      var t = peek();
      if (t.type !== type) throw new ParseError(msg || 'Se esperaba ' + type + ' pero se encontr\u00f3 ' + t.type, t, input);
      return advance();
    }

    function parseOrExpr() {
      var operands = [parseAndExpr()];
      while (peek().type === TokenType.LOGICAL && peek().value === 'OR') {
        advance();
        operands.push(parseAndExpr());
      }
      if (operands.length === 1) return operands[0];
      return buildRightAssociative(operands, 'OR');
    }

    function parseAndExpr() {
      var operands = [parsePrimary()];
      while (peek().type === TokenType.LOGICAL && peek().value === 'AND') {
        advance();
        operands.push(parsePrimary());
      }
      if (operands.length === 1) return operands[0];
      return buildRightAssociative(operands, 'AND');
    }

    function parsePrimary() {
      var t = peek();
      if (t.type === TokenType.LPAREN) {
        advance();
        var expr = parseOrExpr();
        expect(TokenType.RPAREN, 'Se esperaba par\u00e9ntesis de cierre ")"');
        return expr;
      }
      if (t.type === TokenType.FIELD) return parseComparison();
      throw new ParseError('Se esperaba un campo o par\u00e9ntesis, pero se encontr\u00f3 "' + t.value + '"', t, input);
    }

    function parseComparison() {
      var fieldToken = expect(TokenType.FIELD, 'Se esperaba un nombre de campo');
      var field = fieldToken.value;
      var op = peek();

      if (op.type === TokenType.OPERATOR) {
        advance();
        var operator = OPERATOR_NAME_MAP[op.value] || op.value;
        var val = parseValue();
        return createComparisonNode(field, operator, val, [fieldToken, op]);
      }
      if (op.type === TokenType.IN) { advance(); return createComparisonNode(field, 'IN', parseValueList(), [fieldToken, op]); }
      if (op.type === TokenType.NOT_IN) { advance(); return createComparisonNode(field, 'NOT_IN', parseValueList(), [fieldToken, op]); }
      if (op.type === TokenType.CONTAINS) { advance(); return createComparisonNode(field, 'CONTAINS', parseValue(), [fieldToken, op]); }
      if (op.type === TokenType.NOT_CONTAINS) { advance(); return createComparisonNode(field, 'NOT_CONTAINS', parseValue(), [fieldToken, op]); }
      if (op.type === TokenType.MATCHES) {
        advance();
        var mVal = parseValue();
        mVal.dataType = 'Regex';
        return createComparisonNode(field, 'MATCHES', mVal, [fieldToken, op]);
      }

      throw new ParseError('Se esperaba un operador despu\u00e9s de "' + field + '", pero se encontr\u00f3 "' + op.value + '"', op, input);
    }

    function parseValue() {
      var t = peek();
      if (t.type === TokenType.STRING) { advance(); return { value: t.value, dataType: 'String' }; }
      if (t.type === TokenType.NUMBER) { advance(); return { value: t.value, dataType: t.hasDecimal ? 'Float' : (Number.isInteger(t.value) ? 'Int' : 'Float') }; }
      if (t.type === TokenType.BOOLEAN) { advance(); return { value: t.value, dataType: 'Boolean' }; }
      if (t.type === TokenType.FIELD) {
        advance();
        if (t.value.toUpperCase() === 'NULL') return { value: null, dataType: 'Null' };
        return { value: t.value, dataType: 'String' };
      }
      throw new ParseError('Se esperaba un valor pero se encontr\u00f3 "' + t.value + '"', t, input);
    }

    function parseValueList() {
      expect(TokenType.LPAREN, 'Se esperaba "(" despu\u00e9s de IN/NOT IN');
      var values = [parseValue()];
      while (peek().type === TokenType.COMMA) { advance(); values.push(parseValue()); }
      expect(TokenType.RPAREN, 'Se esperaba ")" para cerrar la lista');
      return values;
    }

    var ast = parseOrExpr();
    if (peek().type !== TokenType.EOF) {
      throw new ParseError('Token inesperado: "' + peek().value + '"', peek(), input);
    }
    return ast;
  }

  // ═══════════════════════════════════════════════════════════
  // GENERATOR (AST → JSON Dynamo)
  // ═══════════════════════════════════════════════════════════

  var DYNAMO_OP = {
    EQUALS: 'eq', NOT_EQUALS: 'dist', GREATER_THAN: 'gt', LESS_THAN: 'lt',
    CONTAINS: 'contains', NOT_CONTAINS: 'notContains', MATCHES: 'pattern',
  };

  var OP_SYMBOL = {
    EQUALS: '=', NOT_EQUALS: '!=', GREATER_THAN: '>', LESS_THAN: '<',
    CONTAINS: 'CONTAINS', NOT_CONTAINS: 'NOT CONTAINS', MATCHES: 'MATCHES',
  };

  function getFieldAlias(fp) {
    var parts = fp.split('.');
    var last = parts[parts.length - 1];
    return last.charAt(0).toUpperCase() + last.slice(1);
  }

  function fmtLit(val) { return typeof val === 'string' ? "'" + val + "'" : String(val); }

  function genComparison(node) {
    if (node.operator === 'IN' || node.operator === 'NOT_IN') return genIn(node);
    var dynOp = DYNAMO_OP[node.operator] || node.operator.toLowerCase();
    var alias = getFieldAlias(node.field);
    var sym = OP_SYMBOL[node.operator] || node.operator;
    var fieldType = node.value.dataType === 'Regex' ? 'String' : node.value.dataType;
    return {
      name: alias + ' ' + sym + ' ' + fmtLit(node.value.value),
      value: {
        name: dynOp,
        value1: { name: 'field', value1: node.field, value2: fieldType },
        value2: { name: 'lit', value1: node.value.value, value2: node.value.dataType },
      },
    };
  }

  function genIn(node) {
    var values = node.value;
    var field = node.field;
    var isIn = node.operator === 'IN';
    if (values.length === 1) {
      return genComparison({ type: 'COMPARISON', field: field, operator: isIn ? 'EQUALS' : 'NOT_EQUALS', value: values[0] });
    }
    var logOp = isIn ? 'or' : 'and';
    var compOp = isIn ? 'EQUALS' : 'NOT_EQUALS';

    function build(items, idx) {
      if (idx === items.length - 1) {
        return genComparison({ type: 'COMPARISON', field: field, operator: compOp, value: items[idx] });
      }
      var left = genComparison({ type: 'COMPARISON', field: field, operator: compOp, value: items[idx] });
      var right = (idx === items.length - 2)
        ? genComparison({ type: 'COMPARISON', field: field, operator: compOp, value: items[idx + 1] })
        : build(items, idx + 1);
      var alias = getFieldAlias(field);
      var names = items.slice(idx).map(function (v) { return alias + ' = ' + fmtLit(v.value); });
      return {
        name: '(' + names.join(logOp === 'or' ? ' OR ' : ' AND ') + ')',
        value: { name: logOp, value1: left, value2: right },
      };
    }
    return build(values, 0);
  }

  function generateDynamo(ast) {
    if (!ast) throw new Error('AST vac\u00edo');
    if (ast.type === ASTNodeType.COMPARISON) return genComparison(ast);
    if (ast.type === ASTNodeType.LOGICAL) {
      var dynOp = ast.operator.toLowerCase();
      var l = generateDynamo(ast.left);
      var r = generateDynamo(ast.right);
      return {
        name: '(' + l.name + ') ' + ast.operator + ' (' + r.name + ')',
        value: { name: dynOp, value1: l, value2: r },
      };
    }
    throw new Error('Nodo desconocido: ' + ast.type);
  }

  function generateDynamoRule(ast) {
    var body = generateDynamo(ast);
    return { name: body.name, value: body.value };
  }

  function stringifyDynamo(obj, indent) {
    var raw = JSON.stringify(obj, null, indent);
    // Fix Float/Double integer values: "value1": 0 followed by "value2": "Float"|"Double"
    raw = raw.replace(/"value1":\s*(-?\d+),(\s*"value2":\s*"(?:Float|Double)")/g, function (m, num, rest) {
      return '"value1": ' + num + '.0,' + rest;
    });
    return raw;
  }

  // ═══════════════════════════════════════════════════════════
  // REVERSER (JSON Dynamo → Texto)
  // ═══════════════════════════════════════════════════════════

  var REV_OP = { eq: '=', neq: '!=', dist: '!=', gt: '>', lt: '<', contains: 'CONTAINS', notContains: 'NOT CONTAINS', pattern: 'MATCHES' };

  function fmtVal(value, dt) {
    if (dt === 'String') return "'" + value + "'";
    if (dt === 'Regex') return "'" + value + "'";
    if (dt === 'Boolean') return value ? 'true' : 'false';
    if (dt === 'Null') return 'NULL';
    if ((dt === 'Float' || dt === 'Double') && Number.isInteger(value)) return value + '.0';
    return String(value);
  }

  function tryCollapseNode(node) {
    if (!node || !node.value) return null;
    var inner = node.value;
    if (inner.name !== 'or' && inner.name !== 'and') return null;
    var fc = findFirstComp(node);
    if (!fc) return null;
    if (fc.name !== 'eq' && fc.name !== 'neq' && fc.name !== 'dist') return null;
    var vals = collectInVals(node, fc.value1.value1, fc.name);
    if (!vals || vals.length < 2) return null;
    var kw = fc.name === 'eq' ? 'IN' : 'NOT IN';
    return fc.value1.value1 + ' ' + kw + ' (' + vals.map(function (v) { return fmtVal(v.value, v.dataType); }).join(', ') + ')';
  }

  function revNode(node) {
    if (!node || !node.value) throw new Error('Nodo inv\u00e1lido: falta "value"');
    var inner = node.value;
    if (inner.name === 'and' || inner.name === 'or') {
      var collapsed = tryCollapseNode(node);
      if (collapsed) return collapsed;
      return revLogical(inner);
    }
    if (REV_OP[inner.name] !== undefined) return revComparison(inner);
    throw new Error('Operador desconocido: "' + inner.name + '"');
  }

  function revLogical(inner) {
    var op = inner.name.toUpperCase();
    var le = revNode(inner.value1);
    var re = revNode(inner.value2);
    var ls = needsParens(inner.value1, inner.name) ? '(' + le + ')' : le;
    var rs = needsParens(inner.value2, inner.name) ? '(' + re + ')' : re;
    return ls + ' ' + op + ' ' + rs;
  }

  function needsParens(node, parentOp) {
    if (!node || !node.value) return false;
    var childOp = node.value.name;
    if (childOp === 'or' && tryCollapseNode(node)) return false;
    if (parentOp === 'and' && childOp === 'or') return true;
    if (parentOp === 'or' && childOp === 'and') return true;
    return false;
  }

  function revComparison(inner) {
    return inner.value1.value1 + ' ' + REV_OP[inner.name] + ' ' + fmtVal(inner.value2.value1, inner.value2.value2);
  }

  function collectInVals(node, field, op) {
    if (!node || !node.value) return null;
    var inner = node.value;
    if (REV_OP[inner.name] !== undefined) {
      if (inner.value1 && inner.value1.value1 === field && inner.name === op) {
        return [{ value: inner.value2.value1, dataType: inner.value2.value2 }];
      }
      return null;
    }
    if ((inner.name === 'or' && op === 'eq') || (inner.name === 'and' && (op === 'neq' || op === 'dist'))) {
      var lv = collectInVals(inner.value1, field, op);
      var rv = collectInVals(inner.value2, field, op);
      if (lv && rv) return lv.concat(rv);
    }
    return null;
  }

  function findFirstComp(node) {
    if (!node || !node.value) return null;
    var inner = node.value;
    if (REV_OP[inner.name] !== undefined) return inner;
    if (inner.name === 'and' || inner.name === 'or') return findFirstComp(inner.value1);
    return null;
  }

  function dynamoJsonToText(json) {
    if (typeof json === 'string') json = JSON.parse(json);
    if (!json || !json.value) throw new Error('JSON inv\u00e1lido: falta "value"');
    return revNode({ value: json.value });
  }

  // ═══════════════════════════════════════════════════════════
  // VALIDATOR
  // ═══════════════════════════════════════════════════════════

  var VALID_OPS = ['eq', 'neq', 'dist', 'gt', 'lt', 'contains', 'notContains', 'pattern', 'and', 'or'];
  var VALID_TYPES = ['String', 'Int', 'Double', 'Float', 'Boolean', 'Null', 'Regex'];

  function validateDynamoSchema(json, path) {
    path = path || 'root';
    var errors = [];
    if (typeof json === 'string') {
      try { json = JSON.parse(json); } catch (e) { return [{ path: path, message: 'JSON inv\u00e1lido' }]; }
    }
    if (!json || typeof json !== 'object') return [{ path: path, message: 'Se esperaba un objeto' }];
    if (!json.name && json.name !== '') errors.push({ path: path + '.name', message: 'Falta "name"' });
    if (!json.value && json.value !== 0) { errors.push({ path: path + '.value', message: 'Falta "value"' }); return errors; }
    var inner = json.value;
    if (typeof inner !== 'object') { errors.push({ path: path + '.value', message: '"value" debe ser un objeto' }); return errors; }
    if (!inner.name) { errors.push({ path: path + '.value.name', message: 'Falta el operador' }); return errors; }
    if (inner.name === 'field' || inner.name === 'lit') {
      if (inner.value1 === undefined) errors.push({ path: path + '.value.value1', message: 'Falta value1' });
      if (inner.value2 === undefined) errors.push({ path: path + '.value.value2', message: 'Falta value2' });
      else if (VALID_TYPES.indexOf(inner.value2) === -1) errors.push({ path: path + '.value.value2', message: 'Tipo inv\u00e1lido: "' + inner.value2 + '"' });
      return errors;
    }
    if (VALID_OPS.indexOf(inner.name) === -1) errors.push({ path: path + '.value.name', message: 'Operador desconocido: "' + inner.name + '"' });
    if (inner.name === 'and' || inner.name === 'or') {
      if (!inner.value1) errors.push({ path: path + '.value.value1', message: 'Falta value1' });
      else errors = errors.concat(validateDynamoSchema(inner.value1, path + '.value.value1'));
      if (!inner.value2) errors.push({ path: path + '.value.value2', message: 'Falta value2' });
      else errors = errors.concat(validateDynamoSchema(inner.value2, path + '.value.value2'));
    } else {
      if (!inner.value1) errors.push({ path: path + '.value.value1', message: 'Falta el campo' });
      else {
        if (inner.value1.name !== 'field') errors.push({ path: path + '.value.value1.name', message: 'Se esperaba "field"' });
        if (!inner.value1.value1) errors.push({ path: path + '.value.value1.value1', message: 'Falta ruta del campo' });
        if (!inner.value1.value2 || VALID_TYPES.indexOf(inner.value1.value2) === -1) errors.push({ path: path + '.value.value1.value2', message: 'Tipo inv\u00e1lido' });
      }
      if (!inner.value2) errors.push({ path: path + '.value.value2', message: 'Falta el literal' });
      else {
        if (inner.value2.name !== 'lit') errors.push({ path: path + '.value.value2.name', message: 'Se esperaba "lit"' });
        if (inner.value2.value1 === undefined) errors.push({ path: path + '.value.value2.value1', message: 'Falta el valor' });
        if (!inner.value2.value2 || VALID_TYPES.indexOf(inner.value2.value2) === -1) errors.push({ path: path + '.value.value2.value2', message: 'Tipo inv\u00e1lido' });
      }
    }
    return errors;
  }

  // ═══════════════════════════════════════════════════════════
  // APP
  // ═══════════════════════════════════════════════════════════

  var KNOWN_FIELDS = [
    { path: 'payload.mensaje.envio.codaplicacion', type: 'Int' },
    { path: 'payload.mensaje.envio.eventosenvio.evento.codevento', type: 'String' },
    { path: 'payload.mensaje.envio.datosservicio.tipoprod.codupu', type: 'String' },
    { path: 'payload.mensaje.envio.datosenvio.codproducto', type: 'String' },
    { path: 'payload.mensaje.envio.datosenvio.referenciaenvio', type: 'String' },
    { path: 'payload.mensaje.envio.datosenvio.codpais', type: 'String' },
    { path: 'payload.mensaje.envio.datosservicio.codservicio', type: 'String' },
    { path: 'payload.mensaje.envio.datosservicio.tiposervicio', type: 'String' },
    { path: 'payload.mensaje.envio.datosservicio.modalidad', type: 'String' },
    { path: 'payload.mensaje.envio.datosdir.codpostal', type: 'String' },
    { path: 'payload.mensaje.envio.datosdir.provincia', type: 'String' },
    { path: 'payload.mensaje.envio.datosdir.localidad', type: 'String' },
    { path: 'payload.mensaje.envio.peso', type: 'Double' },
    { path: 'payload.mensaje.envio.numpaquetes', type: 'Int' },
    { path: 'payload.mensaje.envio.remitente.nombre', type: 'String' },
    { path: 'payload.mensaje.envio.destinatario.nombre', type: 'String' },
    { path: 'payload.mensaje.envio.estado', type: 'String' },
    { path: 'payload.mensaje.envio.fecharecogida', type: 'String' },
    { path: 'payload.mensaje.envio.fechaentrega', type: 'String' },
    { path: 'payload.mensaje.envio.urgente', type: 'Boolean' },
  ];

  var HISTORY_KEY = 'dynamo_rule_converter_history';
  var MAX_HISTORY = 50;

  function App() {
    this.currentJson = null;
    this.autocompleteVisible = false;
    this.autocompleteIdx = -1;
    this.autocompleteTarget = null;

    this._initElements();
    this._initTabs();
    this._initConverter();
    this._initImport();
    this._initMotor();
    this._initHistory();
  }

  App.prototype._initElements = function () {
    this.tabs = document.querySelectorAll('.nav-tab');
    this.tabContents = document.querySelectorAll('.tab-content');
    this.ruleInput = document.getElementById('ruleInput');
    this.jsonOutput = document.getElementById('jsonOutput');
    this.errorBox = document.getElementById('errorBox');
    this.successBox = document.getElementById('successBox');
    this.toastContainer = document.getElementById('toastContainer');
    this.importInput = document.getElementById('importInput');
    this.importOutput = document.getElementById('importOutput');
    this.historyList = document.getElementById('historyList');
    this.autocompleteEl = document.getElementById('autocomplete');
    this.motorOutput = document.getElementById('motorOutput');
  };

  App.prototype._initTabs = function () {
    var self = this;
    this.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.dataset.tab;
        self.tabs.forEach(function (t) { t.classList.remove('active'); });
        self.tabContents.forEach(function (c) { c.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById('tab-' + target).classList.add('active');
        if (target === 'history') self._renderHistory();
      });
    });
  };

  App.prototype._initConverter = function () {
    var self = this;
    document.getElementById('btnConvert').addEventListener('click', function () { self.convert(); });
    document.getElementById('btnCopy').addEventListener('click', function () { self.copyJson(); });
    document.getElementById('btnDownload').addEventListener('click', function () { self.downloadJson(); });
    document.getElementById('btnClear').addEventListener('click', function () { self.clearConverter(); });
    this.ruleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); self.convert(); }
    });
    this._initAutocomplete();
  };

  App.prototype.convert = function () {
    var input = this.ruleInput.value.trim();
    this._hideError();
    this._hideSuccess();
    if (!input) { this._showError('La expresi\u00f3n de regla est\u00e1 vac\u00eda', 'Escribe una regla en formato texto para convertirla.'); return; }
    try {
      var ast = parseRule(input);
      var json = generateDynamoRule(ast);
      this.currentJson = json;
      this._renderJson(json);
      this._saveToHistory(input, json);
      this._showSuccess('Regla convertida correctamente');
    } catch (err) {
      this._handleError(err, input);
    }
  };

  App.prototype._handleError = function (err, input) {
    if (err instanceof ParseError || err instanceof TokenizerError) {
      var pos = err.position || 0;
      var len = (err.token && err.token.length) ? err.token.length : 1;
      this._showError(err.message, 'Posici\u00f3n: ' + pos, input.substring(0, pos), input.substring(pos, pos + len), input.substring(pos + len));
    } else {
      this._showError('Error inesperado', err.message);
    }
  };

  App.prototype._renderJson = function (json) {
    this.jsonOutput.innerHTML = this._highlightJson(stringifyDynamo(json, 2));
  };

  App.prototype._highlightJson = function (s) {
    return s
      .replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="json-key">$1</span>:')
      .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="json-string">$1</span>')
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="json-number">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="json-boolean">$1</span>')
      .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>')
      .replace(/([{}[\]])/g, '<span class="json-brace">$1</span>');
  };

  App.prototype.copyJson = function () {
    if (!this.currentJson) { this._toast('No hay JSON para copiar', 'error'); return; }
    var text = stringifyDynamo(this.currentJson, 2);
    var self = this;
    navigator.clipboard.writeText(text).then(function () {
      self._toast('JSON copiado al portapapeles', 'success');
    }).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      self._toast('JSON copiado al portapapeles', 'success');
    });
  };

  App.prototype.downloadJson = function () {
    if (!this.currentJson) { this._toast('No hay JSON para descargar', 'error'); return; }
    var text = stringifyDynamo(this.currentJson, 2);
    var name = 'regla_dynamo';
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name.replace(/\s+/g, '_') + '.json'; a.click();
    URL.revokeObjectURL(url);
    this._toast('Archivo descargado', 'success');
  };

  App.prototype.clearConverter = function () {
    this.ruleInput.value = '';
    this.ruleInput.classList.remove('error');
    this.currentJson = null;
    this.jsonOutput.innerHTML = '<div class="json-placeholder">El JSON generado aparecer\u00e1 aqu\u00ed</div>';
    this._hideError(); this._hideSuccess();
  };

  // ─── Motor de Reglas ───

  App.prototype._initMotor = function () {
    var self = this;
    document.getElementById('btnGenerateMotor').addEventListener('click', function () { self.generateMotor(); });
    document.getElementById('btnCopyMotor').addEventListener('click', function () { self.copyMotor(); });
    document.getElementById('btnDownloadMotor').addEventListener('click', function () { self.downloadMotor(); });
    document.getElementById('btnClearMotor').addEventListener('click', function () { self.clearMotor(); });

    var fechaHoy = new Date();
    var dd = String(fechaHoy.getDate()).padStart(2, '0');
    var mm = String(fechaHoy.getMonth() + 1).padStart(2, '0');
    var yyyy = fechaHoy.getFullYear();
    document.getElementById('motorFechaCreacion').value = dd + '-' + mm + '-' + yyyy;
  };

  App.prototype.generateMotor = function () {
    var errBox = document.getElementById('motorError');
    var okBox = document.getElementById('motorSuccess');
    errBox.classList.remove('visible');
    okBox.classList.remove('visible');

    var id = document.getElementById('motorId').value.trim();
    var destino = document.getElementById('motorDestino').value.trim();
    var responsable = document.getElementById('motorResponsable').value.trim();
    var descripcion = document.getElementById('motorDescripcion').value.trim();
    var fechaCreacion = document.getElementById('motorFechaCreacion').value.trim();

    if (!id) { errBox.querySelector('.error-title').textContent = 'Campo obligatorio'; errBox.querySelector('.error-detail').textContent = 'El ID de la regla es obligatorio.'; errBox.classList.add('visible'); return; }
    if (!destino) { errBox.querySelector('.error-title').textContent = 'Campo obligatorio'; errBox.querySelector('.error-detail').textContent = 'El destino es obligatorio.'; errBox.classList.add('visible'); return; }
    if (!this.currentJson) { errBox.querySelector('.error-title').textContent = 'Falta la regla'; errBox.querySelector('.error-detail').textContent = 'Primero convierte una regla en texto a JSON en el panel de arriba.'; errBox.classList.add('visible'); return; }

    var fechaHoy = new Date();
    var dd = String(fechaHoy.getDate()).padStart(2, '0');
    var mm = String(fechaHoy.getMonth() + 1).padStart(2, '0');
    var yyyy = fechaHoy.getFullYear();
    var fechaMod = dd + '-' + mm + '-' + yyyy;

    var motorJson = {
      id: id,
      destino: destino,
      json_rule: stringifyDynamo(this.currentJson),
    };
    if (responsable) motorJson.responsable_solicitud = responsable;
    if (descripcion) motorJson.descripcion = descripcion;
    if (fechaCreacion) {
      motorJson.fecha_creacion = fechaCreacion;
      motorJson.fecha_modificacion = fechaMod;
    }

    this.currentMotorJson = motorJson;
    this.motorOutput.innerHTML = this._highlightJson(stringifyDynamo(motorJson, 2));
    okBox.textContent = 'JSON del Motor de Reglas generado correctamente';
    okBox.classList.add('visible');
  };

  App.prototype.copyMotor = function () {
    if (!this.currentMotorJson) { this._toast('No hay JSON del Motor para copiar', 'error'); return; }
    var text = stringifyDynamo(this.currentMotorJson, 2);
    var self = this;
    navigator.clipboard.writeText(text).then(function () {
      self._toast('JSON Motor copiado al portapapeles', 'success');
    }).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      self._toast('JSON Motor copiado al portapapeles', 'success');
    });
  };

  App.prototype.downloadMotor = function () {
    if (!this.currentMotorJson) { this._toast('No hay JSON del Motor para descargar', 'error'); return; }
    var text = stringifyDynamo(this.currentMotorJson, 2);
    var name = (this.currentMotorJson.id || 'regla_motor').replace(/\s+/g, '_');
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name + '.json'; a.click();
    URL.revokeObjectURL(url);
    this._toast('Archivo del Motor descargado', 'success');
  };

  App.prototype.clearMotor = function () {
    document.getElementById('motorId').value = '';
    document.getElementById('motorDestino').value = '';
    document.getElementById('motorResponsable').value = '';
    document.getElementById('motorDescripcion').value = '';
    var fechaHoy = new Date();
    var dd = String(fechaHoy.getDate()).padStart(2, '0');
    var mm = String(fechaHoy.getMonth() + 1).padStart(2, '0');
    var yyyy = fechaHoy.getFullYear();
    document.getElementById('motorFechaCreacion').value = dd + '-' + mm + '-' + yyyy;
    this.currentMotorJson = null;
    this.motorOutput.innerHTML = '<div class="json-placeholder">Rellena los campos y genera la regla para el Motor de Reglas</div>';
    document.getElementById('motorError').classList.remove('visible');
    document.getElementById('motorSuccess').classList.remove('visible');
    this._toast('Configuración del Motor limpiada', 'info');
  };

  // ─── Autocomplete ───

  App.prototype._initAutocomplete = function () {
    var self = this;
    this.ruleInput.addEventListener('input', function () { self._handleAC(); });
    this.ruleInput.addEventListener('keydown', function (e) { self._handleACKey(e); });
    document.addEventListener('click', function (e) {
      if (!self.autocompleteEl.contains(e.target) && e.target !== self.ruleInput) self._hideAC();
    });
  };

  App.prototype._handleAC = function () {
    var val = this.ruleInput.value;
    var cursor = this.ruleInput.selectionStart;
    var before = val.substring(0, cursor);
    var m = before.match(/([a-zA-Z_][a-zA-Z0-9_.]*$)/);
    if (!m || m[1].length < 2) { this._hideAC(); return; }
    var partial = m[1].toLowerCase();
    var matches = KNOWN_FIELDS.filter(function (f) { return f.path.toLowerCase().indexOf(partial) !== -1; }).slice(0, 8);
    if (matches.length === 0) { this._hideAC(); return; }
    this.autocompleteTarget = { start: cursor - m[1].length, end: cursor };
    this.autocompleteIdx = -1;
    var self = this;
    this.autocompleteEl.innerHTML = matches.map(function (f, i) {
      return '<div class="autocomplete-item" data-index="' + i + '" data-path="' + f.path + '"><span class="field-path">' + f.path + '</span><span class="field-type">' + f.type + '</span></div>';
    }).join('');
    this.autocompleteEl.querySelectorAll('.autocomplete-item').forEach(function (item) {
      item.addEventListener('click', function () { self._selectAC(item.dataset.path); });
    });
    this.autocompleteEl.classList.add('visible');
    this.autocompleteVisible = true;
  };

  App.prototype._handleACKey = function (e) {
    if (!this.autocompleteVisible) return;
    var items = this.autocompleteEl.querySelectorAll('.autocomplete-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); this.autocompleteIdx = Math.min(this.autocompleteIdx + 1, items.length - 1); this._updateACSel(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.autocompleteIdx = Math.max(this.autocompleteIdx - 1, 0); this._updateACSel(items); }
    else if ((e.key === 'Enter' || e.key === 'Tab') && this.autocompleteIdx >= 0) { e.preventDefault(); this._selectAC(items[this.autocompleteIdx].dataset.path); }
    else if (e.key === 'Escape') { this._hideAC(); }
  };

  App.prototype._updateACSel = function (items) {
    var idx = this.autocompleteIdx;
    items.forEach(function (item, i) { item.classList.toggle('selected', i === idx); });
  };

  App.prototype._selectAC = function (path) {
    if (!this.autocompleteTarget) return;
    var val = this.ruleInput.value;
    this.ruleInput.value = val.substring(0, this.autocompleteTarget.start) + path + val.substring(this.autocompleteTarget.end);
    var np = this.autocompleteTarget.start + path.length;
    this.ruleInput.setSelectionRange(np, np);
    this.ruleInput.focus();
    this._hideAC();
  };

  App.prototype._hideAC = function () {
    this.autocompleteEl.classList.remove('visible');
    this.autocompleteVisible = false;
    this.autocompleteIdx = -1;
  };

  // ─── Import ───

  App.prototype._initImport = function () {
    var self = this;
    document.getElementById('btnImportConvert').addEventListener('click', function () { self._importConvert(); });
    document.getElementById('btnImportFile').addEventListener('click', function () { document.getElementById('fileImport').click(); });
    document.getElementById('fileImport').addEventListener('change', function (e) { self._handleFileImport(e); });
    document.getElementById('btnCopyText').addEventListener('click', function () { self.copyText(); });
    document.getElementById('btnImportClear').addEventListener('click', function () { self.clearImport(); });
    document.getElementById('btnCopyCleanJson').addEventListener('click', function () { self._copyCleanJson(); });
  };

  App.prototype.clearImport = function () {
    this.importInput.value = '';
    this.importOutput.textContent = 'La expresión de texto aparecerá aquí';
    document.getElementById('importError').classList.remove('visible');
    document.getElementById('importSuccess').classList.remove('visible');
    var cleanPanel = document.getElementById('importCleanPanel');
    cleanPanel.style.display = 'none';
    document.getElementById('importCleanOutput').textContent = '';
    this._toast('Importar JSON limpiado', 'info');
  };

  App.prototype._copyCleanJson = function () {
    var text = document.getElementById('importCleanOutput').textContent;
    if (!text) { this._toast('No hay JSON limpio para copiar', 'error'); return; }
    var self = this;
    navigator.clipboard.writeText(text).then(function () {
      self._toast('JSON limpio copiado al portapapeles', 'success');
    }).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      self._toast('JSON limpio copiado al portapapeles', 'success');
    });
  };

  App.prototype.copyText = function () {
    var text = this.importOutput.textContent;
    if (!text || text === 'La expresión de texto aparecerá aquí') {
      this._toast('No hay texto para copiar', 'error'); return;
    }
    var self = this;
    navigator.clipboard.writeText(text).then(function () {
      self._toast('Regla copiada al portapapeles', 'success');
    }).catch(function () {
      var ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      self._toast('Regla copiada al portapapeles', 'success');
    });
  };

  function extractFirstJson(str) {
    var start = str.indexOf('{');
    if (start === -1) return str;
    var depth = 0;
    var inString = false;
    var escape = false;
    for (var i = start; i < str.length; i++) {
      var ch = str[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"' && !escape) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return str.substring(start, i + 1); }
    }
    return str;
  }

  App.prototype._importConvert = function () {
    var raw = this.importInput.value;
    var input = raw.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').trim();
    var errBox = document.getElementById('importError');
    var okBox = document.getElementById('importSuccess');
    var cleanPanel = document.getElementById('importCleanPanel');
    var cleanOutput = document.getElementById('importCleanOutput');
    errBox.classList.remove('visible'); okBox.classList.remove('visible');
    cleanPanel.style.display = 'none';
    cleanOutput.textContent = '';
    if (!input) {
      errBox.querySelector('.error-title').textContent = 'El JSON est\u00e1 vac\u00edo';
      errBox.querySelector('.error-detail').textContent = 'Pega un JSON de regla Dynamo.';
      errBox.classList.add('visible'); return;
    }
    try {
      var json;
      var wasEscaped = false;
      // Detect escaped JSON: contains \" patterns
      if (/\\"/.test(input)) {
        // Remove surrounding quotes if present
        var cleaned = input;
        if ((cleaned[0] === '"' || cleaned[0] === "'") && cleaned[cleaned.length - 1] === cleaned[0]) {
          cleaned = cleaned.substring(1, cleaned.length - 1);
        }
        // Unescape: replace \" with " and \\ with \
        cleaned = cleaned.replace(/\\\\/g, '\\').replace(/\\"/g, '"');
        try {
          json = JSON.parse(cleaned);
          wasEscaped = true;
        } catch (_) {
          json = JSON.parse(extractFirstJson(cleaned));
          wasEscaped = true;
        }
      } else {
        try {
          json = JSON.parse(input);
        } catch (_) {
          json = JSON.parse(extractFirstJson(input));
        }
      }
      // Show clean JSON if input was escaped
      if (wasEscaped) {
        cleanPanel.style.display = '';
        cleanOutput.textContent = JSON.stringify(json, null, 2);
      }
      var text = dynamoJsonToText(json);
      this.importOutput.textContent = text;
      okBox.textContent = 'JSON convertido a texto correctamente';
      okBox.classList.add('visible');
    } catch (err) {
      errBox.querySelector('.error-title').textContent = 'Error al procesar';
      errBox.querySelector('.error-detail').textContent = err.message;
      errBox.classList.add('visible');
    }
  };

  App.prototype._handleFileImport = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var self = this;
    var reader = new FileReader();
    reader.onload = function (ev) { self.importInput.value = ev.target.result; self._toast('Archivo cargado', 'info'); };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ─── History ───

  App.prototype._initHistory = function () {
    var self = this;
    document.getElementById('btnClearHistory').addEventListener('click', function () {
      localStorage.removeItem(HISTORY_KEY);
      self._renderHistory();
      self._toast('Historial limpiado', 'info');
    });
  };

  App.prototype._saveToHistory = function (ruleText, json) {
    var h = this._getHistory();
    h.unshift({ id: Date.now(), ruleText: ruleText, json: json, date: new Date().toISOString() });
    if (h.length > MAX_HISTORY) h.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  };

  App.prototype._getHistory = function () {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; }
  };

  App.prototype._renderHistory = function () {
    var history = this._getHistory();
    var self = this;
    if (history.length === 0) {
      this.historyList.innerHTML = '<div class="history-empty"><div class="empty-icon">&#128196;</div><p>No hay reglas en el historial</p><p class="text-xs text-muted mt-2">Las reglas convertidas se guardar\u00e1n aqu\u00ed autom\u00e1ticamente</p></div>';
      return;
    }
    this.historyList.innerHTML = history.map(function (item) {
      var d = new Date(item.date);
      var ds = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return '<div class="history-item" data-id="' + item.id + '"><div class="history-item-header"><span class="history-item-date">' + ds + '</span><div class="flex gap-2"><button class="btn btn-sm btn-secondary btn-history-use" data-id="' + item.id + '">Usar</button><button class="btn btn-sm btn-danger btn-history-delete" data-id="' + item.id + '">&#10005;</button></div></div><div class="history-item-rule">' + self._escHtml(item.ruleText) + '</div></div>';
    }).join('');

    this.historyList.querySelectorAll('.btn-history-use').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = history.find(function (h) { return h.id === parseInt(btn.dataset.id); });
        if (item) { self.ruleInput.value = item.ruleText; self.tabs[0].click(); self.convert(); }
      });
    });
    this.historyList.querySelectorAll('.btn-history-delete').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var updated = history.filter(function (h) { return h.id !== parseInt(btn.dataset.id); });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        self._renderHistory();
        self._toast('Entrada eliminada', 'info');
      });
    });
  };

  // ─── UI Helpers ───

  App.prototype._showError = function (title, detail, before, highlight, after) {
    this.errorBox.classList.add('visible');
    this.errorBox.querySelector('.error-title').textContent = title;
    this.errorBox.querySelector('.error-detail').textContent = detail || '';
    this.ruleInput.classList.add('error');
    var ind = this.errorBox.querySelector('.error-indicator');
    if (before !== undefined && highlight !== undefined) {
      ind.innerHTML = this._escHtml(before) + '<span class="error-highlight">' + this._escHtml(highlight || ' ') + '</span>' + this._escHtml(after || '');
      ind.style.display = 'block';
    } else { ind.style.display = 'none'; }
  };

  App.prototype._hideError = function () {
    this.errorBox.classList.remove('visible');
    this.ruleInput.classList.remove('error');
  };

  App.prototype._showSuccess = function (msg) {
    this.successBox.textContent = msg;
    this.successBox.classList.add('visible');
  };

  App.prototype._hideSuccess = function () { this.successBox.classList.remove('visible'); };

  App.prototype._toast = function (msg, type) {
    type = type || 'info';
    var t = document.createElement('div');
    t.className = 'toast ' + type;
    var icons = { success: '&#10003;', error: '&#10007;', info: '&#8505;' };
    t.innerHTML = '<span>' + (icons[type] || '') + '</span> ' + this._escHtml(msg);
    this.toastContainer.appendChild(t);
    setTimeout(function () {
      t.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(function () { t.remove(); }, 300);
    }, 3000);
  };

  App.prototype._escHtml = function (s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  };

  // ─── Expose for tests ───
  window.DynamoParser = {
    tokenize: tokenize, TokenType: TokenType, TokenizerError: TokenizerError,
    parseRule: parseRule, ParseError: ParseError, ASTNodeType: ASTNodeType,
    generateDynamoRule: generateDynamoRule,
    dynamoJsonToText: dynamoJsonToText,
    validateDynamoSchema: validateDynamoSchema,
  };

  // ─── Init ───
  document.addEventListener('DOMContentLoaded', function () {
    window.app = new App();
  });

})();
