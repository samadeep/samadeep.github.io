import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { topicSlugs } from './lib/topics';

// 2025-01-27-my-post.md -> my-post  (keeps the old /posts/<slug>/ URLs)
const posts = defineCollection({
  loader: glob({
    pattern: '**/*.{md,mdx}',
    base: './src/content/posts',
    generateId: ({ entry }) => entry.replace(/^.*\//, '').replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.mdx?$/, ''),
  }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    topic: z.enum(topicSlugs),
    // the one surprising number, shown huge on the share card (X, LinkedIn, Slack unfurls)
    hook: z.object({ stat: z.string(), caption: z.string() }).optional(),
    cover: z.string().optional(), // /path or URL; default is the post's first diagram, then a topic tile
    tags: z.array(z.string()).default([]),
    // judge problems a write-up covers; rendered as cards under the title
    problems: z.array(z.object({
      platform: z.enum(['LeetCode', 'Codeforces', 'CodeChef', 'AtCoder', 'CSES', 'Other']),
      id: z.string(),
      title: z.string(),
      url: z.string().url(),
      difficulty: z.string().optional(),
    })).default([]),
    draft: z.boolean().default(false),
    // run code blocks in the in-browser Linux VM; `setup` runs once before the reader's first command
    vm: z.object({ setup: z.string().default('cd /root') }).optional(),
  }),
});

export const collections = { posts };
