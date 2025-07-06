# Troubleshooting Guide

This guide covers common issues you might encounter with your Jekyll blog and how to resolve them.

## 🖼️ Image Issues

### Problem: "internal image does not exist" errors

**Symptoms:**
```
internal image /assets/img/avatar.jpg does not exist
internal image /assets/img/some-image.png does not exist
```

**Solutions:**

1. **Check if the image exists:**
   ```bash
   ls -la assets/img/
   ```

2. **Create missing images:**
   - Add the actual image file to `assets/img/`
   - Or remove the image reference from `_config.yml` or posts

3. **Update _config.yml:**
   ```yaml
   # Remove or update avatar reference
   avatar: /assets/img/avatar.svg  # or leave empty
   ```

4. **For post images:**
   - Remove the `image:` field from post front matter
   - Or add the actual image file

### Creating Placeholder Images

For avatars, you can create a simple SVG:
```svg
<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <circle cx="100" cy="100" r="100" fill="#007bff" />
  <text x="100" y="130" text-anchor="middle" font-size="80" fill="white">S</text>
</svg>
```

## 🚀 GitHub Actions Issues

### Problem: Deprecated actions warnings

**Symptoms:**
```
actions/upload-artifact: v3 is deprecated
```

**Solution:**
Update `.github/workflows/pages-deploy.yml`:
```yaml
- name: Upload site artifact
  uses: actions/upload-pages-artifact@v3  # Updated version
```

### Problem: HTML-Proofer failures

**Solutions:**

1. **Ignore specific checks:**
   ```yaml
   - name: Test site
     run: |
       bundle exec htmlproofer _site \
         --disable-external=true \
         --ignore-urls "/^http:\/\/127.0.0.1/,/^http:\/\/0.0.0.0/,/^http:\/\/localhost/" \
         --ignore-missing-alt \
         --ignore-empty-alt \
         --allow-missing-href
   ```

2. **Skip HTML-Proofer entirely (not recommended):**
   Comment out the "Test site" step in the workflow.

## 📦 Dependency Issues

### Problem: Missing gems

**Symptoms:**
```
Could not find gem 'jekyll-theme-chirpy'
```

**Solution:**
```bash
bundle install
```

### Problem: Bundle conflicts

**Solution:**
```bash
bundle update
# or for clean installation
rm Gemfile.lock
bundle install
```

## 🔧 Build Issues

### Problem: Jekyll build fails

**Symptoms:**
```
jekyll build failed
```

**Diagnostic steps:**
```bash
# Check detailed errors
bundle exec jekyll build --trace

# Check configuration
bundle exec jekyll doctor

# Clean build
bundle exec jekyll clean
bundle exec jekyll build
```

### Problem: Sass deprecation warnings

**Note:** These warnings are usually from the theme itself and can be ignored:
```
Sass @import rules are deprecated
```

**Long-term solution:**
Wait for theme updates or use a newer theme version.

## 🌐 Local Development Issues

### Problem: Server won't start

**Solutions:**

1. **Check if port is in use:**
   ```bash
   lsof -i :4000
   # Kill process if needed
   kill -9 [PID]
   ```

2. **Use different port:**
   ```bash
   bundle exec jekyll serve --port 4001
   ```

3. **Check file permissions:**
   ```bash
   chmod -R 755 .
   ```

### Problem: Changes not reflecting

**Solutions:**

1. **Force regeneration:**
   ```bash
   bundle exec jekyll serve --force_polling
   ```

2. **Clear cache:**
   ```bash
   bundle exec jekyll clean
   bundle exec jekyll serve
   ```

## 📝 Content Issues

### Problem: Posts not appearing

**Check list:**
- [ ] File is in `_posts/` directory
- [ ] Filename format: `YYYY-MM-DD-title.md`
- [ ] Front matter is properly formatted
- [ ] Date is not in the future

### Problem: Diagrams not rendering

**Solutions:**

1. **Check syntax:**
   ```markdown
   {% mermaid %}
   graph TB
     A --> B
   {% endmermaid %}
   ```

2. **Verify includes:**
   - Check if `{% include diagrams.html %}` is in layout
   - Verify JavaScript and CSS files exist

3. **Browser console:**
   - Open browser dev tools
   - Check for JavaScript errors

## 🔍 Debugging Tips

### Enable verbose logging
```bash
bundle exec jekyll serve --verbose
```

### Check configuration
```bash
bundle exec jekyll doctor
```

### Validate HTML
```bash
bundle exec htmlproofer _site --disable-external=true
```

### Test specific files
```bash
bundle exec jekyll build --watch --incremental
```

## 📞 Getting Help

If you're still experiencing issues:

1. **Check the logs** for detailed error messages
2. **Search existing issues** on the theme repository
3. **Create a minimal test case** to isolate the problem
4. **Provide full error messages** when asking for help

### Useful Resources

- [Jekyll Documentation](https://jekyllrb.com/docs/)
- [Chirpy Theme Documentation](https://github.com/cotes2020/jekyll-theme-chirpy)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [HTML-Proofer Options](https://github.com/gjtorikian/html-proofer)

## 🛠️ Quick Fixes

### Complete reset (nuclear option)
```bash
# Clean everything
rm -rf _site .jekyll-cache .sass-cache
bundle clean --force
bundle install
bundle exec jekyll build
```

### Check all dependencies
```bash
bundle exec gem dependency jekyll-theme-chirpy
```

### Update everything
```bash
bundle update --all
```

---

*This troubleshooting guide will be updated as new issues are discovered and resolved.* 