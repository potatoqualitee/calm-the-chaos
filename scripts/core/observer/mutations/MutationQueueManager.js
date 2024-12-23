// Manages the mutation queue and debouncing
export class MutationQueueManager {
    constructor(config) {
        this.config = config;
        this.mutationQueue = new Map();
        this.timeout = null;
    }

    /**
     * Add mutations to the queue
     * @param {MutationRecord[]} mutations - Array of mutation records
     * @param {Function} isRelevantNode - Function to check if node is relevant
     * @returns {boolean} - Whether any mutations were added
     */
    addMutations(mutations, isRelevantNode) {
        const relevantMutations = mutations.filter(mutation => {
            if (mutation.addedNodes.length === 0) {
                return false;
            }
            return Array.from(mutation.addedNodes).some(node => isRelevantNode(node));
        });

        if (relevantMutations.length === 0) {
            return false;
        }

        // Group mutations by parent to reduce processing overhead
        relevantMutations.forEach(mutation => {
            const parent = mutation.target.parentElement;
            if (!parent) return;

            if (!this.mutationQueue.has(parent)) {
                this.mutationQueue.set(parent, new Set());
            }

            Array.from(mutation.addedNodes)
                .filter(node => isRelevantNode(node))
                .forEach(node => this.mutationQueue.get(parent).add(node));
        });

        return true;
    }

    /**
     * Get all nodes from the queue and clear it
     * @returns {Set<Node>} - Set of all nodes from the queue
     */
    getAllNodesAndClear() {
        const allNodes = new Set();
        for (const [parent, nodes] of this.mutationQueue) {
            if (document.contains(parent)) {
                nodes.forEach(node => allNodes.add(node));
            }
            this.mutationQueue.delete(parent);
        }
        return allNodes;
    }

    /**
     * Get a chunk of nodes from the queue
     * @param {number} chunkSize - Size of chunk to get
     * @returns {Set<Node>} - Set of nodes in the chunk
     */
    getChunk(chunkSize) {
        const nodesToProcess = new Set();
        let processedCount = 0;

        for (const [parent, nodes] of this.mutationQueue) {
            if (processedCount >= chunkSize) break;

            const nodeArray = Array.from(nodes);
            const chunk = nodeArray.slice(0, chunkSize - processedCount);
            chunk.forEach(node => {
                nodesToProcess.add(node);
                nodes.delete(node);
            });

            if (nodes.size === 0) {
                this.mutationQueue.delete(parent);
            }

            processedCount += chunk.length;
        }

        return nodesToProcess;
    }

    /**
     * Check if queue is empty
     * @returns {boolean} - Whether queue is empty
     */
    isEmpty() {
        return this.mutationQueue.size === 0;
    }

    /**
     * Get queue size
     * @returns {number} - Size of queue
     */
    size() {
        return this.mutationQueue.size;
    }

    /**
     * Clear queue and timeout
     */
    cleanup() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        this.mutationQueue.clear();
    }
}