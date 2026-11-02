const { browserPath, extensionRoot } = require('./helpers.cjs');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');

(async () => {
  const root = extensionRoot;
  const context = await chromium.launchPersistentContext(path.resolve('.test-output/qa-profile'), {
    executablePath: browserPath,
    headless: true,
    viewport: { width: 1440, height: 960 },
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    acceptDownloads: true,
  });
  const errors = [];
  const requests = [];
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
  });
  const checks = [];
  const check = (name, value = true) => { assert.ok(value, name); checks.push(name); console.log('PASS', name); };
  try {
    const settings = await context.newPage();
    await settings.goto('chrome://extensions');
    const extensions = await settings.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true }, resolve)));
    const extension = extensions.find(e => e.name.startsWith('JSON Viewer'));
    check('Manifest V3 extension loads enabled without warnings', extension?.state === 'ENABLED' && !extension.manifestErrors.length && !extension.installWarnings.length);
    const base = `chrome-extension://${extension.id}/`;
    const viewer = await context.newPage();
    const ready = async p => { await p.waitForSelector('html[data-ready="true"]', { state: 'attached' }); };
    const text = (p, id) => p.locator('#' + id).textContent();
    const value = (p, id) => p.locator('#' + id).inputValue();
    const waitText = (p, id, expected) => p.waitForFunction(({ id, expected }) => document.getElementById(id).textContent === expected, { id, expected });
    const setSource = async (p, source) => {
      await p.locator('#raw-tab').click();
      await p.evaluate(source => {
        document.getElementById('editor').value = source;
        document.getElementById('editor').dispatchEvent(new Event('input', { bubbles: true }));
      }, source);
      await p.waitForTimeout(220);
    };
    await viewer.goto(base + 'viewer.html');
    await ready(viewer);
    // Reset the isolated test profile to a known state on repeat runs.
    if (await viewer.locator('#clear-document').isEnabled()) await viewer.locator('#clear-document').click();
    check('Empty state is usable and contains no fake sample data', await viewer.locator('#empty-state').isVisible() && await value(viewer, 'editor') === '');
    await viewer.locator('#raw-tab').click();
    await viewer.locator('#editor').fill(' ');
    await viewer.waitForTimeout(220);
    check('Raw / Edit opens an empty editor for typing JSON from scratch', await viewer.locator('#empty-state').isHidden() && await viewer.locator('#editor').isVisible());
    await viewer.locator('#clear-document').evaluate(el => { el.disabled = false; el.click(); });
    await viewer.locator('#example').click();
    check('Example opens as valid, collapsible syntax-highlighted JSON', await text(viewer, 'validity-text') === 'Valid JSON' && await viewer.locator('.token-key').count() > 0);
    check('Maximum depth includes leaves and counts root as zero', await text(viewer, 'max-depth') === '4' && await value(viewer, 'shown-depth') === '4');
    const beforeDepthChange = await value(viewer, 'editor');
    for (const level of [3, 2, 1, 0]) {
      await viewer.locator('#collapse-level').click();
      assert.equal(await value(viewer, 'shown-depth'), String(level));
      assert.equal(await viewer.locator('.tree-row').evaluateAll(rows => Math.max(...rows.map(row => Number(row.getAttribute('aria-level')) - 1))), level);
    }
    check('Collapse level hides one nesting level per click and stops at the root', await viewer.locator('#collapse-level').isDisabled() && await viewer.locator('.tree-row').count() === 1);
    for (const level of [1, 2, 3, 4]) {
      await viewer.locator('#expand-level').click();
      assert.equal(await value(viewer, 'shown-depth'), String(level));
    }
    check('Expand level reveals one nesting level per click and stops at maximum depth', await viewer.locator('#expand-level').isDisabled());
    await viewer.locator('#shown-depth').selectOption('2');
    check('Depth picker jumps directly to a chosen level without editing JSON', await value(viewer, 'shown-depth') === '2' && await value(viewer, 'editor') === beforeDepthChange);
    await viewer.locator('#search').fill('email');
    await waitText(viewer, 'match-count', '1 of 2');
    check('Searching a hidden item updates visible and selected depth', await value(viewer, 'shown-depth') === '4' && await text(viewer, 'node-depth') === 'Depth 4 / 4');
    await viewer.locator('#expand').click();
    check('Search highlights both email keys when both branches are expanded', await viewer.locator('#tree-content mark').count() === 2);
    await viewer.locator('#next').click();
    await waitText(viewer, 'match-count', '2 of 2');
    check('Next search match updates breadcrumb', (await text(viewer, 'breadcrumb')) === 'data.users[1].email');
    await viewer.locator('#previous').click();
    await waitText(viewer, 'match-count', '1 of 2');
    await viewer.screenshot({ path: path.resolve('.test-output/viewer-preview.png') });
    await viewer.locator('#scope').selectOption('values');
    await waitText(viewer, 'match-count', 'No matches');
    await viewer.locator('#scope').selectOption('all');
    await waitText(viewer, 'match-count', '1 of 2');
    await viewer.locator('#search').fill('EMAIL');
    await waitText(viewer, 'match-count', '1 of 2');
    await viewer.locator('#case-sensitive').click();
    await waitText(viewer, 'match-count', 'No matches');
    await viewer.locator('#case-sensitive').click();
    await viewer.locator('#search').fill('email');
    await waitText(viewer, 'match-count', '1 of 2');
    check('Search scope and case-sensitive controls work');
    await viewer.locator('#collapse').click();
    check('Collapse all reduces the tree to one row', await viewer.locator('.tree-row').count() === 1);
    await viewer.locator('#next').click();
    check('Search expands ancestors of a hidden match', await viewer.locator('#tree-content mark.current').count() === 1);
    await viewer.locator('#results-tab').click();
    await viewer.locator('#results-list [data-hit="0"]').click();
    check('Clicking a result reveals the exact path', await text(viewer, 'breadcrumb') === 'data.users[0].email');
    await viewer.locator('#graph-tab').click();
    await viewer.keyboard.press('Control+f');
    check('Ctrl+F focuses extension search', await viewer.locator('#search').evaluate(e => e === document.activeElement));
    await viewer.keyboard.press('Escape');
    check('Escape clears the search', await value(viewer, 'search') === '');
    await setSource(viewer, '{"a":}');
    await waitText(viewer, 'validity-text', 'Invalid JSON');
    check('Invalid JSON stays editable and Tree is disabled', await viewer.locator('#tree-tab').isDisabled() && await viewer.locator('#error-banner').isVisible());
    check('Invalid JSON clears depth indicators and disables depth controls', await text(viewer, 'max-depth') === '—' && await text(viewer, 'node-depth') === 'Depth —' && await viewer.locator('#expand-level').isDisabled());
    if (await viewer.locator('#go-error').isVisible()) await viewer.locator('#go-error').click();
    const precise = '{"id":9007199254740993123456789,"id":-0,"n":1.23000e+30,"v":"<script>alert(1)</script>"}';
    await setSource(viewer, precise);
    await viewer.locator('#beautify').click();
    const pretty = await value(viewer, 'editor');
    check('Beautify preserves large integers, negative zero, exponent notation, and duplicate keys', pretty.includes('9007199254740993123456789') && pretty.includes('1.23000e+30') && pretty.includes('"id": -0'));
    check('Untrusted markup is rendered as text', await viewer.locator('#tree-content script').count() === 0 && (await viewer.locator('#tree-content').textContent()).includes('<script>alert(1)</script>'));
    await viewer.locator('#minify').click();
    check('Minify preserves the exact original lexical data', await value(viewer, 'editor') === precise);
    await viewer.locator('#indent').selectOption('4');
    await viewer.locator('#beautify').click();
    check('Four-space indentation applies', (await value(viewer, 'editor')).includes('\n    "id"'));
    await viewer.locator('#indent').selectOption('2');
    await viewer.locator('#search').fill('id');
    // Repeated immediate navigation must not reset the active match.
    await viewer.locator('#search').press('Enter');
    await viewer.locator('#search').press('Enter');
    check('Search navigation works during debounce', await text(viewer, 'match-count') === '1 of 2');
    await viewer.locator('#clear-search').click();
    const fileSource = '{"fromFile":true,"email":"file@example.com"}';
    await viewer.locator('#file-input').setInputFiles({ name: 'upload.json', mimeType: 'application/json', buffer: Buffer.from('\ufeff' + fileSource) });
    await waitText(viewer, 'filename', 'upload.json');
    check('File import supports UTF-8 BOM and opens the tree', await value(viewer, 'editor') === fileSource && await viewer.locator('#tree').isVisible());
    const [download] = await Promise.all([viewer.waitForEvent('download'), viewer.locator('#download').click()]);
    const downloaded = path.resolve('.test-output/downloaded.json');
    await download.saveAs(downloaded);
    check('Download uses the filename and preserves the source', download.suggestedFilename() === 'upload.json' && await fs.readFile(downloaded, 'utf8') === fileSource);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await viewer.locator('#copy').click();
    const clipboard = await viewer.evaluate(() => navigator.clipboard.readText());
    check('Copy writes the current JSON to the clipboard', clipboard === fileSource);
    await viewer.locator('#clear-document').click();
    await viewer.evaluate(() => navigator.clipboard.writeText('{"pasted":true}'));
    await viewer.locator('#paste').click();
    await waitText(viewer, 'validity-text', 'Valid JSON');
    check('Paste JSON imports the clipboard', await value(viewer, 'editor') === '{"pasted":true}');
    await viewer.reload(); await ready(viewer);
    check('Draft survives a full page reload', await value(viewer, 'editor') === '{"pasted":true}');

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 460, height: 580 });
    await popup.goto(base + 'popup.html'); await ready(popup);
    check('Popup restores the latest full-viewer draft', await value(popup, 'editor') === '{"pasted":true}');
    check('Popup has no horizontal or page scroll', await popup.evaluate(() => document.documentElement.scrollWidth === 460 && document.documentElement.scrollHeight === 580));
    await setSource(popup, '{"status":"success","user":{"name":"Alex Morgan","email":"alex@example.com","active":true},"total":1}');
    await popup.locator('#beautify').click();
    await popup.locator('#search').fill('email'); await waitText(popup, 'match-count', '1 of 1');
    check('Popup beautifies and searches JSON', await popup.locator('mark.current').count() === 1);
    await popup.locator('#collapse-level').click();
    check('Popup supports collapsing one level and reports maximum depth', await value(popup, 'shown-depth') === '1' && await text(popup, 'max-depth') === '2');
    await popup.locator('#expand-level').click();
    check('Popup supports expanding one level', await value(popup, 'shown-depth') === '2' && await popup.locator('#expand-level').isDisabled());
    await popup.locator('#toast').waitFor({ state: 'hidden' });
    await popup.screenshot({ path: path.resolve('.test-output/popup-preview.png') });
    const [full] = await Promise.all([context.waitForEvent('page'), popup.locator('#open-full').click()]);
    await full.waitForURL(base + 'viewer.html'); await ready(full);
    check('Popup opens a real extension tab with source, query and mode preserved', (await value(full, 'editor')).includes('alex@example.com') && await value(full, 'search') === 'email' && await full.locator('#tree').isVisible());

    // Reopening a popup immediately after typing must not lose its final edit.
    const quick = await context.newPage();
    await quick.goto(base + 'popup.html'); await ready(quick);
    await quick.locator('#raw-tab').click();
    await quick.locator('#editor').fill('{"lastKeystroke":42}');
    await quick.close();
    const reopened = await context.newPage();
    await reopened.goto(base + 'popup.html'); await ready(reopened);
    check('Immediate popup closure retains the last typed edit', await value(reopened, 'editor') === '{"lastKeystroke":42}');

    await full.locator('#clear-search').click();
    const big = JSON.stringify(Array.from({ length: 12000 }, (_, i) => ({ id: i, name: `user-${i}` })));
    await setSource(full, big);
    await full.locator('#beautify').click();
    await full.locator('#search').fill('user-11999');
    await waitText(full, 'match-count', '1 of 1');
    check('Large document search reveals the last item', (await text(full, 'breadcrumb')) === '$[11999].name');
    check('Large document tree uses fewer than 70 DOM rows', await full.locator('.tree-row').count() < 70);
    await full.locator('#tree').focus();
    await full.keyboard.press('Home');
    await full.keyboard.press('ArrowRight');
    check('Tree keyboard navigation works', (await text(full, 'breadcrumb')) === '$[0]');

    const oversized = Buffer.from('"' + 'a'.repeat(5 * 1024 * 1024) + '"');
    await full.locator('#file-input').setInputFiles({ name: 'too-large.json', mimeType: 'application/json', buffer: oversized });
    check('Oversized file is rejected with feedback', (await text(full, 'toast')).includes('5 MiB'));
    await full.setViewportSize({ width: 720, height: 800 });
    check('Narrow full viewer remains usable', await full.evaluate(() => document.documentElement.scrollWidth === innerWidth) && await full.locator('#search').isVisible());
    await full.setViewportSize({ width: 1440, height: 960 });
    const attributes = JSON.stringify({ data: { users: [{ email: 'alex@example.com' }] }, 'a.b': { 'quote"key': { '': 'empty key', 'سلام': true } }, '<img onerror=alert(1)>': 7 });
    await setSource(full, attributes);
    await full.locator('#beautify').click();
    const attributeSource = await value(full, 'editor');
    const openPathMenu = async (p, rawKey) => {
      const id = await p.locator('[data-key-node]').evaluateAll((keys, raw) => keys.find(key => key.textContent === raw)?.dataset.keyNode, rawKey);
      assert.notEqual(id, undefined, `Key ${rawKey} must be visible`);
      const key = p.locator(`[data-key-node="${id}"]`);
      await key.click({ button: 'right' });
      await p.locator('#attribute-menu').waitFor({ state: 'visible' });
    };
    const copyMenuPath = async (p, expected) => {
      assert.equal(await value(p, 'attribute-path'), expected);
      await p.locator('#copy-attribute-path').click();
      await p.locator('#attribute-menu').waitFor({ state: 'hidden' });
      assert.equal(await p.evaluate(() => navigator.clipboard.readText()), expected);
    };
    await openPathMenu(full, '"email"');
    await copyMenuPath(full, 'data.users[0].email');
    check('Right-click on a key copies its nested attribute path with array indexes');
    await full.keyboard.press('Shift+F10');
    check('Keyboard context menu focuses Copy attribute path', await full.locator('#attribute-menu').isVisible() && await full.locator('#copy-attribute-path').evaluate(el => el === document.activeElement));
    await full.keyboard.press('Escape');
    check('Escape dismisses the context menu and restores tree focus', await full.locator('#attribute-menu').isHidden() && await full.locator('#tree').evaluate(el => el === document.activeElement));
    await openPathMenu(full, '""');
    await copyMenuPath(full, `$[${JSON.stringify('a.b')}][${JSON.stringify('quote"key')}][""]`);
    check('Copied paths escape dotted, quoted and empty property names');
    await openPathMenu(full, '"سلام"');
    await copyMenuPath(full, `$[${JSON.stringify('a.b')}][${JSON.stringify('quote"key')}][${JSON.stringify('سلام')}]`);
    check('Copied attribute paths preserve Unicode keys');
    await openPathMenu(full, '"<img onerror=alert(1)>"');
    check('Untrusted property names remain plain text in the path preview', await full.locator('#attribute-menu img').count() === 0 && await value(full, 'attribute-path') === '$["<img onerror=alert(1)>"]');
    await full.locator('#search').click();
    check('Clicking outside the context menu dismisses it', await full.locator('#attribute-menu').isHidden());
    await full.locator('#shown-depth').selectOption('1');
    await openPathMenu(full, '"data"');
    await copyMenuPath(full, 'data');
    check('Context menu copies paths of collapsed object keys');
    await full.locator('#expand').click();
    await full.locator('#search').fill('email'); await waitText(full, 'match-count', '1 of 1');
    await full.locator('[data-key-node] mark.current').click({ button: 'right' });
    check('Right-clicking a search-highlighted key opens its attribute menu', await value(full, 'attribute-path') === 'data.users[0].email' && await full.locator('#attribute-menu').isVisible());
    await full.screenshot({ path: path.resolve('.test-output/context-menu-preview.png') });
    await full.keyboard.press('Escape');
    check('Dismissing the menu preserves the current search', await value(full, 'search') === 'email');
    await openPathMenu(full, '"email"');
    await full.evaluate(() => {
      window.originalClipboardWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = () => Promise.reject(new DOMException('Blocked for fallback test', 'NotAllowedError'));
    });
    await full.locator('#copy-attribute-path').click();
    check('Blocked clipboard access selects the path for native copying', await full.locator('#attribute-path').evaluate(el => document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === el.value.length));
    await full.keyboard.press('Control+c');
    check('Native copy fallback copies the exact attribute path', await full.evaluate(() => navigator.clipboard.readText()) === 'data.users[0].email');
    await full.evaluate(() => { navigator.clipboard.writeText = window.originalClipboardWrite; delete window.originalClipboardWrite; });
    await full.keyboard.press('Escape');
    check('Path copying leaves the JSON document unchanged', await value(full, 'editor') === attributeSource);
    const pathPopup = await context.newPage();
    await pathPopup.setViewportSize({ width: 460, height: 580 });
    await pathPopup.goto(base + 'popup.html'); await ready(pathPopup);
    await openPathMenu(pathPopup, '"email"');
    await copyMenuPath(pathPopup, 'data.users[0].email');
    check('Right-click path copying also works in the compact popup');
    await pathPopup.locator('[data-key-node]').filter({ hasText: '"email"' }).evaluate(el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: innerWidth - 1, clientY: innerHeight - 1 })));
    check('Context menu stays within popup boundaries near viewport edges', await pathPopup.locator('#attribute-menu').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 8 && r.top >= 8 && r.right <= innerWidth - 8 && r.bottom <= innerHeight - 8; }));
    await pathPopup.keyboard.press('Escape');
    check('No external HTTP requests', requests.length === 0);
    check('No browser JavaScript errors', errors.length === 0);
    const finalInfo = await settings.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true }, resolve)));
    check('No extension runtime errors', finalInfo.find(e => e.id === extension.id).runtimeErrors.length === 0);
    const report = { browser: 'Microsoft Edge (Chromium), isolated unpacked extension', version: context.browser()?.version(), checks, errors, requests };
    await fs.writeFile(path.resolve('.test-output/browser-test-report.json'), JSON.stringify(report, null, 2));
    console.log(`\n${checks.length} browser checks passed.`);
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
