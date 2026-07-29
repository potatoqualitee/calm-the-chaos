// Publication shaping. Pure functions only -- update.mjs performs the HTTP.

const CATEGORY_NAME = 'New Developments';

// The extension REPLACES its whole New Developments group with this payload
// (scripts/background/background.js), so anything omitted here is destroyed
// for extension users. The curated catalog entries must ride along.
export function mergeCuratedIntoCategory(category, curated) {
    const entry = category[CATEGORY_NAME] || {};
    return {
        [CATEGORY_NAME]: {
            ...entry,
            // Curated last: curation is authoritative for the entries it owns.
            keywords: { ...(entry.keywords || {}), ...curated }
        }
    };
}

function comparable(payload) {
    const entry = payload?.[CATEGORY_NAME];
    if (!entry || typeof entry !== 'object') return null;
    const keywords = entry.keywords || {};
    return JSON.stringify(
        Object.keys(keywords).sort().map(name => [
            name,
            keywords[name]?.weight,
            keywords[name]?.description
        ])
    );
}

// updatedAt is deliberately excluded: it moves every run and the consumers
// never read it, so including it would make every run look like a change.
export function publishedNamesEqual(a, b) {
    const left = comparable(a);
    const right = comparable(b);
    return left !== null && right !== null && left === right;
}
