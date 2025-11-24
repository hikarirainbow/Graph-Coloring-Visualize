import React, { useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const GraphCanvas = ({ graphData, coloringStatus, conflictingEdges, repulsion, onRepulsionChange }) => {
    const graphRef = useRef();
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const containerRef = useRef();

    // Color palette
    const colors = ['#94a3b8', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

    useEffect(() => {
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                setDimensions({ width, height });
            }
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        // Re-heat simulation when data changes significantly (new graph)
        if (graphRef.current) {
            graphRef.current.d3Force('charge').strength(-repulsion);
            graphRef.current.d3ReheatSimulation();
        }
    }, [graphData, repulsion]);

    const getNodeColor = (node) => {
        const colorIndex = coloringStatus[node.id];
        // Use a default color that is NOT gray (e.g., white/light blue) to avoid confusion
        return colorIndex !== undefined ? colors[colorIndex % colors.length] : '#e2e8f0';
    };

    const getLinkColor = (link) => {
        // Check if link is in conflictingEdges
        // conflictingEdges might contain link objects or just source-target pairs
        const isConflicting = conflictingEdges.some(edge =>
            (edge.source === link.source.id && edge.target === link.target.id) ||
            (edge.source === link.target.id && edge.target === link.source.id) ||
            (edge.source.id === link.source.id && edge.target.id === link.target.id) // Handle object references
        );
        return isConflicting ? '#ef4444' : '#334155';
    };

    const getLinkWidth = (link) => {
        const isConflicting = conflictingEdges.some(edge =>
            (edge.source === link.source.id && edge.target === link.target.id) ||
            (edge.source === link.target.id && edge.target === link.source.id) ||
            (edge.source.id === link.source.id && edge.target.id === link.target.id)
        );
        return isConflicting ? 3 : 1;
    };

    return (
        <div ref={containerRef} className="w-full h-full relative">
            <div className="absolute top-4 right-4 z-10 bg-slate-800 p-2 rounded shadow-lg border border-slate-700">
                <label className="block text-xs font-semibold text-slate-400 mb-1">Repulsion: {repulsion}</label>
                <input
                    type="range"
                    min="10"
                    max="200"
                    value={repulsion}
                    onChange={(e) => onRepulsionChange(parseInt(e.target.value))}
                    className="w-32 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer"
                />
            </div>
            <ForceGraph2D
                ref={graphRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={graphData}
                nodeLabel="id"
                nodeColor={getNodeColor}
                backgroundColor="#0f172a" // Slate 900
                linkColor={getLinkColor}
                linkWidth={getLinkWidth}
                cooldownTicks={100}
                onEngineStop={() => graphRef.current.zoomToFit(400)}
            />
        </div>
    );
};

export default GraphCanvas;
