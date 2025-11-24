// Các hàm tiện ích dùng chung cho tất cả Worker

export const DELAY_MS = 15;
export const STAGNATION_TIME_MS = 5000;

export function setupContext(graphData, params) {
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

    return {
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
}

export function countConflicts(coloring, adj) {
    let count = 0;
    const conflicts = [];
    for (let u = 0; u < coloring.length; u++) {
        if (coloring[u] === 0) continue;
        const neighbors = adj[u];
        for (let i = 0; i < neighbors.length; i++) {
            const v = neighbors[i];
            if (coloring[v] !== 0 && u < v && coloring[v] === coloring[u]) {
                count++;
                conflicts.push([u, v]);
            }
        }
    }
    return { count, conflicts };
}

export function sendStep(ctx, step, overrideColoring = null, status = null) {
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

export function finish(ctx, result) {
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

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function checkGlobalTime(ctx) {
    return (performance.now() - ctx.globalStartTime > ctx.timeLimit);
}

export function getLeastConflictingColor(u, adj, coloring, maxColors) {
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

export function getDynamicThreshold(currentConflicts) {
    if (currentConflicts > 100) return 5;
    if (currentConflicts > 50) return 3;
    if (currentConflicts > 20) return 2;
    return 1;
}

export function randomColoringArray(nodeCount, maxColors) {
    const c = new Int32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
        c[i] = Math.floor(Math.random() * maxColors) + 1;
    }
    return c;
}