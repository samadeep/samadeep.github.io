import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts, seriesGroups } from '../../lib/posts';
import { SITE } from '../../lib/site';

// /series/<slug>.xml: a feed for readers who want one series and nothing else
export async function getStaticPaths() {
  return seriesGroups(await getPosts()).map((g) => ({ params: { series: g.slug }, props: { group: g } }));
}

export async function GET({ props }: APIContext) {
  const { group } = props as { group: Awaited<ReturnType<typeof seriesGroups>>[number] };
  return rss({
    title: `${group.name} | ${SITE.name}`, description: group.blurb, site: SITE.url,
    items: group.posts.map((p) => ({ title: p.data.title, description: p.data.description, pubDate: p.data.date, link: p.href, categories: p.data.tags })),
  });
}
