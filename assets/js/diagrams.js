// Enhanced Mermaid Diagram Support with Modern API
document.addEventListener('DOMContentLoaded', function() {
    // Wait for Mermaid to be available
    if (typeof mermaid === 'undefined') {
        console.warn('Mermaid library not loaded');
        return;
    }

    // Configure Mermaid for better performance
    mermaid.initialize({
        startOnLoad: false, // We'll handle initialization manually
        theme: 'default',
        securityLevel: 'loose',
        themeVariables: {
            primaryColor: '#667eea',
            primaryTextColor: '#1f2937',
            primaryBorderColor: '#667eea',
            lineColor: '#6b7280',
            secondaryColor: '#764ba2',
            tertiaryColor: '#f59e0b',
            background: '#ffffff',
            mainBkg: '#f9fafb',
            secondaryBkg: '#e5e7eb',
            tertiaryBkg: '#f3f4f6'
        },
        flowchart: {
            htmlLabels: true,
            curve: 'basis',
            padding: 10
        }
    });
    
    console.log('Mermaid initialized with config');

    // Enhanced PlantUML/Kroki diagram text color adaptation
    function adaptDiagramTextColors() {
        const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches ||
                          document.documentElement.getAttribute('data-mode') === 'dark';
        
        const textColor = isDarkMode ? '#f9fafb' : '#1f2937';
        const noteColor = isDarkMode ? '#e5e7eb' : '#374151';
        
        // Apply colors to all PlantUML/Kroki diagram text elements
        const diagrams = document.querySelectorAll('.plantuml-diagram, .kroki-diagram');
        diagrams.forEach(diagram => {
            const textElements = diagram.querySelectorAll('svg text');
            const noteElements = diagram.querySelectorAll('svg .note text, svg text[class*="note"]');
            
            textElements.forEach(text => {
                text.style.fill = textColor;
                text.style.fontWeight = '500';
            });
            
            noteElements.forEach(note => {
                note.style.fill = noteColor;
                note.style.fontSize = '12px';
            });
        });
        
        console.log(`Adapted diagram text colors for ${isDarkMode ? 'dark' : 'light'} mode`);
    }

    // Performance optimization: Lazy load diagrams
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const diagram = entry.target;
                
                // Check if diagram is already rendered
                if (diagram.getAttribute('data-rendered') === 'true') {
                    return;
                }
                
                // Mark as rendered to prevent duplicate processing
                diagram.setAttribute('data-rendered', 'true');
                
                // Render diagram based on type
                if (diagram.classList.contains('mermaid')) {
                    renderMermaidDiagram(diagram);
                } else if (diagram.classList.contains('plantuml') || diagram.classList.contains('kroki-diagram')) {
                    // Apply adaptive text colors after diagram loads
                    setTimeout(() => {
                        adaptDiagramTextColors();
                    }, 500);
                }
                
                // Stop observing this element
                observer.unobserve(diagram);
            }
        });
    }, {
        rootMargin: '50px 0px',
        threshold: 0.1
    });
    
    // Observe all diagrams for lazy loading
    document.querySelectorAll('.mermaid, .plantuml, .kroki-diagram').forEach(diagram => {
        observer.observe(diagram);
    });
    
    // Handle diagrams that are already in the DOM
    const existingDiagrams = document.querySelectorAll('.mermaid');
    console.log('Found existing diagrams:', existingDiagrams.length);
    
    existingDiagrams.forEach(diagram => {
        if (!diagram.getAttribute('data-rendered')) {
            renderMermaidDiagram(diagram);
        }
    });

    // Watch for theme changes and adapt diagram colors
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', adaptDiagramTextColors);
    
    // Watch for manual theme changes (if using data-mode attribute)
    const observer2 = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-mode') {
                adaptDiagramTextColors();
            }
        });
    });
    
    observer2.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-mode']
    });

    // Initial color adaptation
    setTimeout(adaptDiagramTextColors, 1000);
    
    // Performance monitoring
    let diagramsRendered = 0;
    
    async function renderMermaidDiagram(element) {
        try {
            console.log('Rendering Mermaid diagram:', element);
            
            // Get diagram content
            const diagramContent = element.textContent || element.innerHTML;
            
            if (!diagramContent.trim()) {
                console.warn('Empty Mermaid diagram content');
                return;
            }
            
            console.log('Diagram content:', diagramContent);
            
            // Create unique ID for the diagram
            const diagramId = 'mermaid-' + Math.random().toString(36).substr(2, 9);
            
            // Use modern Mermaid API (v10+)
            const renderStartTime = performance.now();
            
            try {
                // Parse and render the diagram using modern API
                const { svg } = await mermaid.render(diagramId, diagramContent);
                
                // Update the element with the rendered SVG
                element.innerHTML = svg;
                element.classList.add('mermaid-rendered');
                
                diagramsRendered++;
                
                // Add interactive features
                addInteractiveFeatures(element);
                
                // Log performance
                const renderTime = performance.now() - renderStartTime;
                console.log(`Mermaid diagram rendered in ${renderTime.toFixed(2)}ms`);
                
            } catch (parseError) {
                console.error('Mermaid parse error:', parseError);
                
                // Try alternative rendering method
                try {
                    // Fallback: use mermaid.run for automatic detection
                    await mermaid.run({
                        nodes: [element]
                    });
                    
                    diagramsRendered++;
                    addInteractiveFeatures(element);
                    
                } catch (fallbackError) {
                    console.error('Mermaid fallback error:', fallbackError);
                    element.innerHTML = `
                        <div class="diagram-error">
                            <h4>🚫 Mermaid Syntax Error</h4>
                            <p>Unable to render diagram. Please check the syntax:</p>
                            <pre><code>${diagramContent}</code></pre>
                            <p><strong>Error:</strong> ${parseError.message}</p>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('Mermaid initialization error:', error);
            element.innerHTML = `
                <div class="diagram-error">
                    <h4>🚫 Diagram Error</h4>
                    <p>Error rendering Mermaid diagram: ${error.message}</p>
                </div>
            `;
        }
    }
    
    function renderPlantUMLDiagram(element) {
        try {
            const plantUMLText = element.textContent;
            const encodedText = encodePlantUML(plantUMLText);
            
            // Use PlantUML server with performance optimization
            const plantUMLServer = 'https://www.plantuml.com/plantuml/svg/';
            const imageUrl = plantUMLServer + encodedText;
            
            // Create image element with lazy loading
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = 'PlantUML Diagram';
            img.className = 'plantuml-diagram';
            img.loading = 'lazy';
            
            // Add error handling
            img.onerror = function() {
                element.innerHTML = `
                    <div class="diagram-error">
                        <h4>🚫 PlantUML Error</h4>
                        <p>Error loading PlantUML diagram. Please check the syntax.</p>
                    </div>
                `;
            };
            
            img.onload = function() {
                diagramsRendered++;
                addInteractiveFeatures(element);
                adaptDiagramTextColors();
                console.log('PlantUML diagram loaded successfully');
            };
            
            element.innerHTML = '';
            element.appendChild(img);
        } catch (error) {
            console.error('PlantUML rendering error:', error);
            element.innerHTML = `
                <div class="diagram-error">
                    <h4>🚫 PlantUML Error</h4>
                    <p>Error rendering PlantUML diagram: ${error.message}</p>
                </div>
            `;
        }
    }
    
    function addInteractiveFeatures(element) {
        // Throttle the interactive features to prevent performance issues
        const throttledAddFeatures = throttle(() => {
            // Skip if already has wrapper
            if (element.closest('.diagram-wrapper')) {
                return;
            }
            
            const wrapper = document.createElement('div');
            wrapper.className = 'diagram-wrapper';
            
            // Wrap the diagram
            if (element.parentNode) {
                element.parentNode.insertBefore(wrapper, element);
                wrapper.appendChild(element);
                
                // Add controls
                const controls = document.createElement('div');
                controls.className = 'diagram-controls';
                
                // Fullscreen button
                const fullscreenBtn = document.createElement('button');
                fullscreenBtn.innerHTML = '🔍';
                fullscreenBtn.className = 'diagram-btn fullscreen-btn';
                fullscreenBtn.title = 'View Fullscreen';
                fullscreenBtn.addEventListener('click', () => showFullscreen(element));
                
                // Copy button
                const copyBtn = document.createElement('button');
                copyBtn.innerHTML = '📋';
                copyBtn.className = 'diagram-btn copy-btn';
                copyBtn.title = 'Copy Diagram';
                copyBtn.addEventListener('click', () => copyDiagram(element));
                
                // Download button
                const downloadBtn = document.createElement('button');
                downloadBtn.innerHTML = '💾';
                downloadBtn.className = 'diagram-btn download-btn';
                downloadBtn.title = 'Download as SVG';
                downloadBtn.addEventListener('click', () => downloadDiagram(element));
                
                controls.appendChild(fullscreenBtn);
                controls.appendChild(copyBtn);
                controls.appendChild(downloadBtn);
                
                wrapper.appendChild(controls);
            }
        }, 100);
        
        throttledAddFeatures();
    }
    
    // Throttle function to prevent excessive calls
    function throttle(func, limit) {
        let lastFunc;
        let lastRan;
        return function() {
            const context = this;
            const args = arguments;
            if (!lastRan) {
                func.apply(context, args);
                lastRan = Date.now();
            } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(function() {
                    if ((Date.now() - lastRan) >= limit) {
                        func.apply(context, args);
                        lastRan = Date.now();
                    }
                }, limit - (Date.now() - lastRan));
            }
        };
    }
    
    function showFullscreen(element) {
        const modal = document.createElement('div');
        modal.className = 'diagram-modal';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'diagram-modal-content';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.className = 'diagram-modal-close';
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        const clonedElement = element.cloneNode(true);
        clonedElement.style.maxWidth = '90vw';
        clonedElement.style.maxHeight = '90vh';
        
        modalContent.appendChild(closeBtn);
        modalContent.appendChild(clonedElement);
        modal.appendChild(modalContent);
        
        document.body.appendChild(modal);
        
        // Ensure text colors are adapted in modal
        setTimeout(adaptDiagramTextColors, 100);
        
        // Close on ESC key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', handleEscape);
            }
        });
    }
    
    function copyDiagram(element) {
        try {
            const svg = element.querySelector('svg');
            if (svg) {
                const svgData = new XMLSerializer().serializeToString(svg);
                
                // Copy SVG to clipboard
                navigator.clipboard.writeText(svgData).then(() => {
                    showNotification('Diagram copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy diagram:', err);
                    showNotification('Failed to copy diagram');
                });
            } else {
                // Fallback: copy the text content
                const textContent = element.textContent || element.innerText;
                navigator.clipboard.writeText(textContent).then(() => {
                    showNotification('Diagram source copied to clipboard!');
                });
            }
        } catch (error) {
            console.error('Copy error:', error);
            showNotification('Failed to copy diagram');
        }
    }
    
    function downloadDiagram(element) {
        try {
            const svg = element.querySelector('svg');
            if (svg) {
                const svgData = new XMLSerializer().serializeToString(svg);
                const blob = new Blob([svgData], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.href = url;
                a.download = `diagram-${Date.now()}.svg`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                showNotification('Diagram downloaded!');
            } else {
                showNotification('No SVG found to download');
            }
        } catch (error) {
            console.error('Download error:', error);
            showNotification('Failed to download diagram');
        }
    }
    
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'diagram-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
            animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    // PlantUML encoding functions
    function encodePlantUML(text) {
        return encode64(deflate(text));
    }
    
    function deflate(text) {
        return text; // Simplified for now
    }
    
    function encode64(text) {
        return btoa(unescape(encodeURIComponent(text)));
    }
    
    // Log completion
    console.log('Enhanced Mermaid diagram support with adaptive text colors initialized');
});

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .diagram-error {
        background: #fee2e2;
        border: 1px solid #fecaca;
        color: #991b1b;
        padding: 1rem;
        border-radius: 8px;
        margin: 1rem 0;
    }
    
    .diagram-error h4 {
        margin: 0 0 0.5rem 0;
        font-size: 1.1rem;
    }
    
    .diagram-error p {
        margin: 0.5rem 0;
    }
    
    .diagram-error pre {
        background: #f9fafb;
        padding: 0.5rem;
        border-radius: 4px;
        overflow-x: auto;
        font-size: 0.9rem;
    }
`;
document.head.appendChild(style); 