// Series come from src/data/series.yml (see the notes there): edit that file, not this one.
// A post joins one with `series: <slug>`; its number is its position by date (oldest = 1).
import { parse } from 'yaml';
import source from '../data/series.yml?raw';

export type SeriesKind = 'weekly' | 'collection';
export type Series = { slug: string; name: string; kind: SeriesKind; icon: string; hue: number; blurb: string };

const raw = parse(source) as Series[];
for (const s of raw) {
  if (!/^[a-z0-9-]+$/.test(s.slug) || !s.name || !s.blurb || !s.icon || typeof s.hue !== 'number')
    throw new Error(`src/data/series.yml: series "${s.slug}" needs slug (kebab-case), name, blurb, icon and hue`);
  if (s.kind !== 'weekly' && s.kind !== 'collection')
    throw new Error(`src/data/series.yml: series "${s.slug}" has kind "${s.kind}"; use weekly or collection`);
}

export const SERIES: readonly Series[] = raw;
export const seriesSlugs = SERIES.map((s) => s.slug) as [string, ...string[]];
export const seriesOf = (slug: string) => SERIES.find((s) => s.slug === slug)!;

/** Words that change with the kind: "Issue 3 of 7" for a weekly, "Part 2 of 4" for a collection. */
export const seriesWords = (s: Series) =>
  s.kind === 'weekly'
    ? { unit: 'Issue', short: (n: number) => `#${n}`, label: (n: number) => `${s.name} #${n}`, prev: 'Previous issue', next: 'Next issue', cadence: 'Weekly' }
    : { unit: 'Part', short: (n: number) => `${n}`, label: (n: number) => `${s.name} · Part ${n}`, prev: 'Previous in series', next: 'Next in series', cadence: 'Collection' };
