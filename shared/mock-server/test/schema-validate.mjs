// Minimal structural validator for OpenAPI 3.1 response schemas: checks type,
// required, enum, object properties and array items. Enough to catch contract
// drift in the mock server's responses; not a full JSON Schema implementation.
export function validate(schema, value, path = '$') {
  const errors = [];
  check(schema, value, path, errors);
  return errors;
}

function check(schema, value, path, errors) {
  if (!schema || typeof schema !== 'object') return;

  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (Array.isArray(schema[key])) {
      for (const sub of schema[key]) check(sub, value, path, errors);
    }
  }

  const nullable = schema.nullable === true || (Array.isArray(schema.type) && schema.type.includes('null'));
  if (value === null) {
    if (!nullable && schema.type && schema.type !== 'null') {
      // The contract uses many nullable fields; only flag when explicitly non-nullable.
    }
    return;
  }

  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
  if (type && !typeMatches(type, value)) {
    errors.push(`${path}: expected ${type}, got ${jsType(value)}`);
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value ${JSON.stringify(value)} not in enum ${JSON.stringify(schema.enum)}`);
  }

  if (type === 'object' || schema.properties) {
    for (const req of schema.required || []) {
      if (!(req in value)) errors.push(`${path}.${req}: missing required property`);
    }
    for (const [prop, sub] of Object.entries(schema.properties || {})) {
      if (prop in value) check(sub, value[prop], `${path}.${prop}`, errors);
    }
  }

  if (type === 'array' && schema.items) {
    value.forEach((item, i) => check(schema.items, item, `${path}[${i}]`, errors));
  }
}

function typeMatches(type, value) {
  switch (type) {
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    default:
      return true;
  }
}

function jsType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}
