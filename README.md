# 🚀 Samadeep's Amazing Tech Blog

A modern, feature-rich Jekyll blog with interactive diagrams, easy content management, and professional design.

## ✨ Features

### 🎨 Modern Design
- Clean, responsive design with dark/light mode support
- Professional typography and spacing
- Mobile-first approach
- Smooth animations and transitions

### 📊 Interactive Diagrams
- **Mermaid Support**: Create flowcharts, sequence diagrams, Gantt charts, and more
- **PlantUML Support**: Generate UML diagrams, system architecture diagrams
- **Click to expand**: Full-screen diagram viewing
- **Export Options**: Download diagrams as SVG/PNG
- **Copy to Clipboard**: Easy sharing of diagram code

### 🛠️ Easy Content Management
- **Automated Post Generation**: Ruby script to create new posts from templates
- **Multiple Templates**: Technical, Tutorial, Review, and Default templates
- **Category & Tag Management**: Automatic organization
- **SEO Optimization**: Built-in SEO tags and meta descriptions

### 🔧 Developer Features
- **Syntax Highlighting**: Beautiful code blocks with copy functionality
- **Math Support**: LaTeX math expressions with MathJax
- **Table of Contents**: Auto-generated TOC for long posts
- **Reading Time**: Estimated reading time calculation
- **Social Sharing**: Built-in sharing buttons

### 🚀 Performance & SEO
- **Fast Loading**: Optimized assets and lazy loading
- **SEO Friendly**: Schema markup, OpenGraph tags
- **PWA Support**: Progressive Web App capabilities
- **RSS Feed**: Automatic feed generation
- **Sitemap**: XML sitemap for search engines

## 🛠️ Installation & Setup

### Prerequisites
- Ruby (>= 2.7)
- Jekyll (>= 4.0)
- Node.js (for asset compilation)
- Git

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/samadeep/samadeep.github.io.git
   cd samadeep.github.io
   ```

2. **Install dependencies**
   ```bash
   bundle install
   ```

3. **Install Node.js dependencies** (if needed)
   ```bash
   npm install
   ```

4. **Start the development server**
   ```bash
   bundle exec jekyll serve
   ```

5. **Open in browser**
   ```
   http://localhost:4000
   ```

## 📝 Creating New Posts

### 🚀 Quick Start (Enhanced Script)

Create a new post with automatic India timezone timestamps:

```bash
# Basic post
ruby scripts/new_post.rb --title "My Amazing Post"

# Technical post with full options
ruby scripts/new_post.rb \
  --title "Advanced System Design Patterns" \
  --categories "System Design,Architecture" \
  --tags "patterns,scalability,microservices" \
  --template technical
```

**✨ Features:**
- ✅ **Automatic India timezone timestamps** (IST +0530)
- ✅ **SEO-friendly URL slugs**
- ✅ **Auto-generated descriptions**
- ✅ **Multiple templates** (default, technical, tutorial, review)
- ✅ **Automatic file opening** in your editor

### 📖 Complete Guide
👉 **For detailed instructions, examples, and troubleshooting, see [POST_CREATION_GUIDE.md](POST_CREATION_GUIDE.md)**

### Available Templates

- **default**: Basic blog post template
- **technical**: Technical deep-dive with diagrams and code
- **tutorial**: Step-by-step tutorial with checkboxes
- **review**: Product/service review template

### Script Options
- `--title` or `-t`: Post title (required)
- `--categories` or `-c`: Categories (comma-separated)
- `--tags` or `-g`: Tags (comma-separated)
- `--template` or `-T`: Template type
- `--author` or `-a`: Author name
- `--help` or `-h`: Show help

## 🎨 Using Diagrams

### Mermaid Diagrams

```markdown
{% mermaid %}
graph TB
    A[Start] --> B[Process]
    B --> C[Decision]
    C -->|Yes| D[Action 1]
    C -->|No| E[Action 2]
    D --> F[End]
    E --> F
{% endmermaid %}
```

### PlantUML Diagrams

```markdown
{% plantuml %}
@startuml
Alice -> Bob: Hello Bob
Bob -> Alice: Hello Alice
@enduml
{% endplantuml %}
```

### Supported Diagram Types

#### Mermaid
- Flowcharts
- Sequence Diagrams
- Gantt Charts
- Class Diagrams
- State Diagrams
- User Journey Maps
- Git Graphs

#### PlantUML
- Class Diagrams
- Use Case Diagrams
- Sequence Diagrams
- Activity Diagrams
- Component Diagrams
- State Diagrams
- Object Diagrams

## 📊 Math Support

Write mathematical expressions using LaTeX syntax:

```markdown
Inline math: $E = mc^2$

Block math:
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$
```

## 🎯 Configuration

### Site Configuration

Edit `_config.yml` to customize:

```yaml
title: Blog Name
tagline: Your Tagline
description: Your blog description
url: https://yourdomain.com
author: Your Name
email: your@email.com

# Social links
github:
  username: yourusername
twitter:
  username: yourusername
```

### Features Toggle

Enable/disable features in `_config.yml`:

```yaml
features:
  search: true
  toc: true
  code_copy: true
  math: true
  mermaid: true
  plantuml: true
  chart: true
```

## 🚀 Deployment

### GitHub Pages

1. Push to your GitHub repository
2. Enable GitHub Pages in repository settings
3. Select source branch (usually `main`)
4. Your site will be available at `https://username.github.io`

### Manual Deployment

```bash
# Build the site
bundle exec jekyll build

# Deploy the _site directory to your hosting provider
```

### Netlify

1. Connect your GitHub repository to Netlify
2. Set build command: `bundle exec jekyll build`
3. Set publish directory: `_site`
4. Deploy automatically on push

## 📱 PWA Features

The blog includes Progressive Web App features:

- **Offline Reading**: Cache posts for offline access
- **Install Prompt**: Add to home screen on mobile
- **Service Worker**: Background sync and caching
- **App Manifest**: Native app-like experience

## 🔧 Customization

### Custom CSS

Add custom styles in `assets/css/custom.css`:

```css
/* Custom styles */
.custom-class {
  color: #your-color;
}
```

### Custom JavaScript

Add custom scripts in `assets/js/custom.js`:

```javascript
// Custom JavaScript
document.addEventListener('DOMContentLoaded', function() {
  // Your custom code
});
```

### Custom Layouts

Create custom layouts in `_layouts/`:

```html
---
layout: default
---

<div class="custom-layout">
  {{ content }}
</div>
```

## 📈 Analytics & Monitoring

### Google Analytics

Add your Google Analytics ID in `_config.yml`:

```yaml
google_analytics:
  id: GA_MEASUREMENT_ID
```

### Search Console

Add your Google Search Console verification:

```yaml
google_site_verification: your_verification_code
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📚 Resources

- [Jekyll Documentation](https://jekyllrb.com/docs/)
- [Mermaid Documentation](https://mermaid-js.github.io/mermaid/)
- [PlantUML Documentation](https://plantuml.com/)
- [Markdown Guide](https://www.markdownguide.org/)

## 🐛 Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   bundle install --force
   bundle exec jekyll clean
   bundle exec jekyll build
   ```

2. **Diagram Not Rendering**
   - Check syntax in diagram code
   - Verify internet connection (for PlantUML)
   - Check browser console for errors

3. **Slow Loading**
   - Optimize images
   - Enable caching
   - Use CDN for assets

## 📧 Support

Need help? 

- 📧 Email: [samadeepsengupta@gmail.com](mailto:samadeepsengupta@gmail.com)
- 🐦 Twitter: [@samadeepviews](https://twitter.com/samadeepviews)
- 💼 LinkedIn: [samadeep](https://linkedin.com/in/samadeep)
- 🐙 GitHub: [Issues](https://github.com/samadeep/samadeep.github.io/issues)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Jekyll](https://jekyllrb.com/) - Static site generator
- [Chirpy Theme](https://github.com/cotes2020/jekyll-theme-chirpy) - Base theme
- [Mermaid](https://mermaid-js.github.io/) - Diagram generation
- [PlantUML](https://plantuml.com/) - UML diagrams
- [MathJax](https://www.mathjax.org/) - Math rendering

## Diagrams Support

This blog uses **Kroki** (https://kroki.io) for embedding various diagram types with reliable cloud-based rendering - no local dependencies or encoding issues.

### PlantUML Diagrams
```liquid
{% raw %}
{% plantuml %}
@startuml
Alice -> Bob: Hello
Bob -> Alice: Hi there
@enduml
{% endplantuml %}
{% endraw %}
```

### Mermaid Diagrams
```liquid
{% raw %}
{% mermaid %}
graph TD
    A[Start] --> B[Process]
    B --> C[End]
{% endmermaid %}
{% endraw %}
```

### Other Supported Types
- `{% graphviz %}` - DOT graphs and network diagrams
- `{% svgbob %}` - ASCII art converted to SVG

**Benefits of Kroki:**
- ✅ No local installations required
- ✅ Reliable encoding (no "deflate data" errors)
- ✅ Fast cloud-based rendering
- ✅ Supports 20+ diagram types
- ✅ Responsive SVG output

See [Kroki.io](https://kroki.io) for the complete list of supported diagram formats.

---

Built with ❤️ by [Samadeep Sengupta](https://github.com/samadeep)
