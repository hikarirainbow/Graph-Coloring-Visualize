import { setupContext, sendStep, finish, delay, checkGlobalTime, countConflicts, randomColoringArray, getDynamicThreshold } from './workerUtils';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);
    let currentMaxColors = 3;
    let solved = false;

    while (!solved) {
        if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

        const initial = randomColoringArray(ctx.nodeCount, currentMaxColors);
        ctx.coloring.set(initial);

        let currentConflicts = countConflicts(ctx.coloring, ctx.adj).count;
        let bestColoring = new Int32Array(ctx.coloring);
        let minConflicts = currentConflicts;
        let bestConflictsAtLastCheck = minConflicts;
        let stagnated = false;

        let T = ctx.params.temperature || 1000;
        const coolingRate = 1 - (1 / (T * 2));
        const minT = 0.001;
        let lastCheckTime = performance.now();
        let step = 0;

        sendStep(ctx, 0, ctx.coloring, `SA Init k=${currentMaxColors}`);
        await delay(20);

        while (currentConflicts > 0 && T > minT) {
            if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

            if (performance.now() - lastCheckTime > ctx.stagnationTime) {
                const threshold = getDynamicThreshold(bestConflictsAtLastCheck);
                if ((bestConflictsAtLastCheck - minConflicts) < threshold) {
                    stagnated = true;
                    break;
                } else {
                    bestConflictsAtLastCheck = minConflicts;
                    lastCheckTime = performance.now();
                }
            }

            const u = Math.floor(Math.random() * ctx.nodeCount);
            const oldColor = ctx.coloring[u];
            const newColor = Math.floor(Math.random() * currentMaxColors) + 1;

            if (oldColor !== newColor) {
                let delta = 0;
                for (const v of ctx.adj[u]) {
                    if (ctx.coloring[v] === oldColor) delta--;
                    if (ctx.coloring[v] === newColor) delta++;
                }

                if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
                    ctx.coloring[u] = newColor;
                    currentConflicts += delta;
                    if (currentConflicts < minConflicts) {
                        minConflicts = currentConflicts;
                        bestColoring.set(ctx.coloring);
                        sendStep(ctx, step, bestColoring, `SA Best: ${minConflicts}`);
                        await delay(5);
                    }
                }
            }
            T *= coolingRate;
            step++;
            if (step % 200 === 0) { sendStep(ctx, step, bestColoring); await delay(0); }
        }

        if (!stagnated && minConflicts === 0) {
            ctx.coloring.set(bestColoring);
            solved = true;
        } else {
            if (minConflicts > 100) currentMaxColors += 2;
            else currentMaxColors++;
        }
    }
    finish(ctx, 'Completed');
};