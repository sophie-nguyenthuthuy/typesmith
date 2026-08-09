// Figure out what the user pasted (JSON / NDJSON / CSV) and produce IR + a label.
import { inferValue, inferSamples } from './infer.js';
import { parseCSV, inferCSV } from './csv.js';

// Returns { ir, format, isCollection }.
//   format: 'json-object' | 'json-array' | 'json-value' | 'ndjson' | 'csv'
//   isCollection: true when the input represents many records of the root type.
export function analyze(text) {
  const trimmed = text.trim();
  if (trimmed === '') throw new Error('Paste some JSON, NDJSON, or CSV to get started');

  if (trimmed[0] === '{' || trimmed[0] === '[') {
    try {
      const value = JSON.parse(trimmed);
      if (Array.isArray(value)) {
        return { ir: inferSamples(value), format: 'json-array', isCollection: true };
      }
      return { ir: inferValue(value), format: 'json-object', isCollection: false };
    } catch (e) {
      const nd = tryNDJSON(trimmed);
      if (nd) return nd;
      throw new Error(`Input looks like JSON but failed to parse: ${e.message}`);
    }
  }

  const nd = tryNDJSON(trimmed);
  if (nd) return nd;

  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length >= 2) {
    return { ir: inferCSV(parseCSV(trimmed)), format: 'csv', isCollection: true };
  }

  try {
    const value = JSON.parse(trimmed);
    return { ir: inferValue(value), format: 'json-value', isCollection: false };
  } catch {
    throw new Error('Could not detect the input format (expected JSON, NDJSON, or CSV with a header row)');
  }
}

function tryNDJSON(trimmed) {
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return null;
  const values = [];
  for (const line of lines) {
    const t = line.trim();
    if (t[0] !== '{' && t[0] !== '[') return null;
    try {
      values.push(JSON.parse(t));
    } catch {
      return null;
    }
  }
  return { ir: inferSamples(values), format: 'ndjson', isCollection: true };
}
