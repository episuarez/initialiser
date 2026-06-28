// src/ui.ts — Helpers de presentacion de consola: ancho, TTY, unicode, barras,
// traduccion de estados internos a espanol, resumen alineado y remedios de fallo.
// Sin dependencias de @clack: funciones puras testeables.
import pc from 'picocolors';
import type { Analysis, Cost, Tier, Weight } from './types.js';

export function termWidth(): number { return process.stdout.columns || 80; }
export function isTTY(): boolean { return Boolean(process.stdout.isTTY); }

// UTF-8 capaz? Windows con codepage != 65001 (cmd.exe clasico) rompe █░ ✓ ✗.
// Heuristica conservadora: Terminal nuevo / VSCode / WT / encoding UTF-8.
export function unicodeOk(): boolean {
  if (process.platform !== 'win32') return true;
  return Boolean(
    process.env.WT_SESSION ||
    process.env.TERM_PROGRAM === 'vscode' ||
    /UTF-8|65001/i.test(process.env.PYTHONIOENCODING || '') ||
    /UTF-8|65001/i.test(process.env.LANG || '')
  );
}

export function barChars(): { full: string; empty: string } {
  return unicodeOk() ? { full: '█', empty: '░' } : { full: '#', empty: '-' };
}
export function sym() {
  return unicodeOk()
    ? { ok: '✓', fail: '✗', skip: '–', dot: '•', boxOn: '[x]', boxOff: '[ ]', warn: '!' }
    : { ok: '+', fail: 'x', skip: '-', dot: '*', boxOn: '[x]', boxOff: '[ ]', warn: '!' };
}

const ELLIPSIS = '…';
// Trunca por ancho visible (sin ANSI). max por defecto = ancho del terminal.
export function truncate(str: unknown, max: number = termWidth()): string {
  const s = String(str ?? '');
  if (max <= 1) return s.slice(0, max);
  return s.length <= max ? s : s.slice(0, max - 1) + ELLIPSIS;
}

export function progressBar(done: number, total: number, width = 20): string {
  const { full, empty } = barChars();
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 1;
  const fill = Math.round(ratio * width);
  return `[${full.repeat(fill)}${empty.repeat(width - fill)}] ${done}/${total}`;
}

// Spinner minimo que necesita elapsedTicker (clack expone .message()).
interface Spinnerish { message(msg: string): void }

// Ticker de segundos para esperas de duracion DESCONOCIDA (procesos headless,
// instalaciones de red): no hay % real que mostrar, asi que se anima el tiempo
// transcurrido sobre el spinner. Devuelve la funcion para detenerlo.
export function elapsedTicker(spinner: Spinnerish, label: string): () => void {
  let secs = 0;
  const id = setInterval(() => { secs++; spinner.message(`${label} ${pc.gray(secs + 's')}`); }, 1000);
  return () => clearInterval(id);
}

export type StatusKind = 'ok' | 'present' | 'skip' | 'fail';
export interface StatusInfo { kind: StatusKind; text: string }

// Traduce un valor de estado interno a {kind, text}.
export function statusLabel(raw: unknown): StatusInfo {
  const v = String(raw ?? '').trim();
  const tail = (v.match(/\(([^)]*)\)/) || [])[1];
  const paren = tail ? ` (${tail})` : '';
  if (/^FAIL|^ERROR/i.test(v)) return { kind: 'fail', text: 'fallo' + paren };
  if (/^TIMEOUT/i.test(v)) return { kind: 'fail', text: 'timeout' + paren };
  if (/^SKIPPED/i.test(v)) return { kind: 'skip', text: 'omitido' + paren };
  if (/^MISSING/i.test(v)) return { kind: 'skip', text: 'no encontrado' };
  if (/^PRESENT/i.test(v)) return { kind: 'present', text: 'ya presente' };
  if (/^RE-REGISTERED/i.test(v)) return { kind: 'ok', text: 'reconfigurado' };
  if (/^REMOVED/i.test(v)) return { kind: 'present', text: 'desinstalado' };
  if (/^REGISTERED/i.test(v)) return { kind: 'ok', text: 'registrado' };
  if (/^INSTALLED/i.test(v)) return { kind: 'ok', text: 'instalado' + paren };
  if (/^CREATED/i.test(v)) return { kind: 'ok', text: 'creado' };
  if (/^UPDATED/i.test(v)) return { kind: 'ok', text: 'actualizado' + paren };
  return { kind: 'ok', text: v.toLowerCase() };
}

export function colorByKind(kind: StatusKind, s: string): string {
  if (kind === 'fail') return pc.red(s);
  if (kind === 'skip') return pc.yellow(s);
  if (kind === 'present') return pc.gray(s);
  return pc.green(s);
}

const KEY_LABEL: Record<string, string> = { bin: 'binario', mcp: 'MCP', skills: 'skills' };

// Una fila del resumen: [name, parts, failed, ms?] con parts = [[key, value]].
export type SummaryRow = [string, [string, string][], boolean, number?];

// Devuelve string alineado para p.note. ms (opcional): tiempo del componente;
// se muestra y se resalta en amarillo si es lento (>=1.5s) para explicar la espera.
export function formatSummary(results: SummaryRow[]): string {
  const s = sym();
  const nameW = Math.min(24, Math.max(8, ...results.map(([n]) => n.length)));
  return results.map(([name, parts, failed, ms]) => {
    const icon = failed ? pc.red(s.fail) : pc.green(s.ok);
    const cells = (parts || []).map(([k, v]) => {
      const st = statusLabel(v);
      return `${KEY_LABEL[k] ?? k}: ${colorByKind(st.kind, st.text)}`;
    }).join(pc.gray(' · '));
    let time = '';
    if (ms != null) {
      const txt = ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms';
      time = '  ' + (ms >= 1500 ? pc.yellow(txt) : pc.gray(txt));
    }
    return `${icon} ${name.padEnd(nameW)}  ${cells}${time}`;
  }).join('\n');
}

// Remedio accionable para un valor de fallo/omision.
export function remedyFor(value: unknown): string {
  const v = String(value).toLowerCase();
  if (v.includes('sin python')) return 'instala Python 3 + pipx (pip install pipx)';
  if (v.includes('falta uv')) return 'instala uv: pipx install uv';
  if (v.includes('rust') || v.includes('cargo')) return 'instala Rust en rustup.rs y reintenta: init-claude upgrade';
  if (v.includes('npm')) return 'reintenta a mano: npm install -g <pkg>';
  if (v.includes('pipx')) return 'verifica pipx: pipx --version';
  if (v.includes('timeout')) return 'red lenta o instalador colgado; reintenta o instala a mano';
  if (v.includes('falta')) return 're-ejecuta el wizard y proporciona el dato pedido';
  if (v.includes('.git')) return 'inicia git (git init) si quieres los hooks';
  return 'revisa el log del comando e instala a mano';
}

// Enmascara un valor sensible (token) para mostrarlo sin filtrarlo.
export function mask(v: unknown): string {
  const s = String(v);
  return s.length <= 6 ? '***' : s.slice(0, 3) + '***' + s.slice(-2);
}

// Coste visual del peso: ●●○ coloreado (verde ligero / amarillo medio / rojo pesado).
export function weightDots(weight: Weight): string {
  const u = unicodeOk(), f = u ? '●' : '#', e = u ? '○' : '-';
  const n = weight === 'heavy' ? 3 : weight === 'medium' ? 2 : weight === 'light' ? 1 : 0;
  const dots = f.repeat(n) + e.repeat(3 - n);
  return weight === 'heavy' ? pc.red(dots) : weight === 'medium' ? pc.yellow(dots) : weight === 'light' ? pc.green(dots) : pc.gray(dots);
}

// Texto de coste: "9 tools · req: token". Vacio si no hay datos.
export function costTag(cost: Cost): string {
  const parts: string[] = [];
  if (cost.tools != null) parts.push(`${cost.tools} tools${cost.toolsDeferred ? ' (diferido)' : ''}`);
  if (cost.needs?.length) parts.push('req: ' + cost.needs.join('+'));
  return parts.join(pc.gray(' · '));
}

const TIER_TAG: Record<Tier, () => string> = {
  core: () => pc.bgGreen(pc.black(' core ')),
  suggested: () => pc.cyan('sugerido'),
  available: () => pc.yellow('opt-in'),
};
export const tierTag = (t: Tier): string => (TIER_TAG[t] ?? TIER_TAG.suggested)();

// Una linea del informe de recomendacion: ● nombre peso  QUE-ES-Y-HACE  · motivo · coste
// La descripcion (que es / que hace) es protagonista: el usuario sabe que obtiene.
export function recoLine(a: Analysis, nameW = 18): string {
  const icon = a.providedAlready ? pc.gray(sym().dot) : a.recommended ? pc.green(sym().ok) : pc.gray(sym().dot);
  const name = a.providedAlready ? pc.gray(a.name.padEnd(nameW)) : a.name.padEnd(nameW);
  const cost = costTag(a.cost);
  const desc = a.desc ? truncate(a.desc, 64) : '';
  const tail = [a.reason, cost].filter(Boolean).join(' · ');
  const body = a.providedAlready
    ? pc.gray(`${desc}${tail ? '  · ' + tail : ''}`)
    : `${desc}${tail ? pc.gray('  · ' + tail) : ''}`;
  return `${icon} ${name} ${weightDots(a.cost.weight)}  ${body}`;
}
