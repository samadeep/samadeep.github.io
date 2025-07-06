# 📝 Complete Guide to Creating New Blog Posts

[![Ruby](https://img.shields.io/badge/Ruby-3.0%2B-red.svg)](https://www.ruby-lang.org)
[![Jekyll](https://img.shields.io/badge/Jekyll-4.0%2B-red.svg)](https://jekyllrb.com)
[![Timezone](https://img.shields.io/badge/Timezone-IST%20(UTC%2B5%3A30)-blue.svg)](https://www.timeanddate.com/time/zones/ist)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

This comprehensive guide will walk you through the entire process of creating new blog posts using the enhanced Ruby script that automatically generates current India timezone timestamps.

## 📚 Table of Contents

<!-- TOC -->
- [📝 Complete Guide to Creating New Blog Posts](#-complete-guide-to-creating-new-blog-posts)
  - [📚 Table of Contents](#-table-of-contents)
  - [⚡ TL;DR - Quick Reference](#-tldr---quick-reference)
  - [🚀 Quick Start](#-quick-start)
    - [Basic Post Creation](#basic-post-creation)
    - [Technical Post with Full Options](#technical-post-with-full-options)
  - [📋 Script Options](#-script-options)
    - [Required Options](#required-options)
    - [Optional Options](#optional-options)
  - [🎯 Available Templates](#-available-templates)
    - [1. Default Template](#1-default-template)
    - [2. Technical Template](#2-technical-template)
    - [3. Tutorial Template](#3-tutorial-template)
    - [4. Review Template](#4-review-template)
  - [🕐 Automatic Timestamp Generation](#-automatic-timestamp-generation)
    - [India Timezone Support](#india-timezone-support)
    - [Generated Front Matter](#generated-front-matter)
  - [📝 Step-by-Step Examples](#-step-by-step-examples)
    - [Example 1: Algorithm Deep Dive](#example-1-algorithm-deep-dive)
    - [Example 2: Tutorial Series](#example-2-tutorial-series)
    - [Example 3: Technology Review](#example-3-technology-review)
  - [🎨 Advanced Features](#-advanced-features)
    - [Automatic File Opening](#automatic-file-opening)
    - [URL Slug Generation](#url-slug-generation)
    - [Automatic Description Generation](#automatic-description-generation)
  - [🏗️ Template Structures](#️-template-structures)
    - [Technical Template Includes](#technical-template-includes)
    - [Tutorial Template Includes](#tutorial-template-includes)
    - [Review Template Includes](#review-template-includes)
  - [🔧 Customization](#-customization)
    - [Adding Custom Templates](#adding-custom-templates)
    - [Available Placeholders](#available-placeholders)
  - [🚨 Common Issues & Solutions](#-common-issues--solutions)
    - [Issue: "Post already exists"](#issue-post-already-exists)
    - [Issue: "Ruby script not found"](#issue-ruby-script-not-found)
    - [Issue: "Template not found"](#issue-template-not-found)
  - [🎯 Best Practices](#-best-practices)
    - [1. Use Descriptive Titles](#1-use-descriptive-titles)
    - [2. Choose Appropriate Categories](#2-choose-appropriate-categories)
    - [3. Use Relevant Tags](#3-use-relevant-tags)
    - [4. Select the Right Template](#4-select-the-right-template)
  - [📊 Post Organization](#-post-organization)
    - [Category Structure](#category-structure)
    - [Tag Strategy](#tag-strategy)
  - [🔄 Workflow Example](#-workflow-example)
    - [Complete Blog Post Creation Workflow](#complete-blog-post-creation-workflow)
  - [🛠️ Troubleshooting](#️-troubleshooting)
    - [Script Permission Issues](#script-permission-issues)
    - [Date/Time Issues](#datetime-issues)
    - [Template Issues](#template-issues)
  - [📚 Additional Resources](#-additional-resources)
<!-- /TOC -->

---

## ⚡ TL;DR - Quick Reference

> **Need to create a post right now?** Use this:

```bash
# Basic post
ruby scripts/new_post.rb --title "My New Post"

# Technical post with categories and tags
ruby scripts/new_post.rb \
  --title "Advanced System Design" \
  --template technical \
  --categories "System Design,Architecture" \
  --tags "scalability,microservices,architecture"
```

**✨ What you get:**
- ✅ Automatic India timezone timestamp
- ✅ SEO-friendly filename
- ✅ Auto-generated description
- ✅ Opens in your editor automatically

---

## 🚀 Quick Start

### Basic Post Creation
```bash
ruby scripts/new_post.rb --title "My New Post"
```

### Technical Post with Full Options
```bash
ruby scripts/new_post.rb \
  --title "Advanced System Design Patterns" \
  --categories "System Design,Architecture" \
  --tags "patterns,scalability,microservices" \
  --template technical \
  --author "Your Name"
```

## 📋 Script Options

### 🔧 Command Reference Table

| Option | Short | Description | Example | Required |
|--------|-------|-------------|---------|----------|
| `--title` | `-t` | Post title | `--title "My Post"` | ✅ **Yes** |
| `--categories` | `-c` | Categories (comma-separated) | `--categories "Tech,Web"` | ❌ No |
| `--tags` | `-g` | Tags (comma-separated) | `--tags "react,nodejs"` | ❌ No |
| `--template` | `-T` | Template type | `--template technical` | ❌ No |
| `--author` | `-a` | Author name | `--author "John Doe"` | ❌ No |
| `--help` | `-h` | Show help message | `--help` | ❌ No |

### 💡 Default Values
- **Author**: "Samadeep Sengupta"
- **Template**: "default"
- **Categories**: Empty array `[]`
- **Tags**: Empty array `[]`
- **Timezone**: India Standard Time (IST +0530)

## 🎯 Available Templates

### 📊 Template Comparison Table

| Template | Use Case | Includes | Best For |
|----------|----------|----------|----------|
| **🔷 Default** | General posts | Basic structure, intro, conclusion | Blog posts, thoughts, opinions |
| **🔧 Technical** | Deep technical content | Diagrams, code blocks, architecture | Algorithms, system design, APIs |
| **📚 Tutorial** | Step-by-step guides | Prerequisites, steps, examples | How-to guides, learning paths |
| **⭐ Review** | Product analysis | Pros/cons, ratings, comparisons | Tool reviews, technology comparisons |

### 1. 🔷 Default Template
> **Perfect for:** General blog posts, thoughts, and opinions

```bash
ruby scripts/new_post.rb --title "My Thoughts on AI" --template default
```

**📝 Structure:**
- Introduction
- Main content sections
- Conclusion
- Social links

---

### 2. 🔧 Technical Template
> **Perfect for:** Deep technical content, algorithms, system design

```bash
ruby scripts/new_post.rb \
  --title "Building Scalable Microservices" \
  --template technical \
  --categories "System Design,Backend" \
  --tags "microservices,architecture,scalability"
```

**🛠️ Structure:**
- Overview & problem statement
- Solution architecture with diagrams
- Implementation details with code
- Performance analysis & benchmarks
- Testing & deployment sections

---

### 3. 📚 Tutorial Template
> **Perfect for:** Step-by-step learning guides and how-to content

```bash
ruby scripts/new_post.rb \
  --title "React Hooks Complete Guide" \
  --template tutorial \
  --categories "Frontend,React" \
  --tags "react,hooks,javascript,tutorial"
```

**📖 Structure:**
- Prerequisites checklist
- Step-by-step instructions
- Code examples for each step
- Troubleshooting section
- Next steps & resources

---

### 4. ⭐ Review Template
> **Perfect for:** Product analysis, technology comparisons, reviews

```bash
ruby scripts/new_post.rb \
  --title "AWS Lambda vs Azure Functions" \
  --template review \
  --categories "Cloud,Review" \
  --tags "aws,azure,serverless,comparison"
```

**📊 Structure:**
- Product overview
- Feature comparison table
- Pros and cons analysis
- Performance benchmarks
- Final recommendation

## 🕐 Automatic Timestamp Generation

### India Timezone Support
The script automatically generates timestamps in India Standard Time (IST = UTC+5:30):

**Example Output:**
```
Created new post: _posts/2025-07-06-my-amazing-post.md
Title: My Amazing Post
Date: 2025-07-06 17:49:46 +0530
Categories: System Design, Architecture
Tags: patterns, scalability, microservices
```

### Generated Front Matter
```yaml
---
layout: post
title: "My Amazing Post"
date: 2025-07-06 17:49:46 +0530
categories: ["System Design", "Architecture"]
tags: ["patterns", "scalability", "microservices"]
author: Samadeep Sengupta
description: "A comprehensive guide to my amazing post..."
---
```

## 📝 Step-by-Step Examples

### Example 1: Algorithm Deep Dive
```bash
ruby scripts/new_post.rb \
  --title "Understanding Binary Search Trees" \
  --template technical \
  --categories "Algorithms,Data Structures" \
  --tags "binary-tree,algorithms,complexity-analysis,search" \
  --author "Samadeep Sengupta"
```

**Results in:**
- File: `_posts/2025-07-06-understanding-binary-search-trees.md`
- Timestamp: Current India time
- Template: Technical with code blocks, diagrams, complexity analysis

### Example 2: Tutorial Series
```bash
ruby scripts/new_post.rb \
  --title "Node.js REST API Tutorial Part 1" \
  --template tutorial \
  --categories "Tutorial,Backend,Node.js" \
  --tags "nodejs,rest-api,express,tutorial,backend"
```

**Results in:**
- File: `_posts/2025-07-06-nodejs-rest-api-tutorial-part-1.md`
- Template: Tutorial with step-by-step structure
- Prerequisites section, code examples, checkboxes

### Example 3: Technology Review
```bash
ruby scripts/new_post.rb \
  --title "Docker vs Podman: Container Runtime Comparison" \
  --template review \
  --categories "DevOps,Review,Containers" \
  --tags "docker,podman,containers,comparison,devops"
```

**Results in:**
- File: `_posts/2025-07-06-docker-vs-podman-container-runtime-comparison.md`
- Template: Review with pros/cons, ratings, comparison tables

## 🎨 Advanced Features

### Automatic File Opening
If you have `$EDITOR` environment variable set, the script will automatically open the new post in your editor:

```bash
# Set your preferred editor
export EDITOR="code"  # VS Code
export EDITOR="vim"   # Vim
export EDITOR="nano"  # Nano

# Create post (will auto-open in your editor)
ruby scripts/new_post.rb --title "My New Post"
```

### URL Slug Generation
The script automatically creates SEO-friendly URLs:

**Examples:**
- Title: "Understanding Machine Learning Algorithms"
- Slug: `understanding-machine-learning-algorithms`
- URL: `/posts/understanding-machine-learning-algorithms/`

### Automatic Description Generation
If you don't provide a description, the script generates one:
```
Description: "A comprehensive guide to [your title]. Learn about best practices, implementation details, and real-world examples."
```

## 🏗️ Template Structures

### Technical Template Includes:
- Overview section
- Problem statement
- Solution architecture with diagrams
- Implementation details with code
- Performance analysis
- Testing sections
- Deployment configuration

### Tutorial Template Includes:
- Prerequisites checklist
- Step-by-step instructions
- Code examples for each step
- Troubleshooting section
- Next steps

### Review Template Includes:
- Product overview
- Pros and cons
- Feature comparison
- Performance benchmarks
- Recommendation

## 🔧 Customization

### Adding Custom Templates
1. Create a new template file in `_templates/`:
   ```bash
   touch _templates/my-custom-template.md
   ```

2. Add template content with placeholders:
   ```markdown
   ---
   layout: post
   title: "{{TITLE}}"
   date: {{DATE}}
   categories: {{CATEGORIES}}
   tags: {{TAGS}}
   author: {{AUTHOR}}
   description: "{{DESCRIPTION}}"
   ---
   
   # {{TITLE}}
   
   Your custom template content here...
   ```

3. Use your custom template:
   ```bash
   ruby scripts/new_post.rb \
     --title "My Post" \
     --template my-custom-template
   ```

### Available Placeholders
- `{{TITLE}}`: Title of the post
- `{{DATE}}`: Current India timezone timestamp
- `{{CATEGORIES}}`: Categories array
- `{{TAGS}}`: Tags array
- `{{AUTHOR}}`: Author name
- `{{DESCRIPTION}}`: Auto-generated description
- `{{SLUG}}`: URL-friendly slug

## 🚨 Common Issues & Solutions

### Issue: "Post already exists"
**Solution:** The script prevents overwriting existing posts
```bash
# Check if file exists
ls _posts/2025-07-06-my-post.md

# Either delete the existing file or use a different title
rm _posts/2025-07-06-my-post.md
```

### Issue: "Ruby script not found"
**Solution:** Make sure you're in the correct directory
```bash
# Navigate to blog root
cd /path/to/your/blog

# Verify script exists
ls scripts/new_post.rb

# Run script
ruby scripts/new_post.rb --title "My Post"
```

### Issue: "Template not found"
**Solution:** Check available templates
```bash
# List available templates
ls _templates/

# Use existing template
ruby scripts/new_post.rb --title "My Post" --template technical
```

## 🎯 Best Practices

### 📋 Quick Reference Cheat Sheet

<table>
<tr>
<td>

**🎯 Good Practices**
```bash
# ✅ Descriptive titles
--title "Building Scalable REST APIs with Node.js"

# ✅ Specific categories
--categories "Backend,Node.js,API Design"

# ✅ Relevant tags (5-8 tags)
--tags "nodejs,express,rest-api,backend"

# ✅ Right template
--template technical
```

</td>
<td>

**❌ Things to Avoid**
```bash
# ❌ Generic titles
--title "Node.js Tutorial"

# ❌ Too broad categories
--categories "Programming"

# ❌ Too many irrelevant tags
--tags "code,programming,tech,computer,software"

# ❌ Wrong template
--template review  # for a tutorial
```

</td>
</tr>
</table>

### 1. 🎯 Use Descriptive Titles

> **Goal:** Make your title searchable and informative

| ✅ **Good Examples** | ❌ **Avoid** |
|----------------------|--------------|
| "Building Scalable REST APIs with Node.js and Express" | "Node.js Tutorial" |
| "React Hooks: Complete Guide with Real-World Examples" | "React Guide" |
| "Docker vs Kubernetes: When to Use Each" | "Container Comparison" |

### 2. 🏷️ Choose Appropriate Categories

> **Goal:** Create a logical hierarchy for navigation

| ✅ **Good Examples** | ❌ **Avoid** |
|----------------------|--------------|
| `"Backend,Node.js,API Design"` | `"Programming"` |
| `"Frontend,React,Performance"` | `"Web Development"` |
| `"DevOps,Docker,Kubernetes"` | `"Technology"` |

### 3. 🏷️ Use Relevant Tags

> **Goal:** 5-8 specific, searchable tags

| ✅ **Good Examples** | ❌ **Avoid** |
|----------------------|--------------|
| `"nodejs,express,rest-api,backend,tutorial,authentication"` | `"code,programming,tech,computer,software"` |
| `"react,hooks,javascript,frontend,performance"` | `"web,development,coding,tutorial,guide"` |

### 4. 📝 Select the Right Template

> **Goal:** Match content type with appropriate structure

| Content Type | Template | Features |
|--------------|----------|----------|
| **Algorithm explanations** | `technical` | Code blocks, complexity analysis, diagrams |
| **Step-by-step guides** | `tutorial` | Prerequisites, numbered steps, examples |
| **Product analysis** | `review` | Pros/cons, ratings, comparisons |
| **General thoughts** | `default` | Simple structure, flexible content |

## 📊 Post Organization

### Category Structure
```
System Design/
├── Architecture
├── Scalability
├── Database Design
└── Performance

Programming/
├── Algorithms
├── Data Structures
├── Languages
└── Best Practices

DevOps/
├── CI/CD
├── Containers
├── Monitoring
└── Infrastructure
```

### Tag Strategy
- **Primary tags**: Main topic (nodejs, react, python)
- **Secondary tags**: Subtopics (express, hooks, django)
- **Tertiary tags**: Context (tutorial, advanced, beginner)

## 🔄 Workflow Example

### Complete Blog Post Creation Workflow
1. **Plan your post**
   - Define topic and target audience
   - Choose appropriate template
   - List key points to cover

2. **Create the post**
   ```bash
   ruby scripts/new_post.rb \
     --title "Advanced React Patterns for Large Applications" \
     --template technical \
     --categories "Frontend,React,Architecture" \
     --tags "react,patterns,architecture,advanced,hooks"
   ```

3. **Write content**
   - Follow the template structure
   - Add diagrams using Mermaid/PlantUML
   - Include code examples
   - Add screenshots if needed

4. **Review and publish**
   - Check for typos and grammar
   - Verify all links work
   - Test locally: `bundle exec jekyll serve`
   - Commit and push to GitHub

## 🛠️ Troubleshooting

### Script Permission Issues
```bash
# Make script executable
chmod +x scripts/new_post.rb

# Run with explicit ruby
ruby scripts/new_post.rb --title "My Post"
```

### Date/Time Issues
The script automatically handles India timezone. If you need a different timezone:
1. Edit `scripts/new_post.rb`
2. Change `"+05:30"` to your desired offset
3. Save and run

### Template Issues
```bash
# Check if template exists
ls _templates/technical.md

# Use default if template missing
ruby scripts/new_post.rb --title "My Post"  # Uses default template
```

## 📚 Additional Resources

- [Jekyll Documentation](https://jekyllrb.com/docs/)
- [Mermaid Syntax](https://mermaid-js.github.io/mermaid/)
- [PlantUML Guide](https://plantuml.com/guide)
- [Markdown Syntax](https://daringfireball.net/projects/markdown/syntax)

## 🚀 Quick Start Commands

### 📋 Common Command Patterns

<details>
<summary><b>📝 Blog Post Types</b></summary>

```bash
# Personal thoughts/opinions
ruby scripts/new_post.rb \
  --title "My Thoughts on Remote Work" \
  --template default \
  --categories "Opinion,Work" \
  --tags "remote-work,productivity,opinion"

# Technology review
ruby scripts/new_post.rb \
  --title "VS Code vs JetBrains: IDE Comparison 2024" \
  --template review \
  --categories "Tools,Review" \
  --tags "vscode,jetbrains,ide,comparison,productivity"

# Tutorial/How-to
ruby scripts/new_post.rb \
  --title "Building a RESTful API with Express.js" \
  --template tutorial \
  --categories "Tutorial,Backend" \
  --tags "nodejs,express,rest-api,tutorial,backend"

# Technical deep dive
ruby scripts/new_post.rb \
  --title "Understanding Database Indexing Strategies" \
  --template technical \
  --categories "Database,Performance" \
  --tags "database,indexing,performance,sql,optimization"
```

</details>

<details>
<summary><b>🎯 By Technology</b></summary>

```bash
# Frontend
ruby scripts/new_post.rb \
  --title "React Performance Optimization Techniques" \
  --template technical \
  --categories "Frontend,React" \
  --tags "react,performance,optimization,frontend"

# Backend
ruby scripts/new_post.rb \
  --title "Microservices Architecture Best Practices" \
  --template technical \
  --categories "Backend,Architecture" \
  --tags "microservices,architecture,scalability,backend"

# DevOps
ruby scripts/new_post.rb \
  --title "Docker Multi-Stage Builds Guide" \
  --template tutorial \
  --categories "DevOps,Docker" \
  --tags "docker,containers,devops,optimization"

# System Design
ruby scripts/new_post.rb \
  --title "Designing a Distributed Cache System" \
  --template technical \
  --categories "System Design,Architecture" \
  --tags "system-design,caching,distributed-systems,architecture"
```

</details>

<details>
<summary><b>📚 Series Posts</b></summary>

```bash
# Series Part 1
ruby scripts/new_post.rb \
  --title "Kubernetes Fundamentals Part 1: Core Concepts" \
  --template tutorial \
  --categories "DevOps,Kubernetes,Series" \
  --tags "kubernetes,devops,containers,series,fundamentals"

# Series Part 2
ruby scripts/new_post.rb \
  --title "Kubernetes Fundamentals Part 2: Deployments" \
  --template tutorial \
  --categories "DevOps,Kubernetes,Series" \
  --tags "kubernetes,devops,deployments,series,fundamentals"
```

</details>

### 🎨 Template Customization Quick Tips

> **Want to create your own template?**

```bash
# 1. Create template file
touch _templates/my-custom-template.md

# 2. Add content with placeholders
cat > _templates/my-custom-template.md << 'EOF'
---
layout: post
title: "{{TITLE}}"
date: {{DATE}}
categories: {{CATEGORIES}}
tags: {{TAGS}}
author: {{AUTHOR}}
description: "{{DESCRIPTION}}"
---

# {{TITLE}}

Your custom template content here...
EOF

# 3. Use your template
ruby scripts/new_post.rb \
  --title "My Custom Post" \
  --template my-custom-template
```

### 💡 Pro Tips

- **Set your editor**: `export EDITOR="code"` for auto-opening in VS Code
- **Use aliases**: Create shell aliases for common commands
- **Check templates**: `ls _templates/` to see available templates
- **Verify creation**: `ls -la _posts/` to see your new post

## ⚙️ Configuration & Customization

### 🎛️ Blog Settings

Your blog already has great defaults, but you can customize these settings in `_config.yml`:

```yaml
# Table of Contents (right sidebar)
toc: true  # Global TOC switch for posts

# Site Features
features:
  search: true      # Enable search
  toc: true         # Enable TOC
  code_copy: true   # Copy code button
  math: true        # Math expressions
  mermaid: true     # Mermaid diagrams
  plantuml: true    # PlantUML diagrams
  chart: true       # Chart.js support

# Blog Management
blog_management:
  auto_categories: true   # Auto-generate category pages
  auto_tags: true        # Auto-generate tag pages
  reading_time: true     # Show reading time
```

### 🎨 Right-Side Table of Contents

Your blog already has a **right-side TOC** enabled! Here's how it works:

- ✅ **Auto-generated** from your headings (`##`, `###`, etc.)
- ✅ **Sticky navigation** - follows scroll position
- ✅ **Click to jump** to any section
- ✅ **Responsive** - hides on mobile, shows on desktop

**To control TOC for specific posts:**

```yaml
# In post front matter
---
layout: post
title: "Your Post Title"
toc: true    # Show TOC for this post
# or
toc: false   # Hide TOC for this post
---
```

### 📝 Editor Integration

**VS Code Setup:**
```bash
# Set VS Code as default editor
export EDITOR="code"

# Add to your shell profile (~/.zshrc or ~/.bashrc)
echo 'export EDITOR="code"' >> ~/.zshrc
```

**Other Editors:**
```bash
# Vim
export EDITOR="vim"

# Nano
export EDITOR="nano"

# Sublime Text
export EDITOR="subl"

# Atom
export EDITOR="atom"
```

### 🔧 Custom Aliases

**Add these to your shell profile for faster post creation:**

```bash
# ~/.zshrc or ~/.bashrc

# Quick post creation
alias new-post='ruby scripts/new_post.rb --title'
alias new-tech='ruby scripts/new_post.rb --template technical --title'
alias new-tutorial='ruby scripts/new_post.rb --template tutorial --title'
alias new-review='ruby scripts/new_post.rb --template review --title'

# Blog management
alias blog-serve='bundle exec jekyll serve'
alias blog-build='bundle exec jekyll build'
alias blog-posts='ls -la _posts/'
alias blog-templates='ls -la _templates/'
```

**Usage after adding aliases:**
```bash
# Quick post creation
new-post "My New Post"

# Technical post
new-tech "Advanced System Design" --categories "System Design,Architecture"

# Start local server
blog-serve

# List posts
blog-posts
```

### 📊 Performance Optimization

**Your blog is already optimized with:**
- ✅ **Compressed CSS/JS** - Faster loading
- ✅ **Image optimization** - Efficient image handling
- ✅ **PWA support** - Progressive Web App features
- ✅ **SEO optimization** - Search engine friendly

### 🎯 Content Organization Tips

**Directory Structure:**
```
your-blog/
├── _posts/           # Your blog posts
├── _templates/       # Post templates
├── _drafts/          # Draft posts (not published)
├── assets/
│   ├── img/          # Images
│   └── js/           # Custom JavaScript
├── _data/            # Site data files
└── _includes/        # Reusable includes
```

**Using Drafts:**
```bash
# Create a draft (won't be published)
ruby scripts/new_post.rb --title "My Draft Post"
mv _posts/YYYY-MM-DD-my-draft-post.md _drafts/

# Serve with drafts to preview
bundle exec jekyll serve --drafts
```

---

## 📞 Support & Contributing

### 🆘 Need Help?

- 📖 **Documentation**: Check the [main README](README.md)
- 🐛 **Bug Reports**: Create an issue in the repository
- 💡 **Feature Requests**: Open a discussion or issue
- 📧 **Direct Contact**: Reach out via [email](mailto:samadeepsengupta@gmail.com)

### 🤝 Contributing

Found an improvement or bug? Contributions are welcome!

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Test** thoroughly
5. **Submit** a pull request

---

**Happy Blogging!** 🚀

*For questions or issues, check the [main README](README.md) or create an issue in the repository.* 