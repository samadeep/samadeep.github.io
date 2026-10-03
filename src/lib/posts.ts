import { getCollection, render, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'posts'> & { minutes: number; href: string };

export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('posts', (p) => import.meta.env.DEV || !p.data.draft);
  const withTime = await Promise.all(
    all.map(async (p) => {
      const { remarkPluginFrontmatter } = await render(p);
      return Object.assign(p, { minutes: Number(remarkPluginFrontmatter.minutes ?? 1), href: `/posts/${p.id}/` });
    }),
  );
  return withTime.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export const toRow = (p: Post, withDescription = true) => ({
  href: p.href, title: p.data.title, date: p.data.date, minutes: p.minutes,
  description: withDescription ? p.data.description : undefined,
});

export function tagCounts(posts: Post[]) {
  const m = new Map<string, number>();
  for (const p of posts) for (const t of p.data.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
