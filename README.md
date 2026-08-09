# typesmith

**Paste data, get types.** Drop in JSON, an array of records, NDJSON, or CSV — get
Pydantic models, TypeScript interfaces, Go structs, SQLite DDL, a JSON Schema, and
an Avro schema. With sane optional/nullable inference.

It's a static page. No install, no build, no server-side anything — open it and paste.

```
make serve   # http://localhost:8480
make test    # node --test (zero dependencies)
```

## What "sane inference" means

- A field **missing** in some records is `optional` (`x?:` / `= None` / `,omitempty`).
- A field that is **null** in some records is `nullable` (`| null` / `| None` / pointer) — these are different things and typesmith keeps them apart (JSON Schema/Avro collapse them where the format demands it).
- `1` and `2.5` in the same field widen to `float`, not a union.
- Strings that all look like ISO dates/datetimes/UUIDs/emails get formats
  (`datetime.date`, JSON Schema `format`, Avro logical types). One odd value and the
  field falls back to plain string.
- CSV: empty cells make a column nullable; `007` stays a string (zip codes are not
  integers); `true/false` columns become booleans.
- Awkward field names survive: `user id` → Pydantic `Field(alias="user id")`,
  TS `"user id":`, Go tag `json:"user id"`.

## Architecture

```
src/
  detect.js    input sniffing: JSON / NDJSON / CSV → IR
  infer.js     JSON values → IR (unification across samples)
  csv.js       quote-aware CSV parser + column typing
  ir.js        the IR + unify()  ← the one shared vocabulary
  names.js     PascalCase/snake_case + nested-type naming
  emit/
    index.js   registry (UI tabs + tests read this)
    pydantic.js typescript.js go.js sqlite.js jsonschema.js avro.js
```

Everything is dependency-free ES modules: the browser page imports the exact same
files the tests do. There is no bundler and no `node_modules`.

## Contributing: one emitter per PR

Each target language is **one file**. To add Rust/Kotlin/Zod/protobuf/…:

1. Create `src/emit/<lang>.js` exporting `{ id, label, language, emit(ir, opts) }`.
2. Register it in `src/emit/index.js` (one import, one array entry).
3. Add a `test/<lang>.test.js` (or extend `emitters.test.js`) with assertions for
   optional vs nullable, formats, and awkward field names.

The UI tab and the registry conformance test pick it up automatically.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the IR reference.

## License

MIT
