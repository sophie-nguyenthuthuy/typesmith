// Turn parsed sample data (JS values) into IR. See src/ir.js for the shape.
import { T, unify } from './ir.js';

const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function stringFormat(s) {
  if (RE_DATE.test(s)) return 'date';
  if (RE_DATETIME.test(s)) return 'datetime';
  if (RE_UUID.test(s)) return 'uuid';
  if (RE_EMAIL.test(s)) return 'email';
  return undefined;
}

// Infer the IR of a single JS value (already parsed from JSON).
export function inferValue(v) {
  if (v === null) return T.nul();
  switch (typeof v) {
    case 'string':
      return T.string(stringFormat(v));
    case 'boolean':
      return T.bool();
    case 'number':
      return Number.isInteger(v) ? T.int() : T.float();
    case 'object': {
      if (Array.isArray(v)) {
        if (v.length === 0) return T.array(T.unknown());
        return T.array(v.map(inferValue).reduce(unify));
      }
      return T.object(
        Object.entries(v).map(([name, val]) => ({ name, type: inferValue(val), optional: false }))
      );
    }
    default:
      return T.unknown();
  }
}

// Infer from a list of sample values (e.g. a JSON array or NDJSON lines):
// unifying across samples is what produces optional fields.
export function inferSamples(values) {
  if (values.length === 0) return T.unknown();
  return values.map(inferValue).reduce(unify);
}
