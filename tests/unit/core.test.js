import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDocument, formatDocument, findMatches, visibleRows, expansionAtDepth, describeError, MAX_DEPTH, MAX_BYTES } from '../../extension/core.js';

test('formats every JSON root type and nested empty containers', () => {
  for (const source of ['null', 'false', '3.1400', '"hello"', '[]', '{}', '[{},[],{"nested": [1,true,null]}]']) {
    const doc = parseDocument(source);
    for (const indent of [2, 4, 'tab']) {
      const pretty = formatDocument(doc, indent);
      assert.deepEqual(JSON.parse(pretty), JSON.parse(source));
      assert.equal(formatDocument(parseDocument(pretty), indent), pretty);
    }
    assert.deepEqual(JSON.parse(formatDocument(doc, 2, true)), JSON.parse(source));
  }
});

test('preserves duplicate keys, precise numeric lexemes, exponents and negative zero', () => {
  const source = '{"id":9007199254740993123456789,"id":-0,"n":1.23000e+30,"overflow":1e400,"s":"a \\"b\\""}';
  const validSource = source.replace('a \\"b\\"', 'a b');
  const doc = parseDocument(validSource);
  assert.equal(formatDocument(doc, 2, true), validSource);
  const pretty = formatDocument(doc);
  assert.ok(pretty.includes('9007199254740993123456789'));
  assert.ok(pretty.includes('1.23000e+30'));
  assert.ok(pretty.includes('1e400'));
  assert.ok(pretty.includes('"id": -0'));
  assert.equal(doc.root.children.filter(n => n.keyToken.raw === '"id"').length, 2);
});

test('keeps escaped strings, whitespace within strings and Unicode unchanged', () => {
  const source = '{"s":"a  b\\n\\t\\\"\\\\\\u0041","emoji":"🧩","سلام":"دنیا"}';
  assert.equal(formatDocument(parseDocument(source), 2, true), source);
  assert.deepEqual(JSON.parse(formatDocument(parseDocument(source))), JSON.parse(source));
});

test('search scopes, case matching, occurrences, paths and offsets are accurate', () => {
  const source = '{"Email":"email EMAIL","users":[{"email":"alex@example.com"}]}';
  const doc = parseDocument(source);
  assert.equal(findMatches(doc, 'email').hits.length, 4);
  assert.equal(findMatches(doc, 'email', 'keys').hits.length, 2);
  assert.equal(findMatches(doc, 'email', 'values').hits.length, 2);
  assert.equal(findMatches(doc, 'email', 'all', true).hits.length, 2);
  for (const hit of findMatches(doc, 'email').hits) assert.equal(source.slice(hit.start, hit.end).toLowerCase(), 'email');
  assert.equal(doc.nodes.find(n => n.token.raw === '"alex@example.com"').path, 'users[0].email');
  assert.equal(findMatches(doc, '.com').hits.length, 1);
  assert.equal(findMatches(doc, '[').hits.length, 0);
  assert.deepEqual(findMatches(doc, '').hits, []);
  assert.equal(findMatches(doc, 'email', 'all', false, 2).truncated, true);
});

test('special keys, __proto__, duplicate keys and untrusted markup are data', () => {
  const source = '{"__proto__":{"polluted":true},"a.b":{"<script>":"<img onerror=alert(1)>"},"x":"x","x":42}';
  const doc = parseDocument(source);
  assert.equal({}.polluted, undefined);
  assert.ok(doc.nodes.some(n => n.path === '$["a.b"]["<script>"]'));
  assert.equal(formatDocument(doc, 2, true), source);
});

test('literal search escapes regex metacharacters and keeps Unicode offsets', () => {
  const source = '{"text":"İ EXAMPLE [x].* \\u0041"}';
  const doc = parseDocument(source);
  const hit = findMatches(doc, 'example').hits[0];
  assert.equal(source.slice(hit.start, hit.end), 'EXAMPLE');
  assert.equal(findMatches(doc, '[x].*').hits.length, 1);
  assert.equal(findMatches(doc, '\\u0041').hits.length, 1);
});

test('tree rows collapse and expand with stable formatted line numbers', () => {
  const doc = parseDocument('{"a":[1,{}],"b":true}');
  assert.equal(visibleRows(doc, new Set()).length, 1);
  const all = visibleRows(doc, new Set(doc.nodes.map(n => n.id)));
  assert.equal(all.length, 7);
  assert.deepEqual(all.map(r => r.line), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(doc.lineCount, 7);
  assert.equal(formatDocument(doc).split('\n').length, doc.lineCount);
});

test('reports maximum depth across uneven branches, counting the root as zero', () => {
  const doc = parseDocument('{"shallow":1,"deep":[{"nested":{"leaf":true}}],"empty":{}}');
  assert.equal(doc.maxDepth, 4);
  assert.equal(doc.nodes.find(n => n.token.raw === 'true').depth, 4);
  for (const source of ['', '{}', '[]', 'null', '42', '"text"']) assert.equal(parseDocument(source).maxDepth, 0);
  assert.equal(parseDocument('{"empty":[]}').maxDepth, 1);
});

test('global depth limits reveal exactly one more or fewer levels without changing JSON', () => {
  const source = '{"a":{"b":[{"c":true}]},"other":{"x":1}}';
  const doc = parseDocument(source);
  for (const depth of [0, 1, 2, 3, 4, 3, 2, 1, 0]) {
    const rows = visibleRows(doc, expansionAtDepth(doc, depth));
    assert.equal(Math.max(...rows.map(row => row.node.depth)), depth);
    assert.ok(rows.every(row => row.node.depth <= depth));
    assert.equal(formatDocument(doc, 2, true), source);
  }
  assert.equal(visibleRows(doc, expansionAtDepth(doc, -10)).length, 1);
  assert.equal(Math.max(...visibleRows(doc, expansionAtDepth(doc, 999)).map(row => row.node.depth)), doc.maxDepth);
  assert.equal(expansionAtDepth(parseDocument(''), 10).size, 0);
});

test('rejects invalid JSON and handles an empty draft', () => {
  for (const source of ['{"x":}', '{"x":1,}', '[1,]', 'NaN', 'undefined', '{x:1}', '01', '{}{}', '[1\u00a0]']) {
    assert.throws(() => parseDocument(source));
  }
  assert.equal(parseDocument(' \n\t ').empty, true);
  assert.equal(formatDocument(parseDocument('')), '');
  const detail = describeError(new Error('Unexpected token at position 8'), '{\n"x":  }');
  assert.equal(detail.line, 2);
  assert.equal(detail.column, 7);
});

test('document size and depth limits fail with actionable messages', () => {
  assert.throws(() => parseDocument('['.repeat(MAX_DEPTH + 2) + '0' + ']'.repeat(MAX_DEPTH + 2)), /nested deeper/);
  assert.throws(() => parseDocument('"' + 'a'.repeat(MAX_BYTES) + '"'), /5 MiB/);
  assert.throws(() => parseDocument('"' + '🧩'.repeat(MAX_BYTES / 4) + '"'), /5 MiB/);
});

test('handles a large tree while mounting only requested visible rows in the UI', () => {
  const source = JSON.stringify(Array.from({ length: 12000 }, (_, i) => ({ id: i, name: `user-${i}` })));
  const doc = parseDocument(source);
  assert.equal(doc.root.children.length, 12000);
  assert.equal(findMatches(doc, 'user-11999').hits.length, 1);
  assert.equal(visibleRows(doc, new Set([doc.root.id])).length, 12002);
});
