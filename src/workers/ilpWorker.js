import { setupContext, sendStep, finish, delay, DELAY_MS } from './workerUtils';
self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);
    // ILP Placeholder: Run Greedy logic
    for (let u = 0; u < ctx.nodeCount; u++) {
        const usedColors = new Set();
        for (const v of ctx.adj[u]) if (ctx.coloring[v] !== 0) usedColors.add(ctx.coloring[v]);
        let color = 1;
        while (usedColors.has(color)) color++;
        ctx.coloring[u] = color;
        sendStep(ctx, u);
        await delay(DELAY_MS);
    }
    finish(ctx, 'Completed');
};