// tests/ui.test.ts — Helpers de presentacion (puros).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { truncate, progressBar, statusLabel, remedyFor, mask } from '../src/ui.js';

test('truncate respeta el limite y añade elipsis', () => {
  assert.equal(truncate('hola', 10), 'hola');
  assert.equal(truncate('abcdefgh', 5), 'abcd…');
  assert.equal(truncate('', 5), '');
  assert.equal(truncate(undefined, 5), '');
});

test('progressBar cuenta y nunca desborda', () => {
  assert.match(progressBar(0, 10), /\] 0\/10$/);
  assert.match(progressBar(10, 10), /\] 10\/10$/);
  const b = progressBar(15, 10, 20);
  assert.match(b, /\] 15\/10$/);
  assert.equal((b.match(/[█#]/g) || []).length <= 20, true);
});

test('statusLabel traduce y clasifica kind', () => {
  assert.deepEqual(statusLabel('INSTALLED'), { kind: 'ok', text: 'instalado' });
  assert.deepEqual(statusLabel('REGISTERED'), { kind: 'ok', text: 'registrado' });
  assert.deepEqual(statusLabel('PRESENT'), { kind: 'present', text: 'ya presente' });
  assert.equal(statusLabel('SKIPPED (sin Python)').kind, 'skip');
  assert.equal(statusLabel('FAIL (npm exit 1)').kind, 'fail');
  assert.equal(statusLabel('TIMEOUT (300s)').kind, 'fail');
  assert.equal(statusLabel('MISSING').kind, 'skip');
});

test('remedyFor da accion concreta por tipo de fallo', () => {
  assert.match(remedyFor('SKIPPED (sin Python)'), /pipx/);
  assert.match(remedyFor('SKIPPED (falta uv)'), /uv/);
  assert.match(remedyFor('FAIL (cargo)'), /rustup/i);
  assert.match(remedyFor('FAIL (npm exit 1)'), /npm/);
  assert.ok(remedyFor('cualquier otra cosa').length > 0);
});

test('mask oculta el valor', () => {
  assert.equal(mask('abc'), '***');
  assert.match(mask('figd_supersecreto'), /^fig\*\*\*to$/);
});
