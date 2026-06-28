// tests/migrate.test.ts — migrate-memory: aditivo y seguro.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrateMemory } from '../src/commands/migrate.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'initmig-')); }

test('copia .md aditivo, con estructura, sin sobrescribir ni borrar origen', () => {
  const src = tmp(), dst = tmp();
  try {
    writeFileSync(join(src, 'a.md'), 'AAA');
    mkdirSync(join(src, 'sub'));
    writeFileSync(join(src, 'sub', 'b.md'), 'BBB');
    writeFileSync(join(src, 'ignore.txt'), 'no');
    writeFileSync(join(dst, 'a.md'), 'EXISTENTE'); // ya existe -> no se sobrescribe
    const code = runMigrateMemory([src, dst]);
    assert.equal(code, 0);
    assert.equal(readFileSync(join(dst, 'a.md'), 'utf8'), 'EXISTENTE', 'no sobrescribe destino');
    assert.equal(readFileSync(join(dst, 'sub', 'b.md'), 'utf8'), 'BBB', 'copia con estructura');
    assert.ok(!existsSync(join(dst, 'ignore.txt')), 'solo copia .md');
    assert.ok(existsSync(join(src, 'a.md')), 'origen intacto');
  } finally { rmSync(src, { recursive: true, force: true }); rmSync(dst, { recursive: true, force: true }); }
});

test('falla con args faltantes u origen invalido', () => {
  assert.equal(runMigrateMemory([]), 1);
  assert.equal(runMigrateMemory([join(tmpdir(), 'no-existe-xyz-123'), tmpdir()]), 1);
});
