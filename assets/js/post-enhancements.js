/**
 * Enhanced Blog Post Functionality
 * Features: TOC Generation, Reading Progress, Scroll Spy, Back to Top, Reading Time
 */

class PostEnhancements {
  constructor() {
    this.toc = null;
    this.tocNav = null;
    this.progressBar = null;
    this.backToTopBtn = null;
    this.headings = [];
    this.currentActiveIndex = -1;
    
    this.init();
  }
  
  init() {
    // Wait for DOM to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }
  
  setup() {
    this.tocNav = document.getElementById('toc-nav');
    this.progressBar = document.querySelector('.reading-progress-fill');
    this.backToTopBtn = document.getElementById('back-to-top');
    
    if (this.tocNav) {
      this.generateTOC();
    }
    
    this.calculateReadingTime();
    this.setupScrollListeners();
    this.setupBackToTop();
    this.addCopyCodeButtons();
    this.enhanceImages();
  }
  
  /**
   * Generate Table of Contents from headings
   */
  generateTOC() {
    const content = document.querySelector('.post-content');
    if (!content) return;
    
    // Find all headings
    this.headings = Array.from(content.querySelectorAll('h1, h2, h3, h4, h5, h6'));
    
    if (this.headings.length === 0) {
      // Hide TOC if no headings found
      const tocSidebar = document.querySelector('.toc-sidebar');
      if (tocSidebar) tocSidebar.style.display = 'none';
      return;
    }
    
    // Add IDs to headings if they don't have them
    this.headings.forEach((heading, index) => {
      if (!heading.id) {
        heading.id = this.createSlug(heading.textContent) + '-' + index;
      }
      
      // Add anchor link functionality
      this.addAnchorLink(heading);
    });
    
    // Build TOC HTML
    const tocHTML = this.buildTOCHTML();
    this.tocNav.innerHTML = tocHTML;
    
    // Add click listeners to TOC links
    this.setupTOCClickListeners();
  }
  
  /**
   * Create URL-friendly slug from text
   */
  createSlug(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-')     // Replace spaces with dashes
      .replace(/-+/g, '-')      // Replace multiple dashes with single
      .trim();
  }
  
  /**
   * Add anchor link to headings
   */
  addAnchorLink(heading) {
    heading.style.cursor = 'pointer';
    heading.addEventListener('click', () => {
      const url = new URL(window.location);
      url.hash = '#' + heading.id;
      navigator.clipboard.writeText(url.toString()).then(() => {
        this.showToast('Link copied to clipboard!');
      });
    });
  }
  
  /**
   * Build TOC HTML structure
   */
  buildTOCHTML() {
    if (this.headings.length === 0) return '';
    
    let html = '<ul>';
    let currentLevel = parseInt(this.headings[0].tagName.charAt(1));
    
    this.headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName.charAt(1));
      const text = heading.textContent;
      const id = heading.id;
      
      if (level > currentLevel) {
        html += '<ul>'.repeat(level - currentLevel);
      } else if (level < currentLevel) {
        html += '</ul>'.repeat(currentLevel - level);
      }
      
      html += `
        <li>
          <a href="#${id}" class="toc-link toc-level-${level}" data-index="${index}">
            ${text}
          </a>
        </li>
      `;
      
      currentLevel = level;
    });
    
    html += '</ul>';
    return html;
  }
  
  /**
   * Setup click listeners for TOC links
   */
  setupTOCClickListeners() {
    const tocLinks = this.tocNav.querySelectorAll('.toc-link');
    
    tocLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
          this.smoothScrollTo(targetElement);
          
          // Update active state
          tocLinks.forEach(l => l.classList.remove('active'));
          link.classList.add('active');
        }
      });
    });
  }
  
  /**
   * Smooth scroll to element
   */
  smoothScrollTo(element) {
    const headerOffset = 100; // Account for fixed headers
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
    
    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  }
  
  /**
   * Calculate and display reading time
   */
  calculateReadingTime() {
    const readingTimeElement = document.getElementById('reading-time');
    if (!readingTimeElement) return;
    
    const content = document.querySelector('.post-content');
    if (!content) return;
    
    const text = content.textContent || content.innerText || '';
    const wordsPerMinute = 200;
    const wordCount = text.trim().split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / wordsPerMinute);
    
    readingTimeElement.textContent = `${readingTime} min`;
  }
  
  /**
   * Setup scroll listeners for reading progress and TOC highlighting
   */
  setupScrollListeners() {
    let ticking = false;
    
    const updateOnScroll = () => {
      if (this.progressBar) {
        this.updateReadingProgress();
      }
      
      if (this.tocNav && this.headings.length > 0) {
        this.updateActiveTOCItem();
      }
      
      this.updateBackToTopVisibility();
      ticking = false;
    };
    
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(updateOnScroll);
        ticking = true;
      }
    });
  }
  
  /**
   * Update reading progress bar
   */
  updateReadingProgress() {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    
    this.progressBar.style.width = Math.min(scrolled, 100) + '%';
  }
  
  /**
   * Update active TOC item based on scroll position
   */
  updateActiveTOCItem() {
    const scrollPosition = window.scrollY + 120; // Offset for better UX
    let activeIndex = -1;
    
    // Find the currently visible heading
    for (let i = this.headings.length - 1; i >= 0; i--) {
      const heading = this.headings[i];
      if (heading.offsetTop <= scrollPosition) {
        activeIndex = i;
        break;
      }
    }
    
    // Update active state if changed
    if (activeIndex !== this.currentActiveIndex) {
      this.currentActiveIndex = activeIndex;
      
      const tocLinks = this.tocNav.querySelectorAll('.toc-link');
      tocLinks.forEach(link => link.classList.remove('active'));
      
      if (activeIndex >= 0) {
        const activeLink = this.tocNav.querySelector(`[data-index="${activeIndex}"]`);
        if (activeLink) {
          activeLink.classList.add('active');
          
          // Scroll TOC to keep active item visible
          this.scrollTOCToActiveItem(activeLink);
        }
      }
    }
  }
  
  /**
   * Scroll TOC to keep active item visible
   */
  scrollTOCToActiveItem(activeLink) {
    const tocContainer = activeLink.closest('.toc-container');
    if (!tocContainer) return;
    
    const containerRect = tocContainer.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    
    if (linkRect.bottom > containerRect.bottom || linkRect.top < containerRect.top) {
      const scrollTop = activeLink.offsetTop - tocContainer.offsetTop - 
                       (tocContainer.clientHeight / 2) + (linkRect.height / 2);
      
      tocContainer.scrollTo({
        top: scrollTop,
        behavior: 'smooth'
      });
    }
  }
  
  /**
   * Setup back to top button
   */
  setupBackToTop() {
    if (!this.backToTopBtn) return;
    
    this.backToTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }
  
  /**
   * Update back to top button visibility
   */
  updateBackToTopVisibility() {
    if (!this.backToTopBtn) return;
    
    const scrollPosition = window.scrollY;
    const showThreshold = 300;
    
    if (scrollPosition > showThreshold) {
      this.backToTopBtn.classList.add('visible');
    } else {
      this.backToTopBtn.classList.remove('visible');
    }
  }
  
  /**
   * Add copy buttons to code blocks
   */
  addCopyCodeButtons() {
    const codeBlocks = document.querySelectorAll('pre code');
    
    codeBlocks.forEach((codeBlock, index) => {
      const pre = codeBlock.parentElement;
      const button = document.createElement('button');
      
      button.className = 'copy-code-btn';
      button.innerHTML = '📋 Copy';
      button.setAttribute('aria-label', 'Copy code');
      
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(codeBlock.textContent);
          button.innerHTML = '✅ Copied!';
          button.style.background = '#10b981';
          
          setTimeout(() => {
            button.innerHTML = '📋 Copy';
            button.style.background = '';
          }, 2000);
        } catch (err) {
          console.error('Failed to copy: ', err);
          button.innerHTML = '❌ Failed';
          setTimeout(() => {
            button.innerHTML = '📋 Copy';
          }, 2000);
        }
      });
      
      pre.style.position = 'relative';
      pre.appendChild(button);
    });
  }
  
  /**
   * Enhance images with lightbox functionality
   */
  enhanceImages() {
    const images = document.querySelectorAll('.post-content img');
    
    images.forEach(img => {
      // Add loading animation
      img.addEventListener('load', () => {
        img.style.opacity = '1';
      });
      
      // Add click to expand functionality
      img.addEventListener('click', () => {
        this.openImageLightbox(img);
      });
      
      img.style.cursor = 'zoom-in';
      img.style.transition = 'transform 0.3s ease';
      
      img.addEventListener('mouseenter', () => {
        img.style.transform = 'scale(1.02)';
      });
      
      img.addEventListener('mouseleave', () => {
        img.style.transform = 'scale(1)';
      });
    });
  }
  
  /**
   * Open image in lightbox
   */
  openImageLightbox(img) {
    const lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    lightbox.innerHTML = `
      <div class="lightbox-content">
        <img src="${img.src}" alt="${img.alt || ''}" />
        <button class="lightbox-close" aria-label="Close">✕</button>
      </div>
    `;
    
    document.body.appendChild(lightbox);
    
    // Close on click outside or close button
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.classList.contains('lightbox-close')) {
        document.body.removeChild(lightbox);
      }
    });
    
    // Close on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(lightbox);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
  }
  
  /**
   * Show toast notification
   */
  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }
}

// Additional CSS for enhanced functionality
const enhancementStyles = `
  /* Copy Code Button */
  .copy-code-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.3s ease;
    z-index: 10;
  }
  
  .copy-code-btn:hover {
    background: rgba(0, 0, 0, 0.9);
    transform: translateY(-1px);
  }
  
  /* Image Lightbox */
  .image-lightbox {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.3s ease;
  }
  
  .lightbox-content {
    position: relative;
    max-width: 90%;
    max-height: 90%;
  }
  
  .lightbox-content img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 8px;
  }
  
  .lightbox-close {
    position: absolute;
    top: -3rem;
    right: 0;
    background: none;
    border: none;
    color: white;
    font-size: 2rem;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 50%;
    transition: background 0.3s ease;
  }
  
  .lightbox-close:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  
  /* Toast Notification */
  .toast-notification {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%) translateY(100px);
    background: #1f2937;
    color: white;
    padding: 1rem 2rem;
    border-radius: 8px;
    font-size: 0.9rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: transform 0.3s ease, opacity 0.3s ease;
    opacity: 0;
    z-index: 10000;
  }
  
  .toast-notification.show {
    transform: translateX(-50%) translateY(0);
    opacity: 1;
  }
  
  /* Animation keyframes */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  /* Smooth scrolling for the entire page */
  html {
    scroll-behavior: smooth;
  }
  
  /* Enhanced heading hover effects */
  .post-content h2:hover,
  .post-content h3:hover,
  .post-content h4:hover {
    color: var(--primary-color, #667eea);
  }
  
  /* Enhanced table styling */
  .post-content table {
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    margin: 2rem 0;
  }
  
  .post-content table th {
    background: var(--primary-color, #667eea);
    color: white;
    font-weight: 600;
  }
  
  .post-content table tr:nth-child(even) {
    background: var(--table-stripe, #f9fafb);
  }
  
  /* Enhanced list styling */
  .post-content ul li::marker {
    color: var(--primary-color, #667eea);
  }
  
  .post-content ol li::marker {
    color: var(--primary-color, #667eea);
    font-weight: 600;
  }
  
  /* Focus styles for accessibility */
  .toc-link:focus,
  .back-to-top:focus,
  .copy-code-btn:focus {
    outline: 2px solid var(--primary-color, #667eea);
    outline-offset: 2px;
  }
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = enhancementStyles;
document.head.appendChild(styleSheet);

// Initialize enhancements
const postEnhancements = new PostEnhancements(); 