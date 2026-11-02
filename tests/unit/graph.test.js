import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument } from '../../extension/core.js';
import { buildGraphModel, layoutGraph, initiallyCollapsed, fullValue, previewValue, isContainer, CARD_VISIBLE_ROWS, CARD_HEADER, CARD_ROW, CARD_FOOTER, CARD_WIDTH, COLUMN_GAP } from '../../extension/graph-model.js';

test('graph contains every container, property, array item and leaf exactly once', () => {
  const doc = parseDocument('{"status":"ok","data":{"users":[{"id":1,"email":"a@b.com"},{"id":2}],"total":2}}');
  const model = buildGraphModel(doc), layout = layoutGraph(model);
  assert.equal(model.cards.length, 5);
  assert.equal(layout.edges.length, 4);
  assert.equal(model.owners.size, doc.nodes.length);
  assert.ok(doc.nodes.every(n => model.owners.has(n.id)));
  assert.equal(model.cards.find(c => c.node.path === 'data.users[1]').label, 'users[1]');
  for (const edge of layout.edges) {
    const source = model.byId.get(edge.source), target = model.byId.get(edge.target);
    assert.equal(target.parent, source);
    assert.equal(source.rows[target.parentRow], target.node);
  }
});
test('layout boxes never overlap and connections use valid container parents', () => {
  const model = buildGraphModel(parseDocument('{"a":[{}, {"deep":{"items":[[],{}]}}],"b":{"x":1},"c":[]}'));
  const layout = layoutGraph(model);
  for (let i = 0; i < layout.cards.length; i++) for (let j = i + 1; j < layout.cards.length; j++) {
    const a = layout.cards[i], b = layout.cards[j];
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  }
  assert.ok(layout.edges.every(e => e.x1 < e.x2 && Number.isFinite(e.y1) && Number.isFinite(e.y2)));
});
test('graph collapse hides descendants without losing the complete model', () => {
  const model = buildGraphModel(parseDocument('{"a":{"b":[{},{}]},"other":[]}'));
  const all = layoutGraph(model);
  assert.equal(layoutGraph(model, new Set([model.root.id])).cards.length, 1);
  assert.equal(model.cards.length, all.cards.length);
  const id = model.cards.find(c => c.node.path === 'a').id;
  const collapsed = layoutGraph(model, new Set([id]));
  assert.equal(collapsed.cards.length, 3);
  assert.ok(collapsed.cards.some(p => p.card.node.path === 'other'));
  assert.equal(layoutGraph(model).cards.length, all.cards.length);
});
test('primitive roots, empty documents, nested empty containers and precision remain representable', () => {
  for (const raw of ['null', '"text"', '9007199254740993123456789', '[]', '{}']) {
    const model = buildGraphModel(parseDocument(raw));
    assert.equal(model.cards.length, 1);
    assert.ok(layoutGraph(model).width > 0);
    if (!isContainer(model.root.node)) assert.equal(fullValue(model.root.node), raw === '"text"' ? 'text' : raw);
  }
  assert.equal(buildGraphModel(parseDocument('')).cards.length, 0);
  assert.equal(layoutGraph(buildGraphModel(null)).height, 0);
});
test('previews shorten long values while tooltips retain decoded, complete text', () => {
  const complete = 'A long description. '.repeat(100) + '\nSecond line 🧩';
  const node = parseDocument(JSON.stringify(complete)).root;
  assert.equal(fullValue(node), complete);
  assert.equal(previewValue(node).length, 80);
  assert.ok(previewValue(node).endsWith('…'));
});
test('large graphs retain all 12000 objects and all array indexes', () => {
  const doc = parseDocument(JSON.stringify(Array.from({ length: 12000 }, (_, id) => ({ id, name: `user-${id}` }))));
  const model = buildGraphModel(doc), layout = layoutGraph(model);
  assert.equal(model.cards.length, 12001);
  assert.equal(layout.edges.length, 12000);
  assert.equal(model.cards.at(-1).label, '[11999]');
  assert.equal(model.owners.size, doc.nodes.length);
  assert.ok(Number.isFinite(layout.height));
});
test('flat arrays keep every scalar in one card while exposing the row count for overview rendering', () => {
  const doc = parseDocument(JSON.stringify(Array.from({ length: 12000 }, (_, i) => i)));
  const model = buildGraphModel(doc);
  assert.equal(model.cards.length, 1);
  assert.equal(model.maxRows, 12000);
  assert.equal(model.root.rows.at(-1).token.raw, '11999');
  assert.equal(model.owners.get(doc.nodes.at(-1).id), model.root.id);
});
test('default graph is closed and opening a node reveals only its immediate children', () => {
  const model = buildGraphModel(parseDocument('{"a":{"b":{"c":1}},"other":[{}]}'));
  const closed = initiallyCollapsed(model);
  assert.equal(layoutGraph(model, closed).cards.length, 1);
  closed.delete(model.root.id);
  assert.equal(layoutGraph(model, closed).cards.length, 3);
  assert.ok(closed.has(model.cards.find(c => c.node.path === 'a').id));
  closed.delete(model.cards.find(c => c.node.path === 'a').id);
  assert.equal(layoutGraph(model, closed).cards.length, 4);
});
test('siblings share one compact column and attribute-list heights stay bounded', () => {
  const model = buildGraphModel(parseDocument(JSON.stringify(Array.from({ length: 100 }, (_, id) => ({ id })))));
  const layout = layoutGraph(model);
  assert.equal(layout.cards.length, 101);
  assert.equal(layout.width, 2 * CARD_WIDTH + COLUMN_GAP);
  assert.equal(new Set(layout.cards.filter(p => p.card.parent).map(p => p.x)).size, 1);
  assert.ok(layout.cards.every(p => p.height <= CARD_HEADER + CARD_VISIBLE_ROWS * CARD_ROW + CARD_FOOTER));
  const sorted = layout.cards.filter(p => p.card.parent).sort((a, b) => a.x - b.x || a.y - b.y);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].x === sorted[i - 1].x) assert.ok(sorted[i].y >= sorted[i - 1].y + sorted[i - 1].height);
});
test('all nodes at a depth align across different parents and uneven branches', () => {
  const model = buildGraphModel(parseDocument('{"a":[{"x":{"n":1}},{"y":[]}],"b":{"c":{"d":{}},"short":[]},"empty":[]}'));
  for (const collapsed of [new Set(), new Set([model.cards.find(c => c.node.path === 'b.c').id])]) {
    const layout = layoutGraph(model, collapsed);
    const columns = new Map();
    for (const p of layout.cards) {
      assert.equal(p.x, p.card.node.depth * (CARD_WIDTH + COLUMN_GAP));
      if (!columns.has(p.card.node.depth)) columns.set(p.card.node.depth, []);
      columns.get(p.card.node.depth).push(p);
    }
    for (const column of columns.values()) {
      column.sort((a, b) => a.y - b.y);
      for (let i = 1; i < column.length; i++) assert.ok(column[i].y >= column[i - 1].y + column[i - 1].height);
    }
  }
});
test('manual movement keeps node identity and updates connectors and negative bounds', () => {
  const model = buildGraphModel(parseDocument('{"a":{"leaf":1}}'));
  const child = model.cards[1];
  const layout = layoutGraph(model, new Set(), { positions: new Map([[child.id, { x: -400, y: -200 }]]) });
  assert.equal(layout.positions.get(child.id).x, -400);
  assert.equal(layout.positions.get(child.id).y, -200);
  assert.equal(layout.edges[0].x2, -400);
  assert.equal(layout.edges[0].routeY, null);
  assert.equal(layout.left, -400); assert.equal(layout.top, -200);
  assert.equal(child.node.path, 'a');
});
