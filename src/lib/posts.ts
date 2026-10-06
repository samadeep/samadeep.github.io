import { getCollection, render, type CollectionEntry } from 'astro:content';
import { TOPICS } from './topics';
import { SERIES, seriesOf } from './series';
// @ts-ignore: plain .mjs helper shared with the markdown pipeline
import { firstDiagram } from './remark-plantuml.mjs';
// @ts-ignore: plain .mjs helper shared with the markdown pipeline
import { firstD2 } from './remark-d2.mjs';
import { firstFig } from './remark-fig.mjs';

export type Post = CollectionEntry<'posts'> & { minutes: number; href: string; cover?: string; issue?: number };

export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('posts', (p) => import.meta.env.DEV || !p.data.draft);
  const withTime = await Promise.all(
    all.map(async (p) => {
      const { remarkPluginFrontmatter } = await render(p);
      return Object.assign(p, {
        minutes: Number(remarkPluginFrontmatter.minutes ?? 1),
        href: `/posts/${p.id}/`,
        cover: p.data.cover ?? ((firstFig(p.body) ?? firstD2(p.body) ?? firstDiagram(p.body)) as string | undefined),
      });
    }),
  );
  const sorted: Post[] = withTime;
  sorted.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
  // issue numbers: position inside the series, oldest first
  for (const s of SERIES) sorted.filter((p) => p.data.series === s.slug).reverse().forEach((p, i) => (p.issue = i + 1));
  return sorted;
}

/** Series that have posts, each with its issues newest first. */
export function seriesGroups(posts: Post[]) {
  return SERIES.map((s) => ({ ...s, posts: posts.filter((p) => p.data.series === s.slug) })).filter((g) => g.posts.length);
}

/** "CP Weekly #3" for a post in a series. */
export const issueLabel = (p: Post) => (p.data.series && p.issue ? `${seriesOf(p.data.series).name} #${p.issue}` : undefined);

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
    href: p.href, mark: { icon: t.icon }, hue: t.hue, context: issueLabel(p) ?? `In ${t.name}`, by: 'Samadeep', date: p.data.date,
    title: p.data.title, subtitle: p.data.description, thumb: p.cover, thumbAlt: `Diagram from ${p.data.title}`,
    minutes: p.minutes, scale, badges: p.data.problems.map(problemLabel), tags: p.data.tags, morph: `post-${p.id}`,
  };
}
