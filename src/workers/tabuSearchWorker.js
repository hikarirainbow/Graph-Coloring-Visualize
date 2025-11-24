import { setupContext, sendStep, finish, delay, checkGlobalTime, countConflicts, randomColoringArray, getDynamicThreshold, STAGNATION_TIME_MS } from './workerUtils';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);
    let currentMaxColors = 3;
    let solved = false;

    while (!solved) {
        if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

        ctx.coloring.set(randomColoringArray(ctx.nodeCount, currentMaxColors));
        let bestColoring = new Int32Array(ctx.coloring);
        let bestConflicts = countConflicts(ctx.coloring, ctx.adj).count;
        let bestConflictsAtLastCheck = bestConflicts;

        const tabuList = new Map();
        let step = 0;
        let lastCheckTime = performance.now();

        self.postMessage({ type: 'STEP', payload: { step: 0, conflicts: [], metrics: { iter: 0, conflicts: bestConflicts, time: performance.now() - ctx.globalStartTime, status: `Tabu k=${currentMaxColors}` } } });

        while (bestConflicts > 0) {
            if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

            if (performance.now() - lastCheckTime > STAGNATION_TIME_MS) {
                const threshold = getDynamicThreshold(bestConflictsAtLastCheck);
                if ((bestConflictsAtLastCheck - bestConflicts) < threshold) break;
                bestConflictsAtLastCheck = bestConflicts;
                lastCheckTime = performance.now();
            }

            const { conflicts } = countConflicts(ctx.coloring, ctx.adj);
            const conflictingNodes = new Set();
            for (const [u, v] of conflicts) { conflictingNodes.add(u); conflictingNodes.add(v); }
            if (conflictingNodes.size === 0) break;

            let bestMove = null;
            let bestMoveDelta = Infinity;

            for (const u of conflictingNodes) {
                const oldColor = ctx.coloring[u];
                for (let c = 1; c <= currentMaxColors; c++) {
                    if (c === oldColor) continue;
                    let delta = 0;
                    for (const v of ctx.adj[u]) {
                        if (ctx.coloring[v] === oldColor) delta--;
                        if (ctx.coloring[v] === c) delta++;
                    }
                    const moveKey = `${u}-${c}`;
                    const isTabu = tabuList.has(moveKey) && tabuList.get(moveKey) > step;

                    const currentC = countConflicts(ctx.coloring, ctx.adj).count;
                    if (!isTabu || (currentC + delta < bestConflicts)) {
                        if (delta < bestMoveDelta) { bestMoveDelta = delta; bestMove = { u, newColor: c, oldColor }; }
                    }
                }
            }

            if (bestMove) {
                ctx.coloring[bestMove.u] = bestMove.newColor;
                tabuList.set(`${bestMove.u}-${bestMove.oldColor}`, step + 15);

                // Recalculate conflicts accurately for global best check
                const currentC = countConflicts(ctx.coloring, ctx.adj).count;
                if (currentC < bestConflicts) {
                    bestConflicts = currentC;
                    bestColoring.set(ctx.coloring);
                    sendStep(ctx, step, bestColoring, `Tabu Best: ${bestConflicts}`);
                    await delay(5);
                }
            }
            step++;
            if (step % 50 === 0) { sendStep(ctx, step, bestColoring); await delay(0); }
        }

        if (bestConflicts === 0) {
            ctx.coloring.set(bestColoring);
            solved = true;
        } else {
            currentMaxColors++;
        }
    }
    finish(ctx, 'Completed');
};