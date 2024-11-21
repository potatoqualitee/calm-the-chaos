// Main exports for the observer module
export { setupObserver, cleanup, history } from './ContentObserver.js';

// Also export individual components for testing and advanced usage
export { ContentObserver } from './ContentObserver.js';
export { MutationProcessor } from './mutationHandlers.js';
export { EventManager } from './eventHandlers.js';
export { isRelevantNode } from './nodeUtils.js';
export { getSiteConfig } from './config.js';