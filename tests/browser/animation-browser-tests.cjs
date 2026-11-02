const { browserPath, extensionRoot } = require('./helpers.cjs');
const { chromium } = require('playwright');
const path = require('node:path'), fs = require('node:fs/promises'), assert = require('node:assert/strict');
(async () => {
  const extension = extensionRoot;
  const context = await chromium.launchPersistentContext(path.resolve('.test-output/animation-qa-profile'), {
    executablePath: browserPath, headless: true,
    viewport: { width: 1440, height: 960 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const checks = [], errors = [];
  context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  const check = (name, condition = true) => { assert.ok(condition, name); checks.push(name); console.log('PASS', name); };
  const settle = async page => { await page.waitForFunction(() => document.getElementById('graph-viewport').dataset.animating !== 'true'); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
  const frames = async (page, count = 1) => page.evaluate(count => new Promise(resolve => { const next = () => --count <= 0 ? resolve() : requestAnimationFrame(next); requestAnimationFrame(next); }), count);
  try {
    const setup = await context.newPage(); await setup.goto('chrome://extensions');
    const id = await setup.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({}, xs => resolve(xs.find(x => x.name.startsWith('JSON Viewer')).id))));
    const page = await context.newPage(); await page.goto(`chrome-extension://${id}/viewer.html`);
    await page.waitForSelector('html[data-ready="true"]', { state: 'attached' });
    if (await page.locator('#clear-document').isEnabled()) await page.locator('#clear-document').click();
    await page.locator('#example').click(); await settle(page);
    const source = await page.locator('#editor').inputValue();
    const root = page.getByRole('article', { name: 'root, object, $', exact: true });
    const before = await root.boundingBox(), zoom = await page.locator('#graph-zoom-label').textContent();
    const openSamples = await root.locator('.graph-collapse').evaluate(button => new Promise(resolve => {
      const samples = [], root = button.closest('.graph-card');
      button.click();
      const start = performance.now();
      const sample = () => {
        const r = root.getBoundingClientRect(), body = root.querySelector('.graph-card-body');
        const incoming = document.querySelector('.graph-card[data-depth="1"]');
        samples.push({ x: r.x, y: r.y, height: r.height, opacity: Number(body.style.opacity), incoming: incoming ? Number(incoming.style.opacity) : null, motion: document.getElementById('graph-viewport').dataset.animating });
        if (performance.now() - start < 190) requestAnimationFrame(sample); else resolve(samples);
      };
      requestAnimationFrame(sample);
    }));
    check('Opening uses a real multi-frame attribute and height animation', openSamples.length > 3 && openSamples.some(s => s.opacity > .05 && s.opacity < .95) && new Set(openSamples.map(s => Math.round(s.height * 10))).size > 3);
    check('Clicked node header stays anchored while the structure opens', openSamples.every(s => Math.abs(s.x - before.x) < 1 && Math.abs(s.y - before.y) < 1));
    check('New child cards fade in instead of popping into view', openSamples.some(s => s.incoming > 0 && s.incoming < 1));
    await settle(page);
    check('Expansion preserves the user zoom level', await page.locator('#graph-zoom-label').textContent() === zoom);
    const data = page.getByRole('article', { name: 'data, object, data', exact: true });
    await data.locator('.graph-collapse').click(); await settle(page);
    const users = page.getByRole('article', { name: 'users, array, data.users', exact: true });
    const vr = await page.locator('#graph-viewport').boundingBox(), ur = await users.boundingBox();
    check('Camera gently guides to the newly revealed node when needed', ur.x >= vr.x + 15 && ur.x + ur.width <= vr.x + vr.width - 15 && await page.locator('#graph-zoom-label').textContent() === zoom);
    const closeSamples = await data.locator('.graph-collapse').evaluate(button => new Promise(resolve => {
      const values = []; button.click(); const start = performance.now();
      const sample = () => { const child = document.querySelector('.graph-card[data-depth="2"]'); if (child) values.push(Number(child.style.opacity)); if (performance.now() - start < 180) requestAnimationFrame(sample); else resolve(values); }; requestAnimationFrame(sample);
    }));
    check('Closing fades departing nodes before removing them', closeSamples.some(value => value > 0 && value < 1));
    await settle(page);
    check('Closing does not automatically zoom out', await page.locator('#graph-zoom-label').textContent() === zoom);
    await page.locator('#graph-collapse-all').click(); await settle(page);
    await root.locator('.graph-collapse').evaluate(button => { button.click(); setTimeout(() => button.click(), 80); });
    await page.waitForTimeout(100); await settle(page);
    check('Rapid open/close retargets to the final intent without ghost nodes', await page.locator('.graph-card').count() === 1 && await root.locator('.graph-collapse').getAttribute('aria-expanded') === 'false');
    await root.locator('.graph-collapse').click(); await frames(page, 3);
    const moving = await root.locator('.graph-card-title').boundingBox(), rootStart = await root.boundingBox();
    await page.mouse.move(moving.x + 12, moving.y + moving.height / 2); await page.mouse.down();
    await page.mouse.move(moving.x + 92, moving.y + moving.height / 2 + 35, { steps: 6 }); await page.mouse.up(); await settle(page);
    const rootEnd = await root.boundingBox();
    check('Dragging a card during expansion takes control without losing the pointer anchor', Math.abs(rootEnd.x - rootStart.x - 80) < 3 && Math.abs(rootEnd.y - rootStart.y - 35) < 3 && await root.locator('.graph-collapse').getAttribute('aria-expanded') === 'true');
    await page.locator('#graph-show-all').click(); await settle(page);
    const email = page.locator('.graph-key').filter({ hasText: /^email$/ }).first();
    await email.dblclick({ position: { x: 10, y: 8 } });
    check('Native text selection works after animation', await page.evaluate(() => getSelection().toString()) === 'email');
    const user1 = page.getByRole('article', { name: 'users[1], object, data.users[1]', exact: true });
    await user1.locator('.graph-collapse').evaluate(el => el.click()); await frames(page, 5);
    check('Existing graph text selection survives another node animating', await page.evaluate(() => getSelection().toString()) === 'email');
    await settle(page);
    check('Selection remains intact when the animation settles', await page.evaluate(() => getSelection().toString()) === 'email');
    await page.locator('#graph-collapse-all').click(); await settle(page);
    await root.locator('.graph-collapse').click(); await settle(page);
    await data.locator('.graph-collapse').click();
    await page.waitForTimeout(310);
    const rect = await page.locator('#graph-viewport').boundingBox();
    await page.mouse.move(rect.x + 15, rect.y + 65); await page.mouse.down();
    await page.mouse.move(rect.x + 95, rect.y + 100, { steps: 8 }); await page.mouse.up();
    const manualView = await page.locator('#graph-layer').getAttribute('style');
    await page.waitForTimeout(450); await settle(page);
    check('Manual panning interrupts automatic camera guidance immediately', await page.locator('#graph-layer').getAttribute('style') === manualView);
    check('Animation and navigation leave the JSON unchanged', await page.locator('#editor').inputValue() === source);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#graph-collapse-all').click(); await frames(page, 2);
    await root.locator('.graph-collapse').click(); await frames(page, 2);
    check('Reduced-motion preference removes animated transitions', await page.locator('#graph-viewport').getAttribute('data-animating') === 'false' && await page.locator('.graph-card').count() === 2);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await data.locator('.graph-collapse').click();
    await page.locator('#raw-tab').click(); await page.locator('#editor').fill('{"invalid":}');
    await page.waitForFunction(() => document.getElementById('validity-text').textContent === 'Invalid JSON'); await settle(page);
    check('New invalid input cancels stale animations and clears old nodes', await page.locator('.graph-card').count() === 0 && await page.locator('#graph-viewport').getAttribute('data-animating') === 'false');
    check('No JavaScript errors during animations', errors.length === 0);
    await fs.writeFile(path.resolve('.test-output/animation-test-report.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(`${checks.length} animation browser checks passed.`);
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
