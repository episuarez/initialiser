// src/generate.ts — CLAUDE.md (con CUSTOM block), settings, hooks, skills.
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { CATALOG_DIR } from './catalog.js';
import type { Component } from './catalog.js';
import type { Profile, Snapshot } from './types.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dir, '..');
const USER_RULES_PATH = join(APP_ROOT, 'user-rules.md');

const SIGNATURE = 'Auto-generado por init-claude';

const USER_RULES_TEMPLATE = `# user-rules.md

Reglas personales que se inyectan en TODOS los CLAUDE.md que genera init-claude.
Este archivo esta en .gitignore: sobrevive a 'init-claude update' y nunca se sube al repo.

Escribe debajo de esta linea. Todo lo que pongas aparece como seccion
"Reglas del usuario" en cada proyecto que inicialices.
---
`;

export function ensureUserRulesFile(): 'PRESENT' | 'CREATED' {
  if (existsSync(USER_RULES_PATH)) return 'PRESENT';
  writeCRLF(USER_RULES_PATH, USER_RULES_TEMPLATE);
  return 'CREATED';
}

export function getUserRules(): string {
  if (!existsSync(USER_RULES_PATH)) return '';
  const raw = readFileSync(USER_RULES_PATH, 'utf8');
  const idx = raw.indexOf('\n---');
  const body = idx >= 0 ? raw.slice(raw.indexOf('\n', idx + 2) + 1) : raw;
  return body.trim();
}

function writeCRLF(path: string, content: string): void {
  writeFileSync(path, content.replace(/\r?\n/g, '\r\n'), 'utf8');
}
function writeLF(path: string, content: string): void {
  writeFileSync(path, content.replace(/\r\n/g, '\n'), 'utf8');
}

export function getCustomBlock(path: string): string {
  if (!existsSync(path)) return '';
  const m = readFileSync(path, 'utf8').match(/<!-- CUSTOM:START -->([\s\S]*?)<!-- CUSTOM:END -->/);
  return m ? `\n<!-- CUSTOM:START -->${m[1]}<!-- CUSTOM:END -->` : '';
}

// Encabezados '## ' que emite el template (gestionados por init-claude). Un test
// verifica que todo heading generado este aqui (evita perder secciones por drift).
export const MANAGED_HEADINGS = new Set([
  'Memoria de sesion', 'Contexto del proyecto (auto-detectado)', 'Idioma y tono', 'Modelo',
  'Plan first (cambios grandes)', '/compact disciplinado', 'Herramientas', 'Subagentes',
  'Superpowers (workflow del main thread)', 'Diseno visual (workflow)',
  'Skills de proyecto (en .claude/skills/)', 'Notas adicionales del proyecto',
  'Reglas del usuario (user-rules.md de init-claude)', 'Skills custom (auto-recomendacion)',
  'Git y commits (REGLAS ESTRICTAS)', 'Codigo', 'Tests', 'Definition of done',
  'Errores en sesion', 'Dependencias', 'Secretos', 'Operaciones destructivas', 'Que NO hacer',
]);

// Secciones '## ' añadidas a mano por el usuario (no del template, fuera de CUSTOM).
export function extractUserSections(text: string): string[] {
  if (!text) return [];
  const noCustom = text.replace(/<!-- CUSTOM:START -->[\s\S]*?<!-- CUSTOM:END -->/g, '');
  const out: string[] = [];
  for (const part of noCustom.split(/\n(?=## )/)) {
    const m = part.match(/^## (.+?)\s*$/m);
    if (!m) continue;
    if (MANAGED_HEADINGS.has(m[1]!.trim())) continue;
    const trimmed = part.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

// Backup con historial: `.bak` (ultimo) + uno con timestamp. Poda a `keep` recientes.
export function rotateBackups(path: string, keep = 5): void {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(path, `${path}.bak`);
  copyFileSync(path, `${path}.${stamp}.bak`);
  const dir = dirname(path), base = basename(path);
  const hist = readdirSync(dir)
    .filter((f) => f.startsWith(base + '.') && f.endsWith('.bak') && f !== base + '.bak')
    .sort();
  for (const f of hist.slice(0, Math.max(0, hist.length - keep))) {
    try { rmSync(join(dir, f)); } catch { /* ya borrado */ }
  }
}

// Escribe solo si no existe o lleva nuestra firma. No machaca personalizaciones.
export function writeManaged(path: string, content: string): 'CREATED' | 'SKIPPED' {
  if (existsSync(path)) {
    const ex = readFileSync(path, 'utf8');
    if (!ex.includes(SIGNATURE)) return 'SKIPPED';
  }
  mkdirSync(dirname(path), { recursive: true });
  writeCRLF(path, content);
  return 'CREATED';
}

export function writeSkill(baseDir: string, skillName: string, content: string) {
  // Sanea el nombre: viene de skills remotas (frontmatter/URL). Evita que `../` o
  // separadores escriban fuera de .claude/skills.
  const safe = skillName.replace(/[^\w.-]/g, '-').replace(/^[.-]+/, '') || 'skill';
  const dest = join(baseDir, '.claude', 'skills', safe, 'SKILL.md');
  return writeManaged(dest, content);
}

export function copySkillToProject(skillId: string, projectDir: string): string {
  const src = join(CATALOG_DIR, 'skills', `${skillId}.md`);
  if (!existsSync(src)) return 'MISSING';
  return writeSkill(projectDir, skillId, readFileSync(src, 'utf8'));
}

export function copySkillToUser(skillId: string): string {
  const src = join(CATALOG_DIR, 'skills', `${skillId}.md`);
  if (!existsSync(src)) return 'MISSING';
  return writeSkill(homedir(), skillId, readFileSync(src, 'utf8'));
}

export function installAgents(withDesigner: boolean): Record<string, string> {
  const agentsDir = join(CATALOG_DIR, 'agents');
  const destDir = join(homedir(), '.claude', 'agents');
  const results: Record<string, string> = {};
  if (!existsSync(agentsDir)) return results;
  for (const f of readdirSync(agentsDir)) {
    const name = f.replace(/\.md$/, '');
    if (name === 'designer' && !withDesigner) continue;
    results[name] = writeManaged(join(destDir, f), readFileSync(join(agentsDir, f), 'utf8'));
  }
  return results;
}

export function installCommands(): Record<string, string> {
  const cmdsDir = join(CATALOG_DIR, 'commands');
  const destDir = join(homedir(), '.claude', 'commands');
  const results: Record<string, string> = {};
  if (!existsSync(cmdsDir)) return results;
  for (const f of readdirSync(cmdsDir)) {
    results[f.replace(/\.md$/, '')] = writeManaged(join(destDir, f), readFileSync(join(cmdsDir, f), 'utf8'));
  }
  return results;
}

export function generateClaudeMd(
  projectDir: string,
  selectedComps: Component[],
  projectSkills: string[],
  hasSuperpowers: boolean,
  extraContent: string | null,
  profile: Profile | null = null,
  toolSearchOn = false,
): 'CREATED' | 'UPDATED' {
  // Con Tool Search activo, los componentes 'discovery' se consolidan en un indice
  // (Claude los descubre por busqueda); los de policy/protocolo mantienen su linea.
  const policyLines: string[] = [], discovery: string[] = [];
  for (const c of selectedComps) {
    if (!c.claudemd) continue;
    if (toolSearchOn && c.docTier === 'discovery') discovery.push(c.mcp?.name ?? c.id);
    else policyLines.push(c.claudemd);
  }
  if (discovery.length)
    policyLines.push(`- Tools instaladas (descúbrelas por búsqueda de tools según la tarea): ${discovery.join(', ')}.`);
  const toolLines = policyLines.join('\n');
  const sections = selectedComps.map((c) => c.claudemdSection).filter(Boolean).join('\n\n');
  const selectedIds = new Set(selectedComps.map((c) => c.id));
  const hasDesignTools = selectedIds.has('pencil') || selectedIds.has('figma');

  const projSkillsSection = projectSkills.length
    ? `\n## Skills de proyecto (en .claude/skills/)\n\nAplica estos skills cuando la tarea lo toque:\n${projectSkills.map((s) => `- \`${s}\``).join('\n')}`
    : '';

  const spSection = hasSuperpowers ? `
## Superpowers (workflow del main thread)

- Brainstorming: \`superpowers:brainstorming\`.
- Planes: \`superpowers:writing-plans\` / \`executing-plans\`; delegar con contexto aislado: subagente \`planner\`.
- TDD: \`superpowers:test-driven-development\`.
- Debugging: \`superpowers:systematic-debugging\`; delegado: \`bug-investigator\`.
- Antes de marcar terminado: \`superpowers:verification-before-completion\`.
- Code review: \`superpowers:requesting-code-review\` + subagente \`code-reviewer\`.
- NO uses \`superpowers:using-git-worktrees\` salvo peticion explicita.` : '';

  // Preserva personalizaciones: bloque CUSTOM + secciones '## ' añadidas fuera de el
  // (estas se migran DENTRO de CUSTOM para no perderlas en la proxima regen).
  const claudeMdPath = join(projectDir, 'CLAUDE.md');
  const oldText = existsSync(claudeMdPath) ? readFileSync(claudeMdPath, 'utf8') : '';
  const userSections = extractUserSections(oldText);
  let custom = getCustomBlock(claudeMdPath);
  if (userSections.length) {
    const migrated = `<!-- init-claude migro estas secciones (estaban fuera de CUSTOM) para no perderlas -->\n\n${userSections.join('\n\n')}`;
    custom = custom
      ? custom.replace('<!-- CUSTOM:END -->', `\n${migrated}\n<!-- CUSTOM:END -->`)
      : `\n<!-- CUSTOM:START -->\n\n${migrated}\n\n<!-- CUSTOM:END -->`;
  }
  const extra = extraContent ? `\n## Notas adicionales del proyecto\n\n${extraContent}\n` : '';

  const userRules = getUserRules();
  const userRulesSection = userRules
    ? `\n## Reglas del usuario (user-rules.md de init-claude)\n\n${userRules}\n`
    : '';

  const profileSection = profile ? `
## Contexto del proyecto (auto-detectado)

- Stack: ${profile.langs.join(', ') || 'sin lenguaje detectado'}${profile.fws.length ? ` (${profile.fws.join(', ')})` : ''}.
- Tamano: ${profile.fileCount} archivos de codigo (${profile.size})${profile.isMonorepo ? ', monorepo' : ''}.
- Tests: ${profile.hasTests ? 'si' : 'no detectados'}. CI: ${profile.hasCI ? 'si' : 'no'}. Docs: ${profile.hasDocs ? 'si' : 'no'}.
- Si esta seccion queda obsoleta, re-ejecuta init-claude.
` : '';

  const designSection = hasDesignTools ? `
## Diseno visual (workflow)

- Antes de cualquier tarea visual: skill \`design-brief\`.
${selectedIds.has('figma') ? '- Figma a codigo: skill `figma-to-code`.\n' : ''}${selectedIds.has('pencil') ? '- Pencil a codigo: skill `pencil-to-code`.\n' : ''}` : '';

  const md = `# CLAUDE.md
<!-- ${SIGNATURE} · lo editado fuera del bloque CUSTOM se regenera; pon tus reglas en CUSTOM -->

Reglas de comportamiento. Reglas propias del proyecto: bloque CUSTOM al final (sobrevive regeneraciones).

## Memoria de sesion

- Gestionada por context-mode. Datos reales en \`~/.claude/context-mode/\` (content/ y sessions/, SQLite con nombres hasheados).
- No se consulta navegando archivos: usa \`ctx_search\`. Estado: di "ctx stats".
${profileSection}
## Idioma y tono

- Responde en espanol. Comentarios en codigo y commits en ingles.
- Directo, sin preambulos. Critico cuando algo este mal. Honestidad sobre amabilidad.
- No expliques lo obvio. Asume nivel senior. Minimiza tokens.

## Modelo

- Modelo por defecto del usuario para trabajo normal.
- Escala al modelo superior disponible solo si: 2 intentos fallidos, diseno no trivial, o debugging complejo.
- Si te atascas 2 turnos: avisa y SUGIERE escalar. No cambies automaticamente.

## Plan first (cambios grandes)

- Si toca 3+ archivos o cruza modulos: subagente \`planner\` antes de tocar nada.
- Espera confirmacion explicita.

## /compact disciplinado

- Siempre especifica que preservar. Nunca compactes por limite sin instrucciones.

## Herramientas

${toolLines}

## Subagentes

- \`planner\`: cambios complejos antes de tocar nada.
- \`code-reviewer\`: despues de escribir o modificar codigo.
- \`bug-investigator\`: bugs que necesitan causa raiz.
- \`test-runner\`: verificar regresiones tras cambios.
- \`designer\`: crear o criticar disenos UI/UX, logos, landings.

${sections}${spSection}${designSection}${projSkillsSection}${extra}${userRulesSection}

## Skills custom (auto-recomendacion)

Recomienda crear skill SOLO si: tarea repetida 3+ veces, >500 tokens ahorrados/uso, estructura clara.
Cuando lo sugieras: propone el SKILL.md completo.

## Git y commits (REGLAS ESTRICTAS)

- NUNCA \`git commit\` ni \`git push\` sin autorizacion EXPLICITA en este turno.
- NUNCA Co-Authored-By: Claude, Generated with Claude Code, emoji robot en commits.
- Conventional commits. Subject <=50 chars. Porque sobre que.
- Antes de commit: muestra staged + mensaje. Espera OK. Antes de push: confirma destino.
- Hook commit-msg instalado rechaza refs a IA. Si falla: edita mensaje, NO uses --no-verify.

## Codigo

- Sin comentarios obvios. Sin emojis. Sigue estilo existente. No deps nuevas sin justificar.
- No modificar estilo fuera de la tarea actual.

## Tests

- Antes de marcar completada: ejecuta tests (\`test-runner\`).
- Funcionalidad nueva no trivial: anade test. Codigo cubierto modificado: test pasa o actualizalo.

## Definition of done

Una tarea esta terminada solo si: tests pasan, lint limpio, sin TODOs nuevos sin justificar,
diff revisado completo antes de entregar. Si algo de esto falla: la tarea NO esta terminada, dilo.

## Errores en sesion

- Comando falla 2 veces con el mismo error: PARA. Reporta el error exacto y propone alternativas.
- No insistas en bucle con variaciones minimas. No silencies errores con try/catch vacios.
- Si un hook o tool es denegado: no lo reintentes igual; pregunta o cambia de enfoque.

## Dependencias

- No instalar sin avisar. Justifica cada dependencia nueva (que aporta vs hacerlo a mano).
- Respeta el rango de versiones del proyecto. No hagas upgrades mayores como efecto colateral.
- Si detectas dependencia vulnerable o abandonada: avisa, no la cambies por tu cuenta.

## Secretos

- NUNCA pegues valores de .env, tokens o credenciales en respuestas, commits, logs o codigo.
- Referencia por nombre de variable (\`process.env.API_KEY\`), nunca por valor.
- Si un secreto aparece hardcodeado en el codigo: avisa inmediatamente.

## Operaciones destructivas

Confirmacion antes de: rm -rf, git push --force, git reset --hard, git clean -fdx,
migraciones DB, borrado sin refs, cambios >10 archivos.

## Que NO hacer

- No leer: .env, secrets/, credenciales, node_modules/, dist/, build/, .next/, .git/, __pycache__/, .venv/.
- No generar README/docs nuevos salvo peticion explicita.
- No instalar dependencias sin avisar.
${custom}
`;

  const path = claudeMdPath;
  const existed = existsSync(path);
  if (existed) rotateBackups(path);
  writeCRLF(path, md);
  return existed ? 'UPDATED' : 'CREATED';
}

export function generateProjectSettings(projectDir: string): 'PRESENT' | 'CREATED' {
  const path = join(projectDir, '.claude', 'settings.json');
  if (existsSync(path)) return 'PRESENT';
  mkdirSync(dirname(path), { recursive: true });
  const settings = {
    permissions: {
      deny: [
        "Read(.env)", "Read(.env.*)", "Read(**/.env)", "Read(**/.env.*)",
        "Read(**/secrets/**)", "Read(**/*credentials*)", "Read(**/*.pem)", "Read(**/*.key)", "Read(**/*.p12)",
        "Read(**/id_rsa*)", "Read(**/id_ed25519*)", "Read(**/.aws/**)", "Read(**/.ssh/**)", "Read(**/.gnupg/**)",
        "Read(**/node_modules/**)", "Read(**/.git/objects/**)", "Read(**/dist/**)", "Read(**/build/**)", "Read(**/out/**)",
        "Read(**/.next/**)", "Read(**/.nuxt/**)", "Read(**/.svelte-kit/**)", "Read(**/.cache/**)", "Read(**/coverage/**)",
        "Read(**/__pycache__/**)", "Read(**/.pytest_cache/**)", "Read(**/.venv/**)", "Read(**/venv/**)",
        "Read(**/target/**)", "Read(**/vendor/**)", "Read(**/*.lock)", "Read(**/*.lockb)",
        "Read(**/package-lock.json)", "Read(**/yarn.lock)", "Read(**/pnpm-lock.yaml)", "Read(**/poetry.lock)",
        "Read(**/*.log)", "Read(**/logs/**)", "Read(**/*.sqlite)", "Read(**/*.sqlite3)", "Read(**/*.db)",
        "Read(**/*.min.js)", "Read(**/*.min.css)", "Read(**/*.map)",
        "Bash(rm -rf /*)", "Bash(rm -rf ~)", "Bash(sudo *)",
        "Bash(curl * | sh)", "Bash(curl * | bash)", "Bash(wget * | sh)",
        "Bash(git push --force *)", "Bash(git push -f *)", "Bash(git reset --hard *)", "Bash(git clean -fdx*)",
        "Bash(dd *)", "Bash(mkfs.*)", "Bash(format *)",
      ],
      allow: [
        "Bash(git:*)", "Bash(npm:*)", "Bash(pnpm:*)", "Bash(yarn:*)", "Bash(node:*)",
        "Bash(python:*)", "Bash(pip:*)", "Bash(pipx:*)", "Bash(pytest:*)", "Bash(ruff:*)",
        "Bash(eslint:*)", "Bash(tsc:*)", "Bash(prettier:*)", "Bash(vitest:*)", "Bash(jest:*)",
        "Bash(cargo:*)", "Bash(go:*)", "Bash(make:*)",
      ],
    },
  };
  writeCRLF(path, JSON.stringify(settings, null, 2));
  return 'CREATED';
}

export function updateGitignore(projectDir: string): string {
  const path = join(projectDir, '.gitignore');
  const entries = ['.context-mode/', '.code-review-graph/', 'CLAUDE.md.bak', 'CLAUDE.md.*.bak', '.serena/', '.codebase-memory/', '.claude/init-snapshot.json', 'settings.json.bak'];
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const added = entries.filter((e) => !existing.includes(e));
  if (!added.length) return 'PRESENT';
  writeFileSync(path, existing + '\n# Claude Code tooling\n' + added.join('\n') + '\n');
  return `UPDATED (${added.length})`;
}

export function installGitHooks(projectDir: string, hasHusky: boolean): string {
  if (!existsSync(join(projectDir, '.git'))) return 'SKIPPED (sin .git)';
  const hook = `#!/bin/sh
# ${SIGNATURE}
MSG_FILE="$1"
if grep -qiE "(co-authored-by:[[:space:]]*claude|co-authored-by:.*@anthropic|generated[[:space:]]+with[[:space:]]*\\[claude|generated[[:space:]]+by[[:space:]]+claude|🤖)" "$MSG_FILE"; then
  echo ""
  echo " COMMIT RECHAZADO: referencia a IA detectada"
  echo " Elimina: Co-Authored-By: Claude / Generated with [Claude Code] / emoji robot"
  exit 1
fi
exit 0
`;
  const targets = [join(projectDir, '.git', 'hooks', 'commit-msg')];
  if (hasHusky && existsSync(join(projectDir, '.husky'))) targets.push(join(projectDir, '.husky', 'commit-msg'));
  const done: string[] = [];
  for (const t of targets) {
    if (existsSync(t) && !readFileSync(t, 'utf8').includes(SIGNATURE)) { done.push('otro hook, no tocado'); continue; }
    mkdirSync(dirname(t), { recursive: true });
    writeLF(t, hook);
    done.push(t.includes('.husky') ? '.husky' : '.git/hooks');
  }
  return `INSTALLED (${done.join(', ')})`;
}

export function saveSnapshot(projectDir: string, selected: { components: string[]; skills: string[] }): void {
  const path = join(projectDir, '.claude', 'init-snapshot.json');
  mkdirSync(dirname(path), { recursive: true });
  writeCRLF(path, JSON.stringify({ version: 'v13', date: new Date().toISOString(), selected }, null, 2));
}

// Lee el snapshot anterior para diffear contra la seleccion actual (prune).
export function loadSnapshot(projectDir: string): Snapshot | null {
  const path = join(projectDir, '.claude', 'init-snapshot.json');
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')) as Snapshot; } catch { return null; }
}
