const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const puppeteer = require('puppeteer-core');

const BROWSER_PATHS = [
  process.env.BRAVE_PATH,
  'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].filter(Boolean);

const executablePath = BROWSER_PATHS.find(candidate => fs.existsSync(candidate));

test('clicking the mindful-pause option text enables its checkbox', {
  skip: executablePath ? false : 'Chrome or Brave is required for this browser behavior test'
}, async () => {
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-first-run', '--disable-component-update']
  });

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (['script', 'stylesheet', 'image'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });
    const html = fs.readFileSync(path.resolve('options/options.html'), 'utf8');
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.$eval('#showBlurMessage', input => {
      input.checked = false;
    });

    await page.evaluate(() => {
      const optionText = [...document.querySelectorAll('.mode-text')]
        .find(element => element.textContent.includes('Taking a mindful pause'));
      optionText.click();
    });

    const checked = await page.$eval('#showBlurMessage', input => input.checked);
    assert.equal(checked, true);
  } finally {
    await browser.close();
  }
});
