import { getReading } from '../lib/reading';
import { SITE } from '../lib/site';

const esc = (s = '') => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);

export function GET() {
  const items = getReading().slice(0, 50);
  const now = new Date().toISOString();
  const body = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${esc(SITE.name)}: reading list</title>
  <link href="${SITE.url}/reading/"/>
  <link rel="self" href="${SITE.url}/reading.xml"/>
  <id>${SITE.url}/reading/</id>
  <updated>${items[0]?.added?.toISOString() ?? now}</updated>
  <author><name>${esc(SITE.name)}</name></author>
${items.map((r) => `  <entry>
    <title>${esc(r.title)}</title>
    <link href="${esc(r.url)}"/>
    <id>${esc(r.url)}</id>
    <updated>${(r.added ?? new Date()).toISOString()}</updated>
${r.tags.map((t) => `    <category term="${esc(t)}"/>`).join('\n')}
    <summary>${esc([r.author, r.source, r.note].filter(Boolean).join('. '))}</summary>
  </entry>`).join('\n')}
</feed>`;
  return new Response(body, { headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' } });
}
