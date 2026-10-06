// Series: posts that come out on a rhythm and are read in order. A post joins one with
// `series: <slug>` in front matter; its issue number is its position by date (oldest = 1),
// so numbers never need to be written by hand. A series with no posts stays hidden.
export const SERIES = [
  {
    slug: 'cp-weekly', name: 'CP Weekly', icon: 'braces', hue: 285, cadence: 'Weekly',
    blurb: 'The newest ideas from the past week of competitive programming, one lead trick per issue, each with a figure, a proof sketch and code tested against brute force.',
  },
] as const;

export type SeriesSlug = (typeof SERIES)[number]['slug'];
export const seriesSlugs = SERIES.map((s) => s.slug) as [SeriesSlug, ...SeriesSlug[]];
export const seriesOf = (slug: string) => SERIES.find((s) => s.slug === slug)!;
