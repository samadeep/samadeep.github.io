export const SITE = {
  name: 'Samadeep Sengupta',
  url: 'https://samadeep.github.io',
  description: 'Notes on systems, infrastructure and algorithms, plus what I am reading.',
  repo: 'https://github.com/samadeep/samadeep.github.io',
  links: {
    GitHub: 'https://github.com/samadeep',
    X: 'https://x.com/samadeepviews',
    LinkedIn: 'https://www.linkedin.com/in/samadeep',
    Codeforces: 'https://codeforces.com/profile/samadeep',
  },
};

// Fill these in to switch features on; empty values render nothing.
export const ANALYTICS = {
  // Cloudflare Web Analytics: dashboard > Web Analytics > Add a site > copy the token from the JS snippet
  cloudflareToken: 'd5a1558ada30406ab2b1589796d5db1a',
};
export const GISCUS = {
  // giscus.app: enable Discussions on the repo, install the giscus app, then copy these from the generated script
  repo: 'samadeep/samadeep.github.io',
  repoId: 'R_kgDOK3X_9Q', // from the GitHub API (repo node id)
  category: 'Announcements',
  categoryId: 'DIC_kwDOK3X_9c4DHAJB',
};

export const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
