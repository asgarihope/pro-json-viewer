import { CARD_HEADER, CARD_ROW, CARD_FOOTER } from './graph-model.js';

export const easeMotion = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
export function mixView(from, to, progress) {
  return { x: mix(from.x, to.x, progress), y: mix(from.y, to.y, progress), scale: Math.exp(mix(Math.log(from.scale), Math.log(to.scale), progress)) };
}
export function anchoredView(from, to, view, id) {
  const a = from.positions.get(id), b = to.positions.get(id);
  if (!a || !b) return { ...view };
  return { ...view, x: view.x + (a.x - b.x) * view.scale, y: view.y + (a.y - b.y) * view.scale };
}
export function centeredView(view, layout, id, width, height) {
  const p = layout.positions.get(id);
  if (!p || !width || !height) return { ...view };
  return { ...view, x: width / 2 - (p.x + p.width / 2) * view.scale, y: height / 2 - (p.y + p.height / 2) * view.scale };
}
export function guidedView(view, layout, id, width, height, { scale = view.scale, centerY = null } = {}) {
  const p = layout.positions.get(id);
  if (!p || !width || !height) return { ...view };
  let x = view.x, y = view.y;
  if (scale !== view.scale) {
    x = width / 2 - (p.x + p.width / 2) * scale;
    y = height / 2 - (centerY ?? p.y + p.height / 2) * scale;
  }
  const left = p.x * scale + x, right = (p.x + p.width) * scale + x;
  const top = p.y * scale + y, bottom = (p.y + p.height) * scale + y;
  if (p.width * scale > width - 50) x = width / 2 - (p.x + p.width / 2) * scale;
  else if (left < 24) x += 24 - left;
  else if (right > width - 24) x -= right - width + 24;
  if (p.height * scale > height - 110) y = 45 - p.y * scale;
  else if (top < 45) y += 45 - top;
  else if (bottom > height - 70) y -= bottom - height + 70;
  return { x, y, scale };
}
export function mixLayout(from, to, progress, fromClosed = new Set(), toClosed = new Set()) {
  if (progress >= 1) return to;
  const starts = new Map(), ends = new Map(), positions = new Map(), cards = [], edges = [];
  const ids = new Set([...from.positions.keys(), ...to.positions.keys()]);
  const nearParent = (p, layout) => {
    let parent = p.card.parent;
    while (parent && !layout.positions.has(parent.id)) parent = parent.parent;
    const origin = parent ? layout.positions.get(parent.id) : p;
    return { ...p, x: origin.x + (parent ? 18 : 0), y: origin.y + (parent ? CARD_HEADER : 0), height: CARD_HEADER + CARD_FOOTER, opacity: 0, bodyOpacity: 0 };
  };
  for (const id of ids) {
    const old = from.positions.get(id), next = to.positions.get(id);
    const a = old ? { ...old, opacity: old.opacity ?? 1, bodyOpacity: old.bodyOpacity ?? (fromClosed.has(id) ? 0 : 1) } : nearParent(next, from);
    const b = next ? { ...next, opacity: 1, bodyOpacity: toClosed.has(id) ? 0 : 1 } : nearParent(old, to);
    starts.set(id, a); ends.set(id, b);
    const p = { ...b, x: mix(a.x, b.x, progress), y: mix(a.y, b.y, progress), height: mix(a.height, b.height, progress), opacity: mix(a.opacity, b.opacity, progress), bodyOpacity: mix(a.bodyOpacity, b.bodyOpacity, progress) };
    positions.set(id, p); cards.push(p);
  }
  const oldEdges = new Map(from.edges.map(e => [`${e.source}:${e.target}`, e]));
  const newEdges = new Map(to.edges.map(e => [`${e.source}:${e.target}`, e]));
  const endpoint = (edge, entries) => {
    const source = entries.get(edge.source), target = entries.get(edge.target);
    const row = target.card.parentRow;
    return { ...edge, x1: source.x + source.width, y1: source.y + CARD_HEADER + Math.max(3, Math.min(source.height - CARD_HEADER - CARD_FOOTER - 3, (row + .5) * CARD_ROW)), x2: target.x, y2: target.y + CARD_HEADER + CARD_ROW / 2 };
  };
  for (const key of new Set([...oldEdges.keys(), ...newEdges.keys()])) {
    const old = oldEdges.get(key), next = newEdges.get(key);
    const a = old || endpoint(next, starts), b = next || endpoint(old, ends);
    edges.push({ ...b, x1: mix(a.x1, b.x1, progress), y1: mix(a.y1, b.y1, progress), x2: mix(a.x2, b.x2, progress), y2: mix(a.y2, b.y2, progress), routeY: null, opacity: mix(old ? old.opacity ?? 1 : 0, next ? 1 : 0, progress) });
  }
  const left = cards.length ? cards.reduce((v, p) => Math.min(v, p.x), Infinity) : 0, top = cards.length ? cards.reduce((v, p) => Math.min(v, p.y), Infinity) : 0;
  const right = cards.length ? cards.reduce((v, p) => Math.max(v, p.x + p.width), -Infinity) : 0, bottom = cards.length ? cards.reduce((v, p) => Math.max(v, p.y + p.height), -Infinity) : 0;
  return { cards, positions, edges, left, top, width: cards.length ? right - left : 0, height: cards.length ? bottom - top : 0 };
}
