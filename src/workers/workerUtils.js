export const DELAY_MS = 15;
export const DEFAULT_STAGNATION_MS = 1000;

// === VERIFICATION LAYER (LỚP KIỂM CHỨNG) ===
// Nhiệm vụ: Đóng vai trò trung gian, kiểm tra độc lập kết quả từ thuật toán.
export const VerificationLayer = {
    /**
     * Kiểm tra toàn diện trạng thái đồ thị hiện tại.
     * @param {Object} ctx - Context của worker
     * @returns {Object} Báo cáo chi tiết về lỗi (nếu có)
     */
    audit: (ctx) => {
        const { coloring, adj, nodeCount } = ctx;
        const conflicts = [];
        const uncolored = [];
        let maxColor = 0;

        // 1. Quét toàn bộ đỉnh
        for (let u = 0; u < nodeCount; u++) {
            const colorU = coloring[u];

            // Kiểm tra chưa tô màu
            if (colorU === 0) {
                uncolored.push(u);
                continue;
            }

            if (colorU > maxColor) maxColor = colorU;

            // Kiểm tra xung đột với hàng xóm
            const neighbors = adj[u];
            for (let i = 0; i < neighbors.length; i++) {
                const v = neighbors[i];
                // Chỉ kiểm tra 1 chiều (u < v) để tránh trùng lặp cạnh
                if (u < v && coloring[v] === colorU) {
                    conflicts.push([u, v]);
                }
            }
        }

        const isValid = conflicts.length === 0 && uncolored.length === 0;

        return {
            isValid,
            conflicts,      // Danh sách cạnh bị trùng màu
            uncolored,      // Danh sách đỉnh chưa được tô
            maxColor,       // Số màu đã sử dụng
            details: isValid ? "Valid" : `Found ${conflicts.length} conflicts, ${uncolored.length} uncolored`
        };
    }
};

export function setupContext(graphData, params) {
    const nodeCount = graphData.nodes.length;
    const nodeMap = new Map();
    const revNodeMap = new Array(nodeCount);

    graphData.nodes.forEach((n, i) => {
        nodeMap.set(n.id, i);
        revNodeMap[i] = n.id;
    });

    const adj = new Array(nodeCount).fill(0).map(() => []);
    graphData.links.forEach(l => {
        const u = nodeMap.get((l.source && l.source.id !== undefined) ? l.source.id : l.source);
        const v = nodeMap.get((l.target && l.target.id !== undefined) ? l.target.id : l.target);
        if (u !== undefined && v !== undefined) {
            adj[u].push(v);
            adj[v].push(u);
        }
    });

    const coloring = new Int32Array(nodeCount).fill(0);
    const stagnationTime = params.stagnationTime || DEFAULT_STAGNATION_MS;

    return {
        nodeCount,
        adj,
        coloring,
        revNodeMap,
        params: { ...params },
        stagnationTime: stagnationTime,
        startTime: performance.now(),
        stepCount: 0,
        links: graphData.links,
        globalStartTime: performance.now(),
        timeLimit: (params.timeLimit || 10) * 1000,
    };
}

export function countConflicts(coloring, adj) {
    let count = 0;
    const conflicts = [];
    for (let u = 0; u < coloring.length; u++) {
        if (coloring[u] === 0) continue;
        const neighbors = adj[u];
        for (let i = 0; i < neighbors.length; i++) {
            const v = neighbors[i];
            if (coloring[v] !== 0 && u < v && coloring[v] === coloring[u]) {
                count++;
                conflicts.push([u, v]);
            }
        }
    }
    return { count, conflicts };
}

export function sendStep(ctx, step, overrideColoring = null, status = null) {
    const activeColoring = overrideColoring || ctx.coloring;
    // Vẫn dùng countConflicts nhẹ cho các bước step để đỡ tốn performance
    const { count, conflicts } = countConflicts(activeColoring, ctx.adj);
    const elapsedTime = performance.now() - ctx.globalStartTime;

    self.postMessage({
        type: 'STEP',
        payload: {
            step: step,
            coloring: mapColoring(ctx, activeColoring),
            conflicts: mapConflicts(ctx, conflicts),
            metrics: { iter: step, conflicts: count, time: elapsedTime, status }
        }
    });
}

/**
 * Hàm finish được nâng cấp với Verify Layer
 */
export function finish(ctx, rawResultStatus) {
    // === BƯỚC 1: VERIFY LAYER (Kiểm tra trung gian) ===
    let auditResult = VerificationLayer.audit(ctx);
    let finalStatus = rawResultStatus;

    // === BƯỚC 2: XỬ LÝ LỖI (Nếu có) ===
    if (!auditResult.isValid) {
        console.warn(`[Verification Layer] Algorithm '${rawResultStatus}' issue:`, auditResult.details);

        // Trường hợp 1: Có đỉnh chưa tô màu (Uncolored)
        // -> Cơ chế "Cứu vãn": Sử dụng Greedy để tô nốt các đỉnh còn thiếu
        if (auditResult.uncolored.length > 0) {
            fillUncoloredGreedily(ctx, auditResult.uncolored);
            finalStatus = `${rawResultStatus} (Auto-filled)`;

            // Kiểm tra lại lần nữa sau khi sửa
            auditResult = VerificationLayer.audit(ctx);
        }

        // Trường hợp 2: Có xung đột màu (Conflicts)
        // -> Báo lỗi ngay lập tức lên UI
        if (auditResult.conflicts.length > 0) {
            finalStatus = `Failed: ${auditResult.conflicts.length} conflicts`;
        }
    }

    // === BƯỚC 3: GỬI KẾT QUẢ ĐÃ ĐƯỢC KIỂM CHỨNG ===
    self.postMessage({
        type: 'DONE',
        payload: {
            result: finalStatus,
            metrics: {
                time: performance.now() - ctx.globalStartTime,
                colors: auditResult.maxColor,
                conflicts: auditResult.conflicts.length // Số liệu chính xác từ Verify Layer
            },
            coloring: mapColoring(ctx),
            conflicts: mapConflicts(ctx, auditResult.conflicts) // Danh sách cạnh đỏ chính xác
        }
    });
}

// --- Helper Functions ---

function fillUncoloredGreedily(ctx, uncoloredIndices) {
    let currentMax = 0;
    for (let c of ctx.coloring) if (c > currentMax) currentMax = c;
    if (currentMax === 0) currentMax = 1;

    for (const u of uncoloredIndices) {
        let bestColor = 1;
        let minConf = Infinity;

        // Thử tìm màu hợp lệ trong dải màu hiện có + 1
        for (let c = 1; c <= currentMax + 1; c++) {
            let conf = 0;
            for (const v of ctx.adj[u]) {
                if (ctx.coloring[v] === c) conf++;
            }
            if (conf === 0) {
                bestColor = c;
                minConf = 0;
                break;
            }
            if (conf < minConf) {
                minConf = conf;
                bestColor = c;
            }
        }
        ctx.coloring[u] = bestColor;
        if (bestColor > currentMax) currentMax = bestColor;
    }
}

function mapColoring(ctx, coloringArray = null) {
    const arr = coloringArray || ctx.coloring;
    const coloringMap = {};
    for (let i = 0; i < ctx.nodeCount; i++) {
        if (arr[i] !== 0) {
            coloringMap[ctx.revNodeMap[i]] = arr[i];
        }
    }
    return coloringMap;
}

function mapConflicts(ctx, conflicts) {
    return conflicts.map(([u, v]) => ({
        source: ctx.revNodeMap[u],
        target: ctx.revNodeMap[v]
    }));
}

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function checkGlobalTime(ctx) {
    return (performance.now() - ctx.globalStartTime > ctx.timeLimit);
}

export function getDynamicThreshold(currentConflicts) {
    if (currentConflicts > 100) return 5;
    if (currentConflicts > 80) return 4;
    if (currentConflicts > 50) return 3;
    if (currentConflicts > 20) return 2;
    return 1;
}

export function randomColoringArray(nodeCount, maxColors) {
    const c = new Int32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
        c[i] = Math.floor(Math.random() * maxColors) + 1;
    }
    return c;
}

export function getLeastConflictingColor(u, adj, coloring, maxColors) {
    let bestColor = 1;
    let minConflicts = Infinity;
    for (let c = 1; c <= maxColors; c++) {
        let conflicts = 0;
        for (let i = 0; i < adj[u].length; i++) {
            if (coloring[adj[u][i]] === c) conflicts++;
        }
        if (conflicts < minConflicts) {
            minConflicts = conflicts;
            bestColor = c;
            if (minConflicts === 0) break;
        }
    }
    return bestColor;
}