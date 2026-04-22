/**
 * Tests unitarios del parser de reglas Dynamo.
 * Usa window.DynamoParser expuesto por bundle.js
 */

(function () {
  var P = window.DynamoParser;
  var tokenize = P.tokenize;
  var TokenType = P.TokenType;
  var TokenizerError = P.TokenizerError;
  var parseRule = P.parseRule;
  var ParseError = P.ParseError;
  var generateDynamoRule = P.generateDynamoRule;
  var dynamoJsonToText = P.dynamoJsonToText;
  var validateDynamoSchema = P.validateDynamoSchema;

  var totalPassed = 0;
  var totalFailed = 0;
  var resultsEl = document.getElementById('results');

  function suite(name) {
    var div = document.createElement('div');
    div.className = 'suite';
    div.innerHTML = '<div class="suite-title">' + name + '</div>';
    resultsEl.appendChild(div);
    return div;
  }

  function test(suiteEl, description, fn) {
    var el = document.createElement('div');
    el.className = 'test';
    try {
      fn();
      el.innerHTML = '<span class="icon-pass"></span> <span class="pass">' + description + '</span>';
      totalPassed++;
    } catch (err) {
      el.innerHTML = '<span class="icon-fail"></span> <span class="fail">' + description + '</span>';
      totalFailed++;
      var detail = document.createElement('div');
      detail.className = 'error-detail';
      detail.textContent = err.message;
      suiteEl.appendChild(el);
      suiteEl.appendChild(detail);
      return;
    }
    suiteEl.appendChild(el);
  }

  function assertEqual(actual, expected, msg) {
    var a = JSON.stringify(actual);
    var b = JSON.stringify(expected);
    if (a !== b) throw new Error((msg || '') + ' Se esperaba ' + b + ' pero se obtuvo ' + a);
  }

  function assertThrows(fn, errorClass, msg) {
    try {
      fn();
      throw new Error((msg || '') + ' Se esperaba que lanzara ' + (errorClass ? errorClass.name : 'un error'));
    } catch (err) {
      if (errorClass && !(err instanceof errorClass)) {
        throw new Error((msg || '') + ' Se esperaba ' + errorClass.name + ' pero se obtuvo ' + err.constructor.name + ': ' + err.message);
      }
    }
  }

  // ═══════════════════════════════════════
  // TOKENIZER
  // ═══════════════════════════════════════

  var t1 = suite('Tokenizer - Tokens b\u00e1sicos');

  test(t1, 'Tokeniza un campo simple', function () {
    var tokens = tokenize('payload.campo');
    assertEqual(tokens[0].type, TokenType.FIELD);
    assertEqual(tokens[0].value, 'payload.campo');
  });

  test(t1, 'Tokeniza n\u00fameros enteros', function () {
    var tokens = tokenize('42');
    assertEqual(tokens[0].type, TokenType.NUMBER);
    assertEqual(tokens[0].value, 42);
  });

  test(t1, 'Tokeniza n\u00fameros decimales', function () {
    var tokens = tokenize('3.14');
    assertEqual(tokens[0].type, TokenType.NUMBER);
    assertEqual(tokens[0].value, 3.14);
  });

  test(t1, 'Tokeniza cadenas con comillas simples', function () {
    var tokens = tokenize("'hello'");
    assertEqual(tokens[0].type, TokenType.STRING);
    assertEqual(tokens[0].value, 'hello');
  });

  test(t1, 'Tokeniza cadenas con comillas dobles', function () {
    var tokens = tokenize('"world"');
    assertEqual(tokens[0].type, TokenType.STRING);
    assertEqual(tokens[0].value, 'world');
  });

  test(t1, 'Tokeniza booleanos', function () {
    var t = tokenize('true');
    var f = tokenize('false');
    assertEqual(t[0].type, TokenType.BOOLEAN);
    assertEqual(t[0].value, true);
    assertEqual(f[0].type, TokenType.BOOLEAN);
    assertEqual(f[0].value, false);
  });

  var t2 = suite('Tokenizer - Operadores');

  test(t2, 'Tokeniza operador =', function () {
    var tokens = tokenize('campo = 1');
    assertEqual(tokens[1].type, TokenType.OPERATOR);
    assertEqual(tokens[1].value, '=');
  });

  test(t2, 'Tokeniza operador !=', function () {
    var tokens = tokenize('campo != 1');
    assertEqual(tokens[1].type, TokenType.OPERATOR);
    assertEqual(tokens[1].value, '!=');
  });

  test(t2, 'Tokeniza operadores >= y <=', function () {
    var gte = tokenize('campo >= 1');
    var lte = tokenize('campo <= 1');
    assertEqual(gte[1].value, '>=');
    assertEqual(lte[1].value, '<=');
  });

  test(t2, 'Tokeniza IN y NOT IN', function () {
    var inT = tokenize("campo IN ('a')");
    assertEqual(inT[1].type, TokenType.IN);
    var notInT = tokenize("campo NOT IN ('a')");
    assertEqual(notInT[1].type, TokenType.NOT_IN);
  });

  test(t2, 'Tokeniza CONTAINS y NOT CONTAINS', function () {
    var c = tokenize("campo CONTAINS 'x'");
    assertEqual(c[1].type, TokenType.CONTAINS);
    var nc = tokenize("campo NOT CONTAINS 'x'");
    assertEqual(nc[1].type, TokenType.NOT_CONTAINS);
  });

  test(t2, 'Tokeniza AND y OR', function () {
    var tokens = tokenize('a = 1 AND b = 2 OR c = 3');
    assertEqual(tokens[3].type, TokenType.LOGICAL);
    assertEqual(tokens[3].value, 'AND');
    assertEqual(tokens[7].type, TokenType.LOGICAL);
    assertEqual(tokens[7].value, 'OR');
  });

  var t3 = suite('Tokenizer - Errores');

  test(t3, 'Error en cadena sin cerrar', function () {
    assertThrows(function () { tokenize("'sin cerrar"); }, TokenizerError);
  });

  test(t3, 'Error en car\u00e1cter inesperado', function () {
    assertThrows(function () { tokenize('campo @ valor'); }, TokenizerError);
  });

  // ═══════════════════════════════════════
  // PARSER
  // ═══════════════════════════════════════

  var p1 = suite('Parser - Comparaciones simples');

  test(p1, 'Parsea igualdad con entero', function () {
    var ast = parseRule('payload.campo = 1');
    assertEqual(ast.type, 'COMPARISON');
    assertEqual(ast.field, 'payload.campo');
    assertEqual(ast.operator, 'EQUALS');
    assertEqual(ast.value.value, 1);
    assertEqual(ast.value.dataType, 'Int');
  });

  test(p1, 'Parsea igualdad con string', function () {
    var ast = parseRule("payload.nombre = 'test'");
    assertEqual(ast.operator, 'EQUALS');
    assertEqual(ast.value.value, 'test');
    assertEqual(ast.value.dataType, 'String');
  });

  test(p1, 'Parsea desigualdad', function () {
    var ast = parseRule('payload.campo != 5');
    assertEqual(ast.operator, 'NOT_EQUALS');
  });

  test(p1, 'Parsea mayor que', function () {
    var ast = parseRule('payload.peso > 10.5');
    assertEqual(ast.operator, 'GREATER_THAN');
    assertEqual(ast.value.value, 10.5);
    assertEqual(ast.value.dataType, 'Double');
  });

  test(p1, 'Parsea CONTAINS', function () {
    var ast = parseRule("payload.nombre CONTAINS 'test'");
    assertEqual(ast.operator, 'CONTAINS');
  });

  var p2 = suite('Parser - IN / NOT IN');

  test(p2, 'Parsea IN con un valor', function () {
    var ast = parseRule("campo IN ('A')");
    assertEqual(ast.operator, 'IN');
    assertEqual(ast.value.length, 1);
    assertEqual(ast.value[0].value, 'A');
  });

  test(p2, 'Parsea IN con m\u00faltiples valores', function () {
    var ast = parseRule("campo IN ('A', 'B', 'C')");
    assertEqual(ast.operator, 'IN');
    assertEqual(ast.value.length, 3);
  });

  test(p2, 'Parsea NOT IN', function () {
    var ast = parseRule("campo NOT IN (1, 2, 3)");
    assertEqual(ast.operator, 'NOT_IN');
    assertEqual(ast.value.length, 3);
    assertEqual(ast.value[0].dataType, 'Int');
  });

  var p3 = suite('Parser - Operadores l\u00f3gicos');

  test(p3, 'Parsea AND', function () {
    var ast = parseRule('a = 1 AND b = 2');
    assertEqual(ast.type, 'LOGICAL');
    assertEqual(ast.operator, 'AND');
    assertEqual(ast.left.type, 'COMPARISON');
    assertEqual(ast.right.type, 'COMPARISON');
  });

  test(p3, 'Parsea OR', function () {
    var ast = parseRule("a = 'x' OR b = 'y'");
    assertEqual(ast.operator, 'OR');
  });

  test(p3, 'Parsea AND con m\u00faltiples condiciones (asociatividad derecha)', function () {
    var ast = parseRule('a = 1 AND b = 2 AND c = 3');
    assertEqual(ast.type, 'LOGICAL');
    assertEqual(ast.operator, 'AND');
    assertEqual(ast.left.type, 'COMPARISON');
    assertEqual(ast.right.type, 'LOGICAL');
    assertEqual(ast.right.left.type, 'COMPARISON');
    assertEqual(ast.right.right.type, 'COMPARISON');
  });

  test(p3, 'Parsea par\u00e9ntesis que cambian la precedencia', function () {
    var ast = parseRule('a = 1 AND (b = 2 OR c = 3)');
    assertEqual(ast.operator, 'AND');
    assertEqual(ast.right.operator, 'OR');
  });

  var p4 = suite('Parser - Expresiones complejas');

  test(p4, 'Parsea el ejemplo completo del enunciado', function () {
    var input = "payload.mensaje.envio.codaplicacion = 1 AND payload.mensaje.envio.eventosenvio.evento.codevento IN ('AA','BA') AND payload.mensaje.envio.datosservicio.tipoprod.codupu IN ('PEXOF','PQELE')";
    var ast = parseRule(input);
    assertEqual(ast.type, 'LOGICAL');
    assertEqual(ast.operator, 'AND');
  });

  test(p4, 'Parsea mezcla de AND y OR con par\u00e9ntesis', function () {
    var ast = parseRule("(a = 1 OR b = 2) AND (c = 3 OR d = 4)");
    assertEqual(ast.operator, 'AND');
    assertEqual(ast.left.operator, 'OR');
    assertEqual(ast.right.operator, 'OR');
  });

  var p5 = suite('Parser - Errores');

  test(p5, 'Error en expresi\u00f3n vac\u00eda', function () {
    assertThrows(function () { parseRule(''); }, ParseError);
  });

  test(p5, 'Error en operador sin campo', function () {
    assertThrows(function () { parseRule('= 5'); }, ParseError);
  });

  test(p5, 'Error en par\u00e9ntesis sin cerrar', function () {
    assertThrows(function () { parseRule('(a = 1'); }, ParseError);
  });

  test(p5, 'Error en campo sin operador', function () {
    assertThrows(function () { parseRule('payload.campo'); }, ParseError);
  });

  // ═══════════════════════════════════════
  // GENERATOR
  // ═══════════════════════════════════════

  var g1 = suite('Generador Dynamo - Comparaciones');

  test(g1, 'Genera JSON para igualdad con entero', function () {
    var ast = parseRule('payload.campo = 1');
    var json = generateDynamoRule(ast);
    assertEqual(json.value.name, 'eq');
    assertEqual(json.value.value1.name, 'field');
    assertEqual(json.value.value1.value1, 'payload.campo');
    assertEqual(json.value.value1.value2, 'Int');
    assertEqual(json.value.value2.name, 'lit');
    assertEqual(json.value.value2.value1, 1);
  });

  test(g1, 'Genera JSON para igualdad con string', function () {
    var ast = parseRule("payload.nombre = 'test'");
    var json = generateDynamoRule(ast);
    assertEqual(json.value.value2.value1, 'test');
    assertEqual(json.value.value2.value2, 'String');
  });

  test(g1, 'Genera JSON para operador >=', function () {
    var ast = parseRule('payload.peso >= 10');
    var json = generateDynamoRule(ast);
    assertEqual(json.value.name, 'gte');
  });

  var g2 = suite('Generador Dynamo - IN / NOT IN');

  test(g2, 'IN con 2 valores genera estructura OR', function () {
    var ast = parseRule("campo IN ('A', 'B')");
    var json = generateDynamoRule(ast);
    assertEqual(json.value.name, 'or');
    assertEqual(json.value.value1.value.name, 'eq');
    assertEqual(json.value.value2.value.name, 'eq');
  });

  test(g2, 'IN con 1 valor genera igualdad directa', function () {
    var ast = parseRule("campo IN ('A')");
    var json = generateDynamoRule(ast);
    assertEqual(json.value.name, 'eq');
  });

  var g3 = suite('Generador Dynamo - Operadores l\u00f3gicos');

  test(g3, 'Genera AND correctamente', function () {
    var ast = parseRule('a = 1 AND b = 2');
    var json = generateDynamoRule(ast);
    assertEqual(json.value.name, 'and');
  });

  test(g3, 'Genera estructura completa del ejemplo del enunciado', function () {
    var input = "payload.mensaje.envio.codaplicacion = 1 AND payload.mensaje.envio.eventosenvio.evento.codevento IN ('AA','BA') AND payload.mensaje.envio.datosservicio.tipoprod.codupu IN ('PEXOF','PQELE')";
    var ast = parseRule(input);
    var json = generateDynamoRule(ast);
    assertEqual(json.value.name, 'and');
    assertEqual(json.value.value1.value.name, 'eq');
    assertEqual(json.value.value1.value.value1.value1, 'payload.mensaje.envio.codaplicacion');
    assertEqual(json.value.value2.value.name, 'and');
  });

  var g4 = suite('Generador Dynamo - Sin metadatos');

  test(g4, 'No incluye _metadata en la salida', function () {
    var ast = parseRule('campo = 1');
    var json = generateDynamoRule(ast);
    assertEqual(json._metadata, undefined);
    assertEqual(json.name !== undefined, true);
    assertEqual(json.value !== undefined, true);
  });

  // ═══════════════════════════════════════
  // REVERSER
  // ═══════════════════════════════════════

  var r1 = suite('Conversor Inverso - JSON a Texto');

  test(r1, 'Convierte comparaci\u00f3n simple', function () {
    var ast = parseRule('payload.campo = 1');
    var json = generateDynamoRule(ast);
    var text = dynamoJsonToText(json);
    assertEqual(text, 'payload.campo = 1');
  });

  test(r1, 'Convierte comparaci\u00f3n con string', function () {
    var ast = parseRule("payload.nombre = 'test'");
    var json = generateDynamoRule(ast);
    var text = dynamoJsonToText(json);
    assertEqual(text, "payload.nombre = 'test'");
  });

  test(r1, 'Convierte AND simple', function () {
    var ast = parseRule('a = 1 AND b = 2');
    var json = generateDynamoRule(ast);
    var text = dynamoJsonToText(json);
    assertEqual(text, 'a = 1 AND b = 2');
  });

  test(r1, 'Colapsa OR de igualdades a IN', function () {
    var ast = parseRule("campo IN ('A', 'B')");
    var json = generateDynamoRule(ast);
    var text = dynamoJsonToText(json);
    assertEqual(text, "campo IN ('A', 'B')");
  });

  test(r1, 'Colapsa IN dentro de expresi\u00f3n compleja', function () {
    var ast = parseRule("a IN (1, 2, 3) OR (b = 4 AND c IN ('X', 'Y'))");
    var json = generateDynamoRule(ast);
    var text = dynamoJsonToText(json);
    assertEqual(text, "a IN (1, 2, 3) OR (b = 4 AND c IN ('X', 'Y'))");
  });

  // ═══════════════════════════════════════
  // VALIDATOR
  // ═══════════════════════════════════════

  var v1 = suite('Validador de Esquema');

  test(v1, 'Valida JSON correcto sin errores', function () {
    var ast = parseRule('campo = 1');
    var json = generateDynamoRule(ast);
    var errors = validateDynamoSchema(json);
    assertEqual(errors.length, 0);
  });

  test(v1, 'Detecta JSON sin propiedad name', function () {
    var errors = validateDynamoSchema({ value: { name: 'eq' } });
    var has = errors.some(function (e) { return e.path.indexOf('name') !== -1; });
    assertEqual(has, true);
  });

  test(v1, 'Detecta JSON sin propiedad value', function () {
    var errors = validateDynamoSchema({ name: 'test' });
    var has = errors.some(function (e) { return e.path.indexOf('value') !== -1; });
    assertEqual(has, true);
  });

  test(v1, 'Valida estructura compleja sin errores', function () {
    var input = "payload.mensaje.envio.codaplicacion = 1 AND payload.mensaje.envio.eventosenvio.evento.codevento IN ('AA','BA')";
    var ast = parseRule(input);
    var json = generateDynamoRule(ast);
    var errors = validateDynamoSchema(json);
    assertEqual(errors.length, 0);
  });

  // ═══════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════

  var summaryEl = document.getElementById('summary');
  var total = totalPassed + totalFailed;
  summaryEl.className = 'summary ' + (totalFailed === 0 ? 'all-pass' : 'has-fail');
  summaryEl.innerHTML = '<strong>' + totalPassed + '/' + total + ' tests pasaron</strong>' +
    (totalFailed > 0 ? ' — ' + totalFailed + ' fallaron' : ' — Todos los tests pasaron correctamente');

})();
