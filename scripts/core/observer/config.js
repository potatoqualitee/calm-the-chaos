// Site-specific configurations and optimizations

export function getSiteConfig() {
    const hostname = window.location.hostname;
    const isCNN = hostname.includes('cnn.com');
    const isFacebook = hostname.includes('facebook.com');
    const isInstagram = hostname.includes('instagram.com');

    // Base configuration
    const config = {
        observerConfig: {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        },
        DEBOUNCE_DELAY: 100,
        BATCH_SIZE: 100,
        MAX_QUEUE_SIZE: 2000,
        HEAVY_MUTATION_THRESHOLD: 200,
        reconnectDelay: 2000
    };

    // Adjust settings for heavy sites
    if (isCNN || isFacebook || isInstagram) {
        config.BATCH_SIZE = 200;
        config.DEBOUNCE_DELAY = 150;
        config.observerConfig.attributeFilter = ['class', 'style'];

        if (isFacebook || isInstagram) {
            config.HEAVY_MUTATION_THRESHOLD = 300;
            config.reconnectDelay = 3000;
        }
    }

    return {
        ...config,
        isCNN,
        isFacebook,
        isInstagram
    };
}