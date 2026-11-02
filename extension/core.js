// All formatting uses the original lexical tokens. Large numbers and duplicate
// object keys survive formatting without a JSON.parse/stringify round trip.
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_DEPTH = 256;

export function parseDocument(source) {
  if (new TextEncoder().encode(source).length > MAX_BYTES) {
    throw new Error('This document exceeds the 5 MiB limit. Open a smaller JSON file.');
  }
  if (!source.trim()) return { empty: true, source, tokens: [], nodes: [], maxDepth: 0 };
  JSON.parse(source); // Strict JSON validation; never use the coerced values.
  const tokens = [];
  const pattern = /"(?:[^"\\]|\\[\s\S])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/gy;
  let offset = 0;
  while (offset < source.length) {
    if (/\s/.test(source[offset])) { offset++; continue; }
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match) throw new Error(`Unexpected token at position ${offset}.`);
    const raw = match[0];
    const type = raw[0] === '"' ? 'string' : raw === 'true' || raw === 'false' ? 'boolean' : raw === 'null' ? 'null' : /[\d-]/.test(raw[0]) ? 'number' : 'punctuation';
    tokens.push({ raw, type, start: offset, end: pattern.lastIndex });
    offset = pattern.lastIndex;
  }
  let cursor = 0;
  const nodes = [];
  function value(parent, path, depth, keyToken = null) {
    if (depth > MAX_DEPTH) throw new Error(`JSON is nested deeper than ${MAX_DEPTH} levels. Reduce nesting to view it.`);
    const token = tokens[cursor++];
    const container = token.raw === '{' || token.raw === '[';
    const node = { id: nodes.length, parent, path, depth, keyToken, token, type: token.raw === '{' ? 'object' : token.raw === '[' ? 'array' : token.type, children: [], start: token.start, end: token.end };
    nodes.push(node);
    if (keyToken) { keyToken.nodeId = node.id; keyToken.area = 'key'; }
    if (!container) { token.nodeId = node.id; token.area = 'value'; return node; }
    const close = token.raw === '{' ? '}' : ']';
    while (tokens[cursor].raw !== close) {
      if (node.children.length) cursor++; // comma
      let key = null;
      let childPath;
      if (node.type === 'object') {
        key = tokens[cursor++];
        const decoded = JSON.parse(key.raw);
        childPath = /^[A-Za-z_$][\w$]*$/.test(decoded) ? `${path === '$' ? '' : path + '.'}${decoded}` : `${path}[${JSON.stringify(decoded)}]`;
        cursor++; // colon
      } else childPath = `${path}[${node.children.length}]`;
      node.children.push(value(node, childPath, depth + 1, key));
    }
    node.end = tokens[cursor++].end;
    return node;
  }
  const root = value(null, '$', 0);
  let line = 1;
  function assignLines(node) {
    node.line = line++;
    if (node.children.length) {
      node.children.forEach(assignLines);
      node.endLine = line++;
    } else node.endLine = node.line;
  }
  assignLines(root);
  const maxDepth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
  return { source, tokens, nodes, root, lineCount: line - 1, maxDepth, empty: false };
}

// Root is depth 0; every property value or array item adds one level.
export function expansionAtDepth(doc, depth) {
  const limit = Math.max(0, Math.min(doc.maxDepth, Number(depth) || 0));
  return new Set(doc.nodes.filter(node => node.children.length && node.depth < limit).map(node => node.id));
}

export function formatDocument(doc, indent = 2, compact = false) {
  if (doc.empty) return '';
  if (compact) return doc.tokens.map(t => t.raw).join('');
  const unit = indent === 'tab' ? '\t' : ' '.repeat(Number(indent));
  const out = [];
  let depth = 0;
  const newline = () => out.push('\n', unit.repeat(depth));
  doc.tokens.forEach((t, i) => {
    const prev = doc.tokens[i - 1]?.raw;
    const next = doc.tokens[i + 1]?.raw;
    if (t.raw === '{' || t.raw === '[') {
      out.push(t.raw);
      if (next !== '}' && next !== ']') { depth++; newline(); }
    } else if (t.raw === '}' || t.raw === ']') {
      if (prev !== '{' && prev !== '[') { depth--; newline(); }
      out.push(t.raw);
    } else if (t.raw === ',') { out.push(','); newline(); }
    else if (t.raw === ':') out.push(': ');
    else out.push(t.raw);
  });
  return out.join('');
}

export function findMatches(doc, query, scope = 'all', caseSensitive = false, limit = 10000) {
  const hits = [];
  if (!query || doc.empty) return { hits, truncated: false };
  // Literal regex matching retains source offsets for Unicode characters whose
  // lowercase form has a different length (for example U+0130).
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escaped, caseSensitive ? 'gu' : 'giu');
  for (const token of doc.tokens) {
    if (!token.area || (scope === 'keys' && token.area !== 'key') || (scope === 'values' && token.area !== 'value')) continue;
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(token.raw)) !== null) {
      if (hits.length === limit) return { hits, truncated: true };
      hits.push({ nodeId: token.nodeId, area: token.area, index: match.index, length: match[0].length, start: token.start + match.index, end: token.start + match.index + match[0].length });
    }
  }
  return { hits, truncated: false };
}

export function visibleRows(doc, expanded) {
  const rows = [];
  if (doc.empty) return rows;
  function walk(node) {
    rows.push({ node, closing: false, key: `${node.id}:open`, line: node.line });
    if (node.children.length && expanded.has(node.id)) {
      node.children.forEach(walk);
      rows.push({ node, closing: true, key: `${node.id}:close`, line: node.endLine });
    }
  }
  walk(doc.root);
  return rows;
}

export function describeError(error, source) {
  const message = error?.message || 'Invalid JSON.';
  let position = Number(message.match(/position\s+(\d+)/i)?.[1]);
  if (!Number.isFinite(position)) {
    const at = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (at) position = source.split('\n').slice(0, Number(at[1]) - 1).join('\n').length + (Number(at[1]) > 1 ? 1 : 0) + Number(at[2]) - 1;
  }
  if (!Number.isFinite(position)) return { message, position: null, line: null, column: null };
  const before = source.slice(0, position).split('\n');
  return { message, position, line: before.length, column: before.at(-1).length + 1 };
}
