// 울타리치기 게임판 — 그리기, 정답 판정, 저장용 문자열 변환
const S = 60;   // 칸 크기
const M = 34;   // 바깥 여백
const NS = "http://www.w3.org/2000/svg";
let uidSeq = 0;

export function edgeCount(w, h) { return (h + 1) * w + h * (w + 1); }

function geo(w, h) {
  const HE = (h + 1) * w;
  return {
    HE,
    hIdx: (r, c) => r * w + c,
    vIdx: (r, c) => HE + r * (w + 1) + c,
    ends(e) {
      if (e < HE) { const r = Math.floor(e / w), c = e % w; return [[r, c], [r, c + 1]]; }
      const k = e - HE, r = Math.floor(k / (w + 1)), c = k % (w + 1);
      return [[r, c], [r + 1, c]];
    },
    cellEdges(r, c) {
      return [r * w + c, (r + 1) * w + c, HE + r * (w + 1) + c, HE + r * (w + 1) + c + 1];
    }
  };
}

export function encodeEdges(set, w, h) {
  const n = edgeCount(w, h);
  let s = "";
  for (let i = 0; i < n; i++) s += set.has(i) ? "1" : "0";
  return s;
}

export function decodeEdges(str) {
  const set = new Set();
  for (let i = 0; i < (str || "").length; i++) if (str[i] === "1") set.add(i);
  return set;
}

// 퍼즐 묶음의 정답(16진수) → 선 집합
export function decodeAnswer(hex) {
  const bits = BigInt("0x" + hex).toString(2).slice(1);
  return decodeEdges(bits);
}

// 정답 판정: 모든 숫자 조건 + 끊기지 않는 하나의 닫힌 울타리
export function checkSolution(w, h, clues, set) {
  if (!set.size) return false;
  const g = geo(w, h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = clues[r * w + c];
    if (ch === "." || ch === undefined) continue;
    const n = g.cellEdges(r, c).filter((e) => set.has(e)).length;
    if (n !== Number(ch)) return false;
  }
  const adj = new Map();
  for (const e of set) {
    const [a, b] = g.ends(e).map(([r, c]) => r * (w + 1) + c);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  }
  for (const list of adj.values()) if (list.length !== 2) return false;
  const start = adj.keys().next().value;
  const seen = new Set([start]); const st = [start];
  while (st.length) {
    const x = st.pop();
    for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); st.push(y); }
  }
  return seen.size === adj.size;
}

// 연습용 진단: 무엇이 틀렸는지 알려 줌
export function diagnose(w, h, clues, set) {
  const g = geo(w, h);
  const bad = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = clues[r * w + c];
    if (ch === "." || ch === undefined) continue;
    if (g.cellEdges(r, c).filter((e) => set.has(e)).length !== Number(ch)) bad.push(r * w + c);
  }
  if (!set.size) return { ok: false, reason: "empty", bad };
  const deg = new Map();
  for (const e of set) for (const [r, c] of g.ends(e)) {
    const k = r * (w + 1) + c; deg.set(k, (deg.get(k) || 0) + 1);
  }
  const degs = [...deg.values()];
  if (degs.some((d) => d > 2)) return { ok: false, reason: "branch", bad };
  if (degs.some((d) => d === 1)) return { ok: false, reason: "open", bad };
  if (bad.length) return { ok: false, reason: "clue", bad };
  if (!checkSolution(w, h, clues, set)) return { ok: false, reason: "multi", bad };
  return { ok: true, reason: "ok", bad };
}

// 울타리 안쪽 칸 (왼쪽 세로 울타리 개수가 홀수면 안쪽)
export function insideCells(w, h, set) {
  const g = geo(w, h), out = [];
  for (let r = 0; r < h; r++) {
    let n = 0;
    for (let c = 0; c < w; c++) {
      if (set.has(g.vIdx(r, c))) n++;
      if (n % 2) out.push([r, c]);
    }
  }
  return out;
}

export class Board {
  constructor(svg, { interactive = false, onChange = null } = {}) {
    this.svg = svg;
    this.interactive = interactive;
    this.onChange = onChange;
    this.mode = "draw";
    this.locked = false;
    this.edges = new Set();
    this.answer = null;
    this.fill = false;
    this.bad = [];
    if (interactive) this.bindPointer();
  }

  load(w, h, clues, edges = new Set()) {
    this.w = w; this.h = h; this.clues = clues;
    this.g = geo(w, h);
    this.edges = new Set(edges);
    this.answer = null;
    this.fill = false;
    this.bad = [];
    this.svg.setAttribute("viewBox", `0 0 ${w * S + 2 * M} ${h * S + 2 * M}`);
    this.draw();
  }

  setEdges(set) { this.edges = new Set(set); this.draw(); }
  setMode(m) { this.mode = m; this.svg.classList.toggle("erase-mode", m === "erase"); }
  setLocked(v) { this.locked = v; this.svg.classList.toggle("locked", v); }
  showAnswer(set) { this.answer = set; this.fill = !!set; this.draw(); }
  setFill(v) { this.fill = v; this.draw(); }
  setBad(list) { this.bad = list || []; this.draw(); }
  clear() {
    if (!this.edges.size || this.locked) return;
    this.edges.clear(); this.fill = false; this.bad = []; this.draw(); this.onChange && this.onChange(this.edges);
  }

  pos(r, c) { return [M + c * S, M + r * S]; }

  draw() {
    const { w, h, g } = this;
    if (!g) return;
    const svg = this.svg, P = this.uid || (this.uid = "fb" + (++uidSeq) + "-");
    const u = (id) => `url(#${P}${id})`;
    // 나무 울타리·풀밭 무늬
    svg.innerHTML = `<defs>
      <linearGradient id="${P}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf5"/><stop offset="1" stop-color="#f1f7e9"/></linearGradient>
      <linearGradient id="${P}wh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3c27f"/><stop offset=".45" stop-color="#d08d47"/><stop offset="1" stop-color="#94592a"/></linearGradient>
      <linearGradient id="${P}wv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f3c27f"/><stop offset=".45" stop-color="#d08d47"/><stop offset="1" stop-color="#94592a"/></linearGradient>
      <linearGradient id="${P}gh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ce8bd"/><stop offset=".5" stop-color="#34c38f"/><stop offset="1" stop-color="#1f8f63"/></linearGradient>
      <linearGradient id="${P}gv" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9ce8bd"/><stop offset=".5" stop-color="#34c38f"/><stop offset="1" stop-color="#1f8f63"/></linearGradient>
      <radialGradient id="${P}post" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#c58d5a"/><stop offset=".55" stop-color="#8a5a31"/><stop offset="1" stop-color="#5a3518"/></radialGradient>
      <radialGradient id="${P}cell" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#f6f3e8"/></radialGradient>
      <pattern id="${P}grass" width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#c9f0d4"/>
        <path d="M3 13l1.6-4.5 1.6 4.5M10 7l1.3-3.5 1.3 3.5" stroke="#86d19f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <circle cx="13" cy="13" r="1.1" fill="#fff4a8"/>
      </pattern>
      <filter id="${P}sh" x="-30%" y="-60%" width="160%" height="220%"><feDropShadow dx="0" dy="2.2" stdDeviation="1.6" flood-color="#5a3518" flood-opacity=".35"/></filter>
      <filter id="${P}bsh" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#8a6a3a" flood-opacity=".18"/></filter>
      <filter id="${P}tsh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1" flood-color="#3b3f58" flood-opacity=".18"/></filter>
    </defs>`;
    const add = (tag, attrs, parent = svg) => {
      const el = document.createElementNS(NS, tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      parent.appendChild(el);
      return el;
    };
    add("rect", { x: M - 22, y: M - 22, width: w * S + 44, height: h * S + 44, rx: 24, fill: u("bg"), filter: u("bsh"), class: "bd-bg" });
    const total = edgeCount(w, h);
    const show = this.answer || this.edges;
    // 칸 (모눈 타일)
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const [x, y] = this.pos(r, c);
      add("rect", { x: x + 4, y: y + 4, width: S - 8, height: S - 8, rx: 10, fill: u("cell"), class: "bd-cell" });
    }
    // 울타리 안쪽 풀밭 + 양
    if (this.fill) {
      const cells = insideCells(w, h, show);
      cells.forEach(([r, c]) => {
        const [x, y] = this.pos(r, c);
        add("rect", { x: x, y: y, width: S, height: S, fill: u("grass"), class: "bd-in" });
      });
      const free = cells.filter(([r, c]) => this.clues[r * w + c] === ".");
      if (free.length) {
        const [x, y] = this.pos(free[0][0], free[0][1]);
        const us = add("use", { href: "#sheep", x: x + 5, y: y + 4, width: S - 10, height: S - 8, class: "bd-sheep" });
        us.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#sheep");
      }
    }
    // 빈 자리(연한 점선)
    for (let e = 0; e < total; e++) {
      if (show.has(e)) continue;
      const [[r1, c1], [r2, c2]] = g.ends(e);
      const [x1, y1] = this.pos(r1, c1), [x2, y2] = this.pos(r2, c2);
      add("line", { x1, y1, x2, y2, class: "bd-slot" });
    }
    // 숫자 (흰 테두리로 또렷하게)
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const ch = this.clues[r * w + c];
      if (ch === ".") continue;
      const n = g.cellEdges(r, c).filter((e) => show.has(e)).length;
      let cls = "bd-clue n" + ch;
      if (!this.answer) {
        if (n > Number(ch)) cls += " over";
        else if (n === Number(ch) && n > 0) cls += " done";
      }
      if (this.bad.includes(r * w + c)) cls += " bad";
      const [x, y] = this.pos(r + 0.5, c + 0.5);
      const t = add("text", { x, y, class: cls, filter: u("tsh") });
      t.textContent = ch;
    }
    // 나무 울타리 판자 (정답은 초록 울타리)
    const ans = !!this.answer;
    const rails = add("g", { filter: u("sh"), class: "bd-rails" + (ans ? " answer" : "") });
    const T = 13;
    for (const e of show) {
      const [[r1, c1], [r2, c2]] = g.ends(e);
      const [x1, y1] = this.pos(r1, c1), [x2, y2] = this.pos(r2, c2);
      if (y1 === y2) {
        add("rect", { x: x1 - 2, y: y1 - T / 2, width: x2 - x1 + 4, height: T, rx: T / 2, fill: u(ans ? "gh" : "wh"), class: "bd-edge" }, rails);
        add("line", { x1: x1 + 12, y1: y1 - 2, x2: x2 - 12, y2: y1 - 2, class: "bd-grain" }, rails);
      } else {
        add("rect", { x: x1 - T / 2, y: y1 - 2, width: T, height: y2 - y1 + 4, rx: T / 2, fill: u(ans ? "gv" : "wv"), class: "bd-edge" }, rails);
        add("line", { x1: x1 - 2, y1: y1 + 12, x2: x1 - 2, y2: y2 - 12, class: "bd-grain" }, rails);
      }
    }
    // 울타리 기둥(점)
    const posts = add("g", { filter: u("sh") });
    for (let r = 0; r <= h; r++) for (let c = 0; c <= w; c++) {
      const [x, y] = this.pos(r, c);
      add("circle", { cx: x, cy: y, r: 9, fill: u("post"), class: "bd-dot" }, posts);
      add("circle", { cx: x - 2.8, cy: y - 3, r: 2.6, class: "bd-dot-hi" }, posts);
    }
  }

  // ---------- 터치 입력 ----------
  toLocal(ev) {
    const p = this.svg.createSVGPoint();
    p.x = ev.clientX; p.y = ev.clientY;
    return p.matrixTransform(this.svg.getScreenCTM().inverse());
  }

  nearestEdge(x, y) {
    const { w, h, g } = this;
    let best = null, bd = 26;
    const hr = Math.round((y - M) / S), hc = Math.floor((x - M) / S);
    if (hr >= 0 && hr <= h && hc >= 0 && hc < w) {
      const d = Math.abs(y - (M + hr * S));
      if (d < bd) { bd = d; best = g.hIdx(hr, hc); }
    }
    const vc = Math.round((x - M) / S), vr = Math.floor((y - M) / S);
    if (vc >= 0 && vc <= w && vr >= 0 && vr < h) {
      const d = Math.abs(x - (M + vc * S));
      if (d < bd) { bd = d; best = g.vIdx(vr, vc); }
    }
    return best;
  }

  nearestDot(x, y) {
    const r = Math.round((y - M) / S), c = Math.round((x - M) / S);
    if (r < 0 || r > this.h || c < 0 || c > this.w) return null;
    const [px, py] = this.pos(r, c);
    return Math.hypot(px - x, py - y) <= 21 ? [r, c] : null;
  }

  edgeBetween(a, b) {
    const [r1, c1] = a, [r2, c2] = b;
    if (r1 === r2 && Math.abs(c1 - c2) === 1) return this.g.hIdx(r1, Math.min(c1, c2));
    if (c1 === c2 && Math.abs(r1 - r2) === 1) return this.g.vIdx(Math.min(r1, r2), c1);
    return null;
  }

  apply(e) {
    if (e === null || e === undefined) return false;
    this.bad = []; this.fill = false;
    if (this.mode === "draw") {
      if (this.edges.has(e)) return false;
      this.edges.add(e);
    } else {
      if (!this.edges.has(e)) return false;
      this.edges.delete(e);
    }
    return true;
  }

  bindPointer() {
    const svg = this.svg;
    let st = null;
    svg.addEventListener("pointerdown", (ev) => {
      if (this.locked || !this.g) return;
      ev.preventDefault();
      svg.setPointerCapture(ev.pointerId);
      const p = this.toLocal(ev);
      st = { id: ev.pointerId, x: p.x, y: p.y, moved: false, dot: this.nearestDot(p.x, p.y), changed: false };
    });
    svg.addEventListener("pointermove", (ev) => {
      if (!st || ev.pointerId !== st.id || this.locked) return;
      const p = this.toLocal(ev);
      if (!st.moved && Math.hypot(p.x - st.x, p.y - st.y) > 14) st.moved = true;
      if (!st.moved) return;
      const d = this.nearestDot(p.x, p.y);
      if (!d) return;
      if (st.dot && (d[0] !== st.dot[0] || d[1] !== st.dot[1])) {
        const e = this.edgeBetween(st.dot, d);
        if (this.apply(e)) { st.changed = true; this.draw(); }
      }
      st.dot = d;
    });
    const end = (ev) => {
      if (!st || ev.pointerId !== st.id) return;
      if (!st.moved && !this.locked) {
        const p = this.toLocal(ev);
        if (this.apply(this.nearestEdge(p.x, p.y))) { st.changed = true; this.draw(); }
      }
      if (st.changed && this.onChange) this.onChange(this.edges);
      st = null;
    };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", (ev) => { if (st && st.changed && this.onChange) this.onChange(this.edges); st = null; });
  }
}
