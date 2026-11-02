import { parseDocument, formatDocument, findMatches, visibleRows, expansionAtDepth, describeError, MAX_BYTES } from './core.js';
import { readStored, writeStored } from './storage.js';
import { shell, icon } from './shell.js';
import { JsonGraph } from './graph.js';
import { initThemes } from './themes.js';

document.getElementById('app').innerHTML = shell(); // Static, bundled UI only.
const $ = id => document.getElementById(id);
const popup = document.body.dataset.surface === 'popup';
const ROW_HEIGHT = 28;
const state = {
  text: '', filename: 'Untitled.json', mode: 'raw', indent: '2', query: '', scope: 'all', caseSensitive: false,
  doc: null, error: null, hits: [], truncated: false, active: -1, expanded: new Set(), rows: [], selected: '0:open',
  hitIndex: new Map(), selectedNode: null, editEmpty: false
};
let parseTimer, searchTimer, toastTimer, scrollFrame, saveQueue = Promise.resolve(), saveRevision = 0;
let booted = false;
let menuReturnFocus = null;
let selectingTreeText = false;
let visualGraph = null;

function syncGraph() {
  visualGraph?.update({ doc: state.doc, selectedId: state.selectedNode?.id ?? state.doc?.root?.id, hits: state.hits, active: state.active });
}
function selectGraphNode(id) {
  const node = state.doc?.nodes[id];
  if (!node) return;
  if (state.mode !== 'tree') switchMode('tree');
  state.selectedNode = node; state.selected = `${id}:open`;
  let parent = node.parent;
  while (parent) { state.expanded.add(parent.id); parent = parent.parent; }
  rebuildRows();
  const index = state.rows.findIndex(row => row.key === state.selected);
  $('tree').scrollTop = Math.max(0, index * ROW_HEIGHT - $('tree').clientHeight / 3);
  renderTree(); updatePosition();
}
function showSideTab(tab) {
  const graph = tab === 'graph';
  $('graph-panel').hidden = !graph; $('results-panel').hidden = graph;
  $('graph-tab').setAttribute('aria-selected', String(graph)); $('results-tab').setAttribute('aria-selected', String(!graph));
  $('graph-tab').tabIndex = graph ? 0 : -1; $('results-tab').tabIndex = graph ? -1 : 0;
  $('graph-fit').hidden = !graph;
  ['graph-show-all', 'graph-collapse-all', 'graph-arrange'].forEach(id => { $(id).hidden = !graph; });
  visualGraph?.hideTooltip(); visualGraph?.schedule();
}

function closeAttributeMenu(restoreFocus = false) {
  const wasOpen = !$('attribute-menu').hidden;
  $('attribute-menu').hidden = true;
  if (wasOpen && restoreFocus && menuReturnFocus?.isConnected) menuReturnFocus.focus({ preventScroll: true });
}
function openAttributeMenu(node, x, y, returnFocus = $('tree')) {
  if (!node) return;
  menuReturnFocus = returnFocus;
  state.selectedNode = node;
  state.selected = `${node.id}:open`;
  renderTree();
  updatePosition();
  $('attribute-path').value = node.path;
  $('attribute-path').title = node.path;
  const menu = $('attribute-menu');
  menu.hidden = false;
  menu.style.left = '0px';
  menu.style.top = '0px';
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`;
  $('copy-attribute-path').focus({ preventScroll: true });
}
async function copyAttributePath() {
  const path = $('attribute-path').value;
  try {
    await navigator.clipboard.writeText(path);
    closeAttributeMenu(true);
    toast(`Copied path: ${path}`);
  } catch {
    // Native copying remains available when browser settings block the API.
    $('attribute-menu').hidden = false;
    $('attribute-path').focus();
    $('attribute-path').select();
    toast('Press Ctrl / ⌘ C to copy the selected attribute path.');
  }
}
async function copyNodePath(id, button) {
  const node = state.doc?.nodes[id];
  if (!node) return;
  try { await navigator.clipboard.writeText(node.path); toast(`Copied path: ${node.path}`); }
  catch {
    const r = button.getBoundingClientRect(); openAttributeMenu(node, r.left, r.bottom, button);
    $('attribute-path').focus(); $('attribute-path').select(); toast('Press Ctrl / ⌘ C to copy the selected path.');
  }
}

function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
}
function snapshot() {
  return { text: state.text, filename: state.filename, mode: state.mode, query: state.query, scope: state.scope, caseSensitive: state.caseSensitive, updatedAt: Date.now() };
}
function persist() {
  if (!booted) return saveQueue;
  const value = snapshot();
  const revision = ++saveRevision;
  $('save-status').textContent = 'Saving…';
  // Invoke the storage API immediately. In particular, no pending debounce is
  // lost when Chrome destroys a popup after it loses focus.
  const saving = writeStored('document', value);
  saveQueue = saving.then(() => {
    if (revision === saveRevision) $('save-status').textContent = 'Saved locally';
  }).catch(() => {
    if (revision === saveRevision) {
      $('save-status').textContent = 'Not saved';
      toast('Could not save your draft. Copy or download it before closing.');
    }
    throw new Error('Draft could not be saved.');
  });
  saveQueue.catch(() => {});
  return saveQueue;
}
function parseCurrent(resetExpansion = true) {
  closeAttributeMenu();
  clearTimeout(parseTimer);
  state.error = null;
  try {
    state.doc = parseDocument(state.text);
    if (resetExpansion) {
      state.expanded = new Set(state.doc.nodes.filter(n => n.children.length && n.depth < 4).map(n => n.id));
      state.selected = '0:open';
      state.selectedNode = state.doc.root || null;
    }
  } catch (error) {
    state.doc = null;
    state.error = describeError(error, state.text);
    state.mode = 'raw';
  }
  if (state.doc?.empty) state.mode = 'raw';
  refreshSearch(false);
  refreshView();
}
function setText(text, { filename, mode = 'raw', save = true } = {}) {
  state.text = text.replace(/^\uFEFF/, '');
  if (filename) state.filename = filename;
  state.mode = mode;
  state.editEmpty = false;
  $('editor').value = state.text;
  $('editor').scrollTop = 0;
  parseCurrent();
  if (save) persist();
}
function refreshView() {
  const empty = !state.text.trim();
  const valid = state.doc && !state.doc.empty;
  $('filename').textContent = state.filename;
  document.title = popup ? 'JSON Viewer · Quick panel' : `${state.filename} · JSON Viewer`;
  $('tree-tab').disabled = !valid;
  $('tree-tab').setAttribute('aria-selected', String(state.mode === 'tree'));
  $('raw-tab').setAttribute('aria-selected', String(state.mode === 'raw'));
  $('tree-tab').tabIndex = state.mode === 'tree' ? 0 : -1;
  $('raw-tab').tabIndex = state.mode === 'raw' ? 0 : -1;
  $('tree').hidden = state.mode !== 'tree';
  $('editor-wrap').hidden = state.mode !== 'raw';
  $('empty-state').hidden = !empty || state.editEmpty;
  $('error-banner').hidden = !state.error;
  if (state.error) {
    $('error-message').textContent = state.error.message;
    $('go-error').hidden = state.error.position === null;
  }
  $('validity').className = `validity${valid ? ' valid' : state.error ? ' invalid' : ''}`;
  $('validity-text').textContent = valid ? 'Valid JSON' : state.error ? 'Invalid JSON' : 'Ready for JSON';
  $('size').textContent = bytes(new TextEncoder().encode(state.text).length);
  $('copy').disabled = empty;
  $('download').disabled = empty;
  $('minify').disabled = !valid;
  $('beautify').disabled = empty;
  $('clear-document').disabled = empty;
  $('expand').disabled = !valid || state.mode !== 'tree';
  $('collapse').disabled = !valid || state.mode !== 'tree';
  $('editor').style.tabSize = state.indent === 'tab' ? '4' : state.indent;
  if (state.mode === 'tree' && valid) rebuildRows();
  else { updateEditorLines(); updateDepthControls(); }
  updatePosition();
}
function bytes(n) {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MiB`;
}
function updateEditorLines() {
  if (state.mode !== 'raw') return;
  const first = Math.floor($('editor').scrollTop / ROW_HEIGHT);
  const count = Math.ceil($('editor').clientHeight / ROW_HEIGHT) + 1;
  const total = (state.text.match(/\n/g) || []).length + 1;
  $('editor-lines').textContent = Array.from({ length: Math.max(0, Math.min(count, total - first)) }, (_, i) => first + i + 1).join('\n');
  $('editor-lines').style.transform = `translateY(-${$('editor').scrollTop % ROW_HEIGHT}px)`;
}
function updatePosition() {
  let node = state.selectedNode || state.doc?.root;
  if (state.mode === 'raw') {
    const before = state.text.slice(0, $('editor').selectionStart).split('\n');
    $('position').textContent = `Ln ${before.length}, Col ${before.at(-1).length + 1}`;
    $('breadcrumb').textContent = state.error ? 'Edit your JSON to continue' : state.doc?.empty ? 'Paste or open a file to get started' : 'Raw JSON · edit directly';
    const cursor = $('editor').selectionStart;
    node = state.doc?.nodes.findLast(item => (item.keyToken?.start ?? item.start) <= cursor && item.end >= cursor) || state.doc?.root;
  } else {
    $('position').textContent = `Ln ${node?.line || 1}`;
    $('breadcrumb').textContent = node?.path || '$';
  }
  $('node-depth').textContent = state.doc && !state.doc.empty ? `Depth ${node?.depth ?? 0} / ${state.doc.maxDepth}` : 'Depth —';
  syncGraph();
}

function shownDepth() {
  if (!state.doc || state.doc.empty) return 0;
  const rows = state.mode === 'tree' ? state.rows : visibleRows(state.doc, state.expanded);
  return rows.reduce((max, row) => Math.max(max, row.node.depth), 0);
}
function updateDepthControls() {
  const valid = state.doc && !state.doc.empty;
  const max = valid ? state.doc.maxDepth : 0;
  const select = $('shown-depth');
  if (select.dataset.max !== String(max)) {
    const options = Array.from({ length: max + 1 }, (_, i) => new Option(String(i), String(i)));
    select.replaceChildren(...options);
    select.dataset.max = String(max);
  }
  const depth = shownDepth();
  select.value = String(depth);
  $('max-depth').textContent = valid ? String(max) : '—';
  const enabled = valid && state.mode === 'tree';
  select.disabled = !enabled || max === 0;
  $('collapse-level').disabled = !enabled || depth === 0;
  $('expand-level').disabled = !enabled || depth === max;
}
function setTreeDepth(depth) {
  if (!state.doc || state.doc.empty || state.mode !== 'tree') return;
  const limit = Math.max(0, Math.min(state.doc.maxDepth, Number(depth)));
  state.expanded = expansionAtDepth(state.doc, limit);
  let selected = state.selectedNode || state.doc.root;
  while (selected.depth > limit) selected = selected.parent;
  state.selectedNode = selected;
  state.selected = `${selected.id}:open`;
  rebuildRows();
  const index = state.rows.findIndex(row => row.key === state.selected);
  $('tree').scrollTop = Math.max(0, index * ROW_HEIGHT - $('tree').clientHeight / 3);
  renderTree();
  updatePosition();
  visualGraph?.setDepth(limit);
}
function switchMode(mode) {
  closeAttributeMenu();
  if (mode === 'tree' && (!state.doc || state.doc.empty)) return;
  state.mode = mode;
  if (mode === 'raw') state.editEmpty = true;
  refreshView();
  if (state.active >= 0) revealMatch(false);
  persist();
}
function beautify(compact = false) {
  parseCurrent(false);
  if (!state.doc || state.doc.empty) { if (state.error) toast('Fix the JSON error before formatting.'); return; }
  const text = formatDocument(state.doc, state.indent, compact);
  setText(text, { mode: compact ? 'raw' : 'tree' });
  if (state.active >= 0) revealMatch(false);
  toast(compact ? 'JSON minified' : 'JSON beautified');
}

// A virtualized tree mounts visible rows plus an overscan, retaining any rows
// needed by a native text selection. Unchanged text nodes stay in place.
function rebuildRows() {
  state.rows = visibleRows(state.doc, state.expanded);
  $('tree-content').style.height = `${state.rows.length * ROW_HEIGHT + 24}px`;
  let width = 0;
  for (const row of state.rows) {
    const n = row.node;
    width = Math.max(width, (n.keyToken?.raw.length || 0) + (n.children.length ? 25 : n.token.raw.length) + n.depth * (popup ? 2 : 3));
  }
  // Avoid pathological scroll widths for multi-megabyte single string values.
  $('tree-content').style.minWidth = `max(100%, ${Math.min(40000, width * (popup ? 7 : 8) + 130)}px)`;
  renderTree();
  updateDepthControls();
}
function renderTree() {
  if (state.mode !== 'tree' || !state.doc) return;
  const container = $('tree');
  const first = Math.max(0, Math.floor(container.scrollTop / ROW_HEIGHT) - 5);
  const last = Math.min(state.rows.length, first + Math.ceil(container.clientHeight / ROW_HEIGHT) + 12);
  const content = $('tree-content');
  const existing = new Map(Array.from(content.children, element => [element.dataset.rowKey, element]));
  const indices = new Set(Array.from({ length: last - first }, (_, i) => first + i));
  const selection = getSelection();
  const anchor = selection?.anchorNode?.parentElement?.closest('.tree-row');
  const focus = selection?.focusNode?.parentElement?.closest('.tree-row');
  // Keep the actual selection endpoints mounted when they scroll offscreen.
  // During a drag, also mount the intervening rows so native selection can grow.
  if (selection && (!selection.isCollapsed || selectingTreeText) && content.contains(anchor) && content.contains(focus)) {
    const anchorIndex = state.rows.findIndex(row => row.key === anchor.dataset.rowKey);
    const focusIndex = state.rows.findIndex(row => row.key === focus.dataset.rowKey);
    if (anchorIndex >= 0 && focusIndex >= 0) {
      let start = Math.min(anchorIndex, focusIndex);
      let end = Math.max(anchorIndex, focusIndex);
      if (selectingTreeText) { start = Math.min(start, first); end = Math.max(end, last - 1); }
      for (let index = start; index <= end; index++) indices.add(index);
    }
  }
  const elements = [];
  const highlight = JSON.stringify([state.query, state.scope, state.caseSensitive, state.active]);
  for (const index of Array.from(indices).sort((a, b) => a - b)) {
    const row = state.rows[index];
    const n = row.node;
    const signature = `${highlight}:${state.expanded.has(n.id)}`;
    const previous = existing.get(row.key);
    if (previous?.jsonNode === n && previous.renderSignature === signature) {
      previous.dataset.row = String(index);
      previous.style.top = `${index * ROW_HEIGHT}px`;
      elements.push(previous);
      continue;
    }
    const element = document.createElement('div');
    element.className = 'tree-row';
    element.dataset.row = String(index);
    element.dataset.node = String(n.id);
    element.dataset.rowKey = row.key;
    element.jsonNode = n;
    element.renderSignature = signature;
    element.id = `tree-row-${n.id}-${row.closing ? 'close' : 'open'}`;
    element.style.top = `${index * ROW_HEIGHT}px`;
    element.setAttribute('role', 'treeitem');
    element.setAttribute('aria-level', String(n.depth + 1));
    element.setAttribute('aria-selected', String(state.selected === row.key));
    if (!row.closing && n.children.length) element.setAttribute('aria-expanded', String(state.expanded.has(n.id)));
    if (state.selected === row.key) element.classList.add('selected');
    if (!row.closing && state.hits[state.active]?.nodeId === n.id) element.classList.add('active-match');
    const number = document.createElement('span');
    number.className = 'line-number';
    number.textContent = row.line;
    const code = document.createElement('span');
    code.className = 'row-code';
    code.style.setProperty('--depth', n.depth);
    const guides = document.createElement('span');
    guides.className = 'indent-guides';
    code.append(guides);
    const toggle = document.createElement(!row.closing && n.children.length ? 'button' : 'span');
    toggle.className = `disclosure${state.expanded.has(n.id) ? ' open' : ''}`;
    if (!row.closing && n.children.length) {
      toggle.innerHTML = icon('chevron');
      toggle.setAttribute('aria-label', `${state.expanded.has(n.id) ? 'Collapse' : 'Expand'} ${n.path}`);
      toggle.tabIndex = -1;
      toggle.dataset.toggle = String(n.id);
    }
    code.append(toggle);
    if (row.closing) {
      appendText(code, n.type === 'object' ? '}' : ']', 'punctuation');
    } else {
      if (n.keyToken) { appendToken(code, n.keyToken, n.id, 'key'); appendText(code, ': ', 'punctuation'); }
      if (n.type === 'object' || n.type === 'array') {
        const open = n.type === 'object' ? '{' : '[';
        const close = n.type === 'object' ? '}' : ']';
        const expanded = state.expanded.has(n.id);
        appendText(code, n.children.length ? expanded ? open : `${open} … ${close}` : open + close, 'punctuation');
        if (!expanded && n.children.length) appendText(code, `${n.children.length} ${n.type === 'object' ? n.children.length === 1 ? 'key' : 'keys' : n.children.length === 1 ? 'item' : 'items'}`, 'summary');
      } else appendToken(code, n.token, n.id, 'value');
    }
    const lastSibling = !n.parent || n.parent.children.at(-1) === n;
    if (!lastSibling && (row.closing || !n.children.length || !state.expanded.has(n.id))) appendText(code, ',', 'comma');
    element.append(number, code);
    elements.push(element);
  }
  const retained = new Set(elements);
  for (const element of Array.from(content.children)) if (!retained.has(element)) element.remove();
  // Reuse rows in place. Moving them through a DocumentFragment also destroys
  // native ranges, even if the same nodes are later reattached.
  let next = null;
  for (const element of elements.reverse()) {
    if (element.parentNode !== content || element.nextSibling !== next) content.insertBefore(element, next);
    next = element;
  }
  updateTreeRowSelection();
}
function updateTreeRowSelection() {
  for (const element of $('tree-content').children) {
    const selected = state.selected === element.dataset.rowKey;
    element.classList.toggle('selected', selected);
    element.setAttribute('aria-selected', String(selected));
  }
  const selected = $('tree-content').querySelector('[aria-selected="true"]');
  if (selected) $('tree').setAttribute('aria-activedescendant', selected.id);
  else $('tree').removeAttribute('aria-activedescendant');
}
function appendText(parent, text, className) {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  parent.append(span);
  return span;
}
function appendToken(parent, token, nodeId, area) {
  const span = document.createElement('span');
  span.className = `token-${area === 'key' ? 'key' : token.type}`;
  if (area === 'key') {
    span.dataset.keyNode = String(nodeId);
    span.title = 'Right-click to copy attribute path';
  }
  const hits = state.hitIndex.get(`${nodeId}:${area}`) || [];
  let previous = 0;
  for (const { hit, index } of hits) {
    span.append(document.createTextNode(token.raw.slice(previous, hit.index)));
    const mark = document.createElement('mark');
    if (index === state.active) mark.className = 'current';
    mark.textContent = token.raw.slice(hit.index, hit.index + hit.length);
    span.append(mark);
    previous = hit.index + hit.length;
  }
  span.append(document.createTextNode(token.raw.slice(previous)));
  parent.append(span);
}
function refreshSearch(reveal = true) {
  clearTimeout(searchTimer);
  searchTimer = null;
  const result = state.doc ? findMatches(state.doc, state.query, state.scope, state.caseSensitive) : { hits: [], truncated: false };
  state.hits = result.hits;
  state.truncated = result.truncated;
  state.active = state.hits.length ? 0 : -1;
  state.hitIndex = new Map();
  state.hits.forEach((hit, index) => {
    const key = `${hit.nodeId}:${hit.area}`;
    if (!state.hitIndex.has(key)) state.hitIndex.set(key, []);
    state.hitIndex.get(key).push({ hit, index });
  });
  renderResults();
  if (reveal && state.hits.length) revealMatch(false);
  else if (state.mode === 'tree') renderTree();
  syncGraph();
}
function renderResults() {
  const count = state.hits.length;
  const suffix = state.truncated ? '+' : '';
  $('match-count').textContent = count ? `${state.active + 1} of ${count}${suffix}` : state.query ? 'No matches' : '0 matches';
  $('results-count').textContent = `${count}${suffix} ${count === 1 ? 'match' : 'matches'}`;
  $('results-tab-count').textContent = `(${count}${suffix})`;
  $('previous').disabled = !count;
  $('next').disabled = !count;
  $('clear-search').hidden = !state.query;
  const list = $('results-list');
  const fragment = document.createDocumentFragment();
  if (!count) {
    const empty = document.createElement('div');
    empty.className = 'results-empty';
    empty.innerHTML = icon('search');
    appendText(empty, state.query ? 'No matches found' : 'Find your way through', '');
    const strong = document.createElement('strong');
    strong.textContent = state.query ? 'Try another word or search scope.' : 'Search keys, values, or both.';
    empty.append(strong);
    fragment.append(empty);
  } else {
    const start = Math.max(0, state.active - 100);
    const end = Math.min(count, start + 250);
    for (let i = start; i < end; i++) {
      const hit = state.hits[i];
      const node = state.doc.nodes[hit.nodeId];
      const button = document.createElement('button');
      button.className = `result${i === state.active ? ' active' : ''}`;
      button.dataset.hit = String(i);
      button.setAttribute('aria-label', `${node.path}, match ${i + 1}`);
      if (i === state.active) button.setAttribute('aria-current', 'true');
      appendText(button, i + 1, 'result-number');
      const details = document.createElement('span');
      details.className = 'result-details';
      appendText(details, node.path, 'result-path');
      const raw = node.children.length ? `${node.type} · ${node.children.length} ${node.type === 'array' ? 'items' : 'keys'}` : node.token.raw;
      appendText(details, raw.length > 200 ? raw.slice(0, 200) + '…' : raw, 'result-preview');
      appendText(details, `Line ${node.line} · ${hit.area === 'key' ? 'key' : 'value'}`, 'result-line');
      button.append(details);
      fragment.append(button);
    }
    if (count > 250 || state.truncated) appendText(fragment, `Showing matches ${start + 1}–${end} of ${count}${suffix}. Use next / previous to navigate every match.${state.truncated ? ' Refine your search to see more than 10,000 matches.' : ''}`, 'results-note');
  }
  list.replaceChildren(fragment);
  const active = list.querySelector('.active');
  if (active && active.offsetTop > list.clientHeight) list.scrollTop = active.offsetTop - list.offsetTop - 50;
}
function revealMatch(focus = false) {
  const hit = state.hits[state.active];
  if (!hit) return;
  const node = state.doc.nodes[hit.nodeId];
  state.selectedNode = node;
  state.selected = `${node.id}:open`;
  if (state.mode === 'tree') {
    let parent = node.parent;
    while (parent) { state.expanded.add(parent.id); parent = parent.parent; }
    rebuildRows();
    const rowIndex = state.rows.findIndex(row => row.key === state.selected);
    $('tree').scrollTop = Math.max(0, rowIndex * ROW_HEIGHT - $('tree').clientHeight / 3);
    renderTree();
    requestAnimationFrame(() => {
      const mark = $('tree-content').querySelector('mark.current');
      if (mark) {
        const left = mark.getBoundingClientRect().left - $('tree').getBoundingClientRect().left + $('tree').scrollLeft;
        if (left < $('tree').scrollLeft + 60 || left > $('tree').scrollLeft + $('tree').clientWidth - 80) $('tree').scrollLeft = Math.max(0, left - 120);
      }
    });
    if (focus) $('tree').focus();
  } else {
    $('editor').setSelectionRange(hit.start, hit.end);
    const line = state.text.slice(0, hit.start).split('\n').length - 1;
    $('editor').scrollTop = Math.max(0, line * ROW_HEIGHT - $('editor').clientHeight / 3);
    updateEditorLines();
    if (focus) $('editor').focus();
  }
  visualGraph?.reveal(node.id);
  updatePosition();
}
function moveMatch(delta) {
  // Include keystrokes that are still inside the search debounce window.
  if (searchTimer) refreshSearch(false);
  if (!state.hits.length) return;
  state.active = (state.active + delta + state.hits.length) % state.hits.length;
  renderResults();
  revealMatch(false);
}
function clearSearch() {
  state.query = '';
  $('search').value = '';
  refreshSearch();
  persist();
}

async function openFile(file) {
  if (!file) return;
  if (file.size > MAX_BYTES) { toast('This file exceeds the 5 MiB limit.'); return; }
  try {
    const text = await file.text();
    setText(text, { filename: file.name, mode: 'tree' });
    if (state.error) $('editor').focus();
  } catch { toast('Could not read this file. Please try again.'); }
}
async function copy() {
  try { await navigator.clipboard.writeText(state.text); toast('JSON copied to clipboard'); }
  catch { toast('Clipboard is unavailable. Select your JSON in Raw / Edit and copy it.'); }
}
function download() {
  const blob = new Blob([state.text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = state.filename.replace(/\.(txt|jsonl)$/i, '.json');
  if (!/\.json$/i.test(link.download)) link.download += '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function openFull() {
  try {
    await persist();
    if (globalThis.chrome?.tabs?.create && chrome.runtime?.getURL) {
      await chrome.tabs.create({ url: chrome.runtime.getURL('viewer.html') });
      window.close();
    } else window.open(new URL('viewer.html', location.href).href, '_blank');
  } catch { toast('Could not open the full viewer. Copy your JSON and try again.'); }
}

function bindEvents() {
  $('graph-tab').addEventListener('click', () => showSideTab('graph'));
  $('results-tab').addEventListener('click', () => showSideTab('results'));
  document.querySelector('.side-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const tab = $('graph-panel').hidden ? 'graph' : 'results'; showSideTab(tab); $(tab === 'graph' ? 'graph-tab' : 'results-tab').focus();
  });
  $('toggle-visual').addEventListener('click', () => {
    const hidden = $('workspace').classList.toggle('side-hidden');
    $('toggle-visual').setAttribute('aria-pressed', String(!hidden));
    visualGraph?.hideTooltip(); if (!hidden) visualGraph?.schedule();
  });
  $('graph-maximize').addEventListener('click', () => {
    const maximized = $('workspace').classList.toggle('graph-maximized');
    $('graph-maximize').setAttribute('aria-pressed', String(maximized));
    $('graph-maximize').setAttribute('aria-label', maximized ? 'Restore split view' : 'Maximize visual pane');
    visualGraph?.hideTooltip(); visualGraph?.fit();
  });
  const divider = $('pane-divider');
  const resizePanes = percent => {
    const value = Math.max(25, Math.min(70, percent));
    $('workspace').style.setProperty('--source-width', `${value}%`); divider.setAttribute('aria-valuenow', String(Math.round(value)));
  };
  let resizing = false;
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); resizing = true; divider.setPointerCapture(event.pointerId); document.body.classList.add('resizing-panes');
  });
  divider.addEventListener('pointermove', event => {
    if (!resizing) return;
    const r = $('workspace').getBoundingClientRect(); resizePanes((event.clientX - r.left) / r.width * 100);
  });
  const finishResize = () => { resizing = false; document.body.classList.remove('resizing-panes'); };
  divider.addEventListener('pointerup', finishResize); divider.addEventListener('pointercancel', finishResize); window.addEventListener('blur', finishResize);
  divider.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const current = Number(divider.getAttribute('aria-valuenow'));
    resizePanes(event.key === 'Home' ? 25 : event.key === 'End' ? 70 : current + (event.key === 'ArrowLeft' ? -3 : 3));
  });
  $('tree-content').addEventListener('pointerdown', event => {
    if (event.button === 0 && !event.target.closest('[data-toggle]')) selectingTreeText = true;
  });
  const finishSelection = () => { selectingTreeText = false; };
  document.addEventListener('pointerup', finishSelection);
  document.addEventListener('pointercancel', finishSelection);
  window.addEventListener('blur', finishSelection);
  $('tree-content').addEventListener('contextmenu', event => {
    const key = event.target.closest('[data-key-node]');
    if (!key) return;
    const node = state.doc?.nodes[Number(key.dataset.keyNode)];
    if (!node?.keyToken) return;
    event.preventDefault();
    openAttributeMenu(node, event.clientX, event.clientY);
  });
  $('copy-attribute-path').addEventListener('click', copyAttributePath);
  $('attribute-menu').addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); closeAttributeMenu(true);
    } else if (event.key === 'Tab') closeAttributeMenu();
    else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) && event.target !== $('attribute-path')) {
      event.preventDefault(); $('copy-attribute-path').focus();
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!$('attribute-menu').contains(event.target)) closeAttributeMenu();
  });
  document.addEventListener('contextmenu', event => {
    if (!event.defaultPrevented && !$('attribute-menu').contains(event.target)) closeAttributeMenu();
  });
  window.addEventListener('blur', () => closeAttributeMenu());
  window.addEventListener('resize', () => closeAttributeMenu());
  $('editor').addEventListener('input', () => {
    state.text = $('editor').value;
    state.mode = 'raw';
    state.editEmpty = true;
    // A nonempty first paste must expose the editor immediately.
    $('empty-state').hidden = !!state.text.trim();
    updateEditorLines();
    updatePosition();
    clearTimeout(parseTimer);
    parseTimer = setTimeout(() => parseCurrent(), 150);
    persist();
  });
  $('editor').addEventListener('scroll', updateEditorLines);
  ['click', 'keyup', 'select'].forEach(event => $('editor').addEventListener(event, updatePosition));
  $('editor').addEventListener('keydown', event => {
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const field = $('editor');
      const indent = state.indent === 'tab' ? '\t' : ' '.repeat(Number(state.indent));
      field.setRangeText(indent, field.selectionStart, field.selectionEnd, 'end');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  $('search').addEventListener('input', () => {
    state.query = $('search').value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { searchTimer = null; refreshSearch(); }, 100);
    persist();
  });
  $('search').addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); moveMatch(event.shiftKey ? -1 : 1); }
  });
  $('clear-search').addEventListener('click', () => { clearSearch(); $('search').focus(); });
  $('previous').addEventListener('click', () => moveMatch(-1));
  $('next').addEventListener('click', () => moveMatch(1));
  $('scope').addEventListener('change', () => { state.scope = $('scope').value; refreshSearch(); persist(); });
  $('case-sensitive').addEventListener('click', () => {
    state.caseSensitive = !state.caseSensitive;
    $('case-sensitive').setAttribute('aria-pressed', String(state.caseSensitive));
    refreshSearch(); persist();
  });
  $('beautify').addEventListener('click', () => beautify());
  $('minify').addEventListener('click', () => beautify(true));
  $('tree-tab').addEventListener('click', () => { parseCurrent(false); switchMode('tree'); });
  $('raw-tab').addEventListener('click', () => switchMode('raw'));
  document.querySelector('.view-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const mode = state.mode === 'tree' ? 'raw' : 'tree';
    switchMode(mode);
    $(state.mode === 'tree' ? 'tree-tab' : 'raw-tab').focus();
  });
  $('indent').addEventListener('change', () => {
    state.indent = $('indent').value;
    $('editor').style.tabSize = state.indent === 'tab' ? '4' : state.indent;
    writeStored('preferences', { indent: state.indent }).catch(() => toast('Could not save indentation preference.'));
    if (state.doc && !state.doc.empty && state.mode === 'tree') beautify();
  });
  $('expand').addEventListener('click', () => setTreeDepth(state.doc.maxDepth));
  $('collapse').addEventListener('click', () => setTreeDepth(0));
  $('collapse-level').addEventListener('click', () => setTreeDepth(shownDepth() - 1));
  $('expand-level').addEventListener('click', () => setTreeDepth(shownDepth() + 1));
  $('shown-depth').addEventListener('change', () => setTreeDepth($('shown-depth').value));
  $('tree').addEventListener('scroll', () => { closeAttributeMenu(); cancelAnimationFrame(scrollFrame); scrollFrame = requestAnimationFrame(renderTree); });
  $('tree-content').addEventListener('click', event => {
    const row = event.target.closest('[data-row]');
    if (!row) return;
    const item = state.rows[Number(row.dataset.row)];
    state.selected = item.key;
    state.selectedNode = item.node;
    if (item.node.type === 'array' && !item.node.children.length) toast(`${item.node.path} is an empty array.`);
    const toggle = event.target.closest('[data-toggle]');
    if (toggle) {
      const id = Number(toggle.dataset.toggle);
      state.expanded.has(id) ? state.expanded.delete(id) : state.expanded.add(id);
      rebuildRows();
    } else updateTreeRowSelection();
    const selection = getSelection();
    const hasTextSelection = selection && !selection.isCollapsed && $('tree-content').contains(selection.anchorNode);
    if (toggle || (!hasTextSelection && event.detail < 2)) $('tree').focus({ preventScroll: true });
    updatePosition();
  });
  $('tree').addEventListener('keydown', event => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      const node = state.selectedNode;
      if (node?.keyToken) {
        event.preventDefault();
        const key = $('tree-content').querySelector(`[data-key-node="${node.id}"]`);
        const rect = (key || $('tree')).getBoundingClientRect();
        openAttributeMenu(node, rect.left, rect.bottom);
      }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    let index = Math.max(0, state.rows.findIndex(row => row.key === state.selected));
    const row = state.rows[index];
    if (!row) return;
    const n = row.node;
    if (event.key === 'ArrowDown') index = Math.min(state.rows.length - 1, index + 1);
    else if (event.key === 'ArrowUp') index = Math.max(0, index - 1);
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = state.rows.length - 1;
    else if (event.key === 'ArrowRight') {
      if (n.children.length && !state.expanded.has(n.id)) { state.expanded.add(n.id); rebuildRows(); }
      else index = Math.min(state.rows.length - 1, index + 1);
    } else if (event.key === 'ArrowLeft') {
      if (n.children.length && state.expanded.has(n.id)) { state.expanded.delete(n.id); rebuildRows(); }
      else if (n.parent) index = state.rows.findIndex(r => r.node.id === n.parent.id && !r.closing);
    } else if (n.children.length) {
      state.expanded.has(n.id) ? state.expanded.delete(n.id) : state.expanded.add(n.id);
      rebuildRows();
    }
    const selected = state.rows[Math.min(index, state.rows.length - 1)];
    state.selected = selected.key;
    state.selectedNode = selected.node;
    if (index * ROW_HEIGHT < $('tree').scrollTop || index * ROW_HEIGHT > $('tree').scrollTop + $('tree').clientHeight - ROW_HEIGHT) $('tree').scrollTop = Math.max(0, index * ROW_HEIGHT - $('tree').clientHeight / 2);
    renderTree(); updatePosition();
  });
  $('results-list').addEventListener('click', event => {
    const result = event.target.closest('[data-hit]');
    if (!result) return;
    state.active = Number(result.dataset.hit);
    renderResults(); revealMatch(true);
  });
  $('open-file').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', async () => { await openFile($('file-input').files[0]); $('file-input').value = ''; });
  $('copy').addEventListener('click', copy);
  $('download').addEventListener('click', download);
  $('open-full').addEventListener('click', openFull);
  $('paste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { toast('Clipboard is empty.'); return; }
      setText(text, { mode: 'tree' });
    } catch {
      $('empty-state').hidden = true;
      switchMode('raw');
      $('empty-state').hidden = true;
      $('editor').focus();
      toast('Press Ctrl / ⌘ V to paste into the editor.');
    }
  });
  $('example').addEventListener('click', () => {
    const example = { status: 'success', data: { users: [{ id: 1042, name: 'Alex Morgan', email: 'alex@example.com', active: true, role: 'admin', bio: 'Frontend developer building accessible tools for exploring complex JSON data, with a focus on clarity, speed, and privacy.' }, { id: 1043, name: 'Sam Rivera', email: 'sam@example.com', active: false, role: 'editor' }], total: 2, page: 1 } };
    setText(JSON.stringify(example, null, 2), { filename: 'response.json', mode: 'tree' });
  });
  $('clear-document').addEventListener('click', () => { clearSearch(); setText('', { filename: 'Untitled.json' }); });
  $('go-error').addEventListener('click', () => {
    const p = state.error?.position;
    if (p === null || p === undefined) return;
    $('editor').focus();
    $('editor').setSelectionRange(p, Math.min(p + 1, state.text.length));
    $('editor').scrollTop = Math.max(0, ((state.error.line || 1) - 3) * ROW_HEIGHT);
    updateEditorLines(); updatePosition();
  });
  $('help').addEventListener('click', () => $('help-dialog').showModal());
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  document.addEventListener('keydown', event => {
    if ($('help-dialog').open || !$('attribute-menu').hidden) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); $('search').focus(); $('search').select(); }
    else if (event.shiftKey && event.altKey && event.code === 'KeyF') { event.preventDefault(); beautify(); }
    else if (event.key === 'F3') { event.preventDefault(); moveMatch(event.shiftKey ? -1 : 1); }
    else if (event.key === 'Escape' && state.query) { event.preventDefault(); clearSearch(); }
  });
  document.addEventListener('paste', event => {
    if (event.target === $('editor') || event.target.closest('input, textarea') || $('help-dialog').open) return;
    const text = event.clipboardData?.getData('text/plain');
    if (text) { event.preventDefault(); setText(text, { mode: 'tree' }); }
  });
  let dragDepth = 0;
  document.addEventListener('dragenter', event => {
    if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); dragDepth++; $('drop-overlay').hidden = false; }
  });
  document.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
  document.addEventListener('dragleave', event => { event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drop-overlay').hidden = true; });
  document.addEventListener('drop', event => {
    event.preventDefault(); dragDepth = 0; $('drop-overlay').hidden = true;
    if (event.dataTransfer?.files.length) openFile(event.dataTransfer.files[0]);
  });
  new ResizeObserver(() => { if (state.mode === 'tree') renderTree(); else updateEditorLines(); }).observe($('workspace'));
}

await initThemes({ notify: toast });
if (!popup) visualGraph = new JsonGraph({ onSelect: selectGraphNode, onContext: (id, x, y, focus) => openAttributeMenu(state.doc?.nodes[id], x, y, focus), onNotice: toast, onCopyPath: copyNodePath });
const [saved, preferences] = await Promise.all([readStored('document'), readStored('preferences')]);
if (['2', '4', 'tab'].includes(preferences?.indent)) state.indent = preferences.indent;
$('indent').value = state.indent;
if (saved && typeof saved.text === 'string') {
  state.query = typeof saved.query === 'string' ? saved.query : '';
  state.scope = ['all', 'keys', 'values'].includes(saved.scope) ? saved.scope : 'all';
  state.caseSensitive = !!saved.caseSensitive;
  $('search').value = state.query;
  $('scope').value = state.scope;
  $('case-sensitive').setAttribute('aria-pressed', String(state.caseSensitive));
  setText(saved.text, { filename: saved.filename || 'Untitled.json', mode: saved.mode === 'tree' ? 'tree' : 'raw', save: false });
} else setText('', { save: false });
booted = true;
bindEvents();
if (state.hits.length) revealMatch(false);
document.documentElement.dataset.ready = 'true';
