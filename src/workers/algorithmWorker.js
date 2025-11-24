// Worker to handle heavy algorithm computations
self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'START_ALGORITHM':
            runAlgorithm(payload);
            break;
        default:
            console.warn('Unknown message type:', type);
    }
};

const DELAY_MS = 50;

async function runAlgorithm({ name, graphData, params }) {
    console.log(`Starting ${name} with ${graphData.nodes.length} nodes`);

    // --- Data Structure Optimization ---
    const nodeCount = graphData.nodes.length;
    const nodeMap = new Map(); // ID -> Index
    const revNodeMap = new Array(nodeCount); // Index -> ID

    graphData.nodes.forEach((n, i) => {
        nodeMap.set(n.id, i);
        revNodeMap[i] = n.id;
    });

    const adj = new Array(nodeCount).fill(0).map(() => []);
    graphData.links.forEach(l => {
        const u = nodeMap.get((l.source && l.source.id !== undefined) ? l.source.id : l.source);
        const v = nodeMap.get((l.target && l.target.id !== undefined) ? l.target.id : l.target);
        if (u !== undefined && v !== undefined) {
            adj[u].push(v);
            adj[v].push(u);
        }
    });

    const coloring = new Int32Array(nodeCount).fill(0);

    const context = {
        nodeCount,
        adj,
        coloring,
        revNodeMap,
        params: { ...params }, // Copy params
        startTime: performance.now(),
        stepCount: 0,
        links: graphData.links,
        globalStartTime: performance.now(),
        timeLimit: (params.timeLimit || 10) * 1000, // ms
    };

    // Dynamic Runner Logic
    let currentMaxColors = 5;
    let solved = false;

    try {
        // Greedy algorithms don't need the loop, they just run once
        if (['basicGreedy', 'welshPowell', 'dSatur', 'rlf'].includes(name)) {
            context.params.maxColors = Infinity; // Let them use as many as needed
            await runSpecificAlgorithm(name, context);

            // Calculate used colors
            let maxC = 0;
            for (let i = 0; i < nodeCount; i++) if (coloring[i] > maxC) maxC = coloring[i];

            self.postMessage({
                type: 'DONE',
                payload: {
                    result: 'Completed',
                    metrics: {
                        time: performance.now() - context.globalStartTime,
                        colors: maxC
                    }
                }
            });
            return;
        }

        // Iterative/Meta-heuristics Loop
        while (!solved) {
            if (performance.now() - context.globalStartTime > context.timeLimit) {
                break; // Time limit reached
            }

            context.params.maxColors = currentMaxColors;
            coloring.fill(0); // Reset for new attempt

            // For meta-heuristics, we need them to respect the global time limit
            // We can pass a "soft limit" or just let them run and check periodically?
            // Existing algos use checkLimit() which checks stepCount.
            // We should update checkLimit to check time too.

            await runSpecificAlgorithm(name, context);

            const { count } = countConflicts(coloring, adj);
            if (count === 0) {
                solved = true;
                break;
            }

            // If not solved, increase colors
            currentMaxColors++;
            // Notify UI of color increase
            self.postMessage({
                type: 'STEP',
                payload: {
                    step: 0,
                    coloring: {}, // Empty update just for log/status?
                    conflicts: [],
                    metrics: { iter: 0, conflicts: count, time: performance.now() - context.globalStartTime, status: `Increasing Colors to ${currentMaxColors}` }
                }
            });
            await delay(100);
        }

        self.postMessage({
            type: 'DONE',
            payload: {
                result: solved ? 'Completed' : 'Limit Reached',
                metrics: {
                    time: performance.now() - context.globalStartTime,
                    colors: currentMaxColors
                }
            }
        });

    } catch (error) {
        if (error.message === 'LIMIT_REACHED') {
            // Should not happen with time limit check, but just in case
            self.postMessage({ type: 'DONE', payload: { result: 'Limit Reached' } });
        } else {
            console.error(error);
            self.postMessage({ type: 'ERROR', payload: { message: error.message } });
        }
    }
}

async function runSpecificAlgorithm(name, ctx) {
    switch (name) {
        case 'basicGreedy': await runBasicGreedy(ctx); break;
        case 'welshPowell': await runWelshPowell(ctx); break;
        case 'dSatur': await runDSatur(ctx); break;
        case 'rlf': await runRLF(ctx); break;
        case 'backtracking': await runBranchAndBoundIterative(ctx); break;
        case 'branchAndBound': await runBranchAndBoundIterative(ctx); break;
        case 'ilp': await runBasicGreedy(ctx); break; // Placeholder
        case 'simulatedAnnealing': await runSimulatedAnnealing(ctx); break;
        case 'geneticAlgorithm': await runGeneticAlgorithm(ctx); break;
        case 'tabuSearch': await runTabuSearch(ctx); break;
        default: await runBasicGreedy(ctx);
    }
}

// --- Helpers ---

function checkLimit(ctx) {
    ctx.stepCount++;
    // Check Time Limit
    if (performance.now() - ctx.globalStartTime > ctx.timeLimit) {
        throw new Error('LIMIT_REACHED');
    }
}

// Optimized conflict counter for Int32Array
function countConflicts(coloring, adj) {
    let count = 0;
    const conflicts = []; // Store pairs of indices
    for (let u = 0; u < coloring.length; u++) {
        if (coloring[u] === 0) continue; // Skip uncolored
        const neighbors = adj[u];
        for (let i = 0; i < neighbors.length; i++) {
            const v = neighbors[i];
            if (u < v && coloring[v] === coloring[u]) { // u < v to avoid duplicates
                count++;
                conflicts.push([u, v]);
            }
        }
    }
    return { count, conflicts };
}

function getLeastConflictingColor(u, adj, coloring, maxColors) {
    let bestColor = 1;
    let minConflicts = Infinity;

    for (let c = 1; c <= maxColors; c++) {
        let conflicts = 0;
        for (let i = 0; i < adj[u].length; i++) {
            const v = adj[u][i];
            if (coloring[v] === c) conflicts++;
        }

        if (conflicts < minConflicts) {
            minConflicts = conflicts;
            bestColor = c;
            if (minConflicts === 0) break; // Optimization
        }
    }
    return bestColor;
}

// Reconstruct object for UI (Expensive, so use sparingly)
function sendStep(ctx, step, overrideColoring = null, status = null) {
    const activeColoring = overrideColoring || ctx.coloring;
    const { count, conflicts } = countConflicts(activeColoring, ctx.adj);
    const elapsedTime = performance.now() - ctx.globalStartTime;

    // Convert array coloring to object map for UI
    const coloringMap = {};
    for (let i = 0; i < ctx.nodeCount; i++) {
        if (activeColoring[i] !== 0) {
            coloringMap[ctx.revNodeMap[i]] = activeColoring[i];
        }
    }

    // Convert conflict indices to ID objects/strings
    const conflictEdges = conflicts.map(([u, v]) => ({
        source: ctx.revNodeMap[u],
        target: ctx.revNodeMap[v]
    }));

    self.postMessage({
        type: 'STEP',
        payload: {
            step: step,
            coloring: coloringMap,
            conflicts: conflictEdges,
            metrics: { iter: step, conflicts: count, time: elapsedTime, status }
        }
    });
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Greedy Algorithms (Optimized) ---

async function runBasicGreedy(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || Infinity;

    for (let u = 0; u < nodeCount; u++) {
        checkLimit(ctx);
        const usedColors = new Set();
        const neighbors = adj[u];
        for (let i = 0; i < neighbors.length; i++) {
            const v = neighbors[i];
            if (coloring[v] !== 0) usedColors.add(coloring[v]);
        }

        let color = 1;
        while (usedColors.has(color)) color++;

        if (color <= maxColors) {
            coloring[u] = color;
        } else {
            coloring[u] = getLeastConflictingColor(u, adj, coloring, maxColors);
        }
        sendStep(ctx, u);
        await delay(DELAY_MS);
    }
}

async function runWelshPowell(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || Infinity;

    // Sort nodes by degree descending
    const degrees = adj.map((neighbors, i) => ({ index: i, degree: neighbors.length }));
    degrees.sort((a, b) => b.degree - a.degree);
    const sortedIndices = degrees.map(d => d.index);

    for (let i = 0; i < nodeCount; i++) {
        checkLimit(ctx);
        const u = sortedIndices[i];
        const usedColors = new Set();
        const neighbors = adj[u];
        for (let j = 0; j < neighbors.length; j++) {
            const v = neighbors[j];
            if (coloring[v] !== 0) usedColors.add(coloring[v]);
        }

        let color = 1;
        while (usedColors.has(color)) color++;

        if (color <= maxColors) {
            coloring[u] = color;
        } else {
            coloring[u] = getLeastConflictingColor(u, adj, coloring, maxColors);
        }
        sendStep(ctx, i);
        await delay(DELAY_MS);
    }
}

async function runDSatur(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || Infinity;
    const degrees = adj.map(n => n.length);
    const uncolored = new Set(Array.from({ length: nodeCount }, (_, i) => i));

    let step = 0;
    while (uncolored.size > 0) {
        checkLimit(ctx);
        let bestNode = -1;
        let maxSat = -1;
        let maxDeg = -1;

        // Find node with max saturation
        for (const u of uncolored) {
            const neighborColors = new Set();
            const neighbors = adj[u];
            for (let i = 0; i < neighbors.length; i++) {
                const v = neighbors[i];
                if (coloring[v] !== 0) neighborColors.add(coloring[v]);
            }
            const sat = neighborColors.size;

            if (sat > maxSat || (sat === maxSat && degrees[u] > maxDeg)) {
                maxSat = sat;
                maxDeg = degrees[u];
                bestNode = u;
            }
        }

        const usedColors = new Set();
        const neighbors = adj[bestNode];
        for (let i = 0; i < neighbors.length; i++) {
            const v = neighbors[i];
            if (coloring[v] !== 0) usedColors.add(coloring[v]);
        }

        let color = 1;
        while (usedColors.has(color)) color++;

        if (color <= maxColors) {
            coloring[bestNode] = color;
        } else {
            coloring[bestNode] = getLeastConflictingColor(bestNode, adj, coloring, maxColors);
        }
        uncolored.delete(bestNode);
        sendStep(ctx, step++);
        await delay(DELAY_MS);
    }
}

async function runRLF(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || Infinity;
    const uncolored = new Set(Array.from({ length: nodeCount }, (_, i) => i));
    let color = 1;
    let step = 0;

    while (uncolored.size > 0) {
        checkLimit(ctx);
        if (color > maxColors) {
            // Force assign remaining
            const remaining = Array.from(uncolored);
            for (const u of remaining) {
                coloring[u] = getLeastConflictingColor(u, adj, coloring, maxColors);
                sendStep(ctx, step++);
                await delay(DELAY_MS);
            }
            uncolored.clear();
            break;
        }

        // Find node with max degree in uncolored subgraph
        let bestNode = -1;
        let maxDeg = -1;
        for (const u of uncolored) {
            let deg = 0;
            const neighbors = adj[u];
            for (let i = 0; i < neighbors.length; i++) {
                if (uncolored.has(neighbors[i])) deg++;
            }
            if (deg > maxDeg) {
                maxDeg = deg;
                bestNode = u;
            }
        }

        if (bestNode === -1) break;

        const colorClass = new Set([bestNode]);
        coloring[bestNode] = color;
        uncolored.delete(bestNode);
        sendStep(ctx, step++);
        await delay(DELAY_MS);

        // Add non-adjacent nodes to color class
        while (true) {
            checkLimit(ctx);
            let candidate = -1;
            let maxCommon = -1;

            for (const u of uncolored) {
                // Check if adjacent to any node in colorClass
                let isAdjacent = false;
                const neighbors = adj[u];
                for (let i = 0; i < neighbors.length; i++) {
                    if (colorClass.has(neighbors[i])) {
                        isAdjacent = true;
                        break;
                    }
                }

                if (!isAdjacent) {
                    // Count common neighbors with uncolored set
                    let common = 0;
                    for (let i = 0; i < neighbors.length; i++) {
                        if (uncolored.has(neighbors[i])) common++;
                    }
                    if (common > maxCommon) {
                        maxCommon = common;
                        candidate = u;
                    }
                }
            }

            if (candidate !== -1) {
                colorClass.add(candidate);
                coloring[candidate] = color;
                uncolored.delete(candidate);
                sendStep(ctx, step++);
                await delay(DELAY_MS);
            } else {
                break;
            }
        }
        color++;
    }
}

// --- Exact Algorithms (Iterative) ---

async function runBranchAndBoundIterative(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || 4;

    // Best solution tracking
    let bestColoring = new Int32Array(nodeCount); // Starts empty
    let minConflicts = Infinity;

    // Stack for iterative backtracking: { index, color, conflicts }
    const stack = [{ index: 0, color: 1, conflicts: 0 }];
    let step = 0;

    // Reset coloring
    coloring.fill(0);

    try {
        while (stack.length > 0) {
            checkLimit(ctx);
            const current = stack[stack.length - 1]; // Peek
            const { index, color, conflicts } = current;

            // If we tried all colors for this node, backtrack
            if (color > maxColors) {
                coloring[index] = 0; // Reset
                stack.pop();
                if (stack.length > 0) {
                    stack[stack.length - 1].color++; // Try next color for previous node
                }
                continue;
            }

            // Calculate conflicts added by assigning `color` to `index`
            // Only check neighbors < index (already colored)
            let addedConflicts = 0;
            const neighbors = adj[index];
            for (let i = 0; i < neighbors.length; i++) {
                const v = neighbors[i];
                if (v < index && coloring[v] === color) {
                    addedConflicts++;
                }
            }

            const newConflicts = conflicts + addedConflicts;

            // Pruning: If newConflicts >= minConflicts, this branch cannot beat the best found
            if (newConflicts >= minConflicts) {
                current.color++;
                continue;
            }

            // Valid assignment (within bound)
            coloring[index] = color;

            // Visualization (throttled)
            if (step % 100 === 0) {
                sendStep(ctx, step);
                await delay(0);
            }
            step++;

            if (index === nodeCount - 1) {
                // Leaf reached (Complete Coloring)
                if (newConflicts < minConflicts) {
                    minConflicts = newConflicts;
                    bestColoring.set(coloring);
                    sendStep(ctx, step, bestColoring); // Show new best immediately
                    await delay(10);

                    if (minConflicts === 0) {
                        return; // Found optimal solution, stop.
                    }
                }
                // Backtrack to find others? 
                current.color++;
            } else {
                // Push next node
                stack.push({ index: index + 1, color: 1, conflicts: newConflicts });
            }
        }
    } finally {
        // Ensure we always return the best solution found, even if limit reached or error
        if (minConflicts !== Infinity) {
            coloring.set(bestColoring);
        }
        sendStep(ctx, step);
    }
}

// --- Meta-heuristics (Optimized) ---

function randomColoringArray(nodeCount, maxColors) {
    const c = new Int32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
        c[i] = Math.floor(Math.random() * maxColors) + 1;
    }
    return c;
}

async function runSimulatedAnnealing(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || 5;

    // Initial random coloring
    const initial = randomColoringArray(nodeCount, maxColors);
    coloring.set(initial);

    let currentConflicts = countConflicts(coloring, adj).count;
    let bestColoring = new Int32Array(coloring);
    let minConflicts = currentConflicts;

    let T = params.temperature || 1000;
    const initialT = T;
    const minT = 0.001;
    // Use a fixed maxSteps for cooling schedule, but loop respects global time
    const maxSteps = 5000;
    const coolingRate = Math.pow(minT / initialT, 1 / maxSteps);

    let step = 0;

    while (T > minT && currentConflicts > 0) {
        checkLimit(ctx);

        // Pick random node
        const u = Math.floor(Math.random() * nodeCount);
        const oldColor = coloring[u];
        const newColor = Math.floor(Math.random() * maxColors) + 1;

        if (oldColor === newColor) continue;

        // Incremental Delta Calculation (O(degree))
        let oldNodeConflicts = 0;
        let newNodeConflicts = 0;
        const neighbors = adj[u];
        for (let i = 0; i < neighbors.length; i++) {
            const v = neighbors[i];
            const vColor = coloring[v];
            if (vColor === oldColor) oldNodeConflicts++;
            if (vColor === newColor) newNodeConflicts++;
        }

        const delta = newNodeConflicts - oldNodeConflicts;

        if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
            coloring[u] = newColor;
            currentConflicts += delta;

            if (currentConflicts < minConflicts) {
                minConflicts = currentConflicts;
                bestColoring.set(coloring);
                sendStep(ctx, step, bestColoring); // Send BEST immediately
                await delay(10);
            }
        }

        T *= coolingRate;

        // Heartbeat: Send BEST so far
        if (step % 100 === 0) {
            sendStep(ctx, step, bestColoring);
            await delay(10);
        }
        step++;
    }
    coloring.set(bestColoring);
    sendStep(ctx, step);
}

async function runGeneticAlgorithm(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || 5;
    const popSize = params.population || 50;
    const generations = params.generations || 100;
    const mutationRate = 0.05;

    // Population: Array of Int32Arrays
    let population = [];
    for (let i = 0; i < popSize; i++) {
        population.push(randomColoringArray(nodeCount, maxColors));
    }

    const getFitness = (c) => -countConflicts(c, adj).count;

    let bestColoring = new Int32Array(population[0]);
    let maxFitness = getFitness(bestColoring);

    for (let gen = 0; gen < generations; gen++) {
        checkLimit(ctx);

        // Sort by fitness
        population.sort((a, b) => getFitness(b) - getFitness(a));

        const currentBest = population[0];
        const currentFitness = getFitness(currentBest);

        if (currentFitness > maxFitness) {
            maxFitness = currentFitness;
            bestColoring.set(currentBest);
            sendStep(ctx, gen, bestColoring);
            await delay(20);
        } else if (gen % 10 === 0) {
            sendStep(ctx, gen, bestColoring);
            await delay(10);
        }

        if (currentFitness === 0) break;

        // Elitism
        const newPop = [population[0], population[1]];

        while (newPop.length < popSize) {
            // Tournament Selection
            const p1 = population[Math.floor(Math.random() * popSize)];
            const p2 = population[Math.floor(Math.random() * popSize)];
            const parent1 = getFitness(p1) > getFitness(p2) ? p1 : p2;
            const parent2 = population[Math.floor(Math.random() * popSize)]; // Simple random second parent

            // One-Point Crossover
            const child = new Int32Array(nodeCount);
            const crossoverPoint = Math.floor(Math.random() * nodeCount);
            for (let i = 0; i < nodeCount; i++) {
                child[i] = (i < crossoverPoint) ? parent1[i] : parent2[i];
            }

            // Mutation
            if (Math.random() < mutationRate) {
                const u = Math.floor(Math.random() * nodeCount);
                child[u] = Math.floor(Math.random() * maxColors) + 1;
            }

            newPop.push(child);
        }
        population = newPop;
    }
    coloring.set(bestColoring);
    sendStep(ctx, generations);
}

async function runTabuSearch(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || 5;
    const maxIter = params.maxSteps || 500;
    const tabuTenure = 10; // Steps a move is tabu

    // Initial
    coloring.set(randomColoringArray(nodeCount, maxColors));
    let bestColoring = new Int32Array(coloring);
    let bestConflicts = countConflicts(coloring, adj).count;

    // Tabu List: Map of "nodeIndex-color" -> stepCount
    const tabuList = new Map();

    for (let step = 0; step < maxIter; step++) {
        checkLimit(ctx);
        if (bestConflicts === 0) break;

        const { count, conflicts } = countConflicts(coloring, adj);
        // conflicts is array of [u, v] pairs

        // Identify conflicting nodes
        const conflictingNodes = new Set();
        for (const [u, v] of conflicts) {
            conflictingNodes.add(u);
            conflictingNodes.add(v);
        }

        // If no conflicts (should be caught by bestConflicts === 0), break
        if (conflictingNodes.size === 0) break;

        let bestMove = null;
        let bestMoveDelta = Infinity;

        // Neighborhood Search: Try changing color of conflicting nodes
        // Iterate ALL conflicting nodes (Critical Neighbor Search)
        for (const u of conflictingNodes) {
            const oldColor = coloring[u];

            // Try all other colors
            for (let c = 1; c <= maxColors; c++) {
                if (c === oldColor) continue;

                // Calculate delta
                let oldNodeConflicts = 0;
                let newNodeConflicts = 0;
                const neighbors = adj[u];
                for (let i = 0; i < neighbors.length; i++) {
                    const v = neighbors[i];
                    const vColor = coloring[v];
                    if (vColor === oldColor) oldNodeConflicts++;
                    if (vColor === c) newNodeConflicts++;
                }
                const delta = newNodeConflicts - oldNodeConflicts;

                // Tabu check
                const moveKey = `${u}-${c}`;
                const isTabu = tabuList.has(moveKey) && tabuList.get(moveKey) > step;

                // Aspiration Criteria: Allow tabu move if it improves GLOBAL best
                if (!isTabu || (count + delta < bestConflicts)) {
                    if (delta < bestMoveDelta) {
                        bestMoveDelta = delta;
                        bestMove = { u, newColor: c, oldColor };
                    }
                }
            }
        }

        if (bestMove) {
            coloring[bestMove.u] = bestMove.newColor;

            // Add reverse move to tabu list
            tabuList.set(`${bestMove.u}-${bestMove.oldColor}`, step + tabuTenure);

            // Clean up old tabu entries occasionally to save memory (optional)

            const currentConflicts = count + bestMoveDelta;
            if (currentConflicts < bestConflicts) {
                bestConflicts = currentConflicts;
                bestColoring.set(coloring);
                sendStep(ctx, step, bestColoring);
                await delay(10);
            }
        } else {
            // Stuck? Random restart or perturbation could go here
            // For now, just break or continue
            break;
        }

        if (step % 50 === 0) {
            sendStep(ctx, step, bestColoring);
            await delay(10);
        }
    }
    coloring.set(bestColoring);
    sendStep(ctx, maxIter);
}
