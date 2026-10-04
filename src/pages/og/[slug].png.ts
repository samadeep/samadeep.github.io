import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { getPosts } from '../../lib/posts';
import { SITE } from '../../lib/site';

const require = createRequire(import.meta.url);
const font = (pkg: string, file: string) => readFileSync(require.resolve(`${pkg}/files/${file}`));
const fonts = [
  // Aptos Mono can't be embedded (licence), so cards use the site's fallback mono
  { name: 'Mono', data: font('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-700-normal.woff'), weight: 700 as const, style: 'normal' as const },
  { name: 'Mono', data: font('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-400-normal.woff'), weight: 400 as const, style: 'normal' as const },
];

// share cards use the dark scheme: Electric Teal only reaches contrast on Ink Black
const C = { paper: '#031211', ink: '#E8E4D3', ink2: '#BDB9AA', trace: '#00AEBB', track: '#123332' };
const h = (type: string, style: Record<string, unknown>, children?: unknown) => ({ type, props: { style, children } });

function card(title: string, sub: string, foot: string, bars: number[]) {
  return h('div', { width: 1200, height: 630, display: 'flex', flexDirection: 'column', background: C.paper, padding: '72px 80px', fontFamily: 'Mono' }, [
    h('div', { display: 'flex', flexDirection: 'column', gap: 12 }, bars.map((w) =>
      h('div', { display: 'flex', width: 360, height: 10, background: C.track, borderRadius: 5 }, [h('div', { width: `${w}%`, height: 10, background: C.trace, borderRadius: 5 })]))),
    h('div', { display: 'flex', flexDirection: 'column', marginTop: 'auto' }, [
      h('div', { fontSize: title.length > 70 ? 46 : 56, fontWeight: 700, color: C.ink, lineHeight: 1.15 }, title),
      h('div', { fontSize: 24, color: C.ink2, marginTop: 24, lineHeight: 1.4 }, sub),
    ]),
    h('div', { display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 24, fontWeight: 400, color: C.ink2 }, [
      h('div', {}, SITE.name), h('div', { color: C.trace }, foot),
    ]),
  ]);
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '...' : s);

export async function getStaticPaths() {
  const posts = await getPosts();
  const max = Math.max(...posts.map((p) => p.minutes), 10);
  return [
    { params: { slug: 'site' }, props: { title: SITE.name, sub: SITE.description, foot: 'samadeep.github.io', bars: posts.slice(0, 3).map((p) => (p.minutes / max) * 100) } },
    ...posts.map((p) => ({ params: { slug: p.id }, props: { title: clip(p.data.title, 95), sub: clip(p.data.description, 140), foot: `${p.minutes} min read`, bars: [(p.minutes / max) * 100] } })),
  ];
}

export async function GET({ props }: { props: { title: string; sub: string; foot: string; bars: number[] } }) {
  const svg = await satori(card(props.title, props.sub, props.foot, props.bars) as any, { width: 1200, height: 630, fonts });
  const png = new Resvg(svg).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
}
