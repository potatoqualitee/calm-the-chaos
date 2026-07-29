const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { after, before, test } = require('node:test');
const puppeteer = require('puppeteer-core');

const BRAVE_PATH = process.env.BRAVE_PATH ||
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const FIXTURE_URL = 'https://www.reddit.com/r/test/comments/calm-chaos-fixture/';
const BLOCKED_REPLY = 'calmchaosblockedprobe';
const REPO_ROOT = path.resolve(__dirname, '..');
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

function fixtureHtml() {
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

async function installChromeMock(page) {
  await page.evaluateOnNewDocument((blockedReply) => {
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

    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: chromeMock
    });
    Object.defineProperty(globalThis, '__calmChaosTestState', {
      configurable: true,
      value: state
    });
  }, BLOCKED_REPLY);
}

async function serveFixtureAndModules(page) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    const requestUrl = new URL(request.url());

    if (request.isNavigationRequest()) {
      request.respond({
        status: 200,
        contentType: 'text/html',
        body: fixtureHtml()
      });
      return;
    }

    if (requestUrl.hostname === 'www.reddit.com' &&
        requestUrl.pathname.startsWith('/scripts/')) {
      const sourcePath = path.resolve(
        REPO_ROOT,
        `.${requestUrl.pathname.replaceAll('/', path.sep)}`
      );
      if (sourcePath.startsWith(`${REPO_ROOT}${path.sep}`) &&
          fs.existsSync(sourcePath)) {
        request.respond({
          status: 200,
          contentType: 'text/javascript',
          body: fs.readFileSync(sourcePath, 'utf8')
        });
        return;
      }
    }

    request.abort();
  });
}

async function openFilteredFixture() {
  const page = await browser.newPage();
  await installChromeMock(page);
  await serveFixtureAndModules(page);
  await page.goto(FIXTURE_URL, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({
    type: 'module',
    url: 'https://www.reddit.com/scripts/content.js'
  });
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
