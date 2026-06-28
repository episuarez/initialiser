// tests/detect.test.ts — Deteccion de perfil sobre dirs temporales.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectProfile } from '../src/detect.js';

function tmp() { return mkdtempSync(join(tmpdir(), 'initdetect-')); }

test('repo vacio -> small, sin lenguaje', () => {
  const d = tmp();
  try {
    const p = detectProfile(d);
    assert.equal(p.size, 'small');
    assert.equal(p.langs.length, 0);
    assert.ok(!p.tags.has('sizable'));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('cuenta archivos .mjs/.cjs (proyectos ESM)', () => {
  const d = tmp();
  try {
    writeFileSync(join(d, 'index.mjs'), 'export const x = 1;');
    writeFileSync(join(d, 'a.cjs'), 'module.exports = {};');
    const p = detectProfile(d);
    assert.equal(p.fileCount, 2, '.mjs y .cjs deben contar como codigo');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('package.json con React -> javascript + frontend', () => {
  const d = tmp();
  try {
    writeFileSync(join(d, 'package.json'), JSON.stringify({ dependencies: { react: '^18', vitest: '^1' } }));
    const p = detectProfile(d);
    assert.ok(p.tags.has('javascript'));
    assert.ok(p.tags.has('frontend'));
    assert.ok(p.hasTests, 'vitest deberia marcar tests');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('pyproject con FastAPI -> python + backend-python', () => {
  const d = tmp();
  try {
    writeFileSync(join(d, 'pyproject.toml'), '[project]\ndependencies = ["fastapi", "pytest"]\n');
    const p = detectProfile(d);
    assert.ok(p.tags.has('python'));
    assert.ok(p.tags.has('backend-python'));
    assert.ok(p.hasTests);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('Dockerfile / compose -> tag docker', () => {
  const d = tmp();
  try {
    writeFileSync(join(d, 'Dockerfile'), 'FROM node:20\n');
    assert.ok(detectProfile(d).tags.has('docker'));
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('deps de IA (JS y Python) -> tag ai', () => {
  const d1 = tmp();
  try {
    writeFileSync(join(d1, 'package.json'), JSON.stringify({ dependencies: { '@anthropic-ai/sdk': '^1', langchain: '^0.3' } }));
    assert.ok(detectProfile(d1).tags.has('ai'));
  } finally { rmSync(d1, { recursive: true, force: true }); }
  const d2 = tmp();
  try {
    writeFileSync(join(d2, 'requirements.txt'), 'openai\ntransformers\n');
    assert.ok(detectProfile(d2).tags.has('ai'));
  } finally { rmSync(d2, { recursive: true, force: true }); }
});

test('marcadores de monorepo y CI', () => {
  const d = tmp();
  try {
    writeFileSync(join(d, 'turbo.json'), '{}');
    mkdirSync(join(d, '.github', 'workflows'), { recursive: true });
    const p = detectProfile(d);
    assert.ok(p.isMonorepo);
    assert.ok(p.hasCI);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
