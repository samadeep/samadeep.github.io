import { parse } from 'yaml';
import source from '../data/reading.yml?raw';

export type ReadingItem = {
  url: string; title: string; author?: string; source: string; icon: string;
  tags: string[]; note?: string; status: 'to-read' | 'read'; added?: Date;
};

const SOURCES: [RegExp, string, string][] = [
  [/(^|\/\/)(www\.)?(x|twitter)\.com\//, 'X', 'x'],
  [/medium\.com/, 'Medium', 'medium'],
  [/arxiv\.org|alphaxiv\.org|\.pdf($|\?)/, 'Paper', 'paper'],
  [/youtube\.com|youtu\.be/, 'Video', 'video'],
  [/github\.com/, 'GitHub', 'github'],
  [/linkedin\.com/, 'LinkedIn', 'linkedin'],
  [/substack\.com/, 'Substack', 'article'],
  [/news\.ycombinator\.com/, 'HN', 'article'],
];

export function sourceOf(url: string, override?: string) {
  const u = url.toLowerCase();
  const hit = SOURCES.find(([re]) => re.test(u));
  return { source: override || (hit ? hit[1] : 'Article'), icon: hit ? hit[2] : 'article' };
}

export function getReading(): ReadingItem[] {
  const raw = parse(source) ?? [];
  return (raw as any[])
    .map((r) => ({
      ...r,
      ...sourceOf(r.url, r.source),
      title: r.title || r.url,
      tags: r.tags ?? [],
      status: r.status === 'read' ? 'read' : 'to-read',
      added: r.added ? new Date(r.added) : undefined,
    }))
    .sort((a, b) => (b.added?.getTime() ?? 0) - (a.added?.getTime() ?? 0));
}
