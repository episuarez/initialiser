// tests/generate.test.ts — Generacion de CLAUDE.md, settings y preservacion.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateClaudeMd, generateProjectSettings, writeManaged, writeSkill, saveSnapshot, loadSnapshot, extractUserSections, MANAGED_HEADINGS } from '../src/generate.js';
import type { Component } from '../src/catalog.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'initgen-')); }

const FAKE_COMP = { id: 'context-mode', claudemd: '- `context-mode`: memoria de sesion.' } as unknown as Component;

test('generateClaudeMd crea CLAUDE.md con secciones clave', () => {
  const d = tmp();
  try {
    const res = generateClaudeMd(d, [FAKE_COMP], [], false, null, null);
    assert.equal(res, 'CREATED');
    const md = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
    assert.match(md, /# CLAUDE\.md/);
    assert.match(md, /## Herramientas/);
    assert.match(md, /## Git y commits/);
    assert.ok(md.includes(FAKE_COMP.claudemd!), 'inyecta el claudemd del componente');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('CLAUDE.md generado lleva la firma (se reconoce como gestionado en re-run)', () => {
  const d = tmp();
  try {
    generateClaudeMd(d, [FAKE_COMP], [], false, null, null);
    const md = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
    assert.ok(md.includes('Auto-generado por init-claude'), 'sin firma el wizard no regeneraria su propio fichero');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('writeSkill sanea nombres con path traversal', () => {
  const d = tmp();
  try {
    writeSkill(d, '../../evil', 'x');
    assert.ok(!existsSync(join(d, '..', '..', 'evil')), 'no escribe fuera de skills');
    assert.ok(existsSync(join(d, '.claude', 'skills', 'evil', 'SKILL.md')), 'normaliza a nombre seguro');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('Tool Search: docTier discovery se consolida en indice, policy se mantiene', () => {
  const d = tmp();
  try {
    const policy = { id: 'context-mode', claudemd: '- `context-mode`: usa ctx_search antes de re-leer.' } as unknown as Component;
    const disc = { id: 'serena', docTier: 'discovery', mcp: { name: 'serena' }, claudemd: '- `serena`: busqueda semantica.' } as unknown as Component;
    generateClaudeMd(d, [policy, disc], [], false, null, null, false);
    let md = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
    assert.ok(md.includes(disc.claudemd!), 'sin Tool Search, la linea discovery se escribe literal');
    generateClaudeMd(d, [policy, disc], [], false, null, null, true);
    md = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
    assert.ok(md.includes(policy.claudemd!), 'policy se mantiene con Tool Search');
    assert.ok(!md.includes(disc.claudemd!), 'discovery no ocupa su linea con Tool Search');
    assert.match(md, /Tools instaladas.*serena/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('preserva secciones del usuario añadidas fuera de CUSTOM al regenerar', () => {
  const d = tmp();
  try {
    generateClaudeMd(d, [FAKE_COMP], [], false, null, null);
    const path = join(d, 'CLAUDE.md');
    const edited = readFileSync(path, 'utf8') + '\n## Mi regla propia\n\n- No tocar el modulo legacy.\n';
    writeFileSync(path, edited);
    generateClaudeMd(d, [FAKE_COMP], [], false, null, null);
    let md = readFileSync(path, 'utf8');
    assert.match(md, /## Mi regla propia/, 'la seccion del usuario sobrevive a la regen');
    assert.match(md, /No tocar el modulo legacy/);
    assert.match(md, /CUSTOM:START/, 'se migro dentro del bloque CUSTOM');
    generateClaudeMd(d, [FAKE_COMP], [], false, null, null);
    md = readFileSync(path, 'utf8');
    assert.equal(md.match(/## Mi regla propia/g)!.length, 1, 'no se duplica en cada regen');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('todo heading generado esta en MANAGED_HEADINGS (anti-drift)', () => {
  const d = tmp();
  try {
    const prof = { langs: ['javascript'], fws: [], fileCount: 9, size: 'small', isMonorepo: false, hasTests: true, hasCI: false, hasDocs: false } as any;
    generateClaudeMd(d, [FAKE_COMP], ['frontend-components'], true, 'nota extra', prof);
    const md = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
    const headings = [...md.matchAll(/^## (.+?)\s*$/gm)].map((m) => m[1]!.trim());
    for (const h of headings) assert.ok(MANAGED_HEADINGS.has(h), `heading no gestionado (actualiza MANAGED_HEADINGS): "${h}"`);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('extractUserSections ignora template y CUSTOM, devuelve solo lo ajeno', () => {
  const text = [
    '# CLAUDE.md', '', '## Tests', '- corre tests.', '',
    '## Mi seccion', '- algo mio.', '',
    '<!-- CUSTOM:START -->', '## Dentro de custom', '- no contar.', '<!-- CUSTOM:END -->',
  ].join('\n');
  const got = extractUserSections(text);
  assert.equal(got.length, 1);
  assert.match(got[0]!, /## Mi seccion/);
});

test('saveSnapshot/loadSnapshot roundtrip y diff de prune', () => {
  const d = tmp();
  try {
    assert.equal(loadSnapshot(d), null, 'sin snapshot devuelve null');
    saveSnapshot(d, { components: ['context7', 'serena'], skills: [] });
    const snap = loadSnapshot(d)!;
    assert.deepEqual(snap.selected.components, ['context7', 'serena']);
    const nowSelected = ['context7'];
    const removed = snap.selected.components.filter((id) => !nowSelected.includes(id));
    assert.deepEqual(removed, ['serena']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('generateClaudeMd preserva el bloque CUSTOM y hace .bak', () => {
  const d = tmp();
  try {
    const path = join(d, 'CLAUDE.md');
    writeFileSync(path, 'Auto-generado por init-claude\n<!-- CUSTOM:START -->\nREGLA MIA\n<!-- CUSTOM:END -->\n');
    const res = generateClaudeMd(d, [FAKE_COMP], [], false, null, null);
    assert.equal(res, 'UPDATED');
    const md = readFileSync(path, 'utf8');
    assert.ok(md.includes('REGLA MIA'), 'conserva contenido CUSTOM');
    assert.ok(readFileSync(path + '.bak', 'utf8').length > 0, 'genera .bak');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('generateProjectSettings escribe deny/allow de seguridad', () => {
  const d = tmp();
  try {
    const res = generateProjectSettings(d);
    assert.equal(res, 'CREATED');
    const s = JSON.parse(readFileSync(join(d, '.claude', 'settings.json'), 'utf8'));
    assert.ok(s.permissions.deny.includes('Read(.env)'));
    assert.ok(s.permissions.allow.some((a: string) => a.startsWith('Bash(git')));
    assert.equal(generateProjectSettings(d), 'PRESENT');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('writeManaged respeta ficheros sin firma', () => {
  const d = tmp();
  try {
    const path = join(d, 'sub', 'file.md');
    assert.equal(writeManaged(path, 'Auto-generado por init-claude\nA'), 'CREATED');
    assert.equal(writeManaged(path, 'Auto-generado por init-claude\nB'), 'CREATED');
    writeFileSync(path, 'editado a mano sin firma');
    assert.equal(writeManaged(path, 'Auto-generado por init-claude\nC'), 'SKIPPED');
  } finally { rmSync(d, { recursive: true, force: true }); }
});
