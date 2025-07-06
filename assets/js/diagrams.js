// Mermaid Diagram Support
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Mermaid
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({
            startOnLoad: true,
            theme: document.documentElement.getAttribute('data-mode') === 'dark' ? 'dark' : 'base',
            themeVariables: {
                primaryColor: '#007bff',
                primaryTextColor: '#fff',
                primaryBorderColor: '#7C0000',
                lineColor: '#F8B229',
                secondaryColor: '#006100',
                tertiaryColor: '#fff'
            },
            flowchart: {
                curve: 'basis',
                nodeSpacing: 50,
                rankSpacing: 50,
                padding: 15
            },
            sequence: {
                diagramMarginX: 50,
                diagramMarginY: 10,
                actorMargin: 50,
                width: 150,
                height: 65,
                boxMargin: 10,
                boxTextMargin: 5,
                noteMargin: 10,
                messageMargin: 35,
                mirrorActors: true,
                bottomMarginAdj: 1,
                useMaxWidth: true
            },
            gantt: {
                titleTopMargin: 25,
                barHeight: 20,
                fontFamily: '"Open Sans", sans-serif',
                fontSize: 11,
                fontWeight: 'normal',
                gridLineStartPadding: 35,
                leftPadding: 75,
                numberSectionStyles: 4,
                topPadding: 50,
                topAxis: false
            }
        });
    }

    // Add diagram enhancement features
    addDiagramEnhancements();
    
    // Handle theme changes
    handleThemeChanges();
});

// Add enhancement features to diagrams
function addDiagramEnhancements() {
    const diagrams = document.querySelectorAll('.mermaid-diagram, .plantuml-diagram');
    
    diagrams.forEach(diagram => {
        // Add toolbar
        addDiagramToolbar(diagram);
        
        // Add click to expand functionality
        addClickToExpand(diagram);
        
        // Add copy functionality
        addCopyFunctionality(diagram);
    });
}

// Add toolbar to diagrams
function addDiagramToolbar(diagram) {
    const toolbar = document.createElement('div');
    toolbar.className = 'diagram-toolbar';
    
    // Full-screen button
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.textContent = '⛶';
    fullscreenBtn.title = 'Full Screen';
    fullscreenBtn.onclick = () => toggleFullscreen(diagram);
    
    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋';
    copyBtn.title = 'Copy Diagram';
    copyBtn.onclick = () => copyDiagram(diagram);
    
    // Download button
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = '💾';
    downloadBtn.title = 'Download Diagram';
    downloadBtn.onclick = () => downloadDiagram(diagram);
    
    toolbar.appendChild(fullscreenBtn);
    toolbar.appendChild(copyBtn);
    toolbar.appendChild(downloadBtn);
    
    diagram.insertBefore(toolbar, diagram.firstChild);
}

// Add click to expand functionality
function addClickToExpand(diagram) {
    const diagramContent = diagram.querySelector('.mermaid, .plantuml');
    if (diagramContent) {
        diagramContent.style.cursor = 'pointer';
        diagramContent.onclick = () => toggleFullscreen(diagram);
    }
}

// Toggle fullscreen mode
function toggleFullscreen(diagram) {
    const existing = document.querySelector('.diagram-fullscreen');
    if (existing) {
        existing.remove();
        return;
    }
    
    const fullscreenDiv = document.createElement('div');
    fullscreenDiv.className = 'diagram-fullscreen';
    
    const clonedDiagram = diagram.cloneNode(true);
    clonedDiagram.onclick = () => fullscreenDiv.remove();
    
    fullscreenDiv.appendChild(clonedDiagram);
    document.body.appendChild(fullscreenDiv);
    
    // ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            fullscreenDiv.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Copy diagram functionality
function copyDiagram(diagram) {
    const diagramContent = diagram.querySelector('.mermaid, .plantuml');
    if (!diagramContent) return;
    
    if (diagram.classList.contains('mermaid-diagram')) {
        // Copy Mermaid source
        const mermaidText = diagramContent.textContent.trim();
        navigator.clipboard.writeText(mermaidText).then(() => {
            showNotification('Mermaid diagram copied to clipboard!');
        });
    } else if (diagram.classList.contains('plantuml-diagram')) {
        // Copy PlantUML image
        const img = diagramContent.querySelector('img');
        if (img) {
            fetch(img.src)
                .then(response => response.blob())
                .then(blob => {
                    navigator.clipboard.write([
                        new ClipboardItem({ 'image/png': blob })
                    ]);
                    showNotification('PlantUML diagram copied to clipboard!');
                })
                .catch(() => {
                    showNotification('Failed to copy diagram');
                });
        }
    }
}

// Download diagram functionality
function downloadDiagram(diagram) {
    const diagramContent = diagram.querySelector('.mermaid, .plantuml');
    if (!diagramContent) return;
    
    if (diagram.classList.contains('mermaid-diagram')) {
        // Download Mermaid as SVG
        const svg = diagramContent.querySelector('svg');
        if (svg) {
            downloadSVG(svg, 'mermaid-diagram.svg');
        }
    } else if (diagram.classList.contains('plantuml-diagram')) {
        // Download PlantUML image
        const img = diagramContent.querySelector('img');
        if (img) {
            downloadImage(img.src, 'plantuml-diagram.png');
        }
    }
}

// Download SVG file
function downloadSVG(svg, filename) {
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    downloadFile(svgUrl, filename);
}

// Download image file
function downloadImage(url, filename) {
    fetch(url)
        .then(response => response.blob())
        .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            downloadFile(blobUrl, filename);
        });
}

// Generic file download
function downloadFile(url, filename) {
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #007bff;
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        z-index: 1001;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Handle theme changes
function handleThemeChanges() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-mode') {
                // Re-initialize Mermaid with new theme
                if (typeof mermaid !== 'undefined') {
                    const newTheme = document.documentElement.getAttribute('data-mode') === 'dark' ? 'dark' : 'base';
                    mermaid.initialize({
                        startOnLoad: true,
                        theme: newTheme
                    });
                    
                    // Re-render existing diagrams
                    const mermaidDiagrams = document.querySelectorAll('.mermaid');
                    mermaidDiagrams.forEach(diagram => {
                        mermaid.init(undefined, diagram);
                    });
                }
            }
        });
    });
    
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-mode']
    });
}

// Add CSS animation for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style); 