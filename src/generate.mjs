// src/generate.mjs — CLAUDE.md (con CUSTOM block), settings, hooks, skills.
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dir = dirname(fileURLToPath(import.meta.url));
export const CATALOG_DIR = join(__dir, '..', 'catalog');
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

// Crea user-rules.md con plantilla si no existe. Nunca lo sobreescribe.
export function ensureUserRulesFile() {
  if (existsSync(USER_RULES_PATH)) return 'PRESENT';
  writeCRLF(USER_RULES_PATH, USER_RULES_TEMPLATE);
  return 'CREATED';
}

// Devuelve el contenido util de user-rules.md (lo que hay tras el separador ---).
export function getUserRules() {
  if (!existsSync(USER_RULES_PATH)) return '';
  const raw = readFileSync(USER_RULES_PATH, 'utf8');
  const idx = raw.indexOf('\n---');
  const body = idx >= 0 ? raw.slice(raw.indexOf('\n', idx + 2) + 1) : raw;
  return body.trim();
}

function writeCRLF(path, content) {
  writeFileSync(path, content.replace(/\r?\n/g, '\r\n'), 'utf8');
}
function writeLF(path, content) {
  writeFileSync(path, content.replace(/\r\n/g, '\n'), 'utf8');
}

export function getCustomBlock(path) {
  if (!existsSync(path)) return '';
  const m = readFileSync(path, 'utf8').match(/<!-- CUSTOM:START -->([\s\S]*?)<!-- CUSTOM:END -->/);
  return m ? `\n<!-- CUSTOM:START -->${m[1]}<!-- CUSTOM:END -->` : '';
}

// Escribe solo si no existe o lleva nuestra firma. No machaca personalizaciones.
export function writeManaged(path, content) {
  if (existsSync(path)) {
    const ex = readFileSync(path, 'utf8');
    if (!ex.includes(SIGNATURE)) return 'SKIPPED';
  }
  mkdirSync(dirname(path), { recursive: true });
  writeCRLF(path, content);
  return 'CREATED';
}

// Claude Code discovers skills as .claude/skills/<name>/SKILL.md (dir + frontmatter).
// Flat .md files in skills/ are ignored by the runtime.
export function writeSkill(baseDir, skillName, content) {
  const dest = join(baseDir, '.claude', 'skills', skillName, 'SKILL.md');
  return writeManaged(dest, content);
}

export function copySkillToProject(skillId, projectDir) {
  const src = join(CATALOG_DIR, 'skills', `${skillId}.md`);
  if (!existsSync(src)) return 'MISSING';
  return writeSkill(projectDir, skillId, readFileSync(src, 'utf8'));
}

export function copySkillToUser(skillId) {
  const src = join(CATALOG_DIR, 'skills', `${skillId}.md`);
  if (!existsSync(src)) return 'MISSING';
  return writeSkill(homedir(), skillId, readFileSync(src, 'utf8'));
}

export function installAgents(withDesigner) {
  const agentsDir = join(CATALOG_DIR, 'agents');
  const destDir = join(homedir(), '.claude', 'agents');
  const results = {};
  if (!existsSync(agentsDir)) return results;
  for (const f of readdirSync(agentsDir)) {
    const name = f.replace(/\.md$/, '');
    if (name === 'designer' && !withDesigner) continue;
    results[name] = writeManaged(join(destDir, f), readFileSync(join(agentsDir, f), 'utf8'));
  }
  return results;
}

export function installCommands() {
  const cmdsDir = join(CATALOG_DIR, 'commands');
  const destDir = join(homedir(), '.claude', 'commands');
  const results = {};
  if (!existsSync(cmdsDir)) return results;
  for (const f of readdirSync(cmdsDir)) {
    results[f.replace(/\.md$/, '')] = writeManaged(join(destDir, f), readFileSync(join(cmdsDir, f), 'utf8'));
  }
  return results;
}

export function generateClaudeMd(projectDir, selectedComps, projectSkills, hasSuperpowers, extraContent, profile = null) {
  const toolLines = selectedComps.map(c => c.claudemd).filter(Boolean).join('\n');
  const sections = selectedComps.map(c => c.claudemdSection).filter(Boolean).join('\n\n');
  const selectedIds = new Set(selectedComps.map(c => c.id));
  const hasDesignTools = selectedIds.has('pencil') || selectedIds.has('figma');

  const projSkillsSection = projectSkills.length
    ? `\n## Skills de proyecto (en .claude/skills/)\n\nAplica estos skills cuando la tarea lo toque:\n${projectSkills.map(s => `- \`${s}\``).join('\n')}`
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

  const custom = getCustomBlock(join(projectDir, 'CLAUDE.md'));
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

  const path = join(projectDir, 'CLAUDE.md');
  const existed = existsSync(path);
  if (existed) copyFileSync(path, path + '.bak');
  writeCRLF(path, md);
  return existed ? 'UPDATED' : 'CREATED';
}

export function generateProjectSettings(projectDir) {
  const path = join(projectDir, '.claude', 'settings.json');
  if (existsSync(path)) return 'PRESENT';
  mkdirSync(dirname(path), { recursive: true });
  const settings = {
    permissions: {
      deny: [
        "Read(.env)","Read(.env.*)","Read(**/.env)","Read(**/.env.*)",
        "Read(**/secrets/**)","Read(**/*credentials*)","Read(**/*.pem)","Read(**/*.key)","Read(**/*.p12)",
        "Read(**/id_rsa*)","Read(**/id_ed25519*)","Read(**/.aws/**)","Read(**/.ssh/**)","Read(**/.gnupg/**)",
        "Read(**/node_modules/**)","Read(**/.git/objects/**)","Read(**/dist/**)","Read(**/build/**)","Read(**/out/**)",
        "Read(**/.next/**)","Read(**/.nuxt/**)","Read(**/.svelte-kit/**)","Read(**/.cache/**)","Read(**/coverage/**)",
        "Read(**/__pycache__/**)","Read(**/.pytest_cache/**)","Read(**/.venv/**)","Read(**/venv/**)",
        "Read(**/target/**)","Read(**/vendor/**)","Read(**/*.lock)","Read(**/*.lockb)",
        "Read(**/package-lock.json)","Read(**/yarn.lock)","Read(**/pnpm-lock.yaml)","Read(**/poetry.lock)",
        "Read(**/*.log)","Read(**/logs/**)","Read(**/*.sqlite)","Read(**/*.sqlite3)","Read(**/*.db)",
        "Read(**/*.min.js)","Read(**/*.min.css)","Read(**/*.map)",
        "Bash(rm -rf /*)","Bash(rm -rf ~)","Bash(sudo *)",
        "Bash(curl * | sh)","Bash(curl * | bash)","Bash(wget * | sh)",
        "Bash(git push --force *)","Bash(git push -f *)","Bash(git reset --hard *)","Bash(git clean -fdx*)",
        "Bash(dd *)","Bash(mkfs.*)","Bash(format *)"
      ],
      allow: [
        "Bash(git:*)","Bash(npm:*)","Bash(pnpm:*)","Bash(yarn:*)","Bash(node:*)",
        "Bash(python:*)","Bash(pip:*)","Bash(pipx:*)","Bash(pytest:*)","Bash(ruff:*)",
        "Bash(eslint:*)","Bash(tsc:*)","Bash(prettier:*)","Bash(vitest:*)","Bash(jest:*)",
        "Bash(cargo:*)","Bash(go:*)","Bash(make:*)"
      ]
    }
  };
  writeCRLF(path, JSON.stringify(settings, null, 2));
  return 'CREATED';
}

export function updateGitignore(projectDir) {
  const path = join(projectDir, '.gitignore');
  const entries = ['.context-mode/','.code-review-graph/','CLAUDE.md.bak','.serena/','.swarm/','.claude-flow/','.claude/init-snapshot.json','settings.json.bak'];
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const added = entries.filter(e => !existing.includes(e));
  if (!added.length) return 'PRESENT';
  writeFileSync(path, existing + '\n# Claude Code tooling\n' + added.join('\n') + '\n');
  return `UPDATED (${added.length})`;
}

export function installGitHooks(projectDir, hasHusky) {
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
  const done = [];
  for (const t of targets) {
    if (existsSync(t) && !readFileSync(t, 'utf8').includes(SIGNATURE)) { done.push('otro hook, no tocado'); continue; }
    mkdirSync(dirname(t), { recursive: true });
    writeLF(t, hook);
    done.push(t.includes('.husky') ? '.husky' : '.git/hooks');
  }
  return `INSTALLED (${done.join(', ')})`;
}

export function saveSnapshot(projectDir, selected) {
  const path = join(projectDir, '.claude', 'init-snapshot.json');
  mkdirSync(dirname(path), { recursive: true });
  writeCRLF(path, JSON.stringify({ version: 'v13', date: new Date().toISOString(), selected }, null, 2));
}
