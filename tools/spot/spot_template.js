// 달라진 그림 찾기 — 그림 세트, 단계, 다른 곳 위치, 두 그림 판(SpotGame)
// 이 파일은 tools/spot/make_js.py 로 만듦. 다른 곳 위치(BOXES)는 tools/spot/build.py 결과(원본과 바꾼 그림을 픽셀 비교 + 손으로 다듬기)
// 좌표는 1200×896 그림 기준 [x, y, 너비, 높이]

export const SPOT_W = 1200, SPOT_H = 896;
// 세트: 별 1개 = 가까이서 본 작은 장면, 별 3개 = 멀리서 본 넓은 장면
export const SPOT_SETS = [
  { n: 1, name: "빵집 진열대", star: 1 },
  { n: 2, name: "바닷가 모래밭", star: 1 },
  { n: 3, name: "교실", star: 2 },
  { n: 4, name: "숲속 캠핑", star: 2 },
  { n: 5, name: "큰 공원", star: 3 }
];
const BOXES = __BOXES__;
const KINDS = ["easy", "normal", "hard"];
const KIND_NAMES = { easy: "쉬움", normal: "보통", hard: "어려움" };
// 단계 9개: ⭐쉬움 → ⭐⭐⭐어려움. 같은 단계의 세트가 여럿이면 그중 하나가 나옴
export const SPOT_LEVELS = [1, 2, 3].flatMap((star) => KINDS.map((kind) => {
  const keys = SPOT_SETS.filter((s) => s.star === star).map((s) => `${s.n}_${kind}`).filter((k) => BOXES[k]);
  const cnt = keys.map((k) => BOXES[k].length);
  const lo = Math.min(...cnt), hi = Math.max(...cnt);
  return { star, kind, name: `${"⭐".repeat(star)} ${KIND_NAMES[kind]}`, keys, count: lo === hi ? `${lo}곳` : `${lo}~${hi}곳` };
})).filter((L) => L.keys.length);

export const spotSet = (key) => SPOT_SETS.find((s) => s.n === Number(String(key).split("_")[0])) || SPOT_SETS[0];
export const spotBoxes = (key) => BOXES[key] || [];
export const spotImg = (key, which) => { const [n, kind] = String(key).split("_"); return `img/spot/set${n}_${which === "orig" ? "original" : kind}.webp`; };
export const spotTitle = (key) => { const s = spotSet(key), kind = String(key).split("_")[1]; return `${"⭐".repeat(s.star)} ${s.name} · ${KIND_NAMES[kind] || ""}`; };
export function preloadSpot(key) { [spotImg(key, "orig"), spotImg(key, "chg")].forEach((src) => { const im = new Image(); im.src = src; }); }

// 누른 곳(그림 좌표)이 아직 못 찾은 다른 곳인지: 작은 곳도 누르기 쉽게 둘레를 넉넉히
const PAD = 16, MIN_HALF = 30;
export function hitSpot(key, x, y, found) {
  let best = -1, bestD = Infinity;
  spotBoxes(key).forEach((b, i) => {
    if (found.includes(i)) return;
    const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2;
    const hw = Math.max(b[2] / 2 + PAD, MIN_HALF), hh = Math.max(b[3] / 2 + PAD, MIN_HALF);
    if (Math.abs(x - cx) > hw || Math.abs(y - cy) > hh) return;
    const d = Math.hypot((x - cx) / hw, (y - cy) / hh);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// ----- 그림 판 -----
// 게임 방법: ① 원래 그림만 보여 주며 외우는 시간(setView("orig")) → ② 원래 그림은 사라지고 바뀐 그림만(setView("chg"))에서 바뀐 곳 찾기
// 정답 보기·선생님 화면은 두 그림을 나란히(setView("both")). 🔍 확대하면 보이는 그림이 함께 커지고, 끌면 함께 움직임
const NS = "http://www.w3.org/2000/svg";
export class SpotGame {
  constructor(root, opt = {}) {
    this.root = root; this.opt = opt;
    this.key = null; this.found = []; this.locked = false; this.showAll = false;
    this.zoom = 1; this.x0 = 0; this.y0 = 0; this.waitUntil = 0; this.view = "both";
    root.classList.add("spot-play");
    root.innerHTML = "";
    this.views = ["orig", "chg"].map((which) => {
      const v = document.createElement("div");
      v.className = "spot-view " + which;
      v.innerHTML = `<div class="spot-inner"><img alt="" draggable="false"><svg viewBox="0 0 ${SPOT_W} ${SPOT_H}"></svg></div><span class="spot-tag">${which === "orig" ? "원래 그림" : "바뀐 그림"}</span>`;
      root.appendChild(v);
      const o = { which, el: v, inner: v.firstChild, img: v.querySelector("img"), svg: v.querySelector("svg") };
      this.bind(o);
      return o;
    });
  }
  load(key, found = [], o = {}) {
    if (key !== this.key) {
      this.key = key; this.zoom = 1; this.x0 = 0; this.y0 = 0;
      this.views.forEach((v) => (v.img.src = spotImg(key, v.which)));
    }
    this.found = [...found]; this.locked = !!o.locked; this.showAll = !!o.showAll;
    this.root.classList.toggle("locked", this.locked);
    this.place(); this.draw();
  }
  setView(v) {
    this.view = v;
    this.views.forEach((o) => o.el.classList.toggle("hidden", v !== "both" && v !== o.which));
    this.root.classList.toggle("single", v !== "both");
    this.root.dataset.view = v;
  }
  setLocked(b) { this.locked = !!b; this.root.classList.toggle("locked", this.locked); }
  setShowAll(b) { this.showAll = !!b; this.draw(); }
  get total() { return spotBoxes(this.key).length; }
  setZoom(z, cx, cy) {
    z = Math.max(1, Math.min(3, z));
    const vw = SPOT_W / this.zoom, vh = SPOT_H / this.zoom;
    if (cx === undefined) { cx = this.x0 + vw / 2; cy = this.y0 + vh / 2; }
    this.zoom = z;
    this.x0 = cx - SPOT_W / z / 2; this.y0 = cy - SPOT_H / z / 2;
    this.place();
  }
  place() {
    const z = this.zoom;
    this.x0 = Math.max(0, Math.min(SPOT_W - SPOT_W / z, this.x0));
    this.y0 = Math.max(0, Math.min(SPOT_H - SPOT_H / z, this.y0));
    const t = `scale(${z}) translate(${(-this.x0 / SPOT_W) * 100}%, ${(-this.y0 / SPOT_H) * 100}%)`;
    this.views.forEach((v) => (v.inner.style.transform = t));
    this.root.classList.toggle("zoomed", z > 1);
    if (this.opt.onZoom) this.opt.onZoom(z);
  }
  // 화면 위치 → 그림 좌표
  toPic(v, cx, cy) {
    const r = v.el.getBoundingClientRect();
    return { x: this.x0 + ((cx - r.left) / r.width) * (SPOT_W / this.zoom), y: this.y0 + ((cy - r.top) / r.height) * (SPOT_H / this.zoom) };
  }
  bind(v) {
    let st = null;
    v.el.addEventListener("pointerdown", (e) => {
      st = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: this.x0, y0: this.y0, moved: false };
      v.el.setPointerCapture(e.pointerId);
    });
    v.el.addEventListener("pointermove", (e) => {
      if (!st || st.id !== e.pointerId) return;
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.moved && Math.hypot(dx, dy) < 10) return;
      st.moved = true;
      if (this.zoom <= 1) return;
      const r = v.el.getBoundingClientRect(), k = SPOT_W / this.zoom / r.width;
      this.x0 = st.x0 - dx * k; this.y0 = st.y0 - dy * k;
      this.place();
    });
    const up = (e) => {
      if (!st || st.id !== e.pointerId) return;
      const was = st; st = null;
      if (was.moved || e.type === "pointercancel") return;
      this.tap(v, e.clientX, e.clientY);
    };
    v.el.addEventListener("pointerup", up);
    v.el.addEventListener("pointercancel", up);
  }
  tap(v, cx, cy) {
    if (this.locked || !this.key) return;
    if (Date.now() < this.waitUntil) return;
    const p = this.toPic(v, cx, cy);
    const i = hitSpot(this.key, p.x, p.y, this.found);
    if (i >= 0) {
      this.found.push(i);
      this.draw(i);
      if (this.opt.onFind) this.opt.onFind(i, [...this.found]);
      return;
    }
    // 틀린 곳: 빨간 ✕ 와 잠깐 쉬기
    const wait = this.opt.wrongWait === undefined ? 1500 : this.opt.wrongWait;
    this.waitUntil = Date.now() + wait;
    this.views.forEach((w) => {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "spot-x");
      const s = 22 / this.zoom;
      g.innerHTML = `<circle cx="${p.x}" cy="${p.y}" r="${s * 1.5}"/><path d="M${p.x - s} ${p.y - s}L${p.x + s} ${p.y + s}M${p.x + s} ${p.y - s}L${p.x - s} ${p.y + s}"/>`;
      g.style.strokeWidth = 7 / this.zoom;
      w.svg.appendChild(g);
      setTimeout(() => g.remove(), Math.max(700, wait));
    });
    this.root.classList.add("wrong");
    setTimeout(() => this.root.classList.remove("wrong"), Math.max(400, wait));
    if (this.opt.onWrong) this.opt.onWrong(wait);
  }
  draw(fresh) {
    const B = spotBoxes(this.key);
    const ring = (b, cls) => {
      const rx = Math.max(b[2] / 2 + 12, 28), ry = Math.max(b[3] / 2 + 12, 28);
      return `<ellipse class="${cls}" cx="${b[0] + b[2] / 2}" cy="${b[1] + b[3] / 2}" rx="${rx}" ry="${ry}"/>`;
    };
    const html = B.map((b, i) => (this.found.includes(i) ? ring(b, "spot-ok" + (i === fresh ? " fresh" : "")) : this.showAll ? ring(b, "spot-miss") : "")).join("");
    this.views.forEach((v) => (v.svg.innerHTML = html));
  }
}
