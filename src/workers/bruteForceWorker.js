import { setupContext, sendStep, finish, delay, checkGlobalTime } from './workerUtils';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);

    // Bắt đầu thử từ 1 màu và tăng dần
    let currentMaxColors = 1;
    let solved = false;

    // Hàm đệ quy vét cạn
    const tryColor = async (nodeIndex) => {
        // Kiểm tra thời gian để tránh treo trình duyệt
        if (checkGlobalTime(ctx)) return false;

        // Nếu đã tô hết các đỉnh -> Tìm thấy lời giải
        if (nodeIndex === ctx.nodeCount) return true;

        // Thử tất cả các màu từ 1 đến k
        for (let color = 1; color <= currentMaxColors; color++) {
            // Kiểm tra tính hợp lệ
            let isValid = true;
            const neighbors = ctx.adj[nodeIndex];
            for (let i = 0; i < neighbors.length; i++) {
                const neighbor = neighbors[i];
                // Chỉ kiểm tra các đỉnh đã được tô màu (index < nodeIndex vì ta duyệt tuần tự)
                if (ctx.coloring[neighbor] === color) {
                    isValid = false;
                    break;
                }
            }

            if (isValid) {
                ctx.coloring[nodeIndex] = color;

                // Cập nhật UI mỗi 1000 bước để đỡ lag, hoặc ở các node quan trọng
                if (nodeIndex < 2 || Math.random() < 0.05) {
                    sendStep(ctx, ctx.stepCount++, ctx.coloring, `Brute-force k=${currentMaxColors} Node ${nodeIndex}`);
                    await delay(0);
                }

                if (await tryColor(nodeIndex + 1)) return true;

                // Backtrack
                ctx.coloring[nodeIndex] = 0;
            }
        }
        return false;
    };

    while (!solved) {
        if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

        sendStep(ctx, 0, ctx.coloring, `Brute-force Checking k=${currentMaxColors}`);
        await delay(50);

        // Reset màu trước khi thử k mới
        ctx.coloring.fill(0);

        // Chạy đệ quy
        if (await tryColor(0)) {
            solved = true;
        } else {
            currentMaxColors++;
        }
    }

    finish(ctx, 'Completed');
};