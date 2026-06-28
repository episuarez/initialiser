// src/catalog.ts — Esquema zod del catálogo + cargador validado. Una sola fuente
// de verdad: el esquema valida components.json en runtime y deriva el tipo Component.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const __dir = dirname(fileURLToPath(import.meta.url));
// En dev: src/ → ../catalog. En el bundle dist/init-claude.js → ../catalog (raíz).
export const CATALOG_DIR = join(__dir, '..', 'catalog');

const PromptSchema = z.object({
  key: z.string(),
  env: z.string().optional(),
  message: z.string(),
  placeholder: z.string().optional(),
  optional: z.boolean().optional(),
  validate: z.enum(['dir']).optional(),
});

const EnvPromptSchema = z.object({
  var: z.string(),
  env: z.string().optional(),
  message: z.string(),
  placeholder: z.string().optional(),
  optional: z.boolean().optional(),
});

const McpSchema = z.object({
  name: z.string(),
  cmd: z.string(),
  envKeyArg: z.object({ var: z.string(), arg: z.string() }).optional(),
  envPrompt: EnvPromptSchema.optional(),
  prompt: PromptSchema.optional(),
});

const InstallSchema = z.union([
  z.object({ type: z.literal('npm'), pkg: z.string(), bin: z.string().optional() }),
  z.object({ type: z.literal('pipx'), pkg: z.string(), bin: z.string().optional(), also: z.string().optional(), post: z.string().optional() }),
  z.object({ type: z.literal('rtk') }),
  z.object({ type: z.literal('project-npx'), cmd: z.string() }),
  z.object({ type: z.literal('husky') }),
  z.object({ type: z.literal('installer'), bin: z.string(), shUrl: z.string(), psUrl: z.string(), flags: z.string().optional() }),
]);

export const ComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  group: z.string(),
  tier: z.enum(['core', 'suggested', 'available']),
  desc: z.string(),
  install: InstallSchema.nullable().optional(),
  mcp: McpSchema.nullable().optional(),
  claudemd: z.string().nullable().optional(),
  claudemdSection: z.string().nullable().optional(),
  docTier: z.enum(['discovery']).optional(),
  memoryLevel: z.enum(['durable', 'semantic']).optional(),
  recommendIf: z.array(z.string()).optional(),
  requireTags: z.array(z.string()).optional(),
  recommendIfToolSearch: z.array(z.string()).optional(),
  conflictsWith: z.array(z.string()).optional(),
  userSkills: z.array(z.string()).optional(),
  requires: z.array(z.string()).optional(),
});

export const ProjectSkillSchema = z.object({
  id: z.string(),
  desc: z.string(),
  always: z.boolean().optional(),
  recommendIf: z.array(z.string()).optional(),
  requireTags: z.array(z.string()).optional(),
});

export const CatalogSchema = z.object({
  components: z.array(ComponentSchema).min(1),
  projectSkills: z.array(ProjectSkillSchema),
});

export type Component = z.infer<typeof ComponentSchema>;
export type ProjectSkill = z.infer<typeof ProjectSkillSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;

// Carga y VALIDA el catálogo. Lanza con mensaje claro si components.json no cumple
// el esquema (evita fallos sutiles aguas abajo).
export function loadCatalog(dir: string = CATALOG_DIR): Catalog {
  const raw = JSON.parse(readFileSync(join(dir, 'components.json'), 'utf8'));
  const parsed = CatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('catalog/components.json invalido:\n' + z.prettifyError(parsed.error));
  }
  return parsed.data;
}
