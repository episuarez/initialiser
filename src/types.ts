// src/types.ts — Tipos núcleo compartidos (no derivados del catálogo; el tipo
// Component se infiere del esquema zod en catalog.ts).

export type Tier = 'core' | 'suggested' | 'available';
export type Weight = 'none' | 'light' | 'medium' | 'heavy';

export interface Profile {
  tags: Set<string>;
  langs: string[];
  fws: string[];
  fileCount: number;
  size: 'small' | 'medium' | 'large';
  hasDocs: boolean;
  hasDesign: boolean;
  hasTests: boolean;
  hasGit: boolean;
  hasCI: boolean;
  isMonorepo: boolean;
}

export interface Cost {
  tools: number | null;
  toolsDeferred: boolean;
  weight: Weight;
  needs: string[];
}

export interface Analysis {
  id: string;
  name: string;
  group: string;
  desc: string;
  tier: Tier;
  recommended: boolean;
  providedAlready: boolean;
  reason: string;
  signals: string[];
  cost: Cost;
}

export type ToolSearchMode = 'auto' | 'forced' | 'off';
export interface ToolSearchState {
  on: boolean | null;
  mode: ToolSearchMode;
  threshold: number | null;
  reason: string;
}

export interface Snapshot {
  version: string;
  date: string;
  selected: { components: string[]; skills: string[] };
}

// Resultado de instalar un componente: pares [clave, valor de estado].
export type InstallResult = [string, string][];
