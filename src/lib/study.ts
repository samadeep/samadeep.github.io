// First Principles chapters, joined with their module. Data loading lives in study-data.ts.
import { getCollection, render, type CollectionEntry } from 'astro:content';
import { moduleIds, moduleOf, type Module } from './study-data';
export * from './study-data';

export type Chapter = CollectionEntry<'study'> & { minutes: number; href: string; module: Module };
export async function getChapters(): Promise<Chapter[]> {
  const all = await getCollection('study', (c) => import.meta.env.DEV || !c.data.draft);
  const out = await Promise.all(all.map(async (c) => {
    const { remarkPluginFrontmatter } = await render(c);
    return Object.assign(c, { minutes: Number(remarkPluginFrontmatter.minutes ?? 1), href: `/study/${c.id}/`, module: moduleOf(c.data.module) });
  }));
  return out.sort((a, b) => moduleIds.indexOf(a.data.module) - moduleIds.indexOf(b.data.module));
}

