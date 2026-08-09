// Emitter registry. To add a language: create src/emit/<lang>.js exporting
// { id, label, language, emit(ir, opts) } and add it to the list below.
// The UI tabs and the conformance tests pick it up automatically.
import pydantic from './pydantic.js';
import typescript from './typescript.js';
import go from './go.js';
import sqlite from './sqlite.js';
import jsonschema from './jsonschema.js';
import avro from './avro.js';

export const emitters = [pydantic, typescript, go, sqlite, jsonschema, avro];
