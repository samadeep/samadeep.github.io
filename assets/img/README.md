# Images Directory

This directory contains image assets for the blog.

## Current Images

- `avatar.svg` - Site avatar/profile image (SVG format for scalability)

## Adding New Images

When adding new images:

1. **Optimize images** before adding them to reduce file size
2. **Use descriptive filenames** (e.g., `post-title-diagram.png`)
3. **Consider using SVG** for logos and simple graphics
4. **Add alt text** when referencing images in posts

## Supported Formats

- PNG (for screenshots, complex images)
- JPG (for photos, complex images with many colors)
- SVG (for logos, icons, simple graphics)
- WebP (for modern browsers, better compression)

## Best Practices

- Keep image file sizes under 1MB when possible
- Use appropriate image dimensions (avoid overly large images)
- Consider using external image hosting for very large images
- Always include proper alt text for accessibility

## Example Usage in Posts

```markdown
![Alt text]({{ '/assets/img/your-image.png' | relative_url }})
```

or with captions:

```markdown
{% include image.html url="/assets/img/your-image.png" description="Image description" %}
``` 