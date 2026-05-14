import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from 'lucide-react';

interface MermaidRendererProps {
  code: string;
  className?: string;
  showControls?: boolean;
}

// Generate unique ID counter
let mermaidIdCounter = 0;

const MermaidRenderer = ({ code, className = '', showControls = true }: MermaidRendererProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [isRendering, setIsRendering] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Initialize mermaid once
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        primaryColor: '#E0B954',
        primaryTextColor: '#F4F6FF',
        primaryBorderColor: '#E0B954',
        lineColor: '#737373',
        secondaryColor: '#1E293B',
        tertiaryColor: '#0F172A',
        background: '#080808',
        mainBkg: '#1E293B',
        nodeBorder: '#E0B954',
        clusterBkg: 'rgba(224, 185, 84, 0.1)',
        clusterBorder: '#E0B954',
        titleColor: '#F4F6FF',
        edgeLabelBackground: '#1E293B',
      },
      flowchart: {
        curve: 'basis',
        padding: 20,
      },
      securityLevel: 'loose',
    });
  }, []);

  useEffect(() => {
    const renderDiagram = async () => {
      if (!code) {
        setSvgContent('');
        return;
      }

      setIsRendering(true);
      setError(null);

      try {
        // Clean the code - remove markdown code blocks if present
        let cleanCode = code.trim();
        if (cleanCode.startsWith('```mermaid')) {
          cleanCode = cleanCode.replace(/^```mermaid\n/, '').replace(/\n```$/, '');
        } else if (cleanCode.startsWith('```')) {
          cleanCode = cleanCode.replace(/^```\n/, '').replace(/\n```$/, '');
        }

        // Generate unique ID
        mermaidIdCounter += 1;
        const id = `mermaid-${mermaidIdCounter}-${Date.now()}`;

        // Parse and render
        const { svg } = await mermaid.render(id, cleanCode);
        setSvgContent(svg);
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        setError(err.message || 'Failed to render diagram');
        setSvgContent('');
      } finally {
        setIsRendering(false);
      }
    };

    // Debounce rendering
    const timeoutId = setTimeout(renderDiagram, 100);
    return () => clearTimeout(timeoutId);
  }, [code]);

  // Zoom controls
  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.25));
  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };
  const handleFit = () => {
    if (containerRef.current) {
      const container = containerRef.current;
      const svg = container.querySelector('svg');
      if (svg) {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const svgWidth = svg.getBBox ? svg.getBBox().width : svg.clientWidth;
        const svgHeight = svg.getBBox ? svg.getBBox().height : svg.clientHeight;
        const scaleX = containerWidth / svgWidth;
        const scaleY = containerHeight / svgHeight;
        const newScale = Math.min(scaleX, scaleY, 1) * 0.9;
        setScale(Math.max(0.25, Math.min(newScale, 2)));
        setPosition({ x: 0, y: 0 });
      }
    }
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.max(0.25, Math.min(prev + delta, 3)));
  };

  // Reset scale when code changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [code]);

  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 bg-red-500/10 border border-red-500/30 rounded-xl ${className}`}
      >
        <p className="text-red-400 text-sm mb-2">Failed to render diagram</p>
        <p className="text-red-400/70 text-xs font-mono max-w-full overflow-auto">{error}</p>
      </div>
    );
  }

  if (isRendering || !svgContent) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-8 bg-[rgba(255,255,255,0.02)] rounded-xl ${className}`}
      >
        <div className="w-8 h-8 border-2 border-[#E0B954]/30 border-t-[#E0B954] rounded-full animate-spin mb-2" />
        <p className="text-xs text-[#737373]">Rendering diagram...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Zoom Controls */}
      {showControls && (
        <div className="absolute top-2 right-2 z-10 flex gap-1 bg-[#080808]/90 backdrop-blur-sm border border-[rgba(255,255,255,0.08)] rounded-lg p-1">
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded hover:bg-[rgba(255,255,255,0.08)] text-[#737373] hover:text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs text-[#737373] flex items-center min-w-[50px] justify-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded hover:bg-[rgba(255,255,255,0.08)] text-[#737373] hover:text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px bg-[rgba(255,255,255,0.08)]" />
          <button
            onClick={handleFit}
            className="p-1.5 rounded hover:bg-[rgba(255,255,255,0.08)] text-[#737373] hover:text-white transition-colors"
            title="Fit to Screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="p-1.5 rounded hover:bg-[rgba(255,255,255,0.08)] text-[#737373] hover:text-white transition-colors"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Diagram Container */}
      <div
        ref={containerRef}
        className={`mermaid-container overflow-hidden cursor-grab active:cursor-grabbing ${className}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          minHeight: '200px',
        }}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>
    </div>
  );
};

export default MermaidRenderer;
