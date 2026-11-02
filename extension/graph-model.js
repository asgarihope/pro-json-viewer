export const CARD_WIDTH = 222;
export const CARD_HEADER = 36;
export const CARD_ROW = 23;
export const CARD_FOOTER = 25;
export const CARD_VISIBLE_ROWS = 8;
export const COLUMN_GAP = 38;
export const BRANCH_GAP = 22;

export const isContainer = node => node.type === 'object' || node.type === 'array';
export function fullValue(node) {
  if (isContainer(node)) return `${node.type === 'array' ? 'Array' : 'Object'} · ${node.children.length} ${node.type === 'array' ? 'items' : 'keys'}`;
  return node.type === 'string' ? JSON.parse(node.token.raw) : node.token.raw;
}
export function previewValue(node, limit = 80) {
  const value = isContainer(node) ? `${node.type === 'array' ? '[] array' : '{} object'} (${node.children.length})` : node.type === 'string' ? JSON.stringify(fullValue(node)) : node.token.raw;
  return value.length > limit ? value.slice(0, limit - 1) + '…' : value;
}
export function buildGraphModel(doc) {
  const cards = [], byId = new Map(), owners = new Map();
  if (!doc || doc.empty) return { cards, byId, owners, nodes: [], root: null, maxRows: 0 };
  function visit(node, parent = null, index = 0) {
    const card = {
      id: node.id, node, parent, parentRow: index, children: [],
      label: !parent ? 'root' : node.keyToken ? JSON.parse(node.keyToken.raw) : `${parent.label === 'root' ? '' : parent.label}[${index}]`,
      rows: isContainer(node) ? node.children : [node], order: cards.length,
    };
    cards.push(card); byId.set(node.id, card); owners.set(node.id, node.id);
    card.rows.forEach((child, childIndex) => {
      if (child !== node && isContainer(child)) card.children.push(visit(child, card, childIndex));
      else owners.set(child.id, card.id);
    });
    return card;
  }
  const root = visit(doc.root);
  return { cards, byId, owners, nodes: doc.nodes, root, maxRows: cards.reduce((max, card) => Math.max(max, card.rows.length), 0) };
}
export function initiallyCollapsed(model) {
  return new Set(model.cards.filter(card => isContainer(card.node) && card.rows.length).map(card => card.id));
}
export function layoutGraph(model, collapsed = new Set(), { positions: overrides = new Map(), rowScroll = new Map() } = {}) {
  const positions = new Map(), cards = [], edges = [];
  if (!model.root) return { cards, positions, edges, width: 0, height: 0, left: 0, top: 0 };
  const spans = new Map();
  function measure(card) {
    const closed = collapsed.has(card.id);
    const height = CARD_HEADER + (closed ? 29 : Math.max(1, Math.min(CARD_VISIBLE_ROWS, card.rows.length)) * CARD_ROW) + CARD_FOOTER;
    const children = closed ? [] : card.children;
    children.forEach(measure);
    // Every JSON depth uses one shared x coordinate, including nodes whose
    // parents belong to different branches. Manual positions remain opt-in.
    const columns = 1;
    const columnWidths = Array(columns).fill(0), rowHeights = [];
    children.forEach((child, i) => {
      const m = spans.get(child.id), column = i % columns, row = Math.floor(i / columns);
      columnWidths[column] = Math.max(columnWidths[column], m.width);
      rowHeights[row] = Math.max(rowHeights[row] || 0, m.span);
    });
    const childrenWidth = columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columns - 1) * COLUMN_GAP;
    const childrenHeight = rowHeights.reduce((sum, value) => sum + value + BRANCH_GAP, 0);
    spans.set(card.id, { span: Math.max(height, childrenHeight), height, childrenHeight, columns, columnWidths, rowHeights, width: CARD_WIDTH + (children.length ? COLUMN_GAP + childrenWidth : 0) });
  }
  measure(model.root);
  function place(card, x, top) {
    const metrics = spans.get(card.id);
    const position = { card, x, y: top + (metrics.span - metrics.height) / 2, width: CARD_WIDTH, height: metrics.height };
    const manual = overrides.get(card.id);
    if (manual) { position.x = manual.x; position.y = manual.y; }
    positions.set(card.id, position); cards.push(position);
    if (collapsed.has(card.id)) return;
    const gridTop = top + (metrics.span - metrics.childrenHeight) / 2;
    const columnOffsets = []; let nextX = x + CARD_WIDTH + COLUMN_GAP;
    metrics.columnWidths.forEach(width => { columnOffsets.push(nextX); nextX += width + COLUMN_GAP; });
    const rowOffsets = []; let nextY = gridTop + BRANCH_GAP;
    metrics.rowHeights.forEach(height => { rowOffsets.push(nextY); nextY += height + BRANCH_GAP; });
    card.children.forEach((child, i) => {
      const row = Math.floor(i / metrics.columns), column = i % metrics.columns;
      place(child, columnOffsets[column], rowOffsets[row] + (metrics.rowHeights[row] - spans.get(child.id).span) / 2);
      const target = positions.get(child.id), bodyHeight = position.height - CARD_HEADER - CARD_FOOTER;
      const offset = (child.parentRow + .5) * CARD_ROW - (rowScroll.get(card.id) || 0);
      edges.push({ source: card.id, target: child.id, x1: position.x + CARD_WIDTH, y1: position.y + CARD_HEADER + Math.max(5, Math.min(bodyHeight - 5, offset)), x2: target.x, y2: target.y + CARD_HEADER + CARD_ROW / 2,
        routeY: metrics.columns === 1 || overrides.has(card.id) || overrides.has(child.id) ? null : rowOffsets[row] - BRANCH_GAP / 2 });
    });
  }
  place(model.root, 0, 0);
  const left = cards.reduce((value, p) => Math.min(value, p.x), Infinity), top = cards.reduce((value, p) => Math.min(value, p.y), Infinity);
  const right = cards.reduce((value, p) => Math.max(value, p.x + p.width), -Infinity), bottom = cards.reduce((value, p) => Math.max(value, p.y + p.height), -Infinity);
  return { cards, positions, edges, left, top, width: right - left, height: bottom - top };
}
