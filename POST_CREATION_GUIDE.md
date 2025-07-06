# 📝 Complete Guide to Creating New Blog Posts

This guide will walk you through the entire process of creating new blog posts using the enhanced Ruby script that automatically generates current India timezone timestamps.

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

### Required Options
- `--title` or `-t`: Post title (required)

### Optional Options
- `--categories` or `-c`: Categories (comma-separated)
- `--tags` or `-g`: Tags (comma-separated)  
- `--author` or `-a`: Author name (defaults to "Samadeep Sengupta")
- `--template` or `-T`: Template type (default, technical, tutorial, review)
- `--help` or `-h`: Show help message

## 🎯 Available Templates

### 1. Default Template
Basic blog post structure
```bash
ruby scripts/new_post.rb --title "My Thoughts on AI" --template default
```

### 2. Technical Template
Advanced technical posts with diagrams, code examples, and system design
```bash
ruby scripts/new_post.rb \
  --title "Building Scalable Microservices" \
  --template technical \
  --categories "System Design,Backend" \
  --tags "microservices,architecture,scalability"
```

### 3. Tutorial Template
Step-by-step learning guides
```bash
ruby scripts/new_post.rb \
  --title "React Hooks Complete Guide" \
  --template tutorial \
  --categories "Frontend,React" \
  --tags "react,hooks,javascript,tutorial"
```

### 4. Review Template
Product, service, or technology reviews
```bash
ruby scripts/new_post.rb \
  --title "AWS Lambda vs Azure Functions" \
  --template review \
  --categories "Cloud,Review" \
  --tags "aws,azure,serverless,comparison"
```

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
- `{{TITLE}}`: Post title
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

### 1. Use Descriptive Titles
```bash
# Good
--title "Building Scalable REST APIs with Node.js and Express"

# Avoid
--title "Node.js Tutorial"
```

### 2. Choose Appropriate Categories
```bash
# Good: Specific and hierarchical
--categories "Backend,Node.js,API Design"

# Avoid: Too generic
--categories "Programming"
```

### 3. Use Relevant Tags
```bash
# Good: Specific and searchable
--tags "nodejs,express,rest-api,backend,tutorial,authentication"

# Avoid: Too many or irrelevant
--tags "code,programming,tech,computer,software"
```

### 4. Select the Right Template
- **Technical**: Deep dives, algorithms, system design
- **Tutorial**: Step-by-step guides, how-to posts
- **Review**: Product comparisons, technology reviews
- **Default**: General thoughts, opinion pieces

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

---

**Happy Blogging!** 🚀

*For questions or issues, check the [main README](README.md) or create an issue in the repository.* 