// Base class for mutation processors
import { handleGenericMedia } from '../../elementProcessingModule.js';
import { hideNodes } from '../../nodeHidingModule.js';
import { FilterProcessor } from './FilterProcessor.js';

export class BaseMutationProcessor {
    constructor(config) {
        this.config = config;
        this.isProcessing = false;
        this.filterProcessor = new FilterProcessor(new Set());
        this.processedNodes = new WeakSet(); // Cache processed nodes
        this.imageCache = new WeakMap(); // Cache image processing results
        this.OPTIMAL_CHUNK_SIZE = 50; // Empirically determined optimal chunk size
    }

    /**
     * Process a set of nodes with optimized handling
     * @param {Set<Node>} nodes - Set of nodes to process
     * @returns {Promise<void>}
     */
    async processNodes(nodes) {
        if (nodes.size === 0) return;

        const nodesToHide = new Set();
        const processPromises = [];
        const newNodes = new Set();

        // Filter out already processed nodes
        for (const node of nodes) {
            if (!this.processedNodes.has(node)) {
                newNodes.add(node);
                this.processedNodes.add(node);
            }
        }

        if (newNodes.size === 0) return;

        // Optimize content processing
        const contentPromise = this.processContent(newNodes);
        if (contentPromise) processPromises.push(contentPromise);

        // Optimize image processing
        const imagePromise = this.processImages(newNodes, nodesToHide);
        if (imagePromise) processPromises.push(imagePromise);

        // Wait for all processing to complete
        await Promise.all(processPromises);

        // Batch hide operations
        if (nodesToHide.size > 0) {
            requestAnimationFrame(() => hideNodes(nodesToHide));
        }
    }

    /**
     * Optimized content processing
     * @private
     */
    async processContent(nodes) {
        try {
            return this.filterProcessor.processContent(Array.from(nodes));
        } catch (error) {
            console.debug('Error filtering content:', error);
            return null;
        }
    }

    /**
     * Optimized image processing with caching
     * @private
     */
    async processImages(nodes, nodesToHide) {
        const images = new Set();

        // Efficiently collect images
        for (const node of nodes) {
            if (node instanceof Element) {
                // Check cache first
                if (this.imageCache.has(node)) {
                    const cachedImages = this.imageCache.get(node);
                    cachedImages.forEach(img => images.add(img));
                    continue;
                }

                // Process new images
                const nodeImages = node.getElementsByTagName('img');
                if (nodeImages.length > 0) {
                    const imageSet = new Set(nodeImages);
                    this.imageCache.set(node, imageSet);
                    imageSet.forEach(img => images.add(img));
                }
            }
        }

        if (images.size > 0) {
            try {
                await handleGenericMedia(nodesToHide);
            } catch (error) {
                console.debug('Error handling media:', error);
            }
        }
    }

    /**
     * Process nodes with optimized chunking
     * @param {Set<Node>} nodes - Set of nodes to process
     * @param {number} [chunkSize] - Optional override for chunk size
     * @returns {Promise<void>}
     */
    async processNodesInChunks(nodes, chunkSize = this.OPTIMAL_CHUNK_SIZE) {
        const chunks = this.createOptimalChunks(nodes, chunkSize);

        for (const chunk of chunks) {
            await this.processNodes(chunk);

            // Use requestIdleCallback if available, otherwise minimal timeout
            await new Promise(resolve => {
                if (window.requestIdleCallback) {
                    requestIdleCallback(resolve);
                } else {
                    setTimeout(resolve, 0);
                }
            });
        }
    }

    /**
     * Create optimally sized chunks based on node complexity
     * @private
     */
    createOptimalChunks(nodes, baseChunkSize) {
        const chunks = [];
        let currentChunk = new Set();
        let currentComplexity = 0;

        for (const node of nodes) {
            // Estimate node complexity
            const complexity = this.estimateNodeComplexity(node);

            if (currentComplexity + complexity > baseChunkSize) {
                chunks.push(currentChunk);
                currentChunk = new Set();
                currentComplexity = 0;
            }

            currentChunk.add(node);
            currentComplexity += complexity;
        }

        if (currentChunk.size > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    /**
     * Estimate processing complexity of a node
     * @private
     */
    estimateNodeComplexity(node) {
        if (!(node instanceof Element)) return 1;

        // More complex nodes get higher weights
        const hasImages = node.getElementsByTagName('img').length > 0;
        const childCount = node.childElementCount;
        const hasDeepNesting = childCount > 10;

        return 1 +
            (hasImages ? 2 : 0) +
            Math.min(childCount / 10, 5) +
            (hasDeepNesting ? 2 : 0);
    }
}