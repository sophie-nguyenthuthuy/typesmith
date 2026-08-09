# Contributing

The contributor unit is **one emitter per PR**. Small, reviewable, self-contained.

## Adding an emitter

Create `src/emit/<lang>.js`:

```js
import { isNullable, nonNull } from '../ir.js';
import { collectObjects } from '../names.js';

export default {
  id: 'rust',            // unique, kebab/lowercase
  label: 'Rust',         // UI tab text
  language: 'rust',      // highlighting hint
  emit(ir, { rootName = 'Root', isCollection = false } = {}) {
    // return a string of generated code
  },
};
```

Register it in `src/emit/index.js` (one import + one array entry). Done — the UI
tab appears and `test/emitters.test.js` registry conformance covers it.

## The IR you receive

```
{ kind: 'string', format?: 'date'|'datetime'|'uuid'|'email' }
{ kind: 'int' } { kind: 'float' } { kind: 'bool' } { kind: 'null' } { kind: 'unknown' }
{ kind: 'array', items: IR }
{ kind: 'object', fields: [{ name, type: IR, optional: boolean }] }
{ kind: 'union', variants: [IR] }   // flattened; may contain 'null'
```

Rules your emitter must respect:

- **optional ≠ nullable.** `optional: true` = key may be absent. Null-ness lives in
  the type (`isNullable(t)`); get the payload type with `nonNull(t)`.
- **`unknown`** comes from empty arrays / all-null data. Map it to your language's
  top type (`Any`, `unknown`, `any`), never crash.
- **Name mangling:** if the target language can't express the original field name,
  keep round-trippability (alias/tag/quoted key) rather than silently renaming.
- Use `collectObjects(ir, rootName)` for nested type names — it returns
  dependency-first order so you can print child types before parents.

## Checklist for the PR

- [ ] `src/emit/<lang>.js` + registry entry
- [ ] Tests: optional vs nullable, string formats, awkward field names, empty array
- [ ] `node --test` green
- [ ] One emitter only

## Non-emitter contributions

Also welcome, still one-per-PR: new input formats (`detect.js`), new string formats
(`infer.js` — add to tests!), inference fixes with a repro sample.
