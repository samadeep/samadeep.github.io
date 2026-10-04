import { getCollection, render, type CollectionEntry } from 'astro:content';
import { TOPICS } from './topics';
// @ts-ignore: plain .mjs helper shared with the markdown pipeline
import { firstDiagram } from './remark-plantuml.mjs';

export type Post = CollectionEntry<'posts'> & { minutes: number; href: string; cover?: string };

export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('posts', (p) => import.meta.env.DEV || !p.data.draft);
  const withTime = await Promise.all(
    all.map(async (p) => {
      const { remarkPluginFrontmatter } = await render(p);
      return Object.assign(p, {
        minutes: Number(remarkPluginFrontmatter.minutes ?? 1),
        href: `/posts/${p.id}/`,
        cover: p.data.cover ?? (firstDiagram(p.body) as string | undefined),
      });
    }),
  );
  return withTime.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export const problemLabel = (pr: Post['data']['problems'][number]) =>
  `${pr.platform} ${pr.id}${pr.difficulty ? `, ${pr.difficulty}` : ''}`;

/** Topics that have posts, in TOPICS order, each with its posts newest first. */
export function topicGroups(posts: Post[]) {
  return TOPICS.map((t) => ({ ...t, posts: posts.filter((p) => p.data.topic === t.slug) })).filter((g) => g.posts.length);
}

export const readScale = (posts: Post[]) => Math.ceil(Math.max(10, ...posts.map((p) => p.minutes)) / 10) * 10;

export function tagCounts(posts: Post[]) {
  const m = new Map<string, number>();
  for (const p of posts) for (const t of p.data.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** FeedItem props for a post. */
export function postCard(p: Post, scale: number) {
  const t = TOPICS.find((x) => x.slug === p.data.topic)!;
  return {
    href: p.href, mark: { icon: t.icon }, hue: t.hue, context: `In ${t.name}`, by: 'Samadeep', date: p.data.date,
    title: p.data.title, subtitle: p.data.description, thumb: p.cover, thumbAlt: `Diagram from ${p.data.title}`,
    minutes: p.minutes, scale, badges: p.data.problems.map(problemLabel), tags: p.data.tags, morph: `post-${p.id}`,
  };
}
