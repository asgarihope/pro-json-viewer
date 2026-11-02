const { browserPath, extensionRoot } = require('./helpers.cjs');
const { chromium } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

(async () => {
  const root = extensionRoot;
  const context = await chromium.launchPersistentContext(path.resolve('.test-output/selection-profile'), {
    executablePath: browserPath, headless: true,
    viewport: { width: 1440, height: 960 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  const checks = [], errors = [];
  context.on('page', p => p.on('pageerror', error => errors.push(error.message)));
  const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log('PASS', name); };
  const selected = p => p.evaluate(() => getSelection().toString());
  const settled = p => p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const dragText = async (p, locator, start, end) => {
    await locator.scrollIntoViewIfNeeded();
    await settled(p);
    const points = await locator.evaluate((el, offsets) => {
      const text = el.firstChild;
      return offsets.map(offset => {
        const range = document.createRange();
        range.setStart(text, offset); range.collapse(true);
        const r = range.getBoundingClientRect();
        return { x: r.left + 0.1, y: r.top + r.height / 2 };
      });
    }, [start, end]);
    await p.mouse.move(points[0].x, points[0].y);
    await p.mouse.down();
    await p.mouse.move(points[1].x, points[1].y, { steps: 12 });
    await p.mouse.up();
    await settled(p);
  };
  try {
    const settings = await context.newPage(); await settings.goto('chrome://extensions');
    const id = await settings.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({}, list => resolve(list.find(e => e.name.startsWith('JSON Viewer')).id))));
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    for (const surface of ['viewer', 'popup']) {
      const page = await context.newPage();
      await page.setViewportSize(surface === 'viewer' ? { width: 1440, height: 960 } : { width: 460, height: 580 });
      await page.goto(`chrome-extension://${id}/${surface}.html`);
      await page.waitForSelector('html[data-ready="true"]', { state: 'attached' });
      if (await page.locator('#clear-document').isEnabled()) await page.locator('#clear-document').click();
      await page.locator('#example').click();
      const key = page.locator('[data-key-node]').filter({ hasText: '"email"' }).first();
      await key.dblclick();
      await settled(page);
      check(`${surface}: double-click selects a key and keeps it selected`, await selected(page) === 'email');
      const value = page.locator('.token-string').filter({ hasText: '"alex@example.com"' }).first();
      await dragText(page, value, 1, 17);
      check(`${surface}: dragging selects the exact JSON value after mouse release`, await selected(page) === 'alex@example.com');
      await page.keyboard.press('Control+c');
      check(`${surface}: native Ctrl+C copies the selected value`, await page.evaluate(() => navigator.clipboard.readText()) === 'alex@example.com');
      await page.locator('#tree').evaluate(el => { el.scrollTop += 28; }); await settled(page);
      check(`${surface}: scrolling preserves the selected value`, await selected(page) === 'alex@example.com');
      await page.setViewportSize(surface === 'viewer' ? { width: 1280, height: 900 } : { width: 460, height: 570 }); await settled(page);
      check(`${surface}: resize-driven rendering preserves selection`, await selected(page) === 'alex@example.com');
      await key.click({ button: 'right' });
      await page.locator('#attribute-menu').waitFor({ state: 'visible' });
      check(`${surface}: right-click attribute paths still work`, await page.locator('#attribute-path').inputValue() === 'data.users[0].email');
      await page.keyboard.press('Escape');
      await page.locator('#search').fill('email');
      await page.waitForFunction(() => document.getElementById('match-count').textContent === '1 of 2');
      await key.dblclick(); await settled(page);
      check(`${surface}: search-highlighted keys remain selectable`, await selected(page) === 'email');
      await page.locator('#clear-search').click();
      await page.locator('#raw-tab').click();
      const large = JSON.stringify(Array.from({ length: 1200 }, (_, index) => ({ label: `entry-${index}` })));
      await page.locator('#editor').fill(large);
      await page.locator('#beautify').click();
      const token = page.locator('.token-string').filter({ hasText: '"entry-0"' }).first();
      await dragText(page, token, 1, 8);
      check(`${surface}: large virtualized tree allows value selection`, await selected(page) === 'entry-0');
      await page.locator('#tree').evaluate(el => { el.scrollTop = 8000; }); await settled(page);
      check(`${surface}: selected text survives scrolling beyond its original render window`, await selected(page) === 'entry-0');
      check(`${surface}: virtualized tree stays compact while retaining an offscreen selection`, await page.locator('.tree-row').count() < 90);
      await page.keyboard.press('Control+c');
      check(`${surface}: offscreen selection still copies correctly`, await page.evaluate(() => navigator.clipboard.readText()) === 'entry-0');
      await page.evaluate(() => { getSelection().removeAllRanges(); document.getElementById('tree').scrollTop = 0; }); await settled(page);
      const across = await page.locator('#tree-content').evaluate(el => ['"entry-0"', '"entry-1"'].map((raw, index) => {
        const token = Array.from(el.querySelectorAll('.token-string')).find(span => span.textContent === raw);
        const range = document.createRange(); range.setStart(token.firstChild, index === 0 ? 1 : 8); range.collapse(true);
        const r = range.getBoundingClientRect(); return { x: r.left + .1, y: r.top + r.height / 2 };
      }));
      await page.mouse.move(across[0].x, across[0].y); await page.mouse.down();
      await page.mouse.move(across[1].x, across[1].y, { steps: 15 }); await page.mouse.up(); await settled(page);
      const multiple = await selected(page);
      check(`${surface}: dragging across rows keeps both values selected`, multiple.includes('entry-0') && multiple.includes('entry-1'));
      await page.locator('#tree').evaluate(el => { el.scrollTop += 100; }); await settled(page);
      check(`${surface}: multi-row selection survives scroll rendering`, await selected(page) === multiple);
      await page.close();
    }
    check('No JavaScript errors during native selection tests', errors.length === 0);
    await fs.writeFile(path.resolve('.test-output/selection-test-report.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(`${checks.length} selection checks passed.`);
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
