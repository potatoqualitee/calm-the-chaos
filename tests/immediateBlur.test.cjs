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

// The settle loop is the only thing that schedules sub-second callbacks: the
// overlay lifetime failsafe and the deferred message removal are seconds out.
function takeSettlePoll(scheduled) {
  const index = scheduled.findIndex(entry => entry.delay <= 1000);
  return index === -1 ? null : scheduled.splice(index, 1)[0];
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
  // No message, so nothing but the quiet window can hold the overlay.
  globalThis.__getStorageData = async () => ({ showBlurMessage: false });
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
    takeSettlePoll(scheduled).fn();
    assert.ok(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      'ongoing mutations must keep the overlay up'
    );

    // The page goes quiet. This must release the overlay on the quiet window,
    // well inside the maximum settle wait: a settle that only ever exits on
    // its cap is a fixed sleep wearing a quiet check as a disguise.
    fakeNow += 500;
    takeSettlePoll(scheduled).fn();
    assert.equal(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      null,
      'a quiet page should be released by the quiet window, not the cap'
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.__getStorageData = originalGetStorageData;
    globalThis.setTimeout = originalSetTimeout;
    Date.now = originalDateNow;
  }
});

test('settled removal gives up on a perpetually-mutating page within two seconds', async () => {
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
  // No message, so the settle wait alone decides when the overlay comes down.
  globalThis.__getStorageData = async () => ({ showBlurMessage: false });
  globalThis.setTimeout = (fn, delay) => { scheduled.push({ fn, delay }); return scheduled.length; };
  Date.now = () => fakeNow;

  try {
    const {
      showImmediateBlur, removeImmediateBlurWhenSettled, markPageActivity
    } = await importImmediateBlur();

    await showImmediateBlur();
    markPageActivity();
    removeImmediateBlurWhenSettled();

    // cnn.com never goes quiet: its video player and ad rotation mutate the DOM
    // continuously, so only the cap can end this wait. Every millisecond of it
    // is an opaque screen the user stares at after filtering already finished,
    // so the cap has to be short.
    let waited = 0;
    while (findById(documentElement, 'calm-chaos-mindful-pause') && waited < 4000) {
      const poll = takeSettlePoll(scheduled);
      if (!poll) break;
      fakeNow += poll.delay;
      waited += poll.delay;
      markPageActivity();
      poll.fn();
    }

    assert.equal(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      null,
      `the overlay must come down after the maximum settle wait (waited ${waited}ms)`
    );
    assert.ok(
      waited <= 2000,
      `a churning page must not hold the overlay for seconds; waited ${waited}ms`
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.__getStorageData = originalGetStorageData;
    globalThis.setTimeout = originalSetTimeout;
    Date.now = originalDateNow;
  }
});

test('the lifetime failsafe forces the overlay down within ten seconds', async () => {
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
    const { showImmediateBlur } = await importImmediateBlur();

    await showImmediateBlur();

    // Filtering never finishes here, so no settle wait ever runs and only the
    // lifetime failsafe can end this. A full-screen opaque overlay is the worst
    // thing the extension can do to a page: the ceiling has to stay tight.
    const failsafe = scheduled.find(entry => entry.delay <= 10000);
    assert.ok(
      failsafe,
      `nothing brings the overlay down inside 10s (scheduled: ${scheduled.map(entry => entry.delay).join(', ')})`
    );

    failsafe.fn();
    assert.equal(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      null,
      'the failsafe must force the overlay down even with the message still up'
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.__getStorageData = originalGetStorageData;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('a replacement overlay gets its own settle wait, not the previous one\'s remainder', async () => {
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
  globalThis.__getStorageData = async () => ({ showBlurMessage: false });
  globalThis.setTimeout = (fn, delay) => { scheduled.push({ fn, delay }); return scheduled.length; };
  Date.now = () => fakeNow;

  try {
    const {
      showImmediateBlur, removeImmediateBlurWhenSettled, markPageActivity
    } = await importImmediateBlur();

    await showImmediateBlur();
    markPageActivity();
    removeImmediateBlurWhenSettled();

    // Spend most of the first overlay's settle budget while the page churns.
    let burned = 0;
    while (burned < 1250) {
      const poll = takeSettlePoll(scheduled);
      assert.ok(poll, 'the first overlay should still be settling');
      fakeNow += poll.delay;
      burned += poll.delay;
      markPageActivity();
      poll.fn();
    }
    assert.ok(
      findById(documentElement, 'calm-chaos-mindful-pause'),
      'setup: the first overlay must still be up when the re-init happens'
    );

    // A re-init (extension reload, keyword update, tab wake-up) replaces the
    // overlay: content.js calls cleanup() then showImmediateBlur().
    await showImmediateBlur();
    markPageActivity();
    removeImmediateBlurWhenSettled();

    // The page is still mutating, so the replacement overlay should be held for
    // its own settle wait. A settle loop left over from the previous overlay
    // would release it almost immediately, on a budget already spent.
    let survived = 0;
    while (findById(documentElement, 'calm-chaos-mindful-pause') && survived < 4000) {
      const poll = takeSettlePoll(scheduled);
      if (!poll) break;
      fakeNow += poll.delay;
      survived += poll.delay;
      markPageActivity();
      poll.fn();
    }

    assert.ok(
      survived >= 1000,
      `the replacement overlay must be held for its own settle wait; it lasted ${survived}ms`
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
