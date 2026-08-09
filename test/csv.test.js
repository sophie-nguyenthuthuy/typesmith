import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, detectDelimiter, cellType, inferCSV } from '../src/csv.js';
import { isNullable, nonNull } from '../src/ir.js';

function field(objIR, name) {
  const f = objIR.fields.find((f) => f.name === name);
  assert.ok(f, `field ${name} missing`);
  return f;
}

test('delimiter detection', () => {
  assert.equal(detectDelimiter('a,b,c'), ',');
  assert.equal(detectDelimiter('a;b;c'), ';');
  assert.equal(detectDelimiter('a\tb\tc'), '\t');
  assert.equal(detectDelimiter('a|b|c'), '|');
  assert.equal(detectDelimiter('"x,y";z'), ';'); // comma inside quotes ignored
});

test('quoted fields with embedded delimiters, quotes, newlines', () => {
  const { header, rows } = parseCSV('name,notes\n"Đặng, Thùy","said ""hi""\nnext line"');
  assert.deepEqual(header, ['name', 'notes']);
  assert.deepEqual(rows[0], ['Đặng, Thùy', 'said "hi"\nnext line']);
});

test('cell typing', () => {
  assert.equal(cellType('42').kind, 'int');
  assert.equal(cellType('-3.14').kind, 'float');
  assert.equal(cellType('1e5').kind, 'float');
  assert.equal(cellType('true').kind, 'bool');
  assert.equal(cellType('FALSE').kind, 'bool');
  assert.equal(cellType('').kind, 'null');
  assert.equal(cellType('hello').kind, 'string');
  assert.equal(cellType('2026-08-09').format, 'date');
});

test('leading zeros stay strings (zip codes, phone-ish ids)', () => {
  assert.equal(cellType('007').kind, 'string');
  assert.equal(cellType('-042').kind, 'string');
  assert.equal(cellType('0').kind, 'int'); // plain zero is a real int
});

test('column with empty cells is nullable', () => {
  const ir = inferCSV(parseCSV('id,score\n1,10\n2,\n3,30'));
  const score = field(ir, 'score');
  assert.ok(isNullable(score.type));
  assert.equal(nonNull(score.type).kind, 'int');
  assert.ok(!isNullable(field(ir, 'id').type));
});

test('mixed numeric column widens to float; mixed scalar column falls to string', () => {
  const ir = inferCSV(parseCSV('a,b\n1,x\n2.5,3'));
  assert.equal(field(ir, 'a').type.kind, 'float');
  assert.equal(field(ir, 'b').type.kind, 'string');
});

test('all-empty column ends up nullable string', () => {
  const ir = inferCSV(parseCSV('a,b\n1,\n2,'));
  const b = field(ir, 'b').type;
  assert.ok(isNullable(b));
});

test('semicolon CSV end-to-end', () => {
  const ir = inferCSV(parseCSV('name;age\nAn;30\nBình;25'));
  assert.equal(field(ir, 'age').type.kind, 'int');
});
