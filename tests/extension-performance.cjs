const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BRAVE_PATH = process.env.BRAVE_PATH ||
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const TARGET_URL = process.env.PERF_URL || 'https://edition.cnn.com/';
const WITH_EXTENSION = process.env.PERF_NO_EXTENSION !== '1';
const COLLAPSE_STYLE = process.env.PERF_COLLAPSE_STYLE || 'hideCompletely';
const REPORT_PATH = path.resolve(process.env.PERF_REPORT ||
  (WITH_EXTENSION ? 'test-results/cnn-performance.json' : 'test-results/cnn-performance-baseline.json'));
const TRACE_PATH = path.resolve(process.env.PERF_TRACE ||
  (WITH_EXTENSION ? 'test-results/cnn-performance-trace.json' : 'test-results/cnn-performance-baseline-trace.json'));

async function main() {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const extensionPath = path.resolve('dist');
  const extensionArgs = WITH_EXTENSION ? [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`
  ] : [];
  const browser = await puppeteer.launch({
    executablePath: BRAVE_PATH,
    headless: true,
    ignoreDefaultArgs: WITH_EXTENSION ? ['--disable-extensions'] : [],
    args: [
      ...extensionArgs,
      '--no-first-run',
      '--disable-component-update'
    ]
  });
  if (WITH_EXTENSION && COLLAPSE_STYLE !== 'hideCompletely') {
    const extensionTarget = await browser.waitForTarget(target =>
      target.type() === 'service_worker' && target.url().startsWith('chrome-extension://'),
      { timeout: 10000 }
    );
    const worker = await extensionTarget.worker();
    await worker.evaluate(style => chrome.storage.local.set({ collapseStyle: style }), COLLAPSE_STYLE);
  }

  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    globalThis.__calmChaosPerf = {
      cls: 0,
      lcp: 0,
      longTasks: [],
      stateChanges: []
    };

    const recordState = () => {
      const state = document.documentElement?.getAttribute('data-calm-chaos-state');
      if (!state) return;
      const changes = globalThis.__calmChaosPerf.stateChanges;
      if (changes.at(-1)?.state !== state) {
        changes.push({ state, at: performance.now() });
      }
    };
    new MutationObserver(recordState).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['data-calm-chaos-state']
    });

    try {
      new PerformanceObserver(list => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          globalThis.__calmChaosPerf.lcp = entries.at(-1).startTime;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (_error) {}

    try {
      new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          if (!entry.hadRecentInput) globalThis.__calmChaosPerf.cls += entry.value;
        });
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (_error) {}

    try {
      new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          globalThis.__calmChaosPerf.longTasks.push({
            startTime: entry.startTime,
            duration: entry.duration
          });
        });
      }).observe({ type: 'longtask', buffered: true });
    } catch (_error) {}
  });

  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  await page.tracing.start({ path: TRACE_PATH });

  try {
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (WITH_EXTENSION) {
      await page.waitForFunction(() =>
        document.documentElement.getAttribute('data-calm-chaos-state') === 'filtered',
        { timeout: 20000 }
      );
    }
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 5000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 1000));

    const pageMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paints = Object.fromEntries(
        performance.getEntriesByType('paint').map(entry => [entry.name, entry.startTime])
      );
      const data = globalThis.__calmChaosPerf;
      return {
        state: document.documentElement.getAttribute('data-calm-chaos-state'),
        hiddenElements: document.querySelectorAll(
          '[style*="display: none"], [style*="visibility: hidden"], .hidden-post'
        ).length,
        firstContentfulPaint: paints['first-contentful-paint'] || null,
        largestContentfulPaint: data.lcp || null,
        cumulativeLayoutShift: data.cls,
        totalBlockingTime: data.longTasks.reduce(
          (total, task) => total + Math.max(0, task.duration - 50),
          0
        ),
        longTaskCount: data.longTasks.length,
        filteredAt: data.stateChanges.find(change => change.state === 'filtered')?.at || null,
        domContentLoaded: nav?.domContentLoadedEventEnd || null,
        loadEventEnd: nav?.loadEventEnd || null,
        transferredBytes: nav?.transferSize || null,
        stateChanges: data.stateChanges
      };
    });
    const protocolMetrics = await cdp.send('Performance.getMetrics');
    const metricMap = Object.fromEntries(
      protocolMetrics.metrics.map(metric => [metric.name, metric.value])
    );
    const report = {
      generatedAt: new Date().toISOString(),
      withExtension: WITH_EXTENSION,
      collapseStyle: WITH_EXTENSION ? COLLAPSE_STYLE : null,
      url: page.url(),
      browser: await browser.version(),
      extensionTargets: browser.targets()
        .filter(target => target.url().startsWith('chrome-extension://'))
        .map(target => ({ type: target.type(), url: target.url() })),
      page: pageMetrics,
      process: {
        scriptDurationMs: (metricMap.ScriptDuration || 0) * 1000,
        taskDurationMs: (metricMap.TaskDuration || 0) * 1000,
        jsHeapUsedBytes: metricMap.JSHeapUsedSize || 0,
        domNodes: metricMap.Nodes || 0
      },
      pageErrors
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));

    if ((WITH_EXTENSION && pageMetrics.state !== 'filtered') || pageErrors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await page.tracing.stop();
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
