// Emit Go structs with JSON tags. Optional/nullable fields become pointers.
import { isNullable, nonNull } from '../ir.js';
import { collectObjects, pascalCase } from '../names.js';

export default {
  id: 'go',
  label: 'Go',
  language: 'go',
  emit(ir, { rootName = 'Root' } = {}) {
    const { ordered, nameOf } = collectObjects(ir, rootName);
    let needsTime = false;

    const goCore = (t) => {
      switch (t.kind) {
        case 'string':
          if (t.format === 'datetime') { needsTime = true; return 'time.Time'; }
          return 'string';
        case 'int': return 'int64';
        case 'float': return 'float64';
        case 'bool': return 'bool';
        case 'unknown': case 'null': case 'union': return 'any';
        case 'array': return `[]${goField(t.items).type}`;
        case 'object': return nameOf.get(t);
        default: return 'any';
      }
    };

    const goField = (t) => {
      const nullable = isNullable(t);
      const core = nonNull(t);
      const base = goCore(core);
      if (nullable && base !== 'any') return { type: `*${base}`, soft: true };
      return { type: base, soft: nullable };
    };

    // struct blocks with aligned tags
    const blocks = ordered.map(({ name, node }) => {
      const rows = node.fields.map((f) => {
        const { type, soft } = goField(f.type);
        const ptr = f.optional && !type.startsWith('*') && type !== 'any' ? `*${type}` : type;
        const omit = f.optional || soft ? ',omitempty' : '';
        return {
          field: exportedName(f.name),
          type: ptr,
          tag: `\`json:"${f.name}${omit}"\``,
        };
      });
      const w1 = Math.max(0, ...rows.map((r) => r.field.length));
      const w2 = Math.max(0, ...rows.map((r) => r.type.length));
      const lines = [`type ${name} struct {`];
      for (const r of rows) {
        lines.push(`\t${r.field.padEnd(w1)} ${r.type.padEnd(w2)} ${r.tag}`);
      }
      lines.push('}');
      return lines.join('\n');
    });

    const header = ['package main', ''];
    if (needsTime) header.push('import "time"', '');
    return `${header.join('\n')}\n${blocks.join('\n\n')}\n`;
  },
};

const GO_INITIALISMS = new Set(['id', 'url', 'api', 'http', 'ip', 'uid', 'uuid', 'sku', 'json', 'html', 'sql']);

function exportedName(name) {
  const words = String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'Field';
  const out = words
    .map((w) => (GO_INITIALISMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join('');
  return /^[0-9]/.test(out) ? `N${out}` : out;
}
