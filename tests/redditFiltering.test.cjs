const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const puppeteer = require('puppeteer-core');

const BRAVE_PATH = process.env.BRAVE_PATH ||
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const FIXTURE_URL = 'https://www.reddit.com/r/test/comments/calm-chaos-fixture/';
const BLUESKY_FIXTURE_URL = 'https://bsky.app/profile/audit.test/post/1';
const BLOCKED_REPLY = 'calmchaosblockedprobe';
const BLOCKED_BLUESKY_POST = 'calmchaosblueskyprobe';
const REPO_ROOT = path.resolve(__dirname, '..');
const CONTENT_BUNDLE_PATH = path.join(REPO_ROOT, 'dist', 'content.js');
const canRunBrowserTest = fs.existsSync(BRAVE_PATH);

let browser;

before(async () => {
  if (!canRunBrowserTest) return;

  browser = await puppeteer.launch({
    executablePath: BRAVE_PATH,
    headless: true,
    args: [
      '--no-first-run',
      '--disable-background-networking',
      '--disable-component-update'
    ]
  });
});

after(async () => {
  await browser?.close();
});

function fixtureHtml({ blockedTopLevel = false } = {}) {
  if (blockedTopLevel) {
    return `<!doctype html>
      <html>
        <head><meta charset="utf-8"><title>Reddit filtering fixture</title></head>
        <body>
          <main id="main-content">
            <shreddit-post>
              <shreddit-comment depth="0" id="blocked-comment">
                <div slot="comment"><p>${BLOCKED_REPLY}</p></div>
              </shreddit-comment>
            </shreddit-post>
          </main>
        </body>
      </html>`;
  }

  return `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>Reddit filtering fixture</title></head>
      <body>
        <main id="main-content">
          <shreddit-post>
            <shreddit-comment depth="0" id="parent-comment">
              <div slot="comment"><p>This parent comment is safe.</p></div>
              <details role="article" open>
                <summary>Details</summary>
                <shreddit-comment depth="1" id="blocked-reply">
                  <div slot="comment">
                    <p>${BLOCKED_REPLY}</p>
                    <div class="comment-actions-bar">Reply Award Share</div>
                  </div>
                </shreddit-comment>
              </details>
            </shreddit-comment>
          </shreddit-post>
        </main>
      </body>
    </html>`;
}

function blueskyFixtureHtml() {
  return `<!doctype html>
    <html>
      <head><meta charset="utf-8"><title>Bluesky filtering fixture</title></head>
      <body>
        <main>
          <div data-testid="feedContent">
            <div data-testid="feedItem-audit" id="blocked-post">
              <div dir="auto" data-word-wrap="1">${BLOCKED_BLUESKY_POST}</div>
            </div>
          </div>
        </main>
      </body>
    </html>`;
}

async function installChromeMock(page, blockedKeyword = BLOCKED_REPLY) {
  await page.evaluate((blockedReply) => {
    const state = {
      keywordGroups: {},
      customKeywords: [blockedReply],
      matchingOption: 'exact',
      disabledKeywords: [],
      disabledGroups: [],
      ignoredDomains: {},
      disabledDomainGroups: [],
      filteringEnabled: true,
      enabledDomains: [],
      filterAllSites: true,
      imageFilteringEnabled: false,
      showBlurMessage: false,
      collapseStyle: 'hideCompletely',
      filterRedditCommentThreads: true,
      allTimeKeywordStats: {},
      stats: { totalBlocked: 0, totalScanned: 0 }
    };

    function read(keys) {
      if (keys === null || keys === undefined) return { ...state };
      if (typeof keys === 'string') return { [keys]: state[keys] };
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map(key => [key, state[key]]));
      }
      return {
        ...keys,
        ...Object.fromEntries(
          Object.keys(keys).map(key => [key, state[key] ?? keys[key]])
        )
      };
    }

    const local = {
      get(keys, callback) {
        const result = read(keys);
        if (callback) queueMicrotask(() => callback(result));
        return Promise.resolve(result);
      },
      set(values, callback) {
        Object.assign(state, values || {});
        if (callback) queueMicrotask(callback);
        return Promise.resolve();
      },
      remove(keys, callback) {
        (Array.isArray(keys) ? keys : [keys]).forEach(key => delete state[key]);
        if (callback) queueMicrotask(callback);
        return Promise.resolve();
      }
    };

    const chromeMock = {
      runtime: {
        id: 'calm-chaos-reddit-test',
        lastError: null,
        onMessage: { addListener() {} },
        sendMessage(message, callback) {
          if (message?.type === 'getCurrentTab') {
            const response = { tabId: 1 };
            if (callback) queueMicrotask(() => callback(response));
            return Promise.resolve(response);
          }

          if (message?.type === 'updateBlockCount') {
            state[`pageStats_${message.tabId}`] = {
              pageBlocked: message.count,
              pageTotal: message.total
            };
            state.badgeCount = message.count;
          }

          if (callback) queueMicrotask(() => callback({}));
          return Promise.resolve({});
        }
      },
      storage: {
        local,
        onChanged: { addListener() {} }
      },
      tabs: {
        query() { return Promise.resolve([]); }
      }
    };

    try {
      Object.defineProperty(globalThis, 'chrome', {
        configurable: true,
        value: chromeMock
      });
    } catch (_error) {
      Object.assign(globalThis.chrome || {}, chromeMock);
    }
    Object.defineProperty(globalThis, '__calmChaosTestState', {
      configurable: true,
      value: state
    });
  }, blockedKeyword);
}

async function serveFixture(page, html) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.isNavigationRequest()) {
      request.respond({
        status: 200,
        contentType: 'text/html',
        body: html
      });
      return;
    }

    request.abort();
  });
}

async function openFilteredFixture(
  html = fixtureHtml(),
  {
    fixtureUrl = FIXTURE_URL,
    blockedKeyword = BLOCKED_REPLY
  } = {}
) {
  const page = await browser.newPage();
  const diagnostics = [];
  page.on('requestfailed', request => {
    diagnostics.push(`request failed: ${request.url()} (${request.failure()?.errorText})`);
  });
  page.on('pageerror', error => {
    diagnostics.push(`page error: ${error.message}`);
  });
  await serveFixture(page, html);
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' });
  await installChromeMock(page, blockedKeyword);
  try {
    await page.addScriptTag({
      content: fs.readFileSync(CONTENT_BUNDLE_PATH, 'utf8')
    });
  } catch (error) {
    throw new Error(`${error.message}\n${diagnostics.join('\n')}`);
  }
  await page.waitForFunction(() =>
    document.documentElement.getAttribute('data-calm-chaos-state') === 'filtered',
    { timeout: 5000 }
  );
  return page;
}

test('a blocked Reddit reply is revealed with one click', {
  skip: !canRunBrowserTest
}, async () => {
  const page = await openFilteredFixture();

  try {
    const visibleReveal = await page.$('#blocked-reply .filtered-content');
    assert.ok(visibleReveal, 'expected the filtered reply to expose a reveal control');
    await visibleReveal.click();

    const replyText = await page.$eval(
      '#blocked-reply',
      element => element.textContent
    );
    assert.match(replyText, new RegExp(BLOCKED_REPLY));
  } finally {
    await page.close();
  }
});

test('a blocked Reddit reply increments the page count', {
  skip: !canRunBrowserTest
}, async () => {
  const page = await openFilteredFixture();

  try {
    const tracking = await page.evaluate(() => ({
      badgeCount: globalThis.__calmChaosTestState.badgeCount || 0,
      pageBlocked: globalThis.__calmChaosTestState.pageStats_1?.pageBlocked || 0,
      blockedKeywords: globalThis.__calmChaosTestState.blockedKeywords_1 || []
    }));

    assert.equal(tracking.badgeCount, 1);
    assert.equal(tracking.pageBlocked, 1);
    assert.deepEqual(tracking.blockedKeywords, [{
      blockedKeywords: [BLOCKED_REPLY],
      count: 1
    }]);
  } finally {
    await page.close();
  }
});

test('a blocked top-level Reddit comment reaches the tracker', {
  skip: !canRunBrowserTest
}, async () => {
  const page = await openFilteredFixture(fixtureHtml({ blockedTopLevel: true }));

  try {
    const tracking = await page.evaluate(() => ({
      badgeCount: globalThis.__calmChaosTestState.badgeCount || 0,
      pageBlocked: globalThis.__calmChaosTestState.pageStats_1?.pageBlocked || 0
    }));

    assert.deepEqual(tracking, {
      badgeCount: 1,
      pageBlocked: 1
    });
  } finally {
    await page.close();
  }
});

test('a blocked Bluesky post increments the page count', {
  skip: !canRunBrowserTest
}, async () => {
  const page = await openFilteredFixture(blueskyFixtureHtml(), {
    fixtureUrl: BLUESKY_FIXTURE_URL,
    blockedKeyword: BLOCKED_BLUESKY_POST
  });

  try {
    const tracking = await page.evaluate(() => ({
      markerCount: document.querySelectorAll('#blocked-post .filtered-content').length,
      badgeCount: globalThis.__calmChaosTestState.badgeCount || 0,
      pageBlocked: globalThis.__calmChaosTestState.pageStats_1?.pageBlocked || 0,
      blockedKeywords: globalThis.__calmChaosTestState.blockedKeywords_1 || []
    }));

    assert.deepEqual(tracking, {
      markerCount: 1,
      badgeCount: 1,
      pageBlocked: 1,
      blockedKeywords: [{
        blockedKeywords: [BLOCKED_BLUESKY_POST],
        count: 1
      }]
    });
  } finally {
    await page.close();
  }
});
