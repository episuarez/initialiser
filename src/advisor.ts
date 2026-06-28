// src/advisor.ts — Motor de recomendacion: analiza el perfil del repo y produce,
// por componente, DATOS para decidir (recomendado?, por que, señales que lo activan,
// coste en tools/peso/prerequisitos). Sin dependencias de UI: puro y testeable.
import type { Component } from './catalog.js';
import type { Analysis, Cost, Profile, Tier, Weight } from './types.js';

const TAG_LABEL: Record<string, string> = {
  javascript: 'JS/TS', python: 'Python', go: 'Go', rust: 'Rust', java: 'Java', csharp: 'C#',
  frontend: 'frontend', 'backend-node': 'backend Node', 'backend-python': 'backend Python',
  e2e: 'tests E2E', unity: 'Unity', sizable: 'codebase grande', large: 'codebase enorme',
  monorepo: 'monorepo', docs: 'documentos', design: 'diseño', tests: 'tests',
  'tests-node': 'tests JS', ci: 'CI', git: 'git', docker: 'Docker', ai: 'IA/LLM',
};
export const tagLabel = (t: string): string => TAG_LABEL[t] ?? t;

// Estimacion de tools MCP que añade cada componente (overhead de contexto). Aprox.
const TOOLS: Record<string, number> = {
  'context-mode': 9, 'sequential-thinking': 1, context7: 2, serena: 20, playwright: 25,
  markitdown: 1, pencil: 8, figma: 5, vault: 11, 'codebase-memory-mcp': 14, 'code-review-graph': 3,
};

export function toolsOf(c: Component): number | null {
  if (c.mcp && TOOLS[c.mcp.name] != null) return TOOLS[c.mcp.name]!;
  return TOOLS[c.id] ?? null;
}

function baseWeight(c: Component): Weight {
  const t = c.install?.type;
  if (t === 'pipx' || t === 'installer') return 'medium';
  if (t === 'npm' || t === 'project-npx' || t === 'rtk' || t === 'husky') return 'light';
  return c.mcp ? 'light' : 'none';
}

const WEIGHT_RANK: Record<Weight, number> = { none: 0, light: 1, medium: 2, heavy: 3 };

export interface AnalyzeOpts { provided?: Set<string>; toolSearchOn?: boolean }

// Con MCP Tool Search activo los schemas de tools se cargan bajo demanda: solo
// persiste el NOMBRE en contexto, no la definicion. El tool-count deja de pesar,
// asi que el peso pasa a depender solo de la instalacion. Sin Tool Search se
// mantiene la penalizacion por superficie de tools (modelo legacy).
export function weightOf(c: Component, opts: { toolSearchOn?: boolean } = {}): Weight {
  let w = baseWeight(c);
  const tools = toolsOf(c);
  if (tools != null && !opts.toolSearchOn) {
    if (tools >= 20) w = 'heavy';
    else if (tools >= 10 && WEIGHT_RANK[w] < 2) w = 'medium';
  }
  return w;
}

export function needsOf(c: Component): string[] {
  const n: string[] = [];
  if (c.install?.type === 'pipx') n.push('python+pipx');
  if (c.requires?.includes('uv')) n.push('uv');
  if (c.install?.type === 'rtk') n.push('cargo');
  if (c.install?.type === 'installer') n.push('descarga binario');
  if (c.mcp) n.push('claude');
  if (c.mcp?.envPrompt && !c.mcp.envPrompt.optional) n.push('token');
  if (c.mcp?.prompt && !c.mcp.prompt.optional) n.push('ruta');
  return n;
}

// Analiza un componente contra el perfil.
export function analyze(c: Component, profile: Profile, opts: AnalyzeOpts): Analysis {
  const provided = opts.provided ?? new Set<string>();
  const toolSearchOn = opts.toolSearchOn === true;
  const tier: Tier = c.tier ?? 'suggested';
  const providedAlready =
    provided.has(c.id.toLowerCase()) ||
    (!!c.mcp && provided.has(c.mcp.name.toLowerCase())) ||
    (!!c.install && 'bin' in c.install && !!c.install.bin && provided.has(c.install.bin.toLowerCase()));

  const signals = (c.recommendIf ?? []).filter((t) => profile.tags.has(t));
  let recommended = false, reason = '';

  if (providedAlready) {
    reason = 'ya instalado';
  } else if (tier === 'core') {
    recommended = true;
    reason = 'valor universal, overhead minimo';
  } else if (tier === 'available') {
    const ts = (c.recommendIfToolSearch ?? []).filter((t) => profile.tags.has(t));
    if (toolSearchOn && ts.length) { recommended = true; reason = 'opt-in (Tool Search activo): ' + ts.map(tagLabel).join(', '); }
    else reason = 'opt-in — actívalo si lo necesitas';
  } else {
    const orOk = signals.length > 0;
    const missing = (c.requireTags ?? []).filter((t) => !profile.tags.has(t));
    if (orOk && !missing.length) { recommended = true; reason = 'detectado: ' + signals.map(tagLabel).join(', '); }
    else if (orOk && missing.length) reason = 'aplica, pero falta: ' + missing.map(tagLabel).join(', ');
    else reason = 'no aplica a este repo';
  }

  const cost: Cost = {
    tools: toolsOf(c),
    toolsDeferred: toolSearchOn && toolsOf(c) != null,
    weight: weightOf(c, { toolSearchOn }),
    needs: needsOf(c),
  };

  return {
    id: c.id, name: c.name, group: c.group, tier,
    desc: c.desc ?? '',
    recommended, providedAlready, reason,
    signals: signals.map(tagLabel),
    cost,
  };
}

// Analiza el catalogo entero. Devuelve Map<id, analysis>.
export function analyzeCatalog(components: Component[], profile: Profile, opts: AnalyzeOpts): Map<string, Analysis> {
  return new Map(components.map((c) => [c.id, analyze(c, profile, opts)]));
}
