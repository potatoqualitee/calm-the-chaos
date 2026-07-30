const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    const style = {};
    style.setProperty = (property, value) => { style[property] = value; };
    this.style = style;
    this.classList = { add() {} };
    this.id = '';
    this.textContent = '';
    this.innerHTML = '';
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter(candidate => candidate !== child);
    child.parentNode = null;
    return child;
  }

  setAttribute() {}

  getAttribute() {
    return null;
  }
}

function findById(element, id) {
  if (element.id === id) return element;
  for (const child of element.children) {
    const match = findById(child, id);
    if (match) return match;
  }
  return null;
}

let importCounter = 0;

async function importImmediateBlur() {
  const source = fs
    .readFileSync(path.resolve('scripts/core/config/immediateBlur.js'), 'utf8')
    .replace(
      "import { getStorageData } from '../../utils/chromeStorage.js';",
      'const getStorageData = (...args) => globalThis.__getStorageData(...args);'
    );

  // A unique suffix defeats the module cache so each test gets a fresh module.
  const busted = `${source}\n// test-import ${importCounter++}`;
  return import(`data:text/javascript;base64,${Buffer.from(busted).toString('base64')}`);
}

test('keeps the mindful-pause message visible for a minimum time', async () => {
  const documentElement = new FakeElement('html');
  const originalDocument = globalThis.document;
  const originalGetStorageData = globalThis.__getStorageData;
  const originalSetTimeout = globalThis.setTimeout;
  const scheduled = [];

  globalThis.document = {
    head: null,
    documentElement,
    createElement: tagName => new FakeElement(tagName),
    getElementById: id => findById(documentElement, id)
  };
  globalThis.__getStorageData = async () => ({ showBlurMessage: true });
  globalThis.setTimeout = (fn, delay) => { scheduled.push({ fn, delay }); return scheduled.length; };

  try {
    const { showImmediateBlur, removeImmediateBlur } = await importImmediateBlur();

    const overlay = await showImmediateBlur();

    // Filtering finishing right away must not yank the message off screen.
    removeImmediateBlur();
    assert.ok(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      'a non-forced removal right after showing must leave the message up'
    );
    const deferred = scheduled.find(({ delay }) => delay > 0 && delay <= 10000 && delay !== 10000);
    assert.ok(deferred, 'the removal should be rescheduled for the remaining display time');

    // Once the minimum display time has passed, the deferred removal runs.
    overlay.__mindfulMessageShownAt = Date.now() - 60000;
    deferred.fn();
    assert.equal(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      null,
      'the overlay should be removed after the minimum display time'
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.__getStorageData = originalGetStorageData;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('forced removal and message-off removal stay immediate', async () => {
  const documentElement = new FakeElement('html');
  const originalDocument = globalThis.document;
  const originalGetStorageData = globalThis.__getStorageData;
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.document = {
    head: null,
    documentElement,
    createElement: tagName => new FakeElement(tagName),
    getElementById: id => findById(documentElement, id)
  };
  globalThis.setTimeout = () => 1;

  try {
    globalThis.__getStorageData = async () => ({ showBlurMessage: true });
    let { showImmediateBlur, removeImmediateBlur } = await importImmediateBlur();
    await showImmediateBlur();
    removeImmediateBlur(true);
    assert.equal(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      null,
      'a forced removal must not wait for the minimum display time'
    );

    globalThis.__getStorageData = async () => ({ showBlurMessage: false });
    ({ showImmediateBlur, removeImmediateBlur } = await importImmediateBlur());
    await showImmediateBlur();
    removeImmediateBlur();
    assert.equal(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      null,
      'with the message disabled there is nothing to hold on screen'
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.__getStorageData = originalGetStorageData;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('settled removal waits for the page to stop mutating', async () => {
  const documentElement = new FakeElement('html');
  const originalDocument = globalThis.document;
  const originalGetStorageData = globalThis.__getStorageData;
  const originalSetTimeout = globalThis.setTimeout;
  const originalDateNow = Date.now;
  const scheduled = [];
  let fakeNow = 100000;

  globalThis.document = {
    head: null,
    documentElement,
    createElement: tagName => new FakeElement(tagName),
    getElementById: id => findById(documentElement, id)
  };
  globalThis.__getStorageData = async () => ({ showBlurMessage: true });
  globalThis.setTimeout = (fn, delay) => { scheduled.push({ fn, delay }); return scheduled.length; };
  Date.now = () => fakeNow;

  try {
    const {
      showImmediateBlur, removeImmediateBlurWhenSettled, markPageActivity
    } = await importImmediateBlur();

    await showImmediateBlur();

    // The page is still churning: content keeps mutating.
    markPageActivity();
    removeImmediateBlurWhenSettled();
    assert.ok(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      'the overlay must stay up while the page is still mutating'
    );

    // Fresh mutations keep arriving: each poll must keep holding.
    fakeNow += 500;
    markPageActivity();
    scheduled.pop().fn();
    assert.ok(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      'ongoing mutations must keep the overlay up'
    );

    // The page goes quiet (and the minimum display time has long passed).
    fakeNow += 3000;
    scheduled.pop().fn();
    assert.equal(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      null,
      'a quiet page should finally release the overlay'
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.__getStorageData = originalGetStorageData;
    globalThis.setTimeout = originalSetTimeout;
    Date.now = originalDateNow;
  }
});

test('settled removal gives up holding after its maximum wait', async () => {
  const documentElement = new FakeElement('html');
  const originalDocument = globalThis.document;
  const originalGetStorageData = globalThis.__getStorageData;
  const originalSetTimeout = globalThis.setTimeout;
  const originalDateNow = Date.now;
  const scheduled = [];
  let fakeNow = 100000;

  globalThis.document = {
    head: null,
    documentElement,
    createElement: tagName => new FakeElement(tagName),
    getElementById: id => findById(documentElement, id)
  };
  globalThis.__getStorageData = async () => ({ showBlurMessage: true });
  globalThis.setTimeout = (fn, delay) => { scheduled.push({ fn, delay }); return scheduled.length; };
  Date.now = () => fakeNow;

  try {
    const {
      showImmediateBlur, removeImmediateBlurWhenSettled, markPageActivity
    } = await importImmediateBlur();

    await showImmediateBlur();
    markPageActivity();
    removeImmediateBlurWhenSettled();

    // A perpetually-mutating page (ticker, video player) must not hold the
    // overlay forever: after the max settle wait it comes down anyway.
    for (let elapsed = 0; elapsed <= 7000; elapsed += 500) {
      fakeNow += 500;
      markPageActivity();
      const next = scheduled.pop();
      if (!next) break;
      next.fn();
    }
    assert.equal(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      null,
      'the overlay must come down after the maximum settle wait'
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.__getStorageData = originalGetStorageData;
    globalThis.setTimeout = originalSetTimeout;
    Date.now = originalDateNow;
  }
});

test('shows the mindful-pause overlay when injected before document.head exists', async () => {
  const documentElement = new FakeElement('html');
  const originalDocument = globalThis.document;
  const originalGetStorageData = globalThis.__getStorageData;
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.document = {
    head: null,
    documentElement,
    createElement: tagName => new FakeElement(tagName),
    getElementById: id => findById(documentElement, id)
  };
  globalThis.__getStorageData = async () => ({ showBlurMessage: true });
  globalThis.setTimeout = () => 1;

  try {
    const { showImmediateBlur } = await importImmediateBlur();

    await assert.doesNotReject(() => showImmediateBlur());

    const overlay = findById(documentElement, 'calm-chaos-mindful-pause');
    assert.ok(overlay, 'the blur overlay should be attached to the page');
    assert.ok(
      overlay.children.some(container =>
        container.children.some(child =>
          child.textContent === 'Taking a mindful pause to filter content...'
        )
      ),
      'the mindful-pause message should be visible in the overlay'
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.__getStorageData = originalGetStorageData;
    globalThis.setTimeout = originalSetTimeout;
  }
});
