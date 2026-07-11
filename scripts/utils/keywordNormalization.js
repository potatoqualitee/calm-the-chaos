export function normalizeKeyword(keyword) {
    if (!keyword) return '';

    return String(keyword)
        .normalize('NFKC')
        .replace(/^[\s.,:;!?'"[\]{}()\\/<>+=_-]+|[\s.,:;!?'"[\]{}()\\/<>+=_-]+$/g, '')
        .toLowerCase()
        .trim()
        .slice(0, 100);
}
