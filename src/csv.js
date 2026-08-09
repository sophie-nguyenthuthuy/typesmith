// Quote-aware CSV parsing + column typing. Output feeds the same IR as JSON input.
import { T } from './ir.js';
import { stringFormat } from './infer.js';

const DELIMS = [',', '\t', ';', '|'];

export function detectDelimiter(firstLine) {
  let best = ',';
  let bestCount = 0;
  for (const d of DELIMS) {
    const count = countOutsideQuotes(firstLine, d);
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

function countOutsideQuotes(line, delim) {
  let n = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === delim && !inQuotes) n++;
  }
  return n;
}

// Parse CSV text into { header: string[], rows: string[][] }.
export function parseCSV(text, delim) {
  const d = delim ?? detectDelimiter(text.split(/\r?\n/, 1)[0]);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === d) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  if (rows.length === 0) throw new Error('CSV input is empty');
  const [header, ...data] = rows;
  return { header, rows: data };
}

const RE_INT = /^-?\d+$/;
const RE_FLOAT = /^-?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/;

// Type a single CSV cell. Empty cell → null. Leading-zero digit strings
// ("007", zip codes) stay strings — coercing them to int loses data.
export function cellType(raw) {
  const s = raw.trim();
  if (s === '') return T.nul();
  const lower = s.toLowerCase();
  if (lower === 'true' || lower === 'false') return T.bool();
  if (RE_INT.test(s)) {
    if (s.length > 1 && (s[0] === '0' || (s[0] === '-' && s[1] === '0'))) return T.string();
    return T.int();
  }
  if (RE_FLOAT.test(s) && /\d/.test(s)) return T.float();
  return T.string(stringFormat(s));
}

// Infer an object IR from parsed CSV: one field per column, unified down the rows.
export function inferCSV({ header, rows }) {
  const fields = header.map((name, col) => {
    let type = T.unknown();
    for (const row of rows) {
      const raw = row[col] ?? '';
      type = unifyCell(type, cellType(raw));
    }
    if (type.kind === 'unknown') type = T.string();
    return { name: name.trim(), type, optional: false };
  });
  return T.object(fields);
}

// Cell-level unification is looser than JSON unification: a column mixing
// numbers and words is just a string column, not a union.
function unifyCell(a, b) {
  if (a.kind === 'unknown') return b;
  if (b.kind === 'unknown') return a;
  if (a.kind === b.kind && a.kind !== 'union') {
    if (a.kind === 'string') return a.format === b.format ? a : T.string();
    return a;
  }
  const aNull = a.kind === 'null';
  const bNull = b.kind === 'null';
  if (aNull || bNull) {
    const inner = aNull ? b : a;
    if (inner.kind === 'union') return inner;
    return T.union([inner, T.nul()]);
  }
  const au = a.kind === 'union' ? a.variants.filter((v) => v.kind !== 'null') : [a];
  const hadNull = a.kind === 'union' && a.variants.some((v) => v.kind === 'null');
  const inner = au[0];
  let merged;
  if (inner.kind === b.kind) {
    merged = inner.kind === 'string' && inner.format !== b.format ? T.string() : inner;
  } else if ((inner.kind === 'int' && b.kind === 'float') || (inner.kind === 'float' && b.kind === 'int')) {
    merged = T.float();
  } else {
    merged = T.string(); // mixed scalar column → string
  }
  return hadNull ? T.union([merged, T.nul()]) : merged;
}
