/**
 * Conversor inverso: JSON Dynamo → expresión de texto plano.
 * Reconstruye la expresión legible a partir de un JSON de regla Dynamo.
 */

const REVERSE_OPERATOR_MAP = {
  eq: '=',
  neq: '!=',
  dist: '!=',
  gt: '>',
  lt: '<',
  contains: 'CONTAINS',
  notContains: 'NOT CONTAINS',
  pattern: 'MATCHES',
};

function formatValue(value, dataType) {
  if (dataType === 'String') return `'${value}'`;
  if (dataType === 'Regex') return `'${value}'`;
  if (dataType === 'Boolean') return value ? 'true' : 'false';
  if (dataType === 'Null') return 'NULL';
  if ((dataType === 'Float' || dataType === 'Double') && Number.isInteger(value)) return value + '.0';
  return String(value);
}

function reverseNode(node) {
  if (!node || !node.value) {
    throw new Error('Nodo inválido: falta la propiedad "value"');
  }

  const inner = node.value;

  if (inner.name === 'and' || inner.name === 'or') {
    return reverseLogical(inner);
  }

  if (REVERSE_OPERATOR_MAP[inner.name] !== undefined) {
    return reverseComparison(inner);
  }

  throw new Error(`Operador desconocido en nodo: "${inner.name}"`);
}

function reverseLogical(inner) {
  const op = inner.name.toUpperCase();
  const leftExpr = reverseNode(inner.value1);
  const rightExpr = reverseNode(inner.value2);

  const leftStr = needsParens(inner.value1, inner.name) ? `(${leftExpr})` : leftExpr;
  const rightStr = needsParens(inner.value2, inner.name) ? `(${rightExpr})` : rightExpr;

  return `${leftStr} ${op} ${rightStr}`;
}

function needsParens(node, parentOp) {
  if (!node || !node.value) return false;
  const childOp = node.value.name;
  if (parentOp === 'and' && childOp === 'or') return true;
  return false;
}

function reverseComparison(inner) {
  const operator = REVERSE_OPERATOR_MAP[inner.name];

  if (!inner.value1 || !inner.value2) {
    throw new Error('Comparación inválida: faltan value1 o value2');
  }

  const field = inner.value1.value1;
  const literal = inner.value2.value1;
  const dataType = inner.value2.value2;

  return `${field} ${operator} ${formatValue(literal, dataType)}`;
}

function collectInValues(node, field, op) {
  if (!node || !node.value) return null;
  const inner = node.value;

  if (REVERSE_OPERATOR_MAP[inner.name] !== undefined) {
    if (inner.value1 && inner.value1.value1 === field && inner.name === op) {
      return [{ value: inner.value2.value1, dataType: inner.value2.value2 }];
    }
    return null;
  }

  if ((inner.name === 'or' && op === 'eq') || (inner.name === 'and' && (op === 'neq' || op === 'dist'))) {
    const leftVals = collectInValues(inner.value1, field, op);
    const rightVals = collectInValues(inner.value2, field, op);
    if (leftVals && rightVals) {
      return [...leftVals, ...rightVals];
    }
  }

  return null;
}

function tryCollapseToIn(node) {
  if (!node || !node.value) return null;
  const inner = node.value;

  if (inner.name !== 'or' && inner.name !== 'and') return null;

  const firstLeaf = findFirstComparison(node);
  if (!firstLeaf) return null;

  const field = firstLeaf.value1.value1;
  const op = firstLeaf.name;

  if (op !== 'eq' && op !== 'neq' && op !== 'dist') return null;

  const values = collectInValues(node, field, op);
  if (!values || values.length < 2) return null;

  const keyword = op === 'eq' ? 'IN' : 'NOT IN';
  const formattedValues = values.map(v => formatValue(v.value, v.dataType)).join(', ');
  return `${field} ${keyword} (${formattedValues})`;
}

function findFirstComparison(node) {
  if (!node || !node.value) return null;
  const inner = node.value;
  if (REVERSE_OPERATOR_MAP[inner.name] !== undefined) return inner;
  if (inner.name === 'and' || inner.name === 'or') {
    return findFirstComparison(inner.value1);
  }
  return null;
}

function dynamoJsonToText(json, collapseIn = true) {
  if (typeof json === 'string') {
    json = JSON.parse(json);
  }

  if (!json || !json.value) {
    throw new Error('JSON de regla inválido: falta la propiedad raíz "value"');
  }

  const rootNode = { value: json.value };

  if (collapseIn) {
    const collapsed = tryCollapseToIn(rootNode);
    if (collapsed) return collapsed;
  }

  return reverseNode(rootNode);
}

export { dynamoJsonToText };
