// tests/advisor.test.ts — Motor de recomendacion: datos para decidir.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { analyze, analyzeCatalog, weightOf, needsOf } from '../src/advisor.js';
import { loadCatalog } from '../src/catalog.js';
import type { Component } from '../src/catalog.js';
import type { Profile } from '../src/types.js';

const cat = loadCatalog();
const byId = (id: string): Component => cat.components.find((c) => c.id === id)!;
const prof = (tags: string[]): Profile => ({ tags: new Set(tags) } as Profile);
const opts = { provided: new Set<string>(), toolSearchOn: false };

test('core siempre recomendado con motivo', () => {
  const a = analyze(byId('context-mode'), prof([]), opts);
  assert.equal(a.recommended, true);
  assert.match(a.reason, /universal/);
});

test('suggested se activa por señal del perfil', () => {
  const a = analyze(byId('playwright'), prof(['frontend']), opts);
  assert.equal(a.recommended, true);
  assert.match(a.reason, /detectado/);
  assert.ok(a.signals.includes('frontend'));
});

test('suggested con requireTags sin cumplir -> no recomendado, motivo explica', () => {
  const a = analyze(byId('serena'), prof(['javascript']), opts);
  assert.equal(a.recommended, false);
  assert.match(a.reason, /falta/);
});

test('available no se recomienda sin Tool Search', () => {
  const a = analyze(byId('codebase-memory-mcp'), prof(['large']), { provided: new Set<string>(), toolSearchOn: false });
  assert.equal(a.recommended, false);
  assert.match(a.reason, /opt-in/);
});

test('available se recomienda con Tool Search + señal', () => {
  const a = analyze(byId('codebase-memory-mcp'), prof(['large']), { provided: new Set<string>(), toolSearchOn: true });
  assert.equal(a.recommended, true);
});

test('providedAlready cuando el MCP ya esta registrado', () => {
  const a = analyze(byId('playwright'), prof(['frontend']), { provided: new Set(['playwright']), toolSearchOn: false });
  assert.equal(a.providedAlready, true);
  assert.equal(a.recommended, false);
});

test('coste: peso pesado para MCP con muchas tools (sin Tool Search)', () => {
  assert.equal(weightOf(byId('playwright')), 'heavy');
  assert.equal(weightOf(byId('serena')), 'heavy');
  assert.equal(weightOf(byId('context7')), 'light');
});

test('coste: con Tool Search el tool-count deja de pesar', () => {
  assert.equal(weightOf(byId('playwright'), { toolSearchOn: true }), 'light');
  assert.equal(weightOf(byId('serena'), { toolSearchOn: true }), 'light');
  assert.equal(weightOf(byId('context7'), { toolSearchOn: true }), 'light');
});

test('analyze marca toolsDeferred y aligera el peso con Tool Search', () => {
  const off = analyze(byId('playwright'), prof(['frontend']), { provided: new Set<string>(), toolSearchOn: false });
  assert.equal(off.cost.toolsDeferred, false);
  assert.equal(off.cost.weight, 'heavy');
  const on = analyze(byId('playwright'), prof(['frontend']), { provided: new Set<string>(), toolSearchOn: true });
  assert.equal(on.cost.toolsDeferred, true);
  assert.equal(on.cost.weight, 'light');
  assert.equal(on.cost.tools, off.cost.tools);
});

test('needs refleja prerequisitos', () => {
  assert.ok(needsOf(byId('serena')).includes('uv'));
  assert.ok(needsOf(byId('codebase-memory-mcp')).includes('descarga binario'));
  assert.ok(needsOf(byId('obsidian')).includes('ruta'));
});

test('analyzeCatalog cubre todos los componentes', () => {
  const m = analyzeCatalog(cat.components, prof(['javascript', 'frontend', 'sizable']), opts);
  assert.equal(m.size, cat.components.length);
  for (const a of m.values()) assert.ok(typeof a.recommended === 'boolean' && a.reason);
});
