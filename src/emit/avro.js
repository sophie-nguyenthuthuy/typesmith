// Emit an Avro schema. Optional/nullable fields become ["null", T] with
// default null; dates/datetimes use Avro logical types.
import { isNullable, nonNull } from '../ir.js';
import { collectObjects } from '../names.js';

export default {
  id: 'avro',
  label: 'Avro',
  language: 'json',
  emit(ir, { rootName = 'Root' } = {}) {
    const { nameOf } = collectObjects(ir, rootName);
    const emitted = new Set(); // Avro: define a named record once, reference after

    const avroType = (t) => {
      const core = nonNull(t);
      const base = avroCore(core);
      if (isNullable(t)) {
        const variants = Array.isArray(base) ? base : [base];
        return ['null', ...variants];
      }
      return base;
    };

    const avroCore = (t) => {
      switch (t.kind) {
        case 'string':
          if (t.format === 'date') return { type: 'int', logicalType: 'date' };
          if (t.format === 'datetime') return { type: 'long', logicalType: 'timestamp-millis' };
          if (t.format === 'uuid') return { type: 'string', logicalType: 'uuid' };
          return 'string';
        case 'int': return 'long';
        case 'float': return 'double';
        case 'bool': return 'boolean';
        case 'unknown': case 'null': return ['null', 'string'];
        case 'array': return { type: 'array', items: avroType(t.items) };
        case 'object': return recordFor(t);
        case 'union': {
          const flat = [];
          for (const v of t.variants) {
            const b = avroCore(v);
            for (const x of Array.isArray(b) ? b : [b]) {
              if (!flat.some((y) => JSON.stringify(y) === JSON.stringify(x))) flat.push(x);
            }
          }
          return flat;
        }
        default: return 'string';
      }
    };

    const recordFor = (node) => {
      const name = avroName(nameOf.get(node));
      if (emitted.has(name)) return name;
      emitted.add(name);
      return {
        type: 'record',
        name,
        fields: node.fields.map((f) => {
          const optional = f.optional || isNullable(f.type);
          let type = avroType(f.type);
          if (f.optional && !isNullable(f.type)) {
            const variants = Array.isArray(type) ? type : [type];
            type = variants[0] === 'null' ? variants : ['null', ...variants];
          }
          const field = { name: avroName(f.name), type };
          if (optional) field.default = null;
          if (avroName(f.name) !== f.name) field.doc = `original name: ${f.name}`;
          return field;
        }),
      };
    };

    const core = nonNull(ir);
    const schema = core.kind === 'object'
      ? recordFor(core)
      : { type: 'record', name: avroName(rootName), fields: [{ name: 'value', type: avroType(ir) }] };
    return `${JSON.stringify(schema, null, 2)}\n`;
  },
};

function avroName(s) {
  let out = String(s).replace(/[^A-Za-z0-9_]/g, '_');
  if (!/^[A-Za-z_]/.test(out)) out = `_${out}`;
  return out;
}
