// The interests a reader arrives with. Every post picks exactly one `topic`.
// Order here is the order on the site. A topic with no posts stays hidden.
export const TOPICS = [
  { slug: 'algorithms', hue: 285, name: 'Algorithms & CP', blurb: 'LeetCode and Codeforces write-ups: the idea, the proof sketch, the code.' },
  { slug: 'systems', hue: 195, name: 'Systems', blurb: 'Schedulers, queues and distributed systems, from the failure modes up.' },
  { slug: 'low-latency', hue: 65, name: 'Low latency', blurb: 'C++, trading engines and where the microseconds go.' },
  { slug: 'ai', hue: 350, name: 'AI & agents', blurb: 'Retrieval, agents and the infrastructure that keeps them honest.' },
] as const;

export type TopicSlug = (typeof TOPICS)[number]['slug'];
export const topicSlugs = TOPICS.map((t) => t.slug) as [TopicSlug, ...TopicSlug[]];
export const topicOf = (slug: string) => TOPICS.find((t) => t.slug === slug)!;
