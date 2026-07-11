export const IMMEDIATE_BLUR_SITES = [
    'cnn.com',
    'bbc.com',
    'bbc.co.uk',
    'bbc.in'
];

function getHostname(value) {
    try {
        if (/^https?:\/\//i.test(value)) return new URL(value).hostname.toLowerCase();
    } catch (_error) {
        return '';
    }

    return String(value || '')
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .split(':')[0]
        .replace(/^www\./, '');
}

export function needsImmediateBlur(value) {
    const hostname = getHostname(value);
    return IMMEDIATE_BLUR_SITES.some(domain =>
        hostname === domain || hostname.endsWith(`.${domain}`)
    );
}
