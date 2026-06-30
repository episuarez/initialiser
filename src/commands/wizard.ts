// src/commands/wizard.ts — Flujo interactivo principal (detecta, recomienda, instala).
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { detectProfile } from '../detect.js';
import { installComponent, hasCmd, mcpList, mcpHas, removeMcp, installedPlugins, run, toolSearchState } from '../install.js';
import type { InstallCtx } from '../install.js';
import * as gen from '../generate.js';
import * as remote from '../remote.js';
import * as rec from '../recommend.js';
import * as ui from '../ui.js';
import type { SummaryRow } from '../ui.js';
import * as advisor from '../advisor.js';
import { loadCatalog } from '../catalog.js';
import type { Component } from '../catalog.js';
import type { Analysis } from '../types.js';

export interface CliCtx { projectDir: string; version: string; flagYes: boolean }

export async function runWizard(ctx: CliCtx): Promise<void> {
  const { projectDir, version: VERSION, flagYes } = ctx;
  const catalog = loadCatalog();
  const S = ui.sym();

  process.setMaxListeners(50);
  const t0 = Date.now();
  console.clear();
  p.intro(pc.bgCyan(pc.black(` init-claude v${VERSION} `)));

  if (!hasCmd('claude'))
    p.log.warn('Claude Code CLI no detectado. Los MCP no se registraran. Instala: npm install -g @anthropic-ai/claude-code');

  const s = p.spinner();
  s.start('Analizando el proyecto');
  const profile = detectProfile(projectDir);
  const plugins = [...new Set(installedPlugins())];
  const hasSuperpowers = plugins.some((x) => /superpowers/i.test(x));
  const toolSearch = toolSearchState();
  s.message('Consultando MCPs y plugins registrados');
  const provided = new Set([...plugins, ...mcpList()].map((x) => x.toLowerCase()));
  s.stop('Proyecto analizado');

  p.note([
    `Stack    ${pc.cyan(profile.langs.join(', ') || 'sin lenguaje')}${profile.fws.length ? pc.gray(' · ' + profile.fws.join(', ')) : ''}`,
    `Tamano   ${profile.fileCount} archivos (${profile.size})${profile.isMonorepo ? pc.gray(' · monorepo') : ''}`,
    `Senales  ${[profile.hasTests && 'tests', profile.hasCI && 'CI', profile.hasDocs && 'docs', profile.hasDesign && 'diseño'].filter(Boolean).join(', ') || 'ninguna'}`,
  ].join('\n'), 'Perfil detectado');

  if (toolSearch.on === false)
    p.log.warn(`MCP Tool Search OFF (${toolSearch.reason}). Sin el, cada tool de cada MCP carga su schema en contexto. Reactívalo (quita ENABLE_TOOL_SEARCH=off, o usa ENABLE_TOOL_SEARCH=auto:10): ~85% menos overhead de tools.`);
  else if (toolSearch.on === true)
    p.log.info(`MCP Tool Search ${toolSearch.mode === 'forced' ? 'forzado' : 'activo'} (${toolSearch.reason}): los schemas se cargan bajo demanda, el nº de tools deja de pesar en contexto.`);

  const analyses = advisor.analyzeCatalog(catalog.components, profile, { provided, toolSearchOn: toolSearch.on === true });
  const an = (id: string): Analysis => analyses.get(id)!;
  const isRec = (c: Component) => an(c.id).recommended;
  const recSkill = (sk: { always?: boolean; recommendIf?: string[]; requireTags?: string[] }) =>
    sk.always === true ||
    ((sk.recommendIf ?? []).some((t) => profile.tags.has(t)) && (sk.requireTags ?? []).every((t) => profile.tags.has(t)));

  const catIndex = new Map<string, number>(catalog.components.map((c, i) => [c.id, i]));
  const byId = new Map<string, Component>(catalog.components.map((c) => [c.id, c]));

  let selectedIds: string[] = [];
  let projectSkillIds: string[] = [];
  let extraContent: string | null = null;
  const answers: Record<string, Record<string, string>> = {};

  // conflictsWith: componentes que hacen lo mismo. Se queda uno.
  async function resolveConflicts(ids: string[]): Promise<string[]> {
    const set = new Set(ids);
    const seen = new Set<string>();
    for (const id of ids) {
      if (!set.has(id) || seen.has(id)) continue;
      const clash = (byId.get(id)?.conflictsWith ?? []).filter((x) => set.has(x));
      if (!clash.length) continue;
      const group = [id, ...clash].sort((a, b) => catIndex.get(a)! - catIndex.get(b)!);
      group.forEach((g) => seen.add(g));
      const recId = group.find((g) => an(g)?.recommended) ?? group[0]!;
      let keep = recId;
      if (!flagYes) {
        const descW = Math.max(70, ui.termWidth() - 20);
        const choice = await p.select({
          message: `Conflicto: ${group.length} herramientas hacen lo mismo. Elige cual recomendar:`,
          initialValue: recId,
          options: group.map((g) => {
            const c = byId.get(g);
            const tag = g === recId ? pc.green(' [recomendado]') : '';
            return { value: g, label: `${c?.name ?? g}${tag} — ${ui.truncate(c?.desc ?? '', descW)}` };
          }),
        });
        if (p.isCancel(choice)) { p.cancel('Cancelado.'); process.exit(0); }
        keep = choice;
      }
      for (const g of group) if (g !== keep) set.delete(g);
    }
    // Conflicto contra lo YA INSTALADO: por defecto se mantiene el instalado.
    for (const id of [...set]) {
      const comp = byId.get(id);
      const installedClash = (comp?.conflictsWith ?? []).filter((x) => an(x)?.providedAlready);
      if (!installedClash.length) continue;
      const others = installedClash.map((x) => byId.get(x)?.name ?? x).join(', ');
      if (flagYes) { set.delete(id); continue; }
      const choice = await p.select({
        message: `${comp!.name} solapa con ${others} (ya instalado). Que prefieres?`,
        initialValue: 'keep',
        options: [
          { value: 'keep', label: `Mantener ${others}`, hint: `no instala ${comp!.name}` },
          { value: 'new', label: `Instalar ${comp!.name} igualmente`, hint: 'coexisten (mas tools)' },
        ],
      });
      if (p.isCancel(choice)) { p.cancel('Cancelado.'); process.exit(0); }
      if (choice === 'keep') set.delete(id);
    }
    return [...set];
  }

  // Los componentes de memoria (memoryLevel) se gestionan en su propio paso, no
  // en el picker general.
  const ordered = [...catalog.components].filter((c) => !c.memoryLevel).sort((a, b) =>
    a.group === b.group ? catIndex.get(a.id)! - catIndex.get(b.id)! : a.group.localeCompare(b.group));
  const recs = ordered.filter(isRec);
  const optn = ordered.filter((c) => !isRec(c) && !an(c.id).providedAlready);
  const provd = ordered.filter((c) => an(c.id).providedAlready);
  const nameW = Math.min(18, Math.max(8, ...catalog.components.map((c) => c.name.length)));
  const hintW = Math.min(70, Math.max(24, ui.termWidth() - 26));
  const hintFor = (a: Analysis) => {
    const bits = [a.reason];
    if (a.cost.tools != null) bits.push(a.cost.tools + ' tools' + (a.cost.toolsDeferred ? ' (diferido)' : ''));
    if (a.cost.needs.length) bits.push('req: ' + a.cost.needs.join('+'));
    const lead = a.desc || a.reason;
    const tail = a.desc ? '  · ' + bits.join(' · ') : bits.slice(1).map((b) => ' · ' + b).join('');
    return ui.truncate(lead + tail, hintW);
  };
  const enriched = (comps: Component[]) => comps.map((c) => ({
    value: c.id,
    label: `${ui.tierTag(c.tier)} ${c.name} ${ui.weightDots(an(c.id).cost.weight)}${an(c.id).providedAlready ? pc.green(' [ya instalado]') : ''}`,
    hint: hintFor(an(c.id)),
  }));

  if (flagYes) {
    selectedIds = await resolveConflicts(recs.map((c) => c.id));
    projectSkillIds = catalog.projectSkills.filter(recSkill).map((s2) => s2.id);
  } else {
    const report = [pc.bold('Recomendado para este repo')];
    for (const c of recs) report.push(ui.recoLine(an(c.id), nameW));
    if (!recs.length) report.push(pc.gray('  (nada pre-marcado; elige manualmente)'));
    const recIds = new Set(recs.map((c) => c.id));
    if (recs.some((c) => (c.conflictsWith ?? []).some((x) => recIds.has(x))))
      report.push(pc.yellow(`${S.warn} Algunos recomendados se solapan; elegiras cual conservar.`));
    if (optn.length) report.push('', pc.dim('Opcionales: ') + optn.map((c) => c.name).join(', '));
    if (provd.length) report.push(pc.gray('Ya disponibles: ' + provd.map((c) => c.name).join(', ')));
    p.note(report.join('\n'), `Analisis (${recs.length} recomendados · peso: ${pc.green('●')}ligero ${pc.yellow('●')}medio ${pc.red('●')}pesado)`);

    const mode = await p.select({
      message: 'Como proceder?',
      options: [
        { value: 'reco', label: `Instalar el plan recomendado (${recs.length})`, hint: 'lo mejor para este repo' },
        { value: 'custom', label: 'Elegir yo (multiselect con datos)', hint: 'motivo + coste por componente' },
        { value: 'steps', label: 'Paso a paso por categoria', hint: 'revisa grupo por grupo' },
      ],
    });
    if (p.isCancel(mode)) { p.cancel('Cancelado.'); process.exit(0); }

    if (mode === 'reco') {
      selectedIds = await resolveConflicts(recs.map((c) => c.id));
    } else if (mode === 'custom') {
      const sel = await p.multiselect({
        message: 'Componentes (espacio marca · enter confirma):',
        options: enriched(ordered),
        initialValues: recs.map((c) => c.id),
        required: false,
      });
      if (p.isCancel(sel)) { p.cancel('Cancelado.'); process.exit(0); }
      selectedIds = await resolveConflicts(sel);
    } else {
      const groups = [...new Set(ordered.map((c) => c.group))];
      const picks: Record<string, string[]> = {};
      let gi = 0;
      while (gi < groups.length) {
        const g = groups[gi]!;
        const comps = ordered.filter((c) => c.group === g);
        const initial = picks[g] ?? comps.filter(isRec).map((c) => c.id);
        const back = gi > 0 ? pc.gray(' · ESC vuelve atras') : pc.gray(' · ESC cancela');
        const sel = await p.multiselect({
          message: `Categoria ${pc.cyan(g)} (${gi + 1}/${groups.length}) — ${comps.length} opciones (enter continua${back})`,
          options: enriched(comps),
          initialValues: initial,
          required: false,
        });
        if (p.isCancel(sel)) {
          if (gi === 0) { p.cancel('Cancelado.'); process.exit(0); }
          gi--;
          continue;
        }
        picks[g] = sel;
        gi++;
      }
      const acc = groups.flatMap((g) => picks[g] ?? []);
      selectedIds = await resolveConflicts(acc);
    }

    // ── Paso Memoria: Basica siempre (context-mode + CLAUDE.md CUSTOM); Durable/Semantica opt-in.
    const memComps = catalog.components.filter((c) => c.memoryLevel);
    if (memComps.length) {
      const prevMem = new Set(
        (gen.loadSnapshot(projectDir)?.selected?.components ?? []).filter((id) => memComps.some((c) => c.id === id)));
      const memSel = await p.multiselect({
        message: 'Memoria — Basica SIEMPRE activa (context-mode = sesion · CLAUDE.md CUSTOM = proyecto). Añadir capas?',
        options: memComps.map((c) => ({ value: c.id, label: `+${c.memoryLevel} · ${c.name}`, hint: ui.truncate(c.desc, hintW) })),
        initialValues: [...prevMem],
        required: false,
      });
      if (p.isCancel(memSel)) { p.cancel('Cancelado.'); process.exit(0); }
      for (const id of memSel) if (!selectedIds.includes(id)) selectedIds.push(id); // aditivo
      // Si desmarcaste un store durable que estaba antes: sus datos NO se tocan; ofrece migrar.
      const dropped = [...prevMem].filter((id) => !memSel.includes(id));
      if (dropped.length)
        p.log.warn(`Dejaste de usar: ${dropped.join(', ')}. Sus notas siguen intactas. Copialas al nuevo store con: init-claude migrate-memory <ruta-vieja> <ruta-nueva>`);
    }

    if (catalog.projectSkills.length) {
      const skillSel = await p.multiselect({
        message: 'Skills de proyecto (.claude/skills/):',
        options: catalog.projectSkills.map((s2) => ({
          value: s2.id, label: s2.id,
          hint: ui.truncate(s2.desc, hintW) + (recSkill(s2) ? ' [recomendado]' : ''),
        })),
        initialValues: catalog.projectSkills.filter(recSkill).map((s2) => s2.id),
        required: false,
      });
      if (p.isCancel(skillSel)) { p.cancel('Cancelado.'); process.exit(0); }
      projectSkillIds = skillSel;
    } else projectSkillIds = [];

    const wantsExtra = await p.confirm({ message: 'Añadir algo mas? (skill desde URL, notas para CLAUDE.md)', initialValue: false });
    if (!p.isCancel(wantsExtra) && wantsExtra) {
      const what = await p.select({
        message: 'Que quieres añadir?',
        options: [
          { value: 'url', label: 'Skill desde URL (raw .md o repo GitHub)' },
          { value: 'notes', label: 'Notas/reglas adicionales para el CLAUDE.md' },
          { value: 'none', label: 'Nada, continuar' },
        ],
      });
      if (!p.isCancel(what)) {
        if (what === 'url') {
          const url = await p.text({ message: 'URL de la skill:' });
          if (!p.isCancel(url) && url) {
            try {
              const { name, content } = await remote.fetchSkill(url);
              gen.writeSkill(projectDir, name, content);
              p.log.success(`Skill '${name}' descargada al proyecto.`);
              projectSkillIds.push(name);
            } catch (e: any) { p.log.error(`No se pudo descargar: ${e.message}`); }
          }
        } else if (what === 'notes') {
          const notes = await p.text({ message: 'Notas (una linea; para mas, edita el bloque CUSTOM del CLAUDE.md despues):' });
          if (!p.isCancel(notes) && notes) extraContent = notes;
        }
      }
    }

    const regUrl = remote.getRegistryUrl();
    if (regUrl) {
      const reg = await remote.fetchRegistry(regUrl);
      if (reg?.skills?.length) {
        const regSel = await p.multiselect({
          message: 'Skills extra de tu registro remoto:',
          options: reg.skills.map((sk) => ({ value: sk.url, label: sk.id, hint: ui.truncate(sk.desc, hintW) })),
          required: false,
          initialValues: [] as string[],
        });
        if (!p.isCancel(regSel)) {
          for (const url of regSel) {
            try {
              const { name, content } = await remote.fetchSkill(url);
              gen.writeSkill(projectDir, name, content);
              projectSkillIds.push(name);
            } catch (e: any) { p.log.error(`${url}: ${e.message}`); }
          }
        }
      }
    }

    // Datos requeridos (ruta del vault, token de Figma…)
    for (const comp of catalog.components.filter((c) => selectedIds.includes(c.id))) {
      const asks: Array<{ message: string; placeholder?: string; optional?: boolean; validate?: 'dir'; store: string }> = [];
      if (comp.mcp?.prompt) asks.push({ ...comp.mcp.prompt, store: comp.mcp.prompt.key });
      if (comp.mcp?.envPrompt) asks.push({ ...comp.mcp.envPrompt, store: comp.mcp.envPrompt.var });
      for (const a of asks) {
        const clean = (v: unknown) => String(v ?? '').replace(/["`\r\n]/g, '').trim();
        const validate = a.validate === 'dir' ? (v: string) => {
          const sv = clean(v);
          if (!sv) return a.optional ? undefined : 'Requerido.';
          if (!existsSync(sv)) return `No existe esa ruta: ${sv}`;
          try { if (!statSync(sv).isDirectory()) return `No es una carpeta: ${sv}`; }
          catch { return `No accesible: ${sv}`; }
          return undefined;
        } : undefined;
        const val = await p.text({ message: a.message, placeholder: a.placeholder, validate });
        if (p.isCancel(val)) { p.cancel('Cancelado.'); process.exit(0); }
        const v = clean(val);
        if (v) {
          (answers[comp.id] ??= {})[a.store] = v;
          if (a.validate === 'dir' && comp.id === 'obsidian' && !existsSync(join(v, '.obsidian')))
            p.log.warn(`${v} no tiene .obsidian: ¿seguro que es un vault Obsidian? (se registra igual)`);
        }
      }
    }

    // Prerequisitos faltantes (avisar ANTES de empezar)
    const sel2 = catalog.components.filter((c) => selectedIds.includes(c.id));
    const missing: string[] = [];
    if (sel2.some((c) => c.install?.type === 'pipx') && !(hasCmd('python') && hasCmd('pipx')))
      missing.push('Python + pipx (para code-review-graph / MarkItDown / Headroom)');
    if (sel2.some((c) => c.requires?.includes('uv')) && !hasCmd('uv') && !hasCmd('pipx'))
      missing.push('uv o pipx (para serena)');
    if (selectedIds.includes('rtk') && !hasCmd('rtk') && !hasCmd('cargo'))
      missing.push('Rust/cargo (RTK; sin el se usa modo CLAUDE.md injection)');
    if (sel2.some((c) => c.mcp) && !hasCmd('claude'))
      missing.push('Claude Code CLI (sin el no se registran MCP)');
    if (missing.length)
      p.log.warn('Faltan prerequisitos (esos componentes se omitiran):\n' + missing.map((m) => '  - ' + m).join('\n'));

    if (sel2.length) {
      p.note(sel2.map((c) => '• ' + c.name + ': ' + planFor(c, answers)).join('\n'), 'Se hara');
    }

    const go = await p.confirm({ message: `Instalar ${selectedIds.length} componentes + ${projectSkillIds.length} skills?` });
    if (p.isCancel(go) || !go) { p.cancel('Cancelado.'); process.exit(0); }
  }

  // ─── EJECUCION ──────────────────────────────────────────────────────────────
  const selectedComps = catalog.components.filter((c) => selectedIds.includes(c.id));
  const ictx: InstallCtx = { projectDir, hasPython: hasCmd('python'), answers };
  const results: SummaryRow[] = [];
  const NOISE = /^(npm (warn|notice|http)|added \d|changed \d|audited|deprecated)/i;

  const totalComps = selectedComps.length;
  const sInstall = p.spinner();
  sInstall.start(`Instalando componentes ${ui.progressBar(0, totalComps)}`);
  for (let i = 0; i < selectedComps.length; i++) {
    const comp = selectedComps[i]!;
    let secs = 0, lastLine = '';
    const render = () => sInstall.message(
      `${ui.progressBar(i + 1, totalComps)} · ${comp.name}${secs ? pc.gray(` ${secs}s`) : ''}${lastLine ? pc.gray(' · ' + lastLine) : ''}`);
    render();
    const tick = setInterval(() => { secs++; render(); }, 1000);
    ictx.onProgress = (chunk: string) => {
      const line = chunk.split(/\r?\n/).map((x) => x.trim()).filter((x) => x && !NOISE.test(x)).pop();
      if (line) lastLine = ui.truncate(line.replace(/\s+/g, ' '), Math.min(48, ui.termWidth() - 30));
    };
    const t0c = Date.now();
    try {
      const r = await installComponent(comp, ictx);
      const failed = r.some(([, v]) => /^FAIL|^ERROR|^TIMEOUT/.test(v));
      results.push([comp.name, r, failed, Date.now() - t0c]);
      for (const us of comp.userSkills ?? []) gen.copySkillToUser(us);
    } catch (e: any) {
      results.push([comp.name, [['bin', 'ERROR: ' + e.message]], true, Date.now() - t0c]);
    } finally {
      clearInterval(tick);
      ictx.onProgress = undefined;
    }
  }
  sInstall.stop(`Componentes ${ui.progressBar(totalComps, totalComps)}`);
  if (results.length) p.note(ui.formatSummary(results), 'Resumen de componentes');

  // ─── Prune: desmarcados respecto al snapshot anterior ───────────────────────
  const prevSnap = gen.loadSnapshot(projectDir);
  const prevIds = prevSnap?.selected?.components ?? [];
  const prunableMcps = prevIds
    .filter((id) => !selectedIds.includes(id))
    .map((id) => catalog.components.find((c) => c.id === id))
    .filter((c): c is Component => !!c && !!c.mcp && mcpList().includes(c.mcp.name));
  if (prunableMcps.length) {
    const names = prunableMcps.map((c) => `${c.mcp!.name} (${c.name})`).join(', ');
    if (flagYes) {
      p.log.warn(`${prunableMcps.length} MCP desmarcada(s) siguen instaladas: ${names}. --yes no desinstala; hazlo a mano: claude mcp remove <name> -s local`);
    } else {
      const ok = await p.confirm({ message: `Desmarcaste MCP ya instalada(s): ${names}. Desinstalar de este proyecto?`, initialValue: true });
      if (!p.isCancel(ok) && ok) {
        const sp = p.spinner();
        const totalPrune = prunableMcps.length;
        sp.start(`Desinstalando MCPs ${ui.progressBar(0, totalPrune)}`);
        const pruneRes: SummaryRow[] = [];
        for (let i = 0; i < totalPrune; i++) {
          const c = prunableMcps[i]!;
          sp.message(`${ui.progressBar(i, totalPrune)} · ${c.mcp!.name}`);
          await removeMcp(c.mcp!.name, projectDir);
          const stillThere = mcpHas(c.mcp!.name);
          pruneRes.push([c.name, [['mcp', stillThere ? 'FAIL' : 'REMOVED']], stillThere]);
        }
        sp.stop(`MCPs procesadas ${ui.progressBar(totalPrune, totalPrune)}`);
        p.note(ui.formatSummary(pruneRes), 'Desinstaladas');
      }
    }
  }

  // Skills de proyecto
  const s3 = p.spinner();
  s3.start('Skills de proyecto');
  const skillResults = projectSkillIds.map((id) => [id, gen.copySkillToProject(id, projectDir)] as const);
  s3.stop(`Skills: ${skillResults.length ? skillResults.map(([i, r]) => `${i}:${ui.statusLabel(r).text}`).join(' · ') : '(ninguna)'}`);

  // CLAUDE.md a mano (sin firma): no lo pisamos sin permiso.
  const mdPath = join(projectDir, 'CLAUDE.md');
  const mdHandwritten = existsSync(mdPath) && !readFileSync(mdPath, 'utf8').includes('Auto-generado por init-claude');
  let writeMd = true;
  if (mdHandwritten) {
    if (flagYes) { writeMd = false; }
    else {
      const ow = await p.confirm({ message: 'CLAUDE.md existe y NO lo gestiona init-claude. Sobreescribir? (.bak se guarda)', initialValue: false });
      writeMd = !p.isCancel(ow) && ow;
    }
  }

  const s4 = p.spinner();
  s4.start('Generando archivos');
  const withDesigner = selectedIds.includes('pencil') || selectedIds.includes('figma');
  gen.installAgents(withDesigner);
  gen.installCommands();
  const mdRes = writeMd
    ? gen.generateClaudeMd(projectDir, selectedComps, projectSkillIds, hasSuperpowers, extraContent, profile, toolSearch.on === true)
    : 'SKIPPED (CLAUDE.md a mano)';
  const setRes = gen.generateProjectSettings(projectDir);
  const giRes = gen.updateGitignore(projectDir);
  const hookRes = gen.installGitHooks(projectDir, selectedIds.includes('husky'));
  gen.saveSnapshot(projectDir, { components: selectedIds, skills: projectSkillIds });
  s4.stop('Archivos generados');
  p.note([
    `CLAUDE.md   ${ui.colorByKind(ui.statusLabel(mdRes).kind, ui.statusLabel(mdRes).text)}${mdRes === 'UPDATED' ? pc.gray(' (.bak guardado · revisa el diff)') : ''}`,
    `settings    ${ui.colorByKind(ui.statusLabel(setRes).kind, ui.statusLabel(setRes).text)}`,
    `gitignore   ${ui.colorByKind(ui.statusLabel(giRes).kind, ui.statusLabel(giRes).text)}`,
    `git hooks   ${ui.colorByKind(ui.statusLabel(hookRes).kind, ui.statusLabel(hookRes).text)}`,
  ].join('\n'), 'Proyecto');

  if (selectedIds.includes('code-review-graph') && hasCmd('code-review-graph')) {
    p.log.step('Construyendo grafo del codebase (code-review-graph build)...');
    const gr = run('code-review-graph build', { visible: true, timeout: 120000 });
    if (gr.ok) p.log.success('Grafo construido');
    else if (gr.timedOut) p.log.warn('Build del grafo abortado por timeout (120s). Corre "code-review-graph build" a mano luego.');
    else p.log.warn(`Build del grafo fallo (exit ${gr.code}). Continua sin grafo.`);
  }

  const failures: string[] = [];
  for (const [name, parts] of results)
    for (const [, v] of parts)
      if (/^FAIL|^ERROR|^TIMEOUT/.test(v)) failures.push(`${pc.red(S.fail)} ${name}: ${v}\n    → ${ui.remedyFor(v)}`);
  if (failures.length) p.note(failures.join('\n'), pc.red('Fallos (revisar)'));

  const okCount = results.filter(([, , f]) => !f).length;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  p.note([
    rec.recommenderAvailable() ? 'Sugerencias IA del repo (lento):  init-claude suggest' : null,
    'Skills on-demand:  npx skills find',
    hasSuperpowers ? null : 'Metodologia plan-first/TDD:  /plugin install superpowers',
    'Estado / diagnostico:  init-claude check',
    'Actualizar app / componentes:  init-claude update | upgrade',
  ].filter(Boolean).join('\n'), 'Siguientes pasos');

  p.outro(pc.green(
    `Listo: ${okCount}/${results.length} componentes, ${skillResults.length} skills${failures.length ? pc.yellow(` · ${failures.length} con fallo`) : ''} · ${elapsed}s`));
}

// Describe en una linea lo que hara un componente (para el preview).
function planFor(c: Component, ans: Record<string, Record<string, string>>): string {
  const acts: string[] = [];
  const inst = c.install;
  if (inst?.type === 'npm') acts.push(`npm i -g ${inst.pkg}`);
  else if (inst?.type === 'pipx') acts.push(`pipx install ${inst.pkg}`);
  else if (inst?.type === 'rtk') acts.push('instala RTK (cargo) o modo injection');
  else if (inst?.type === 'installer') acts.push('descarga binario (script oficial)');
  else if (inst?.type === 'husky') acts.push('husky + lint-staged en el proyecto');
  else if (inst?.type === 'project-npx') acts.push('npx en el proyecto');
  if (c.mcp) {
    let m = `registra MCP ${c.mcp.name}`;
    const pv = c.mcp.prompt ? ans?.[c.id]?.[c.mcp.prompt.key] : undefined;
    const ev = c.mcp.envPrompt ? ans?.[c.id]?.[c.mcp.envPrompt.var] : undefined;
    if (pv) m += ` (${ui.truncate(pv, 30)})`;
    if (ev) m += ` (-e ${c.mcp.envPrompt!.var}=${ui.mask(ev)})`;
    acts.push(m);
  }
  return acts.length ? acts.join(pc.gray(' · ')) : pc.gray('config en CLAUDE.md');
}
