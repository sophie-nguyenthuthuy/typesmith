// Emit SQLite DDL for the root record. Nested objects/arrays are stored as
// JSON in TEXT columns (v1 keeps one table; normalization is a welcome PR).
import { isNullable, nonNull } from '../ir.js';
import { snakeCase } from '../names.js';

export default {
  id: 'sqlite',
  label: 'SQLite DDL',
  language: 'sql',
  emit(ir, { rootName = 'Root' } = {}) {
    const root = nonNull(ir);
    if (root.kind !== 'object') {
      return `-- SQLite emitter expects an object (or array of objects) at the root.\n-- Got: ${root.kind}\n`;
    }
    const table = snakeCase(rootName);
    const rows = root.fields.map((f) => columnFor(f));
    const w1 = Math.max(0, ...rows.map((r) => r.name.length));
    const w2 = Math.max(0, ...rows.map((r) => r.decl.length));
    const body = rows
      .map((r, i) => {
        const comma = i < rows.length - 1 ? ',' : '';
        const comment = r.comment ? `${comma}  -- ${r.comment}` : comma;
        return `  ${r.name.padEnd(w1)} ${(r.decl + comment).trimEnd()}`;
      })
      .join('\n');
    return `CREATE TABLE ${table} (\n${body}\n);\n`;
  },
};

function columnFor(f) {
  const name = quoteIdent(snakeCase(f.name));
  const nullable = f.optional || isNullable(f.type);
  const core = nonNull(f.type);
  const { sqlType, comment } = sqliteType(core, f.name);
  const notNull = nullable ? '' : ' NOT NULL';
  const isPk = f.name.toLowerCase() === 'id' && core.kind === 'int' && !nullable;
  const decl = isPk ? `${sqlType} PRIMARY KEY` : `${sqlType}${notNull}`;
  return { name, decl, comment };
}

function sqliteType(t, fieldName) {
  switch (t.kind) {
    case 'int': return { sqlType: 'INTEGER' };
    case 'float': return { sqlType: 'REAL' };
    case 'bool': return { sqlType: 'INTEGER', comment: 'boolean 0/1' };
    case 'string':
      if (t.format === 'date') return { sqlType: 'TEXT', comment: 'ISO date' };
      if (t.format === 'datetime') return { sqlType: 'TEXT', comment: 'ISO 8601 datetime' };
      if (t.format === 'uuid') return { sqlType: 'TEXT', comment: 'UUID' };
      return { sqlType: 'TEXT' };
    case 'object': return { sqlType: 'TEXT', comment: 'JSON object' };
    case 'array': return { sqlType: 'TEXT', comment: 'JSON array' };
    case 'union': return { sqlType: 'TEXT', comment: 'mixed types; stored as text' };
    default: return { sqlType: 'TEXT' };
  }
}

const SQL_KEYWORDS = new Set([
  'order', 'group', 'select', 'from', 'where', 'table', 'index', 'to', 'default',
  'primary', 'key', 'values', 'set', 'update', 'delete', 'insert', 'join', 'on',
]);

function quoteIdent(s) {
  return SQL_KEYWORDS.has(s.toLowerCase()) || /[^a-z0-9_]/.test(s) ? `"${s}"` : s;
}
