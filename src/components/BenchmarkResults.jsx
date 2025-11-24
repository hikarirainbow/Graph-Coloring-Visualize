import { useState, useRef, useCallback, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, BarChart, Bar, Cell } from 'recharts';

const BenchmarkResults = ({ results }) => {
    const [internalSplitRatio, setInternalSplitRatio] = useState(0.5); // 50% split
    const isResizingRef = useRef(false);
    const containerRef = useRef(null);

    const handleMouseDown = (e) => {
        isResizingRef.current = true;
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = useCallback((e) => {
        if (!isResizingRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const relativeY = e.clientY - rect.top;
        const newRatio = relativeY / rect.height;
        if (newRatio > 0.1 && newRatio < 0.9) {
            setInternalSplitRatio(newRatio);
        }
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

    const getAlgorithmColor = (name) => {
        const colors = {
            'basicGreedy': '#22c55e',
            'welshPowell': '#16a34a',
            'dSatur': '#15803d',
            'rlf': '#14532d',
            'bruteForce': '#ff7e22ff',
            'backtracking': '#ef4444',
            'ilp': '#dc2626',
            'geneticAlgorithm': '#3b82f6',
            'simulatedAnnealing': '#8b5cf6',
            'tabuSearch': '#d946ef'
        };
        return colors[name] || '#8884d8';
    };

    if (!results || results.length === 0) {
        return (
            <div className="w-full h-full p-4 flex flex-col bg-slate-900 items-center justify-center text-slate-500">
                <p>Ready to benchmark. Select algorithms and press Run.</p>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="w-full h-full p-4 flex flex-col bg-slate-900 overflow-hidden">
            <h2 className="text-lg font-bold text-white mb-2 flex-shrink-0">Benchmark Results</h2>

            {/* Top: Performance (Speed) */}
            <div style={{ height: `${internalSplitRatio * 100}%` }} className="bg-slate-800 rounded-xl p-2 border border-slate-700 min-h-0">
                <h3 className="text-sm font-semibold text-slate-400 mb-2 ml-2">Performance (Speed)</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <BarChart
                        layout="vertical"
                        data={results}
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                        <XAxis type="number" stroke="#94a3b8" unit="ms" />
                        <YAxis dataKey="name" type="category" stroke="#94a3b8" width={120} tick={{ fontSize: 11 }} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                            cursor={{ fill: '#334155', opacity: 0.4 }}
                        />
                        <Bar dataKey="time" name="Time" radius={[0, 4, 4, 0]} barSize={20}>
                            {results.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={getAlgorithmColor(entry.name)} />
                            ))}
                            <LabelList
                                dataKey="time"
                                position="right"
                                fill="#94a3b8"
                                formatter={(val) => val < 1 ? "< 1ms" : `${Math.round(val)}ms`}
                            />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Resizer Handle */}
            <div
                className="h-2 bg-slate-900 hover:bg-slate-700 cursor-row-resize flex items-center justify-center transition-colors z-10 flex-shrink-0"
                onMouseDown={handleMouseDown}
            >
                <div className="w-8 h-1 bg-slate-600 rounded-full"></div>
            </div>

            {/* Bottom: Quality (Colors Used) */}
            <div style={{ height: `calc(${100 - (internalSplitRatio * 100)}% - 2rem)` }} className="bg-slate-800 rounded-xl p-2 border border-slate-700 min-h-0 flex-grow">
                <h3 className="text-sm font-semibold text-slate-400 mb-2 ml-2">Quality (Colors Used)</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <BarChart
                        layout="vertical"
                        data={results}
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                        <XAxis type="number" stroke="#94a3b8" allowDecimals={false} domain={[0, 'auto']} />
                        <YAxis dataKey="name" type="category" stroke="#94a3b8" width={120} tick={{ fontSize: 11 }} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f1f5f9' }}
                            cursor={{ fill: '#334155', opacity: 0.4 }}
                        />
                        <Bar dataKey="colors" name="Colors Used" radius={[0, 4, 4, 0]} barSize={20}>
                            {results.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={getAlgorithmColor(entry.name)} />
                            ))}
                            <LabelList dataKey="colors" position="right" fill="#94a3b8" />
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default BenchmarkResults;
