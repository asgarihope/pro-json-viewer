import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from '../../extension/core.js';
import { buildGraphModel, layoutGraph, initiallyCollapsed } from '../../extension/graph-model.js';
import { easeMotion, mixLayout, mixView, anchoredView, guidedView } from '../../extension/graph-motion.js';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} should equal ${b}`);

test('motion easing is bounded, monotonic and settles exactly', () => {
  assert.equal(easeMotion(-1), 0); assert.equal(easeMotion(2), 1);
  for (let i = 1; i <= 100; i++) assert.ok(easeMotion(i / 100) >= easeMotion((i - 1) / 100));
  const view = mixView({ x: 0, y: 100, scale: .01 }, { x: 100, y: -100, scale: 1 }, .5);
  close(view.x, 50); close(view.y, 0); close(view.scale, .1);
});
test('anchoring keeps the clicked header fixed at every intermediate frame without changing zoom', () => {
  const model = buildGraphModel(parseDocument('{"a":{"b":{"n":1}},"c":[]}'));
  const beforeClosed = initiallyCollapsed(model), from = layoutGraph(model, beforeClosed);
  const afterClosed = new Set(beforeClosed); afterClosed.delete(model.root.id);
  const to = layoutGraph(model, afterClosed), view = { x: 137, y: 211, scale: 1.3 };
  const endView = anchoredView(from, to, view, model.root.id);
  for (const t of [0, .1, .3, .6, .9, 1]) {
    const progress = easeMotion(t), layout = mixLayout(from, to, progress, beforeClosed, afterClosed), camera = mixView(view, endView, progress);
    const p = layout.positions.get(model.root.id), old = from.positions.get(model.root.id);
    close(p.x * camera.scale + camera.x, old.x * view.scale + view.x);
    close(p.y * camera.scale + camera.y, old.y * view.scale + view.y);
    close(camera.scale, view.scale);
  }
});
test('new and outgoing cards and their connectors fade smoothly without losing identity', () => {
  const model = buildGraphModel(parseDocument('{"child":{"name":"Alex"}}'));
  const closed = initiallyCollapsed(model), from = layoutGraph(model, closed), open = new Set(closed); open.delete(model.root.id);
  const to = layoutGraph(model, open), middle = mixLayout(from, to, .5, closed, open);
  assert.equal(middle.cards.length, 2);
  close(middle.positions.get(model.cards[1].id).opacity, .5);
  close(middle.edges[0].opacity, .5);
  assert.equal(middle.positions.get(model.root.id).card, model.root);
  const closing = mixLayout(to, from, .5, open, closed);
  close(closing.positions.get(model.cards[1].id).opacity, .5);
  assert.equal(mixLayout(to, from, 1, open, closed), from);
});
test('attribute opacity and height are intermediate and can be retargeted mid-flight', () => {
  const model = buildGraphModel(parseDocument('{"a":1,"b":2,"c":3}'));
  const closed = initiallyCollapsed(model), from = layoutGraph(model, closed), to = layoutGraph(model);
  const middle = mixLayout(from, to, .4, closed, new Set());
  close(middle.positions.get(0).bodyOpacity, .4);
  assert.ok(middle.positions.get(0).height > Math.min(from.cards[0].height, to.cards[0].height));
  const reverseStart = mixLayout(middle, from, 0, new Set(), closed);
  close(reverseStart.positions.get(0).height, middle.positions.get(0).height);
  close(reverseStart.positions.get(0).bodyOpacity, .4);
});
test('guidance preserves zoom and leaves an already visible node in place', () => {
  const model = buildGraphModel(parseDocument('{"child":{}}')), layout = layoutGraph(model);
  const view = { x: 30, y: 70, scale: 1 };
  assert.deepEqual(guidedView(view, layout, model.root.id, 1500, 1000), view);
  const target = guidedView({ x: 500, y: 300, scale: 1 }, layout, model.cards[1].id, 650, 500);
  assert.equal(target.scale, 1);
  const p = layout.positions.get(model.cards[1].id);
  assert.ok((p.x + p.width) * target.scale + target.x <= 626);
});
test('empty motion layouts remain finite', () => {
  const empty = layoutGraph(buildGraphModel(null));
  const frame = mixLayout(empty, empty, .5);
  assert.equal(frame.cards.length, 0); assert.equal(frame.left, 0); assert.equal(frame.top, 0); assert.equal(frame.width, 0);
});
