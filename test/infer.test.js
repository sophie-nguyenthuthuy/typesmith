import test from 'node:test';
import assert from 'node:assert/strict';
import { inferValue, inferSamples } from '../src/infer.js';
import { analyze } from '../src/detect.js';
import { isNullable, nonNull } from '../src/ir.js';

function field(objIR, name) {
  const f = objIR.fields.find((f) => f.name === name);
  assert.ok(f, `field ${name} missing`);
  return f;
}

test('scalars', () => {
  assert.equal(inferValue('hi').kind, 'string');
  assert.equal(inferValue(3).kind, 'int');
  assert.equal(inferValue(3.5).kind, 'float');
  assert.equal(inferValue(true).kind, 'bool');
  assert.equal(inferValue(null).kind, 'null');
});

test('string formats', () => {
  assert.equal(inferValue('2026-08-09').format, 'date');
  assert.equal(inferValue('2026-08-09T12:30:00Z').format, 'datetime');
  assert.equal(inferValue('2026-08-09 12:30:00').format, 'datetime');
  assert.equal(inferValue('123e4567-e89b-12d3-a456-426614174000').format, 'uuid');
  assert.equal(inferValue('a@b.co').format, 'email');
  assert.equal(inferValue('plain text').format, undefined);
});

test('missing field across samples becomes optional', () => {
  const ir = inferSamples([{ a: 1, b: 'x' }, { a: 2 }]);
  assert.equal(field(ir, 'a').optional, false);
  assert.equal(field(ir, 'b').optional, true);
});

test('null value across samples becomes nullable, not optional', () => {
  const ir = inferSamples([{ a: 1 }, { a: null }]);
  const f = field(ir, 'a');
  assert.equal(f.optional, false);
  assert.ok(isNullable(f.type));
  assert.equal(nonNull(f.type).kind, 'int');
});

test('int + float unify to float', () => {
  const ir = inferSamples([{ x: 1 }, { x: 2.5 }]);
  assert.equal(field(ir, 'x').type.kind, 'float');
});

test('mixed formats fall back to plain string', () => {
  const ir = inferSamples([{ s: '2026-01-01' }, { s: 'not a date' }]);
  const t = field(ir, 's').type;
  assert.equal(t.kind, 'string');
  assert.equal(t.format, undefined);
});

test('incompatible scalars form a union', () => {
  const ir = inferSamples([{ v: 1 }, { v: 'x' }]);
  const t = field(ir, 'v').type;
  assert.equal(t.kind, 'union');
  assert.deepEqual(t.variants.map((v) => v.kind).sort(), ['int', 'string']);
});

test('arrays unify element types; empty array is unknown', () => {
  assert.equal(inferValue([]).items.kind, 'unknown');
  assert.equal(inferValue([1, 2.5]).items.kind, 'float');
  const merged = inferSamples([{ xs: [] }, { xs: [1] }]);
  assert.equal(field(merged, 'xs').type.items.kind, 'int');
});

test('nested objects merge field-wise', () => {
  const ir = inferSamples([
    { user: { id: 1, name: 'a' } },
    { user: { id: 2, email: 'x@y.co' } },
  ]);
  const user = field(ir, 'user').type;
  assert.equal(user.kind, 'object');
  assert.equal(field(user, 'name').optional, true);
  assert.equal(field(user, 'email').optional, true);
  assert.equal(field(user, 'id').optional, false);
});

test('analyze: detects json object / array / ndjson / csv', () => {
  assert.equal(analyze('{"a": 1}').format, 'json-object');
  assert.equal(analyze('[{"a": 1}]').format, 'json-array');
  assert.equal(analyze('{"a": 1}\n{"a": 2}').format, 'ndjson');
  assert.equal(analyze('a,b\n1,2').format, 'csv');
  assert.equal(analyze('[{"a": 1}]').isCollection, true);
  assert.equal(analyze('{"a": 1}').isCollection, false);
});

test('analyze: helpful errors', () => {
  assert.throws(() => analyze(''), /Paste some/);
  assert.throws(() => analyze('{broken'), /failed to parse/);
  assert.throws(() => analyze('just one line of prose'), /Could not detect/);
});
