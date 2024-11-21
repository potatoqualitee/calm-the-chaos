// Configuration for sites that should be immediately blurred
// This allows easy opt-in for other sites in the future
export const IMMEDIATE_BLUR_SITES = {
    'cnn.com': {
        enabled: true,
        // Can add site-specific blur settings here if needed
        // e.g. blur intensity, background color, etc.
    }
};

// Utility function to check if a hostname needs immediate blur
export function needsImmediateBlur(hostname) {
    // Remove 'www.' prefix for consistent matching
    const normalizedHostname = hostname.replace(/^www\./, '');

    // Check each domain pattern
    for (const domain in IMMEDIATE_BLUR_SITES) {
        if (normalizedHostname.includes(domain) && IMMEDIATE_BLUR_SITES[domain].enabled) {
            return true;
        }
    }

    return false;
}

import * as storage from '../../../options/optionsStorage.js';

// Create and show blur overlay
export async function showImmediateBlur() {
    // Remove any existing overlay first
    removeImmediateBlur();

    // Remove initial blur by adding a class
    document.documentElement.classList.add('blur-removed');

    const overlay = document.createElement('div');
    overlay.id = 'calm-chaos-blur-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        backdrop-filter: blur(10px);
        background-color: rgba(255, 255, 255, 0.5);
        z-index: 999999;
        display: flex;
        justify-content: center;
        align-items: center;
    `;

    // Set timeout to automatically remove blur after 10 seconds
    setTimeout(() => {
        removeImmediateBlur();
    }, 10000);

    // Check if message should be shown
    const settings = await storage.getStorageData(['showBlurMessage']);
    const showMessage = settings.showBlurMessage !== false; // Default to true if not set

    if (showMessage) {
        const messageContainer = document.createElement('div');
        messageContainer.style.cssText = `
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(240, 248, 255, 0.95));
            border-radius: 20px;
            padding: 28px 40px;
            text-align: center;
            box-shadow: 0 8px 32px rgba(31, 38, 135, 0.15);
            min-width: 480px;
            white-space: nowrap;
            pointer-events: none;
            border: 1px solid rgba(255, 255, 255, 0.4);
            backdrop-filter: blur(4px);
        `;

        const emojis = document.createElement('div');
        emojis.style.cssText = `
            font-size: 32px;
            margin-bottom: 20px;
            display: flex;
            justify-content: center;
            gap: 12px;
            animation: float 6s ease-in-out infinite;
        `;
        emojis.innerHTML = '☁️ 🍵 😌 🌿';

        const message = document.createElement('p');
        message.style.cssText = `
            margin: 0;
            color: #2c3e50;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 18px;
            line-height: 1.6;
            font-weight: 500;
        `;
        message.textContent = 'Taking a mindful pause to filter content...';

        // Add floating animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes float {
                0% { transform: translateY(0px); }
                50% { transform: translateY(-10px); }
                100% { transform: translateY(0px); }
            }
        `;
        document.head.appendChild(style);

        messageContainer.appendChild(emojis);
        messageContainer.appendChild(message);
        overlay.appendChild(messageContainer);
    }
    document.documentElement.appendChild(overlay);
    return overlay;
}

// Remove blur overlay
export function removeImmediateBlur() {
    const overlay = document.getElementById('calm-chaos-blur-overlay');
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }

    // Remove initial blur if it exists
    document.documentElement.classList.add('blur-removed');
}