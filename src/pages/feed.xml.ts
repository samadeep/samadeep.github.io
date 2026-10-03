import rss from '@astrojs/rss';
import { getPosts } from '../lib/posts';
import { SITE } from '../lib/site';

// Same path as the old jekyll-feed, so existing subscribers keep working.
export async function GET() {
  const posts = await getPosts();
  return rss({
    title: SITE.name, description: SITE.description, site: SITE.url,
    items: posts.map((p) => ({ title: p.data.title, description: p.data.description, pubDate: p.data.date, link: p.href, categories: p.data.tags })),
  });
}
