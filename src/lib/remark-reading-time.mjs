import getReadingTime from 'reading-time';
import { toString } from 'mdast-util-to-string';

// Prose at reading-time's default pace; code blocks at half that, diagrams ignored.
export function remarkReadingTime() {
  return (tree, { data }) => {
    let prose = '', codeWords = 0;
    for (const n of tree.children) {
      if (n.type === 'code') { if (n.lang !== 'plantuml') codeWords += n.value.split(/\s+/).length; }
      else prose += toString(n) + '\n';
    }
    const minutes = getReadingTime(prose).minutes + codeWords / 100;
    data.astro.frontmatter.minutes = Math.max(1, Math.round(minutes));
  };
}
