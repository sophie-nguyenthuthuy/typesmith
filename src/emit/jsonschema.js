// Emit a JSON Schema (draft 2020-12) with inline nested schemas.
import { isNullable, nonNull } from '../ir.js';

export default {
  id: 'jsonschema',
  label: 'JSON Schema',
  language: 'json',
  emit(ir, { rootName = 'Root', isCollection = false } = {}) {
    const rootSchema = schemaFor(ir);
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: rootName,
      ...(isCollection ? { type: 'array', items: rootSchema } : rootSchema),
    };
    return `${JSON.stringify(schema, null, 2)}\n`;
  },
};

function schemaFor(t) {
  const nullable = isNullable(t);
  const core = nonNull(t);
  const s = coreSchema(core);
  if (!nullable) return s;
  if (typeof s.type === 'string' && !s.properties && !s.items && !s.anyOf) {
    return { ...s, type: [s.type, 'null'] };
  }
  return { anyOf: [s, { type: 'null' }] };
}

function coreSchema(t) {
  switch (t.kind) {
    case 'string': {
      const format = { date: 'date', datetime: 'date-time', uuid: 'uuid', email: 'email' }[t.format];
      return format ? { type: 'string', format } : { type: 'string' };
    }
    case 'int': return { type: 'integer' };
    case 'float': return { type: 'number' };
    case 'bool': return { type: 'boolean' };
    case 'null': return { type: 'null' };
    case 'unknown': return {};
    case 'array': return { type: 'array', items: schemaFor(t.items) };
    case 'object': {
      const properties = {};
      const required = [];
      for (const f of t.fields) {
        properties[f.name] = schemaFor(f.type);
        if (!f.optional) required.push(f.name);
      }
      const out = { type: 'object', properties };
      if (required.length) out.required = required;
      out.additionalProperties = false;
      return out;
    }
    case 'union': return { anyOf: t.variants.map((v) => coreSchema(v)) };
    default: return {};
  }
}
