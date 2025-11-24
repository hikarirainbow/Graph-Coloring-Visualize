import { useState, useEffect, useCallback, useRef } from 'react'
import GraphCanvas from './components/GraphCanvas'
import Controls from './components/Controls'
import BenchmarkResults from './components/BenchmarkResults'
import LiveMetrics from './components/LiveMetrics'
import { Graph } from './core/Graph'

// Map tên thuật toán sang file worker tương ứng
// Đảm bảo ông đã tạo đủ các file này trong thư mục src/workers/
const ALGO_WORKERS = {
    basicGreedy: new URL('./workers/basicGreedyWorker.js', import.meta.url),
    welshPowell: new URL('./workers/welshPowellWorker.js', import.meta.url),
    dSatur: new URL('./workers/dSaturWorker.js', import.meta.url),
    rlf: new URL('./workers/rlfWorker.js', import.meta.url),
    backtracking: new URL('./workers/backtrackingWorker.js', import.meta.url),
    branchAndBound: new URL('./workers/branchAndBoundWorker.js', import.meta.url),
    ilp: new URL('./workers/ilpWorker.js', import.meta.url),
    geneticAlgorithm: new URL('./workers/geneticAlgorithmWorker.js', import.meta.url),
    simulatedAnnealing: new URL('./workers/simulatedAnnealingWorker.js', import.meta.url),
    tabuSearch: new URL('./workers/tabuSearchWorker.js', import.meta.url),
};

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
    const [coloringStatus, setColoringStatus] = useState({});
    const [conflictingEdges, setConflictingEdges] = useState([]);
    const [metrics, setMetrics] = useState([]);
    const [splitRatio, setSplitRatio] = useState(0.5);
    const isResizingRef = useRef(false);

    const usedColorsCount = new Set(Object.values(coloringStatus)).size;

    // Generate graph
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

    // Hàm tạo worker mới
    const createWorker = (algoName) => {
        if (workerRef.current) workerRef.current.terminate();

        const workerUrl = ALGO_WORKERS[algoName];
        if (!workerUrl) {
            console.error("Worker not found for:", algoName);
            // Fallback nếu chưa tạo file worker thì dùng basicGreedy tạm để không crash
            return new Worker(ALGO_WORKERS['basicGreedy'], { type: 'module' });
        }

        const worker = new Worker(workerUrl, { type: 'module' });

        worker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'DONE') {
                setIsPlaying(false);
                console.log('Algorithm finished:', payload);
            } else if (type === 'STEP') {
                if (payload.coloring) setColoringStatus(payload.coloring);
                if (payload.conflicts) setConflictingEdges(payload.conflicts);
                if (payload.metrics) setMetrics(prev => [...prev, payload.metrics]);
            } else if (type === 'ERROR') {
                console.error("Worker Error:", payload.message);
                setIsPlaying(false);
            }
        };

        workerRef.current = worker;
        return worker;
    };

    // Handle Run Visualizer
    const runVisualizer = () => {
        const worker = createWorker(params.algorithm);
        if (!worker) return;

        worker.postMessage({
            type: 'START_ALGORITHM',
            payload: { name: params.algorithm, params, graphData }
        });
    };

    // Handle Run Benchmark
    const [benchmarkResults, setBenchmarkResults] = useState([]);

    const runBenchmark = async () => {
        setBenchmarkResults([]);

        for (const algoName of params.selectedAlgorithms) {
            await new Promise((resolve) => {
                // Tạo worker riêng cho từng thuật toán trong loop
                const workerUrl = ALGO_WORKERS[algoName];
                if (!workerUrl) { resolve(); return; }

                const worker = new Worker(workerUrl, { type: 'module' });
                workerRef.current = worker; // Để nút Reset có thể kill được

                worker.onmessage = (e) => {
                    const { type, payload } = e.data;
                    if (type === 'DONE') {
                        setBenchmarkResults(prev => [...prev, {
                            name: algoName,
                            time: payload.metrics?.time || 0,
                            colors: payload.metrics?.colors || 0,
                            result: payload.result
                        }]);
                        worker.terminate();
                        resolve();
                    }
                };

                worker.postMessage({
                    type: 'START_ALGORITHM',
                    payload: { name: algoName, params, graphData }
                });
            });
            // Nghỉ 200ms giữa các bài test
            await new Promise(r => setTimeout(r, 200));
        }
        setIsPlaying(false);
    };

    const handleRun = () => {
        if (isPlaying) return;
        setIsPlaying(true);
        setMetrics([]);

        if (mode === 'visualizer') {
            runVisualizer();
        } else {
            runBenchmark();
        }
    };

    const handleReset = () => {
        console.log('Resetting graph and killing worker');
        setIsPlaying(false);
        if (workerRef.current) workerRef.current.terminate();

        const newGraph = Graph.generateRandom(params.nodeCount, params.density);
        setGraphData(newGraph);
        setColoringStatus({});
        setConflictingEdges([]);
        setMetrics([]);
    };

    // Resize Logic
    const handleMouseDown = (e) => {
        isResizingRef.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = useCallback((e) => {
        if (!isResizingRef.current) return;
        const containerHeight = window.innerHeight;
        const newRatio = (e.clientY / containerHeight);
        if (newRatio > 0.1 && newRatio < 0.9) setSplitRatio(newRatio);
    }, []);

    const handleMouseUp = useCallback(() => {
        isResizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove]);

    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    return (
        <div className="flex h-screen w-screen overflow-hidden">
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

                        <div className="mt-2 p-2 bg-slate-900 border border-slate-700 rounded flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-400">Colors Used:</span>
                            <span className="text-sm font-bold text-emerald-400">{usedColorsCount}</span>
                        </div>
                    </div>
                )}
            </div>

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
                        <div style={{ height: `${splitRatio * 100}%` }} className="border-b border-slate-700 relative min-h-0">
                            <GraphCanvas
                                graphData={graphData}
                                coloringStatus={coloringStatus}
                                conflictingEdges={conflictingEdges}
                                repulsion={params.repulsion}
                                onRepulsionChange={(val) => handleParamChange('repulsion', val)}
                            />
                        </div>
                        <div
                            className="h-2 bg-slate-700 hover:bg-blue-500 cursor-row-resize flex items-center justify-center transition-colors z-10"
                            onMouseDown={handleMouseDown}
                        >
                            <div className="w-8 h-1 bg-slate-500 rounded-full"></div>
                        </div>
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