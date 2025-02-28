/**
 * InputProtector - Utility class to identify and protect input-related elements from mutation processing
 * This helps prevent performance issues when typing in text fields, textareas, etc.
 */
export class InputProtector {
    constructor() {
        // Cache of elements we've already checked
        this.inputElementCache = new WeakMap();

        // Input-related tag names (lowercase)
        this.inputTagNames = new Set([
            'input',
            'textarea',
            'select',
            'option'
        ]);

        // Classes that often indicate input areas (partial matches)
        this.inputClassPatterns = [
            'editor',
            'input',
            'compose',
            'text-field',
            'textarea',
            'editable',
            'rich-text',
            'form-control',
            'comment'
        ];

        // Attributes that indicate input functionality
        this.inputAttributes = new Set([
            'contenteditable',
            'role="textbox"',
            'role="combobox"',
            'role="searchbox"',
            'role="textarea"',
            'role="input"'
        ]);
    }

    /**
     * Check if a node is an input element or inside an input element
     * @param {Node} node - The node to check
     * @returns {boolean} - True if the node is input-related
     */
    isInputRelated(node) {
        // Skip non-element nodes
        if (!node || node.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        // Check cache first
        if (this.inputElementCache.has(node)) {
            return this.inputElementCache.get(node);
        }

        // Check if the element itself is an input element
        const isInput = this._isInputElement(node);

        // Cache the result
        this.inputElementCache.set(node, isInput);

        return isInput;
    }

    /**
     * Check if a node or any of its ancestors is an input element
     * @param {Node} node - The node to check
     * @returns {boolean} - True if the node or any ancestor is input-related
     */
    isInInputContext(node) {
        // Handle text nodes by checking their parent
        if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            return this.isInInputContext(node.parentElement);
        }

        // Check if the node itself is an input
        if (this.isInputRelated(node)) {
            return true;
        }

        // Check ancestors
        let parent = node.parentElement;
        while (parent) {
            if (this.isInputRelated(parent)) {
                return true;
            }
            parent = parent.parentElement;
        }

        return false;
    }

    /**
     * Check if a mutation is related to input elements
     * @param {MutationRecord} mutation - The mutation to check
     * @returns {boolean} - True if the mutation is input-related
     */
    isMutationInputRelated(mutation) {
        // Check the target node
        if (this.isInInputContext(mutation.target)) {
            return true;
        }

        // Check added nodes
        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
                if (this.isInInputContext(node)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Internal method to check if an element is an input element
     * @private
     * @param {Element} element - The element to check
     * @returns {boolean} - True if the element is input-related
     */
    _isInputElement(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        const tagName = element.tagName.toLowerCase();

        // Check tag name
        if (this.inputTagNames.has(tagName)) {
            return true;
        }

        // Check contentEditable
        if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
            return true;
        }

        // Check for input-related attributes
        for (const attr of this.inputAttributes) {
            if (element.hasAttribute(attr) || element.outerHTML.includes(attr)) {
                return true;
            }
        }

        // Check for input-related classes
        if (element.className) {
            const className = element.className.toLowerCase();
            for (const pattern of this.inputClassPatterns) {
                if (className.includes(pattern)) {
                    return true;
                }
            }
        }

        // Check for specific platform patterns

        // Gmail compose box
        if (element.getAttribute('aria-label')?.includes('Message Body') ||
            element.getAttribute('aria-label')?.includes('Compose')) {
            return true;
        }

        // Bluesky composer
        if (element.getAttribute('data-testid')?.includes('composer') ||
            element.getAttribute('placeholder')?.includes('What')) {
            return true;
        }

        return false;
    }

    /**
     * Clear the cache to free memory
     */
    clearCache() {
        this.inputElementCache = new WeakMap();
    }
}

// Create a singleton instance
const inputProtector = new InputProtector();
export default inputProtector;