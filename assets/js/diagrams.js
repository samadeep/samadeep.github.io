// Mermaid Diagram Support
document.addEventListener('DOMContentLoaded', function() {
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
                } else if (diagram.classList.contains('plantuml')) {
                    renderPlantUMLDiagram(diagram);
                }
                
                // Stop observing this element
                observer.unobserve(diagram);
            }
        });
    }, {
        rootMargin: '50px 0px', // Start loading 50px before the diagram comes into view
        threshold: 0.1
    });
    
    // Observe all diagrams for lazy loading
    document.querySelectorAll('.mermaid, .plantuml').forEach(diagram => {
        observer.observe(diagram);
    });
    
    // Add performance monitoring
    const startTime = performance.now();
    let diagramsRendered = 0;
    
    function renderMermaidDiagram(element) {
        try {
            // Check if Mermaid is loaded
            if (typeof mermaid === 'undefined') {
                console.warn('Mermaid library not loaded');
                return;
            }
            
            // Get diagram content
            const diagramContent = element.textContent || element.innerHTML;
            
            // Create unique ID for the diagram
            const diagramId = 'mermaid-' + Math.random().toString(36).substr(2, 9);
            
            // Use Mermaid 9.x compatible API
            const renderStartTime = performance.now();
            
            try {
                // Render the diagram using Mermaid 9.x API
                mermaid.render(diagramId, diagramContent, function(svgCode) {
                    element.innerHTML = svgCode;
                    diagramsRendered++;
                    
                    // Add interactive features
                    addInteractiveFeatures(element);
                    
                    // Log performance
                    const renderTime = performance.now() - renderStartTime;
                    console.log(`Mermaid diagram rendered in ${renderTime.toFixed(2)}ms`);
                });
            } catch (error) {
                console.error('Mermaid render error:', error);
                // Fallback: try direct initialization
                mermaid.init(undefined, element);
                diagramsRendered++;
                addInteractiveFeatures(element);
            }
        } catch (error) {
            console.error('Mermaid initialization error:', error);
            element.innerHTML = '<div class="diagram-error">Error rendering diagram: ' + error.message + '</div>';
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
            img.loading = 'lazy'; // Native lazy loading
            
            // Add error handling
            img.onerror = function() {
                element.innerHTML = '<div class="diagram-error">Error loading PlantUML diagram</div>';
            };
            
            img.onload = function() {
                diagramsRendered++;
                addInteractiveFeatures(element);
                console.log('PlantUML diagram loaded successfully');
            };
            
            element.innerHTML = '';
            element.appendChild(img);
        } catch (error) {
            console.error('PlantUML rendering error:', error);
            element.innerHTML = '<div class="diagram-error">Error rendering PlantUML diagram</div>';
        }
    }
    
    function addInteractiveFeatures(element) {
        // Throttle the interactive features to prevent performance issues
        const throttledAddFeatures = throttle(() => {
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
            document.body.style.overflow = '';
        });
        
        const diagramClone = element.cloneNode(true);
        diagramClone.className += ' fullscreen-diagram';
        
        modalContent.appendChild(closeBtn);
        modalContent.appendChild(diagramClone);
        modal.appendChild(modalContent);
        
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        
        // Close on ESC key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && document.body.contains(modal)) {
                document.body.removeChild(modal);
                document.body.style.overflow = '';
            }
        });
    }
    
    function copyDiagram(element) {
        try {
            // For SVG diagrams
            const svg = element.querySelector('svg');
            if (svg) {
                const svgData = new XMLSerializer().serializeToString(svg);
                navigator.clipboard.writeText(svgData).then(() => {
                    showNotification('Diagram copied to clipboard!');
                });
            } else {
                // For other diagram types
                const text = element.textContent || element.innerText;
                navigator.clipboard.writeText(text).then(() => {
                    showNotification('Diagram text copied to clipboard!');
                });
            }
        } catch (error) {
            console.error('Copy failed:', error);
            showNotification('Copy failed. Please try again.');
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
                a.download = 'diagram.svg';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                showNotification('Diagram downloaded!');
            } else {
                showNotification('Download not available for this diagram type.');
            }
        } catch (error) {
            console.error('Download failed:', error);
            showNotification('Download failed. Please try again.');
        }
    }
    
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'diagram-notification';
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    function encodePlantUML(text) {
        // Simple PlantUML encoding - you might want to use a proper library
        const compressed = deflate(text);
        return encode64(compressed);
    }
    
    function deflate(text) {
        // Simplified deflate - in production, use a proper compression library
        return text;
    }
    
    function encode64(text) {
        // Base64 encoding
        return btoa(unescape(encodeURIComponent(text)));
    }
    
    // Performance monitoring
    window.addEventListener('load', function() {
        const totalTime = performance.now() - startTime;
        console.log(`All diagrams loaded in ${totalTime.toFixed(2)}ms. Total diagrams: ${diagramsRendered}`);
        
        // Performance optimization: Clean up after rendering
        if (diagramsRendered > 5) {
            console.log('Multiple diagrams detected. Consider splitting content for better performance.');
        }
    });
    
    // Memory cleanup
    window.addEventListener('beforeunload', function() {
        // Clean up any remaining observers
        if (observer) {
            observer.disconnect();
        }
    });
});

// Add CSS animation for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style); 