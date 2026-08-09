import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/detect.js';
import { emitters } from '../src/emit/index.js';

const SAMPLE = JSON.stringify([
  {
    id: 1,
    name: 'Ana',
    email: 'ana@example.com',
    signup_date: '2026-01-15',
    last_seen: '2026-08-01T09:30:00Z',
    score: 4.5,
    active: true,
    tags: ['a', 'b'],
    address: { city: 'Hanoi', zip: '10000' },
  },
  {
    id: 2,
    name: 'Bo',
    email: 'bo@example.com',
    signup_date: '2026-02-20',
    last_seen: null,
    score: 3,
    active: false,
    tags: [],
    // address missing → optional
  },
]);

const { ir, isCollection } = analyze(SAMPLE);
const opts = { rootName: 'User', isCollection };
const outputs = Object.fromEntries(emitters.map((e) => [e.id, e.emit(ir, opts)]));

test('registry conformance: every emitter has id/label/language/emit', () => {
  const ids = new Set();
  for (const e of emitters) {
    assert.equal(typeof e.id, 'string');
    assert.equal(typeof e.label, 'string');
    assert.equal(typeof e.language, 'string');
    assert.equal(typeof e.emit, 'function');
    assert.ok(!ids.has(e.id), `duplicate emitter id ${e.id}`);
    ids.add(e.id);
    const out = e.emit(ir, opts);
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0, `${e.id} emitted empty output`);
  }
});

test('pydantic: models, optional/nullable, formats', () => {
  const py = outputs.pydantic;
  assert.match(py, /class User\(BaseModel\):/);
  assert.match(py, /class Address\(BaseModel\):/);
  assert.match(py, /from datetime import date, datetime/);
  assert.match(py, /signup_date: date\n/);
  assert.match(py, /last_seen: datetime \| None\n/);       // nullable, required
  assert.match(py, /address: Address \| None = None/);      // optional
  assert.match(py, /score: float/);                         // int+float widened
  assert.match(py, /tags: list\[str\]/);
  assert.ok(py.indexOf('class Address') < py.indexOf('class User'), 'deps before dependents');
});

test('typescript: interfaces, ? for optional, | null for nullable', () => {
  const ts = outputs.typescript;
  assert.match(ts, /export interface User \{/);
  assert.match(ts, /address\?: Address;/);
  assert.match(ts, /last_seen: string \| null;/);
  assert.match(ts, /tags: string\[\];/);
  assert.match(ts, /score: number;/);
});

test('go: structs, pointers for optional/nullable, json tags', () => {
  const go = outputs.go;
  assert.match(go, /type User struct \{/);
  assert.match(go, /ID\s+int64\s+`json:"id"`/);
  assert.match(go, /Address\s+\*Address\s+`json:"address,omitempty"`/);
  assert.match(go, /LastSeen\s+\*time\.Time\s+`json:"last_seen,omitempty"`/);
  assert.match(go, /import "time"/);
});

test('sqlite: types, NOT NULL only for required, id primary key', () => {
  const sql = outputs.sqlite;
  assert.match(sql, /CREATE TABLE user \(/);
  assert.match(sql, /id\s+INTEGER PRIMARY KEY/);
  assert.match(sql, /score\s+REAL NOT NULL/);
  assert.match(sql, /active\s+INTEGER NOT NULL,\s+-- boolean 0\/1/);
  assert.match(sql, /last_seen\s+TEXT,/); // nullable → no NOT NULL
  assert.match(sql, /address\s+TEXT/);
  assert.doesNotMatch(sql, /address\s+TEXT NOT NULL/);
});

test('jsonschema: draft 2020-12, required lists, formats, nullables', () => {
  const schema = JSON.parse(outputs.jsonschema);
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.type, 'array'); // input was a collection
  const item = schema.items;
  assert.ok(item.required.includes('id'));
  assert.ok(!item.required.includes('address'));
  assert.deepEqual(item.properties.last_seen.type, ['string', 'null']);
  assert.equal(item.properties.signup_date.format, 'date');
  assert.equal(item.properties.email.format, 'email');
});

test('avro: nullable unions default null, logical types', () => {
  const avro = JSON.parse(outputs.avro);
  assert.equal(avro.type, 'record');
  assert.equal(avro.name, 'User');
  const byName = Object.fromEntries(avro.fields.map((f) => [f.name, f]));
  assert.deepEqual(byName.last_seen.type[0], 'null');
  assert.equal(byName.last_seen.default, null);
  assert.equal(byName.signup_date.type.logicalType, 'date');
  assert.equal(byName.id.type, 'long');
  assert.equal(byName.address.type[0], 'null'); // optional → nullable union
});

test('csv input flows through every emitter', () => {
  const csv = 'id,name,joined,balance\n1,An,2026-01-01,100\n2,,2026-02-01,25.5';
  const a = analyze(csv);
  for (const e of emitters) {
    const out = e.emit(a.ir, { rootName: 'Row', isCollection: a.isCollection });
    assert.ok(out.length > 0, `${e.id} failed on CSV`);
  }
  const py = emitters.find((e) => e.id === 'pydantic').emit(a.ir, { rootName: 'Row' });
  assert.match(py, /name: str \| None/); // empty cell → nullable
  assert.match(py, /balance: float/);
  assert.match(py, /joined: date/);
});

test('awkward field names are handled everywhere', () => {
  const a = analyze('{"user id": 1, "class": "x", "2fa": true}');
  const py = emitters.find((e) => e.id === 'pydantic').emit(a.ir, { rootName: 'Root' });
  assert.match(py, /user_id: int = Field\(alias="user id"\)/);
  assert.match(py, /class_: str = Field\(alias="class"\)/);
  assert.match(py, /f_2fa: bool = Field\(alias="2fa"\)/);
  const ts = emitters.find((e) => e.id === 'typescript').emit(a.ir, { rootName: 'Root' });
  assert.match(ts, /"user id": number;/);
  assert.match(ts, /"2fa": boolean;/);
  const go = emitters.find((e) => e.id === 'go').emit(a.ir, { rootName: 'Root' });
  assert.match(go, /UserID\s+int64\s+`json:"user id"`/);
});
