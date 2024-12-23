// Main mutation handler that coordinates between processors
import { isRelevantNode } from './nodeUtils.js';
import { MutationQueueManager } from './mutations/MutationQueueManager.js';
import { StandardMutationProcessor } from './mutations/StandardMutationProcessor.js';
import { HeavyMutationProcessor } from './mutations/HeavyMutationProcessor.js';

export class MutationHandler {
    constructor(config) {
        this.config = config;
        this.queueManager = new MutationQueueManager(config);
        this.standardProcessor = new StandardMutationProcessor(config, this.queueManager);
        this.heavyProcessor = new HeavyMutationProcessor(config, this.queueManager);
    }

    /**
     * Handle mutation records
     * @param {MutationRecord[]} mutations - Array of mutation records
     * @param {MutationObserver} observer - The observer instance
     */
    async handleMutations(mutations, observer) {
        try {
            // Add mutations to queue
            const mutationsAdded = this.queueManager.addMutations(mutations, isRelevantNode);

            if (!mutationsAdded) {
                return;
            }

            // Handle mutations based on queue size
            if (this.queueManager.size() > this.config.HEAVY_MUTATION_THRESHOLD) {
                await this.heavyProcessor.processMutations(observer);
            } else {
                this.standardProcessor.debouncedProcess();
            }
        } catch (error) {
            console.debug('Error handling mutations:', error);
        }
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.queueManager.cleanup();
        this.standardProcessor.cleanup();
        this.heavyProcessor.cleanup();
    }
}