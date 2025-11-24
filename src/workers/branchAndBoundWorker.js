import { setupContext, sendStep, finish, delay, checkGlobalTime } from './workerUtils';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);

    const degrees = ctx.adj.map((neighbors, i) => ({ index: i, degree: neighbors.length }));
    degrees.sort((a, b) => b.degree - a.degree);
    const sortedIndices = degrees.map(d => d.index);

    // Bắt đầu từ 3 màu
    let currentMaxColors = 3;
    let solved = false;

    // Ngân sách bước thử: Tăng dần theo độ khó (Exponential Backoff)
    let stepBudget = 5000;

    while (!solved) {
        if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

        ctx.coloring.fill(0);
        const stack = [{ index: 0, color: 1 }];
        let step = 0;
        let foundSolution = false;

        // Tăng ngân sách cho lần thử này
        stepBudget = Math.min(stepBudget * 2, 500000);

        sendStep(ctx, 0, ctx.coloring, `Backtracking k=${currentMaxColors} (Max Steps: ${stepBudget})`);
        await delay(20);

        while (stack.length > 0) {
            if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

            // Nếu vượt quá ngân sách bước đi -> Bỏ cuộc, tăng màu
            if (step > stepBudget) {
                sendStep(ctx, step, ctx.coloring, `Too complex for k=${currentMaxColors}. Skipping...`);
                break;
            }

            const current = stack[stack.length - 1];
            const { index, color } = current;
            const u = sortedIndices[index];

            if (color > currentMaxColors) {
                ctx.coloring[u] = 0;
                stack.pop();
                if (stack.length > 0) stack[stack.length - 1].color++;
                continue;
            }

            let isValid = true;
            const neighbors = ctx.adj[u];
            for (let i = 0; i < neighbors.length; i++) {
                const v = neighbors[i];
                if (ctx.coloring[v] === color) { isValid = false; break; }
            }

            if (!isValid) {
                current.color++;
                continue;
            }

            ctx.coloring[u] = color;
            step++;

            // Tăng tốc độ update UI
            if (step % 1000 === 0) {
                sendStep(ctx, step, ctx.coloring, `BT k=${currentMaxColors} Step ${step}`);
                await delay(0);
            }

            if (index === ctx.nodeCount - 1) {
                foundSolution = true;
                break;
            }

            stack.push({ index: index + 1, color: 1 });
        }

        if (foundSolution) {
            solved = true;
        } else {
            currentMaxColors++;
        }
    }
    finish(ctx, 'Completed');
};