#!/usr/bin/env node

// bin/init-claude.ts
import pc6 from "picocolors";
import { createRequire } from "module";

// src/install.ts
import { execSync, spawnSync, spawn } from "child_process";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
function run(cmd2, { visible = false, cwd = void 0, timeout = void 0 } = {}) {
  try {
    const out = execSync(cmd2, { stdio: visible ? "inherit" : "pipe", encoding: "utf8", input: "", cwd, timeout });
    return { ok: true, out: out ?? "" };
  } catch (e) {
    const timedOut = e.code === "ETIMEDOUT" || e.signal === "SIGTERM";
    return { ok: false, out: (e.stdout ?? "") + (e.stderr ?? ""), code: e.status, timedOut };
  }
}
function hasCmd(cmd2) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd2], { encoding: "utf8" });
  return r.status === 0;
}
function runAsync(cmd2, { cwd = void 0, timeout = void 0, onData = void 0 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd2, { shell: true, cwd, windowsHide: true });
    let out = "", timedOut = false;
    const t = timeout ? setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeout) : null;
    const collect = (d) => {
      const s = d.toString();
      out += s;
      if (onData) onData(s);
    };
    child.stdout?.on("data", collect);
    child.stderr?.on("data", collect);
    child.on("error", (e) => {
      if (t) clearTimeout(t);
      resolve({ ok: false, out: out + String(e), code: null, timedOut });
    });
    child.on("close", (code) => {
      if (t) clearTimeout(t);
      resolve({ ok: code === 0 && !timedOut, out, code, timedOut });
    });
  });
}
function toolSearchState() {
  const e = (process.env.ENABLE_TOOL_SEARCH || "").trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(e))
    return { on: false, mode: "off", threshold: null, reason: "ENABLE_TOOL_SEARCH=off" };
  const m = e.match(/^auto:(\d+)$/);
  if (m) return { on: true, mode: "auto", threshold: +m[1], reason: `ENABLE_TOOL_SEARCH=auto:${m[1]}` };
  if (["1", "true", "on", "yes"].includes(e))
    return { on: true, mode: "forced", threshold: null, reason: "ENABLE_TOOL_SEARCH=on (forzado)" };
  if (!hasCmd("claude")) return { on: null, mode: "auto", threshold: 10, reason: "claude no detectado" };
  return { on: true, mode: "auto", threshold: 10, reason: "default (auto:10%)" };
}
var _npmList = null;
function npmHas(pkg) {
  if (_npmList === null) _npmList = run("npm list -g --depth=0").out;
  return _npmList.includes(pkg.replace(/@(alpha|latest|beta)$/, ""));
}
var _pipxList = null;
function pipxHas(pkg) {
  if (!hasCmd("pipx")) return false;
  if (_pipxList === null) _pipxList = run("pipx list").out;
  return _pipxList.toLowerCase().includes(pkg.toLowerCase().replace(/\[.*\]$/, ""));
}
var _mcpList = null;
function mcpList() {
  if (_mcpList !== null) return _mcpList;
  const names = /* @__PURE__ */ new Set();
  const add = (obj) => {
    if (obj && typeof obj === "object") for (const k of Object.keys(obj)) names.add(k);
  };
  const cwd = process.cwd(), cwdFwd = cwd.replace(/\\/g, "/");
  try {
    const j = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
    add(j.mcpServers);
    add(j.projects?.[cwd]?.mcpServers);
    add(j.projects?.[cwdFwd]?.mcpServers);
  } catch {
  }
  try {
    add(JSON.parse(readFileSync(join(cwd, ".mcp.json"), "utf8")).mcpServers);
  } catch {
  }
  _mcpList = [...names];
  return _mcpList;
}
function mcpHas(name) {
  return mcpList().includes(name);
}
function mcpInvalidate() {
  _mcpList = null;
}
async function removeMcp(name, projectDir2, onData) {
  const r = await runAsync(`claude mcp remove ${name} -s local`, { cwd: projectDir2, onData });
  mcpInvalidate();
  return r;
}
function installedPlugins() {
  const dir = join(homedir(), ".claude", "plugins");
  if (!existsSync(dir)) return [];
  const names = [];
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      names.push(e.name);
      try {
        for (const sub of readdirSync(join(dir, e.name), { withFileTypes: true }))
          if (sub.isDirectory()) names.push(sub.name);
      } catch {
      }
    }
  } catch {
  }
  return names;
}
async function installComponent(comp, ctx) {
  const inst = comp.install;
  const results = [];
  const onData = ctx.onProgress;
  if (inst) {
    if (inst.type === "npm") {
      const bin = inst.bin ?? inst.pkg.split("@")[0];
      if (npmHas(inst.pkg) || hasCmd(bin)) results.push(["bin", "PRESENT"]);
      else {
        const r = await runAsync(`npm install -g ${inst.pkg}`, { onData });
        results.push(["bin", r.ok ? "INSTALLED" : `FAIL (npm exit ${r.code})`]);
        _npmList = null;
      }
    } else if (inst.type === "pipx") {
      if (!ctx.hasPython) {
        results.push(["bin", "SKIPPED (sin Python)"]);
        return results;
      }
      const bin = inst.bin ?? inst.pkg.replace(/\[.*\]$/, "");
      if (pipxHas(inst.pkg) || hasCmd(bin)) results.push(["bin", "PRESENT"]);
      else {
        const r = await runAsync(`pipx install "${inst.pkg}"`, { onData });
        if (r.ok && inst.also) await runAsync(`pipx install ${inst.also}`, { onData });
        if (r.ok && inst.post) await runAsync(inst.post, { onData });
        results.push(["bin", r.ok ? "INSTALLED" : "FAIL"]);
        _pipxList = null;
      }
    } else if (inst.type === "rtk") {
      if (hasCmd("rtk")) results.push(["bin", "PRESENT"]);
      else if (!hasCmd("cargo")) {
        results.push(["bin", "SKIPPED (instala Rust en rustup.rs y luego: init-claude upgrade)"]);
      } else {
        const r = await runAsync("cargo install --git https://github.com/rtk-ai/rtk --locked --force", { onData });
        if (r.ok) {
          await runAsync("rtk init -g --auto-patch");
          results.push(["bin", "INSTALLED (Windows: modo CLAUDE.md injection)"]);
        } else results.push(["bin", "FAIL (cargo)"]);
      }
    } else if (inst.type === "project-npx") {
      const r = await runAsync(inst.cmd, { cwd: ctx.projectDir, timeout: 18e4, onData });
      results.push(["skills", r.ok ? "INSTALLED" : r.timedOut ? "TIMEOUT (180s)" : `FAIL (exit ${r.code})`]);
    } else if (inst.type === "installer") {
      if (hasCmd(inst.bin)) results.push(["bin", "PRESENT"]);
      else {
        const flags = inst.flags ?? "";
        const cmd2 = process.platform === "win32" ? `powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=Join-Path $env:TEMP 'cbm-install.ps1'; Invoke-WebRequest -UseBasicParsing '${inst.psUrl}' -OutFile $f; & $f ${flags}"` : `curl -fsSL ${inst.shUrl} | bash -s -- ${flags}`;
        const r = await runAsync(cmd2, { timeout: 3e5, onData });
        results.push(["bin", r.ok ? "INSTALLED" : r.timedOut ? "TIMEOUT (300s)" : `FAIL (exit ${r.code})`]);
      }
    } else if (inst.type === "husky") {
      const proj = ctx.projectDir;
      if (existsSync(join(proj, ".husky"))) results.push(["bin", "PRESENT"]);
      else if (existsSync(join(proj, "package.json")) && existsSync(join(proj, ".git"))) {
        await runAsync(`npm install --save-dev husky lint-staged`, { cwd: proj, onData });
        await runAsync(`npx husky init`, { cwd: proj, onData });
        results.push(["bin", existsSync(join(proj, ".husky")) ? "INSTALLED" : "FAIL"]);
      } else results.push(["bin", "SKIPPED (sin package.json/.git)"]);
    }
  }
  if (comp.requires?.includes("uv") && !hasCmd("uv")) {
    if (ctx.hasPython && hasCmd("pipx")) {
      await runAsync("pipx install uv", { onData });
    }
    if (!hasCmd("uv")) {
      results.push(["mcp", "SKIPPED (falta uv)"]);
      return results;
    }
  }
  if (comp.mcp) {
    let cmd2 = comp.mcp.cmd;
    let envFlags = "";
    const clean = (v) => String(v).replace(/["`\r\n]/g, "").trim();
    const ek = comp.mcp.envKeyArg;
    if (ek && process.env[ek.var]) cmd2 += ` ${ek.arg} ${process.env[ek.var]}`;
    const pr = comp.mcp.prompt;
    if (pr) {
      const val = ctx.answers?.[comp.id]?.[pr.key] ?? (pr.env ? process.env[pr.env] : void 0);
      if (!val) {
        if (!pr.optional) {
          results.push(["mcp", `SKIPPED (falta ${pr.key})`]);
          return results;
        }
      } else cmd2 += ` "${clean(val)}"`;
    }
    const ep = comp.mcp.envPrompt;
    if (ep) {
      const val = ctx.answers?.[comp.id]?.[ep.var] ?? (ep.env ? process.env[ep.env] : void 0);
      if (!val) {
        if (!ep.optional) {
          results.push(["mcp", `SKIPPED (falta ${ep.var})`]);
          return results;
        }
      } else envFlags += ` -e ${ep.var}="${clean(val)}"`;
    }
    const userVal = Boolean(ctx.answers?.[comp.id] && Object.keys(ctx.answers[comp.id]).length);
    const existed = mcpHas(comp.mcp.name);
    if (existed && !userVal) {
      results.push(["mcp", "PRESENT"]);
      return results;
    }
    if (existed) await runAsync(`claude mcp remove ${comp.mcp.name} -s local`, { onData, cwd: ctx.projectDir });
    await runAsync(`claude mcp add ${comp.mcp.name} -s local${envFlags} -- ${cmd2}`, { onData, cwd: ctx.projectDir });
    mcpInvalidate();
    const ok = mcpHas(comp.mcp.name);
    results.push(["mcp", ok ? existed ? "RE-REGISTERED" : "REGISTERED" : "FAIL"]);
  }
  return results;
}

// src/generate.ts
import { existsSync as existsSync2, readFileSync as readFileSync3, writeFileSync, mkdirSync, copyFileSync, readdirSync as readdirSync2, rmSync } from "fs";
import { join as join3, dirname as dirname2, basename } from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { homedir as homedir2 } from "os";

// src/catalog.ts
import { readFileSync as readFileSync2 } from "fs";
import { fileURLToPath } from "url";
import { dirname, join as join2 } from "path";
import { z } from "zod";
var __dir = dirname(fileURLToPath(import.meta.url));
var CATALOG_DIR = join2(__dir, "..", "catalog");
var PromptSchema = z.object({
  key: z.string(),
  env: z.string().optional(),
  message: z.string(),
  placeholder: z.string().optional(),
  optional: z.boolean().optional(),
  validate: z.enum(["dir"]).optional()
});
var EnvPromptSchema = z.object({
  var: z.string(),
  env: z.string().optional(),
  message: z.string(),
  placeholder: z.string().optional(),
  optional: z.boolean().optional()
});
var McpSchema = z.object({
  name: z.string(),
  cmd: z.string(),
  envKeyArg: z.object({ var: z.string(), arg: z.string() }).optional(),
  envPrompt: EnvPromptSchema.optional(),
  prompt: PromptSchema.optional()
});
var InstallSchema = z.union([
  z.object({ type: z.literal("npm"), pkg: z.string(), bin: z.string().optional() }),
  z.object({ type: z.literal("pipx"), pkg: z.string(), bin: z.string().optional(), also: z.string().optional(), post: z.string().optional() }),
  z.object({ type: z.literal("rtk") }),
  z.object({ type: z.literal("project-npx"), cmd: z.string() }),
  z.object({ type: z.literal("husky") }),
  z.object({ type: z.literal("installer"), bin: z.string(), shUrl: z.string(), psUrl: z.string(), flags: z.string().optional() })
]);
var ComponentSchema = z.object({
  id: z.string(),
  name: z.string(),
  group: z.string(),
  tier: z.enum(["core", "suggested", "available"]),
  desc: z.string(),
  install: InstallSchema.nullable().optional(),
  mcp: McpSchema.nullable().optional(),
  claudemd: z.string().nullable().optional(),
  claudemdSection: z.string().nullable().optional(),
  docTier: z.enum(["discovery"]).optional(),
  memoryLevel: z.enum(["durable", "semantic"]).optional(),
  recommendIf: z.array(z.string()).optional(),
  requireTags: z.array(z.string()).optional(),
  recommendIfToolSearch: z.array(z.string()).optional(),
  conflictsWith: z.array(z.string()).optional(),
  userSkills: z.array(z.string()).optional(),
  requires: z.array(z.string()).optional()
});
var ProjectSkillSchema = z.object({
  id: z.string(),
  desc: z.string(),
  always: z.boolean().optional(),
  recommendIf: z.array(z.string()).optional(),
  requireTags: z.array(z.string()).optional()
});
var CatalogSchema = z.object({
  components: z.array(ComponentSchema).min(1),
  projectSkills: z.array(ProjectSkillSchema)
});
function loadCatalog(dir = CATALOG_DIR) {
  const raw = JSON.parse(readFileSync2(join2(dir, "components.json"), "utf8"));
  const parsed = CatalogSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("catalog/components.json invalido:\n" + z.prettifyError(parsed.error));
  }
  return parsed.data;
}

// src/generate.ts
var __dir2 = dirname2(fileURLToPath2(import.meta.url));
var APP_ROOT = join3(__dir2, "..");
var USER_RULES_PATH = join3(APP_ROOT, "user-rules.md");
var SIGNATURE = "Auto-generado por init-claude";
var USER_RULES_TEMPLATE = `# user-rules.md

Reglas personales que se inyectan en TODOS los CLAUDE.md que genera init-claude.
Este archivo esta en .gitignore: sobrevive a 'init-claude update' y nunca se sube al repo.

Escribe debajo de esta linea. Todo lo que pongas aparece como seccion
"Reglas del usuario" en cada proyecto que inicialices.
---
`;
function ensureUserRulesFile() {
  if (existsSync2(USER_RULES_PATH)) return "PRESENT";
  writeCRLF(USER_RULES_PATH, USER_RULES_TEMPLATE);
  return "CREATED";
}
function getUserRules() {
  if (!existsSync2(USER_RULES_PATH)) return "";
  const raw = readFileSync3(USER_RULES_PATH, "utf8");
  const idx = raw.indexOf("\n---");
  const body = idx >= 0 ? raw.slice(raw.indexOf("\n", idx + 2) + 1) : raw;
  return body.trim();
}
function writeCRLF(path, content) {
  writeFileSync(path, content.replace(/\r?\n/g, "\r\n"), "utf8");
}
function writeLF(path, content) {
  writeFileSync(path, content.replace(/\r\n/g, "\n"), "utf8");
}
function getCustomBlock(path) {
  if (!existsSync2(path)) return "";
  const m = readFileSync3(path, "utf8").match(/<!-- CUSTOM:START -->([\s\S]*?)<!-- CUSTOM:END -->/);
  return m ? `
<!-- CUSTOM:START -->${m[1]}<!-- CUSTOM:END -->` : "";
}
var MANAGED_HEADINGS = /* @__PURE__ */ new Set([
  "Memoria de sesion",
  "Contexto del proyecto (auto-detectado)",
  "Idioma y tono",
  "Modelo",
  "Plan first (cambios grandes)",
  "/compact disciplinado",
  "Herramientas",
  "Subagentes",
  "Superpowers (workflow del main thread)",
  "Diseno visual (workflow)",
  "Skills de proyecto (en .claude/skills/)",
  "Notas adicionales del proyecto",
  "Reglas del usuario (user-rules.md de init-claude)",
  "Skills custom (auto-recomendacion)",
  "Git y commits (REGLAS ESTRICTAS)",
  "Codigo",
  "Tests",
  "Definition of done",
  "Errores en sesion",
  "Dependencias",
  "Secretos",
  "Operaciones destructivas",
  "Que NO hacer"
]);
function extractUserSections(text2) {
  if (!text2) return [];
  const noCustom = text2.replace(/<!-- CUSTOM:START -->[\s\S]*?<!-- CUSTOM:END -->/g, "");
  const out = [];
  for (const part of noCustom.split(/\n(?=## )/)) {
    const m = part.match(/^## (.+?)\s*$/m);
    if (!m) continue;
    if (MANAGED_HEADINGS.has(m[1].trim())) continue;
    const trimmed = part.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}
function rotateBackups(path, keep = 5) {
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  copyFileSync(path, `${path}.bak`);
  copyFileSync(path, `${path}.${stamp}.bak`);
  const dir = dirname2(path), base = basename(path);
  const hist = readdirSync2(dir).filter((f) => f.startsWith(base + ".") && f.endsWith(".bak") && f !== base + ".bak").sort();
  for (const f of hist.slice(0, Math.max(0, hist.length - keep))) {
    try {
      rmSync(join3(dir, f));
    } catch {
    }
  }
}
function writeManaged(path, content) {
  if (existsSync2(path)) {
    const ex = readFileSync3(path, "utf8");
    if (!ex.includes(SIGNATURE)) return "SKIPPED";
  }
  mkdirSync(dirname2(path), { recursive: true });
  writeCRLF(path, content);
  return "CREATED";
}
function writeSkill(baseDir, skillName, content) {
  const safe = skillName.replace(/[^\w.-]/g, "-").replace(/^[.-]+/, "") || "skill";
  const dest = join3(baseDir, ".claude", "skills", safe, "SKILL.md");
  return writeManaged(dest, content);
}
function copySkillToProject(skillId, projectDir2) {
  const src = join3(CATALOG_DIR, "skills", `${skillId}.md`);
  if (!existsSync2(src)) return "MISSING";
  return writeSkill(projectDir2, skillId, readFileSync3(src, "utf8"));
}
function copySkillToUser(skillId) {
  const src = join3(CATALOG_DIR, "skills", `${skillId}.md`);
  if (!existsSync2(src)) return "MISSING";
  return writeSkill(homedir2(), skillId, readFileSync3(src, "utf8"));
}
function installAgents(withDesigner) {
  const agentsDir = join3(CATALOG_DIR, "agents");
  const destDir = join3(homedir2(), ".claude", "agents");
  const results = {};
  if (!existsSync2(agentsDir)) return results;
  for (const f of readdirSync2(agentsDir)) {
    const name = f.replace(/\.md$/, "");
    if (name === "designer" && !withDesigner) continue;
    results[name] = writeManaged(join3(destDir, f), readFileSync3(join3(agentsDir, f), "utf8"));
  }
  return results;
}
function installCommands() {
  const cmdsDir = join3(CATALOG_DIR, "commands");
  const destDir = join3(homedir2(), ".claude", "commands");
  const results = {};
  if (!existsSync2(cmdsDir)) return results;
  for (const f of readdirSync2(cmdsDir)) {
    results[f.replace(/\.md$/, "")] = writeManaged(join3(destDir, f), readFileSync3(join3(cmdsDir, f), "utf8"));
  }
  return results;
}
function generateClaudeMd(projectDir2, selectedComps, projectSkills, hasSuperpowers, extraContent, profile = null, toolSearchOn = false) {
  const policyLines = [], discovery = [];
  for (const c of selectedComps) {
    if (!c.claudemd) continue;
    if (toolSearchOn && c.docTier === "discovery") discovery.push(c.mcp?.name ?? c.id);
    else policyLines.push(c.claudemd);
  }
  if (discovery.length)
    policyLines.push(`- Tools instaladas (desc\xFAbrelas por b\xFAsqueda de tools seg\xFAn la tarea): ${discovery.join(", ")}.`);
  const toolLines = policyLines.join("\n");
  const sections = selectedComps.map((c) => c.claudemdSection).filter(Boolean).join("\n\n");
  const selectedIds = new Set(selectedComps.map((c) => c.id));
  const hasDesignTools = selectedIds.has("pencil") || selectedIds.has("figma");
  const projSkillsSection = projectSkills.length ? `
## Skills de proyecto (en .claude/skills/)

Aplica estos skills cuando la tarea lo toque:
${projectSkills.map((s) => `- \`${s}\``).join("\n")}` : "";
  const spSection = hasSuperpowers ? `
## Superpowers (workflow del main thread)

- Brainstorming: \`superpowers:brainstorming\`.
- Planes: \`superpowers:writing-plans\` / \`executing-plans\`; delegar con contexto aislado: subagente \`planner\`.
- TDD: \`superpowers:test-driven-development\`.
- Debugging: \`superpowers:systematic-debugging\`; delegado: \`bug-investigator\`.
- Antes de marcar terminado: \`superpowers:verification-before-completion\`.
- Code review: \`superpowers:requesting-code-review\` + subagente \`code-reviewer\`.
- NO uses \`superpowers:using-git-worktrees\` salvo peticion explicita.` : "";
  const claudeMdPath = join3(projectDir2, "CLAUDE.md");
  const oldText = existsSync2(claudeMdPath) ? readFileSync3(claudeMdPath, "utf8") : "";
  const userSections = extractUserSections(oldText);
  let custom = getCustomBlock(claudeMdPath);
  if (userSections.length) {
    const migrated = `<!-- init-claude migro estas secciones (estaban fuera de CUSTOM) para no perderlas -->

${userSections.join("\n\n")}`;
    custom = custom ? custom.replace("<!-- CUSTOM:END -->", `
${migrated}
<!-- CUSTOM:END -->`) : `
<!-- CUSTOM:START -->

${migrated}

<!-- CUSTOM:END -->`;
  }
  const extra = extraContent ? `
## Notas adicionales del proyecto

${extraContent}
` : "";
  const userRules = getUserRules();
  const userRulesSection = userRules ? `
## Reglas del usuario (user-rules.md de init-claude)

${userRules}
` : "";
  const profileSection = profile ? `
## Contexto del proyecto (auto-detectado)

- Stack: ${profile.langs.join(", ") || "sin lenguaje detectado"}${profile.fws.length ? ` (${profile.fws.join(", ")})` : ""}.
- Tamano: ${profile.fileCount} archivos de codigo (${profile.size})${profile.isMonorepo ? ", monorepo" : ""}.
- Tests: ${profile.hasTests ? "si" : "no detectados"}. CI: ${profile.hasCI ? "si" : "no"}. Docs: ${profile.hasDocs ? "si" : "no"}.
- Si esta seccion queda obsoleta, re-ejecuta init-claude.
` : "";
  const designSection = hasDesignTools ? `
## Diseno visual (workflow)

- Antes de cualquier tarea visual: skill \`design-brief\`.
${selectedIds.has("figma") ? "- Figma a codigo: skill `figma-to-code`.\n" : ""}${selectedIds.has("pencil") ? "- Pencil a codigo: skill `pencil-to-code`.\n" : ""}` : "";
  const md = `# CLAUDE.md
<!-- ${SIGNATURE} \xB7 lo editado fuera del bloque CUSTOM se regenera; pon tus reglas en CUSTOM -->

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
  const existed = existsSync2(path);
  if (existed) rotateBackups(path);
  writeCRLF(path, md);
  return existed ? "UPDATED" : "CREATED";
}
function generateProjectSettings(projectDir2) {
  const path = join3(projectDir2, ".claude", "settings.json");
  if (existsSync2(path)) return "PRESENT";
  mkdirSync(dirname2(path), { recursive: true });
  const settings = {
    permissions: {
      deny: [
        "Read(.env)",
        "Read(.env.*)",
        "Read(**/.env)",
        "Read(**/.env.*)",
        "Read(**/secrets/**)",
        "Read(**/*credentials*)",
        "Read(**/*.pem)",
        "Read(**/*.key)",
        "Read(**/*.p12)",
        "Read(**/id_rsa*)",
        "Read(**/id_ed25519*)",
        "Read(**/.aws/**)",
        "Read(**/.ssh/**)",
        "Read(**/.gnupg/**)",
        "Read(**/node_modules/**)",
        "Read(**/.git/objects/**)",
        "Read(**/dist/**)",
        "Read(**/build/**)",
        "Read(**/out/**)",
        "Read(**/.next/**)",
        "Read(**/.nuxt/**)",
        "Read(**/.svelte-kit/**)",
        "Read(**/.cache/**)",
        "Read(**/coverage/**)",
        "Read(**/__pycache__/**)",
        "Read(**/.pytest_cache/**)",
        "Read(**/.venv/**)",
        "Read(**/venv/**)",
        "Read(**/target/**)",
        "Read(**/vendor/**)",
        "Read(**/*.lock)",
        "Read(**/*.lockb)",
        "Read(**/package-lock.json)",
        "Read(**/yarn.lock)",
        "Read(**/pnpm-lock.yaml)",
        "Read(**/poetry.lock)",
        "Read(**/*.log)",
        "Read(**/logs/**)",
        "Read(**/*.sqlite)",
        "Read(**/*.sqlite3)",
        "Read(**/*.db)",
        "Read(**/*.min.js)",
        "Read(**/*.min.css)",
        "Read(**/*.map)",
        "Bash(rm -rf /*)",
        "Bash(rm -rf ~)",
        "Bash(sudo *)",
        "Bash(curl * | sh)",
        "Bash(curl * | bash)",
        "Bash(wget * | sh)",
        "Bash(git push --force *)",
        "Bash(git push -f *)",
        "Bash(git reset --hard *)",
        "Bash(git clean -fdx*)",
        "Bash(dd *)",
        "Bash(mkfs.*)",
        "Bash(format *)"
      ],
      allow: [
        "Bash(git:*)",
        "Bash(npm:*)",
        "Bash(pnpm:*)",
        "Bash(yarn:*)",
        "Bash(node:*)",
        "Bash(python:*)",
        "Bash(pip:*)",
        "Bash(pipx:*)",
        "Bash(pytest:*)",
        "Bash(ruff:*)",
        "Bash(eslint:*)",
        "Bash(tsc:*)",
        "Bash(prettier:*)",
        "Bash(vitest:*)",
        "Bash(jest:*)",
        "Bash(cargo:*)",
        "Bash(go:*)",
        "Bash(make:*)"
      ]
    }
  };
  writeCRLF(path, JSON.stringify(settings, null, 2));
  return "CREATED";
}
function updateGitignore(projectDir2) {
  const path = join3(projectDir2, ".gitignore");
  const entries = [".context-mode/", ".code-review-graph/", "CLAUDE.md.bak", "CLAUDE.md.*.bak", ".serena/", ".codebase-memory/", ".claude/init-snapshot.json", "settings.json.bak"];
  const existing = existsSync2(path) ? readFileSync3(path, "utf8") : "";
  const added = entries.filter((e) => !existing.includes(e));
  if (!added.length) return "PRESENT";
  writeFileSync(path, existing + "\n# Claude Code tooling\n" + added.join("\n") + "\n");
  return `UPDATED (${added.length})`;
}
function installGitHooks(projectDir2, hasHusky) {
  if (!existsSync2(join3(projectDir2, ".git"))) return "SKIPPED (sin .git)";
  const hook = `#!/bin/sh
# ${SIGNATURE}
MSG_FILE="$1"
if grep -qiE "(co-authored-by:[[:space:]]*claude|co-authored-by:.*@anthropic|generated[[:space:]]+with[[:space:]]*\\[claude|generated[[:space:]]+by[[:space:]]+claude|\u{1F916})" "$MSG_FILE"; then
  echo ""
  echo " COMMIT RECHAZADO: referencia a IA detectada"
  echo " Elimina: Co-Authored-By: Claude / Generated with [Claude Code] / emoji robot"
  exit 1
fi
exit 0
`;
  const targets = [join3(projectDir2, ".git", "hooks", "commit-msg")];
  if (hasHusky && existsSync2(join3(projectDir2, ".husky"))) targets.push(join3(projectDir2, ".husky", "commit-msg"));
  const done = [];
  for (const t of targets) {
    if (existsSync2(t) && !readFileSync3(t, "utf8").includes(SIGNATURE)) {
      done.push("otro hook, no tocado");
      continue;
    }
    mkdirSync(dirname2(t), { recursive: true });
    writeLF(t, hook);
    done.push(t.includes(".husky") ? ".husky" : ".git/hooks");
  }
  return `INSTALLED (${done.join(", ")})`;
}
function saveSnapshot(projectDir2, selected) {
  const path = join3(projectDir2, ".claude", "init-snapshot.json");
  mkdirSync(dirname2(path), { recursive: true });
  writeCRLF(path, JSON.stringify({ version: "v13", date: (/* @__PURE__ */ new Date()).toISOString(), selected }, null, 2));
}
function loadSnapshot(projectDir2) {
  const path = join3(projectDir2, ".claude", "init-snapshot.json");
  if (!existsSync2(path)) return null;
  try {
    return JSON.parse(readFileSync3(path, "utf8"));
  } catch {
    return null;
  }
}

// src/remote.ts
import { execSync as execSync2 } from "child_process";
import { existsSync as existsSync3, readFileSync as readFileSync4, writeFileSync as writeFileSync2 } from "fs";
import { join as join4, dirname as dirname3 } from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
var __dir3 = dirname3(fileURLToPath3(import.meta.url));
var APP_ROOT2 = join4(__dir3, "..");
var STAMP = join4(APP_ROOT2, ".last-update-check");
function git(args2) {
  try {
    return execSync2(`git ${args2}`, { cwd: APP_ROOT2, encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return null;
  }
}
function isGitRepo() {
  return existsSync3(join4(APP_ROOT2, ".git"));
}
function isNpmInstall() {
  return /[\\/]node_modules[\\/]/.test(APP_ROOT2);
}
var REPO_URL = (() => {
  try {
    const pkg = JSON.parse(readFileSync4(join4(APP_ROOT2, "package.json"), "utf8"));
    return (pkg.repository?.url || "").replace(/^git\+/, "").replace(/\.git$/, "") || null;
  } catch {
    return null;
  }
})();
function migrateToGit() {
  if (!REPO_URL) return { ok: false, msg: "No se pudo determinar la URL del repo (package.json)." };
  if (git("init -q") === null) return { ok: false, msg: "git init fallo." };
  if (git("remote get-url origin") === null) git(`remote add origin ${REPO_URL}`);
  else git(`remote set-url origin ${REPO_URL}`);
  if (git("fetch --depth 1 origin main") === null)
    return { ok: false, msg: "git fetch fallo (sin red o repo inaccesible)." };
  if (git("checkout -f -B main origin/main") === null) return { ok: false, msg: "git checkout fallo." };
  git("branch --set-upstream-to=origin/main main");
  return { ok: true, msg: "Copia xcopy convertida a repo git (auto-migracion)." };
}
function checkUpdatesQuiet() {
  if (!isGitRepo()) return 0;
  try {
    const last = existsSync3(STAMP) ? parseInt(readFileSync4(STAMP, "utf8")) : 0;
    if (Date.now() - last < 24 * 3600 * 1e3) return 0;
    writeFileSync2(STAMP, String(Date.now()));
    git("fetch --quiet");
    const behind = git("rev-list HEAD..@{u} --count");
    return behind ? parseInt(behind) : 0;
  } catch {
    return 0;
  }
}
function selfUpdate() {
  let prefix = "";
  if (!isGitRepo()) {
    if (isNpmInstall())
      return { ok: false, msg: "Instalacion via npm. Actualiza con: npm update -g @episuarez/init-claude" };
    const m = migrateToGit();
    if (!m.ok) return m;
    prefix = m.msg + "\n";
  }
  const pull = git("pull");
  if (pull === null) return { ok: false, msg: prefix + "git pull fallo (conflictos o sin upstream)." };
  try {
    execSync2("npm install --omit=dev", { cwd: APP_ROOT2, stdio: "pipe" });
  } catch {
  }
  return { ok: true, msg: prefix + pull };
}
async function fetchSkill(url) {
  let target = url;
  const gh = url.match(/^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/?$/);
  if (gh) target = `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/main/SKILL.md`;
  target = target.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
  const res = await fetch(target);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${target}`);
  const content = await res.text();
  if (!content.trim()) throw new Error("Contenido vacio");
  const fm = content.match(/^---[\s\S]*?name:\s*([\w-]+)/m);
  const name = fm ? fm[1] : (target.split("/").filter(Boolean).slice(-2, -1)[0] || "remote-skill").replace(/\.md$/, "");
  return { name, content };
}
async function fetchRegistry(registryUrl) {
  try {
    const res = await fetch(registryUrl);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
function getRegistryUrl() {
  const cfg = join4(APP_ROOT2, "config.json");
  if (existsSync3(cfg)) {
    try {
      return JSON.parse(readFileSync4(cfg, "utf8")).registryUrl ?? null;
    } catch {
    }
  }
  return null;
}

// src/ui.ts
import pc from "picocolors";
function termWidth() {
  return process.stdout.columns || 80;
}
function isTTY() {
  return Boolean(process.stdout.isTTY);
}
function unicodeOk() {
  if (process.platform !== "win32") return true;
  return Boolean(
    process.env.WT_SESSION || process.env.TERM_PROGRAM === "vscode" || /UTF-8|65001/i.test(process.env.PYTHONIOENCODING || "") || /UTF-8|65001/i.test(process.env.LANG || "")
  );
}
function barChars() {
  return unicodeOk() ? { full: "\u2588", empty: "\u2591" } : { full: "#", empty: "-" };
}
function sym() {
  return unicodeOk() ? { ok: "\u2713", fail: "\u2717", skip: "\u2013", dot: "\u2022", boxOn: "[x]", boxOff: "[ ]", warn: "!" } : { ok: "+", fail: "x", skip: "-", dot: "*", boxOn: "[x]", boxOff: "[ ]", warn: "!" };
}
var ELLIPSIS = "\u2026";
function truncate(str, max = termWidth()) {
  const s = String(str ?? "");
  if (max <= 1) return s.slice(0, max);
  return s.length <= max ? s : s.slice(0, max - 1) + ELLIPSIS;
}
function progressBar(done, total, width = 20) {
  const { full, empty } = barChars();
  const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 1;
  const fill = Math.round(ratio * width);
  return `[${full.repeat(fill)}${empty.repeat(width - fill)}] ${done}/${total}`;
}
function elapsedTicker(spinner3, label) {
  let secs = 0;
  const id = setInterval(() => {
    secs++;
    spinner3.message(`${label} ${pc.gray(secs + "s")}`);
  }, 1e3);
  return () => clearInterval(id);
}
function statusLabel(raw) {
  const v = String(raw ?? "").trim();
  const tail = (v.match(/\(([^)]*)\)/) || [])[1];
  const paren = tail ? ` (${tail})` : "";
  if (/^FAIL|^ERROR/i.test(v)) return { kind: "fail", text: "fallo" + paren };
  if (/^TIMEOUT/i.test(v)) return { kind: "fail", text: "timeout" + paren };
  if (/^SKIPPED/i.test(v)) return { kind: "skip", text: "omitido" + paren };
  if (/^MISSING/i.test(v)) return { kind: "skip", text: "no encontrado" };
  if (/^PRESENT/i.test(v)) return { kind: "present", text: "ya presente" };
  if (/^RE-REGISTERED/i.test(v)) return { kind: "ok", text: "reconfigurado" };
  if (/^REMOVED/i.test(v)) return { kind: "present", text: "desinstalado" };
  if (/^REGISTERED/i.test(v)) return { kind: "ok", text: "registrado" };
  if (/^INSTALLED/i.test(v)) return { kind: "ok", text: "instalado" + paren };
  if (/^CREATED/i.test(v)) return { kind: "ok", text: "creado" };
  if (/^UPDATED/i.test(v)) return { kind: "ok", text: "actualizado" + paren };
  return { kind: "ok", text: v.toLowerCase() };
}
function colorByKind(kind, s) {
  if (kind === "fail") return pc.red(s);
  if (kind === "skip") return pc.yellow(s);
  if (kind === "present") return pc.gray(s);
  return pc.green(s);
}
var KEY_LABEL = { bin: "binario", mcp: "MCP", skills: "skills" };
function formatSummary(results) {
  const s = sym();
  const nameW = Math.min(24, Math.max(8, ...results.map(([n]) => n.length)));
  return results.map(([name, parts, failed, ms]) => {
    const icon = failed ? pc.red(s.fail) : pc.green(s.ok);
    const cells = (parts || []).map(([k, v]) => {
      const st = statusLabel(v);
      return `${KEY_LABEL[k] ?? k}: ${colorByKind(st.kind, st.text)}`;
    }).join(pc.gray(" \xB7 "));
    let time = "";
    if (ms != null) {
      const txt = ms >= 1e3 ? (ms / 1e3).toFixed(1) + "s" : ms + "ms";
      time = "  " + (ms >= 1500 ? pc.yellow(txt) : pc.gray(txt));
    }
    return `${icon} ${name.padEnd(nameW)}  ${cells}${time}`;
  }).join("\n");
}
function remedyFor(value) {
  const v = String(value).toLowerCase();
  if (v.includes("sin python")) return "instala Python 3 + pipx (pip install pipx)";
  if (v.includes("falta uv")) return "instala uv: pipx install uv";
  if (v.includes("rust") || v.includes("cargo")) return "instala Rust en rustup.rs y reintenta: init-claude upgrade";
  if (v.includes("npm")) return "reintenta a mano: npm install -g <pkg>";
  if (v.includes("pipx")) return "verifica pipx: pipx --version";
  if (v.includes("timeout")) return "red lenta o instalador colgado; reintenta o instala a mano";
  if (v.includes("falta")) return "re-ejecuta el wizard y proporciona el dato pedido";
  if (v.includes(".git")) return "inicia git (git init) si quieres los hooks";
  return "revisa el log del comando e instala a mano";
}
function mask(v) {
  const s = String(v);
  return s.length <= 6 ? "***" : s.slice(0, 3) + "***" + s.slice(-2);
}
function weightDots(weight) {
  const u = unicodeOk(), f = u ? "\u25CF" : "#", e = u ? "\u25CB" : "-";
  const n = weight === "heavy" ? 3 : weight === "medium" ? 2 : weight === "light" ? 1 : 0;
  const dots = f.repeat(n) + e.repeat(3 - n);
  return weight === "heavy" ? pc.red(dots) : weight === "medium" ? pc.yellow(dots) : weight === "light" ? pc.green(dots) : pc.gray(dots);
}
function costTag(cost) {
  const parts = [];
  if (cost.tools != null) parts.push(`${cost.tools} tools${cost.toolsDeferred ? " (diferido)" : ""}`);
  if (cost.needs?.length) parts.push("req: " + cost.needs.join("+"));
  return parts.join(pc.gray(" \xB7 "));
}
var TIER_TAG = {
  core: () => pc.bgGreen(pc.black(" core ")),
  suggested: () => pc.cyan("sugerido"),
  available: () => pc.yellow("opt-in")
};
var tierTag = (t) => (TIER_TAG[t] ?? TIER_TAG.suggested)();
function recoLine(a, nameW = 18) {
  const icon = a.providedAlready ? pc.gray(sym().dot) : a.recommended ? pc.green(sym().ok) : pc.gray(sym().dot);
  const name = a.providedAlready ? pc.gray(a.name.padEnd(nameW)) : a.name.padEnd(nameW);
  const cost = costTag(a.cost);
  const desc = a.desc ? truncate(a.desc, 64) : "";
  const tail = [a.reason, cost].filter(Boolean).join(" \xB7 ");
  const body = a.providedAlready ? pc.gray(`${desc}${tail ? "  \xB7 " + tail : ""}`) : `${desc}${tail ? pc.gray("  \xB7 " + tail) : ""}`;
  return `${icon} ${name} ${weightDots(a.cost.weight)}  ${body}`;
}

// src/commands/wizard.ts
import * as p from "@clack/prompts";
import pc2 from "picocolors";
import { existsSync as existsSync5, readFileSync as readFileSync6, statSync } from "fs";
import { join as join6 } from "path";

// src/detect.ts
import { readdirSync as readdirSync3, existsSync as existsSync4, readFileSync as readFileSync5 } from "fs";
import { join as join5, extname } from "path";
var EXCLUDE = /* @__PURE__ */ new Set(["node_modules", "dist", "build", "out", ".next", ".nuxt", ".cache", "coverage", "__pycache__", ".venv", "venv", "target", "vendor", ".git", ".svelte-kit"]);
var CODE_EXTS = /* @__PURE__ */ new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx", ".py", ".go", ".rs", ".java", ".rb", ".php", ".cs", ".swift", ".kt", ".vue", ".svelte"]);
var DOC_EXTS = /* @__PURE__ */ new Set([".pdf", ".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".epub"]);
var DESIGN_EXTS = /* @__PURE__ */ new Set([".pen", ".fig"]);
function walk(dir, state, depth = 0) {
  if (depth > 12) return;
  let entries;
  try {
    entries = readdirSync3(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!EXCLUDE.has(e.name)) walk(join5(dir, e.name), state, depth + 1);
    } else {
      const ext = extname(e.name).toLowerCase();
      if (CODE_EXTS.has(ext)) state.fileCount++;
      if (DOC_EXTS.has(ext)) state.hasDocs = true;
      if (DESIGN_EXTS.has(ext)) state.hasDesign = true;
    }
  }
}
function readSafe(p3) {
  try {
    return readFileSync5(p3, "utf8");
  } catch {
    return "";
  }
}
function detectProfile(root) {
  const state = { fileCount: 0, hasDocs: false, hasDesign: false };
  walk(root, state);
  const tags = /* @__PURE__ */ new Set();
  const langs = [], fws = [];
  const has = (p3) => existsSync4(join5(root, p3));
  if (has(".git")) tags.add("git");
  const size = state.fileCount < 50 ? "small" : state.fileCount < 500 ? "medium" : "large";
  tags.add(size);
  if (size !== "small") tags.add("sizable");
  if (state.hasDocs) tags.add("docs");
  if (state.hasDesign) tags.add("design");
  let hasTests = false;
  if (has("package.json")) {
    langs.push("javascript");
    tags.add("javascript");
    try {
      const pkg = JSON.parse(readSafe(join5(root, "package.json")));
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).join(" ");
      if (/react|next|vue|nuxt|svelte|astro|solid|qwik|remix|@angular/.test(deps)) {
        fws.push("frontend");
        tags.add("frontend");
      }
      if (/playwright|puppeteer|cypress/.test(deps)) {
        fws.push("e2e");
        tags.add("e2e");
      }
      if (/jest|vitest|mocha|jasmine|ava/.test(deps)) hasTests = true;
      if (/express|fastify|hono|koa|@nestjs/.test(deps)) {
        fws.push("backend-node");
        tags.add("backend-node");
      }
      if (/openai|@anthropic-ai|anthropic|langchain|llamaindex|cohere|mistralai|generative-ai|@ai-sdk|\bai-sdk|ollama|huggingface/.test(deps)) tags.add("ai");
    } catch {
    }
  }
  for (const f of ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile"]) {
    if (has(f)) {
      langs.push("python");
      tags.add("python");
      const c = readSafe(join5(root, f));
      if (/fastapi|django|flask|starlette|aiohttp/.test(c)) {
        fws.push("backend-python");
        tags.add("backend-python");
      }
      if (/pytest|unittest/.test(c)) hasTests = true;
      if (/openai|anthropic|langchain|llama-index|transformers|cohere|mistralai|generativeai|litellm|sentence-transformers/.test(c)) tags.add("ai");
      break;
    }
  }
  if (has("go.mod")) {
    langs.push("go");
    tags.add("go");
  }
  if (has("Cargo.toml")) {
    langs.push("rust");
    tags.add("rust");
  }
  if (has("pom.xml") || has("build.gradle")) {
    langs.push("java");
    tags.add("java");
  }
  if (has("Assets")) {
    try {
      const stack = [join5(root, "Assets")];
      let found = false;
      while (stack.length && !found) {
        const d = stack.pop();
        for (const e of readdirSync3(d, { withFileTypes: true })) {
          if (e.isFile() && e.name.endsWith(".cs")) {
            found = true;
            break;
          }
          if (e.isDirectory()) stack.push(join5(d, e.name));
        }
      }
      if (found) {
        langs.push("csharp");
        fws.push("unity");
        tags.add("csharp");
        tags.add("unity");
      }
    } catch {
    }
  }
  for (const f of ["Dockerfile", "dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", "Containerfile"])
    if (has(f)) {
      tags.add("docker");
      break;
    }
  for (const f of ["pnpm-workspace.yaml", "lerna.json", "nx.json", "turbo.json", "rush.json"])
    if (has(f)) {
      tags.add("monorepo");
      break;
    }
  for (const d of [".github/workflows", ".gitlab-ci.yml", ".circleci", "Jenkinsfile", ".gitea/workflows", ".forgejo/workflows"])
    if (has(d)) {
      tags.add("ci");
      break;
    }
  for (const t of ["tests", "test", "__tests__", "spec", "e2e", "cypress"])
    if (has(t)) {
      hasTests = true;
      break;
    }
  for (const t of ["design", "designs", "assets/design", "src/design"])
    if (has(t)) {
      tags.add("design");
      break;
    }
  if (hasTests) tags.add("tests");
  if (hasTests && tags.has("git") && has("package.json")) tags.add("tests-node");
  return { tags, langs, fws, fileCount: state.fileCount, size, hasDocs: state.hasDocs, hasDesign: state.hasDesign, hasTests, hasGit: tags.has("git"), hasCI: tags.has("ci"), isMonorepo: tags.has("monorepo") };
}

// src/recommend.ts
var MARKETPLACE = "anthropics/claude-plugins-official";
var PLUGIN = "claude-code-setup";
var SAFE_INSTALL = /^(claude mcp add |claude plugin (install|i) |npx -y |npx @|npm i |npm install )/;
var SHELL_META = /[;&|`$(){}<>\n\r\\]/;
var PROMPT = [
  "Use the claude-automation-recommender skill to analyze THIS codebase.",
  "Then output ONLY a JSON array (no prose, no markdown fences) of recommended Claude Code automations.",
  'Each item: {"category":"mcp"|"plugin"|"skill"|"hook"|"subagent","name":string,"why":string (<=110 chars),"install":string}.',
  'For "install": give the EXACT shell command for mcp servers and plugins (e.g. "claude mcp add context7 -- npx -y @upstash/context7-mcp"). For skill/hook/subagent set "install" to "".',
  "Max 8 items, the most valuable for this specific repo. Output the JSON array and nothing else."
].join(" ");
function recommenderAvailable() {
  return hasCmd("claude");
}
function pluginInstalled() {
  if (!hasCmd("claude")) return false;
  const out = run("claude plugin list").out || "";
  return out.includes(PLUGIN);
}
async function installRecommenderPlugin(onData) {
  await runAsync(`claude plugin marketplace add ${MARKETPLACE}`, { onData });
  const r = await runAsync(`claude plugin install ${PLUGIN}@claude-plugins-official`, { onData, timeout: 12e4 });
  return r.ok || pluginInstalled();
}
function extractJsonArray(text2) {
  if (!text2) return [];
  const fence = text2.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text2;
  const s = body.indexOf("["), e = body.lastIndexOf("]");
  if (s < 0 || e < 0 || e < s) return [];
  try {
    const a = JSON.parse(body.slice(s, e + 1));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
function isSafeInstall(cmd2) {
  const c = String(cmd2 || "").trim();
  return SAFE_INSTALL.test(c) && !SHELL_META.test(c);
}
function normalizeSuggestions(raw) {
  return (Array.isArray(raw) ? raw : []).filter((s) => !!s && typeof s === "object" && "name" in s && "category" in s).map((s) => {
    const install = String(s.install || "").trim();
    return {
      category: String(s.category),
      name: String(s.name),
      why: String(s.why || "").slice(0, 110),
      install,
      installable: isSafeInstall(install)
    };
  });
}
function parseSuggestions(text2) {
  let t = text2;
  try {
    const env = JSON.parse(text2);
    t = env.result ?? env.response ?? text2;
  } catch {
  }
  return normalizeSuggestions(extractJsonArray(t));
}
async function runRecommender(projectDir2, onData) {
  const cmd2 = `claude -p ${JSON.stringify(PROMPT)} --output-format json --allowedTools Read Glob Grep Bash`;
  const r = await runAsync(cmd2, { cwd: projectDir2, timeout: 24e4, onData });
  if (!r.ok) return { ok: false, error: r.timedOut ? "timeout" : `exit ${r.code}`, suggestions: [] };
  return { ok: true, suggestions: parseSuggestions(r.out) };
}
async function runInstall(cmd2, onData) {
  if (!isSafeInstall(cmd2)) return { ok: false, error: "bloqueado (fuera del allowlist)" };
  return runAsync(cmd2, { timeout: 18e4, onData });
}

// src/advisor.ts
var TAG_LABEL = {
  javascript: "JS/TS",
  python: "Python",
  go: "Go",
  rust: "Rust",
  java: "Java",
  csharp: "C#",
  frontend: "frontend",
  "backend-node": "backend Node",
  "backend-python": "backend Python",
  e2e: "tests E2E",
  unity: "Unity",
  sizable: "codebase grande",
  large: "codebase enorme",
  monorepo: "monorepo",
  docs: "documentos",
  design: "dise\xF1o",
  tests: "tests",
  "tests-node": "tests JS",
  ci: "CI",
  git: "git",
  docker: "Docker",
  ai: "IA/LLM"
};
var tagLabel = (t) => TAG_LABEL[t] ?? t;
var TOOLS = {
  "context-mode": 9,
  "sequential-thinking": 1,
  context7: 2,
  serena: 20,
  playwright: 25,
  markitdown: 1,
  pencil: 8,
  figma: 5,
  vault: 11,
  "codebase-memory-mcp": 14,
  "code-review-graph": 3
};
function toolsOf(c) {
  if (c.mcp && TOOLS[c.mcp.name] != null) return TOOLS[c.mcp.name];
  return TOOLS[c.id] ?? null;
}
function baseWeight(c) {
  const t = c.install?.type;
  if (t === "pipx" || t === "installer") return "medium";
  if (t === "npm" || t === "project-npx" || t === "rtk" || t === "husky") return "light";
  return c.mcp ? "light" : "none";
}
var WEIGHT_RANK = { none: 0, light: 1, medium: 2, heavy: 3 };
function weightOf(c, opts = {}) {
  let w = baseWeight(c);
  const tools = toolsOf(c);
  if (tools != null && !opts.toolSearchOn) {
    if (tools >= 20) w = "heavy";
    else if (tools >= 10 && WEIGHT_RANK[w] < 2) w = "medium";
  }
  return w;
}
function needsOf(c) {
  const n = [];
  if (c.install?.type === "pipx") n.push("python+pipx");
  if (c.requires?.includes("uv")) n.push("uv");
  if (c.install?.type === "rtk") n.push("cargo");
  if (c.install?.type === "installer") n.push("descarga binario");
  if (c.mcp) n.push("claude");
  if (c.mcp?.envPrompt && !c.mcp.envPrompt.optional) n.push("token");
  if (c.mcp?.prompt && !c.mcp.prompt.optional) n.push("ruta");
  return n;
}
function analyze(c, profile, opts) {
  const provided = opts.provided ?? /* @__PURE__ */ new Set();
  const toolSearchOn = opts.toolSearchOn === true;
  const tier = c.tier ?? "suggested";
  const providedAlready = provided.has(c.id.toLowerCase()) || !!c.mcp && provided.has(c.mcp.name.toLowerCase()) || !!c.install && "bin" in c.install && !!c.install.bin && provided.has(c.install.bin.toLowerCase());
  const signals = (c.recommendIf ?? []).filter((t) => profile.tags.has(t));
  let recommended = false, reason = "";
  if (providedAlready) {
    reason = "ya instalado";
  } else if (tier === "core") {
    recommended = true;
    reason = "valor universal, overhead minimo";
  } else if (tier === "available") {
    const ts = (c.recommendIfToolSearch ?? []).filter((t) => profile.tags.has(t));
    if (toolSearchOn && ts.length) {
      recommended = true;
      reason = "opt-in (Tool Search activo): " + ts.map(tagLabel).join(", ");
    } else reason = "opt-in \u2014 act\xEDvalo si lo necesitas";
  } else {
    const orOk = signals.length > 0;
    const missing = (c.requireTags ?? []).filter((t) => !profile.tags.has(t));
    if (orOk && !missing.length) {
      recommended = true;
      reason = "detectado: " + signals.map(tagLabel).join(", ");
    } else if (orOk && missing.length) reason = "aplica, pero falta: " + missing.map(tagLabel).join(", ");
    else reason = "no aplica a este repo";
  }
  const cost = {
    tools: toolsOf(c),
    toolsDeferred: toolSearchOn && toolsOf(c) != null,
    weight: weightOf(c, { toolSearchOn }),
    needs: needsOf(c)
  };
  return {
    id: c.id,
    name: c.name,
    group: c.group,
    tier,
    desc: c.desc ?? "",
    recommended,
    providedAlready,
    reason,
    signals: signals.map(tagLabel),
    cost
  };
}
function analyzeCatalog(components, profile, opts) {
  return new Map(components.map((c) => [c.id, analyze(c, profile, opts)]));
}

// src/commands/wizard.ts
async function runWizard(ctx) {
  const { projectDir: projectDir2, version: VERSION2, flagYes: flagYes2 } = ctx;
  const catalog = loadCatalog();
  const S = sym();
  process.setMaxListeners(50);
  const t0 = Date.now();
  console.clear();
  p.intro(pc2.bgCyan(pc2.black(` init-claude v${VERSION2} `)));
  if (!hasCmd("claude"))
    p.log.warn("Claude Code CLI no detectado. Los MCP no se registraran. Instala: npm install -g @anthropic-ai/claude-code");
  const s = p.spinner();
  s.start("Analizando el proyecto");
  const profile = detectProfile(projectDir2);
  const plugins = [...new Set(installedPlugins())];
  const hasSuperpowers = plugins.some((x) => /superpowers/i.test(x));
  const toolSearch = toolSearchState();
  s.message("Consultando MCPs y plugins registrados");
  const provided = new Set([...plugins, ...mcpList()].map((x) => x.toLowerCase()));
  s.stop("Proyecto analizado");
  p.note([
    `Stack    ${pc2.cyan(profile.langs.join(", ") || "sin lenguaje")}${profile.fws.length ? pc2.gray(" \xB7 " + profile.fws.join(", ")) : ""}`,
    `Tamano   ${profile.fileCount} archivos (${profile.size})${profile.isMonorepo ? pc2.gray(" \xB7 monorepo") : ""}`,
    `Senales  ${[profile.hasTests && "tests", profile.hasCI && "CI", profile.hasDocs && "docs", profile.hasDesign && "dise\xF1o"].filter(Boolean).join(", ") || "ninguna"}`
  ].join("\n"), "Perfil detectado");
  if (toolSearch.on === false)
    p.log.warn(`MCP Tool Search OFF (${toolSearch.reason}). Sin el, cada tool de cada MCP carga su schema en contexto. React\xEDvalo (quita ENABLE_TOOL_SEARCH=off, o usa ENABLE_TOOL_SEARCH=auto:10): ~85% menos overhead de tools.`);
  else if (toolSearch.on === true)
    p.log.info(`MCP Tool Search ${toolSearch.mode === "forced" ? "forzado" : "activo"} (${toolSearch.reason}): los schemas se cargan bajo demanda, el n\xBA de tools deja de pesar en contexto.`);
  const analyses = analyzeCatalog(catalog.components, profile, { provided, toolSearchOn: toolSearch.on === true });
  const an = (id) => analyses.get(id);
  const isRec = (c) => an(c.id).recommended;
  const recSkill = (sk) => sk.always === true || (sk.recommendIf ?? []).some((t) => profile.tags.has(t)) && (sk.requireTags ?? []).every((t) => profile.tags.has(t));
  const catIndex = new Map(catalog.components.map((c, i) => [c.id, i]));
  const byId = new Map(catalog.components.map((c) => [c.id, c]));
  let selectedIds = [];
  let projectSkillIds = [];
  let extraContent = null;
  const answers = {};
  async function resolveConflicts(ids) {
    const set = new Set(ids);
    const seen = /* @__PURE__ */ new Set();
    for (const id of ids) {
      if (!set.has(id) || seen.has(id)) continue;
      const clash = (byId.get(id)?.conflictsWith ?? []).filter((x) => set.has(x));
      if (!clash.length) continue;
      const group = [id, ...clash].sort((a, b) => catIndex.get(a) - catIndex.get(b));
      group.forEach((g) => seen.add(g));
      const recId = group.find((g) => an(g)?.recommended) ?? group[0];
      let keep = recId;
      if (!flagYes2) {
        const descW = Math.max(70, termWidth() - 20);
        const choice = await p.select({
          message: `Conflicto: ${group.length} herramientas hacen lo mismo. Elige cual recomendar:`,
          initialValue: recId,
          options: group.map((g) => {
            const c = byId.get(g);
            const tag = g === recId ? pc2.green(" [recomendado]") : "";
            return { value: g, label: `${c?.name ?? g}${tag} \u2014 ${truncate(c?.desc ?? "", descW)}` };
          })
        });
        if (p.isCancel(choice)) {
          p.cancel("Cancelado.");
          process.exit(0);
        }
        keep = choice;
      }
      for (const g of group) if (g !== keep) set.delete(g);
    }
    for (const id of [...set]) {
      const comp = byId.get(id);
      const installedClash = (comp?.conflictsWith ?? []).filter((x) => an(x)?.providedAlready);
      if (!installedClash.length) continue;
      const others = installedClash.map((x) => byId.get(x)?.name ?? x).join(", ");
      if (flagYes2) {
        set.delete(id);
        continue;
      }
      const choice = await p.select({
        message: `${comp.name} solapa con ${others} (ya instalado). Que prefieres?`,
        initialValue: "keep",
        options: [
          { value: "keep", label: `Mantener ${others}`, hint: `no instala ${comp.name}` },
          { value: "new", label: `Instalar ${comp.name} igualmente`, hint: "coexisten (mas tools)" }
        ]
      });
      if (p.isCancel(choice)) {
        p.cancel("Cancelado.");
        process.exit(0);
      }
      if (choice === "keep") set.delete(id);
    }
    return [...set];
  }
  const ordered = [...catalog.components].filter((c) => !c.memoryLevel).sort((a, b) => a.group === b.group ? catIndex.get(a.id) - catIndex.get(b.id) : a.group.localeCompare(b.group));
  const recs = ordered.filter(isRec);
  const optn = ordered.filter((c) => !isRec(c) && !an(c.id).providedAlready);
  const provd = ordered.filter((c) => an(c.id).providedAlready);
  const nameW = Math.min(18, Math.max(8, ...catalog.components.map((c) => c.name.length)));
  const hintW = Math.min(70, Math.max(24, termWidth() - 26));
  const hintFor = (a) => {
    const bits = [a.reason];
    if (a.cost.tools != null) bits.push(a.cost.tools + " tools" + (a.cost.toolsDeferred ? " (diferido)" : ""));
    if (a.cost.needs.length) bits.push("req: " + a.cost.needs.join("+"));
    const lead = a.desc || a.reason;
    const tail = a.desc ? "  \xB7 " + bits.join(" \xB7 ") : bits.slice(1).map((b) => " \xB7 " + b).join("");
    return truncate(lead + tail, hintW);
  };
  const enriched = (comps) => comps.map((c) => ({
    value: c.id,
    label: `${tierTag(c.tier)} ${c.name} ${weightDots(an(c.id).cost.weight)}${an(c.id).providedAlready ? pc2.green(" [ya instalado]") : ""}`,
    hint: hintFor(an(c.id))
  }));
  if (flagYes2) {
    selectedIds = await resolveConflicts(recs.map((c) => c.id));
    projectSkillIds = catalog.projectSkills.filter(recSkill).map((s2) => s2.id);
  } else {
    const report = [pc2.bold("Recomendado para este repo")];
    for (const c of recs) report.push(recoLine(an(c.id), nameW));
    if (!recs.length) report.push(pc2.gray("  (nada pre-marcado; elige manualmente)"));
    const recIds = new Set(recs.map((c) => c.id));
    if (recs.some((c) => (c.conflictsWith ?? []).some((x) => recIds.has(x))))
      report.push(pc2.yellow(`${S.warn} Algunos recomendados se solapan; elegiras cual conservar.`));
    if (optn.length) report.push("", pc2.dim("Opcionales: ") + optn.map((c) => c.name).join(", "));
    if (provd.length) report.push(pc2.gray("Ya disponibles: " + provd.map((c) => c.name).join(", ")));
    p.note(report.join("\n"), `Analisis (${recs.length} recomendados \xB7 peso: ${pc2.green("\u25CF")}ligero ${pc2.yellow("\u25CF")}medio ${pc2.red("\u25CF")}pesado)`);
    const mode = await p.select({
      message: "Como proceder?",
      options: [
        { value: "reco", label: `Instalar el plan recomendado (${recs.length})`, hint: "lo mejor para este repo" },
        { value: "custom", label: "Elegir yo (multiselect con datos)", hint: "motivo + coste por componente" },
        { value: "steps", label: "Paso a paso por categoria", hint: "revisa grupo por grupo" }
      ]
    });
    if (p.isCancel(mode)) {
      p.cancel("Cancelado.");
      process.exit(0);
    }
    if (mode === "reco") {
      selectedIds = await resolveConflicts(recs.map((c) => c.id));
    } else if (mode === "custom") {
      const sel = await p.multiselect({
        message: "Componentes (espacio marca \xB7 enter confirma):",
        options: enriched(ordered),
        initialValues: recs.map((c) => c.id),
        required: false
      });
      if (p.isCancel(sel)) {
        p.cancel("Cancelado.");
        process.exit(0);
      }
      selectedIds = await resolveConflicts(sel);
    } else {
      const groups = [...new Set(ordered.map((c) => c.group))];
      const picks = {};
      let gi = 0;
      while (gi < groups.length) {
        const g = groups[gi];
        const comps = ordered.filter((c) => c.group === g);
        const initial = picks[g] ?? comps.filter(isRec).map((c) => c.id);
        const back = gi > 0 ? pc2.gray(" \xB7 ESC vuelve atras") : pc2.gray(" \xB7 ESC cancela");
        const sel = await p.multiselect({
          message: `Categoria ${pc2.cyan(g)} (${gi + 1}/${groups.length}) \u2014 ${comps.length} opciones (enter continua${back})`,
          options: enriched(comps),
          initialValues: initial,
          required: false
        });
        if (p.isCancel(sel)) {
          if (gi === 0) {
            p.cancel("Cancelado.");
            process.exit(0);
          }
          gi--;
          continue;
        }
        picks[g] = sel;
        gi++;
      }
      const acc = groups.flatMap((g) => picks[g] ?? []);
      selectedIds = await resolveConflicts(acc);
    }
    const memComps = catalog.components.filter((c) => c.memoryLevel);
    if (memComps.length) {
      const prevMem = new Set(
        (loadSnapshot(projectDir2)?.selected?.components ?? []).filter((id) => memComps.some((c) => c.id === id))
      );
      const memSel = await p.multiselect({
        message: "Memoria \u2014 Basica SIEMPRE activa (context-mode = sesion \xB7 CLAUDE.md CUSTOM = proyecto). A\xF1adir capas?",
        options: memComps.map((c) => ({ value: c.id, label: `+${c.memoryLevel} \xB7 ${c.name}`, hint: truncate(c.desc, hintW) })),
        initialValues: [...prevMem],
        required: false
      });
      if (p.isCancel(memSel)) {
        p.cancel("Cancelado.");
        process.exit(0);
      }
      for (const id of memSel) if (!selectedIds.includes(id)) selectedIds.push(id);
      const dropped = [...prevMem].filter((id) => !memSel.includes(id));
      if (dropped.length)
        p.log.warn(`Dejaste de usar: ${dropped.join(", ")}. Sus notas siguen intactas. Copialas al nuevo store con: init-claude migrate-memory <ruta-vieja> <ruta-nueva>`);
    }
    if (catalog.projectSkills.length) {
      const skillSel = await p.multiselect({
        message: "Skills de proyecto (.claude/skills/):",
        options: catalog.projectSkills.map((s2) => ({
          value: s2.id,
          label: s2.id,
          hint: truncate(s2.desc, hintW) + (recSkill(s2) ? " [recomendado]" : "")
        })),
        initialValues: catalog.projectSkills.filter(recSkill).map((s2) => s2.id),
        required: false
      });
      if (p.isCancel(skillSel)) {
        p.cancel("Cancelado.");
        process.exit(0);
      }
      projectSkillIds = skillSel;
    } else projectSkillIds = [];
    const wantsExtra = await p.confirm({ message: "A\xF1adir algo mas? (skill desde URL, notas para CLAUDE.md)", initialValue: false });
    if (!p.isCancel(wantsExtra) && wantsExtra) {
      const what = await p.select({
        message: "Que quieres a\xF1adir?",
        options: [
          { value: "url", label: "Skill desde URL (raw .md o repo GitHub)" },
          { value: "notes", label: "Notas/reglas adicionales para el CLAUDE.md" },
          { value: "none", label: "Nada, continuar" }
        ]
      });
      if (!p.isCancel(what)) {
        if (what === "url") {
          const url = await p.text({ message: "URL de la skill:" });
          if (!p.isCancel(url) && url) {
            try {
              const { name, content } = await fetchSkill(url);
              writeSkill(projectDir2, name, content);
              p.log.success(`Skill '${name}' descargada al proyecto.`);
              projectSkillIds.push(name);
            } catch (e) {
              p.log.error(`No se pudo descargar: ${e.message}`);
            }
          }
        } else if (what === "notes") {
          const notes = await p.text({ message: "Notas (una linea; para mas, edita el bloque CUSTOM del CLAUDE.md despues):" });
          if (!p.isCancel(notes) && notes) extraContent = notes;
        }
      }
    }
    const regUrl = getRegistryUrl();
    if (regUrl) {
      const reg = await fetchRegistry(regUrl);
      if (reg?.skills?.length) {
        const regSel = await p.multiselect({
          message: "Skills extra de tu registro remoto:",
          options: reg.skills.map((sk) => ({ value: sk.url, label: sk.id, hint: truncate(sk.desc, hintW) })),
          required: false,
          initialValues: []
        });
        if (!p.isCancel(regSel)) {
          for (const url of regSel) {
            try {
              const { name, content } = await fetchSkill(url);
              writeSkill(projectDir2, name, content);
              projectSkillIds.push(name);
            } catch (e) {
              p.log.error(`${url}: ${e.message}`);
            }
          }
        }
      }
    }
    for (const comp of catalog.components.filter((c) => selectedIds.includes(c.id))) {
      const asks = [];
      if (comp.mcp?.prompt) asks.push({ ...comp.mcp.prompt, store: comp.mcp.prompt.key });
      if (comp.mcp?.envPrompt) asks.push({ ...comp.mcp.envPrompt, store: comp.mcp.envPrompt.var });
      for (const a of asks) {
        const clean = (v2) => String(v2 ?? "").replace(/["`\r\n]/g, "").trim();
        const validate = a.validate === "dir" ? (v2) => {
          const sv = clean(v2);
          if (!sv) return a.optional ? void 0 : "Requerido.";
          if (!existsSync5(sv)) return `No existe esa ruta: ${sv}`;
          try {
            if (!statSync(sv).isDirectory()) return `No es una carpeta: ${sv}`;
          } catch {
            return `No accesible: ${sv}`;
          }
          return void 0;
        } : void 0;
        const val = await p.text({ message: a.message, placeholder: a.placeholder, validate });
        if (p.isCancel(val)) {
          p.cancel("Cancelado.");
          process.exit(0);
        }
        const v = clean(val);
        if (v) {
          (answers[comp.id] ??= {})[a.store] = v;
          if (a.validate === "dir" && comp.id === "obsidian" && !existsSync5(join6(v, ".obsidian")))
            p.log.warn(`${v} no tiene .obsidian: \xBFseguro que es un vault Obsidian? (se registra igual)`);
        }
      }
    }
    const sel2 = catalog.components.filter((c) => selectedIds.includes(c.id));
    const missing = [];
    if (sel2.some((c) => c.install?.type === "pipx") && !(hasCmd("python") && hasCmd("pipx")))
      missing.push("Python + pipx (para code-review-graph / MarkItDown / Headroom)");
    if (sel2.some((c) => c.requires?.includes("uv")) && !hasCmd("uv") && !hasCmd("pipx"))
      missing.push("uv o pipx (para serena)");
    if (selectedIds.includes("rtk") && !hasCmd("rtk") && !hasCmd("cargo"))
      missing.push("Rust/cargo (RTK; sin el se usa modo CLAUDE.md injection)");
    if (sel2.some((c) => c.mcp) && !hasCmd("claude"))
      missing.push("Claude Code CLI (sin el no se registran MCP)");
    if (missing.length)
      p.log.warn("Faltan prerequisitos (esos componentes se omitiran):\n" + missing.map((m) => "  - " + m).join("\n"));
    if (sel2.length) {
      p.note(sel2.map((c) => "\u2022 " + c.name + ": " + planFor(c, answers)).join("\n"), "Se hara");
    }
    const go = await p.confirm({ message: `Instalar ${selectedIds.length} componentes + ${projectSkillIds.length} skills?` });
    if (p.isCancel(go) || !go) {
      p.cancel("Cancelado.");
      process.exit(0);
    }
  }
  const selectedComps = catalog.components.filter((c) => selectedIds.includes(c.id));
  const ictx = { projectDir: projectDir2, hasPython: hasCmd("python"), answers };
  const results = [];
  const NOISE = /^(npm (warn|notice|http)|added \d|changed \d|audited|deprecated)/i;
  const totalComps = selectedComps.length;
  const sInstall = p.spinner();
  sInstall.start(`Instalando componentes ${progressBar(0, totalComps)}`);
  for (let i = 0; i < selectedComps.length; i++) {
    const comp = selectedComps[i];
    let secs = 0, lastLine = "";
    const render = () => sInstall.message(
      `${progressBar(i + 1, totalComps)} \xB7 ${comp.name}${secs ? pc2.gray(` ${secs}s`) : ""}${lastLine ? pc2.gray(" \xB7 " + lastLine) : ""}`
    );
    render();
    const tick = setInterval(() => {
      secs++;
      render();
    }, 1e3);
    ictx.onProgress = (chunk) => {
      const line = chunk.split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !NOISE.test(x)).pop();
      if (line) lastLine = truncate(line.replace(/\s+/g, " "), Math.min(48, termWidth() - 30));
    };
    const t0c = Date.now();
    try {
      const r = await installComponent(comp, ictx);
      const failed = r.some(([, v]) => /^FAIL|^ERROR|^TIMEOUT/.test(v));
      results.push([comp.name, r, failed, Date.now() - t0c]);
      for (const us of comp.userSkills ?? []) copySkillToUser(us);
    } catch (e) {
      results.push([comp.name, [["bin", "ERROR: " + e.message]], true, Date.now() - t0c]);
    } finally {
      clearInterval(tick);
      ictx.onProgress = void 0;
    }
  }
  sInstall.stop(`Componentes ${progressBar(totalComps, totalComps)}`);
  if (results.length) p.note(formatSummary(results), "Resumen de componentes");
  const prevSnap = loadSnapshot(projectDir2);
  const prevIds = prevSnap?.selected?.components ?? [];
  const prunableMcps = prevIds.filter((id) => !selectedIds.includes(id)).map((id) => catalog.components.find((c) => c.id === id)).filter((c) => !!c && !!c.mcp && mcpList().includes(c.mcp.name));
  if (prunableMcps.length) {
    const names = prunableMcps.map((c) => `${c.mcp.name} (${c.name})`).join(", ");
    if (flagYes2) {
      p.log.warn(`${prunableMcps.length} MCP desmarcada(s) siguen instaladas: ${names}. --yes no desinstala; hazlo a mano: claude mcp remove <name> -s local`);
    } else {
      const ok = await p.confirm({ message: `Desmarcaste MCP ya instalada(s): ${names}. Desinstalar de este proyecto?`, initialValue: true });
      if (!p.isCancel(ok) && ok) {
        const sp = p.spinner();
        const totalPrune = prunableMcps.length;
        sp.start(`Desinstalando MCPs ${progressBar(0, totalPrune)}`);
        const pruneRes = [];
        for (let i = 0; i < totalPrune; i++) {
          const c = prunableMcps[i];
          sp.message(`${progressBar(i, totalPrune)} \xB7 ${c.mcp.name}`);
          await removeMcp(c.mcp.name, projectDir2);
          const stillThere = mcpHas(c.mcp.name);
          pruneRes.push([c.name, [["mcp", stillThere ? "FAIL" : "REMOVED"]], stillThere]);
        }
        sp.stop(`MCPs procesadas ${progressBar(totalPrune, totalPrune)}`);
        p.note(formatSummary(pruneRes), "Desinstaladas");
      }
    }
  }
  const s3 = p.spinner();
  s3.start("Skills de proyecto");
  const skillResults = projectSkillIds.map((id) => [id, copySkillToProject(id, projectDir2)]);
  s3.stop(`Skills: ${skillResults.length ? skillResults.map(([i, r]) => `${i}:${statusLabel(r).text}`).join(" \xB7 ") : "(ninguna)"}`);
  const mdPath = join6(projectDir2, "CLAUDE.md");
  const mdHandwritten = existsSync5(mdPath) && !readFileSync6(mdPath, "utf8").includes("Auto-generado por init-claude");
  let writeMd = true;
  if (mdHandwritten) {
    if (flagYes2) {
      writeMd = false;
    } else {
      const ow = await p.confirm({ message: "CLAUDE.md existe y NO lo gestiona init-claude. Sobreescribir? (.bak se guarda)", initialValue: false });
      writeMd = !p.isCancel(ow) && ow;
    }
  }
  const s4 = p.spinner();
  s4.start("Generando archivos");
  const withDesigner = selectedIds.includes("pencil") || selectedIds.includes("figma");
  installAgents(withDesigner);
  installCommands();
  const mdRes = writeMd ? generateClaudeMd(projectDir2, selectedComps, projectSkillIds, hasSuperpowers, extraContent, profile, toolSearch.on === true) : "SKIPPED (CLAUDE.md a mano)";
  const setRes = generateProjectSettings(projectDir2);
  const giRes = updateGitignore(projectDir2);
  const hookRes = installGitHooks(projectDir2, selectedIds.includes("husky"));
  saveSnapshot(projectDir2, { components: selectedIds, skills: projectSkillIds });
  s4.stop("Archivos generados");
  p.note([
    `CLAUDE.md   ${colorByKind(statusLabel(mdRes).kind, statusLabel(mdRes).text)}${mdRes === "UPDATED" ? pc2.gray(" (.bak guardado \xB7 revisa el diff)") : ""}`,
    `settings    ${colorByKind(statusLabel(setRes).kind, statusLabel(setRes).text)}`,
    `gitignore   ${colorByKind(statusLabel(giRes).kind, statusLabel(giRes).text)}`,
    `git hooks   ${colorByKind(statusLabel(hookRes).kind, statusLabel(hookRes).text)}`
  ].join("\n"), "Proyecto");
  if (selectedIds.includes("code-review-graph") && hasCmd("code-review-graph")) {
    p.log.step("Construyendo grafo del codebase (code-review-graph build)...");
    const gr = run("code-review-graph build", { visible: true, timeout: 12e4 });
    if (gr.ok) p.log.success("Grafo construido");
    else if (gr.timedOut) p.log.warn('Build del grafo abortado por timeout (120s). Corre "code-review-graph build" a mano luego.');
    else p.log.warn(`Build del grafo fallo (exit ${gr.code}). Continua sin grafo.`);
  }
  const failures = [];
  for (const [name, parts] of results)
    for (const [, v] of parts)
      if (/^FAIL|^ERROR|^TIMEOUT/.test(v)) failures.push(`${pc2.red(S.fail)} ${name}: ${v}
    \u2192 ${remedyFor(v)}`);
  if (failures.length) p.note(failures.join("\n"), pc2.red("Fallos (revisar)"));
  const okCount = results.filter(([, , f]) => !f).length;
  const elapsed = ((Date.now() - t0) / 1e3).toFixed(0);
  p.note([
    recommenderAvailable() ? "Sugerencias IA del repo (lento):  init-claude suggest" : null,
    "Skills on-demand:  npx skills find",
    hasSuperpowers ? null : "Metodologia plan-first/TDD:  /plugin install superpowers",
    "Estado / diagnostico:  init-claude check",
    "Actualizar app / componentes:  init-claude update | upgrade"
  ].filter(Boolean).join("\n"), "Siguientes pasos");
  p.outro(pc2.green(
    `Listo: ${okCount}/${results.length} componentes, ${skillResults.length} skills${failures.length ? pc2.yellow(` \xB7 ${failures.length} con fallo`) : ""} \xB7 ${elapsed}s`
  ));
}
function planFor(c, ans) {
  const acts = [];
  const inst = c.install;
  if (inst?.type === "npm") acts.push(`npm i -g ${inst.pkg}`);
  else if (inst?.type === "pipx") acts.push(`pipx install ${inst.pkg}`);
  else if (inst?.type === "rtk") acts.push("instala RTK (cargo) o modo injection");
  else if (inst?.type === "installer") acts.push("descarga binario (script oficial)");
  else if (inst?.type === "husky") acts.push("husky + lint-staged en el proyecto");
  else if (inst?.type === "project-npx") acts.push("npx en el proyecto");
  if (c.mcp) {
    let m = `registra MCP ${c.mcp.name}`;
    const pv = c.mcp.prompt ? ans?.[c.id]?.[c.mcp.prompt.key] : void 0;
    const ev = c.mcp.envPrompt ? ans?.[c.id]?.[c.mcp.envPrompt.var] : void 0;
    if (pv) m += ` (${truncate(pv, 30)})`;
    if (ev) m += ` (-e ${c.mcp.envPrompt.var}=${mask(ev)})`;
    acts.push(m);
  }
  return acts.length ? acts.join(pc2.gray(" \xB7 ")) : pc2.gray("config en CLAUDE.md");
}

// src/commands/check.ts
import pc3 from "picocolors";
import { existsSync as existsSync6, readFileSync as readFileSync7 } from "fs";
import { join as join7 } from "path";
function runCheck(ctx) {
  const { projectDir: projectDir2, version: VERSION2, flagJson: flagJson2 } = ctx;
  const catalog = loadCatalog();
  const S = sym();
  const prof = detectProfile(projectDir2);
  const ts = toolSearchState();
  const mcps = mcpList();
  const NON_PLUGIN = /* @__PURE__ */ new Set(["cache", "data", "marketplaces"]);
  const plugs = [...new Set(installedPlugins())].filter((x) => !NON_PLUGIN.has(x));
  const mdPath = join7(projectDir2, "CLAUDE.md");
  const mdTxt = existsSync6(mdPath) ? readFileSync7(mdPath, "utf8") : null;
  const mdLines = mdTxt ? mdTxt.split("\n").length : 0;
  const mdManaged = mdTxt ? mdTxt.includes("Auto-generado por init-claude") : false;
  const codeIntel = [
    hasCmd("code-review-graph") && "code-review-graph",
    mcps.includes("serena") && "serena",
    mcps.includes("codebase-memory-mcp") && "codebase-memory-mcp"
  ].filter(Boolean);
  if (flagJson2) {
    console.log(JSON.stringify({
      version: VERSION2,
      runtimes: Object.fromEntries(["node", "python", "git", "cargo", "uv", "pipx", "claude"].map((t) => [t, hasCmd(t)])),
      tools: Object.fromEntries(["context-mode", "rtk", "markitdown", "code-review-graph"].map((t) => [t, hasCmd(t)])),
      mcps,
      plugins: plugs,
      project: { stack: prof.langs, size: prof.size, files: prof.fileCount, claudeMd: mdTxt ? { lines: mdLines, managed: mdManaged } : null },
      toolSearch: ts,
      codeIntelConflict: codeIntel.length > 1 ? codeIntel : null
    }, null, 2));
    return;
  }
  const box = (ok) => ok ? pc3.green(S.boxOn) : pc3.red(S.boxOff);
  const group = (title, rows) => {
    console.log(pc3.cyan(`
${title}`));
    const w = Math.max(...rows.map(([n]) => n.length));
    for (const [n, ok, extra] of rows) console.log(`  ${box(ok)} ${n.padEnd(w)}${extra ? pc3.gray("  " + extra) : ""}`);
  };
  console.log(pc3.bold(`
  init-claude v${VERSION2} \u2014 estado del sistema`));
  group("Runtimes", [
    ["Node.js", hasCmd("node")],
    ["Python", hasCmd("python")],
    ["Git", hasCmd("git")],
    ["Rust/cargo", hasCmd("cargo")],
    ["uv", hasCmd("uv")],
    ["pipx", hasCmd("pipx")],
    ["Claude Code", hasCmd("claude")]
  ]);
  group("Herramientas", [
    ["context-mode", hasCmd("context-mode")],
    ["rtk", hasCmd("rtk")],
    ["markitdown", hasCmd("markitdown")],
    ["code-review-graph", hasCmd("code-review-graph")]
  ]);
  console.log(pc3.cyan("\nMCPs registrados"));
  if (mcps.length) for (const m of mcps) console.log(`  ${pc3.green(S.dot)} ${m}`);
  else console.log(pc3.gray("  (ninguno)"));
  if (codeIntel.length > 1)
    console.log(pc3.yellow(`  ${S.warn} ${codeIntel.length} herramientas de code-intelligence activas (solapan): ${codeIntel.join(", ")} \u2014 deja una.`));
  const providedNow = new Set([...mcps, ...plugs].map((x) => x.toLowerCase()));
  const coreGaps = catalog.components.filter((c) => c.tier === "core" && !providedNow.has(c.id.toLowerCase()) && !(c.mcp && mcps.includes(c.mcp.name)) && !(c.install && "bin" in c.install && c.install.bin && hasCmd(c.install.bin)) && !hasCmd(c.id));
  if (coreGaps.length) {
    console.log(pc3.cyan("\nRecomendado y ausente"));
    for (const c of coreGaps) console.log(pc3.yellow(`  ${S.warn} ${c.name} ${pc3.gray("\u2014 " + truncate(c.desc, 50))}`));
    console.log(pc3.gray("      Instala con: init-claude"));
  }
  console.log(pc3.cyan("\nPlugins"));
  if (plugs.length) for (const pl of plugs) console.log(`  ${pc3.green(S.dot)} ${pl}`);
  else console.log(pc3.gray("  (ninguno)"));
  group("Proyecto", ["CLAUDE.md", ".claude/settings.json", ".claude/skills", ".git/hooks/commit-msg"].map((f) => [f, existsSync6(join7(projectDir2, f))]));
  console.log(pc3.cyan("\nAhorro de tokens"));
  const tsIcon = ts.on === true ? pc3.green(S.boxOn) : ts.on === false ? pc3.red(S.boxOff) : pc3.gray("[?]");
  console.log(`  ${tsIcon} MCP Tool Search ${pc3.gray("(" + ts.reason + ")")}`);
  if (ts.on === false) console.log(pc3.yellow("      React\xEDvalo: quita ENABLE_TOOL_SEARCH=off o usa ENABLE_TOOL_SEARCH=auto:10 (~85% menos overhead)."));
  else if (ts.on === true && ts.mode === "auto") console.log(pc3.gray(`      Schemas diferidos cuando las tools superan el ~${ts.threshold}% del contexto; el n\xBA de tools deja de pesar.`));
  if (mdTxt) {
    const big = mdLines > 200;
    console.log(`  ${big ? pc3.yellow(S.warn) : pc3.green(S.boxOn)} CLAUDE.md: ${mdLines} lineas, ~${Math.round(mdTxt.length / 4)} tokens`);
    if (big) console.log(pc3.yellow("      >200 lineas: mueve lo especifico a skills (.claude/skills/)."));
    if (!mdManaged) console.log(pc3.yellow("      Sin firma init-claude: editado a mano o de otra fuente (no se regenerara)."));
  }
  console.log("");
}

// src/commands/suggest.ts
import * as p2 from "@clack/prompts";
import pc4 from "picocolors";
async function runSuggest(ctx) {
  const { projectDir: projectDir2, version: VERSION2 } = ctx;
  const S = sym();
  process.setMaxListeners(50);
  p2.intro(pc4.bgCyan(pc4.black(` init-claude suggest v${VERSION2} `)));
  if (!isTTY()) {
    console.error(pc4.red("Necesita terminal interactiva (TTY)."));
    return;
  }
  if (!recommenderAvailable()) {
    p2.log.error("Claude Code CLI no detectado. Instala: npm install -g @anthropic-ai/claude-code");
    p2.outro("Cancelado.");
    return;
  }
  if (!pluginInstalled()) {
    const instPlug = await p2.confirm({ message: "Falta el plugin claude-code-setup (analizador oficial). Instalarlo?", initialValue: true });
    if (p2.isCancel(instPlug) || !instPlug) {
      p2.outro("Cancelado.");
      return;
    }
    const sp2 = p2.spinner();
    sp2.start("Instalando claude-code-setup");
    const stopTick2 = elapsedTicker(sp2, "Instalando claude-code-setup");
    const ok2 = await installRecommenderPlugin();
    stopTick2();
    sp2.stop(ok2 ? "Plugin instalado" : "No se pudo instalar (instala con /plugin install y reintenta)");
    if (!pluginInstalled()) {
      p2.outro("Sin plugin, no puedo analizar.");
      return;
    }
  }
  const sp = p2.spinner();
  sp.start("Analizando el repo (Claude headless, puede tardar minutos)");
  const stopTick = elapsedTicker(sp, "Analizando el repo");
  const { ok, suggestions, error } = await runRecommender(projectDir2);
  stopTick();
  sp.stop(ok ? `Sugerencias: ${suggestions.length}` : `Recomendador fallo (${error})`);
  if (!ok) {
    p2.outro("Sin resultado.");
    return;
  }
  const advisory = suggestions.filter((s2) => !s2.installable);
  const installable = suggestions.filter((s2) => s2.installable);
  if (advisory.length)
    p2.note(
      advisory.map((s2) => `${S.dot} [${s2.category}] ${pc4.cyan(s2.name)} \u2014 ${truncate(s2.why, 60)}`).join("\n"),
      "Sugerencias (implementar a mano o pideme ayuda)"
    );
  if (installable.length) {
    const pick = await p2.multiselect({
      message: "Instalar ahora? Revisa el comando antes de marcar:",
      options: installable.map((s2) => ({
        value: s2.install,
        label: `${s2.name} ${pc4.gray("(" + s2.category + ")")}${s2.why ? " \u2014 " + truncate(s2.why, 48) : ""}`,
        hint: truncate(s2.install, Math.min(80, termWidth() - 12))
      })),
      required: false,
      initialValues: []
    });
    if (!p2.isCancel(pick) && pick.length) {
      const sp2 = p2.spinner();
      const totalPick = pick.length;
      sp2.start(`Instalando sugerencias ${progressBar(0, totalPick)}`);
      const instRes = [];
      for (let i = 0; i < totalPick; i++) {
        const c = pick[i];
        sp2.message(`${progressBar(i, totalPick)} \xB7 ${truncate(c, 40)}`);
        const r = await runInstall(c);
        instRes.push(`${r.ok ? pc4.green(S.ok) : pc4.red(S.fail)} ${truncate(c, termWidth() - 6)}`);
      }
      sp2.stop(`Sugerencias instaladas ${progressBar(totalPick, totalPick)}`);
      p2.note(instRes.join("\n"), "Resultado");
    }
  } else if (!advisory.length) p2.log.message("Sin sugerencias.");
  p2.outro(pc4.green("Listo."));
}

// src/commands/migrate.ts
import pc5 from "picocolors";
import { existsSync as existsSync7, mkdirSync as mkdirSync2, readdirSync as readdirSync4, statSync as statSync2, copyFileSync as copyFileSync2 } from "fs";
import { join as join8, relative, dirname as dirname4 } from "path";
function runMigrateMemory(args2) {
  const src = args2[0], dst = args2[1];
  if (!src || !dst) {
    console.log(pc5.red("Uso: init-claude migrate-memory <ruta-origen> <ruta-destino>"));
    console.log(pc5.gray("Copia los .md de un store de memoria a otro. No borra el origen ni sobrescribe el destino."));
    return 1;
  }
  if (!existsSync7(src) || !statSync2(src).isDirectory()) {
    console.log(pc5.red(`Origen invalido (no existe o no es carpeta): ${src}`));
    return 1;
  }
  mkdirSync2(dst, { recursive: true });
  const mdFiles = [];
  const walk2 = (dir) => {
    for (const e of readdirSync4(dir, { withFileTypes: true })) {
      const p3 = join8(dir, e.name);
      if (e.isDirectory()) walk2(p3);
      else if (e.name.toLowerCase().endsWith(".md")) mdFiles.push(p3);
    }
  };
  walk2(src);
  let copied = 0, skipped = 0;
  for (const f of mdFiles) {
    const target = join8(dst, relative(src, f));
    if (existsSync7(target)) {
      skipped++;
      continue;
    }
    mkdirSync2(dirname4(target), { recursive: true });
    copyFileSync2(f, target);
    copied++;
  }
  console.log(pc5.green(`Migracion: ${copied} notas copiadas, ${skipped} ya existian (no sobrescritas).`));
  console.log(pc5.gray(`Origen intacto: ${src}`));
  return 0;
}

// bin/init-claude.ts
var require2 = createRequire(import.meta.url);
var { version: VERSION } = require2("../package.json");
var projectDir = process.cwd();
var args = process.argv.slice(2);
if (args.includes("--version") || args.includes("-v")) {
  console.log(`init-claude v${VERSION}`);
  process.exit(0);
}
var first = args[0];
var cmd = first && !first.startsWith("-") ? first : null;
var flagYes = args.includes("--yes") || args.includes("-y");
var flagJson = args.includes("--json");
ensureUserRulesFile();
var pending = checkUpdatesQuiet();
if (pending > 0 && !flagJson)
  console.log(pc6.yellow(`
  Hay ${pending} actualizacion(es) de init-claude. Ejecuta: init-claude update
`));
if (cmd === "update") {
  const r = selfUpdate();
  console.log(r.ok ? pc6.green(r.msg) : pc6.red(r.msg));
  process.exit(r.ok ? 0 : 1);
}
if (cmd === "upgrade") {
  console.log(pc6.cyan("\nUpgrade de componentes instalados...\n"));
  if (hasCmd("claude")) run("npm update -g @anthropic-ai/claude-code", { visible: true });
  run("npm update -g context-mode", { visible: true });
  if (hasCmd("pipx")) run("pipx upgrade-all", { visible: true });
  if (hasCmd("rtk") && hasCmd("cargo")) run("cargo install --git https://github.com/rtk-ai/rtk --locked --force", { visible: true });
  console.log(pc6.green("\nHecho. MCPs npx -y usan @latest al arrancar.\n"));
  process.exit(0);
}
if (cmd === "add-skill") {
  const target = args[1];
  if (!target) {
    console.log(pc6.red("Uso: init-claude add-skill <url|id-del-catalogo>"));
    process.exit(1);
  }
  if (/^https?:\/\//.test(target)) {
    try {
      const { name, content } = await fetchSkill(target);
      const r = writeSkill(projectDir, name, content);
      console.log(pc6.green(`Skill '${name}': ${r} (.claude/skills/${name}/SKILL.md)`));
    } catch (e) {
      console.log(pc6.red(`Error: ${e.message}`));
      process.exit(1);
    }
  } else {
    const r = copySkillToProject(target, projectDir);
    console.log(r === "MISSING" ? pc6.red(`'${target}' no esta en el catalogo`) : pc6.green(`Skill '${target}': ${r}`));
  }
  process.exit(0);
}
if (cmd === "migrate-memory") {
  process.exit(runMigrateMemory(args.slice(1)));
}
if (cmd === "check") {
  runCheck({ projectDir, version: VERSION, flagJson });
  process.exit(0);
}
if (cmd === "suggest") {
  await runSuggest({ projectDir, version: VERSION });
  process.exit(0);
}
if (!isTTY() && !flagYes) {
  console.error(pc6.red("Terminal no interactiva (sin TTY). Usa: init-claude --yes  (acepta recomendaciones sin preguntar)."));
  process.exit(1);
}
await runWizard({ projectDir, version: VERSION, flagYes });
