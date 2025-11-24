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

const DELAY_MS = 15; // Tăng tốc độ visualize
const STAGNATION_TIME_MS = 5000; // 5 giây

// --- Dynamic Threshold Logic ---
// Trả về số lượng conflict tối thiểu cần giảm được để reset bộ đếm stagnation
function getDynamicThreshold(currentConflicts) {
    if (currentConflicts > 100) return 5; // Đang sai quá nhiều -> Yêu cầu giảm mạnh mới tính là tiến bộ
    if (currentConflicts > 80) return 4;
    if (currentConflicts > 50) return 3;
    if (currentConflicts > 20) return 2;
    return 1; // Giai đoạn cuối -> Yêu cầu giảm từng chút một là ok
}

async function runAlgorithm({ name, graphData, params }) {
    console.log(`Starting ${name} with ${graphData.nodes.length} nodes`);

    // --- Setup Graph Data ---
    const nodeCount = graphData.nodes.length;
    const nodeMap = new Map();
    const revNodeMap = new Array(nodeCount);

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
        params: { ...params },
        startTime: performance.now(),
        stepCount: 0,
        links: graphData.links,
        globalStartTime: performance.now(),
        timeLimit: (params.timeLimit || 10) * 1000,
    };

    // --- Logic Start Colors ---
    // Greedy/Exact thì kệ nó (Infinity hoặc 4), còn Meta-heuristic thì bắt đầu từ 3
    let currentMaxColors = ['basicGreedy', 'welshPowell', 'dSatur', 'rlf', 'ilp'].includes(name) ? Infinity : 3;
    let solved = false;

    try {
        // Nhóm Greedy chạy 1 lần là xong
        if (context.params.maxColors === Infinity) {
            await runSpecificAlgorithm(name, context);
            finish(context, 'Completed');
            return;
        }

        // Nhóm Loop (Meta-heuristics)
        while (!solved) {
            if (performance.now() - context.globalStartTime > context.timeLimit) {
                finish(context, 'Limit Reached');
                return;
            }

            context.params.maxColors = currentMaxColors;

            // Reset màu cho Backtracking (Meta-heuristic tự init bên trong)
            if (name === 'backtracking' || name === 'branchAndBound') {
                coloring.fill(0);
            }

            // Chạy thuật toán (sẽ tự thoát nếu dính Dynamic Stagnation)
            await runSpecificAlgorithm(name, context);

            const { count } = countConflicts(coloring, adj);

            if (count === 0) {
                solved = true;
                break;
            }

            // Tăng màu
            currentMaxColors++;

            self.postMessage({
                type: 'STEP',
                payload: {
                    step: 0,
                    conflicts: [],
                    metrics: {
                        iter: 0,
                        conflicts: count,
                        time: performance.now() - context.globalStartTime,
                        status: `Dynamic Stagnation. Boosting Colors to ${currentMaxColors}...`
                    }
                }
            });
            await delay(50);
        }

        finish(context, solved ? 'Completed' : 'Limit Reached');

    } catch (error) {
        console.error(error);
        self.postMessage({ type: 'ERROR', payload: { message: error.message } });
    }
}

function finish(ctx, result) {
    let maxC = 0;
    for (let i = 0; i < ctx.nodeCount; i++) if (ctx.coloring[i] > maxC) maxC = ctx.coloring[i];

    self.postMessage({
        type: 'DONE',
        payload: {
            result: result,
            metrics: {
                time: performance.now() - ctx.globalStartTime,
                colors: maxC
            },
            coloring: mapColoring(ctx),
        }
    });
}

function mapColoring(ctx) {
    const coloringMap = {};
    for (let i = 0; i < ctx.nodeCount; i++) {
        if (ctx.coloring[i] !== 0) {
            coloringMap[ctx.revNodeMap[i]] = ctx.coloring[i];
        }
    }
    return coloringMap;
}

async function runSpecificAlgorithm(name, ctx) {
    switch (name) {
        case 'basicGreedy': await runBasicGreedy(ctx); break;
        case 'welshPowell': await runWelshPowell(ctx); break;
        case 'dSatur': await runDSatur(ctx); break;
        case 'rlf': await runRLF(ctx); break;
        case 'backtracking': await runBranchAndBoundIterative(ctx); break;
        case 'branchAndBound': await runBranchAndBoundIterative(ctx); break;
        case 'ilp': await runBasicGreedy(ctx); break;
        case 'simulatedAnnealing': await runSimulatedAnnealing(ctx); break;
        case 'geneticAlgorithm': await runGeneticAlgorithm(ctx); break;
        case 'tabuSearch': await runTabuSearch(ctx); break;
        default: await runBasicGreedy(ctx);
    }
}

// --- Common Helpers ---
function checkGlobalTime(ctx) {
    return (performance.now() - ctx.globalStartTime > ctx.timeLimit);
}

function countConflicts(coloring, adj) {
    let count = 0;
    const conflicts = [];
    for (let u = 0; u < coloring.length; u++) {
        if (coloring[u] === 0) continue;
        const neighbors = adj[u];
        for (let i = 0; i < neighbors.length; i++) {
            const v = neighbors[i];
            if (u < v && coloring[v] === coloring[u]) {
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
            if (coloring[adj[u][i]] === c) conflicts++;
        }
        if (conflicts < minConflicts) {
            minConflicts = conflicts;
            bestColor = c;
            if (minConflicts === 0) break;
        }
    }
    return bestColor;
}

function sendStep(ctx, step, overrideColoring = null, status = null) {
    const activeColoring = overrideColoring || ctx.coloring;
    const { count, conflicts } = countConflicts(activeColoring, ctx.adj);
    const elapsedTime = performance.now() - ctx.globalStartTime;

    const coloringMap = {};
    for (let i = 0; i < ctx.nodeCount; i++) {
        if (activeColoring[i] !== 0) {
            coloringMap[ctx.revNodeMap[i]] = activeColoring[i];
        }
    }

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

// --- Greedy & Exact (Giữ nguyên logic cũ) ---
async function runBasicGreedy(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || Infinity;
    for (let u = 0; u < nodeCount; u++) {
        const usedColors = new Set();
        const neighbors = adj[u];
        for (let i = 0; i < neighbors.length; i++) { if (coloring[neighbors[i]] !== 0) usedColors.add(coloring[neighbors[i]]); }
        let color = 1;
        while (usedColors.has(color)) color++;
        coloring[u] = (color <= maxColors) ? color : getLeastConflictingColor(u, adj, coloring, maxColors);
        sendStep(ctx, u);
        await delay(DELAY_MS);
    }
}
async function runWelshPowell(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || Infinity;
    const degrees = adj.map((neighbors, i) => ({ index: i, degree: neighbors.length }));
    degrees.sort((a, b) => b.degree - a.degree);
    const sortedIndices = degrees.map(d => d.index);
    for (let i = 0; i < nodeCount; i++) {
        const u = sortedIndices[i];
        const usedColors = new Set();
        const neighbors = adj[u];
        for (let j = 0; j < neighbors.length; j++) { if (coloring[neighbors[j]] !== 0) usedColors.add(coloring[neighbors[j]]); }
        let color = 1;
        while (usedColors.has(color)) color++;
        coloring[u] = (color <= maxColors) ? color : getLeastConflictingColor(u, adj, coloring, maxColors);
        sendStep(ctx, i);
        await delay(DELAY_MS);
    }
}
async function runDSatur(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || Infinity;
    const uncolored = new Set(Array.from({ length: nodeCount }, (_, i) => i));
    let step = 0;
    while (uncolored.size > 0) {
        let bestNode = -1, maxSat = -1, maxDeg = -1;
        for (const u of uncolored) {
            const neighborColors = new Set();
            const neighbors = adj[u];
            for (let i = 0; i < neighbors.length; i++) if (coloring[neighbors[i]] !== 0) neighborColors.add(coloring[neighbors[i]]);
            const sat = neighborColors.size;
            if (sat > maxSat || (sat === maxSat && degrees[u] > maxDeg)) { maxSat = sat; maxDeg = degrees[u]; bestNode = u; }
        }
        const usedColors = new Set();
        const neighbors = adj[bestNode];
        for (let i = 0; i < neighbors.length; i++) if (coloring[neighbors[i]] !== 0) usedColors.add(coloring[neighbors[i]]);
        let color = 1;
        while (usedColors.has(color)) color++;
        coloring[bestNode] = (color <= maxColors) ? color : getLeastConflictingColor(bestNode, adj, coloring, maxColors);
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
        if (color > maxColors) {
            const remaining = Array.from(uncolored);
            for (const u of remaining) { coloring[u] = getLeastConflictingColor(u, adj, coloring, maxColors); sendStep(ctx, step++); await delay(DELAY_MS); }
            uncolored.clear();
            break;
        }
        let bestNode = -1, maxDeg = -1;
        for (const u of uncolored) {
            let deg = 0;
            const neighbors = adj[u];
            for (let i = 0; i < neighbors.length; i++) if (uncolored.has(neighbors[i])) deg++;
            if (deg > maxDeg) { maxDeg = deg; bestNode = u; }
        }
        if (bestNode === -1) break;
        const colorClass = new Set([bestNode]);
        coloring[bestNode] = color;
        uncolored.delete(bestNode);
        sendStep(ctx, step++);
        await delay(DELAY_MS);
        while (true) {
            let candidate = -1, maxCommon = -1;
            for (const u of uncolored) {
                let isAdjacent = false;
                const neighbors = adj[u];
                for (let i = 0; i < neighbors.length; i++) if (colorClass.has(neighbors[i])) { isAdjacent = true; break; }
                if (!isAdjacent) {
                    let common = 0;
                    for (let i = 0; i < neighbors.length; i++) if (uncolored.has(neighbors[i])) common++;
                    if (common > maxCommon) { maxCommon = common; candidate = u; }
                }
            }
            if (candidate !== -1) { colorClass.add(candidate); coloring[candidate] = color; uncolored.delete(candidate); sendStep(ctx, step++); await delay(DELAY_MS); }
            else break;
        }
        color++;
    }
}
async function runBranchAndBoundIterative(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors || 4;
    let bestColoring = new Int32Array(nodeCount);
    let minConflicts = Infinity;
    const stack = [{ index: 0, color: 1, conflicts: 0 }];
    let step = 0;
    const degrees = adj.map((neighbors, i) => ({ index: i, degree: neighbors.length }));
    degrees.sort((a, b) => b.degree - a.degree);
    const sortedIndices = degrees.map(d => d.index);
    coloring.fill(0);
    while (stack.length > 0) {
        if (checkGlobalTime(ctx)) return;
        const current = stack[stack.length - 1];
        const { index, color, conflicts } = current;
        const u = sortedIndices[index];
        if (color > maxColors) {
            coloring[u] = 0;
            stack.pop();
            if (stack.length > 0) stack[stack.length - 1].color++;
            continue;
        }
        let addedConflicts = 0;
        const neighbors = adj[u];
        for (let i = 0; i < neighbors.length; i++) { const v = neighbors[i]; if (coloring[v] === color) addedConflicts++; }
        const newConflicts = conflicts + addedConflicts;
        if (newConflicts >= minConflicts) { current.color++; continue; }
        coloring[u] = color;
        if (step % 200 === 0) { sendStep(ctx, step); await delay(0); }
        step++;
        if (index === nodeCount - 1) {
            const { count } = countConflicts(coloring, adj);
            if (count < minConflicts) {
                minConflicts = count;
                bestColoring.set(coloring);
                sendStep(ctx, step, bestColoring);
                await delay(10);
                if (minConflicts === 0) return;
            }
            current.color++;
        } else { stack.push({ index: index + 1, color: 1, conflicts: newConflicts }); }
    }
    if (minConflicts !== Infinity) coloring.set(bestColoring);
    sendStep(ctx, step);
}

// --- Meta-heuristics (UPDATED with DYNAMIC THRESHOLD) ---

function randomColoringArray(nodeCount, maxColors) {
    const c = new Int32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
        c[i] = Math.floor(Math.random() * maxColors) + 1;
    }
    return c;
}

async function runSimulatedAnnealing(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors;

    // Init & Send visual immediately
    const initial = randomColoringArray(nodeCount, maxColors);
    coloring.set(initial);
    sendStep(ctx, 0, coloring, 'Initializing SA...');
    await delay(50);

    let currentConflicts = countConflicts(coloring, adj).count;
    let bestColoring = new Int32Array(coloring);
    let minConflicts = currentConflicts;

    // Checkpoint để tính Dynamic Stagnation
    let bestConflictsAtLastCheck = minConflicts;

    let T = params.temperature || 1000;
    const coolingRate = 0.9995;
    const minT = 0.001;

    let step = 0;
    let lastCheckTime = performance.now();

    while (currentConflicts > 0 && T > minT) {
        if (checkGlobalTime(ctx)) return;

        // --- DYNAMIC STAGNATION CHECK ---
        if (performance.now() - lastCheckTime > STAGNATION_TIME_MS) {
            const threshold = getDynamicThreshold(bestConflictsAtLastCheck);
            const improvement = bestConflictsAtLastCheck - minConflicts;

            if (improvement < threshold) {
                // Không đạt chỉ tiêu -> Thoát để tăng màu
                sendStep(ctx, step, bestColoring, `SA Stagnated (Imp: ${improvement} < Thres: ${threshold}). Retry...`);
                return;
            } else {
                // Đạt chỉ tiêu -> Reset mốc check
                bestConflictsAtLastCheck = minConflicts;
                lastCheckTime = performance.now();
            }
        }

        // Logic SA
        const u = Math.floor(Math.random() * nodeCount);
        const oldColor = coloring[u];
        const newColor = Math.floor(Math.random() * maxColors) + 1;
        if (oldColor === newColor) continue;

        let oldNodeConflicts = 0, newNodeConflicts = 0;
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
                sendStep(ctx, step, bestColoring, `SA Best: ${minConflicts} (Thres: ${getDynamicThreshold(minConflicts)})`);
                await delay(5);
            }
        }
        T *= coolingRate;
        step++;
        if (step % 200 === 0) { sendStep(ctx, step, bestColoring); await delay(0); }
    }
    coloring.set(bestColoring);
}

async function runGeneticAlgorithm(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors;
    const popSize = params.population || 50;
    const mutationRate = 0.05;

    let population = [];
    for (let i = 0; i < popSize; i++) population.push(randomColoringArray(nodeCount, maxColors));

    const getFitness = (c) => -countConflicts(c, adj).count;

    let bestColoring = new Int32Array(population[0]);
    let maxFitness = getFitness(bestColoring); // Negative value
    let lastCheckTime = performance.now();
    let bestFitnessAtLastCheck = maxFitness;
    let gen = 0;

    coloring.set(bestColoring);
    sendStep(ctx, 0, coloring, 'Initializing GA...');
    await delay(50);

    while (maxFitness < 0) {
        if (checkGlobalTime(ctx)) return;

        // --- DYNAMIC STAGNATION CHECK ---
        if (performance.now() - lastCheckTime > STAGNATION_TIME_MS) {
            const currentConflicts = -maxFitness;
            const prevConflicts = -bestFitnessAtLastCheck;
            const threshold = getDynamicThreshold(prevConflicts);
            const improvement = prevConflicts - currentConflicts;

            if (improvement < threshold) {
                sendStep(ctx, gen, bestColoring, `GA Stagnated (Imp: ${improvement} < Thres: ${threshold}). Retry...`);
                return;
            } else {
                bestFitnessAtLastCheck = maxFitness;
                lastCheckTime = performance.now();
            }
        }

        population.sort((a, b) => getFitness(b) - getFitness(a));
        const currentBest = population[0];
        const currentFitness = getFitness(currentBest);

        if (currentFitness > maxFitness) {
            maxFitness = currentFitness;
            bestColoring.set(currentBest);
            sendStep(ctx, gen, bestColoring, `GA Gen ${gen}: Best ${-maxFitness}`);
            await delay(10);
        }

        const newPop = [population[0], population[1]];
        while (newPop.length < popSize) {
            const p1 = population[Math.floor(Math.random() * popSize)];
            const p2 = population[Math.floor(Math.random() * popSize)];
            const parent1 = getFitness(p1) > getFitness(p2) ? p1 : p2;
            const parent2 = population[Math.floor(Math.random() * popSize)];
            const child = new Int32Array(nodeCount);
            const crossoverPoint = Math.floor(Math.random() * nodeCount);
            for (let i = 0; i < nodeCount; i++) child[i] = (i < crossoverPoint) ? parent1[i] : parent2[i];
            if (Math.random() < mutationRate) {
                const u = Math.floor(Math.random() * nodeCount);
                child[u] = Math.floor(Math.random() * maxColors) + 1;
            }
            newPop.push(child);
        }
        population = newPop;
        gen++;
        if (gen % 20 === 0) { coloring.set(bestColoring); sendStep(ctx, gen, bestColoring); await delay(0); }
    }
    coloring.set(bestColoring);
}

async function runTabuSearch(ctx) {
    const { nodeCount, adj, coloring, params } = ctx;
    const maxColors = params.maxColors;
    const tabuTenure = 15;

    coloring.set(randomColoringArray(nodeCount, maxColors));
    sendStep(ctx, 0, coloring, 'Initializing Tabu...');
    await delay(50);

    let bestColoring = new Int32Array(coloring);
    let bestConflicts = countConflicts(coloring, adj).count;
    let bestConflictsAtLastCheck = bestConflicts;

    const tabuList = new Map();
    let step = 0;
    let lastCheckTime = performance.now();

    while (bestConflicts > 0) {
        if (checkGlobalTime(ctx)) return;

        // --- DYNAMIC STAGNATION CHECK ---
        if (performance.now() - lastCheckTime > STAGNATION_TIME_MS) {
            const threshold = getDynamicThreshold(bestConflictsAtLastCheck);
            const improvement = bestConflictsAtLastCheck - bestConflicts;

            if (improvement < threshold) {
                sendStep(ctx, step, bestColoring, `Tabu Stagnated (Imp: ${improvement} < Thres: ${threshold}). Retry...`);
                return;
            } else {
                bestConflictsAtLastCheck = bestConflicts;
                lastCheckTime = performance.now();
            }
        }

        const { count, conflicts } = countConflicts(coloring, adj);
        const conflictingNodes = new Set();
        for (const [u, v] of conflicts) { conflictingNodes.add(u); conflictingNodes.add(v); }
        if (conflictingNodes.size === 0) break;

        let bestMove = null;
        let bestMoveDelta = Infinity;

        for (const u of conflictingNodes) {
            const oldColor = coloring[u];
            for (let c = 1; c <= maxColors; c++) {
                if (c === oldColor) continue;
                let delta = 0;
                const neighbors = adj[u];
                for (let i = 0; i < neighbors.length; i++) {
                    const v = neighbors[i];
                    const vColor = coloring[v];
                    if (vColor === oldColor) delta--;
                    if (vColor === c) delta++;
                }
                const moveKey = `${u}-${c}`;
                const isTabu = tabuList.has(moveKey) && tabuList.get(moveKey) > step;
                if (!isTabu || (count + delta < bestConflicts)) {
                    if (delta < bestMoveDelta) { bestMoveDelta = delta; bestMove = { u, newColor: c, oldColor }; }
                }
            }
        }

        if (bestMove) {
            coloring[bestMove.u] = bestMove.newColor;
            tabuList.set(`${bestMove.u}-${bestMove.oldColor}`, step + tabuTenure);
            const currentConflicts = count + bestMoveDelta;
            if (currentConflicts < bestConflicts) {
                bestConflicts = currentConflicts;
                bestColoring.set(coloring);
                sendStep(ctx, step, bestColoring, `Tabu Best: ${bestConflicts}`);
                await delay(5);
            }
        }
        step++;
        if (step % 50 === 0) { sendStep(ctx, step, bestColoring); await delay(0); }
    }
    coloring.set(bestColoring);
}