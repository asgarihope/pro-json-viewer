import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, validTheme } from '../../extension/themes.js';
import { parseDocument } from '../../extension/core.js';
import { buildGraphModel, layoutGraph } from '../../extension/graph-model.js';
import { centeredView } from '../../extension/graph-motion.js';

test('theme presets have unique IDs and include both light and dark modes', () => {
  assert.equal(THEMES.length, 6);
  assert.equal(new Set(THEMES.map(t => t.id)).size, 6);
  assert.ok(THEMES.some(t => t.mode === 'dark'));
  assert.ok(THEMES.some(t => t.mode === 'light'));
  assert.ok(THEMES.every(t => /^#[0-9a-f]{6}$/i.test(t.swatch) && /^#[0-9a-f]{6}$/i.test(t.background)));
});
test('invalid or old saved theme values safely use the default palette', () => {
  for (const value of [null, undefined, '', 'bad-theme', '<script>']) assert.equal(validTheme(value), 'midnight');
  for (const theme of THEMES) assert.equal(validTheme(theme.id), theme.id);
});
test('opened cards are centered precisely without changing zoom or positions', () => {
  const model = buildGraphModel(parseDocument('{"a":{"x":1,"y":2}}'));
  const layout = layoutGraph(model);
  const id = model.cards[1].id, p = layout.positions.get(id);
  for (const scale of [.5, 1, 2.5]) {
    const result = centeredView({ x: -100, y: 200, scale }, layout, id, 1000, 700);
    assert.equal(result.scale, scale);
    assert.equal((p.x + p.width / 2) * scale + result.x, 500);
    assert.equal((p.y + p.height / 2) * scale + result.y, 350);
  }
  assert.deepEqual(centeredView({ x: 1, y: 2, scale: 1 }, layout, -1, 1000, 700), { x: 1, y: 2, scale: 1 });
});
