import { setupContext, sendStep, finish, delay, getLeastConflictingColor, DELAY_MS } from './workerUtils';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);
    // Greedy luôn cho phép max màu vô hạn để đảm bảo tìm ra kết quả
    const maxColors = Infinity;

    for (let u = 0; u < ctx.nodeCount; u++) {
        const usedColors = new Set();
        const neighbors = ctx.adj[u];
        for (let i = 0; i < neighbors.length; i++) {
            if (ctx.coloring[neighbors[i]] !== 0) usedColors.add(ctx.coloring[neighbors[i]]);
        }
        let color = 1;
        while (usedColors.has(color)) color++;
        ctx.coloring[u] = color;

        sendStep(ctx, u);
        await delay(DELAY_MS);
    }
    finish(ctx, 'Completed');
};