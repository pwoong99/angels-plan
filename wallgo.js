// 벽바둑 1 — 규칙 엔진과 판 화면
// 7×7 판, 각자 말 4개(2개는 정해진 자리, 2개는 번갈아 직접 놓기)
// 차례: 말 하나를 0~2칸 이동(상하좌우, 꺾기 가능, 벽·말 통과 불가) → 그 칸의 네 변 중 한 곳에 벽 세우기
// 끝: 서로 다른 색 말이 같은 공간에 없을 때. 내 말만 있는 공간의 칸 수가 점수.
export const N = 7;
const HN = (N - 1) * N;          // 가로 벽(위아래 칸 사이) 개수
export const WALLS = HN + N * (N - 1);
export const START = { a: [1 * N + 1, 5 * N + 5], b: [1 * N + 5, 5 * N + 1] };
export const PLACE_ORDER = ["a", "b", "b", "a"];   // 직접 놓는 순서
export const FIRST_MOVE = "b";                     // 놓기가 끝나면 b가 먼저 움직임
export const other = (s) => (s === "a" ? "b" : "a");

// 칸 사이 벽 번호 (붙어 있지 않으면 -1)
export function wallBetween(c1, c2) {
  const r1 = Math.floor(c1 / N), k1 = c1 % N, r2 = Math.floor(c2 / N), k2 = c2 % N;
  if (k1 === k2 && Math.abs(r1 - r2) === 1) return Math.min(r1, r2) * N + k1;
  if (r1 === r2 && Math.abs(k1 - k2) === 1) return HN + r1 * (N - 1) + Math.min(k1, k2);
  return -1;
}
// 벽 번호 → 양쪽 칸
export function wallCells(w) {
  if (w < HN) { const r = Math.floor(w / N), c = w % N; return [r * N + c, (r + 1) * N + c]; }
  const k = w - HN, r = Math.floor(k / (N - 1)), c = k % (N - 1);
  return [r * N + c, r * N + c + 1];
}
function adj(cell) {
  const r = Math.floor(cell / N), c = cell % N, out = [];
  if (r > 0) out.push(cell - N);
  if (r < N - 1) out.push(cell + N);
  if (c > 0) out.push(cell - 1);
  if (c < N - 1) out.push(cell + 1);
  return out;
}
const blocked = (walls, a, b) => walls[wallBetween(a, b)] !== "0";
export const emptyWalls = () => "0".repeat(WALLS);

export function occupied(stones) {
  const m = new Map();
  for (const s of ["a", "b"]) (stones[s] || []).forEach((c) => { if (c >= 0) m.set(c, s); });
  return m;
}
export function freeWallsAround(cell, walls) {
  return adj(cell).map((n) => wallBetween(cell, n)).filter((w) => walls[w] === "0");
}
// 0~2칸 안에 갈 수 있는 칸 (벽 세울 곳이 있는 칸만)
export function reachable(state, from) {
  const occ = occupied(state.stones);
  const res = new Set([from]);
  let frontier = [from];
  for (let step = 0; step < 2; step++) {
    const next = [];
    for (const x of frontier) for (const y of adj(x)) {
      if (blocked(state.walls, x, y) || (occ.has(y) && y !== from)) continue;
      if (!res.has(y)) { res.add(y); next.push(y); }
    }
    frontier = next;
  }
  return [...res].filter((c) => freeWallsAround(c, state.walls).length > 0);
}
export function legalMoves(state, side) {
  const out = [];
  for (const from of state.stones[side]) {
    if (from < 0) continue;
    for (const to of reachable(state, from)) for (const w of freeWallsAround(to, state.walls)) out.push({ from, to, wall: w });
  }
  return out;
}
export function emptyCells(state) {
  const occ = occupied(state.stones), out = [];
  for (let i = 0; i < N * N; i++) if (!occ.has(i)) out.push(i);
  return out;
}
// 공간 나누기와 점수
export function evaluate(state) {
  const occ = occupied(state.stones);
  const region = new Array(N * N).fill(-1);
  const info = [];
  for (let s = 0; s < N * N; s++) {
    if (region[s] >= 0) continue;
    const id = info.length, cells = [s];
    region[s] = id;
    const sides = new Set();
    for (let i = 0; i < cells.length; i++) {
      const x = cells[i];
      if (occ.has(x)) sides.add(occ.get(x));
      for (const y of adj(x)) if (region[y] < 0 && !blocked(state.walls, x, y)) { region[y] = id; cells.push(y); }
    }
    info.push({ size: cells.length, owner: sides.size === 1 ? [...sides][0] : sides.size === 0 ? null : "mixed" });
  }
  const score = { a: 0, b: 0 };
  info.forEach((g) => { if (g.owner === "a" || g.owner === "b") score[g.owner] += g.size; });
  const done = !info.some((g) => g.owner === "mixed");
  return { done, score, region, info };
}
export function winnerOf(score) { return score.a > score.b ? "a" : score.b > score.a ? "b" : "draw"; }

// 한 수 두기 (새 상태 반환). 잘못된 수면 null
export function applyPlace(m, side, cell) {
  if (m.phase !== "place" || m.turn !== side) return null;
  if (occupied(m.stones).has(cell)) return null;
  const stones = { a: [...m.stones.a], b: [...m.stones.b] };
  const i = stones[side].indexOf(-1);
  if (i < 0) return null;
  stones[side][i] = cell;
  const placeNo = (m.placeNo || 0) + 1;
  const out = { stones, placeNo, moveNo: m.moveNo + 1, last: { place: cell, side } };
  if (placeNo >= PLACE_ORDER.length) { out.phase = "play"; out.turn = FIRST_MOVE; }
  else out.turn = PLACE_ORDER[placeNo];
  return finishTurn(m, out);
}
export function applyMove(m, side, from, to, wall) {
  if (m.phase !== "play" || m.turn !== side) return null;
  const idx = m.stones[side].indexOf(from);
  if (idx < 0 || !reachable(m, from).includes(to) || !freeWallsAround(to, m.walls).includes(wall)) return null;
  const stones = { a: [...m.stones.a], b: [...m.stones.b] };
  stones[side][idx] = to;
  const walls = m.walls.slice(0, wall) + side + m.walls.slice(wall + 1);
  return finishTurn(m, { stones, walls, moveNo: m.moveNo + 1, turn: other(side), last: { from, to, wall, side } });
}
// 차례 넘기기·끝 확인
function finishTurn(m, out) {
  const st = { ...m, ...out };
  if (st.phase === "play") {
    const ev = evaluate(st);
    let ended = ev.done;
    if (!ended && !legalMoves(st, st.turn).length) {
      st.turn = other(st.turn); out.turn = st.turn;
      if (!legalMoves(st, st.turn).length) ended = true;
    }
    if (ended) Object.assign(out, { phase: "done", scoreA: ev.score.a, scoreB: ev.score.b, winner: winnerOf(ev.score) });
  }
  return out;
}
// 시간이 지나면 아무 곳에나 두기
export function randomAction(m) {
  const side = m.turn;
  if (m.phase === "place") {
    const cells = emptyCells(m);
    return applyPlace(m, side, cells[Math.floor(Math.random() * cells.length)]);
  }
  if (m.phase === "play") {
    const mv = legalMoves(m, side);
    if (!mv.length) return finishTurn(m, { turn: other(side), moveNo: m.moveNo + 1 });
    const x = mv[Math.floor(Math.random() * mv.length)];
    return applyMove(m, side, x.from, x.to, x.wall);
  }
  return null;
}
// 교사가 라운드를 끝낼 때: 지금 상태로 점수 매기기
export function forceFinish(m) {
  const ev = evaluate(m);
  return { phase: "done", scoreA: ev.score.a, scoreB: ev.score.b, winner: winnerOf(ev.score), forced: true };
}

// ---------------- 판 화면 ----------------
const S = 60, M = 22, NS = "http://www.w3.org/2000/svg";
export class WallBoard {
  constructor(svg, { onPlace, onMove } = {}) {
    this.svg = svg; this.onPlace = onPlace; this.onMove = onMove;
    this.sel = null; this.dest = null; this.m = null;
    svg.setAttribute("viewBox", `0 0 ${N * S + 2 * M} ${N * S + 2 * M}`);
    svg.addEventListener("click", (e) => this.click(e));
  }
  render(m, me, { active = false, showRegions = false } = {}) {
    if (!this.m || this.m.moveNo !== m.moveNo || this.m.phase !== m.phase) { this.sel = null; this.dest = null; }
    this.m = m; this.me = me; this.active = active; this.showRegions = showRegions;
    this.draw();
  }
  xy(cell) { return [M + (cell % N) * S, M + Math.floor(cell / N) * S]; }
  draw() {
    const m = this.m, svg = this.svg;
    svg.innerHTML = "";
    const add = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); svg.appendChild(el); return el; };
    add("rect", { x: M - 10, y: M - 10, width: N * S + 20, height: N * S + 20, rx: 18, class: "wg-bg" });
    const ev = this.showRegions ? evaluate(m) : null;
    const reach = this.active && this.sel !== null && m.phase === "play" ? new Set(reachable(m, this.sel)) : new Set();
    const canPlace = this.active && m.phase === "place";
    const occ = occupied(m.stones);
    for (let c = 0; c < N * N; c++) {
      const [x, y] = this.xy(c);
      let cls = "wg-cell";
      if (ev) { const o = ev.info[ev.region[c]].owner; if (o === "a" || o === "b") cls += " own-" + o; }
      if (reach.has(c)) cls += " reach";
      if (canPlace && !occ.has(c)) cls += " placeable";
      if (this.dest === c) cls += " dest";
      if (m.last && (m.last.to === c || m.last.place === c)) cls += " last";
      add("rect", { x: x + 2, y: y + 2, width: S - 4, height: S - 4, rx: 10, class: cls, "data-cell": c });
    }
    // 세운 벽
    for (let w = 0; w < WALLS; w++) {
      if (m.walls[w] === "0") continue;
      const [x1, y1, x2, y2] = this.wallLine(w);
      add("line", { x1, y1, x2, y2, class: `wg-wall side-${m.walls[w]}${m.last && m.last.wall === w ? " new" : ""}` });
    }
    // 벽 후보
    if (this.active && this.dest !== null) {
      for (const w of freeWallsAround(this.dest, m.walls)) {
        const [x1, y1, x2, y2] = this.wallLine(w);
        add("line", { x1, y1, x2, y2, class: "wg-cand" });
        add("line", { x1, y1, x2, y2, class: "wg-cand-hit", "data-wall": w });
      }
    }
    // 말
    for (const s of ["a", "b"]) m.stones[s].forEach((c) => {
      if (c < 0) return;
      const shown = this.dest !== null && c === this.sel ? this.dest : c;
      const [x, y] = this.xy(shown);
      const g = add("circle", { cx: x + S / 2, cy: y + S / 2, r: 19, class: `wg-stone side-${s}${s === this.me ? " mine" : ""}${c === this.sel ? " sel" : ""}`, "data-stone": c });
      g.style.pointerEvents = "none";
      if (shown !== c) add("circle", { cx: this.xy(c)[0] + S / 2, cy: this.xy(c)[1] + S / 2, r: 12, class: `wg-ghost side-${s}` });
    });
  }
  wallLine(w) {
    const [c1, c2] = wallCells(w);
    const [x1, y1] = this.xy(c1);
    if (c2 - c1 === N) return [x1 + 4, y1 + S, x1 + S - 4, y1 + S];
    return [x1 + S, y1 + 4, x1 + S, y1 + S - 4];
  }
  click(e) {
    if (!this.active || !this.m) return;
    const m = this.m, t = e.target;
    if (t.dataset.wall !== undefined) {
      const w = Number(t.dataset.wall), from = this.sel, to = this.dest;
      this.sel = this.dest = null;
      this.onMove && this.onMove(from, to, w);
      return;
    }
    if (t.dataset.cell === undefined) return;
    const c = Number(t.dataset.cell);
    if (m.phase === "place") {
      if (!occupied(m.stones).has(c)) this.onPlace && this.onPlace(c);
      return;
    }
    if (m.phase !== "play") return;
    const mine = m.stones[this.me].includes(c);
    if (this.dest !== null && c === this.dest) { this.dest = null; this.draw(); return; }
    if (mine && c !== this.sel) { this.sel = c; this.dest = null; this.draw(); return; }
    if (this.sel !== null && reachable(m, this.sel).includes(c)) { this.dest = c; this.draw(); return; }
    this.sel = this.dest = null; this.draw();
  }
}
