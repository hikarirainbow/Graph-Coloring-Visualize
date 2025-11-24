export class Graph {
    constructor(nodeCount) {
        this.nodeCount = nodeCount;
        this.adjList = new Map();
        for (let i = 0; i < nodeCount; i++) {
            this.adjList.set(i, []);
        }
    }

    addEdge(u, v) {
        this.adjList.get(u).push(v);
        this.adjList.get(v).push(u);
    }

    static generateRandom(nodeCount, density, seed = Date.now()) {
        const nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: i, val: 5 }));
        const links = [];

        for (let i = 0; i < nodeCount; i++) {
            for (let j = i + 1; j < nodeCount; j++) {
                if (Math.random() < density) {
                    links.push({ source: i, target: j });
                }
            }
        }
        return { nodes, links };
    }
}
