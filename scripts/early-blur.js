import { isSpeedReader } from './core/detection/speedReaderDetector.js';
import { needsImmediateBlur } from './core/config/immediateBlur.js';

// Prevent blur if SpeedReader is detected immediately or content is already filtered
if (isSpeedReader() || document.documentElement.getAttribute('data-calm-chaos-state') === 'filtered') {
    document.documentElement.classList.add('blur-removed');
} else {
    // Check if site needs immediate blur
    const hostname = window.location.hostname.replace(/^www\./, '');
    if (needsImmediateBlur(hostname)) {
        // Initial CSS-based blur
        document.documentElement.classList.add('immediate-blur');
    }
}