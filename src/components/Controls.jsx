import React from 'react';

const Controls = ({ mode, setMode, params, onParamChange, onRun, onReset, isPlaying }) => {
    const showMetaSettings = ['geneticAlgorithm', 'simulatedAnnealing', 'tabuSearch'].includes(params.algorithm) ||
        (mode === 'benchmark' && params.selectedAlgorithms.some(a => ['geneticAlgorithm', 'simulatedAnnealing', 'tabuSearch'].includes(a)));

    const showGASettings = params.algorithm === 'geneticAlgorithm' ||
        (mode === 'benchmark' && params.selectedAlgorithms.includes('geneticAlgorithm'));

    const showSASettings = params.algorithm === 'simulatedAnnealing' ||
        (mode === 'benchmark' && params.selectedAlgorithms.includes('simulatedAnnealing'));

    return (
        <div className="space-y-6">
            <div className="bg-slate-700 p-1 rounded-lg flex">
                <button
                    className={`flex-1 py-1 px-3 rounded-md text-sm font-medium transition-colors ${mode === 'visualizer' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'}`}
                    onClick={() => setMode('visualizer')}
                >
                    Visualizer
                </button>
                <button
                    className={`flex-1 py-1 px-3 rounded-md text-sm font-medium transition-colors ${mode === 'benchmark' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'}`}
                    onClick={() => setMode('benchmark')}
                >
                    Benchmark
                </button>
            </div>

            <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Algorithm</label>
                {mode === 'visualizer' ? (
                    <select
                        value={params.algorithm}
                        onChange={(e) => onParamChange('algorithm', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                    >
                        <optgroup label="Greedy">
                            <option value="basicGreedy">Basic Greedy (First-Fit)</option>
                            <option value="welshPowell">Welsh-Powell</option>
                            <option value="dSatur">DSatur</option>
                            <option value="rlf">RLF</option>
                        </optgroup>
                        <optgroup label="Exact">
                            <option value="backtracking">Backtracking</option>
                            <option value="branchAndBound">Branch & Bound</option>
                            <option value="ilp">ILP (Greedy approx)</option>
                        </optgroup>
                        <optgroup label="Meta-heuristics">
                            <option value="geneticAlgorithm">Genetic Algorithm</option>
                            <option value="simulatedAnnealing">Simulated Annealing</option>
                            <option value="tabuSearch">Tabu Search</option>
                        </optgroup>
                    </select>
                ) : (
                    <div className="space-y-2 bg-slate-900 p-2 rounded border border-slate-700 max-h-48 overflow-y-auto">
                        {[
                            { id: 'basicGreedy', label: 'Basic Greedy' },
                            { id: 'welshPowell', label: 'Welsh-Powell' },
                            { id: 'dSatur', label: 'DSatur' },
                            { id: 'rlf', label: 'RLF' },
                            { id: 'backtracking', label: 'Backtracking' },
                            { id: 'branchAndBound', label: 'Branch & Bound' },
                            { id: 'ilp', label: 'ILP' },
                            { id: 'geneticAlgorithm', label: 'Genetic Algorithm' },
                            { id: 'simulatedAnnealing', label: 'Simulated Annealing' },
                            { id: 'tabuSearch', label: 'Tabu Search' }
                        ].map(algo => (
                            <label key={algo.id} className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={params.selectedAlgorithms.includes(algo.id)}
                                    onChange={(e) => {
                                        const newSelection = e.target.checked
                                            ? [...params.selectedAlgorithms, algo.id]
                                            : params.selectedAlgorithms.filter(id => id !== algo.id);
                                        onParamChange('selectedAlgorithms', newSelection);
                                    }}
                                    className="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-slate-300">{algo.label}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <div>
                    <div className="flex justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-400">Nodes</label>
                        <span className="text-xs text-slate-200">{params.nodeCount}</span>
                    </div>
                    <input
                        type="range"
                        min="5"
                        max="500"
                        value={params.nodeCount}
                        onChange={(e) => onParamChange('nodeCount', parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>

                <div>
                    <div className="flex justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-400">Density</label>
                        <span className="text-xs text-slate-200">{params.density}</span>
                    </div>
                    <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value={params.density}
                        onChange={(e) => onParamChange('density', parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>

                <div>
                    <div className="flex justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-400">Time Limit (Seconds)</label>
                        <span className="text-xs text-slate-200">{params.timeLimit || 10}s</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="60"
                        step="1"
                        value={params.timeLimit || 10}
                        onChange={(e) => onParamChange('timeLimit', parseInt(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                </div>

                {showMetaSettings && (
                    <div className="pt-4 border-t border-slate-700 space-y-4">
                        <h3 className="text-xs font-bold text-slate-300 uppercase">Advanced Settings</h3>

                        {/* STAGNATION TIME SLIDER */}
                        <div>
                            <div className="flex justify-between mb-1">
                                <label className="text-xs font-semibold text-slate-400">Stagnation Time (ms)</label>
                                <span className="text-xs text-slate-200">{params.stagnationTime}ms</span>
                            </div>
                            <input
                                type="range"
                                min="1000"
                                max="20000"
                                step="1000"
                                value={params.stagnationTime}
                                onChange={(e) => onParamChange('stagnationTime', parseInt(e.target.value))}
                                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        {showGASettings && (
                            <div>
                                <div className="flex justify-between mb-1">
                                    <label className="text-xs font-semibold text-slate-400">GA Population</label>
                                    <span className="text-xs text-slate-200">{params.population}</span>
                                </div>
                                <input
                                    type="range"
                                    min="10"
                                    max="200"
                                    step="10"
                                    value={params.population}
                                    onChange={(e) => onParamChange('population', parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        )}

                        {showSASettings && (
                            <div>
                                <div className="flex justify-between mb-1">
                                    <label className="text-xs font-semibold text-slate-400">SA Temperature</label>
                                    <span className="text-xs text-slate-200">{params.temperature}</span>
                                </div>
                                <input
                                    type="range"
                                    min="100"
                                    max="5000"
                                    step="100"
                                    value={params.temperature}
                                    onChange={(e) => onParamChange('temperature', parseInt(e.target.value))}
                                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={onRun}
                    disabled={isPlaying}
                    className={`py-2 rounded text-sm font-medium transition-colors ${isPlaying ? 'bg-slate-600 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                >
                    {isPlaying ? 'Running...' : 'Run'}
                </button>
                <button onClick={onReset} className="bg-slate-700 hover:bg-slate-600 text-white py-2 rounded text-sm font-medium transition-colors">
                    Reset
                </button>
            </div>
        </div>
    );
};

export default Controls;