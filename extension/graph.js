import { buildGraphModel, layoutGraph, initiallyCollapsed, isContainer, fullValue, previewValue, CARD_HEADER, CARD_ROW, CARD_FOOTER, CARD_VISIBLE_ROWS } from './graph-model.js';
import { easeMotion, mixLayout, mixView, anchoredView, guidedView, centeredView } from './graph-motion.js';
import { icon } from './shell.js';

const $ = id => document.getElementById(id);
const text = (tag, className, value) => { const el = document.createElement(tag); el.className = className; el.textContent = value; return el; };
const intersects = (p, r) => p.x + p.width >= r.left && p.x <= r.right && p.y + p.height >= r.top && p.y <= r.bottom;

export class JsonGraph {
  constructor({ onSelect, onContext, onNotice = () => {}, onCopyPath = () => {} }) {
    this.onSelect = onSelect; this.onContext = onContext;
    this.onNotice = onNotice; this.tooltipPinned = false; this.tooltipNodeId = null;
    this.onCopyPath = onCopyPath;
    this.doc = null; this.model = buildGraphModel(null); this.layout = layoutGraph(this.model);
    this.collapsed = new Set(); this.view = { x: 30, y: 40, scale: 1 };
    this.cards = new Map(); this.hits = new Map(); this.selectedId = null; this.active = null;
    this.manualPositions = new Map(); this.rowScroll = new Map(); this.cardDrag = null; this.layoutDirty = false;
    this.layoutMotion = null; this.viewMotion = null; this.motionEpoch = 0;
    this.frame = 0; this.drag = null; this.tooltipTimer = 0; this.fitPending = false;
    this.viewport = $('graph-viewport'); this.layer = $('graph-layer');
    this.bind();
    new ResizeObserver(() => {
      this.hideTooltip();
      if (this.fitPending && this.viewport.clientWidth) this.fit(false);
      else this.schedule();
    }).observe(this.viewport);
  }
  update({ doc, selectedId, hits, active }) {
    const changed = doc !== this.doc;
    if (changed) {
      this.layoutMotion = null; this.viewMotion = null; this.motionEpoch++;
      this.doc = doc; this.model = buildGraphModel(doc); this.collapsed = initiallyCollapsed(this.model);
      this.manualPositions.clear(); this.rowScroll.clear(); this.cardDrag = null;
      this.relayout(); this.layer.replaceChildren(); this.cards.clear();
      this.hideTooltip(); this.fitPending = true;
    }
    const selectionChanged = this.selectedId !== selectedId;
    this.selectedId = selectedId;
    this.hits = new Map();
    hits.forEach((hit, index) => {
      const key = `${hit.nodeId}:${hit.area}`;
      if (!this.hits.has(key)) this.hits.set(key, []);
      this.hits.get(key).push({ ...hit, current: index === active });
    });
    const nextActive = hits[active];
    const reveal = nextActive && (this.active?.nodeId !== nextActive.nodeId || changed);
    this.active = nextActive;
    const selected = doc?.nodes[selectedId];
    $('graph-breadcrumb').textContent = selected?.path === '$' ? 'root' : selected?.path || 'root';
    $('graph-empty').hidden = !!this.model.root;
    $('graph-empty').querySelector('strong').textContent = doc ? 'Your JSON, connected.' : 'Ready for valid JSON';
    ['graph-fit', 'graph-show-all', 'graph-collapse-all', 'graph-arrange', 'graph-zoom-in', 'graph-zoom-out', 'graph-minimap-button'].forEach(id => { $(id).disabled = !this.model.root; });
    if (this.fitPending && this.viewport.clientWidth) this.fit(false);
    if (reveal) this.reveal(nextActive.nodeId);
    else if (selectionChanged && !changed) this.reveal(selectedId);
    this.schedule();
  }
  relayout() {
    this.layout = layoutGraph(this.model, this.collapsed, { positions: this.manualPositions, rowScroll: this.rowScroll });
    this.layoutDirty = false;
  }
  reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  advanceMotion(now = performance.now()) {
    let after = null;
    if (this.layoutMotion) {
      const motion = this.layoutMotion, t = Math.min(1, (now - motion.start) / motion.duration);
      this.layout = mixLayout(motion.from, motion.to, easeMotion(t), motion.fromClosed, motion.toClosed);
      if (t >= 1) { this.layoutMotion = null; if (motion.epoch === this.motionEpoch) after = motion.after; }
    }
    if (this.viewMotion) {
      const motion = this.viewMotion, t = Math.min(1, (now - motion.start) / motion.duration);
      this.view = mixView(motion.from, motion.to, easeMotion(t));
      if (t >= 1) this.viewMotion = null;
    }
    if (after) after();
    this.viewport.dataset.animating = String(!!(this.layoutMotion || this.viewMotion));
  }
  animateView(to, { duration = 240, focusId = null, start = performance.now() } = {}) {
    const difference = Math.abs(this.view.x - to.x) + Math.abs(this.view.y - to.y) + Math.abs(this.view.scale - to.scale) * 100;
    if (this.reducedMotion() || difference < .05) { this.view = { ...to }; this.viewMotion = null; }
    else this.viewMotion = { from: { ...this.view }, to: { ...to }, start, duration, focusId };
    this.viewport.dataset.animating = String(!!(this.layoutMotion || this.viewMotion)); this.schedule();
  }
  interruptNavigation() {
    this.advanceMotion(); this.motionEpoch++; this.viewMotion = null;
    this.viewport.dataset.animating = String(!!this.layoutMotion);
  }
  transition(from, fromClosed, { anchorId = null, focusId = null, fit = false, center = false } = {}) {
    const to = this.layout, start = performance.now(), epoch = ++this.motionEpoch;
    this.viewMotion = null;
    if (fit && (!this.viewport.clientWidth || !this.viewport.clientHeight)) this.fitPending = true;
    const view = fit ? this.fittedView(to) : anchoredView(from, to, this.view, anchorId);
    const guide = () => {
      if (focusId !== null && epoch === this.motionEpoch) this.animateView((center ? centeredView : guidedView)(this.view, to, focusId, this.viewport.clientWidth, this.viewport.clientHeight), { focusId });
    };
    if (this.reducedMotion()) {
      this.layoutMotion = null; this.layout = to; this.view = view; guide();
    } else if (from.cards.length + to.cards.length > 1200) {
      // Large expansions keep the clicked card fixed without morphing thousands
      // of offscreen rectangles. The camera can still guide smoothly.
      this.layoutMotion = null; this.layout = to;
      if (fit) this.animateView(view); else { this.view = view; guide(); }
    } else {
      this.layoutMotion = { from, to, fromClosed, toClosed: new Set(this.collapsed), start, duration: 280, epoch, after: guide, focusId };
      this.layout = mixLayout(from, to, 0, fromClosed, this.collapsed);
      this.animateView(view, { start, duration: 280 });
    }
    this.viewport.dataset.animating = String(!!(this.layoutMotion || this.viewMotion)); this.schedule();
  }
  toggleCard(id) {
    const card = this.model.byId.get(id);
    if (!card || !isContainer(card.node)) return;
    if (!card.rows.length) { this.onNotice(`${card.node.path} is an empty ${card.node.type}.`); this.onSelect(id); this.animateView(centeredView(this.view, this.layout, id, this.viewport.clientWidth, this.viewport.clientHeight), { focusId: id }); return; }
    this.advanceMotion();
    const from = this.layout, before = new Set(this.collapsed), opening = this.collapsed.has(id);
    opening ? this.collapsed.delete(id) : this.collapsed.add(id);
    this.relayout(); this.hideTooltip();
    this.transition(from, before, { anchorId: id, focusId: opening ? id : null, center: true });
    if (opening) { this.openingCenterId = id; try { this.onSelect(id); } finally { this.openingCenterId = null; } }
  }
  showAll() {
    this.advanceMotion(); const from = this.layout, before = new Set(this.collapsed);
    this.collapsed.clear(); this.manualPositions.clear(); this.rowScroll.clear();
    this.relayout(); this.hideTooltip(); this.transition(from, before, { fit: true });
  }
  setDepth(depth) {
    this.advanceMotion(); const from = this.layout, before = new Set(this.collapsed);
    this.collapsed = new Set(this.model.cards.filter(c => c.node.depth >= depth && c.node.children.length).map(c => c.id));
    this.relayout(); this.hideTooltip(); this.transition(from, before, { fit: true });
  }
  reveal(id) {
    const owner = this.model.byId.get(this.model.owners.get(id));
    if (!owner) return;
    if (this.openingCenterId === owner.id) return;
    this.advanceMotion();
    const from = this.layout, before = new Set(this.collapsed);
    let parent = owner.parent, changed = false;
    while (parent) { changed = this.collapsed.delete(parent.id) || changed; parent = parent.parent; }
    if (owner.id !== id) changed = this.collapsed.delete(owner.id) || changed;
    const node = this.doc.nodes[id];
    const rowIndex = owner.rows.findIndex(row => row.id === node.id);
    const scroll = rowIndex >= 0 && owner.rows.length > CARD_VISIBLE_ROWS ? Math.min((owner.rows.length - CARD_VISIBLE_ROWS) * CARD_ROW, Math.max(0, (rowIndex - 3) * CARD_ROW)) : this.rowScroll.get(owner.id) || 0;
    const scrollChanged = scroll !== (this.rowScroll.get(owner.id) || 0);
    if (!changed && !scrollChanged && (this.layoutMotion?.focusId === owner.id || this.viewMotion?.focusId === owner.id)) return;
    this.rowScroll.set(owner.id, scroll);
    if (changed || scrollChanged) this.relayout();
    const p = this.layout.positions.get(owner.id);
    if (!p || !this.viewport.clientWidth) return;
    const to = changed || scrollChanged ? this.layout : this.layoutMotion?.to || this.layout;
    const scale = this.view.scale < .45 ? .85 : this.view.scale;
    const destination = to.positions.get(owner.id) || p;
    const centerY = rowIndex >= 0 ? destination.y + CARD_HEADER + (rowIndex + .5) * CARD_ROW - scroll : destination.y + destination.height / 2;
    if (changed) {
      this.transition(from, before, { focusId: owner.id });
      this.animateView(guidedView(this.view, to, owner.id, this.viewport.clientWidth, this.viewport.clientHeight, { scale, centerY }), { duration: 280, focusId: owner.id });
    } else this.animateView(guidedView(this.view, to, owner.id, this.viewport.clientWidth, this.viewport.clientHeight, { scale, centerY }), { focusId: owner.id });
    this.schedule();
  }
  fittedView(layout = this.layout) {
    const width = this.viewport.clientWidth, height = this.viewport.clientHeight;
    if (!width || !height || !layout.width) return { ...this.view };
    const scale = Math.max(.00005, Math.min(1, (width - 60) / layout.width, (height - 120) / layout.height));
    return { scale, x: (width - layout.width * scale) / 2 - layout.left * scale, y: (height - 70 - layout.height * scale) / 2 + 20 - layout.top * scale };
  }
  fit(animate = true) {
    const width = this.viewport.clientWidth, height = this.viewport.clientHeight;
    if (!width || !height || !this.layout.width) { this.fitPending = true; return; }
    this.interruptNavigation(); const target = this.fittedView(this.layoutMotion?.to || this.layout);
    if (animate) this.animateView(target); else { this.view = target; this.viewMotion = null; }
    this.fitPending = false; this.hideTooltip(); this.schedule();
  }
  zoom(factor, x = this.viewport.clientWidth / 2, y = this.viewport.clientHeight / 2) {
    this.interruptNavigation();
    const old = this.view.scale;
    const scale = Math.max(.00005, Math.min(2.5, old * factor));
    this.view.x = x - (x - this.view.x) * scale / old;
    this.view.y = y - (y - this.view.y) * scale / old;
    this.view.scale = scale; this.hideTooltip(); this.schedule();
  }
  schedule() {
    if (!this.frame) this.frame = requestAnimationFrame(() => { this.frame = 0; this.render(); });
  }
  render() {
    this.advanceMotion();
    if (this.layoutDirty && !this.layoutMotion) this.relayout();
    const width = this.viewport.clientWidth, height = this.viewport.clientHeight;
    if (!width || !height || $('graph-panel').hidden) return;
    const { x, y, scale } = this.view;
    const visible = { left: (-x - 60) / scale, right: (width - x + 60) / scale, top: (-y - 50) / scale, bottom: (height - y + 50) / scale };
    this.layer.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    this.viewport.style.backgroundSize = `${Math.max(4, 20 * scale)}px ${Math.max(4, 20 * scale)}px`;
    this.viewport.style.backgroundPosition = `${x}px ${y}px`;
    const lowDetail = (this.layout.cards.length > 300 || this.model.maxRows > 500) && scale < .18;
    const drawn = lowDetail ? [] : this.layout.cards.filter(p => intersects(p, visible)).slice(0, 300);
    // Retain native selection endpoints and intervening cards while panning.
    const selection = getSelection();
    const a = selection?.anchorNode?.parentElement?.closest('.graph-card');
    const b = selection?.focusNode?.parentElement?.closest('.graph-card');
    if (selection && !selection.isCollapsed && this.layer.contains(a) && this.layer.contains(b)) {
      const first = Math.min(Number(a.dataset.order), Number(b.dataset.order));
      const last = Math.max(Number(a.dataset.order), Number(b.dataset.order));
      for (const p of this.layout.cards) if (p.card.order >= first && p.card.order <= last && !drawn.includes(p)) drawn.push(p);
    }
    const wanted = new Set(drawn.map(p => p.card.id));
    for (const [id, element] of this.cards) if (!wanted.has(id)) { element.remove(); this.cards.delete(id); }
    for (const p of drawn) {
      let element = this.cards.get(p.card.id);
      if (!element) { element = this.createCard(p.card); this.cards.set(p.card.id, element); this.layer.append(element); }
      this.updateCard(element, p, visible, lowDetail);
    }
    const palette = getComputedStyle(document.documentElement), color = name => palette.getPropertyValue(name).trim();
    this.paintColors = { edge: color('--edge'), card: color('--card'), border: color('--card-border'), accent: color('--blue'), mini: color('--mini'), miniFocus: color('--mini-focus') };
    this.drawConnections(width, height, visible, lowDetail, wanted);
    this.drawMinimap();
    if (this.layoutMotion || this.viewMotion) this.schedule();
    $('graph-zoom-label').textContent = scale < .01 ? `${(scale * 100).toFixed(2)}%` : `${Math.round(scale * 100)}%`;
    $('graph-hint').textContent = lowDetail ? `${this.model.cards.length.toLocaleString()} containers · Zoom in for attributes` : 'Drag canvas to pan · Scroll to zoom';
  }
  createCard(card) {
    const article = document.createElement('article'); article.className = 'graph-card';
    article.dataset.card = String(card.id); article.dataset.order = String(card.order);
    article.dataset.depth = String(card.node.depth);
    article.setAttribute('aria-label', `${card.label}, ${card.node.type}, ${card.node.path}`);
    const header = text('div', 'graph-card-header', '');
    const collapse = text('button', 'graph-collapse', ''); collapse.dataset.graphCollapse = String(card.id); collapse.innerHTML = icon('chevron');
    collapse.setAttribute('aria-label', `Collapse ${card.node.path}`);
    collapse.hidden = !isContainer(card.node) || !card.rows.length;
    const title = text('span', 'graph-card-title', card.label); title.title = card.label;
    header.append(collapse, title, text('span', 'graph-type', `${card.node.type === 'array' ? '[]' : '{}'} ${isContainer(card.node) ? card.node.type : 'value'}`));
    const footer = text('div', 'graph-card-footer', '');
    const copyPath = text('button', 'bare graph-path-copy', ''); copyPath.innerHTML = icon('copy'); copyPath.dataset.copyNodePath = String(card.id); copyPath.title = 'Copy attribute path'; copyPath.setAttribute('aria-label', `Copy path ${card.node.path}`);
    footer.append(text('span', '', `path: ${card.node.path === '$' ? 'root' : card.node.path}`), copyPath, text('span', '', `${card.rows.length} ${card.node.type === 'array' ? 'items' : isContainer(card.node) ? 'keys' : 'value'}${card.rows.length > 8 ? ' ↕' : ''}`));
    footer.title = card.rows.length > 8 ? 'Scroll inside the card to read every attribute' : card.node.path;
    const body = text('div', 'graph-card-body', ''); body.dataset.cardBody = String(card.id);
    const rows = text('div', 'graph-card-rows', ''); rows.style.height = `${card.rows.length * CARD_ROW}px`; body.append(rows);
    body.addEventListener('scroll', () => {
      if (Math.abs((this.rowScroll.get(card.id) || 0) - body.scrollTop) < 1) return;
      this.rowScroll.set(card.id, body.scrollTop); this.layoutDirty = true; this.hideTooltip(); this.schedule();
    });
    article.append(header, body, footer); article.body = body; article.rowsLayer = rows;
    if (card.parent) article.append(text('span', 'graph-port graph-input-port', ''));
    article.rowElements = new Map();
    return article;
  }
  updateCard(element, p, visible, lowDetail) {
    const card = p.card, closed = this.collapsed.has(card.id);
    element.style.left = `${p.x}px`; element.style.top = `${p.y}px`; element.style.height = `${p.height}px`;
    element.style.opacity = String(p.opacity ?? 1);
    element.style.pointerEvents = (p.opacity ?? 1) < .08 ? 'none' : '';
    const owner = this.model.owners.get(this.selectedId);
    element.classList.toggle('selected', owner === card.id);
    element.classList.toggle('dragging', this.cardDrag?.id === card.id);
    const collapse = element.querySelector('.graph-collapse');
    collapse.classList.toggle('is-open', !closed); collapse.setAttribute('aria-expanded', String(!closed));
    collapse.setAttribute('aria-label', `${closed ? 'Expand' : 'Collapse'} ${card.node.path}`);
    const bodyOpacity = p.bodyOpacity ?? (closed ? 0 : 1), bodyVisible = !closed || bodyOpacity > 0;
    element.body.hidden = !bodyVisible || !card.rows.length;
    element.body.style.opacity = String(bodyOpacity);
    element.body.classList.toggle('morphing', !!this.layoutMotion);
    element.body.style.height = `${Math.max(0, Math.min(CARD_VISIBLE_ROWS * CARD_ROW, card.rows.length * CARD_ROW, p.height - CARD_HEADER - CARD_FOOTER))}px`;
    const scroll = this.rowScroll.get(card.id) || 0;
    if (!closed && Math.abs(element.body.scrollTop - scroll) > .5) element.body.scrollTop = scroll;
    const bodyTop = p.y + CARD_HEADER, bodyBottom = p.y + p.height - CARD_FOOTER;
    const first = Math.max(0, Math.floor((Math.max(visible.top, bodyTop) - bodyTop + scroll) / CARD_ROW));
    const last = Math.min(card.rows.length, Math.ceil((Math.min(visible.bottom, bodyBottom) - bodyTop + scroll) / CARD_ROW));
    const indices = new Set(!bodyVisible || lowDetail ? [] : Array.from({ length: Math.max(0, last - first) }, (_, i) => first + i));
    const selection = getSelection();
    const a = selection?.anchorNode?.parentElement?.closest('.graph-attribute');
    const b = selection?.focusNode?.parentElement?.closest('.graph-attribute');
    if (bodyVisible && selection && !selection.isCollapsed && element.contains(a) && element.contains(b)) {
      const start = Math.min(Number(a.dataset.index), Number(b.dataset.index)), end = Math.max(Number(a.dataset.index), Number(b.dataset.index));
      for (let i = start; i <= end; i++) indices.add(i);
    }
    for (const [index, row] of element.rowElements) if (!indices.has(index)) { row.remove(); element.rowElements.delete(index); }
    for (const index of Array.from(indices).sort((a, b) => a - b)) {
      const node = card.rows[index];
      let row = element.rowElements.get(index);
      const highlights = JSON.stringify([this.hits.get(`${node.id}:key`) || [], this.hits.get(`${node.id}:value`) || []]);
      if (!row) {
        row = text('div', 'graph-attribute', ''); row.dataset.graphNode = String(node.id); row.dataset.index = String(index); row.style.top = `${index * CARD_ROW}px`;
        const keyLabel = !isContainer(card.node) ? 'value' : node.keyToken ? JSON.parse(node.keyToken.raw) : `[${index}]`;
        const key = text('span', 'graph-key', keyLabel); key.title = keyLabel;
        if (node.keyToken) key.dataset.graphKey = String(node.id);
        const value = text('span', `graph-value ${node.type}`, previewValue(node)); value.dataset.graphValue = String(node.id); value.tabIndex = 0;
        value.setAttribute('aria-label', `${keyLabel}: ${fullValue(node)}`);
        row.append(key, value);
        if (isContainer(node) && node !== card.node) row.append(text('span', 'graph-port', ''));
        row.keyText = keyLabel; row.valueText = previewValue(node);
        element.rowElements.set(index, row);
        // Insert without detaching existing rows or native selection ranges.
        const next = Array.from(element.rowElements.entries()).filter(([i]) => i > index).sort(([a], [b]) => a - b)[0]?.[1];
        element.rowsLayer.insertBefore(row, next || null);
      }
      if (row.highlight !== highlights) {
        const keyHits = this.hits.get(`${node.id}:key`) || [];
        const valueHits = this.hits.get(`${node.id}:value`) || [];
        this.markPreview(row.querySelector('.graph-key'), row.keyText, keyHits, node.keyToken ? 1 : 0);
        this.markPreview(row.querySelector('.graph-value'), row.valueText, valueHits, 0);
        row.highlight = highlights;
      }
      row.classList.toggle('active-hit', this.active?.nodeId === node.id);
    }
    let summary = element.querySelector('.graph-card-summary');
    if (closed || !card.rows.length) {
      if (!summary) { summary = text('div', 'graph-card-summary', ''); element.append(summary); }
      summary.textContent = closed ? `${card.rows.length} ${card.node.type === 'array' ? 'items' : 'attributes'} · click to expand` : `Empty ${card.node.type}`;
      summary.style.opacity = String(closed ? 1 - bodyOpacity : 1);
    } else summary?.remove();
  }
  markPreview(element, value, hits, adjust) {
    if (!hits.length) { element.textContent = value; return; }
    const fragment = document.createDocumentFragment(); let cursor = 0;
    for (const hit of hits) {
      const start = Math.max(cursor, hit.index - adjust), end = Math.min(value.length, hit.index - adjust + hit.length);
      if (start >= value.length || end <= start) continue;
      fragment.append(document.createTextNode(value.slice(cursor, start)));
      const mark = text('mark', hit.current ? 'current' : '', value.slice(start, end)); fragment.append(mark); cursor = end;
    }
    fragment.append(document.createTextNode(value.slice(cursor))); element.replaceChildren(fragment);
  }
  drawConnections(width, height, visible, lowDetail, mounted) {
    const colors = this.paintColors;
    const canvas = $('graph-connections'), dpr = devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.translate(this.view.x, this.view.y); ctx.scale(this.view.scale, this.view.scale);
    ctx.strokeStyle = colors.edge; ctx.lineWidth = Math.min(5, 1.5 / this.view.scale);
    const edgeGroups = new Map();
    for (const e of this.layout.edges) {
      if (Math.max(e.x1, e.x2) < visible.left || Math.min(e.x1, e.x2) > visible.right || Math.max(e.y1, e.y2, e.routeY ?? e.y1) < visible.top || Math.min(e.y1, e.y2, e.routeY ?? e.y1) > visible.bottom) continue;
      const opacity = Math.round((e.opacity ?? 1) * 100) / 100;
      if (!edgeGroups.has(opacity)) edgeGroups.set(opacity, []);
      edgeGroups.get(opacity).push(e);
    }
    for (const [opacity, edges] of edgeGroups) {
      ctx.globalAlpha = opacity; ctx.beginPath();
      for (const e of edges) {
      const middle = (e.x1 + e.x2) / 2;
      ctx.moveTo(e.x1, e.y1);
      if (e.routeY !== null) {
        ctx.lineTo(e.x1 + 12, e.y1); ctx.lineTo(e.x1 + 12, e.routeY); ctx.lineTo(e.x2 - 12, e.routeY); ctx.lineTo(e.x2 - 12, e.y2); ctx.lineTo(e.x2, e.y2);
      } else ctx.bezierCurveTo(middle, e.y1, middle, e.y2, e.x2, e.y2);
      }
      ctx.stroke();
    }
    for (const p of this.layout.cards) if ((lowDetail || !mounted.has(p.card.id)) && intersects(p, visible)) {
      ctx.globalAlpha = p.opacity ?? 1;
      ctx.fillStyle = colors.card; ctx.fillRect(p.x, p.y, p.width, p.height);
      ctx.strokeStyle = this.model.owners.get(this.selectedId) === p.card.id ? colors.accent : colors.border; ctx.strokeRect(p.x, p.y, p.width, p.height);
    }
    ctx.globalAlpha = 1;
  }
  drawMinimap() {
    const colors = this.paintColors;
    const canvas = $('graph-minimap'), ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height; ctx.clearRect(0, 0, w, h);
    if (!this.layout.width) return;
    const scale = Math.min((w - 12) / this.layout.width, (h - 12) / this.layout.height);
    const dx = (w - this.layout.width * scale) / 2 - this.layout.left * scale, dy = (h - this.layout.height * scale) / 2 - this.layout.top * scale;
    this.mini = { scale, dx, dy };
    for (const p of this.layout.cards) {
      ctx.globalAlpha = p.opacity ?? 1;
      ctx.fillStyle = this.model.owners.get(this.selectedId) === p.card.id ? colors.miniFocus : colors.mini;
      ctx.fillRect(dx + p.x * scale, dy + p.y * scale, Math.max(1, p.width * scale), Math.max(1, p.height * scale));
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.accent; ctx.fillStyle = colors.accent + '22'; ctx.lineWidth = 1;
    const x = dx - this.view.x / this.view.scale * scale, y = dy - this.view.y / this.view.scale * scale;
    const width = this.viewport.clientWidth / this.view.scale * scale, height = this.viewport.clientHeight / this.view.scale * scale;
    ctx.fillRect(x, y, width, height); ctx.strokeRect(x, y, width, height);
  }
  showTooltip(target, { force = false, pinned = false } = {}) {
    const node = this.doc?.nodes[Number(target.dataset.graphValue)];
    if (!node || isContainer(node)) return;
    if (this.tooltipPinned && !force) return;
    const value = fullValue(node);
    if (!force && value.length < 40 && target.scrollWidth <= target.clientWidth) return;
    clearTimeout(this.tooltipTimer);
    this.tooltipTimer = setTimeout(() => {
      if (!target.isConnected) return;
      this.tooltipPinned = pinned; this.tooltipNodeId = node.id;
      $('graph-tooltip-path').textContent = node.path; $('graph-tooltip-type').textContent = node.type;
      $('graph-tooltip-value').textContent = value;
      const tooltip = $('graph-tooltip'); tooltip.hidden = false;
      const r = target.getBoundingClientRect(), bounds = tooltip.getBoundingClientRect();
      const card = target.closest('.graph-card').getBoundingClientRect();
      const clamp = p => ({ left: Math.max(10, Math.min(p.left, innerWidth - bounds.width - 10)), top: Math.max(10, Math.min(p.top, innerHeight - bounds.height - 10)) });
      const candidates = [
        { left: r.left, top: card.bottom + 8 }, { left: r.left, top: card.top - bounds.height - 8 },
        { left: card.right + 8, top: r.top }, { left: card.left - bounds.width - 8, top: r.top },
      ].map(clamp);
      const obstacles = Array.from(this.cards.values(), el => el.getBoundingClientRect());
      const position = candidates.find(p => obstacles.every(c => p.left + bounds.width + 3 <= c.left || p.left - 3 >= c.right || p.top + bounds.height + 3 <= c.top || p.top - 3 >= c.bottom)) || candidates[0];
      tooltip.style.left = `${position.left}px`; tooltip.style.top = `${position.top}px`;
      target.setAttribute('aria-controls', 'graph-tooltip');
    }, force ? 0 : 260);
  }
  hideTooltip() { clearTimeout(this.tooltipTimer); $('graph-tooltip').hidden = true; this.tooltipPinned = false; this.tooltipNodeId = null; }
  async copyTooltip(kind) {
    const node = this.doc?.nodes[this.tooltipNodeId];
    if (!node) return;
    const value = kind === 'path' ? node.path : fullValue(node);
    try { await navigator.clipboard.writeText(value); this.onNotice(kind === 'path' ? 'Attribute path copied' : 'Full value copied'); }
    catch {
      $('graph-tooltip').hidden = false; this.tooltipNodeId = node.id; this.tooltipPinned = true;
      const target = $(kind === 'path' ? 'graph-tooltip-path' : 'graph-tooltip-value');
      target.focus({ preventScroll: true });
      const range = document.createRange(); range.selectNodeContents(target); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      this.tooltipPinned = true; this.onNotice('Press Ctrl / ⌘ C to copy the selected text.');
    }
  }
  bind() {
    document.addEventListener('themechange', () => this.schedule());
    $('graph-copy-path').addEventListener('click', () => this.copyTooltip('path'));
    $('graph-copy-value').addEventListener('click', () => this.copyTooltip('value'));
    $('graph-close-tooltip').addEventListener('click', () => { this.hideTooltip(); this.viewport.focus({ preventScroll: true }); });
    document.addEventListener('pointerdown', event => {
      if (!$('graph-tooltip').contains(event.target) && !event.target.closest('[data-graph-value]')) this.hideTooltip();
    });
    $('graph-show-all').addEventListener('click', () => this.showAll());
    $('graph-collapse-all').addEventListener('click', () => { this.advanceMotion(); const from = this.layout, before = new Set(this.collapsed); this.collapsed = initiallyCollapsed(this.model); this.relayout(); this.hideTooltip(); this.transition(from, before, { fit: true }); });
    $('graph-arrange').addEventListener('click', () => { this.advanceMotion(); const from = this.layout, before = new Set(this.collapsed); this.manualPositions.clear(); this.relayout(); this.transition(from, before, { fit: true }); });
    $('graph-fit').addEventListener('click', () => this.fit());
    $('graph-zoom-in').addEventListener('click', () => this.zoom(1.25));
    $('graph-zoom-out').addEventListener('click', () => this.zoom(.8));
    this.viewport.addEventListener('wheel', event => {
      if (!this.model.root) return;
      const body = event.target.closest('.graph-card-body');
      if (body && body.scrollHeight > body.clientHeight && !event.ctrlKey) return;
      event.preventDefault(); const r = this.viewport.getBoundingClientRect();
      this.zoom(Math.exp(-Math.max(-150, Math.min(150, event.deltaY)) * .002), event.clientX - r.left, event.clientY - r.top);
    }, { passive: false });
    this.viewport.addEventListener('pointerdown', event => {
      if (event.button === 0 || event.button === 1) this.interruptNavigation();
      const header = event.target.closest('.graph-card-header');
      if (event.button === 0 && header && !event.target.closest('button')) {
        const id = Number(header.closest('.graph-card').dataset.card), p = this.layout.positions.get(id);
        if (this.layoutMotion) { this.layoutMotion = null; this.manualPositions.set(id, { x: p.x, y: p.y }); this.relayout(); }
        event.preventDefault(); this.hideTooltip();
        this.cardDrag = { id, pointer: event.pointerId, x: event.clientX, y: event.clientY, startX: p.x, startY: p.y, scale: this.view.scale, moved: false };
        this.viewport.setPointerCapture(event.pointerId); return;
      }
      if (event.button !== 1 && (event.button !== 0 || event.target.closest('.graph-card'))) return;
      event.preventDefault(); this.hideTooltip(); this.viewport.focus({ preventScroll: true });
      this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, viewX: this.view.x, viewY: this.view.y };
      this.viewport.setPointerCapture(event.pointerId); this.viewport.classList.add('panning');
    });
    this.viewport.addEventListener('pointermove', event => {
      if (this.cardDrag) {
        const drag = this.cardDrag, dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (Math.hypot(dx, dy) > 3) drag.moved = true;
        if (drag.moved) { this.manualPositions.set(drag.id, { x: drag.startX + dx / drag.scale, y: drag.startY + dy / drag.scale }); this.layoutDirty = true; this.schedule(); }
        return;
      }
      if (!this.drag) return;
      this.view.x = this.drag.viewX + event.clientX - this.drag.x; this.view.y = this.drag.viewY + event.clientY - this.drag.y; this.schedule();
    });
    const endDrag = event => {
      if (event.type === 'blur') this.interruptNavigation();
      if (this.cardDrag) {
        const drag = this.cardDrag; this.cardDrag = null; this.ignoreClickUntil = performance.now() + 50; this.lastDraggedCard = drag.id;
        if (!drag.moved && event.type === 'pointerup') this.toggleCard(drag.id);
        else this.schedule();
      }
      this.drag = null; this.viewport.classList.remove('panning');
    };
    this.viewport.addEventListener('pointerup', endDrag); this.viewport.addEventListener('pointercancel', endDrag); window.addEventListener('blur', endDrag);
    this.viewport.addEventListener('keydown', event => {
      if (event.target !== this.viewport) return;
      if (event.key.startsWith('Arrow')) this.interruptNavigation();
      if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
      if (event.key === '+' || event.key === '=') this.zoom(1.25);
      else if (event.key === '-') this.zoom(.8);
      else if (event.key === '0') this.fit();
      else if (event.key.startsWith('Arrow')) { this.view.x += event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0; this.view.y += event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0; this.schedule(); }
    });
    this.layer.addEventListener('click', event => {
      const copyPath = event.target.closest('[data-copy-node-path]');
      if (copyPath) { this.onCopyPath(Number(copyPath.dataset.copyNodePath), copyPath); return; }
      if (performance.now() < (this.ignoreClickUntil || 0) && event.target.closest('.graph-card-header') && !event.target.closest('button') && Number(event.target.closest('.graph-card').dataset.card) === this.lastDraggedCard) { this.ignoreClickUntil = 0; return; }
      const collapse = event.target.closest('[data-graph-collapse]');
      if (collapse) {
        const id = Number(collapse.dataset.graphCollapse);
        this.toggleCard(id); return;
      }
      const selection = getSelection();
      if (!selection.isCollapsed && this.layer.contains(selection.anchorNode)) return;
      const row = event.target.closest('[data-graph-node]'), card = event.target.closest('[data-card]');
      const id = row ? Number(row.dataset.graphNode) : card ? Number(card.dataset.card) : null;
      const node = this.doc?.nodes[id];
      if (node && isContainer(node) && !node.children.length) { this.toggleCard(id); return; }
      if (id !== null && this.collapsed.has(id)) { this.toggleCard(id); return; }
      if (id !== null) this.onSelect(id);
      const value = event.target.closest('[data-graph-value]');
      if (value) this.showTooltip(value, { force: true, pinned: true });
    });
    this.layer.addEventListener('contextmenu', event => {
      const key = event.target.closest('[data-graph-key]');
      if (!key) return;
      event.preventDefault(); this.hideTooltip(); this.onContext(Number(key.dataset.graphKey), event.clientX, event.clientY, this.viewport);
    });
    this.layer.addEventListener('pointerover', event => { const value = event.target.closest('[data-graph-value]'); if (value && !value.contains(event.relatedTarget)) this.showTooltip(value); });
    this.layer.addEventListener('pointerout', event => {
      const value = event.target.closest('[data-graph-value]');
      if (!value || value.contains(event.relatedTarget)) return;
      if (this.tooltipPinned || $('graph-tooltip').contains(document.activeElement)) return;
      clearTimeout(this.tooltipTimer); this.tooltipTimer = setTimeout(() => this.hideTooltip(), 180);
    });
    this.layer.addEventListener('focusin', event => { if (event.target.dataset.graphValue) this.showTooltip(event.target); });
    this.layer.addEventListener('focusout', event => {
      if (!this.tooltipPinned && !$('graph-tooltip').matches(':hover') && !$('graph-tooltip').contains(event.relatedTarget)) this.hideTooltip();
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') this.hideTooltip(); });
    window.addEventListener('blur', () => this.hideTooltip());
    $('graph-tooltip').addEventListener('pointerenter', () => clearTimeout(this.tooltipTimer));
    $('graph-tooltip').addEventListener('pointerleave', () => { if (!this.tooltipPinned && !$('graph-tooltip').contains(document.activeElement)) this.hideTooltip(); });
    $('graph-minimap-button').addEventListener('click', event => {
      if (!this.mini) return;
      if (event.detail === 0) { this.fit(); return; }
      this.interruptNavigation();
      const r = $('graph-minimap').getBoundingClientRect(), canvas = $('graph-minimap');
      const x = ((event.clientX - r.left) * canvas.width / r.width - this.mini.dx) / this.mini.scale;
      const y = ((event.clientY - r.top) * canvas.height / r.height - this.mini.dy) / this.mini.scale;
      this.animateView({ ...this.view, x: this.viewport.clientWidth / 2 - x * this.view.scale, y: this.viewport.clientHeight / 2 - y * this.view.scale });
    });
  }
}
