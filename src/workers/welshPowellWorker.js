import { setupContext, sendStep, finish, delay, DELAY_MS } from './workerUtils';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);

    const degrees = ctx.adj.map((neighbors, i) => ({ index: i, degree: neighbors.length }));
    degrees.sort((a, b) => b.degree - a.degree); // Sort giảm dần
    const sortedIndices = degrees.map(d => d.index);

    for (let i = 0; i < ctx.nodeCount; i++) {
        const u = sortedIndices[i];
        const usedColors = new Set();
        const neighbors = ctx.adj[u];
        for (let j = 0; j < neighbors.length; j++) {
            if (ctx.coloring[neighbors[j]] !== 0) usedColors.add(ctx.coloring[neighbors[j]]);
        }
        let color = 1;
        while (usedColors.has(color)) color++;
        ctx.coloring[u] = color;

        sendStep(ctx, i);
        await delay(DELAY_MS);
    }
    finish(ctx, 'Completed');
};