// Intermediate representation shared by the inference engine and every emitter.
//
// IR nodes (plain objects, no classes):
//   { kind: 'string', format?: 'date'|'datetime'|'uuid'|'email' }
//   { kind: 'int' } | { kind: 'float' } | { kind: 'bool' } | { kind: 'null' }
//   { kind: 'unknown' }                      — e.g. inferred from an empty array
//   { kind: 'array', items: IR }
//   { kind: 'object', fields: [{ name, type: IR, optional: boolean }] }
//   { kind: 'union', variants: [IR] }        — flattened, deduped, never nested
//
// "optional" means the key was missing in at least one sample record.
// Nullability is modeled as a union with { kind: 'null' }.

export const T = {
  string: (format) => (format ? { kind: 'string', format } : { kind: 'string' }),
  int: () => ({ kind: 'int' }),
  float: () => ({ kind: 'float' }),
  bool: () => ({ kind: 'bool' }),
  nul: () => ({ kind: 'null' }),
  unknown: () => ({ kind: 'unknown' }),
  array: (items) => ({ kind: 'array', items }),
  object: (fields) => ({ kind: 'object', fields }),
  union: (variants) => ({ kind: 'union', variants }),
};

export function isNullable(t) {
  return t.kind === 'null' || (t.kind === 'union' && t.variants.some((v) => v.kind === 'null'));
}

// Strip null from a type; returns the non-null remainder (or 'unknown' if it was pure null).
export function nonNull(t) {
  if (t.kind === 'null') return T.unknown();
  if (t.kind !== 'union') return t;
  const rest = t.variants.filter((v) => v.kind !== 'null');
  if (rest.length === 0) return T.unknown();
  if (rest.length === 1) return rest[0];
  return T.union(rest);
}

// Merge two IR types into the narrowest type that admits both.
export function unify(a, b) {
  if (a.kind === 'unknown') return b;
  if (b.kind === 'unknown') return a;

  if (a.kind === b.kind) {
    switch (a.kind) {
      case 'string':
        return a.format === b.format ? a : T.string();
      case 'int':
      case 'float':
      case 'bool':
      case 'null':
        return a;
      case 'array':
        return T.array(unify(a.items, b.items));
      case 'object':
        return unifyObjects(a, b);
      case 'union':
        return b.variants.reduce((acc, v) => unify(acc, v), a);
    }
  }

  if ((a.kind === 'int' && b.kind === 'float') || (a.kind === 'float' && b.kind === 'int')) {
    return T.float();
  }

  return addToUnion(a.kind === 'union' ? a : T.union([a]), b);
}

function unifyObjects(a, b) {
  const names = [];
  const byName = new Map();
  for (const f of a.fields) {
    names.push(f.name);
    byName.set(f.name, f);
  }
  const fields = [];
  const seenInB = new Set();
  for (const f of b.fields) seenInB.add(f.name);

  for (const name of names) {
    const fa = byName.get(name);
    const fb = b.fields.find((f) => f.name === name);
    if (fb) {
      fields.push({ name, type: unify(fa.type, fb.type), optional: fa.optional || fb.optional });
    } else {
      fields.push({ name: fa.name, type: fa.type, optional: true });
    }
  }
  for (const fb of b.fields) {
    if (!byName.has(fb.name)) {
      fields.push({ name: fb.name, type: fb.type, optional: true });
    }
  }
  return T.object(fields);
}

// Add type b into union a, merging with a compatible existing variant when possible.
function addToUnion(a, b) {
  if (b.kind === 'union') return b.variants.reduce((acc, v) => addToUnion(acc, v), a);
  const variants = [...a.variants];
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const mergeable =
      v.kind === b.kind ||
      (v.kind === 'int' && b.kind === 'float') ||
      (v.kind === 'float' && b.kind === 'int');
    if (mergeable) {
      variants[i] = unify(v, b);
      return normalizeUnion(variants);
    }
  }
  variants.push(b);
  return normalizeUnion(variants);
}

function normalizeUnion(variants) {
  if (variants.length === 1) return variants[0];
  return T.union(variants);
}
