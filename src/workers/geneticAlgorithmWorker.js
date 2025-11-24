import { setupContext, sendStep, finish, delay, checkGlobalTime, countConflicts, randomColoringArray, getDynamicThreshold } from './workerUtils';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);
    let currentMaxColors = 3;
    let solved = false;

    while (!solved) {
        if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

        const popSize = ctx.params.population || 50;
        let population = [];
        for (let i = 0; i < popSize; i++) population.push(randomColoringArray(ctx.nodeCount, currentMaxColors));

        const getConflictCount = (c) => countConflicts(c, ctx.adj).count;
        let bestColoring = new Int32Array(population[0]);
        let minConflicts = getConflictCount(bestColoring);

        let lastCheckTime = performance.now();
        let bestConflictsAtLastCheck = minConflicts;
        let gen = 0;
        let stagnated = false;

        ctx.coloring.set(bestColoring);
        sendStep(ctx, 0, ctx.coloring, `GA Init k=${currentMaxColors}`);
        await delay(20);

        while (minConflicts > 0) {
            if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

            // Check Stagnation
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

            population.sort((a, b) => getConflictCount(a) - getConflictCount(b));
            const currentBest = population[0];
            const currentConflicts = getConflictCount(currentBest);

            if (currentConflicts < minConflicts) {
                minConflicts = currentConflicts;
                bestColoring.set(currentBest);
                sendStep(ctx, gen, bestColoring, `GA Best: ${minConflicts}`);
                await delay(5);
            }

            const newPop = [population[0], population[1]];
            while (newPop.length < popSize) {
                const p1 = population[Math.floor(Math.random() * popSize)];
                const p2 = population[Math.floor(Math.random() * popSize)];
                const parent1 = getConflictCount(p1) < getConflictCount(p2) ? p1 : p2;
                const parent2 = population[Math.floor(Math.random() * popSize)];

                const child = new Int32Array(ctx.nodeCount);
                const cxPoint = Math.floor(Math.random() * ctx.nodeCount);
                for (let i = 0; i < ctx.nodeCount; i++) child[i] = (i < cxPoint) ? parent1[i] : parent2[i];

                if (Math.random() < 0.05) {
                    const u = Math.floor(Math.random() * ctx.nodeCount);
                    child[u] = Math.floor(Math.random() * currentMaxColors) + 1;
                }
                newPop.push(child);
            }
            population = newPop;
            gen++;

            if (gen % 20 === 0) {
                ctx.coloring.set(bestColoring);
                sendStep(ctx, gen, bestColoring, `GA Gen ${gen}`);
                await delay(0);
            }
        }

        if (!stagnated && minConflicts === 0) {
            ctx.coloring.set(bestColoring);
            solved = true;
        } else {
            // Dynamic Jump
            if (minConflicts > 100) currentMaxColors += 2;
            else currentMaxColors++;
        }
    }
    finish(ctx, 'Completed');
};