/**
 * Generador de JSON Dynamo a partir de un AST de reglas.
 * Transforma el árbol de sintaxis abstracta en la estructura JSON
 * específica del motor de reglas Dynamo.
 */

import { ASTNodeType } from './parser.js';

const OPERATOR_MAP = {
  EQUALS: 'eq',
  NOT_EQUALS: 'dist',
  GREATER_THAN: 'gt',
  LESS_THAN: 'lt',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'notContains',
  MATCHES: 'pattern',
};

const OPERATOR_SYMBOL = {
  EQUALS: '=',
  NOT_EQUALS: '!=',
  GREATER_THAN: '>',
  LESS_THAN: '<',
  CONTAINS: 'CONTAINS',
  NOT_CONTAINS: 'NOT CONTAINS',
  MATCHES: 'MATCHES',
};

function getFieldAlias(fieldPath) {
  const parts = fieldPath.split('.');
  const lastPart = parts[parts.length - 1];
  return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
}

function formatLiteralValue(val) {
  if (typeof val === 'string') return `'${val}'`;
  return String(val);
}

function generateComparisonName(field, operator, value) {
  const alias = getFieldAlias(field);
  const symbol = OPERATOR_SYMBOL[operator] || operator;

  if (Array.isArray(value)) {
    const vals = value.map(v => formatLiteralValue(v.value)).join(', ');
    return `${alias} ${symbol} (${vals})`;
  }

  if (value.isFieldReference) {
    return `${alias} ${symbol} ${value.value}`;
  }
  return `${alias} ${symbol} ${formatLiteralValue(value.value)}`;
}

function generateComparisonNode(node) {
  const { field, operator, value } = node;

  if (operator === 'IN' || operator === 'NOT_IN') {
    return generateInNode(node);
  }

  const dynOp = OPERATOR_MAP[operator] || operator.toLowerCase();
  const alias = getFieldAlias(field);
  const name = generateComparisonName(field, operator, value);
  const fieldType = value.dataType === 'Regex' ? 'String' : value.dataType;

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
        name: value.isFieldReference ? 'field' : 'lit',
        value1: value.value,
        value2: value.dataType,
      },
    },
  };
}

function generateInNode(node) {
  const { field, operator, value: values } = node;

  if (values.length === 1) {
    const singleOp = operator === 'IN' ? 'EQUALS' : 'NOT_EQUALS';
    return generateComparisonNode({
      type: ASTNodeType.COMPARISON,
      field,
      operator: singleOp,
      value: values[0],
    });
  }

  const logicalOp = operator === 'IN' ? 'or' : 'and';
  const compOp = operator === 'IN' ? 'EQUALS' : 'NOT_EQUALS';

  function buildTree(items, idx) {
    if (idx === items.length - 1) {
      return generateComparisonNode({
        type: ASTNodeType.COMPARISON,
        field,
        operator: compOp,
        value: items[idx],
      });
    }

    const left = generateComparisonNode({
      type: ASTNodeType.COMPARISON,
      field,
      operator: compOp,
      value: items[idx],
    });

    const right = idx === items.length - 2
      ? generateComparisonNode({
        type: ASTNodeType.COMPARISON,
        field,
        operator: compOp,
        value: items[idx + 1],
      })
      : buildTree(items, idx + 1);

    const alias = getFieldAlias(field);
    const leftName = `${alias} = ${formatLiteralValue(items[idx].value)}`;
    const rightNames = items.slice(idx + 1).map(v =>
      `${alias} = ${formatLiteralValue(v.value)}`
    );
    const groupName = `(${[leftName, ...rightNames].join(` ${logicalOp === 'or' ? 'OR' : 'AND'} `)})`;

    if (idx === 0) {
      return {
        name: groupName,
        value: {
          name: logicalOp,
          value1: left,
          value2: right,
        },
      };
    }

    return {
      name: groupName,
      value: {
        name: logicalOp,
        value1: left,
        value2: right,
      },
    };
  }

  return buildTree(values, 0);
}

function generateLogicalNode(node) {
  const { operator, left, right } = node;
  const dynOp = operator.toLowerCase();
  const leftResult = generateDynamo(left);
  const rightResult = generateDynamo(right);

  const name = `(${leftResult.name}) ${operator} (${rightResult.name})`;

  return {
    name,
    value: {
      name: dynOp,
      value1: leftResult,
      value2: rightResult,
    },
  };
}

function generateDynamo(ast) {
  if (!ast) throw new Error('AST vacío');

  switch (ast.type) {
    case ASTNodeType.COMPARISON:
      return generateComparisonNode(ast);
    case ASTNodeType.LOGICAL:
      return generateLogicalNode(ast);
    default:
      throw new Error(`Tipo de nodo desconocido: ${ast.type}`);
  }
}

function generateDynamoRule(ast, metadata = {}) {
  const ruleBody = generateDynamo(ast);

  const result = {
    name: ruleBody.name,
    value: ruleBody.value,
  };

  if (metadata.ruleName || metadata.description || metadata.environment || metadata.version) {
    result._metadata = {};
    if (metadata.ruleName) result._metadata.ruleName = metadata.ruleName;
    if (metadata.description) result._metadata.description = metadata.description;
    if (metadata.environment) result._metadata.environment = metadata.environment;
    if (metadata.version) result._metadata.version = metadata.version;
    if (metadata.active !== undefined) result._metadata.active = metadata.active;
  }

  return result;
}

export { generateDynamoRule, generateDynamo };
