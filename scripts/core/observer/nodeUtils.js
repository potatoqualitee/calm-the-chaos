// Node filtering utilities

/**
 * Check if node is relevant for content filtering
 * @param {Node} node - DOM node to check
 * @returns {boolean} - Whether node is relevant
 */
export function isRelevantNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return false;
    }

    // Skip invisible elements
    if (node instanceof HTMLElement &&
        (node.offsetWidth === 0 ||
            node.offsetHeight === 0 ||
            window.getComputedStyle(node).display === 'none')) {
        return false;
    }

    // Skip script, style, and other non-content elements
    const ignoredTags = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'BR', 'HR']);
    if (ignoredTags.has(node.tagName)) {
        return false;
    }

    return true;
}