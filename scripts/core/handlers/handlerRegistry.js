// handlerRegistry.js

import { handleReddit } from '../../platforms/handleReddit.js';
import { handleFacebook } from '../../platforms/handleFacebook.js';
import { handleInstagram } from '../../platforms/handleInstagram.js';
import { handleLinkedIn } from '../../platforms/handleLinkedIn.js';
import { handleYouTube } from '../../platforms/handleYouTube.js';
import { handleCNN } from '../../platforms/handleCNN.js';
import { handleMSN } from '../../platforms/handleMSN.js';
import { handleBBC } from '../../platforms/handleBBC.js';
import { handleGoogleNews } from '../../platforms/handleGoogleNews.js';
import { handleStackOverflow } from '../../platforms/handleStackOverflow.js';
import { handleYahoo } from '../../platforms/handleYahoo.js';
import { handleBluesky } from '../../platforms/handleBluesky.js';

class HandlerRegistry {
    constructor() {
        // Map of domain patterns to their handlers
        this.handlers = new Map([
            ['reddit.com', handleReddit],
            ['news.google.com', handleGoogleNews],
            ['cnn.com', handleCNN],
            //['msn.com', handleMSN], // doesn't work yet
            ['bbc.', handleBBC],
            // ['facebook.com', handleFacebook], // just terrible perf
            ['instagram.com', handleInstagram],
            ['linkedin.com', handleLinkedIn],
            ['youtube.com', handleYouTube],
            ['stackoverflow.com', handleStackOverflow],
            ['yahoo.com', handleYahoo],
            ['bsky.app', handleBluesky]
        ]);
    }

    /**
     * Check if a hostname matches a domain pattern
     * @param {string} hostname - The hostname to check
     * @param {string} pattern - The domain pattern to match against
     * @returns {boolean} - Whether the hostname matches the pattern
     */
    isDomainMatch(hostname, pattern) {
        // Special case for BBC
        if (pattern === 'bbc.') {
            return hostname.startsWith(pattern);
        }

        // Split hostname and pattern into parts
        const hostParts = hostname.split('.');
        const patternParts = pattern.split('.');

        // If pattern has more parts than hostname, it can't match
        if (patternParts.length > hostParts.length) {
            return false;
        }

        // Check if the last N parts match, where N is the number of parts in the pattern
        for (let i = 1; i <= patternParts.length; i++) {
            if (hostParts[hostParts.length - i] !== patternParts[patternParts.length - i]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get handler for the current hostname
     * @param {string} hostname - The current hostname
     * @returns {Function|null} - Handler function if found, null otherwise
     */
    getHandler(hostname) {
        console.debug('Checking handler for hostname:', hostname);

        for (const [domain, handler] of this.handlers) {
            if (this.isDomainMatch(hostname, domain)) {
                console.debug(`Handler found for ${hostname} using pattern ${domain}`);
                return handler;
            }
        }

        console.debug('No handler found for:', hostname);
        return null;
    }

    /**
     * Execute platform-specific handler if available
     * @param {string} hostname - The current hostname
     * @param {Set} nodesToHide - Set of nodes to hide
     */
    executePlatformHandler(hostname, nodesToHide) {
        const handler = this.getHandler(hostname);
        if (handler) {
            try {
                console.debug(`Executing handler for ${hostname}`);
                handler(nodesToHide);
            } catch (error) {
                console.debug(`Error executing handler for ${hostname}:`, error);
            }
        } else {
            console.debug(`No handler executed for ${hostname}`);
        }
    }
}

export const handlerRegistry = new HandlerRegistry();
