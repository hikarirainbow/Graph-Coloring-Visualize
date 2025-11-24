import { setupContext, sendStep, finish, delay, checkGlobalTime, countConflicts, randomColoringArray, getDynamicThreshold } from './workerUtils';

self.onmessage = async (e) => {
    const ctx = setupContext(e.data.payload.graphData, e.data.payload.params);
    let currentMaxColors = 3;
    let solved = false;

    // Tham số ACO
    const alpha = 1; // Trọng số pheromone
    const beta = 2;  // Trọng số heuristic
    const rho = 0.1; // Tốc độ bay hơi (0.1 = bay hơi 10%)
    const q0 = 0.9;  // Xác suất chọn tham lam (Exploitation vs Exploration)

    while (!solved) {
        if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

        // Khởi tạo Pheromone Matrix: [Node][Color]
        // Giá trị ban đầu nhỏ
        let pheromone = Array.from({ length: ctx.nodeCount }, () => Array(currentMaxColors + 1).fill(0.1));

        let gen = 0;
        let bestGlobalConflicts = Infinity;
        let bestGlobalColoring = new Int32Array(ctx.nodeCount);
        let stagnated = false;
        let lastCheckTime = performance.now();
        let bestConflictsAtLastCheck = Infinity;

        // Số lượng kiến mỗi thế hệ
        const numAnts = Math.min(20, Math.floor(ctx.nodeCount / 2));

        sendStep(ctx, 0, ctx.coloring, `ACO Init k=${currentMaxColors}`);
        await delay(20);

        while (bestGlobalConflicts > 0) {
            if (checkGlobalTime(ctx)) { finish(ctx, 'Limit Reached'); return; }

            // Kiểm tra Stagnation (dừng nếu không cải thiện)
            if (performance.now() - lastCheckTime > ctx.stagnationTime) {
                if (bestGlobalConflicts >= bestConflictsAtLastCheck) {
                    stagnated = true;
                    break;
                } else {
                    bestConflictsAtLastCheck = bestGlobalConflicts;
                    lastCheckTime = performance.now();
                }
            }

            let iterationBestAntColoring = null;
            let iterationBestConflicts = Infinity;

            // Mỗi con kiến xây dựng một giải pháp
            for (let k = 0; k < numAnts; k++) {
                const antColoring = new Int32Array(ctx.nodeCount);

                // Kiến tô màu từng đỉnh tuần tự (có thể random thứ tự đỉnh để tốt hơn)
                for (let u = 0; u < ctx.nodeCount; u++) {
                    const probabilities = [];
                    let sumProb = 0;

                    // Tính xác suất cho từng màu
                    for (let c = 1; c <= currentMaxColors; c++) {
                        // Heuristic: Nghịch đảo của số xung đột nếu chọn màu c
                        let conflicts = 0;
                        const neighbors = ctx.adj[u];
                        for (let i = 0; i < neighbors.length; i++) {
                            // Chỉ tính conflict với các đỉnh đã tô trước đó
                            if (antColoring[neighbors[i]] === c) conflicts++;
                        }

                        const eta = 1.0 / (1.0 + conflicts); // Heuristic value
                        const tau = pheromone[u][c];         // Pheromone value

                        const prob = Math.pow(tau, alpha) * Math.pow(eta, beta);
                        probabilities.push({ color: c, prob: prob });
                        sumProb += prob;
                    }

                    // Chọn màu
                    let selectedColor = 1;
                    if (Math.random() < q0) {
                        // Exploitation: Chọn màu có xác suất cao nhất
                        probabilities.sort((a, b) => b.prob - a.prob);
                        selectedColor = probabilities[0].color;
                    } else {
                        // Exploration: Chọn kiểu Roulette Wheel
                        let r = Math.random() * sumProb;
                        for (let p of probabilities) {
                            r -= p.prob;
                            if (r <= 0) {
                                selectedColor = p.color;
                                break;
                            }
                        }
                    }
                    antColoring[u] = selectedColor;
                }

                const { count: currentConflicts } = countConflicts(antColoring, ctx.adj);
                if (currentConflicts < iterationBestConflicts) {
                    iterationBestConflicts = currentConflicts;
                    iterationBestAntColoring = antColoring;
                }
            }

            // Cập nhật Pheromone (Global Update)
            // 1. Bay hơi
            for (let i = 0; i < ctx.nodeCount; i++) {
                for (let c = 1; c <= currentMaxColors; c++) {
                    pheromone[i][c] *= (1 - rho);
                }
            }

            // 2. Tăng cường mùi trên đường đi của kiến tốt nhất iteration này
            if (iterationBestAntColoring) {
                const deposit = 1.0 / (1.0 + iterationBestConflicts);
                for (let i = 0; i < ctx.nodeCount; i++) {
                    const c = iterationBestAntColoring[i];
                    if (c > 0) pheromone[i][c] += deposit;
                }

                // Cập nhật Global Best
                if (iterationBestConflicts < bestGlobalConflicts) {
                    bestGlobalConflicts = iterationBestConflicts;
                    bestGlobalColoring.set(iterationBestAntColoring);

                    ctx.coloring.set(bestGlobalColoring);
                    sendStep(ctx, gen, ctx.coloring, `ACO Best: ${bestGlobalConflicts}`);
                    await delay(5);
                }
            }

            gen++;
            // Update UI định kỳ
            if (gen % 5 === 0) {
                sendStep(ctx, gen, bestGlobalColoring, `ACO Gen ${gen} (Best: ${bestGlobalConflicts})`);
                await delay(0);
            }
        }

        if (!stagnated && bestGlobalConflicts === 0) {
            ctx.coloring.set(bestGlobalColoring);
            solved = true;
        } else {
            // Tăng số màu nếu bế tắc
            if (bestGlobalConflicts > 50) currentMaxColors += 2;
            else currentMaxColors++;
        }
    }
    finish(ctx, 'Completed');
};