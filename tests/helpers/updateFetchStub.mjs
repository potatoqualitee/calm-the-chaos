// Preloaded with `node --import` ahead of scripts/trending/update.mjs so the
// script runs its real pipeline -- real catalog read, real scoring, real
// publish gate -- against a fake network. Every request is echoed to stdout as
// `__STUB__ <METHOD> <url>`, which is how trendingPublishGate.test.mjs proves a
// rejected payload never reaches a gist PATCH.

const ledgerState = JSON.parse(process.env.STUB_LEDGER_STATE || '{"phrases":{}}');
const livePublished = process.env.STUB_LIVE_PUBLISHED || 'null';

const GIST_API = 'https://api.github.com/gists';
const LEDGER_FILE = 'trending-state.json';
const PUBLISH_FILE = 'new-development.json';

const jsonResponse = value => new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
});

// Two bland items per feed, every word carrying the feed's own index so no
// phrase is ever shared across outlets. That clears update.mjs's 20-headline
// floor while leaving the cross-outlet breadth requirement unmet, so the
// heuristics admit no newcomers and the ledger fixture is the whole payload.
let feedsServed = 0;
function feedXml() {
    const n = ++feedsServed;
    const item = i =>
        `<item><title>Zorbex${n}${i} quibfeld${n}${i} tremellow${n}${i}</title></item>`;
    return '<?xml version="1.0"?><rss><channel>' + item('a') + item('b') + '</channel></rss>';
}

globalThis.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const target = String(url);
    console.log(`__STUB__ ${method} ${target}`);

    if (!target.startsWith(GIST_API)) {
        return new Response(feedXml(), {
            status: 200,
            headers: { 'Content-Type': 'application/xml' }
        });
    }
    if (method === 'PATCH') return jsonResponse({});
    // A "null" publish gist body reads back as no live payload, so the
    // unchanged-set shortcut never swallows the write we assert on.
    return jsonResponse(target.endsWith(process.env.LEDGER_GIST_ID)
        ? { files: { [LEDGER_FILE]: { content: JSON.stringify(ledgerState) } } }
        : { files: { [PUBLISH_FILE]: { content: livePublished } } });
};
