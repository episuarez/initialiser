// src/install.ts — Instaladores con checks (nunca reinstala lo presente).
import { execSync, spawnSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Component } from './catalog.js';
import type { InstallResult, ToolSearchState } from './types.js';

export interface RunResult { ok: boolean; out: string; code?: number | null; timedOut?: boolean }
export interface RunOpts { visible?: boolean; cwd?: string; timeout?: number }
export interface AsyncOpts { cwd?: string; timeout?: number; onData?: (s: string) => void }

export function run(cmd: string, { visible = false, cwd = undefined, timeout = undefined }: RunOpts = {}): RunResult {
  try {
    const out = execSync(cmd, { stdio: visible ? 'inherit' : 'pipe', encoding: 'utf8', input: '', cwd, timeout });
    return { ok: true, out: out ?? '' };
  } catch (e: any) {
    const timedOut = e.code === 'ETIMEDOUT' || e.signal === 'SIGTERM';
    return { ok: false, out: (e.stdout ?? '') + (e.stderr ?? ''), code: e.status, timedOut };
  }
}

export function hasCmd(cmd: string): boolean {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0;
}

// Variante asincrona de run(): NO bloquea el event loop, asi el spinner/ticker
// siguen animando durante instalaciones largas (npm -g, pipx, cargo, npx).
export function runAsync(cmd: string, { cwd = undefined, timeout = undefined, onData = undefined }: AsyncOpts = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, cwd, windowsHide: true });
    let out = '', timedOut = false;
    const t = timeout ? setTimeout(() => { timedOut = true; child.kill(); }, timeout) : null;
    const collect = (d: Buffer) => { const s = d.toString(); out += s; if (onData) onData(s); };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (e) => { if (t) clearTimeout(t); resolve({ ok: false, out: out + String(e), code: null, timedOut }); });
    child.on('close', (code) => { if (t) clearTimeout(t); resolve({ ok: code === 0 && !timedOut, out, code, timedOut }); });
  });
}

export function claudeVersion(): { major: number; minor: number; patch: number; raw: string } | null {
  if (!hasCmd('claude')) return null;
  const m = (run('claude --version').out || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? { major: +m[1]!, minor: +m[2]!, patch: +m[3]!, raw: m[0] } : null;
}

// MCP Tool Search: carga schemas de tools bajo demanda (~85% menos overhead). No es
// flag por version: es por UMBRAL. Override con ENABLE_TOOL_SEARCH ('off'|'on'|'auto:N').
export function toolSearchState(): ToolSearchState {
  const e = (process.env.ENABLE_TOOL_SEARCH || '').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(e))
    return { on: false, mode: 'off', threshold: null, reason: 'ENABLE_TOOL_SEARCH=off' };
  const m = e.match(/^auto:(\d+)$/);
  if (m) return { on: true, mode: 'auto', threshold: +m[1]!, reason: `ENABLE_TOOL_SEARCH=auto:${m[1]}` };
  if (['1', 'true', 'on', 'yes'].includes(e))
    return { on: true, mode: 'forced', threshold: null, reason: 'ENABLE_TOOL_SEARCH=on (forzado)' };
  if (!hasCmd('claude')) return { on: null, mode: 'auto', threshold: 10, reason: 'claude no detectado' };
  return { on: true, mode: 'auto', threshold: 10, reason: 'default (auto:10%)' };
}

let _npmList: string | null = null;
export function npmHas(pkg: string): boolean {
  if (_npmList === null) _npmList = run('npm list -g --depth=0').out;
  return _npmList.includes(pkg.replace(/@(alpha|latest|beta)$/, ''));
}

let _pipxList: string | null = null;
export function pipxHas(pkg: string): boolean {
  if (!hasCmd('pipx')) return false;
  if (_pipxList === null) _pipxList = run('pipx list').out;
  return _pipxList.toLowerCase().includes(pkg.toLowerCase().replace(/\[.*\]$/, ''));
}

// Nombres de MCPs registrados, leidos de la CONFIG (no `claude mcp list`, que hace
// health-check a cada server y tarda ~20s bloqueando el event loop).
let _mcpList: string[] | null = null;
export function mcpList(): string[] {
  if (_mcpList !== null) return _mcpList;
  const names = new Set<string>();
  const add = (obj: unknown) => { if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) names.add(k); };
  const cwd = process.cwd(), cwdFwd = cwd.replace(/\\/g, '/');
  try {
    const j = JSON.parse(readFileSync(join(homedir(), '.claude.json'), 'utf8'));
    add(j.mcpServers);
    add(j.projects?.[cwd]?.mcpServers);
    add(j.projects?.[cwdFwd]?.mcpServers);
  } catch { /* sin config global */ }
  try { add(JSON.parse(readFileSync(join(cwd, '.mcp.json'), 'utf8')).mcpServers); } catch { /* sin .mcp.json */ }
  _mcpList = [...names];
  return _mcpList;
}
export function mcpHas(name: string): boolean { return mcpList().includes(name); }
export function mcpInvalidate(): void { _mcpList = null; }

// Desinstala una MCP de scope 'local' (este proyecto). Corre desde projectDir.
export async function removeMcp(name: string, projectDir: string, onData?: (s: string) => void): Promise<RunResult> {
  const r = await runAsync(`claude mcp remove ${name} -s local`, { cwd: projectDir, onData });
  mcpInvalidate();
  return r;
}

export function installedPlugins(): string[] {
  const dir = join(homedir(), '.claude', 'plugins');
  if (!existsSync(dir)) return [];
  const names: string[] = [];
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      names.push(e.name);
      try {
        for (const sub of readdirSync(join(dir, e.name), { withFileTypes: true }))
          if (sub.isDirectory()) names.push(sub.name);
      } catch { /* subdir ilegible */ }
    }
  } catch { /* sin plugins */ }
  return names;
}

export interface InstallCtx {
  projectDir: string;
  hasPython: boolean;
  answers: Record<string, Record<string, string>>;
  onProgress?: (s: string) => void;
}

// Instalador generico segun el tipo declarado en components.json
export async function installComponent(comp: Component, ctx: InstallCtx): Promise<InstallResult> {
  const inst = comp.install;
  const results: InstallResult = [];
  const onData = ctx.onProgress;

  // 1) Binario/paquete
  if (inst) {
    if (inst.type === 'npm') {
      const bin = inst.bin ?? inst.pkg.split('@')[0]!;
      if (npmHas(inst.pkg) || hasCmd(bin)) results.push(['bin', 'PRESENT']);
      else {
        const r = await runAsync(`npm install -g ${inst.pkg}`, { onData });
        results.push(['bin', r.ok ? 'INSTALLED' : `FAIL (npm exit ${r.code})`]);
        _npmList = null;
      }
    } else if (inst.type === 'pipx') {
      if (!ctx.hasPython) { results.push(['bin', 'SKIPPED (sin Python)']); return results; }
      const bin = inst.bin ?? inst.pkg.replace(/\[.*\]$/, '');
      if (pipxHas(inst.pkg) || hasCmd(bin)) results.push(['bin', 'PRESENT']);
      else {
        const r = await runAsync(`pipx install "${inst.pkg}"`, { onData });
        // `also`/`post` solo si la instalacion fue bien (no re-ejecutar en cada run ni tras fallo).
        if (r.ok && inst.also) await runAsync(`pipx install ${inst.also}`, { onData });
        if (r.ok && inst.post) await runAsync(inst.post, { onData });
        results.push(['bin', r.ok ? 'INSTALLED' : 'FAIL']);
        _pipxList = null;
      }
    } else if (inst.type === 'rtk') {
      if (hasCmd('rtk')) results.push(['bin', 'PRESENT']);
      else if (!hasCmd('cargo')) {
        results.push(['bin', 'SKIPPED (instala Rust en rustup.rs y luego: init-claude upgrade)']);
      } else {
        const r = await runAsync('cargo install --git https://github.com/rtk-ai/rtk --locked --force', { onData });
        if (r.ok) { await runAsync('rtk init -g --auto-patch'); results.push(['bin', 'INSTALLED (Windows: modo CLAUDE.md injection)']); }
        else results.push(['bin', 'FAIL (cargo)']);
      }
    } else if (inst.type === 'project-npx') {
      const r = await runAsync(inst.cmd, { cwd: ctx.projectDir, timeout: 180000, onData });
      results.push(['skills', r.ok ? 'INSTALLED' : (r.timedOut ? 'TIMEOUT (180s)' : `FAIL (exit ${r.code})`)]);
    } else if (inst.type === 'installer') {
      if (hasCmd(inst.bin)) results.push(['bin', 'PRESENT']);
      else {
        const flags = inst.flags ?? '';
        const cmd = process.platform === 'win32'
          ? `powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=Join-Path $env:TEMP 'cbm-install.ps1'; Invoke-WebRequest -UseBasicParsing '${inst.psUrl}' -OutFile $f; & $f ${flags}"`
          : `curl -fsSL ${inst.shUrl} | bash -s -- ${flags}`;
        const r = await runAsync(cmd, { timeout: 300000, onData });
        results.push(['bin', r.ok ? 'INSTALLED' : (r.timedOut ? 'TIMEOUT (300s)' : `FAIL (exit ${r.code})`)]);
      }
    } else if (inst.type === 'husky') {
      const proj = ctx.projectDir;
      if (existsSync(join(proj, '.husky'))) results.push(['bin', 'PRESENT']);
      else if (existsSync(join(proj, 'package.json')) && existsSync(join(proj, '.git'))) {
        await runAsync(`npm install --save-dev husky lint-staged`, { cwd: proj, onData });
        await runAsync(`npx husky init`, { cwd: proj, onData });
        results.push(['bin', existsSync(join(proj, '.husky')) ? 'INSTALLED' : 'FAIL']);
      } else results.push(['bin', 'SKIPPED (sin package.json/.git)']);
    }
  }

  // 2) Requisitos (uv para serena, etc.)
  if (comp.requires?.includes('uv') && !hasCmd('uv')) {
    if (ctx.hasPython && hasCmd('pipx')) { await runAsync('pipx install uv', { onData }); }
    if (!hasCmd('uv')) { results.push(['mcp', 'SKIPPED (falta uv)']); return results; }
  }

  // 3) MCP
  if (comp.mcp) {
    let cmd = comp.mcp.cmd;
    let envFlags = '';
    const clean = (v: unknown) => String(v).replace(/["`\r\n]/g, '').trim();
    const ek = comp.mcp.envKeyArg;
    if (ek && process.env[ek.var]) cmd += ` ${ek.arg} ${process.env[ek.var]}`;
    const pr = comp.mcp.prompt;
    if (pr) {
      const val = ctx.answers?.[comp.id]?.[pr.key] ?? (pr.env ? process.env[pr.env] : undefined);
      if (!val) { if (!pr.optional) { results.push(['mcp', `SKIPPED (falta ${pr.key})`]); return results; } }
      else cmd += ` "${clean(val)}"`;
    }
    const ep = comp.mcp.envPrompt;
    if (ep) {
      const val = ctx.answers?.[comp.id]?.[ep.var] ?? (ep.env ? process.env[ep.env] : undefined);
      if (!val) { if (!ep.optional) { results.push(['mcp', `SKIPPED (falta ${ep.var})`]); return results; } }
      else envFlags += ` -e ${ep.var}="${clean(val)}"`;
    }
    const userVal = Boolean(ctx.answers?.[comp.id] && Object.keys(ctx.answers[comp.id]!).length);
    const existed = mcpHas(comp.mcp.name);
    if (existed && !userVal) { results.push(['mcp', 'PRESENT']); return results; }
    // Scope 'local': la MCP se registra SOLO en este proyecto.
    if (existed) await runAsync(`claude mcp remove ${comp.mcp.name} -s local`, { onData, cwd: ctx.projectDir });
    await runAsync(`claude mcp add ${comp.mcp.name} -s local${envFlags} -- ${cmd}`, { onData, cwd: ctx.projectDir });
    mcpInvalidate();
    const ok = mcpHas(comp.mcp.name);
    results.push(['mcp', ok ? (existed ? 'RE-REGISTERED' : 'REGISTERED') : 'FAIL']);
  }

  return results;
}
