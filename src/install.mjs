// src/install.mjs — Instaladores con checks (nunca reinstala lo presente).
import { execSync, spawnSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export function run(cmd, { visible = false, cwd = undefined, timeout = undefined } = {}) {
  try {
    const out = execSync(cmd, { stdio: visible ? 'inherit' : 'pipe', encoding: 'utf8', input: '', cwd, timeout });
    return { ok: true, out: out ?? '' };
  } catch (e) {
    const timedOut = e.code === 'ETIMEDOUT' || e.signal === 'SIGTERM';
    return { ok: false, out: (e.stdout ?? '') + (e.stderr ?? ''), code: e.status, timedOut };
  }
}

export function hasCmd(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0;
}

// Variante asincrona de run(): NO bloquea el event loop, asi el spinner/ticker
// siguen animando durante instalaciones largas (npm -g, pipx, cargo, npx).
// onData recibe cada chunk de salida (para heartbeat/streaming).
export function runAsync(cmd, { cwd = undefined, timeout = undefined, onData = undefined } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, { shell: true, cwd, windowsHide: true });
    let out = '', timedOut = false;
    const t = timeout ? setTimeout(() => { timedOut = true; child.kill(); }, timeout) : null;
    const collect = (d) => { const s = d.toString(); out += s; if (onData) onData(s); };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (e) => { if (t) clearTimeout(t); resolve({ ok: false, out: out + String(e), code: null, timedOut }); });
    child.on('close', (code) => { if (t) clearTimeout(t); resolve({ ok: code === 0 && !timedOut, out, code, timedOut }); });
  });
}

export function claudeVersion() {
  if (!hasCmd('claude')) return null;
  const m = (run('claude --version').out || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? { major: +m[1], minor: +m[2], patch: +m[3], raw: m[0] } : null;
}

// MCP Tool Search: carga schemas de tools bajo demanda (~85% menos overhead).
// On por defecto desde Claude Code 2.1; override con ENABLE_TOOL_SEARCH.
export function toolSearchState() {
  const e = (process.env.ENABLE_TOOL_SEARCH || '').toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(e)) return { on: true, reason: 'ENABLE_TOOL_SEARCH' };
  if (['0', 'false', 'off', 'no'].includes(e)) return { on: false, reason: 'ENABLE_TOOL_SEARCH=off' };
  const v = claudeVersion();
  if (!v) return { on: null, reason: 'claude no detectado' };
  const on = v.major > 2 || (v.major === 2 && v.minor >= 1);
  return { on, reason: on ? `default (CC ${v.raw})` : `CC ${v.raw} <2.1` };
}

let _npmList = null;
export function npmHas(pkg) {
  if (_npmList === null) _npmList = run('npm list -g --depth=0').out;
  return _npmList.includes(pkg.replace(/@(alpha|latest|beta)$/, ''));
}

let _pipxList = null;
export function pipxHas(pkg) {
  if (!hasCmd('pipx')) return false;
  if (_pipxList === null) _pipxList = run('pipx list').out;
  return _pipxList.toLowerCase().includes(pkg.toLowerCase().replace(/\[.*\]$/, ''));
}

let _mcpList = null;
export function mcpList() {
  if (_mcpList === null) {
    if (!hasCmd('claude')) { _mcpList = []; return _mcpList; }
    const out = run('claude mcp list').out;
    _mcpList = [...out.matchAll(/^\s*([\w-]+)\s*:/gm)].map(m => m[1]);
  }
  return _mcpList;
}
export function mcpHas(name) { return mcpList().includes(name); }
export function mcpInvalidate() { _mcpList = null; }

export function installedPlugins() {
  const dir = join(homedir(), '.claude', 'plugins');
  if (!existsSync(dir)) return [];
  const names = [];
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      names.push(e.name);
      try {
        for (const sub of readdirSync(join(dir, e.name), { withFileTypes: true }))
          if (sub.isDirectory()) names.push(sub.name);
      } catch {}
    }
  } catch {}
  return names;
}

// Instalador generico segun el tipo declarado en components.json
export async function installComponent(comp, ctx) {
  const inst = comp.install;
  const results = [];

  // Instalaciones largas pasan por runAsync (no bloquea el event loop -> spinner vivo).
  const onData = ctx.onProgress;
  // 1) Binario/paquete
  if (inst) {
    if (inst.type === 'npm') {
      const bin = inst.bin ?? inst.pkg.split('@')[0];
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
        if (inst.also) await runAsync(`pipx install ${inst.also}`, { onData });
        results.push(['bin', r.ok ? 'INSTALLED' : 'FAIL']);
        _pipxList = null;
      }
      if (inst.post) await runAsync(inst.post, { onData });
    } else if (inst.type === 'rtk') {
      if (hasCmd('rtk')) results.push(['bin', 'PRESENT']);
      else if (!hasCmd('cargo')) {
        // Recomendar != instalar: no arrastramos un toolchain Rust sin permiso.
        results.push(['bin', 'SKIPPED (instala Rust en rustup.rs y luego: init-claude upgrade)']);
      } else {
        const r = await runAsync('cargo install --git https://github.com/rtk-ai/rtk --locked --force', { onData });
        if (r.ok) { await runAsync('rtk init -g --auto-patch'); results.push(['bin', 'INSTALLED (Windows: modo CLAUDE.md injection)']); }
        else results.push(['bin', 'FAIL (cargo)']);
      }
    } else if (inst.type === 'project-npx') {
      // Comando npx que escribe en el proyecto (p.ej. autoskills -> .claude/skills/).
      const r = await runAsync(inst.cmd, { cwd: ctx.projectDir, timeout: 180000, onData });
      results.push(['skills', r.ok ? 'INSTALLED' : (r.timedOut ? 'TIMEOUT (180s)' : `FAIL (exit ${r.code})`)]);
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
    if (mcpHas(comp.mcp.name)) results.push(['mcp', 'PRESENT']);
    else {
      let cmd = comp.mcp.cmd;
      const ek = comp.mcp.envKeyArg;
      if (ek && process.env[ek.var]) cmd += ` ${ek.arg} ${process.env[ek.var]}`;
      await runAsync(`claude mcp add ${comp.mcp.name} -s user -- ${cmd}`, { onData });
      mcpInvalidate();
      results.push(['mcp', mcpHas(comp.mcp.name) ? 'REGISTERED' : 'FAIL']);
    }
  }

  return results;
}
