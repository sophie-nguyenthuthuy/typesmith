// Emit TypeScript interfaces.
import { isNullable, nonNull } from '../ir.js';
import { collectObjects } from '../names.js';

const RE_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export default {
  id: 'typescript',
  label: 'TypeScript',
  language: 'typescript',
  emit(ir, { rootName = 'Root' } = {}) {
    const { ordered, nameOf } = collectObjects(ir, rootName);

    const tsType = (t, parenUnion = false) => {
      const nullable = isNullable(t);
      const core = nonNull(t);
      let base = tsCore(core);
      if (nullable) base = `${base} | null`;
      if (parenUnion && base.includes(' | ')) base = `(${base})`;
      return base;
    };

    const tsCore = (t) => {
      switch (t.kind) {
        case 'string': {
          if (t.format === 'date' || t.format === 'datetime') return 'string'; // ISO 8601
          return 'string';
        }
        case 'int': case 'float': return 'number';
        case 'bool': return 'boolean';
        case 'unknown': case 'null': return 'unknown';
        case 'array': return `${tsType(t.items, true)}[]`;
        case 'object': return nameOf.get(t);
        case 'union': return t.variants.map((v) => tsCore(v)).join(' | ');
        default: return 'unknown';
      }
    };

    const blocks = ordered.map(({ name, node }) => {
      const lines = [`export interface ${name} {`];
      for (const f of node.fields) {
        const key = RE_IDENT.test(f.name) ? f.name : JSON.stringify(f.name);
        const opt = f.optional ? '?' : '';
        const comment = formatComment(f.type);
        lines.push(`  ${key}${opt}: ${tsType(f.type)};${comment}`);
      }
      lines.push('}');
      return lines.join('\n');
    });

    return `${blocks.join('\n\n')}\n`;
  },
};

function formatComment(t) {
  const core = nonNull(t);
  if (core.kind === 'string' && core.format === 'date') return ' // ISO date (YYYY-MM-DD)';
  if (core.kind === 'string' && core.format === 'datetime') return ' // ISO 8601 datetime';
  if (core.kind === 'string' && core.format === 'uuid') return ' // UUID';
  if (core.kind === 'string' && core.format === 'email') return ' // email';
  return '';
}
