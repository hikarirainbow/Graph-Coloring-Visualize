import { useState, useEffect, useCallback, useRef } from 'react';
import GraphCanvas from './components/GraphCanvas';
import Controls from './components/Controls';
import BenchmarkResults from './components/BenchmarkResults';
import LiveMetrics from './components/LiveMetrics';
import { Graph } from './core/Graph';

// Đăng ký toàn bộ Worker (bao gồm cả 2 cái mới)
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
    bruteForce: new URL('./workers/bruteForceWorker.js', import.meta.url),
    antColony: new URL('./workers/acoWorker.js', import.meta.url),
};

function App() {
    const [mode, setMode] = useState('visualizer');
    const [params, setParams] = useState({
        nodeCount: 50,
        density: 0.5,
        algorithm: 'welshPowell',
        maxColors: 5,
        timeLimit: 10, // Giây
        stagnationTime: 1000,
        population: 50,
        generations: 100,
        temperature: 1000,
        repulsion: 30,
        selectedAlgorithms: []
    });

    const [isPlaying, setIsPlaying] = useState(false);
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [coloringStatus, setColoringStatus] = useState({});
    const [conflictingEdges, setConflictingEdges] = useState([]);
    const [metrics, setMetrics] = useState([]);
    const [benchmarkResults, setBenchmarkResults] = useState([]);
    const [splitRatio, setSplitRatio] = useState(0.5);

    // Refs để quản lý Worker và Timer
    const workerRef = useRef(null);
    const watchdogRef = useRef(null); // Timer để kill worker bị treo
    const isResizingRef = useRef(false);

    const usedColorsCount = new Set(Object.values(coloringStatus)).size;

    // 1. Khởi tạo đồ thị khi thay đổi tham số (nếu không đang chạy)
    useEffect(() => {
        if (!isPlaying) {
            resetGraph();
        }
    }, [params.nodeCount, params.density]);

    const resetGraph = () => {
        const newGraph = Graph.generateRandom(params.nodeCount, params.density);
        setGraphData(newGraph);
        setColoringStatus({});
        setConflictingEdges([]);
        setMetrics([]);
    };

    const handleParamChange = (key, value) => {
        setParams(prev => ({ ...prev, [key]: value }));
    };

    // 2. Hàm dọn dẹp an toàn (Kill Worker + Clear Timer)
    const terminateCurrentWorker = () => {
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
        if (watchdogRef.current) {
            clearTimeout(watchdogRef.current);
            watchdogRef.current = null;
        }
    };

    // 3. Hàm tạo Worker chung
    const createWorker = (algoName, onDoneCallback = null) => {
        terminateCurrentWorker(); // Dọn cái cũ trước

        const workerUrl = ALGO_WORKERS[algoName];
        if (!workerUrl) {
            console.error("Worker not found for:", algoName);
            return null;
        }

        const worker = new Worker(workerUrl, { type: 'module' });

        worker.onmessage = (e) => {
            const { type, payload } = e.data;

            if (type === 'STEP') {
                // Live update
                if (payload.coloring) setColoringStatus(payload.coloring);
                if (payload.conflicts) setConflictingEdges(payload.conflicts);
                if (payload.metrics) setMetrics(prev => [...prev, payload.metrics]);
            }
            else if (type === 'DONE') {
                // Worker đã xong tự nguyện -> Hủy Watchdog Timer
                if (watchdogRef.current) clearTimeout(watchdogRef.current);

                // Update trạng thái cuối cùng
                if (payload.coloring) setColoringStatus(payload.coloring);
                if (payload.conflicts) setConflictingEdges(payload.conflicts);

                console.log(`Algorithm ${algoName} finished:`, payload.result);

                if (onDoneCallback) {
                    onDoneCallback(payload);
                } else {
                    setIsPlaying(false);
                }
            }
            else if (type === 'ERROR') {
                console.error("Worker Error:", payload.message);
                setIsPlaying(false);
                terminateCurrentWorker();
            }
        };

        workerRef.current = worker;
        return worker;
    };

    // 4. Chạy chế độ Visualizer (Có Watchdog)
    const runVisualizer = () => {
        const worker = createWorker(params.algorithm);
        if (!worker) return;

        // Thiết lập thời gian giới hạn (Time Limit + 2s buffer)
        const timeLimitMs = (params.timeLimit || 10) * 1000;

        watchdogRef.current = setTimeout(() => {
            if (workerRef.current) {
                console.warn(`[Watchdog] Terminating ${params.algorithm} due to timeout!`);
                workerRef.current.terminate();
                workerRef.current = null;
                setIsPlaying(false);
                alert(`Thuật toán bị buộc dừng do quá thời gian giới hạn (${params.timeLimit}s). \n(Máy tính đã được giải phóng CPU)`);
            }
        }, timeLimitMs + 2000); // Cho thêm 2s để worker tự cleanup nếu kịp

        worker.postMessage({
            type: 'START_ALGORITHM',
            payload: { name: params.algorithm, params, graphData }
        });
    };

    // 5. Chạy chế độ Benchmark
    const runBenchmark = async () => {
        setBenchmarkResults([]);

        for (const algoName of params.selectedAlgorithms) {
            await new Promise((resolve) => {
                // Tạo worker với callback riêng để resolve promise
                const worker = createWorker(algoName, (payload) => {
                    setBenchmarkResults(prev => [...prev, {
                        name: algoName,
                        time: payload.metrics?.time || 0,
                        colors: payload.metrics?.colors || 0,
                        result: payload.result
                    }]);
                    resolve(); // Xong 1 thuật toán
                });

                if (!worker) { resolve(); return; }

                // Benchmark cũng cần Watchdog để tránh treo cả chuỗi
                const timeLimitMs = (params.timeLimit || 10) * 1000;
                watchdogRef.current = setTimeout(() => {
                    console.warn(`[Benchmark Watchdog] Skipping ${algoName}...`);
                    terminateCurrentWorker();
                    setBenchmarkResults(prev => [...prev, {
                        name: algoName,
                        time: timeLimitMs,
                        colors: 0,
                        result: 'Timeout (Killed)'
                    }]);
                    resolve(); // Bỏ qua, chạy cái tiếp theo
                }, timeLimitMs + 2000);

                worker.postMessage({
                    type: 'START_ALGORITHM',
                    payload: { name: algoName, params, graphData }
                });
            });

            // Nghỉ ngắn giữa các thuật toán để UI thở
            await new Promise(r => setTimeout(r, 300));
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
        setIsPlaying(false);
        terminateCurrentWorker(); // Quan trọng: Kill hết worker đang chạy
        resetGraph();
    };

    // --- Logic Resize UI ---
    const handleMouseDown = () => {
        isResizingRef.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = useCallback((e) => {
        if (!isResizingRef.current) return;
        const newRatio = e.clientY / window.innerHeight;
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
            terminateCurrentWorker(); // Cleanup khi unmount App
        };
    }, [handleMouseMove, handleMouseUp]);

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-slate-900 text-slate-200">
            {/* Sidebar */}
            <div className="w-80 flex-shrink-0 bg-slate-800 border-r border-slate-700 p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600">
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
                    <div className="mt-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-sm font-semibold text-slate-400">Live Metrics</h2>
                            {metrics.length > 0 && (
                                <div className="text-xs text-slate-300">
                                    Score: <span className="font-bold text-blue-400">
                                        {(() => {
                                            const last = metrics[metrics.length - 1];
                                            if (!last) return 100;
                                            // Score ảo để nhìn cho vui
                                            const score = 100 - ((last.time / 1000) * 0.5 + (last.conflicts * 2));
                                            return Math.max(0, score).toFixed(2);
                                        })()}
                                    </span>
                                </div>
                            )}
                        </div>

                        <LiveMetrics data={metrics} />

                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-2 bg-slate-900 border border-slate-700 rounded flex flex-col items-center">
                                <span className="text-xs font-medium text-slate-400">Colors Used</span>
                                <span className="text-lg font-bold text-emerald-400">{usedColorsCount}</span>
                            </div>
                            <div className="p-2 bg-slate-900 border border-slate-700 rounded flex flex-col items-center">
                                <span className="text-xs font-medium text-slate-400">Conflicts</span>
                                <span className={`text-lg font-bold ${conflictingEdges.length > 0 ? 'text-red-500' : 'text-blue-400'}`}>
                                    {conflictingEdges.length}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="flex-grow relative flex flex-col min-w-0">
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

                        {/* Resizer Handle */}
                        <div
                            className="h-2 bg-slate-800 hover:bg-blue-600 cursor-row-resize flex items-center justify-center transition-colors z-50 flex-shrink-0"
                            onMouseDown={handleMouseDown}
                        >
                            <div className="w-10 h-1 bg-slate-500 rounded-full"></div>
                        </div>

                        <div style={{ height: `${(1 - splitRatio) * 100}%` }} className="overflow-hidden min-h-0 flex flex-col">
                            <BenchmarkResults results={benchmarkResults} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;