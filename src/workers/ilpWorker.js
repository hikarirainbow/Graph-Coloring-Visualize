import { setupContext, sendStep, finish, delay, checkGlobalTime } from './workerUtils';
import solver from 'javascript-lp-solver';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);

    // === BƯỚC 1: KHỞI TẠO BẰNG THAM LAM (GREEDY) ===
    const greedyColors = new Int32Array(ctx.nodeCount);
    let kCurrent = 0;

    const degrees = ctx.adj.map((n, i) => ({ i, deg: n.length })).sort((a, b) => b.deg - a.deg);
    for (const { i: u } of degrees) {
        const used = new Set();
        for (const v of ctx.adj[u]) {
            if (greedyColors[v] !== 0) used.add(greedyColors[v]);
        }
        let c = 1;
        while (used.has(c)) c++;
        greedyColors[u] = c;
        if (c > kCurrent) kCurrent = c;
    }

    ctx.coloring.set(greedyColors);
    sendStep(ctx, 0, ctx.coloring, `Greedy Init: ${kCurrent} colors`);
    await delay(200);

    // === BƯỚC 2: GIẢM MÀU DẦN (ITERATIVE DECREMENT) ===
    // Chiến thuật: Thử giảm từng màu một. Mỗi lần thử tối đa 2 giây.
    // Nếu quá 2s không tìm ra -> Dừng và chấp nhận kết quả hiện tại.

    let canReduce = true;

    while (canReduce && kCurrent > 1) {
        if (checkGlobalTime(ctx)) {
            finish(ctx, `Time Limit Reached (Best: ${kCurrent})`);
            return;
        }

        const targetK = kCurrent - 1;
        const stepStart = performance.now();
        const STEP_TIMEOUT = 2000; // Giới hạn cứng 2s cho mỗi bước thử

        sendStep(ctx, 0, ctx.coloring, `Attempting ${targetK} colors (2s timeout)...`);
        await delay(50);

        // --- Xây dựng Model ---
        const constraints = {};
        const variables = {};
        const ints = {};

        // 1. Ràng buộc: Mỗi đỉnh tô đúng 1 màu
        for (let u = 0; u < ctx.nodeCount; u++) {
            constraints[`node_${u}`] = { equal: 1 };
        }

        // 2. Ràng buộc: Hai đỉnh kề nhau không cùng màu c
        // (Chuyển về dạng: x_u_c + x_v_c <= 1)
        for (let u = 0; u < ctx.nodeCount; u++) {
            for (const v of ctx.adj[u]) {
                if (u < v) { // Chỉ xét 1 chiều cạnh u-v
                    for (let c = 1; c <= targetK; c++) {
                        constraints[`edge_${u}_${v}_${c}`] = { max: 1 };
                    }
                }
            }
        }

        // 3. Biến số
        for (let u = 0; u < ctx.nodeCount; u++) {
            for (let c = 1; c <= targetK; c++) {
                const varName = `x_${u}_${c}`;
                variables[varName] = {
                    [`node_${u}`]: 1, // Đóng góp vào constraint đỉnh
                    // objective: 1 // (Optional) Thêm objective nhẹ để hướng solver
                };
                ints[varName] = 1;

                // Đóng góp vào constraint cạnh
                for (const v of ctx.adj[u]) {
                    if (u < v) variables[varName][`edge_${u}_${v}_${c}`] = 1;
                    else variables[varName][`edge_${v}_${u}_${c}`] = 1;
                }
            }
        }

        const model = {
            optimize: "cost", // Dummy objective
            opType: "min",
            constraints: constraints,
            variables: variables,
            ints: ints,
            // Đặt timeout ở cả 2 chỗ để chắc chắn thư viện nhận diện
            timeout: STEP_TIMEOUT,
            settings: {
                timeout: STEP_TIMEOUT
            }
        };

        try {
            const result = solver.Solve(model);
            const duration = performance.now() - stepStart;

            // Kiểm tra kết quả
            if (result.feasible) {
                // Parse màu mới
                const newColoring = new Int32Array(ctx.nodeCount);
                let parseSuccess = true;
                for (let u = 0; u < ctx.nodeCount; u++) {
                    let colorFound = false;
                    for (let c = 1; c <= targetK; c++) {
                        if (result[`x_${u}_${c}`] > 0.9) {
                            newColoring[u] = c;
                            colorFound = true;
                            break;
                        }
                    }
                    if (!colorFound) parseSuccess = false; // Phòng hờ solver trả về feasible ảo
                }

                if (parseSuccess) {
                    ctx.coloring.set(newColoring);
                    kCurrent = targetK; // Thành công, cập nhật mốc mới
                    sendStep(ctx, 0, ctx.coloring, `Success: ${kCurrent} colors (${Math.round(duration)}ms)`);

                    // Nếu giải quá nhanh (<200ms), nghỉ tí để UI không bị giật
                    if (duration < 200) await delay(200);
                } else {
                    // Feasible nhưng không parse được màu (lỗi số học) -> Coi như thất bại
                    canReduce = false;
                    sendStep(ctx, 0, ctx.coloring, `Solver error (Feasible but invalid)`);
                }
            } else {
                // Infeasible (Vô nghiệm) -> Đã đạt tối ưu
                canReduce = false;
                sendStep(ctx, 0, ctx.coloring, `Optimal Reached (Cannot reduce to ${targetK})`);
            }

            // === CHECK TIMEOUT THỦ CÔNG ===
            // Nếu solver chạy quá lố thời gian cho phép (ví dụ > 2.2s) mà không ra kết quả khả thi
            // Ta sẽ dừng luôn việc giảm màu tiếp theo để tránh treo máy.
            if (duration > STEP_TIMEOUT + 200 && canReduce) {
                console.warn(`ILP Step Timeout exceeded (${duration.toFixed(0)}ms). Stopping reduction.`);
                canReduce = false;
                sendStep(ctx, 0, ctx.coloring, `Step Timeout (Best: ${kCurrent})`);
            }

        } catch (err) {
            console.error("ILP Error:", err);
            canReduce = false;
        }
    }

    finish(ctx, 'Completed');
};