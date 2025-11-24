import { useState, useEffect, useCallback, useRef } from 'react'
import GraphCanvas from './components/GraphCanvas'
import Controls from './components/Controls'
import BenchmarkResults from './components/BenchmarkResults'
import LiveMetrics from './components/LiveMetrics'
// FIX: Import { Graph } thay vì * as Graph để tránh lỗi undefined
import { Graph } from './core/Graph'

function App() {
    const [mode, setMode] = useState('visualizer'); // 'visualizer' | 'benchmark'
    const [params, setParams] = useState({
        nodeCount: 50,
        density: 0.5,
        algorithm: 'welshPowell',
        maxColors: 5,
        timeLimit: 10, // Seconds
        population: 50,
        generations: 100,
        temperature: 1000,
        repulsion: 30,
        selectedAlgorithms: []
    });

    const [isPlaying, setIsPlaying] = useState(false);

    // Graph State
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [coloringStatus, setColoringStatus] = useState({}); // { nodeId: colorIndex }
    const [conflictingEdges, setConflictingEdges] = useState([]); // Array of link objects or IDs
    const [metrics, setMetrics] = useState([]); // Array of { iter, conflicts }
    const [splitRatio, setSplitRatio] = useState(0.5); // Ratio for benchmark split view
    const isResizingRef = useRef(false);

    // Tính toán số lượng màu đang sử dụng thực tế
    const usedColorsCount = new Set(Object.values(coloringStatus)).size;

    // Generate graph when params change (only if not playing)
    useEffect(() => {
        if (!isPlaying) {
            const newGraph = Graph.generateRandom(params.nodeCount, params.density);
            setGraphData(newGraph);
            setColoringStatus({});
            setConflictingEdges([]);
            setMetrics([]);
        }
    }, [params.nodeCount, params.density]);

    const handleParamChange = (key, value) => {
        setParams(prev => ({ ...prev, [key]: value }));
    };

    const workerRef = useRef(null);

    const initializeWorker = useCallback(() => {
        if (workerRef.current) {
            workerRef.current.terminate();
        }

        workerRef.current = new Worker(new URL('./workers/algorithmWorker.js', import.meta.url), { type: 'module' });

        workerRef.current.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'DONE') {
                setIsPlaying(false);
                console.log('Algorithm finished:', payload);
            } else if (type === 'STEP') {
                // Update visualization state
                if (payload.coloring) setColoringStatus(payload.coloring);
                if (payload.conflicts) setConflictingEdges(payload.conflicts);
                if (payload.metrics) setMetrics(prev => [...prev, payload.metrics]);
            }
        };
    }, []);

    useEffect(() => {
        initializeWorker();
        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
            }
        };
    }, [initializeWorker]);

    const [benchmarkResults, setBenchmarkResults] = useState([]);

    const handleRun = async () => {
        if (isPlaying) return;
        setIsPlaying(true);
        setMetrics([]);

        if (mode === 'benchmark') {
            console.log('Starting benchmark sequence...');
            setBenchmarkResults([]); // Clear previous results

            for (const algoName of params.selectedAlgorithms) {
                console.log(`Benchmarking ${algoName}...`);

                // Create a promise that resolves when the worker finishes
                await new Promise((resolve) => {
                    const handleWorkerMessage = (e) => {
                        const { type, payload } = e.data;
                        if (type === 'DONE') {
                            // Capture metrics from the worker
                            const result = {
                                name: algoName,
                                time: payload.metrics?.time || 0,
                                colors: payload.metrics?.colors || 0,
                                result: payload.result
                            };
                            setBenchmarkResults(prev => [...prev, result]);

                            workerRef.current.removeEventListener('message', handleWorkerMessage);
                            // Restore default listener
                            workerRef.current.onmessage = (e) => {
                                const { type, payload } = e.data;
                                if (type === 'DONE') {
                                    setIsPlaying(false);
                                } else if (type === 'STEP') {
                                    if (payload.coloring) setColoringStatus(payload.coloring);
                                    if (payload.conflicts) setConflictingEdges(payload.conflicts);
                                    if (payload.metrics) setMetrics(prev => [...prev, payload.metrics]);
                                }
                            };
                            resolve();
                        } else if (type === 'STEP') {
                            // Optional: Update live view even during benchmark?
                            // Maybe just progress bar?
                        }
                    };
                    workerRef.current.addEventListener('message', handleWorkerMessage);

                    workerRef.current.postMessage({
                        type: 'START_ALGORITHM',
                        payload: {
                            name: algoName,
                            params: params,
                            graphData: graphData
                        }
                    });
                });

                // Small delay between algorithms
                await new Promise(r => setTimeout(r, 500));
            }
            setIsPlaying(false);
            console.log('Benchmark sequence completed');
        } else {
            // Visualizer Mode
            console.log('Running algorithm:', params.algorithm);
            workerRef.current.postMessage({
                type: 'START_ALGORITHM',
                payload: {
                    name: params.algorithm,
                    params: params,
                    graphData: graphData
                }
            });
        }
    };

    const handleReset = () => {
        console.log('Resetting graph and killing worker');
        setIsPlaying(false);

        // Kill and restart worker
        initializeWorker();

        // Regenerate graph
        const newGraph = Graph.generateRandom(params.nodeCount, params.density);
        setGraphData(newGraph);
        setColoringStatus({});
        setConflictingEdges([]);
        setMetrics([]);
    };

    const handleMouseDown = (e) => {
        isResizingRef.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = useCallback((e) => {
        if (!isResizingRef.current) return;
        const containerHeight = window.innerHeight;
        const newRatio = (e.clientY / containerHeight);
        if (newRatio > 0.1 && newRatio < 0.9) {
            setSplitRatio(newRatio);
        }
    }, []);

    const handleMouseUp = useCallback(() => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove]);

    // Cleanup event listeners on unmount (just in case)
    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    return (
        <div className="flex h-screen w-screen overflow-hidden">
            {/* Sidebar Controls */}
            <div className="w-80 flex-shrink-0 bg-slate-800 border-r border-slate-700 p-4 overflow-y-auto">
                <h1 className="text-xl font-bold text-white mb-6">Graph Coloring</h1>
                <Controls
                    mode={mode}
                    setMode={setMode}
                    params={params}
                    onParamChange={handleParamChange}
                    onRun={handleRun}
                    onReset={handleReset}
                    isPlaying={isPlaying}
                />

                {mode === 'visualizer' && (
                    <div className="mt-6">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-sm font-semibold text-slate-400">Live Metrics</h2>
                            {metrics.length > 0 && (
                                <div className="text-xs text-slate-300">
                                    Score: <span className="font-bold text-blue-400">
                                        {(() => {
                                            const lastMetric = metrics[metrics.length - 1];
                                            if (!lastMetric) return 100;

                                            const timeInSeconds = lastMetric.time / 1000;
                                            const iterPenalty = lastMetric.iter / 50;

                                            let score = 100 - (timeInSeconds + iterPenalty);
                                            if (score < 0) score = 0;

                                            return score.toFixed(2);
                                        })()}
                                    </span>
                                </div>
                            )}
                        </div>
                        <LiveMetrics data={metrics} />

                        {/* --- NEW FEATURE: Colors Used Display --- */}
                        <div className="mt-2 p-2 bg-slate-900 border border-slate-700 rounded flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-400">Colors Used:</span>
                            <span className="text-sm font-bold text-emerald-400">{usedColorsCount}</span>
                        </div>
                        {/* ---------------------------------------- */}

                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-grow relative bg-slate-900 flex flex-col">
                {mode === 'visualizer' ? (
                    <GraphCanvas
                        graphData={graphData}
                        coloringStatus={coloringStatus}
                        conflictingEdges={conflictingEdges}
                        repulsion={params.repulsion}
                        onRepulsionChange={(val) => handleParamChange('repulsion', val)}
                    />
                ) : (
                    <div className="flex flex-col h-full">
                        {/* Top: Graph Visualization */}
                        <div style={{ height: `${splitRatio * 100}%` }} className="border-b border-slate-700 relative min-h-0">
                            <GraphCanvas
                                graphData={graphData}
                                coloringStatus={coloringStatus}
                                conflictingEdges={conflictingEdges}
                                repulsion={params.repulsion}
                                onRepulsionChange={(val) => handleParamChange('repulsion', val)}
                            />
                        </div>

                        {/* Resizer Handle */}
                        <div
                            className="h-2 bg-slate-700 hover:bg-blue-500 cursor-row-resize flex items-center justify-center transition-colors z-10"
                            onMouseDown={handleMouseDown}
                        >
                            <div className="w-8 h-1 bg-slate-500 rounded-full"></div>
                        </div>

                        {/* Bottom: Benchmark Results */}
                        <div style={{ height: `${(1 - splitRatio) * 100}%` }} className="overflow-hidden min-h-0">
                            <BenchmarkResults results={benchmarkResults} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

export default App