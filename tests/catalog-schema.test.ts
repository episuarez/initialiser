// tests/catalog-schema.test.ts — Valida el catálogo real contra el esquema zod.
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalog, ComponentSchema, CATALOG_DIR } from '../src/catalog.js';

describe('catalog zod schema', () => {
  it('el components.json real cumple el esquema', () => {
    const cat = loadCatalog();
    expect(cat.components.length).toBeGreaterThan(0);
    expect(Array.isArray(cat.projectSkills)).toBe(true);
  });

  it('ids unicos', () => {
    const ids = loadCatalog().components.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rechaza un componente con tier invalido', () => {
    const bad = { id: 'x', name: 'X', group: 'G', tier: 'nope', desc: 'd' };
    expect(ComponentSchema.safeParse(bad).success).toBe(false);
  });

  it('hay >=20 project skills y cada una tiene su fichero SKILL', () => {
    const cat = loadCatalog();
    expect(cat.projectSkills.length).toBeGreaterThanOrEqual(20);
    for (const s of cat.projectSkills) {
      const file = join(CATALOG_DIR, 'skills', `${s.id}.md`);
      expect(existsSync(file), `falta catalog/skills/${s.id}.md`).toBe(true);
    }
  });

  it('los userSkills de componentes tienen su fichero SKILL', () => {
    const cat = loadCatalog();
    for (const c of cat.components) {
      for (const us of c.userSkills ?? []) {
        const file = join(CATALOG_DIR, 'skills', `${us}.md`);
        expect(existsSync(file), `falta catalog/skills/${us}.md (userSkill de ${c.id})`).toBe(true);
      }
    }
  });

  it('conflictsWith referencia ids existentes y es simetrico', () => {
    const cat = loadCatalog();
    const ids = new Set(cat.components.map((c) => c.id));
    for (const c of cat.components) {
      for (const other of c.conflictsWith ?? []) {
        expect(ids.has(other), `${c.id} -> ${other} inexistente`).toBe(true);
        const back = cat.components.find((x) => x.id === other);
        expect(back?.conflictsWith ?? []).toContain(c.id);
      }
    }
  });
});
