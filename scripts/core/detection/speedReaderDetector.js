// speedReaderDetector.js

class SpeedReaderDetector {
    constructor() {
        this.isSpeedReader = false;
        this.initSpeedReader();
        this.setupSpeedReaderObserver();
    }

    /**
     * Initialize SpeedReader detection
     */
    initSpeedReader() {
        const detected = this.detectSpeedReader();
        if (detected) {
            console.log('SpeedReader detected on initial load');
            this.isSpeedReader = true;
        }
    }

    /**
     * Set up mutation observer to detect SpeedReader after dynamic changes
     */
    setupSpeedReaderObserver() {
        const observer = new MutationObserver(() => {
            if (!this.isSpeedReader && this.detectSpeedReader()) {
                console.log('SpeedReader detected after page update');
                this.isSpeedReader = true;
            }
        });

        observer.observe(document.documentElement, {
            attributes: true,
            childList: true,
            subtree: true
        });
    }

    /**
     * Detect if the current page is using Brave's SpeedReader
     * @returns {boolean} - Whether SpeedReader is detected
     */
    detectSpeedReader() {
        try {
            // Check for SpeedReader-specific attributes and elements
            const html = document.documentElement;
            const hasSpeedReaderAttrs = html.hasAttribute('data-font-family') ||
                html.hasAttribute('data-font-size') ||
                html.hasAttribute('data-column-width');

            // Check for SpeedReader-specific styles and scripts
            const hasSpeedReaderElements = document.getElementById('brave_speedreader_style') !== null ||
                document.getElementById('atkinson_hyperligible_font') !== null;

            // Check for SpeedReader-specific classes
            const hasSpeedReaderClasses = document.querySelector('.tts-paragraph-player, .tts-highlighted, .tts-circle') !== null;

            // Check for Brave's CSP meta tag
            const hasSpeedReaderCSP = document.querySelector('meta[http-equiv="Content-Security-Policy"][content*="default-src \'none\'"]') !== null;

            const result = hasSpeedReaderAttrs || hasSpeedReaderElements || hasSpeedReaderClasses || hasSpeedReaderCSP;

            if (result) {
                console.log('SpeedReader detected on page');
            }

            return result;
        } catch (error) {
            console.log('Error checking for SpeedReader: ' + error.message);
            return false;
        }
    }

    /**
     * Get current SpeedReader status
     * @returns {boolean}
     */
    getStatus() {
        return this.isSpeedReader;
    }
}

const detector = new SpeedReaderDetector();

export const isSpeedReader = () => detector.getStatus();
export default SpeedReaderDetector;