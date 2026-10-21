// Wire geometry, ported from the original board (otaku_tracker.html).

export const GRID = 20;
export const snapTo = (v: number) => Math.round(v / GRID) * GRID;

export type Box = { x: number; y: number; w: number; h: number };
// A point on a node's edge plus that edge's outward normal (steers the curve).
export type EdgePoint = { x: number; y: number; nx: number; ny: number };

export const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

// Where a ray from the box center toward (tx, ty) leaves the box.
export function edgePoint(b: Box, tx: number, ty: number): EdgePoint {
  const c = center(b);
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx === 0 && dy === 0) return { x: c.x, y: c.y, nx: 1, ny: 0 };
  const sx = b.w / 2 / (Math.abs(dx) || 1e-6);
  const sy = b.h / 2 / (Math.abs(dy) || 1e-6);
  const t = Math.min(sx, sy);
  const horizontal = sx <= sy;
  return {
    x: c.x + dx * t,
    y: c.y + dy * t,
    nx: horizontal ? Math.sign(dx) : 0,
    ny: horizontal ? 0 : Math.sign(dy),
  };
}

const f = (n: number) => n.toFixed(1);

// Flowing curve whose ends leave along the edge normals.
export function bezierPath(a: EdgePoint, b: EdgePoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const off = Math.min(Math.max(55, Math.hypot(dx, dy) * 0.38), 200);
  const aN = a.nx !== 0 || a.ny !== 0;
  const bN = b.nx !== 0 || b.ny !== 0;
  const c1x = a.x + (aN ? a.nx * off : dx * 0.5);
  const c1y = a.y + (aN ? a.ny * off : 0);
  const c2x = b.x + (bN ? b.nx * off : -dx * 0.5);
  const c2y = b.y + (bN ? b.ny * off : 0);
  return `M${f(a.x)},${f(a.y)} C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(b.x)},${f(b.y)}`;
}

// Orthogonal route with rounded corners, its middle leg on the grid.
export function orthoPath(a: EdgePoint, b: EdgePoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < 2 || ay < 2) return `M${f(a.x)},${f(a.y)} L${f(b.x)},${f(b.y)}`;
  const r = Math.max(0, Math.min(14, ax / 2 - 1, ay / 2 - 1));
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  if (ax >= ay) {
    const mx = snapTo(a.x + dx / 2);
    return `M${f(a.x)},${f(a.y)} H${f(mx - r * sx)} Q${f(mx)},${f(a.y)} ${f(mx)},${f(a.y + r * sy)} ` +
      `V${f(b.y - r * sy)} Q${f(mx)},${f(b.y)} ${f(mx + r * sx)},${f(b.y)} L${f(b.x)},${f(b.y)}`;
  }
  const my = snapTo(a.y + dy / 2);
  return `M${f(a.x)},${f(a.y)} V${f(my - r * sy)} Q${f(a.x)},${f(my)} ${f(a.x + r * sx)},${f(my)} ` +
    `H${f(b.x - r * sx)} Q${f(b.x)},${f(my)} ${f(b.x)},${f(my + r * sy)} L${f(b.x)},${f(b.y)}`;
}
