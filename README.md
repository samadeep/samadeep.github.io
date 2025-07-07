# Samadeep's Tech Blog

A modern Jekyll blog focused on system design, software engineering, and technical content with interactive diagrams and clean design.

## Features

### Design & UI
- Clean, responsive design with dark/light mode
- Professional typography and spacing
- Mobile-first responsive layout
- Smooth transitions and animations

### Interactive Content
- **Mermaid diagrams** for flowcharts, sequence diagrams, and more
- **PlantUML support** via Kroki for UML and architecture diagrams
- **Full-screen viewing** with click-to-expand functionality
- **Copy-to-clipboard** for code blocks and diagrams
- **Math expressions** with MathJax support

### Content Management
- **Automated post creation** via Ruby script with templates
- **Multiple templates** for different content types
- **SEO optimization** with meta tags and structured data
- **Category and tag organization**
- **Reading time estimation**

### Technical Features
- **Syntax highlighting** for code blocks
- **Table of contents** auto-generation
- **Progressive Web App** capabilities
- **RSS feed** generation
- **Performance optimized** with lazy loading

## Installation

### Requirements
- Ruby 2.7+
- Jekyll 4.0+
- Node.js (for asset compilation)
- Git

### Setup

1. Clone the repository
   ```bash
   git clone https://github.com/samadeep/samadeep.github.io.git
   cd samadeep.github.io
   ```

2. Install dependencies
   ```bash
   bundle install
   ```

3. Start development server
   ```bash
   bundle exec jekyll serve
   ```

4. Visit `http://localhost:4000`

## Creating Posts

### Quick Start

Create a new post with the automated script:

```bash
# Basic post
ruby scripts/new_post.rb --title "Your Post Title"

# Technical post with categories and tags
ruby scripts/new_post.rb \
  --title "Advanced System Design" \
  --categories "System Design,Architecture" \
  --tags "scalability,microservices,patterns" \
  --template technical
```

### Available Templates

- **default**: Standard blog post
- **technical**: Technical deep-dive with diagram support
- **tutorial**: Step-by-step guide format
- **review**: Product or service review

### Script Options

| Option | Description |
|--------|-------------|
| `--title, -t` | Post title (required) |
| `--categories, -c` | Categories (comma-separated) |
| `--tags, -g` | Tags (comma-separated) |
| `--template, -T` | Template type |
| `--author, -a` | Author name |
| `--help, -h` | Show help |

For detailed instructions, see [POST_CREATION_GUIDE.md](POST_CREATION_GUIDE.md).

## Diagrams

### Mermaid

```markdown
{% mermaid %}
graph TD
    A[Start] --> B[Process]
    B --> C[Decision]
    C -->|Yes| D[Action]
    C -->|No| E[End]
    D --> E
{% endmermaid %}
```

### PlantUML

```markdown
{% plantuml %}
@startuml
Alice -> Bob: Authentication Request
Bob -> Alice: Authentication Response
@enduml
{% endplantuml %}
```

### Supported Types

**Mermaid**: Flowcharts, sequence diagrams, Gantt charts, class diagrams, state diagrams, user journey maps, git graphs

**PlantUML**: Class diagrams, use case diagrams, sequence diagrams, activity diagrams, component diagrams, state diagrams

## Configuration

### Site Settings

Edit `_config.yml`:

```yaml
title: Your Blog Name
tagline: Your Tagline
description: Blog description
url: https://yourdomain.com
author: Your Name
email: your@email.com

# Social links
github:
  username: yourusername
twitter:
  username: yourusername
```

### Feature Toggles

```yaml
features:
  search: true
  toc: true
  code_copy: true
  math: true
  mermaid: true
  plantuml: true
```

## Math Support

Write mathematical expressions using LaTeX:

```markdown
Inline: $E = mc^2$

Block:
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

## Deployment

### GitHub Pages

1. Push to your GitHub repository
2. Enable GitHub Pages in repository settings
3. Select source branch (main)
4. Site available at `https://username.github.io`

### Netlify

1. Connect GitHub repository to Netlify
2. Build command: `bundle exec jekyll build`
3. Publish directory: `_site`
4. Auto-deploy on push

### Manual Build

```bash
bundle exec jekyll build
# Deploy _site directory to hosting provider
```

## Customization

### Custom Styles

Add custom CSS in `assets/css/custom.css`:

```css
.custom-class {
  color: #your-color;
}
```

### Custom Scripts

Add JavaScript in `assets/js/custom.js`:

```javascript
document.addEventListener('DOMContentLoaded', function() {
  // Your code here
});
```

## Analytics

### Google Analytics

Add to `_config.yml`:

```yaml
google_analytics:
  id: GA_MEASUREMENT_ID
```

### Search Console

```yaml
google_site_verification: verification_code
```

## Diagram Integration

This blog uses **Kroki** (https://kroki.io) for diagram rendering:

- No local dependencies required
- Reliable cloud-based processing
- Supports 20+ diagram types
- Responsive SVG output
- No encoding issues

### Usage Examples

```liquid
{% plantuml %}
@startuml
User -> System: Request
System -> Database: Query
Database -> System: Result
System -> User: Response
@enduml
{% endplantuml %}
```

```liquid
{% mermaid %}
graph LR
    A[Input] --> B[Process]
    B --> C[Output]
{% endmermaid %}
```

## Troubleshooting

### Build Issues

```bash
bundle install --force
bundle exec jekyll clean
bundle exec jekyll build
```

### Diagram Problems

- Check syntax in diagram code
- Verify internet connection for PlantUML
- Check browser console for errors

### Performance Issues

- Optimize images
- Enable caching
- Use CDN for assets

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- Email: samadeepsengupta@gmail.com
- Twitter: @samadeepviews
- LinkedIn: linkedin.com/in/samadeep
- GitHub Issues: github.com/samadeep/samadeep.github.io/issues

## Acknowledgments

- [Jekyll](https://jekyllrb.com/) - Static site generator
- [Chirpy Theme](https://github.com/cotes2020/jekyll-theme-chirpy) - Base theme
- [Mermaid](https://mermaid-js.github.io/) - Diagram generation
- [PlantUML](https://plantuml.com/) - UML diagrams
- [Kroki](https://kroki.io) - Diagram rendering service
- [MathJax](https://www.mathjax.org/) - Mathematical notation

---

Built by [Samadeep Sengupta](https://github.com/samadeep)
