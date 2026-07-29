// tests/trendingValidate.test.mjs proves validateTrending returns problems for
// a malformed payload. This file proves update.mjs acts on them: it runs the
// real script against a stubbed network and asserts a rejected payload exits
// nonzero having PATCHed neither gist, so a failed validation records no
// sightings in the ledger.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UPDATE_SCRIPT = path.join(repoRoot, 'scripts', 'trending', 'update.mjs');
const FETCH_STUB = pathToFileURL(
    path.join(repoRoot, 'tests', 'helpers', 'updateFetchStub.mjs')
).href;
const LEDGER_GIST_ID = 'stub-ledger-gist';
const PUBLISH_GIST_ID = '3488593dcc622acc736055fa00a9745e';

// One carried ledger phrase the heuristics keep verbatim, which makes it the
// only heuristic entry in the payload update.mjs gates on. Nonsense words: a
// real phrase risks overlapping a permanent catalog keyword, which would strip
// it before it ever reached the gate. Dates are relative to now because the
// script runs on the real clock and drops anything already expired.
function ledgerState(display) {
    const now = Date.now();
    const iso = ms => new Date(ms).toISOString();
    return {
        updatedAt: iso(now - 3600000),
        phrases: {
            'zorblatt quibnar': {
                display,
                firstSeen: iso(now - 2 * 86400000),
                lastSeen: iso(now - 3600000),
                heat: 20,
                peakHeat: 20,
                daysActive: 2,
                expiresAt: iso(now + 10 * 86400000),
                bipartisan: true,
                outlets: 5,
                peakOutlets: 5
            }
        }
    };
}

function runUpdate(state) {
    const result = spawnSync(process.execPath, ['--import', FETCH_STUB, UPDATE_SCRIPT], {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
            ...process.env,
            GIST_PAT: 'stub-token',
            LEDGER_GIST_ID,
            STUB_LEDGER_STATE: JSON.stringify(state),
            // Empty so a developer's real key can't add an unstubbed call
            BRAVE_API_KEY: '',
            HEADLINES_OUT: ''
        }
    });
    const requests = (result.stdout || '')
        .split('\n')
        .filter(line => line.startsWith('__STUB__ '))
        .map(line => line.slice('__STUB__ '.length).trim());
    return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
        writes: requests.filter(request => request.startsWith('PATCH '))
    };
}

describe('update.mjs publish gate', () => {
    it('publishes and records the ledger when the payload validates', () => {
        const run = runUpdate(ledgerState('Zorblatt Quibnar'));

        expect(run.stderr).toBe('');
        expect(run.status).toBe(0);
        expect(run.writes.some(write => write.includes(PUBLISH_GIST_ID))).toBe(true);
        expect(run.writes.some(write => write.includes(LEDGER_GIST_ID))).toBe(true);
    }, 60000);

    it('aborts without writing either gist when the payload fails validation', () => {
        // Same fixture, display no longer a casing of its key: validateTrending
        // rejects the state entry, and the phrase publishes under a name no
        // state entry backs.
        const run = runUpdate(ledgerState('Zorblatt Quibnar Extra'));

        expect(run.status).toBe(1);
        expect(run.stderr).toContain('refusing to publish an invalid payload');
        expect(run.stderr).toContain('display must be a casing of the key');
        expect(run.stderr).toContain('published phrases must be tracked');
        // The ledger is written last, so an abort must leave it untouched
        expect(run.writes).toEqual([]);
    }, 60000);
});
