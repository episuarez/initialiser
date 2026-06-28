// src/recommend.ts — Sugerencias inteligentes via el plugin oficial
// claude-code-setup (skill claude-automation-recommender), ejecutado en Claude
// headless. Degrada al catalogo estatico si falta claude/plugin.
import { run, runAsync, hasCmd } from './install.js';
import type { RunResult } from './install.js';

const MARKETPLACE = 'anthropics/claude-plugins-official';
const PLUGIN = 'claude-code-setup';

// Solo ejecutamos comandos de instalacion con estos prefijos. El resto se muestra
// como advisory (no se ejecuta shell arbitrario del LLM).
const SAFE_INSTALL = /^(claude mcp add |claude plugin (install|i) |npx -y |npx @|npm i |npm install )/;
const SHELL_META = /[;&|`$(){}<>\n\r\\]/;

export interface Suggestion {
  category: string;
  name: string;
  why: string;
  install: string;
  installable: boolean;
}

const PROMPT = [
  'Use the claude-automation-recommender skill to analyze THIS codebase.',
  'Then output ONLY a JSON array (no prose, no markdown fences) of recommended Claude Code automations.',
  'Each item: {"category":"mcp"|"plugin"|"skill"|"hook"|"subagent","name":string,"why":string (<=110 chars),"install":string}.',
  'For "install": give the EXACT shell command for mcp servers and plugins (e.g. "claude mcp add context7 -- npx -y @upstash/context7-mcp"). For skill/hook/subagent set "install" to "".',
  'Max 8 items, the most valuable for this specific repo. Output the JSON array and nothing else.',
].join(' ');

export function recommenderAvailable(): boolean {
  return hasCmd('claude');
}

export function pluginInstalled(): boolean {
  if (!hasCmd('claude')) return false;
  const out = run('claude plugin list').out || '';
  return out.includes(PLUGIN);
}

export async function installRecommenderPlugin(onData?: (s: string) => void): Promise<boolean> {
  await runAsync(`claude plugin marketplace add ${MARKETPLACE}`, { onData });
  const r = await runAsync(`claude plugin install ${PLUGIN}@claude-plugins-official`, { onData, timeout: 120000 });
  return r.ok || pluginInstalled();
}

// Extrae el primer array JSON del texto (con o sin fences ```json).
export function extractJsonArray(text: string): unknown[] {
  if (!text) return [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1]! : text;
  const s = body.indexOf('['), e = body.lastIndexOf(']');
  if (s < 0 || e < 0 || e < s) return [];
  try { const a = JSON.parse(body.slice(s, e + 1)); return Array.isArray(a) ? a : []; }
  catch { return []; }
}

// True solo si el comando pasa el allowlist Y no tiene metacaracteres de shell.
export function isSafeInstall(cmd: unknown): boolean {
  const c = String(cmd || '').trim();
  return SAFE_INSTALL.test(c) && !SHELL_META.test(c);
}

// Normaliza el array crudo de sugerencias del modelo a la forma del wizard.
export function normalizeSuggestions(raw: unknown): Suggestion[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && 'name' in s && 'category' in s)
    .map((s) => {
      const install = String(s.install || '').trim();
      return {
        category: String(s.category),
        name: String(s.name),
        why: String(s.why || '').slice(0, 110),
        install,
        installable: isSafeInstall(install),
      };
    });
}

// Texto (posible envoltorio JSON de `claude -p`) -> sugerencias normalizadas.
export function parseSuggestions(text: string): Suggestion[] {
  let t = text;
  try { const env = JSON.parse(text); t = env.result ?? env.response ?? text; } catch { /* no era JSON */ }
  return normalizeSuggestions(extractJsonArray(t));
}

export interface RecommenderRun { ok: boolean; error?: string; suggestions: Suggestion[] }

// Corre el recomendador en Claude headless. installable=true solo si pasa SAFE_INSTALL.
export async function runRecommender(projectDir: string, onData?: (s: string) => void): Promise<RecommenderRun> {
  const cmd = `claude -p ${JSON.stringify(PROMPT)} --output-format json --allowedTools Read Glob Grep Bash`;
  const r = await runAsync(cmd, { cwd: projectDir, timeout: 240000, onData });
  if (!r.ok) return { ok: false, error: r.timedOut ? 'timeout' : `exit ${r.code}`, suggestions: [] };
  return { ok: true, suggestions: parseSuggestions(r.out) };
}

// Ejecuta un comando de instalacion ya validado (allowlist + sin metacaracteres).
export async function runInstall(cmd: string, onData?: (s: string) => void): Promise<RunResult | { ok: false; error: string }> {
  if (!isSafeInstall(cmd)) return { ok: false, error: 'bloqueado (fuera del allowlist)' };
  return runAsync(cmd, { timeout: 180000, onData });
}
