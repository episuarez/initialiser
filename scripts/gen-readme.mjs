#!/usr/bin/env node
// scripts/gen-readme.mjs — Regenera la tabla de componentes del README desde
// catalog/components.json (single source of truth). Reemplaza el contenido entre
// los marcadores COMPONENTS:TABLE. Texto por componente: campo `readme` (ingles,
// opcional) o, si falta, `desc`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const START = '<!-- COMPONENTS:TABLE START (auto-generado por scripts/gen-readme.mjs) -->';
const END = '<!-- COMPONENTS:TABLE END -->';

const TIER_LABEL = { core: 'Core', suggested: 'Suggested', available: 'Opt-in' };
const esc = (s) => String(s).replace(/\|/g, '\\|');

function buildTable() {
  const cat = JSON.parse(readFileSync(join(ROOT, 'catalog', 'components.json'), 'utf8'));
  const rows = cat.components.map(c =>
    `| **${esc(c.name)}** | ${esc(c.group)} | ${TIER_LABEL[c.tier ?? 'suggested']} | ${esc(c.readme ?? c.desc)} |`);
  return [
    '| Component | Group | Default | What it does |',
    '|-----------|-------|---------|--------------|',
    ...rows,
  ].join('\n');
}

function main() {
  const path = join(ROOT, 'README.md');
  const md = readFileSync(path, 'utf8');
  const i = md.indexOf(START), j = md.indexOf(END);
  if (i < 0 || j < 0 || j < i) {
    console.error(`Marcadores ${START} / ${END} no encontrados en README.md`);
    process.exit(1);
  }
  const next = md.slice(0, i + START.length) + '\n' + buildTable() + '\n' + md.slice(j);
  if (next === md) { console.log('README ya sincronizado.'); return; }
  writeFileSync(path, next);
  console.log('README: tabla de componentes regenerada.');
}

main();
