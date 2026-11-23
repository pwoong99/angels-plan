// 대칭 퍼즐 — 조각을 옮기고 돌려서(뒤집기는 안 됨) 선대칭 모양을 만들기
// 문제 = 조각들(칸 좌표) + 처음 놓인 자리(s: [x, y, 돌림]) + 정답 예시(a: 돌리지 않은 조각의 자리)
export const SYM = __DATA__;
export const symInfo = (lv) => { const L = SYM.levels[lv - 1] || SYM.levels[0]; return { name: L.name, k: L.k, size: L.size, tut: L.tut }; };

export const parsePiece = (str) => str.split(" ").map((t) => t.split(".").map(Number));
function norm(cells) {
  const mx = Math.min(...cells.map((c) => c[0])), my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my]);
}
// 시계 방향으로 90°씩 k번
export function rotCells(cells, k) {
  let c = cells.map((p) => [...p]);
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) c = c.map(([x, y]) => [-y, x]);
  return norm(c);
}
const keyOf = (cells) => cells.map(([x, y]) => x + "," + y).sort().join(" ");
// 상태 = 조각마다 [x, y, 돌림] → 문자열 "x,y,r;x,y,r"
export const encodeState = (st) => st.map((p) => p.join(",")).join(";");
export function decodeState(str, n) {
  if (typeof str !== "string" || !str) return null;
  const a = str.split(";").map((t) => t.split(",").map(Number));
  return a.length === n && a.every((p) => p.length === 3 && p.every(Number.isFinite)) ? a : null;
}
export const initialState = (pz) => pz.s.map((p) => [...p]);
// 놓인 칸들
export function placedCells(pz, st) {
  return pz.p.map((ps, i) => { const [ox, oy, r] = st[i]; return rotCells(parsePiece(ps), r).map(([x, y]) => [x + ox, y + oy]); });
}
// 완성 확인: 판 안 · 겹치지 않음 · 모두 붙어 있음 · 선대칭(세로/가로/대각선 축 중 하나)
export function checkSym(pz, st) {
  if (!st) return { ok: false };
  const [W, H] = SYM.ws;
  const pcs = placedCells(pz, st), all = pcs.flat();
  if (all.some(([x, y]) => x < 0 || y < 0 || x >= W || y >= H)) return { ok: false, why: "out" };
  const set = new Set(all.map(([x, y]) => x + "," + y));
  if (set.size !== all.length) return { ok: false, why: "overlap" };
  // 붙어 있는지
  const start = all[0], seen = new Set([start.join(",")]), stack = [start];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = x + dx + "," + (y + dy);
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
    }
  }
  if (seen.size !== all.length) return { ok: false, why: "apart" };
  const n = norm(all), base = keyOf(n);
  const R = [["v", ([x, y]) => [-x, y]], ["h", ([x, y]) => [x, -y]], ["d", ([x, y]) => [y, x]], ["a", ([x, y]) => [-y, -x]]];
  for (const [axis, f] of R) if (keyOf(norm(n.map(f))) === base) {
    const xs = all.map((c) => c[0]), ys = all.map((c) => c[1]);
    return { ok: true, axis, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs) + 1, Math.max(...ys) + 1] };
  }
  return { ok: false, why: "notsym" };
}
// 정답 예시 상태 (작업판 가운데쯤에 놓기)
export function answerState(pz) {
  const [W, H] = SYM.ws;
  const pcs = pz.p.map((ps, i) => parsePiece(ps).map(([x, y]) => [x + pz.a[i][0], y + pz.a[i][1]]));
  const all = pcs.flat(), w = Math.max(...all.map((c) => c[0])) + 1, h = Math.max(...all.map((c) => c[1])) + 1;
  const dx = Math.floor((W - w) / 2), dy = Math.floor((H - h) / 2);
  return pz.a.map(([x, y]) => [x + dx, y + dy, 0]);
}

// ---------------- 판 화면 ----------------
const C = 48, PAD = 8, NS = "http://www.w3.org/2000/svg";
const COLORS = [["#ffd1dc", "#ef6b97"], ["#cfe0ff", "#4f7fe0"], ["#c9f2dd", "#22a374"], ["#ffe7b0", "#e09a00"]];
export class SymBoard {
  constructor(svg, { onChange } = {}) {
    this.svg = svg; this.onChange = onChange; this.locked = false; this.drag = null;
    const [W, H] = SYM.ws;
    svg.setAttribute("viewBox", `${-PAD} ${-PAD} ${W * C + PAD * 2} ${H * C + PAD * 2}`);
    svg.addEventListener("pointerdown", (e) => this.down(e));
    svg.addEventListener("pointermove", (e) => this.move(e));
    svg.addEventListener("pointerup", (e) => this.up(e));
    svg.addEventListener("pointercancel", () => this.cancel());
    svg.style.touchAction = "none";
  }
  load(pz, st, { locked = false, result = null } = {}) {
    this.pz = pz; this.st = (st || initialState(pz)).map((p) => [...p]); this.locked = locked; this.result = result;
    this.order = pz.p.map((_, i) => i);
    this.draw();
  }
  setLocked(v) { this.locked = v; this.draw(); }
  state() { return this.st.map((p) => [...p]); }
  draw() {
    const [W, H] = SYM.ws, svg = this.svg;
    svg.innerHTML = "";
    const add = (tag, a, parent = svg) => { const el = document.createElementNS(NS, tag); for (const k in a) el.setAttribute(k, a[k]); parent.appendChild(el); return el; };
    add("rect", { x: -PAD + 2, y: -PAD + 2, width: W * C + PAD * 2 - 4, height: H * C + PAD * 2 - 4, rx: 18, class: "sym-bg" });
    const grid = add("g", { class: "sym-grid" });
    for (let x = 0; x <= W; x++) add("line", { x1: x * C, y1: 0, x2: x * C, y2: H * C }, grid);
    for (let y = 0; y <= H; y++) add("line", { x1: 0, y1: y * C, x2: W * C, y2: y * C }, grid);
    const res = this.result || checkSym(this.pz, this.st);
    this.pieceEls = [];
    for (const i of this.order) {
      const [ox, oy, r] = this.st[i];
      const cells = rotCells(parsePiece(this.pz.p[i]), r), set = new Set(cells.map((c) => c.join(",")));
      const [fill, line] = COLORS[i % COLORS.length];
      const g = add("g", { class: "sym-piece" + (this.locked ? " locked" : ""), "data-piece": i, transform: `translate(${ox * C} ${oy * C})` });
      for (const [x, y] of cells) add("rect", { x: x * C + 1, y: y * C + 1, width: C - 2, height: C - 2, rx: 6, fill, class: "sym-cell" }, g);
      // 바깥 테두리
      let d = "";
      for (const [x, y] of cells) {
        if (!set.has(x + "," + (y - 1))) d += `M${x * C} ${y * C}h${C}`;
        if (!set.has(x + "," + (y + 1))) d += `M${x * C} ${(y + 1) * C}h${C}`;
        if (!set.has(x - 1 + "," + y)) d += `M${x * C} ${y * C}v${C}`;
        if (!set.has(x + 1 + "," + y)) d += `M${(x + 1) * C} ${y * C}v${C}`;
      }
      add("path", { d, stroke: line, class: "sym-edge" }, g);
      this.pieceEls[i] = g;
    }
    if (res && res.ok) {
      const [x0, y0, x1, y1] = res.box;
      let l;
      if (res.axis === "v") l = [(x0 + x1) / 2, y0 - 0.4, (x0 + x1) / 2, y1 + 0.4];
      else if (res.axis === "h") l = [x0 - 0.4, (y0 + y1) / 2, x1 + 0.4, (y0 + y1) / 2];
      else if (res.axis === "d") l = [x0 - 0.3, y0 - 0.3, x1 + 0.3, y1 + 0.3];
      else l = [x1 + 0.3, y0 - 0.3, x0 - 0.3, y1 + 0.3];
      add("line", { x1: l[0] * C, y1: l[1] * C, x2: l[2] * C, y2: l[3] * C, class: "sym-axis" });
    }
  }
  pt(e) {
    const p = this.svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(this.svg.getScreenCTM().inverse());
  }
  down(e) {
    if (this.locked) return;
    const g = e.target.closest && e.target.closest("[data-piece]");
    if (!g) return;
    const i = Number(g.dataset.piece), p = this.pt(e);
    this.drag = { i, sx: p.x, sy: p.y, moved: false, id: e.pointerId };
    this.order = this.order.filter((k) => k !== i).concat(i);   // 맨 위로
    this.svg.appendChild(g);
    g.classList.add("dragging");
    try { this.svg.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    e.preventDefault();
  }
  move(e) {
    const d = this.drag;
    if (!d) return;
    const p = this.pt(e), dx = p.x - d.sx, dy = p.y - d.sy;
    if (Math.hypot(dx, dy) > 8) d.moved = true;
    const [ox, oy] = this.st[d.i];
    this.pieceEls[d.i].setAttribute("transform", `translate(${ox * C + dx} ${oy * C + dy})`);
  }
  up(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const [W, H] = SYM.ws, s = this.st[d.i];
    if (!d.moved) {
      // 한 번 누르면 시계 방향으로 90° 돌리기 (모양 가운데를 중심으로)
      const before = rotCells(parsePiece(this.pz.p[d.i]), s[2]);
      const after = rotCells(parsePiece(this.pz.p[d.i]), s[2] + 1);
      const bw = Math.max(...before.map((c) => c[0])) + 1, bh = Math.max(...before.map((c) => c[1])) + 1;
      const aw = Math.max(...after.map((c) => c[0])) + 1, ah = Math.max(...after.map((c) => c[1])) + 1;
      s[2] = (s[2] + 1) % 4;
      s[0] = Math.round(s[0] + (bw - aw) / 2); s[1] = Math.round(s[1] + (bh - ah) / 2);
      s[0] = Math.max(0, Math.min(W - aw, s[0])); s[1] = Math.max(0, Math.min(H - ah, s[1]));
    } else {
      const p = this.pt(e);
      const cells = rotCells(parsePiece(this.pz.p[d.i]), s[2]);
      const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
      s[0] = Math.max(0, Math.min(W - w, Math.round(s[0] + (p.x - d.sx) / C)));
      s[1] = Math.max(0, Math.min(H - h, Math.round(s[1] + (p.y - d.sy) / C)));
    }
    this.draw();
    this.onChange && this.onChange(this.state(), checkSym(this.pz, this.st));
  }
  cancel() { if (this.drag) { this.drag = null; this.draw(); } }
}
