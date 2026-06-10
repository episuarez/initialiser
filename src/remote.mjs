// src/remote.mjs — Auto-update via git + descarga de skills desde URL/registro remoto.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dir, '..');
const STAMP = join(APP_ROOT, '.last-update-check');

function git(args) {
  try { return execSync(`git ${args}`, { cwd: APP_ROOT, encoding: 'utf8', stdio: 'pipe' }).trim(); }
  catch { return null; }
}

export function isGitRepo() { return existsSync(join(APP_ROOT, '.git')); }

// Check silencioso 1 vez al dia. Devuelve nº commits pendientes o 0.
export function checkUpdatesQuiet() {
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

export function selfUpdate() {
  if (!isGitRepo()) {
    return { ok: false, msg: `Esta carpeta no es un repo git: ${APP_ROOT}\n` +
      `Setup (una vez):\n` +
      `  1. Crea un repo 'init-claude' en tu Forgejo/GitHub con el contenido de esta carpeta.\n` +
      `  2. git clone <url> en su lugar.\n` +
      `  3. A partir de ahi: init-claude update hace git pull + npm install.` };
  }
  const pull = git('pull');
  if (pull === null) return { ok: false, msg: 'git pull fallo (conflictos o sin upstream).' };
  try { execSync('npm install --omit=dev', { cwd: APP_ROOT, stdio: 'pipe' }); } catch {}
  return { ok: true, msg: pull };
}

// Descarga una skill desde URL (raw .md, o repo GitHub -> intenta SKILL.md).
export async function fetchSkill(url) {
  let target = url;
  // github.com/user/repo -> raw SKILL.md de main
  const gh = url.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/?$/);
  if (gh) target = `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/main/SKILL.md`;
  // blob -> raw
  target = target.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');

  const res = await fetch(target);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${target}`);
  const content = await res.text();
  if (!content.trim()) throw new Error('Contenido vacio');

  // Nombre desde frontmatter o desde la URL
  const fm = content.match(/^---[\s\S]*?name:\s*([\w-]+)/m);
  const name = fm ? fm[1] : (target.split('/').filter(Boolean).slice(-2, -1)[0] || 'remote-skill').replace(/\.md$/, '');
  return { name, content };
}

// Registro remoto opcional: REGISTRY.json en el repo del usuario con skills extra.
// Formato: { "skills": [ { "id": "...", "desc": "...", "url": "https://raw..." } ] }
export async function fetchRegistry(registryUrl) {
  try {
    const res = await fetch(registryUrl);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export function getRegistryUrl() {
  // configurable en config.json del app root
  const cfg = join(APP_ROOT, 'config.json');
  if (existsSync(cfg)) {
    try { return JSON.parse(readFileSync(cfg, 'utf8')).registryUrl ?? null; } catch {}
  }
  return null;
}
