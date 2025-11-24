import { setupContext, sendStep, finish, delay, DELAY_MS } from './workerUtils';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);
    const uncolored = new Set(Array.from({ length: ctx.nodeCount }, (_, i) => i));
    const degrees = ctx.adj.map(n => n.length);

    let step = 0;
    while (uncolored.size > 0) {
        let bestNode = -1, maxSat = -1, maxDeg = -1;

        for (const u of uncolored) {
            const neighborColors = new Set();
            const neighbors = ctx.adj[u];
            for (let i = 0; i < neighbors.length; i++)
                if (ctx.coloring[neighbors[i]] !== 0) neighborColors.add(ctx.coloring[neighbors[i]]);

            const sat = neighborColors.size;
            if (sat > maxSat || (sat === maxSat && degrees[u] > maxDeg)) {
                maxSat = sat; maxDeg = degrees[u]; bestNode = u;
            }
        }

        const usedColors = new Set();
        ctx.adj[bestNode].forEach(v => { if (ctx.coloring[v] !== 0) usedColors.add(ctx.coloring[v]); });

        let color = 1;
        while (usedColors.has(color)) color++;
        ctx.coloring[bestNode] = color;

        uncolored.delete(bestNode);
        sendStep(ctx, step++);
        await delay(DELAY_MS);
    }
    finish(ctx, 'Completed');
};

