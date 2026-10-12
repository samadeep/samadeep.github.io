// First Principles: the study path (data only, safe to import from content.config.ts). Data lives in src/data/study/*.yml (modules, sources, canon),
// chapters in src/content/study/*.md. Edit the yml, not this file; this only loads and checks it.
import { parse } from 'yaml';
import modulesSrc from '../data/study/modules.yml?raw';
import sourcesSrc from '../data/study/sources.yml?raw';
import canonSrc from '../data/study/canon.yml?raw';

export type ModuleStatus = 'written' | 'next' | 'planned';
export type Module = {
  id: string; title: string; question: string; goal: string; status: ModuleStatus; mode: 'full' | 'companion';
  weeks: number; needs: string[]; topics: string[]; lab: string; checkpoint: string[]; chapter?: string; post?: string;
};
export type Source = { title: string; by: string; url?: string; modules: string[]; role: 'primary' | 'companion'; free?: boolean; note: string; checked?: string };
export type Work = { by: string; year?: number; title: string; idea: string; star?: boolean; free?: boolean };
export type Theme = { theme: string; works: Work[] };

const fail = (file: string, msg: string) => { throw new Error(`src/data/study/${file}: ${msg}`); };

export const MODULES: readonly Module[] = (parse(modulesSrc) as Module[]).map((m) => ({ ...m, needs: m.needs ?? [] }));
const ids = new Set(MODULES.map((m) => m.id));
for (const m of MODULES) {
  if (!m.id || !m.title || !m.question || !m.goal) fail('modules.yml', `module "${m.id}" needs id, title, question and goal`);
  if (!['written', 'next', 'planned'].includes(m.status)) fail('modules.yml', `module ${m.id} has status "${m.status}"`);
  if (!['full', 'companion'].includes(m.mode)) fail('modules.yml', `module ${m.id} has mode "${m.mode}"`);
  for (const n of m.needs) if (!ids.has(n)) fail('modules.yml', `module ${m.id} needs unknown module ${n}`);
  if (m.status === 'written' && !m.chapter) fail('modules.yml', `module ${m.id} is written but has no chapter`);
}
export const moduleIds = MODULES.map((m) => m.id) as [string, ...string[]];
export const moduleOf = (id: string) => MODULES.find((m) => m.id === id)!;

export const SOURCES: readonly Source[] = parse(sourcesSrc) as Source[];
for (const s of SOURCES) {
  if (!s.title || !s.by || !s.note || !s.modules?.length) fail('sources.yml', `"${s.title}" needs title, by, note and modules`);
  for (const id of s.modules) if (!ids.has(id)) fail('sources.yml', `"${s.title}" lists unknown module ${id}`);
  if (s.role !== 'primary' && s.role !== 'companion') fail('sources.yml', `"${s.title}" has role "${s.role}"`);
}
export const sourcesFor = (id: string) => SOURCES.filter((s) => s.modules.includes(id));

export const CANON: readonly Theme[] = parse(canonSrc) as Theme[];

/** Progress for the meter: modules with a published chapter over all modules, and weeks of study behind them. */
export function progress() {
  const written = MODULES.filter((m) => m.status === 'written');
  return { written: written.length, total: MODULES.length, weeksDone: written.reduce((n, m) => n + m.weeks, 0), weeks: MODULES.reduce((n, m) => n + m.weeks, 0) };
}
