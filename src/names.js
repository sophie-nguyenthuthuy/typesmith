// Shared naming utilities for emitters: assign stable PascalCase names to every
// nested object type, dependency-first, so emitters can print child types
// before the types that reference them.

export function pascalCase(s) {
  const words = String(s)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'Field';
  const joined = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return /^[0-9]/.test(joined) ? `N${joined}` : joined;
}

export function snakeCase(s) {
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'field';
}

export function singular(s) {
  if (/ies$/i.test(s)) return s.replace(/ies$/i, 'y');
  if (/(ses|xes|zes|ches|shes)$/i.test(s)) return s.replace(/es$/i, '');
  if (/s$/i.test(s) && !/ss$/i.test(s)) return s.replace(/s$/i, '');
  return s;
}

// Walk the IR and name every object node. Returns:
//   { ordered: [{ name, node }], nameOf: Map<objectNode, name> }
// `ordered` lists dependencies before dependents (leaf types first).
export function collectObjects(root, rootName = 'Root') {
  const ordered = [];
  const nameOf = new Map();
  const used = new Set();

  const claim = (base) => {
    let name = base;
    let i = 2;
    while (used.has(name)) name = `${base}${i++}`;
    used.add(name);
    return name;
  };

  const visit = (node, hint) => {
    switch (node.kind) {
      case 'object': {
        if (nameOf.has(node)) return;
        const name = claim(pascalCase(hint));
        nameOf.set(node, name); // claim before recursing (handles self-similar nesting)
        for (const f of node.fields) visit(f.type, fieldHint(f.name, f.type));
        ordered.push({ name, node });
        return;
      }
      case 'array':
        visit(node.items, hint);
        return;
      case 'union':
        for (const v of node.variants) visit(v, hint);
        return;
      default:
        return;
    }
  };

  visit(root, rootName);
  return { ordered, nameOf };
}

function fieldHint(name, type) {
  return type.kind === 'array' ? singular(name) : name;
}
