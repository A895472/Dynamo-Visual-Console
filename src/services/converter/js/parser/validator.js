/**
 * Validador de esquema JSON para reglas Dynamo.
 * Verifica que un JSON cumple con la estructura esperada por el motor.
 */

const VALID_OPERATORS = ['eq', 'neq', 'dist', 'gt', 'lt', 'contains', 'notContains', 'pattern', 'and', 'or'];
const VALID_DATA_TYPES = ['String', 'Int', 'Double', 'Float', 'Boolean', 'Null', 'Regex'];

function validateDynamoSchema(json, path = 'root') {
  const errors = [];

  if (typeof json === 'string') {
    try {
      json = JSON.parse(json);
    } catch (e) {
      return [{ path, message: 'JSON inválido: no se pudo parsear' }];
    }
  }

  if (!json || typeof json !== 'object') {
    return [{ path, message: 'Se esperaba un objeto' }];
  }

  if (!json.name && json.name !== '') {
    errors.push({ path: `${path}.name`, message: 'Falta la propiedad "name"' });
  }

  if (!json.value && json.value !== 0) {
    errors.push({ path: `${path}.value`, message: 'Falta la propiedad "value"' });
    return errors;
  }

  const inner = json.value;

  if (typeof inner !== 'object') {
    errors.push({ path: `${path}.value`, message: 'La propiedad "value" debe ser un objeto' });
    return errors;
  }

  if (!inner.name) {
    errors.push({ path: `${path}.value.name`, message: 'Falta el nombre del operador' });
    return errors;
  }

  if (inner.name === 'field' || inner.name === 'lit') {
    return validateLeafNode(inner, `${path}.value`);
  }

  if (!VALID_OPERATORS.includes(inner.name)) {
    errors.push({
      path: `${path}.value.name`,
      message: `Operador desconocido: "${inner.name}". Válidos: ${VALID_OPERATORS.join(', ')}`,
    });
  }

  if (inner.name === 'and' || inner.name === 'or') {
    if (!inner.value1) {
      errors.push({ path: `${path}.value.value1`, message: 'Falta el operando izquierdo (value1)' });
    } else {
      errors.push(...validateDynamoSchema(inner.value1, `${path}.value.value1`));
    }
    if (!inner.value2) {
      errors.push({ path: `${path}.value.value2`, message: 'Falta el operando derecho (value2)' });
    } else {
      errors.push(...validateDynamoSchema(inner.value2, `${path}.value.value2`));
    }
  } else {
    if (!inner.value1) {
      errors.push({ path: `${path}.value.value1`, message: 'Falta el campo (value1)' });
    } else {
      errors.push(...validateFieldNode(inner.value1, `${path}.value.value1`));
    }
    if (!inner.value2) {
      errors.push({ path: `${path}.value.value2`, message: 'Falta el literal (value2)' });
    } else {
      errors.push(...validateLitNode(inner.value2, `${path}.value.value2`));
    }
  }

  return errors;
}

function validateLeafNode(node, path) {
  const errors = [];
  if (node.value1 === undefined) {
    errors.push({ path: `${path}.value1`, message: 'Falta value1' });
  }
  if (node.value2 === undefined) {
    errors.push({ path: `${path}.value2`, message: 'Falta value2 (tipo de dato)' });
  } else if (!VALID_DATA_TYPES.includes(node.value2)) {
    errors.push({
      path: `${path}.value2`,
      message: `Tipo de dato inválido: "${node.value2}". Válidos: ${VALID_DATA_TYPES.join(', ')}`,
    });
  }
  return errors;
}

function validateFieldNode(node, path) {
  const errors = [];
  if (node.name !== 'field') {
    errors.push({ path: `${path}.name`, message: `Se esperaba "field" pero se encontró "${node.name}"` });
  }
  if (!node.value1 || typeof node.value1 !== 'string') {
    errors.push({ path: `${path}.value1`, message: 'Falta la ruta del campo o no es una cadena' });
  }
  if (!node.value2 || !VALID_DATA_TYPES.includes(node.value2)) {
    errors.push({
      path: `${path}.value2`,
      message: `Tipo de dato del campo inválido: "${node.value2}"`,
    });
  }
  return errors;
}

function validateLitNode(node, path) {
  const errors = [];
  if (node.name !== 'lit' && node.name !== 'field') {
    errors.push({ path: `${path}.name`, message: `Se esperaba "lit" o "field" pero se encontró "${node.name}"` });
  }
  if (node.value1 === undefined) {
    errors.push({ path: `${path}.value1`, message: 'Falta el valor del literal' });
  }
  if (!node.value2 || !VALID_DATA_TYPES.includes(node.value2)) {
    errors.push({
      path: `${path}.value2`,
      message: `Tipo de dato del literal inválido: "${node.value2}"`,
    });
  }
  return errors;
}

export { validateDynamoSchema };
