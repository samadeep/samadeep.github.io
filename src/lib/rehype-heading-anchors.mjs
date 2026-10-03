import { visit } from 'unist-util-visit';

// Appends a "#" link to every h2/h3 that has an id, for copyable section links.
export function rehypeHeadingAnchors() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (!/^h[23]$/.test(node.tagName) || !node.properties?.id) return;
      node.children.push({
        type: 'element',
        tagName: 'a',
        properties: { href: `#${node.properties.id}`, className: ['anchor'], ariaLabel: 'Link to this section' },
        children: [{ type: 'text', value: '#' }],
      });
    });
  };
}
