// Processor for heavy mutation loads
import { BaseMutationProcessor } from './BaseMutationProcessor.js';

export class HeavyMutationProcessor extends BaseMutationProcessor {
    constructor(config, queueManager) {
        super(config);
        this.queueManager = queueManager;
        this.disconnectTimeout = null;
    }

    /**
     * Process heavy mutations with temporary observer disconnect
     * @param {MutationObserver} observer - The observer instance
     * @returns {Promise<void>}
     */
    async processMutations(observer) {
        if (!observer) return;

        // Temporarily pause observation
        observer.disconnect();

        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
        }

        // Process mutations in chunks
        const processChunk = async () => {
            const chunkSize = this.config.isFacebook ? 50 : 100;
            const nodesToProcess = this.queueManager.getChunk(chunkSize);

            if (nodesToProcess.size > 0) {
                // Process this chunk
                await this.processNodes(nodesToProcess);

                // Schedule next chunk if there are more mutations
                if (!this.queueManager.isEmpty()) {
                    setTimeout(processChunk, 16); // ~1 frame delay
                } else {
                    // Resume observation after all chunks are processed
                    this.reconnectObserver(observer);
                }
            } else {
                this.reconnectObserver(observer);
            }
        };

        // Start processing chunks
        requestAnimationFrame(() => processChunk());
    }

    /**
     * Reconnect observer after processing
     * @param {MutationObserver} observer - The observer instance
     */
    reconnectObserver(observer) {
        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
        }

        this.disconnectTimeout = setTimeout(() => {
            if (observer && document.body) {
                observer.observe(document.body, this.config.observerConfig);
            }
        }, this.config.reconnectDelay);
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
            this.disconnectTimeout = null;
        }
        this.isProcessing = false;
    }
}