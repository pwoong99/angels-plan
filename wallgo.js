// 벽바둑 1 — 규칙 엔진과 판 화면 (2~4명)
// 7×7 판. 2명: 각자 말 4개(2개는 정해진 자리, 2개는 번갈아 직접 놓기, 순서 a→b→b→a)
//        3~4명: 각자 말 2개(1개는 정해진 자리, 1개는 거꾸로 순서로 직접 놓기)
// 차례: 말 하나를 1~2칸 이동(상하좌우, 꺾기 가능, 벽·말 통과 불가, 제자리 안 됨 — 모든 말이 갇혔을 때만 제자리) → 그 칸의 네 변 중 한 곳에 벽 세우기
// 끝: 서로 다른 편 말이 같은 공간에 없을 때. 내 말만 있는 공간의 칸 수가 점수, 넓은 순서로 등수.
export const N = 7;
const HN = (N - 1) * N;          // 가로 벽(위아래 칸 사이) 개수
export const WALLS = HN + N * (N - 1);
export const SIDES = ["a", "b", "c", "d"];
export const SIDE_NAMES = { a: "분홍", b: "파랑", c: "초록", d: "노랑" };
const CORNER = { a: 1 * N + 1, b: 1 * N + 5, c: 5 * N + 5, d: 5 * N + 1 };
// 예전(2명) 코드와 맞추기 위한 이름
export const START = { a: [1 * N + 1, 5 * N + 5], b: [1 * N + 5, 5 * N + 1] };
export const PLACE_ORDER = ["a", "b", "b", "a"];

export const sidesOf = (m) => (m && Array.isArray(m.sides) && m.sides.length ? m.sides : ["a", "b"]);
export const nextSide = (m, s) => { const ss = sidesOf(m); return ss[(ss.indexOf(s) + 1) % ss.length]; };
export const other = (s) => (s === "a" ? "b" : "a");
export function placeOrder(m) {
  const ss = sidesOf(m);
  return ss.length === 2 ? ["a", "b", "b", "a"] : [...ss].reverse();
}
// 새 판
export function newMatch(n = 2, extra = {}) {
  const sides = SIDES.slice(0, Math.max(2, Math.min(4, n)));
  const stones = {};
  if (sides.length === 2) { stones.a = [...START.a, -1, -1]; stones.b = [...START.b, -1, -1]; }
  else sides.forEach((s) => (stones[s] = [CORNER[s], -1]));
  return { sides, phase: "place", turn: placeOrder({ sides })[0], placeNo: 0, moveNo: 0, stones, walls: emptyWalls(), ...extra };
}

// 벽바둑 2: 말이 두 종류. 네모(s) = 한 방향으로 곧게 1~2칸(꺾기 X) / 동그라미(r) = 1~2칸, 꺾어도 됨
// 2명: 네모 2 + 동그라미 2 (정해진 자리에 하나씩, 직접 놓는 것도 하나씩) / 3~4명: 네모 1(정해진 자리) + 동그라미 1(직접 놓기)
export const KIND_NAMES = { s: "네모", r: "동그라미" };
export function newMatch2(n = 2, extra = {}) {
  const m = newMatch(n, extra);
  m.v = 2;
  m.kinds = {};
  m.sides.forEach((sd) => (m.kinds[sd] = m.sides.length === 2 ? ["s", "r", "s", "r"] : ["s", "r"]));
  return m;
}
export function kindOf(state, cell) {
  if (!state || state.v !== 2 || !state.kinds) return "r";
  for (const sd of Object.keys(state.stones || {})) {
    const i = (state.stones[sd] || []).indexOf(cell);
    if (i >= 0) return (state.kinds[sd] || [])[i] || "r";
  }
  return "r";
}
// 지금 놓을 말의 종류 (놓기 단계)
export function nextPlaceKind(state, side) {
  if (!state || state.v !== 2) return "r";
  const i = (state.stones[side] || []).indexOf(-1);
  return i >= 0 ? ((state.kinds[side] || [])[i] || "r") : "r";
}

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
  for (const s of Object.keys(stones || {})) (stones[s] || []).forEach((c) => { if (c >= 0) m.set(c, s); });
  return m;
}
export function freeWallsAround(cell, walls) {
  return adj(cell).map((n) => wallBetween(cell, n)).filter((w) => walls[w] === "0");
}
// 갈 수 있는 칸 (벽 세울 곳이 있는 칸만). 벽바둑 2의 네모 말은 곧게 1~2칸
// 제자리는 안 됨: 꼭 1~2칸 움직여야 함. 단, 내 말이 모두 갇혀서 한 칸도 못 움직이면 그때만 제자리에서 벽 세우기
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const ownerOf = (state, cell) => Object.keys(state.stones || {}).find((sd) => (state.stones[sd] || []).includes(cell));
function movesFrom(state, from) { return reachAll(state, from).filter((c) => c !== from); }
export function reachable(state, from) {
  const mv = movesFrom(state, from);
  if (mv.length) return mv;
  const side = ownerOf(state, from);
  const stuck = !side || (state.stones[side] || []).every((c) => c < 0 || !movesFrom(state, c).length);
  return stuck ? reachAll(state, from).filter((c) => c === from) : [];
}
function reachAll(state, from) {
  const occ = occupied(state.stones);
  const res = new Set([from]);
  if (kindOf(state, from) === "s") {
    for (const [dr, dc] of DIRS) {
      let cur = from;
      for (let k = 0; k < 2; k++) {
        const r = Math.floor(cur / N) + dr, c = (cur % N) + dc;
        if (r < 0 || r >= N || c < 0 || c >= N) break;
        const nx = r * N + c;
        if (blocked(state.walls, cur, nx) || occ.has(nx)) break;
        res.add(nx); cur = nx;
      }
    }
    return [...res].filter((c) => freeWallsAround(c, state.walls).length > 0);
  }
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
  for (const from of state.stones[side] || []) {
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
  const score = {};
  sidesOf(state).forEach((sd) => (score[sd] = 0));
  info.forEach((g) => { if (g.owner && g.owner !== "mixed") score[g.owner] = (score[g.owner] || 0) + g.size; });
  const done = !info.some((g) => g.owner === "mixed");
  return { done, score, region, info };
}
// 등수: 나보다 땅이 넓은 편 수 + 1 (같으면 같은 등수)
export function ranksOf(score) {
  const r = {};
  Object.keys(score).forEach((s) => (r[s] = 1 + Object.keys(score).filter((t) => score[t] > score[s]).length));
  return r;
}
export function winnerOf(score) {
  const ks = Object.keys(score), top = Math.max(...ks.map((k) => score[k]));
  const best = ks.filter((k) => score[k] === top);
  return best.length === 1 ? best[0] : "draw";
}
function doneFields(ev) {
  const out = { phase: "done", scores: ev.score, ranks: ranksOf(ev.score), winner: winnerOf(ev.score) };
  if ("a" in ev.score) out.scoreA = ev.score.a;
  if ("b" in ev.score) out.scoreB = ev.score.b;
  return out;
}

// 한 수 두기 (새 상태 반환). 잘못된 수면 null
export function applyPlace(m, side, cell) {
  if (m.phase !== "place" || m.turn !== side) return null;
  if (occupied(m.stones).has(cell)) return null;
  const stones = {};
  for (const s of Object.keys(m.stones)) stones[s] = [...m.stones[s]];
  const i = stones[side].indexOf(-1);
  if (i < 0) return null;
  stones[side][i] = cell;
  const order = placeOrder(m), placeNo = (m.placeNo || 0) + 1;
  const out = { stones, placeNo, moveNo: m.moveNo + 1, last: { place: cell, side } };
  if (placeNo >= order.length) { out.phase = "play"; out.turn = nextSide(m, order[order.length - 1]); }
  else out.turn = order[placeNo];
  return finishTurn(m, out);
}
export function applyMove(m, side, from, to, wall) {
  if (m.phase !== "play" || m.turn !== side) return null;
  const idx = (m.stones[side] || []).indexOf(from);
  if (idx < 0 || !reachable(m, from).includes(to) || !freeWallsAround(to, m.walls).includes(wall)) return null;
  const stones = {};
  for (const s of Object.keys(m.stones)) stones[s] = [...m.stones[s]];
  stones[side][idx] = to;
  const walls = m.walls.slice(0, wall) + side + m.walls.slice(wall + 1);
  return finishTurn(m, { stones, walls, moveNo: m.moveNo + 1, turn: nextSide(m, side), last: { from, to, wall, side } });
}
// 차례 넘기기·끝 확인 (둘 곳이 없는 편은 건너뜀)
function finishTurn(m, out) {
  const st = { ...m, ...out };
  if (st.phase === "play") {
    const ev = evaluate(st);
    let ended = ev.done;
    if (!ended) {
      let t = st.turn, tries = 0;
      while (!legalMoves(st, t).length && tries < sidesOf(st).length) { t = nextSide(st, t); tries++; }
      if (tries >= sidesOf(st).length) ended = true;
      else if (t !== st.turn) { st.turn = t; out.turn = t; }
    }
    if (ended) Object.assign(out, doneFields(ev));
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
    if (!mv.length) return finishTurn(m, { turn: nextSide(m, side), moveNo: m.moveNo + 1 });
    const x = mv[Math.floor(Math.random() * mv.length)];
    return applyMove(m, side, x.from, x.to, x.wall);
  }
  return null;
}
// 교사가 라운드를 끝낼 때: 지금 상태로 점수 매기기
export function forceFinish(m) {
  return { ...doneFields(evaluate(m)), forced: true };
}
// 등수와 인원으로 결과 종류: win(1등) / lose(꼴찌) / draw(그 사이·모두 같음)
export function outcomeOf(m, side) {
  const ranks = m.ranks || ranksOf(m.scores || { a: m.scoreA || 0, b: m.scoreB || 0 });
  const vals = Object.values(ranks), r = ranks[side];
  const worst = Math.max(...vals);
  if (worst === 1) return "draw";
  if (r === 1) return "win";
  if (r === worst) return "lose";
  return "draw";
}

// ---------------- 연습용 AI ----------------
// 땅 어림: 모든 편 말에서 동시에 퍼져 나가 가장 먼저 닿는 칸을 그 편 땅으로 셈 (벽만 막힘)
function territory(st) {
  const ss = sidesOf(st), dist = {};
  for (const s of ss) {
    dist[s] = new Array(N * N).fill(99);
    const q = [];
    (st.stones[s] || []).forEach((c) => { if (c >= 0) { dist[s][c] = 0; q.push(c); } });
    for (let i = 0; i < q.length; i++) {
      const x = q[i];
      for (const y of adj(x)) if (!blocked(st.walls, x, y) && dist[s][y] > dist[s][x] + 1) { dist[s][y] = dist[s][x] + 1; q.push(y); }
    }
  }
  const t = {}; ss.forEach((s) => (t[s] = 0));
  for (let c = 0; c < N * N; c++) {
    let best = 99, who = null;
    for (const s of ss) { if (dist[s][c] < best) { best = dist[s][c]; who = s; } else if (dist[s][c] === best) who = null; }
    if (who) t[who]++;
  }
  return t;
}
function scoreFor(st, side) {
  const ev = evaluate(st);
  const sc = ev.done ? ev.score : territory(st), k = ev.done ? 10 : 1;
  const others = Object.keys(sc).filter((s) => s !== side).map((s) => sc[s]);
  return (sc[side] - Math.max(...others)) * k;
}
// level: "easy"(가끔 실수) / "normal"(좋은 수 몇 개 중에서) / "hard"(가장 좋은 수)
export function botAction(m, level = "normal") {
  const side = m.turn;
  if (level === "easy" && Math.random() < 0.6) return randomAction(m);
  if (level === "easy") level = "normal";
  const pickTop = (cands) => {
    cands.sort((x, y) => y.v - x.v);
    const k = level === "hard" ? 1 : Math.min(3, cands.length);
    return cands[Math.floor(Math.random() * k)];
  };
  if (m.phase === "place") {
    const cands = emptyCells(m).map((c) => {
      const d = applyPlace(m, side, c);
      return { c, v: d ? scoreFor({ ...m, ...d }, side) : -999 };
    });
    return applyPlace(m, side, pickTop(cands).c);
  }
  if (m.phase === "play") {
    const mv = legalMoves(m, side);
    if (!mv.length) return randomAction(m);
    const cands = mv.map((x) => {
      const d = applyMove(m, side, x.from, x.to, x.wall);
      return { x, v: d ? scoreFor({ ...m, ...d }, side) + Math.random() * 0.3 : -999 };
    });
    const best = pickTop(cands).x;
    return applyMove(m, side, best.from, best.to, best.wall);
  }
  return null;
}

// ---------------- 판 화면 ----------------
const S = 60, M = 22, NS = "http://www.w3.org/2000/svg";
let wgSeq = 0;
export class WallBoard {
  constructor(svg, { onPlace, onMove, onHint } = {}) {
    this.svg = svg; this.onPlace = onPlace; this.onMove = onMove; this.onHint = onHint;
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
    this.onStep && this.onStep();
    const m = this.m, svg = this.svg, P = this.uid || (this.uid = "wg" + (++wgSeq) + "-");
    const u = (id) => `url(#${P}${id})`;
    const grad = (id, dir, c) => `<linearGradient id="${P}${id}" x1="0" y1="0" x2="${dir === "v" ? 1 : 0}" y2="${dir === "v" ? 0 : 1}">${c.map((x, i) => `<stop offset="${i / (c.length - 1)}" stop-color="${x}"/>`).join("")}</linearGradient>`;
    const WCOL = { a: ["#ffb3c9", "#ef6b97", "#b93564"], b: ["#a9c6ff", "#4f7fe0", "#2a4fa8"], c: ["#a6ecc9", "#34c38f", "#1f8f63"], d: ["#ffe3a3", "#ffb020", "#c98200"] };
    const SCOL = { a: ["#ffe1ea", "#ff7aa2", "#c23a6b"], b: ["#dfe9ff", "#5b8def", "#2c55b5"], c: ["#dcfbe9", "#34c38f", "#1b7f57"], d: ["#fff3cf", "#ffb020", "#b97700"] };
    svg.innerHTML = `<defs>
      <linearGradient id="${P}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7ff"/><stop offset="1" stop-color="#e3eafb"/></linearGradient>
      <linearGradient id="${P}tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#edf1fb"/></linearGradient>
      ${SIDES.map((sd) => grad(`w${sd}h`, "h", WCOL[sd]) + grad(`w${sd}v`, "v", WCOL[sd])).join("")}
      ${SIDES.map((sd) => `<radialGradient id="${P}s${sd}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${SCOL[sd][0]}"/><stop offset=".45" stop-color="${SCOL[sd][1]}"/><stop offset="1" stop-color="${SCOL[sd][2]}"/></radialGradient>`).join("")}
      <filter id="${P}sh" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx="0" dy="3" stdDeviation="2.2" flood-color="#29304d" flood-opacity=".3"/></filter>
      <filter id="${P}tsh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="1.5" stdDeviation="1" flood-color="#8a98c4" flood-opacity=".35"/></filter>
      <filter id="${P}bsh" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#5b8def" flood-opacity=".2"/></filter>
    </defs>`;
    const add = (tag, attrs, parent = svg) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); parent.appendChild(el); return el; };
    add("rect", { x: M - 12, y: M - 12, width: N * S + 24, height: N * S + 24, rx: 22, fill: u("bg"), filter: u("bsh"), class: "wg-bg" });
    const ev = this.showRegions ? evaluate(m) : null;
    const reach = this.active && this.sel !== null && m.phase === "play" ? new Set(reachable(m, this.sel)) : new Set();
    const canPlace = this.active && m.phase === "place";
    const occ = occupied(m.stones);
    const tiles = add("g", { filter: u("tsh") });
    for (let c = 0; c < N * N; c++) {
      const [x, y] = this.xy(c);
      let cls = "wg-cell";
      if (ev) { const o = ev.info[ev.region[c]].owner; if (o && o !== "mixed") cls += " own-" + o; }
      if (reach.has(c)) cls += " reach";
      if (canPlace && !occ.has(c)) cls += " placeable";
      if (this.dest === c) cls += " dest";
      if (m.last && (m.last.to === c || m.last.place === c)) cls += " last";
      add("rect", { x: x + 3, y: y + 3, width: S - 6, height: S - 6, rx: 11, fill: u("tile"), class: cls, "data-cell": c }, tiles);
    }
    // 도착 칸 표시
    if (this.active && this.dest !== null) {
      const [x, y] = this.xy(this.dest);
      add("circle", { cx: x + S / 2, cy: y + S / 2, r: 25, class: "wg-dest-ring" });
    }
    // 세운 벽 (벽돌 무늬)
    const walls = add("g", { filter: u("sh") });
    for (let w = 0; w < WALLS; w++) {
      if (m.walls[w] === "0") continue;
      const side = m.walls[w], [c1, c2] = wallCells(w), [x, y] = this.xy(c1), T = 12, horiz = c2 - c1 === N;
      const g = add("g", { class: `wg-wall side-${side}${m.last && m.last.wall === w ? " new" : ""}` }, walls);
      if (horiz) {
        add("rect", { x: x + 2, y: y + S - T / 2, width: S - 4, height: T, rx: 4, fill: u(`w${side}h`), class: "wg-brick" }, g);
        [S / 3, (2 * S) / 3].forEach((dx) => add("line", { x1: x + dx, y1: y + S - T / 2 + 2, x2: x + dx, y2: y + S + T / 2 - 2, class: "wg-mortar" }, g));
      } else {
        add("rect", { x: x + S - T / 2, y: y + 2, width: T, height: S - 4, rx: 4, fill: u(`w${side}v`), class: "wg-brick" }, g);
        [S / 3, (2 * S) / 3].forEach((dy) => add("line", { x1: x + S - T / 2 + 2, y1: y + dy, x2: x + S + T / 2 - 2, y2: y + dy, class: "wg-mortar" }, g));
      }
    }
    // 벽 후보
    if (this.active && this.dest !== null) {
      for (const w of freeWallsAround(this.dest, m.walls)) {
        const [x1, y1, x2, y2] = this.wallLine(w);
        add("line", { x1, y1, x2, y2, class: "wg-cand" });
        add("line", { x1, y1, x2, y2, class: "wg-cand-hit", "data-wall": w });
      }
    }
    // 말 (반짝이는 구슬)
    const stones = add("g", { filter: u("sh") });
    for (const s of Object.keys(m.stones)) m.stones[s].forEach((c) => {
      if (c < 0) return;
      const shown = this.dest !== null && c === this.sel ? this.dest : c;
      if (shown !== c) { const [gx, gy] = this.xy(c); add("circle", { cx: gx + S / 2, cy: gy + S / 2, r: 15, class: `wg-ghost side-${s}` }); }
      const [x, y] = this.xy(shown), cx = x + S / 2, cy = y + S / 2;
      const g = add("g", { class: `wg-stone side-${s}${s === this.me ? " mine" : ""}${c === this.sel ? " sel" : ""}`, "data-stone": c }, stones);
      g.style.pointerEvents = "none";
      const sq = kindOf(m, c) === "s";
      if (c === this.sel) add(sq ? "rect" : "circle", sq ? { x: cx - 24, y: cy - 24, width: 48, height: 48, rx: 12, class: "wg-sel-ring" } : { cx, cy, r: 24.5, class: "wg-sel-ring" }, g);
      if (sq) {
        add("rect", { x: cx - 18, y: cy - 18, width: 36, height: 36, rx: 8, fill: u("s" + s), class: "wg-ball wg-square" }, g);
        add("rect", { x: cx - 13, y: cy - 13, width: 13, height: 7, rx: 3.5, class: "wg-shine" }, g);
      } else {
        add("circle", { cx, cy, r: 19, fill: u("s" + s), class: "wg-ball" }, g);
        add("ellipse", { cx: cx - 6, cy: cy - 7.5, rx: 7, ry: 4.5, class: "wg-shine", transform: `rotate(-25 ${cx - 6} ${cy - 7.5})` }, g);
      }
      if (s === this.me) add("circle", { cx: cx + 10.5, cy: cy + 10.5, r: 4.2, class: "wg-me-dot" }, g);
    });
  }
  wallLine(w) {
    const [c1, c2] = wallCells(w);
    const [x1, y1] = this.xy(c1);
    if (c2 - c1 === N) return [x1 + 4, y1 + S, x1 + S - 4, y1 + S];
    return [x1 + S, y1 + 4, x1 + S, y1 + S - 4];
  }
  // 화면 좌표 → 판 좌표
  toLocal(e) {
    const p = this.svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(this.svg.getScreenCTM().inverse());
  }
  cellAt(x, y) {
    const c = Math.floor((x - M) / S), r = Math.floor((y - M) / S);
    return c >= 0 && c < N && r >= 0 && r < N ? r * N + c : null;
  }
  // 도착 칸이 정해진 뒤: 그 칸 안에서 누른 쪽 변, 또는 옆 칸을 누르면 그쪽 벽
  wallFromTap(x, y) {
    const d = this.dest, free = freeWallsAround(d, this.m.walls);
    const cell = this.cellAt(x, y);
    if (cell === null) return null;
    if (cell !== d) { const w = wallBetween(d, cell); return free.includes(w) ? w : null; }
    const [cx, cy] = this.xy(d), dx = x - (cx + S / 2), dy = y - (cy + S / 2);
    const order = [];
    if (Math.abs(dx) > Math.abs(dy)) order.push(dx > 0 ? d + 1 : d - 1, dy > 0 ? d + N : d - N);
    else order.push(dy > 0 ? d + N : d - N, dx > 0 ? d + 1 : d - 1);
    for (const n of order) { const w = wallBetween(d, n); if (w >= 0 && free.includes(w)) return w; }
    return free.length === 1 ? free[0] : null;
  }
  click(e) {
    if (!this.active || !this.m) return;
    const m = this.m, t = e.target;
    const { x, y } = this.toLocal(e);
    if (t.dataset && t.dataset.wall !== undefined) return this.fireMove(Number(t.dataset.wall));
    const c = this.cellAt(x, y);
    if (m.phase === "place") {
      if (c !== null && !occupied(m.stones).has(c)) this.onPlace && this.onPlace(c);
      return;
    }
    if (m.phase !== "play") return;
    const mineAt = (cell) => cell !== null && m.stones[this.me].includes(cell);
    if (this.dest !== null) {
      if (mineAt(c) && c !== this.sel) { this.sel = c; this.dest = null; this.draw(); return; }
      if (c === this.sel && this.sel !== this.dest) { this.dest = null; this.draw(); return; }
      const w = this.wallFromTap(x, y);
      if (w !== null) return this.fireMove(w);
      if (this.sel !== null && c !== null && reachable(m, this.sel).includes(c)) { this.dest = c; this.draw(); return; }
      this.onHint && this.onHint("벽을 세울 쪽(주황 점선)을 눌러요");
      return;
    }
    if (this.sel !== null && c !== null && reachable(m, this.sel).includes(c)) { this.dest = c; this.draw(); return; }   // 모두 갇혔을 때는 고른 말을 한 번 더 누르면 제자리
    if (mineAt(c)) {
      this.sel = c; this.dest = null; this.draw();
      if (!reachable(m, c).length) this.onHint && this.onHint("이 말은 움직일 곳이 없어요. 다른 말을 골라요");
      return;
    }
    if (this.sel === null) this.onHint && this.onHint("먼저 내 말(점이 찍힌 구슬)을 눌러요");
    this.sel = this.dest = null; this.draw();
  }
  fireMove(w) {
    const from = this.sel, to = this.dest;
    this.sel = this.dest = null;
    this.onMove && this.onMove(from, to, w);
  }
}
