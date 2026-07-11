import { FilterProcessor } from './FilterProcessor.js';

class ResettableWeakSet {
    constructor() {
        this.values = new WeakSet();
    }

    add(value) {
        this.values.add(value);
        return this;
    }

    has(value) {
        return this.values.has(value);
    }

    clear() {
        this.values = new WeakSet();
    }
}

export class FilteringMutationObserver {
    constructor() {
        this.observer = null;
        this.timeoutId = null;
        this.pendingNodes = new Set();
        this.history = new ResettableWeakSet();
        this.filterProcessor = new FilterProcessor(this.history);
        this.isProcessing = false;
        this.activeRun = null;
        this.generation = 0;
    }

    addPendingNode(node) {
        if (!node || (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE)) {
            return;
        }

        if (this.pendingNodes.has(node)) return;
        this.pendingNodes.add(node);
    }

    queueMutations(mutations) {
        mutations.forEach(mutation => {
            if (mutation.type === 'characterData') {
                if (mutation.target.textContent?.trim()) this.addPendingNode(mutation.target);
                return;
            }

            mutation.addedNodes.forEach(node => this.addPendingNode(node));
        });

        if (this.pendingNodes.size > 0) this.scheduleFlush();
    }

    scheduleFlush(delay = 120) {
        if (this.timeoutId) clearTimeout(this.timeoutId);
        this.timeoutId = setTimeout(() => {
            this.timeoutId = null;
            this.flush();
        }, delay);
    }

    async runFilter(nodes) {
        const runGeneration = this.generation;
        this.isProcessing = true;
        const run = this.filterProcessor.processContent(nodes);
        this.activeRun = run;
        try {
            await run;
        } finally {
            if (this.activeRun === run) {
                this.activeRun = null;
                this.isProcessing = false;
                if (runGeneration === this.generation && this.pendingNodes.size > 0) {
                    this.scheduleFlush(0);
                }
            }
        }
    }

    async flush() {
        if (this.isProcessing || this.pendingNodes.size === 0) return;

        const nodes = Array.from(this.pendingNodes);
        this.pendingNodes.clear();
        await this.runFilter(nodes);
    }

    async processInitialContent() {
        if (this.activeRun) {
            await this.activeRun.catch(() => {});
        }
        await this.runFilter(null);
    }

    setupObserver() {
        if (!document.body) return;
        this.disconnectObserver();

        this.observer = new MutationObserver(mutations => this.queueMutations(mutations));
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    disconnectObserver() {
        this.observer?.disconnect();
        this.observer = null;
    }

    cleanup() {
        this.generation++;
        this.disconnectObserver();
        if (this.timeoutId) clearTimeout(this.timeoutId);
        this.timeoutId = null;
        this.pendingNodes.clear();
        this.history.clear();
        if (!this.activeRun) this.isProcessing = false;
    }
}

const filteringObserver = new FilteringMutationObserver();

export const setupFilteringObserver = () => filteringObserver.setupObserver();
export const processInitialFiltering = () => filteringObserver.processInitialContent();
export const cleanupFilteringObserver = () => filteringObserver.cleanup();
export const filteringHistory = filteringObserver.history;
