import { setupContext, sendStep, finish, delay, DELAY_MS } from './workerUtils';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);
    const uncolored = new Set(Array.from({ length: ctx.nodeCount }, (_, i) => i));
    let color = 1;
    let step = 0;

    while (uncolored.size > 0) {
        let bestNode = -1, maxDeg = -1;
        for (const u of uncolored) {
            let deg = 0;
            ctx.adj[u].forEach(v => { if (uncolored.has(v)) deg++; });
            if (deg > maxDeg) { maxDeg = deg; bestNode = u; }
        }

        if (bestNode === -1) break;

        const colorClass = new Set([bestNode]);
        ctx.coloring[bestNode] = color;
        uncolored.delete(bestNode);
        sendStep(ctx, step++);
        await delay(DELAY_MS);

        while (true) {
            let candidate = -1, maxCommon = -1;
            for (const u of uncolored) {
                let isAdjacent = false;
                for (const v of ctx.adj[u]) if (colorClass.has(v)) { isAdjacent = true; break; }

                if (!isAdjacent) {
                    let common = 0;
                    for (const v of ctx.adj[u]) if (uncolored.has(v)) common++;
                    if (common > maxCommon) { maxCommon = common; candidate = u; }
                }
            }
            if (candidate !== -1) {
                colorClass.add(candidate);
                ctx.coloring[candidate] = color;
                uncolored.delete(candidate);
                sendStep(ctx, step++);
                await delay(DELAY_MS);
            } else break;
        }
        color++;
    }
    finish(ctx, 'Completed');
};