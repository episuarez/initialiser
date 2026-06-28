// src/remote.ts — Auto-update via git + descarga de skills desde URL/registro remoto.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dir, '..');
const STAMP = join(APP_ROOT, '.last-update-check');

export interface UpdateResult { ok: boolean; msg: string }
export interface RemoteSkill { id: string; desc: string; url: string }
export interface RegistryData { skills?: RemoteSkill[] }

function git(args: string): string | null {
  try { return execSync(`git ${args}`, { cwd: APP_ROOT, encoding: 'utf8', stdio: 'pipe' }).trim(); }
  catch { return null; }
}

export function isGitRepo(): boolean { return existsSync(join(APP_ROOT, '.git')); }

// Instalacion via npm global: el codigo vive bajo node_modules. Se actualiza con npm.
export function isNpmInstall(): boolean { return /[\\/]node_modules[\\/]/.test(APP_ROOT); }

const REPO_URL: string | null = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8'));
    return (pkg.repository?.url || '').replace(/^git\+/, '').replace(/\.git$/, '') || null;
  } catch { return null; }
})();

function migrateToGit(): UpdateResult {
  if (!REPO_URL) return { ok: false, msg: 'No se pudo determinar la URL del repo (package.json).' };
  if (git('init -q') === null) return { ok: false, msg: 'git init fallo.' };
  if (git('remote get-url origin') === null) git(`remote add origin ${REPO_URL}`);
  else git(`remote set-url origin ${REPO_URL}`);
  if (git('fetch --depth 1 origin main') === null)
    return { ok: false, msg: 'git fetch fallo (sin red o repo inaccesible).' };
  if (git('checkout -f -B main origin/main') === null) return { ok: false, msg: 'git checkout fallo.' };
  git('branch --set-upstream-to=origin/main main');
  return { ok: true, msg: 'Copia xcopy convertida a repo git (auto-migracion).' };
}

// Check silencioso 1 vez al dia. Devuelve nº commits pendientes o 0.
export function checkUpdatesQuiet(): number {
  if (!isGitRepo()) return 0;
  try {
    const last = existsSync(STAMP) ? parseInt(readFileSync(STAMP, 'utf8')) : 0;
    if (Date.now() - last < 24 * 3600 * 1000) return 0;
    writeFileSync(STAMP, String(Date.now()));
    git('fetch --quiet');
    const behind = git('rev-list HEAD..@{u} --count');
    return behind ? parseInt(behind) : 0;
  } catch { return 0; }
}

export function selfUpdate(): UpdateResult {
  let prefix = '';
  if (!isGitRepo()) {
    if (isNpmInstall())
      return { ok: false, msg: 'Instalacion via npm. Actualiza con: npm update -g @episuarez/init-claude' };
    const m = migrateToGit();
    if (!m.ok) return m;
    prefix = m.msg + '\n';
  }
  const pull = git('pull');
  if (pull === null) return { ok: false, msg: prefix + 'git pull fallo (conflictos o sin upstream).' };
  try { execSync('npm install --omit=dev', { cwd: APP_ROOT, stdio: 'pipe' }); } catch { /* deps opcionales */ }
  return { ok: true, msg: prefix + pull };
}

// Descarga una skill desde URL (raw .md, o repo GitHub -> intenta SKILL.md).
export async function fetchSkill(url: string): Promise<{ name: string; content: string }> {
  let target = url;
  const gh = url.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/?$/);
  if (gh) target = `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/main/SKILL.md`;
  target = target.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');

  const res = await fetch(target);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${target}`);
  const content = await res.text();
  if (!content.trim()) throw new Error('Contenido vacio');

  const fm = content.match(/^---[\s\S]*?name:\s*([\w-]+)/m);
  const name = fm ? fm[1]! : (target.split('/').filter(Boolean).slice(-2, -1)[0] || 'remote-skill').replace(/\.md$/, '');
  return { name, content };
}

// Registro remoto opcional: REGISTRY.json con skills extra.
export async function fetchRegistry(registryUrl: string): Promise<RegistryData | null> {
  try {
    const res = await fetch(registryUrl);
    if (!res.ok) return null;
    return await res.json() as RegistryData;
  } catch { return null; }
}

export function getRegistryUrl(): string | null {
  const cfg = join(APP_ROOT, 'config.json');
  if (existsSync(cfg)) {
    try { return JSON.parse(readFileSync(cfg, 'utf8')).registryUrl ?? null; } catch { /* config invalido */ }
  }
  return null;
}
