const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BRAVE_PATH = process.env.BRAVE_PATH ||
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const NAVIGATION_TIMEOUT = Number(process.env.SITE_TIMEOUT_MS || 15000);
const CONCURRENCY = Math.max(1, Number(process.env.SITE_CONCURRENCY || 4));
const REPORT_PATH = process.env.SITE_REPORT_FILE || 'test-results/site-smoke.json';
const INITIAL_MARKER = 'calmchaosinitialprobe';
const MUTATION_MARKER = 'calmchaosmutationprobe';
const GATED_TITLE = /before you continue|access denied|just a moment|enable javascript|are you a robot|sign in|log in|consent|attention required|unsupported browser|temporarily unavailable/i;
const EXPECTED_HYDRATION_ERROR = /Minified React error #(418|423)\b/;

const URL_OVERRIDES = {
  'bbc.com': 'https://www.bbc.com/',
  'cnn.com': 'https://www.cnn.com/',
  'news.google.com': 'https://news.google.com/home?hl=en-US&gl=US&ceid=US:en',
  'stackoverflow.com': 'https://stackoverflow.com/questions',
  'substack.com': 'https://substack.com/home'
};

function getManifestTargets() {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const patterns = manifest.host_permissions.filter(pattern => pattern.startsWith('https://'));
  const hosts = [...new Set(patterns.map(pattern => {
    const match = pattern.match(/^https:\/\/(?:\*\.)?([^/]+)\//);
    return match?.[1] || null;
  }).filter(Boolean))].sort();
  const requestedHosts = process.argv.slice(2);

  return {
    patternCount: patterns.length,
    hosts: requestedHosts.length > 0
      ? hosts.filter(host => requestedHosts.includes(host))
      : hosts
  };
}

function makeUrl(host) {
  if (process.env.SITE_URL_OVERRIDE && process.argv.slice(2).length === 1) {
    return process.env.SITE_URL_OVERRIDE;
  }
  return URL_OVERRIDES[host] || `https://${host}/`;
}

async function installChromeMock(page, customKeywords) {
  await page.evaluate((keywords) => {
    const state = {
      keywordGroups: {},
      customKeywords: keywords,
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
      allTimeKeywordStats: {}
    };

    function read(keys) {
      if (keys === null || keys === undefined) return { ...state };
      if (typeof keys === 'string') return { [keys]: state[keys] };
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map(key => [key, state[key]]));
      }
      return { ...keys, ...Object.fromEntries(Object.keys(keys).map(key => [key, state[key] ?? keys[key]])) };
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
        id: 'calm-chaos-smoke-test',
        lastError: null,
        onMessage: { addListener() {} },
        sendMessage(message, callback) {
          const response = message?.type === 'getCurrentTab' ? { tabId: 1 } : {};
          if (callback) queueMicrotask(() => callback(response));
          return Promise.resolve(response);
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
  }, customKeywords);
}

async function prepareFixture(page) {
  return page.evaluate((initialMarker) => {
    const main = document.querySelector('main, [role="main"]') ||
      document.body ||
      document.documentElement;
    const candidates = Array.from(main.querySelectorAll(
      '[data-testid="card-headline"], h1, h2, h3, article a[href], [role="article"] a[href]'
    ));
    if (location.hostname.endsWith('cnn.com') && main.matches('article, .article')) {
      const externalHeadline = document.querySelector('h1.headline__text, h1[class*="headline"], h1');
      if (externalHeadline && !main.contains(externalHeadline)) candidates.unshift(externalHeadline);
    }
    const nativeTarget = candidates.find(element => {
      if (element.closest('header, footer, nav, [role="navigation"]')) return false;
      const text = (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
      const style = getComputedStyle(element);
      return text.length >= 20 && text.length <= 240 &&
        style.display !== 'none' && style.visibility !== 'hidden';
    });
    const nativeText = nativeTarget
      ? (nativeTarget.innerText || nativeTarget.textContent || '').replace(/\s+/g, ' ').trim()
      : null;
    if (nativeTarget) nativeTarget.setAttribute('data-calm-chaos-native-probe', 'true');

    const probe = document.createElement(location.hostname.includes('reddit.com') ? 'shreddit-post' : 'article');
    probe.id = 'calm-chaos-initial-probe';
    probe.className = 'card question';
    probe.setAttribute('role', 'article');
    probe.setAttribute('data-component-name', 'card');
    probe.setAttribute('data-testid', 'calm-chaos-probe-article');
    probe.setAttribute('data-n-tid', 'calm-chaos-probe');
    probe.innerHTML = `<div data-testid="feedItem-calm-chaos-initial"><div data-word-wrap="1">${initialMarker}</div></div>`;
    main.appendChild(probe);

    const hiddenNavigation = Array.from(document.querySelectorAll('header, footer, nav, [role="navigation"]'))
      .filter(element => element.style.display === 'none' || element.hidden || element.classList.contains('hidden-post'))
      .length;

    return {
      nativeText,
      nativeTag: nativeTarget?.tagName || null,
      contentCharacters: (main.innerText || main.textContent || '').length,
      hiddenNavigation
    };
  }, INITIAL_MARKER);
}

function accessClassification(statusCode, title, contentCharacters, navigationError) {
  if ((statusCode && statusCode >= 400) || navigationError) return 'blocked';
  if (GATED_TITLE.test(title) || contentCharacters < 100) return 'gated';
  return 'live';
}

async function readFilterState(page, fixture) {
  return page.evaluate(({ initialMarker, nativeText, baselineNavigation }) => {
    function isFiltered(element, marker) {
      if (!element?.isConnected) return false;
      let current = element;
      while (current && current !== document.documentElement) {
        if (current.style.display === 'none' || current.hidden || current.classList.contains('hidden-post')) {
          return true;
        }
        current = current.parentElement;
      }
      return Boolean(element.querySelector?.('.filtered-content')) ||
        !(element.textContent || '').toLowerCase().includes(marker.toLowerCase());
    }

    const initial = document.getElementById('calm-chaos-initial-probe');
    const native = document.querySelector('[data-calm-chaos-native-probe="true"]');
    const hiddenNavigation = Array.from(document.querySelectorAll('header, footer, nav, [role="navigation"]'))
      .filter(element => element.style.display === 'none' || element.hidden || element.classList.contains('hidden-post'))
      .length;

    return {
      state: document.documentElement.getAttribute('data-calm-chaos-state'),
      initialFiltered: isFiltered(initial, initialMarker),
      nativeFiltered: nativeText ? isFiltered(native, nativeText) : null,
      navigationRegression: hiddenNavigation > baselineNavigation
    };
  }, {
    initialMarker: INITIAL_MARKER,
    nativeText: fixture.nativeText,
    baselineNavigation: fixture.hiddenNavigation
  });
}

async function testMutation(page) {
  await page.evaluate((mutationMarker) => {
    let testRoot = document.getElementById('calm-chaos-smoke-root');
    if (!testRoot) {
      testRoot = document.createElement('div');
      testRoot.id = 'calm-chaos-smoke-root';
      (document.body || document.documentElement).appendChild(testRoot);
    }
    const probe = document.createElement(location.hostname.includes('reddit.com') ? 'shreddit-post' : 'article');
    probe.id = 'calm-chaos-mutation-probe';
    probe.className = 'card question';
    probe.setAttribute('role', 'article');
    probe.setAttribute('data-component-name', 'card');
    probe.setAttribute('data-testid', 'calm-chaos-mutation-article');
    probe.setAttribute('data-n-tid', 'calm-chaos-mutation');
    probe.innerHTML = `<div data-testid="feedItem-calm-chaos-mutation"><div data-word-wrap="1">${mutationMarker}</div></div>`;
    testRoot.appendChild(probe);
  }, MUTATION_MARKER);

  try {
    await page.waitForFunction((marker) => {
      const element = document.getElementById('calm-chaos-mutation-probe');
      if (!element?.isConnected) return false;
      let current = element;
      while (current && current !== document.documentElement) {
        if (current.style.display === 'none' || current.hidden || current.classList.contains('hidden-post')) return true;
        current = current.parentElement;
      }
      return Boolean(element.querySelector('.filtered-content')) ||
        !(element.textContent || '').toLowerCase().includes(marker.toLowerCase());
    }, { timeout: 6000, polling: 100 }, MUTATION_MARKER);
    return true;
  } catch (_error) {
    return false;
  }
}

async function testHost(browser, bundle, host) {
  const page = await browser.newPage();
  const url = makeUrl(host);
  let statusCode = null;
  let navigationError = null;
  const extensionErrors = [];
  const postInjectionPageErrors = [];
  let extensionPhase = false;

  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
  await page.setBypassCSP(true);
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (['image', 'media', 'font'].includes(request.resourceType())) request.abort();
    else request.continue();
  });
  page.on('pageerror', error => {
    if (extensionPhase && !EXPECTED_HYDRATION_ERROR.test(error.message)) {
      const details = error.stack || error.message;
      postInjectionPageErrors.push(error.message);
      if (details.includes('calm-chaos-content.js')) {
        extensionErrors.push(error.message);
      }
    }
  });

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    statusCode = response?.status() || null;
  } catch (error) {
    navigationError = error.message;
  }

  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    await page.waitForFunction(() => {
      const main = document.querySelector('main, [role="main"]') ||
        document.body ||
        document.documentElement;
      return (main.innerText || main.textContent || '').trim().length >= 100;
    }, { timeout: 3000, polling: 100 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 250));
    const fixture = await prepareFixture(page);
    const title = await page.title();
    const access = accessClassification(statusCode, title, fixture.contentCharacters, navigationError);
    const keywords = [INITIAL_MARKER, MUTATION_MARKER];
    if (fixture.nativeText && access === 'live') keywords.push(fixture.nativeText);

    await installChromeMock(page, keywords);
    extensionPhase = true;
    await page.addScriptTag({
      content: `${bundle}\n//# sourceURL=calm-chaos-content.js`
    });

    try {
      await page.waitForFunction(() =>
        document.documentElement.getAttribute('data-calm-chaos-state') === 'filtered',
        { timeout: 10000, polling: 100 }
      );
    } catch (_error) {
      // State is captured below and reported as a deterministic failure.
    }

    const filterState = await readFilterState(page, fixture);
    const mutationFiltered = await testMutation(page);
    const result = {
      host,
      requestedUrl: url,
      finalUrl: page.url(),
      statusCode,
      title,
      access,
      navigationError,
      contentCharacters: fixture.contentCharacters,
      nativeCandidate: fixture.nativeText ? {
        tag: fixture.nativeTag,
        text: fixture.nativeText.slice(0, 160),
        filtered: filterState.nativeFiltered
      } : null,
      initialFiltered: filterState.initialFiltered,
      mutationFiltered,
      navigationRegression: filterState.navigationRegression,
      finalState: filterState.state,
      postInjectionPageErrors: postInjectionPageErrors.slice(0, 5),
      extensionErrors: extensionErrors.slice(0, 5)
    };
    await page.close();
    return result;
  } catch (error) {
    const result = {
      host,
      requestedUrl: url,
      finalUrl: page.url(),
      statusCode,
      title: await page.title().catch(() => ''),
      access: 'blocked',
      navigationError: navigationError || error.message,
      initialFiltered: false,
      mutationFiltered: false,
      navigationRegression: false,
      finalState: null,
      postInjectionPageErrors: postInjectionPageErrors.slice(0, 5),
      extensionErrors: extensionErrors.slice(0, 5)
    };
    await page.close().catch(() => {});
    return result;
  }
}

async function main() {
  if (!fs.existsSync(BRAVE_PATH)) throw new Error(`Brave not found at ${BRAVE_PATH}`);
  if (!fs.existsSync('dist/content.js')) throw new Error('Run npm run build before the site smoke test.');

  const { patternCount, hosts } = getManifestTargets();
  const bundle = fs.readFileSync('dist/content.js', 'utf8');
  const browser = await puppeteer.launch({
    executablePath: BRAVE_PATH,
    headless: true,
    args: [
      '--no-first-run',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-features=Translate'
    ]
  });
  const results = new Array(hosts.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < hosts.length) {
      const index = nextIndex++;
      const host = hosts[index];
      const result = await testHost(browser, bundle, host);
      results[index] = result;
      const pipeline = result.access === 'blocked'
        ? 'SKIP'
        : result.initialFiltered && result.mutationFiltered ? 'PASS' : 'FAIL';
      process.stdout.write(`${String(index + 1).padStart(2, '0')}/${hosts.length} ${host} ${result.access} ${pipeline}\n`);
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, hosts.length) }, worker));
  } finally {
    await browser.close();
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    manifestPatterns: patternCount,
    uniqueHostsTested: results.length,
    access: {
      live: results.filter(result => result.access === 'live').length,
      gated: results.filter(result => result.access === 'gated').length,
      blocked: results.filter(result => result.access === 'blocked').length
    },
    pipelineEligible: results.filter(result => result.access !== 'blocked').length,
    initialPass: results.filter(result => result.access !== 'blocked' && result.initialFiltered).length,
    mutationPass: results.filter(result => result.access !== 'blocked' && result.mutationFiltered).length,
    nativeCandidates: results.filter(result => result.access === 'live' && result.nativeCandidate).length,
    nativePass: results.filter(result => result.access === 'live' && result.nativeCandidate?.filtered).length,
    navigationRegressions: results.filter(result => result.navigationRegression).length,
    extensionErrorHosts: results.filter(result => result.extensionErrors.length > 0).length
  };
  const report = { summary, results };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  const deterministicFailures = results.filter(result =>
    result.access !== 'blocked' &&
    (!result.initialFiltered || !result.mutationFiltered || result.navigationRegression)
  );
  if (deterministicFailures.length > 0) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
