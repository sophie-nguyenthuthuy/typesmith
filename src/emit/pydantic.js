// Emit Pydantic v2 models (Python 3.10+ union syntax).
import { isNullable, nonNull } from '../ir.js';
import { collectObjects } from '../names.js';

const PY_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class',
  'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
  'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield',
]);

export default {
  id: 'pydantic',
  label: 'Pydantic',
  language: 'python',
  emit(ir, { rootName = 'Root' } = {}) {
    const { ordered, nameOf } = collectObjects(ir, rootName);
    const needs = { typing: new Set(), datetime: new Set(), field: false, uuid: false };

    const pyType = (t) => {
      const nullable = isNullable(t);
      const core = nonNull(t);
      const base = pyCore(core);
      return nullable ? `${base} | None` : base;
    };

    const pyCore = (t) => {
      switch (t.kind) {
        case 'string':
          if (t.format === 'date') { needs.datetime.add('date'); return 'date'; }
          if (t.format === 'datetime') { needs.datetime.add('datetime'); return 'datetime'; }
          if (t.format === 'uuid') { needs.uuid = true; return 'UUID'; }
          return 'str';
        case 'int': return 'int';
        case 'float': return 'float';
        case 'bool': return 'bool';
        case 'unknown': case 'null': needs.typing.add('Any'); return 'Any';
        case 'array': return `list[${pyType(t.items)}]`;
        case 'object': return nameOf.get(t);
        case 'union': return t.variants.map((v) => pyCore(v)).join(' | ');
        default: needs.typing.add('Any'); return 'Any';
      }
    };

    const classes = ordered.map(({ name, node }) => {
      const lines = [`class ${name}(BaseModel):`];
      if (node.fields.length === 0) lines.push('    pass');
      for (const f of node.fields) {
        const t = pyType(f.type);
        const safe = pythonIdent(f.name);
        if (safe !== f.name) {
          needs.field = true;
          const dflt = f.optional || isNullable(f.type) ? 'default=None, ' : '';
          const annot = f.optional && !isNullable(f.type) ? `${t} | None` : t;
          lines.push(`    ${safe}: ${annot} = Field(${dflt}alias=${JSON.stringify(f.name)})`);
        } else if (f.optional) {
          const annot = isNullable(f.type) ? t : `${t} | None`;
          lines.push(`    ${safe}: ${annot} = None`);
        } else if (isNullable(f.type)) {
          lines.push(`    ${safe}: ${t}`);
        } else {
          lines.push(`    ${safe}: ${t}`);
        }
      }
      return lines.join('\n');
    });

    const imports = [];
    if (needs.datetime.size) imports.push(`from datetime import ${[...needs.datetime].sort().join(', ')}`);
    if (needs.typing.size) imports.push(`from typing import ${[...needs.typing].sort().join(', ')}`);
    if (needs.uuid) imports.push('from uuid import UUID');
    imports.push(`from pydantic import BaseModel${needs.field ? ', Field' : ''}`);

    return `${imports.join('\n')}\n\n\n${classes.join('\n\n\n')}\n`;
  },
};

function pythonIdent(name) {
  let s = name.replace(/[^A-Za-z0-9_]/g, '_');
  if (/^[0-9]/.test(s)) s = `f_${s}`;
  if (PY_KEYWORDS.has(s)) s = `${s}_`;
  return s;
}
