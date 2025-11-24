import { setupContext, sendStep, finish, delay, checkGlobalTime, countConflicts } from './workerUtils';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);

    // Sắp xếp các đỉnh theo bậc giảm dần để tối ưu Backtracking (Heuristic)
    const degrees = ctx.adj.map((neighbors, i) => ({ index: i, degree: neighbors.length }));
    degrees.sort((a, b) => b.degree - a.degree);
    const sortedIndices = degrees.map(d => d.index);

    // Bắt đầu từ 3 màu (hoặc số màu hiện tại của đồ thị nếu muốn optimize)
    let currentMaxColors = 3;
    let solved = false;

    // Ngân sách bước thử
    let stepBudget = 5000;

    while (!solved) {
        if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

        ctx.coloring.fill(0);
        const stack = [{ index: 0, color: 1 }];
        let step = 0;
        let foundSolution = false;

        // Tăng ngân sách cho lần thử này (Exponential Backoff)
        stepBudget = Math.min(stepBudget * 2, 1000000);

        sendStep(ctx, 0, ctx.coloring, `Backtracking k=${currentMaxColors} (Max Steps: ${stepBudget})`);
        await delay(20);

        while (stack.length > 0) {
            if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

            // Nếu vượt quá ngân sách bước đi -> Bỏ cuộc mức K này, tăng màu
            if (step > stepBudget) {
                sendStep(ctx, step, ctx.coloring, `Too complex for k=${currentMaxColors}. Skipping...`);
                break;
            }

            const current = stack[stack.length - 1];
            const { index, color } = current;
            const u = sortedIndices[index];

            // Nếu màu thử vượt quá số màu cho phép -> Backtrack
            if (color > currentMaxColors) {
                ctx.coloring[u] = 0; // Reset màu node hiện tại
                stack.pop(); // Lùi lại node trước
                if (stack.length > 0) {
                    stack[stack.length - 1].color++; // Tăng màu node trước đó lên 1
                }
                continue;
            }

            // Kiểm tra tính hợp lệ với các đỉnh lân cận đã tô
            let isValid = true;
            const neighbors = ctx.adj[u];
            for (let i = 0; i < neighbors.length; i++) {
                const v = neighbors[i];
                // Chỉ check conflict với các đỉnh đã có màu (khác 0)
                if (ctx.coloring[v] === color) {
                    isValid = false;
                    break;
                }
            }

            if (!isValid) {
                current.color++; // Thử màu tiếp theo
                continue;
            }

            // Nếu hợp lệ, gán màu
            ctx.coloring[u] = color;
            step++;

            // Cập nhật UI định kỳ
            if (step % 2000 === 0) {
                sendStep(ctx, step, ctx.coloring, `BT k=${currentMaxColors} Step ${step}`);
                await delay(0);
            }

            // Nếu đã gán màu cho đỉnh cuối cùng -> TÌM THẤY LỜI GIẢI?
            if (index === ctx.nodeCount - 1) {
                // === LỚP VERIFY (KIỂM TRA LẠI) ===
                // Đôi khi logic trên có kẽ hở, ta kiểm tra lại toàn bộ đồ thị lần cuối
                const check = countConflicts(ctx.coloring, ctx.adj);
                if (check.count === 0) {
                    foundSolution = true;
                    break;
                } else {
                    // Nếu phát hiện xung đột dù đã đi đến cuối -> Lỗi logic hoặc màu chưa chuẩn
                    // Tiếp tục Backtrack thay vì dừng lại
                    console.warn(`Verification failed at step ${step}. Conflicts: ${check.count}. Backtracking...`);
                    current.color++;
                    // Không break, vòng lặp while tiếp tục chạy để thử màu khác
                }
            } else {
                // Chưa xong, đi tiếp tới node tiếp theo
                stack.push({ index: index + 1, color: 1 });
            }
        }

        if (foundSolution) {
            solved = true;
        } else {
            currentMaxColors++;
        }
    }
    finish(ctx, 'Completed');
};