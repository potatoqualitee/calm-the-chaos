// Processor for standard mutation loads
import { BaseMutationProcessor } from './BaseMutationProcessor.js';

export class StandardMutationProcessor extends BaseMutationProcessor {
    constructor(config, queueManager) {
        super(config);
        this.queueManager = queueManager;
        this.timeout = null;
    }

    /**
     * Process mutations with debouncing
     * @returns {Promise<void>}
     */
    async processMutations() {
        if (this.isProcessing || this.queueManager.isEmpty()) {
            return;
        }

        this.isProcessing = true;

        try {
            // Get all nodes from queue
            const allNodes = this.queueManager.getAllNodesAndClear();

            // For CNN, process in larger chunks
            if (this.config.isCNN) {
                await this.processNodesInChunks(allNodes, 200);
            } else {
                // For other sites, process all at once
                await this.processNodes(allNodes);
            }
        } catch (error) {
            console.debug('Error processing mutations:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Debounced processing
     */
    debouncedProcess() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
        this.timeout = setTimeout(async () => {
            await this.processMutations();
        }, this.config.DEBOUNCE_DELAY);
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        this.isProcessing = false;
    }
}