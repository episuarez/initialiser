// src/commands/migrate.ts — Copia memoria durable (markdown) entre stores.
// Aditivo y seguro: nunca borra el origen ni sobrescribe el destino.
import pc from 'picocolors';
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

export function runMigrateMemory(args: string[]): number {
  const src = args[0], dst = args[1];
  if (!src || !dst) {
    console.log(pc.red('Uso: init-claude migrate-memory <ruta-origen> <ruta-destino>'));
    console.log(pc.gray('Copia los .md de un store de memoria a otro. No borra el origen ni sobrescribe el destino.'));
    return 1;
  }
  if (!existsSync(src) || !statSync(src).isDirectory()) {
    console.log(pc.red(`Origen invalido (no existe o no es carpeta): ${src}`));
    return 1;
  }
  mkdirSync(dst, { recursive: true });

  const mdFiles: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.toLowerCase().endsWith('.md')) mdFiles.push(p);
    }
  };
  walk(src);

  let copied = 0, skipped = 0;
  for (const f of mdFiles) {
    const target = join(dst, relative(src, f));
    if (existsSync(target)) { skipped++; continue; } // aditivo: no sobrescribe
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(f, target);
    copied++;
  }
  console.log(pc.green(`Migracion: ${copied} notas copiadas, ${skipped} ya existian (no sobrescritas).`));
  console.log(pc.gray(`Origen intacto: ${src}`));
  return 0;
}
