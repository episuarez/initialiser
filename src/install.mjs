// src/install.mjs — Instaladores con checks (nunca reinstala lo presente).
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export function run(cmd, { visible = false, cwd = undefined } = {}) {
  try {
    const out = execSync(cmd, { stdio: visible ? 'inherit' : 'pipe', encoding: 'utf8', input: '', cwd });
    return { ok: true, out: out ?? '' };
  } catch (e) {
    return { ok: false, out: (e.stdout ?? '') + (e.stderr ?? ''), code: e.status };
  }
}

export function hasCmd(cmd) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0;
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

  // 1) Binario/paquete
  if (inst) {
    if (inst.type === 'npm') {
      const bin = inst.bin ?? inst.pkg.split('@')[0];
      if (npmHas(inst.pkg) || hasCmd(bin)) results.push(['bin', 'PRESENT']);
      else {
        const r = run(`npm install -g ${inst.pkg}`);
        results.push(['bin', r.ok ? 'INSTALLED' : `FAIL (npm exit ${r.code})`]);
        _npmList = null;
      }
    } else if (inst.type === 'pipx') {
      if (!ctx.hasPython) { results.push(['bin', 'SKIPPED (sin Python)']); return results; }
      const bin = inst.bin ?? inst.pkg.replace(/\[.*\]$/, '');
      if (pipxHas(inst.pkg) || hasCmd(bin)) results.push(['bin', 'PRESENT']);
      else {
        const r = run(`pipx install "${inst.pkg}"`);
        if (inst.also) run(`pipx install ${inst.also}`);
        results.push(['bin', r.ok ? 'INSTALLED' : 'FAIL']);
        _pipxList = null;
      }
      if (inst.post) run(inst.post);
    } else if (inst.type === 'rtk') {
      if (hasCmd('rtk')) results.push(['bin', 'PRESENT']);
      else {
        if (!hasCmd('cargo')) {
          if (hasCmd('winget')) run('winget install -e --id Rustlang.Rustup --silent --accept-source-agreements --accept-package-agreements');
          if (!hasCmd('cargo')) { results.push(['bin', 'FAIL (instala Rust: rustup.rs)']); return results; }
        }
        const r = run('cargo install --git https://github.com/rtk-ai/rtk --locked --force');
        if (r.ok) { run('rtk init -g --auto-patch'); results.push(['bin', 'INSTALLED (Windows: modo CLAUDE.md injection)']); }
        else results.push(['bin', 'FAIL (cargo)']);
      }
    } else if (inst.type === 'husky') {
      const proj = ctx.projectDir;
      if (existsSync(join(proj, '.husky'))) results.push(['bin', 'PRESENT']);
      else if (existsSync(join(proj, 'package.json')) && existsSync(join(proj, '.git'))) {
        run(`npm install --save-dev husky lint-staged`, { cwd: proj });
        run(`npx husky init`, { cwd: proj });
        results.push(['bin', existsSync(join(proj, '.husky')) ? 'INSTALLED' : 'FAIL']);
      } else results.push(['bin', 'SKIPPED (sin package.json/.git)']);
    }
  }

  // 2) Requisitos (uv para serena, etc.)
  if (comp.requires?.includes('uv') && !hasCmd('uv')) {
    if (ctx.hasPython && hasCmd('pipx')) { run('pipx install uv'); }
    if (!hasCmd('uv')) { results.push(['mcp', 'SKIPPED (falta uv)']); return results; }
  }

  // 3) MCP
  if (comp.mcp) {
    if (mcpHas(comp.mcp.name)) results.push(['mcp', 'PRESENT']);
    else {
      let cmd = comp.mcp.cmd;
      const ek = comp.mcp.envKeyArg;
      if (ek && process.env[ek.var]) cmd += ` ${ek.arg} ${process.env[ek.var]}`;
      run(`claude mcp add ${comp.mcp.name} -s user -- ${cmd}`);
      mcpInvalidate();
      results.push(['mcp', mcpHas(comp.mcp.name) ? 'REGISTERED' : 'FAIL']);
    }
  }

  return results;
}
