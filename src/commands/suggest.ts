// src/commands/suggest.ts — Recomendador oficial (claude-code-setup) en headless.
// Lento (~min) y aparte del wizard a proposito. Solo se ejecutan comandos del allowlist.
import * as p from '@clack/prompts';
import pc from 'picocolors';
import * as rec from '../recommend.js';
import * as ui from '../ui.js';

export async function runSuggest(ctx: { projectDir: string; version: string }): Promise<void> {
  const { projectDir, version: VERSION } = ctx;
  const S = ui.sym();
  process.setMaxListeners(50);
  p.intro(pc.bgCyan(pc.black(` init-claude suggest v${VERSION} `)));
  if (!ui.isTTY()) { console.error(pc.red('Necesita terminal interactiva (TTY).')); return; }
  if (!rec.recommenderAvailable()) {
    p.log.error('Claude Code CLI no detectado. Instala: npm install -g @anthropic-ai/claude-code');
    p.outro('Cancelado.'); return;
  }
  if (!rec.pluginInstalled()) {
    const instPlug = await p.confirm({ message: 'Falta el plugin claude-code-setup (analizador oficial). Instalarlo?', initialValue: true });
    if (p.isCancel(instPlug) || !instPlug) { p.outro('Cancelado.'); return; }
    const sp = p.spinner(); sp.start('Instalando claude-code-setup');
    const stopTick = ui.elapsedTicker(sp, 'Instalando claude-code-setup');
    const ok = await rec.installRecommenderPlugin();
    stopTick();
    sp.stop(ok ? 'Plugin instalado' : 'No se pudo instalar (instala con /plugin install y reintenta)');
    if (!rec.pluginInstalled()) { p.outro('Sin plugin, no puedo analizar.'); return; }
  }
  const sp = p.spinner();
  sp.start('Analizando el repo (Claude headless, puede tardar minutos)');
  const stopTick = ui.elapsedTicker(sp, 'Analizando el repo');
  const { ok, suggestions, error } = await rec.runRecommender(projectDir);
  stopTick();
  sp.stop(ok ? `Sugerencias: ${suggestions.length}` : `Recomendador fallo (${error})`);
  if (!ok) { p.outro('Sin resultado.'); return; }

  const advisory = suggestions.filter((s2) => !s2.installable);
  const installable = suggestions.filter((s2) => s2.installable);
  if (advisory.length)
    p.note(advisory.map((s2) => `${S.dot} [${s2.category}] ${pc.cyan(s2.name)} — ${ui.truncate(s2.why, 60)}`).join('\n'),
      'Sugerencias (implementar a mano o pideme ayuda)');
  if (installable.length) {
    const pick = await p.multiselect({
      message: 'Instalar ahora? Revisa el comando antes de marcar:',
      options: installable.map((s2) => ({
        value: s2.install,
        label: `${s2.name} ${pc.gray('(' + s2.category + ')')}${s2.why ? ' — ' + ui.truncate(s2.why, 48) : ''}`,
        hint: ui.truncate(s2.install, Math.min(80, ui.termWidth() - 12)),
      })),
      required: false, initialValues: [] as string[],
    });
    if (!p.isCancel(pick) && pick.length) {
      const sp2 = p.spinner();
      const totalPick = pick.length;
      sp2.start(`Instalando sugerencias ${ui.progressBar(0, totalPick)}`);
      const instRes: string[] = [];
      for (let i = 0; i < totalPick; i++) {
        const c = pick[i]!;
        sp2.message(`${ui.progressBar(i, totalPick)} · ${ui.truncate(c, 40)}`);
        const r = await rec.runInstall(c);
        instRes.push(`${r.ok ? pc.green(S.ok) : pc.red(S.fail)} ${ui.truncate(c, ui.termWidth() - 6)}`);
      }
      sp2.stop(`Sugerencias instaladas ${ui.progressBar(totalPick, totalPick)}`);
      p.note(instRes.join('\n'), 'Resultado');
    }
  } else if (!advisory.length) p.log.message('Sin sugerencias.');
  p.outro(pc.green('Listo.'));
}
