// 엔젤스 플랜 — 우리 반 두뇌 게임 대회 (GitHub Pages + Firebase angels-plan 프로젝트)
// 게임: 울타리치기(개인 시간 경쟁) · 벽바둑 1(2명씩 1:1 대결)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, collection, getDoc, getDocs, getDocFromServer, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, increment, arrayUnion, writeBatch, deleteField, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { PUZZLES } from "./puzzles.js";
import { Board, checkSolution, diagnose, encodeEdges, decodeEdges, decodeAnswer } from "./board.js";
import * as WG from "./wallgo.js";
import { avatarSVG, PARTS, PART_ORDER, OPTION_LABELS, randomAvatar, cleanAvatar, wingInfo, WING_LEVELS } from "./avatar.js";

const VERSION = "v1.4";

const firebaseConfig = {
  apiKey: "AIzaSyCcHVmlC3jmTnECeB4NwKh65TdXhuNt80w",
  authDomain: "angels-plan.firebaseapp.com",
  projectId: "angels-plan",
  storageBucket: "angels-plan.firebasestorage.app",
  messagingSenderId: "138666108538",
  appId: "1:138666108538:web:62a65f00e62829dcb93dc3"
};
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);

// ---------- 게임 목록 ----------
const GAMES = {
  fence: { name: "울타리치기", icon: "🧩", desc: "숫자를 보고 하나의 닫힌 울타리 완성하기 · 개인전", team: false },
  wallgo: { name: "벽바둑 1", icon: "🧱", desc: "2명씩 짝지어 1:1 대결 · 벽을 세워 내 땅 넓히기", team: false }
};
// 울타리치기 단계: 연습1·연습2(3×3) → 1~8단계(4×4~7×7)
const DEFAULT_TIMES = [60, 90, 120, 120, 180, 180, 240, 240, 360, 360];
// 울타리치기 점수: 맞히면 기본 점수 + 빠른 순서 보너스(1등 +top … top등 +1), 단계 배율을 곱함
const DEFAULT_PTS = { base: 10, top: 5, mult: true };
const LEVEL_MULT = [0.5, 0.5, 1, 1, 1.5, 1.5, 2, 2, 3, 3];
function calcPoints(P, rank, level) {
  const bonus = Math.max(0, P.top - (rank - 1));
  const m = P.mult ? (LEVEL_MULT[level - 1] || 1) : 1;
  return Math.round((P.base + bonus) * m);
}
// 벽바둑 점수와 한 수 시간
const DEFAULT_WG = { win: 15, draw: 8, lose: 3 };
const DEFAULT_TURN = 30;
const GRACE_MS = 1500;
const EST = { serverTimestamps: "estimate" };
// 팀
const TEAMS = [null,
  { name: "빨강 천사팀", icon: "🔴" }, { name: "파랑 천사팀", icon: "🔵" }, { name: "노랑 천사팀", icon: "🟡" },
  { name: "초록 천사팀", icon: "🟢" }, { name: "보라 천사팀", icon: "🟣" }, { name: "주황 천사팀", icon: "🟠" }];

// ---------- 공통 도구 ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const levelInfo = (lv) => {
  const L = PUZZLES[lv - 1] || PUZZLES[0];
  return { name: L.name, size: `${L.w}×${L.h}`, kind: L.kind, tut: !!L.tut };
};
const levelLabel = (lv) => { const i = levelInfo(lv); return `${i.name} · ${i.size} · ${i.kind}`; };
const answerOf = (r) => {
  const L = r && PUZZLES[r.level - 1], P = L && L.puzzles[r.pid];
  return P && r.puzzle && P.c === r.puzzle.c ? decodeAnswer(P.a) : null;
};
const fmtTime = (sec) => { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
const ms = (ts) => (ts && typeof ts.toMillis === "function" ? ts.toMillis() : null);
const teamOf = (p, count) => (p && p.team >= 1 && p.team <= count ? p.team : 0);
const teamLabel = (t) => (TEAMS[t] ? `${TEAMS[t].icon} ${TEAMS[t].name}` : "");
document.querySelectorAll(".ver").forEach((el) => (el.textContent = VERSION));

// 배경의 수학 기호
(() => {
  const syms = ["+", "−", "×", "÷", "=", "π", "√", "∑", "%", "∞", "△", "□", "○", "1", "2", "3", "0", "≠", "<", ">"];
  const colors = ["#5b8def", "#ff7aa2", "#34c38f", "#ff9f43", "#a07cff"];
  const bg = $("mathBg");
  for (let i = 0; i < 26; i++) {
    const sp = document.createElement("span");
    sp.textContent = syms[i % syms.length];
    sp.style.left = Math.random() * 96 + "%";
    sp.style.top = Math.random() * 94 + "%";
    sp.style.fontSize = 22 + Math.random() * 34 + "px";
    sp.style.color = colors[i % colors.length];
    sp.style.animationDelay = -Math.random() * 7 + "s";
    bg.appendChild(sp);
  }
})();

function confetti() {
  const box = $("confetti");
  const colors = ["#5b8def", "#ff7aa2", "#34c38f", "#ffd166", "#ff9f43", "#a07cff"];
  for (let i = 0; i < 46; i++) {
    const el = document.createElement("i");
    if (i % 4 === 0) { el.className = "sym"; el.textContent = ["+", "×", "=", "π", "★"][i % 5]; el.style.color = colors[i % colors.length]; }
    else el.style.background = colors[i % colors.length];
    el.style.left = Math.random() * 100 + "vw";
    el.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
    el.style.animationDelay = Math.random() * .4 + "s";
    box.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }
}
function mascotMood(el, mood) {
  if (!el) return;
  el.classList.remove("jump", "sad", "bob");
  void el.getBoundingClientRect();
  el.classList.add(mood === "happy" ? "jump" : mood === "sad" ? "sad" : "bob");
  if (mood !== "idle") setTimeout(() => { el.classList.remove("jump", "sad"); el.classList.add("bob"); }, 2000);
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}
function confirmBox(msg, yes = "확인") {
  return new Promise((resolve) => {
    $("confirmMsg").textContent = msg;
    $("confirmYes").textContent = yes;
    $("confirmModal").classList.remove("hidden");
    const done = (v) => {
      $("confirmModal").classList.add("hidden");
      $("confirmYes").onclick = $("confirmNo").onclick = null;
      resolve(v);
    };
    $("confirmYes").onclick = () => done(true);
    $("confirmNo").onclick = () => done(false);
  });
}
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
}

// 서버 시계와 내 기기 시계 차이
let clockOffset = 0;
const now = () => Date.now() + clockOffset;
async function syncClock(ref, field) {
  try {
    const t0 = Date.now();
    await updateDoc(ref, { [field]: serverTimestamp() });
    const t1 = Date.now();
    const snap = await getDocFromServer(ref);
    const t = ms(snap.get(field));
    if (t) clockOffset = t - (t0 + t1) / 2;
  } catch (e) { console.warn("시계 맞추기 실패", e); }
}

function ranked(players) {
  const list = [...players].sort((a, b) => (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name, "ko"));
  let prev = null, rank = 0;
  list.forEach((p, i) => { if ((p.score || 0) !== prev) { rank = i + 1; prev = p.score || 0; } p.rank = rank; });
  return list;
}
// 팀 점수 = 팀원 점수 평균
function teamRanking(players, count) {
  const out = [];
  for (let t = 1; t <= count; t++) {
    const mem = players.filter((p) => teamOf(p, count) === t);
    const sum = mem.reduce((a, p) => a + (p.score || 0), 0);
    out.push({ t, n: mem.length, avg: mem.length ? Math.round((sum / mem.length) * 10) / 10 : 0 });
  }
  out.sort((a, b) => b.avg - a.avg);
  let prev = null, rank = 0;
  out.forEach((x, i) => { if (x.avg !== prev) { rank = i + 1; prev = x.avg; } x.rank = rank; });
  return out;
}

function resultText(res) {
  if (!res) return null;
  if (res.game === "wallgo") {
    const sc = res.my !== undefined ? ` (${res.my}:${res.opp})` : "";
    if (res.outcome === "bye") return { ok: true, big: "🍀 부전승!", sm: `+${res.points}점 · 이번 라운드는 짝이 없어서 승리로 쳐요` };
    if (res.outcome === "win") return { ok: true, big: `🏆 승리!${sc}`, sm: `${esc(res.vs || "")}에게 이겼어요 · +${res.points}점` };
    if (res.outcome === "draw") return { ok: true, big: `🤝 무승부${sc}`, sm: `${esc(res.vs || "")}와 비겼어요 · +${res.points}점` };
    return { ok: false, big: `😢 아쉽게 졌어요${sc}`, sm: `${esc(res.vs || "")}에게 졌지만 참여 점수 +${res.points}점` };
  }
  if (res.correct) return { ok: true, big: `🎉 정답! ${res.rank}등`, sm: `+${res.points}점을 얻었어요` };
  if (res.reason === "late") return { ok: false, big: "⏰ 시간 초과", sm: "제한 시간이 지난 뒤에 제출됐어요 · 0점" };
  if (res.reason === "timeout") return { ok: false, big: "⏰ 시간 초과", sm: "시간 안에 제출하지 못했어요 · 0점" };
  return { ok: false, big: "😢 아쉬워요, 오답!", sm: "다음 라운드에 다시 도전해요 · 0점" };
}

// ---------- 캐릭터 ----------
// 아직 캐릭터를 안 만든 학생은 이름으로 정해지는 기본 캐릭터
function avOf(p) {
  if (p && p.av) return p.av;
  let h = 0; const n = (p && (p.name || p.id)) || "";
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = {}; PART_ORDER.forEach((k, i) => (a[k] = (h >>> (i * 3)) % PARTS[k].n));
  return a;
}
const avHTML = (p, cls = "avatar") => avatarSVG(avOf(p), p ? p.score || 0 : 0, { cls });

// ---------- 게임 설명 (설명 캐릭터가 장면마다 설명, 선생님이 넘김) ----------
// 설명 캐릭터 그림: 새 그림을 받으면 img/ 에 넣고 아래 이름만 바꾸면 됨
const GUIDE_IMG = ["porong-host", "porong-wand", "porong-oh", "porong-cheer", "porong-wave", "porong-trophy"];
const FENCE_DEMO = (() => { const L = PUZZLES[0], P = L.puzzles[0]; return { w: L.w, h: L.h, c: P.c, ans: decodeAnswer(P.a) }; })();
const WG_DEMO = (() => {
  let m = { phase: "place", turn: WG.PLACE_ORDER[0], placeNo: 0, moveNo: 0, turnSec: DEFAULT_TURN, stones: { a: [...WG.START.a, -1, -1], b: [...WG.START.b, -1, -1] }, walls: WG.emptyWalls() };
  const snaps = { init: m };
  while (m.phase === "place") m = { ...m, ...WG.randomAction(m) };
  snaps.placed = m;
  for (let i = 0; i < 8 && m.phase === "play"; i++) m = { ...m, ...WG.randomAction(m) };
  snaps.mid = m;
  let g = 0; while (m.phase !== "done" && g++ < 400) m = { ...m, ...WG.randomAction(m) };
  snaps.end = m;
  return snaps;
})();
const exFence = new Board($("exFence"));
const exWall = new WG.WallBoard($("exWall"), {});
const pill = (t, c = "") => `<span class="ex-pill ${c}">${t}</span>`;
function fenceShow(edges, opt = {}) {
  $("exFence").style.display = ""; $("exWall").style.display = "none";
  exFence.load(FENCE_DEMO.w, FENCE_DEMO.h, FENCE_DEMO.c, edges);
  if (opt.bad) exFence.setBad(opt.bad);
  if (opt.fill) exFence.setFill(true);
}
function wallShow(m, opt = {}) {
  $("exFence").style.display = "none"; $("exWall").style.display = "";
  exWall.render(m, opt.me || null, { active: !!opt.active, showRegions: !!opt.regions });
  if (opt.sel !== undefined) { exWall.me = m.turn; exWall.sel = opt.sel; exWall.dest = opt.dest !== undefined ? opt.dest : null; exWall.draw(); }
}
function noBoard() { $("exFence").style.display = "none"; $("exWall").style.display = "none"; }
const EXPLAIN = {
  fence: [
    { title: "🧩 울타리치기란?", text: "숫자를 보고 점과 점을 이어서\n끊기지 않는 울타리 하나를 완성하는 퍼즐이에요.", show: () => fenceShow(new Set()) },
    { title: "숫자의 뜻", text: "칸 안의 숫자는 그 칸을 둘러싼 울타리 개수예요.\n3이면 네 변 중 세 곳에 울타리가 있어요. 숫자가 없는 칸은 몰라요!",
      show: () => {
        const i = [...FENCE_DEMO.c].findIndex((ch) => ch === "3");
        const k = i < 0 ? [...FENCE_DEMO.c].findIndex((ch) => ch !== ".") : i;
        const r = Math.floor(k / FENCE_DEMO.w), c = k % FENCE_DEMO.w, w = FENCE_DEMO.w, HE = (FENCE_DEMO.h + 1) * w;
        const around = [r * w + c, (r + 1) * w + c, HE + r * (w + 1) + c, HE + r * (w + 1) + c + 1];
        fenceShow(new Set(around.filter((e) => FENCE_DEMO.ans.has(e))), { bad: [k] });
      } },
    { title: "하나로 닫힌 울타리", text: "울타리는 끊기지 않고 하나로 닫혀야 해요.\n두 개로 나뉘면 안 되고, 모든 점을 쓸 필요는 없어요.", show: () => fenceShow(FENCE_DEMO.ans, { fill: true }) },
    { title: "울타리 치는 법", text: "점과 점 사이를 톡 누르거나, 점을 따라 쭉 그어요.\n[지우기]를 켜고 울타리를 누르면 지워져요.", show: () => fenceShow(new Set([...FENCE_DEMO.ans].slice(0, Math.ceil(FENCE_DEMO.ans.size / 2)))) },
    { title: "점수", text: "제출은 딱 한 번! 틀리면 0점이에요.\n맞히면 기본 점수, 빨리 맞힐수록 보너스, 어려운 단계일수록 점수가 커져요.",
      show: (r) => { noBoard(); const P = { ...DEFAULT_PTS, ...((r && r.pts) || {}) }; return pill(`맞히면 ${P.base}점`, "g") + pill(`1등 +${P.top} … ${P.top}등 +1`, "y") + pill(P.mult ? "어려운 단계 ×3까지" : "배율 없음", "p") + pill("오답·시간 초과 0점"); } }
  ],
  wallgo: [
    { title: "🧱 벽바둑 1이란?", text: "친구와 1:1로 겨루는 땅따먹기 게임이에요.\n7×7 판에서 각자 말 4개를 써요. 처음엔 2개씩 놓여 있어요.", show: () => wallShow(WG_DEMO.init) },
    { title: "말 놓기", text: "나머지 말 2개는 번갈아 빈칸에 직접 놓아요.\n순서: 분홍 → 파랑 → 파랑 → 분홍", show: () => wallShow(WG_DEMO.placed) },
    { title: "말 움직이기", text: "내 차례엔 내 말 하나를 0~2칸 움직여요.\n상하좌우로, 꺾어서 가도 돼요. 초록 칸이 갈 수 있는 곳!",
      show: () => wallShow(WG_DEMO.placed, { active: true, sel: WG_DEMO.placed.stones[WG_DEMO.placed.turn][0] }) },
    { title: "벽 세우기", text: "움직인 칸의 둘레 중 한 곳에 벽을 꼭 세워요. (주황 점선)\n벽과 다른 말은 지나갈 수 없고, 세운 벽은 없앨 수 없어요.",
      show: () => { const m = WG_DEMO.mid, lm = WG.legalMoves(m, m.turn)[0]; wallShow(m, lm ? { active: true, sel: lm.from, dest: lm.to } : {}); } },
    { title: "끝과 승부", text: "서로 다른 색 말이 같은 공간에 없으면 끝!\n내 말만 있는 공간의 칸 수가 내 땅이에요. 땅이 넓은 쪽이 이겨요.",
      show: () => { const m = WG_DEMO.end; wallShow(m, { regions: true }); return pill(`분홍 땅 ${m.scoreA}칸`, "p") + pill(`파랑 땅 ${m.scoreB}칸`); } },
    { title: "시간과 점수", text: "한 수마다 제한 시간이 있어요. 시간이 지나면 아무 곳에나 저절로 둬요.\n져도 참여 점수를 받아요!",
      show: (r) => { noBoard(); const W = { ...DEFAULT_WG, ...((r && r.wg) || {}) }; return pill(`한 수 ${(r && r.turnSec) || DEFAULT_TURN}초`) + pill(`승리 ${W.win}점`, "g") + pill(`무승부 ${W.draw}점`, "y") + pill(`패배 ${W.lose}점`, "p") + pill("홀수면 1명 부전승"); } }
  ]
};
let exKey = null;
function showExplain(r, teacher) {
  const ex = r && r.explain, steps = ex && EXPLAIN[ex.game];
  if (!steps) { hideExplain(); return; }
  const step = Math.max(0, Math.min(steps.length - 1, ex.step || 0)), S = steps[step];
  $("explainView").classList.remove("hidden");
  $("exCtrl").classList.toggle("hidden", !teacher);
  $("exWait").classList.toggle("hidden", teacher);
  $("exPrev").disabled = step === 0;
  $("exNext").textContent = step === steps.length - 1 ? "설명 다 했어요 ✔" : "다음 ▶";
  const key = ex.game + ":" + step + ":" + (teacher ? "t" : "s");
  if (key === exKey) return;
  exKey = key;
  $("exGame").textContent = `${GAMES[ex.game].icon} ${GAMES[ex.game].name} 게임 설명`;
  $("exStep").textContent = `${step + 1} / ${steps.length}`;
  $("exDots").innerHTML = steps.map((_, k) => `<i class="${k === step ? "on" : ""}"></i>`).join("");
  $("exImg").src = `img/${GUIDE_IMG[step % GUIDE_IMG.length]}.jpg`;
  $("exTitle").textContent = S.title;
  $("exText").textContent = S.text;
  const extra = S.show(r) || "";
  $("exExtra").innerHTML = extra;
}
function hideExplain() { $("explainView").classList.add("hidden"); exKey = null; }

// ---------- 엔젤스 플랜 소개 (포롱이) ----------
const INTRO = [
  { img: "porong-host", text: "안녕! 나는 엔젤스 플랜의 안내 천사, 포롱이야! 뿅!" },
  { img: "porong-wand", text: "엔젤스 플랜은 우리 반 친구들이 함께 머리를 쓰는 두뇌 게임 대회야." },
  { img: "porong-wave", text: "여기서는 아무도 탈락하지 않아. 처음부터 끝까지 모두 함께 게임을 즐기는 거야!" },
  { img: "porong-oh", text: "이기는 것도 좋지만, 규칙을 지키고 친구를 응원하는 따뜻한 천사 마음이 더 중요해." },
  { img: "porong-cheerup", text: "틀리거나 져도 괜찮아. 다시 도전하는 친구가 진짜 멋진 천사야!" },
  { img: "porong-trophy", text: "게임에서 점수를 모으면 천사 날개가 쑥쑥 자라! 그럼 시작해 볼까? 두근두근~" }
];
const IN = { i: 0, typing: null, full: "" };
INTRO.forEach((x) => { const im = new Image(); im.src = `img/${x.img}.jpg`; });
function introShow(i) {
  IN.i = i;
  const step = INTRO[i], img = $("introImg");
  img.classList.add("swap");
  setTimeout(() => { img.src = `img/${step.img}.jpg`; img.classList.remove("swap"); }, 180);
  $("introDots").innerHTML = INTRO.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
  const last = i === INTRO.length - 1;
  $("introNext").textContent = last ? "엔젤스 플랜 시작하기 ✨" : "다음 ▶";
  $("introNext").classList.toggle("final", last);
  clearInterval(IN.typing);
  IN.full = step.text;
  let n = 0;
  $("introText").textContent = "";
  IN.typing = setInterval(() => {
    n++;
    $("introText").textContent = IN.full.slice(0, n);
    if (n >= IN.full.length) { clearInterval(IN.typing); IN.typing = null; }
  }, 45);
}
function introNext() {
  if (IN.typing) { clearInterval(IN.typing); IN.typing = null; $("introText").textContent = IN.full; return; }
  if (IN.i < INTRO.length - 1) introShow(IN.i + 1);
  else introEnd();
}
function introEnd() {
  clearInterval(IN.typing); IN.typing = null;
  try { sessionStorage.setItem("angel_intro_seen", "1"); } catch (e) { /* 저장 안 됨 */ }
  showScreen("entry");
  if (IN.i === INTRO.length - 1) confetti();
}
$("introNext").addEventListener("click", (e) => { e.stopPropagation(); introNext(); });
$("introStage").addEventListener("click", introNext);
$("introSkip").addEventListener("click", introEnd);
$("introAgain").addEventListener("click", () => { showScreen("intro"); introShow(0); });
(() => {
  let seen = false;
  try { seen = sessionStorage.getItem("angel_intro_seen") === "1"; } catch (e) { /* 없음 */ }
  if (seen) showScreen("entry"); else introShow(0);
})();

// ---------- 익명 로그인 ----------
let user = null;
const authReady = new Promise((resolve) => {
  onAuthStateChanged(auth, (u) => {
    if (u) { user = u; resolve(u); }
    else signInAnonymously(auth).catch((e) => {
      console.error(e);
      $("entryMsg").textContent = "접속 준비에 실패했어요. 잠시 뒤 새로고침해 주세요.";
    });
  });
});

// ---------- 입장 화면 ----------
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    $("studentForm").classList.toggle("hidden", tab.dataset.tab !== "student");
    $("teacherForm").classList.toggle("hidden", tab.dataset.tab !== "teacher");
    $("registerForm").classList.add("hidden");
    $("entryMsg").textContent = "";
  });
});
try {
  const saved = JSON.parse(localStorage.getItem("angel_student") || "null");
  if (saved) { $("roomCode").value = saved.code || ""; $("studentName").value = saved.name || ""; }
} catch (e) { /* 없음 */ }
$("roomCode").addEventListener("input", (e) => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); });

$("studentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("roomCode").value.trim();
  const name = $("studentName").value.trim().replace(/[\/\\.#$\[\]]/g, "").slice(0, 10);
  if (!/^\d{4}$/.test(code)) return ($("entryMsg").textContent = "방 번호 4자리를 적어 주세요.");
  if (!name) return ($("entryMsg").textContent = "이름을 적어 주세요.");
  const btn = e.submitter; btn.disabled = true;
  $("entryMsg").textContent = "";
  try { await joinStudent(code, name); }
  catch (err) { console.error(err); $("entryMsg").textContent = err.userMsg || "입장하지 못했어요. 다시 시도해 주세요."; }
  finally { btn.disabled = false; }
});
const cleanName = (n) => String(n || "").trim().replace(/[\/\\.#$\[\]]/g, "").slice(0, 20);
try { const tn = localStorage.getItem("angel_teacher_name"); if (tn) $("teacherName").value = tn; } catch (e) { /* 없음 */ }
$("toRegister").addEventListener("click", () => { $("teacherForm").classList.add("hidden"); $("registerForm").classList.remove("hidden"); $("entryMsg").textContent = ""; });
$("toLogin").addEventListener("click", () => { $("registerForm").classList.add("hidden"); $("teacherForm").classList.remove("hidden"); $("entryMsg").textContent = ""; });
$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = cleanName($("regName").value), school = $("regSchool").value.trim().slice(0, 30);
  const pw = $("regPw").value, pw2 = $("regPw2").value;
  const msg = (t) => ($("entryMsg").textContent = t);
  if (!name) return msg("이름을 적어 주세요.");
  if (pw.length < 4) return msg("비밀번호는 4자 이상으로 정해 주세요.");
  if (pw !== pw2) return msg("비밀번호 확인이 달라요.");
  const btn = e.submitter; btn.disabled = true; msg("");
  try {
    await authReady;
    const acc = doc(db, "teacherAccounts", name);
    if ((await getDoc(acc)).exists()) throw userErr("이미 등록된 이름이에요. 다른 이름(예: 김하늘2)으로 해 주세요.");
    const k = await sha256(`angels-teacher-acc:${name}:${pw}`);
    const batch = writeBatch(db);
    batch.set(acc, { name, school, approved: false, createdAt: serverTimestamp() });
    batch.set(doc(db, "teacherSecrets", name), { kh: await sha256(k) });
    await batch.commit();
    ["regName", "regSchool", "regPw", "regPw2"].forEach((id) => ($(id).value = ""));
    $("registerForm").classList.add("hidden"); $("teacherForm").classList.remove("hidden");
    $("teacherName").value = name;
    msg("");
    toast("등록 신청을 보냈어요! 관리자 선생님이 승인하면 입장할 수 있어요.");
    $("entryMsg").innerHTML = `<span class="ok-msg">✅ ${esc(name)} 선생님, 등록 신청을 보냈어요. 승인 후 입장해 주세요.</span>`;
  } catch (err) { console.error(err); msg(err.userMsg || "등록하지 못했어요. 다시 시도해 주세요."); }
  finally { btn.disabled = false; }
});
$("teacherForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const pw = $("teacherPw").value.trim(), name = cleanName($("teacherName").value);
  if (!pw) return ($("entryMsg").textContent = "비밀번호를 적어 주세요.");
  const btn = e.submitter; btn.disabled = true;
  $("entryMsg").textContent = "";
  try { await teacherLogin(pw, name); $("teacherPw").value = ""; }
  catch (err) { console.error(err); $("entryMsg").textContent = err.userMsg || "입장하지 못했어요. 다시 시도해 주세요."; }
  finally { btn.disabled = false; }
});
const userErr = (msg) => Object.assign(new Error(msg), { userMsg: msg });

// 벽바둑 한 수 (트랜잭션: 두 기기가 동시에 두지 않도록)
// 결과: { ok, err } — err가 있으면 실패 이유
async function wgAct(mref, compute) {
  try {
    let did = false;
    await runTransaction(db, async (tx) => {
      const s = await tx.get(mref);
      if (!s.exists()) return;
      const m = s.data();
      const d = compute(m);
      if (!d) return;
      if (d.phase === "done") d.endedAt = now();
      tx.update(mref, d);
      did = true;
    });
    return { ok: did };
  } catch (e) { console.warn("벽바둑 수 저장 실패", e); return { ok: false, err: e && e.code ? e.code : String(e) }; }
}
function wgFailMsg(r) {
  if (!r || r.ok) return null;
  if (r.err === "permission-denied") return "보안 규칙 때문에 막혔어요. 선생님께 알려 주세요.";
  if (r.err) return "인터넷이 불안정해요. 다시 눌러 주세요.";
  return "이미 차례가 넘어갔어요.";
}
// 한 수 시간: 기기 시계와 상관없이, 이 기기가 새 수를 처음 본 때부터 셈
const turnClock = new Map();   // "대결id:수번호" → 처음 본 시각
function turnLeft(m, id, extra = 0) {
  const key = id + ":" + m.moveNo;
  if (!turnClock.has(key)) turnClock.set(key, Date.now());
  const sec = (m.turnSec || DEFAULT_TURN) + (m.moveNo === 0 ? 5 : 0);
  return sec - (Date.now() - turnClock.get(key)) / 1000 + extra;
}

// =====================================================================
// 학생
// =====================================================================
const ST = { unsubs: [], room: null, me: null, players: [], round: null, saveTimer: null, tick: null, joined: false, match: null, matchId: null, matchUnsub: null, autoKey: null };
const stBoard = new Board($("stBoard"), { interactive: true, onChange: scheduleSave });
const stAnswerBoard = new Board($("stAnswerBoard"));
let stAnswerKey = null;
const wgBoard = new WG.WallBoard($("wgBoard"), {
  onPlace: (cell) => {
    const m = ST.match, side = ST.me && ST.me.mt && ST.me.mt.side;
    if (!m || !side) return;
    const exp = m.moveNo;
    wgAct(ST.matchRef, (x) => (x.moveNo === exp ? WG.applyPlace(x, side, cell) : null)).then((r) => { const msg = wgFailMsg(r); if (msg) toast(msg); });
  },
  onMove: (from, to, wall) => {
    const m = ST.match, side = ST.me && ST.me.mt && ST.me.mt.side;
    if (!m || !side) return;
    const exp = m.moveNo;
    wgAct(ST.matchRef, (x) => (x.moveNo === exp ? WG.applyMove(x, side, from, to, wall) : null)).then((r) => { const msg = wgFailMsg(r); if (msg) toast(msg); });
  },
  onHint: (msg) => toast(msg)
});
wgBoard.onStep = () => {
  const st = $("wgStatus"), m = ST.match, side = ST.me && ST.me.mt && ST.me.mt.side;
  if (!st || !m || m.phase !== "play" || m.turn !== side) return;
  st.textContent = wgBoard.dest !== null ? "③ 벽을 세울 쪽을 눌러요 (주황 점선, 또는 그 방향 칸)"
    : wgBoard.sel !== null ? "② 갈 칸을 눌러요 (초록 칸, 제자리도 OK)" : "내 차례! ① 움직일 내 말을 눌러요";
};

async function joinStudent(code, name) {
  await authReady;
  const roomRef = doc(db, "rooms", code);
  const rs = await getDoc(roomRef);
  if (!rs.exists()) throw userErr("방 번호를 다시 확인해 주세요.");
  const pRef = doc(db, "rooms", code, "players", name);
  const ps = await getDoc(pRef);
  if (ps.exists()) await updateDoc(pRef, { uid: user.uid, lastSeen: serverTimestamp() });
  else await setDoc(pRef, { name, uid: user.uid, score: 0, edges: "", joinedAt: serverTimestamp(), lastSeen: serverTimestamp() });
  await syncClock(pRef, "lastSeen");
  localStorage.setItem("angel_student", JSON.stringify({ code, name }));

  Object.assign(ST, { code, name, roomRef, pRef, room: null, me: null, players: [], round: null, joined: false, match: null, matchId: null });
  $("stName").textContent = name;
  $("stRoom").textContent = `방 ${code}`;
  setTool("draw");
  showScreen("student");

  ST.unsubs.push(onSnapshot(roomRef, (s) => {
    if (!s.exists()) return leaveStudent("선생님이 방을 닫았어요.");
    ST.room = s.data(EST);
    $("stRoom").textContent = `방 ${code}${ST.room.memo ? " · " + ST.room.memo : ""}`;
    renderStudent();
  }));
  ST.unsubs.push(onSnapshot(pRef, (s) => {
    if (!s.exists()) { if (ST.joined) leaveStudent("선생님이 방에서 내보냈어요. 다시 입장할 수 있어요."); return; }
    ST.joined = true;
    ST.me = s.data(EST);
    watchMatch();
    renderStudent();
  }));
  ST.unsubs.push(onSnapshot(collection(db, "rooms", code, "players"), (qs) => {
    ST.players = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStudentRank();
  }));
  clearInterval(ST.tick);
  ST.tick = setInterval(studentTick, 250);
}

// 내 벽바둑 대결 문서 지켜보기
function watchMatch() {
  const mt = ST.me && ST.me.mt;
  const id = mt && mt.id ? mt.id : null;
  if (id === ST.matchId) return;
  if (ST.matchUnsub) { ST.matchUnsub(); ST.matchUnsub = null; }
  ST.matchId = id; ST.match = null;
  if (!id) return;
  ST.matchRef = doc(db, "rooms", ST.code, "matches", id);
  ST.matchUnsub = onSnapshot(ST.matchRef, (s) => { ST.match = s.exists() ? s.data() : null; renderStudent(); });
}

function leaveStudent(msg) {
  ST.unsubs.forEach((u) => u()); ST.unsubs = [];
  if (ST.matchUnsub) { ST.matchUnsub(); ST.matchUnsub = null; }
  ST.matchId = null;
  clearInterval(ST.tick); clearTimeout(ST.saveTimer);
  ST.joined = false;
  closePractice(); hideExplain(); $("avModal").classList.add("hidden");
  AV.asked = false; ST.wingLv = undefined; myAngelKey = null;
  showScreen("entry");
  $("entryMsg").textContent = msg || "";
}
$("stLeave").addEventListener("click", async () => {
  if (await confirmBox("게임방에서 나갈까요?\n같은 이름으로 다시 들어오면 점수가 이어져요.", "나가기")) leaveStudent("");
});

function endAtOf(r) { const s = ms(r && r.startAt); return s ? s + r.duration * 1000 : null; }

let celebrated = null;
function porongFace(name) { const el = $("stMascot"); if (el) el.src = `img/porong-${name}.jpg`; }
function celebrate(res) {
  if (!res || celebrated === res.round) return;
  celebrated = res.round;
  porongFace(res.correct || res.outcome === "win" || res.outcome === "bye" ? "trophy" : res.outcome === "draw" ? "cheer" : "cheerup");
  if (res.correct || res.outcome === "win" || res.outcome === "bye") { confetti(); mascotMood($("stMascot"), "happy"); }
  else if (res.outcome !== "draw") mascotMood($("stMascot"), "sad");
}

function renderStudent() {
  const r = ST.room, me = ST.me;
  if (!r || !me) return;
  $("stScore").textContent = me.score || 0;
  renderMyAngel();
  if (r.explain && r.status !== "playing") showExplain(r, false); else hideExplain();
  if (!me.av && !AV.asked && r.status !== "playing") { AV.asked = true; openAvatar(true); }
  const tc = GAMES[r.game] && GAMES[r.game].team ? r.teamCount || 0 : 0, tm = teamOf(me, tc);
  $("stTeam").textContent = teamLabel(tm);
  $("stTeam").classList.toggle("hidden", !tm);
  renderStudentRank();

  const playing = r.status === "playing";
  const res = me.result && me.result.round === r.round ? me.result : null;
  if (!res && celebrated !== null && celebrated !== r.round) porongFace("wave");
  $("stGame").classList.toggle("hidden", !playing);
  $("stLobby").classList.toggle("hidden", playing);
  if (playing) closePractice();

  if (playing && r.game === "wallgo") {
    $("fenceArea").classList.add("hidden");
    $("wgArea").classList.remove("hidden");
    renderStudentWallgo(r, me, res);
  } else if (playing) {
    $("fenceArea").classList.remove("hidden");
    $("wgArea").classList.add("hidden");
    renderStudentFence(r, me, res);
  } else {
    const box = $("stResult");
    const t = r.status === "ended" ? resultText(res) : null;
    box.classList.toggle("hidden", !t);
    if (t) {
      box.className = "result " + (t.ok ? "ok" : "bad");
      box.innerHTML = `<div class="big">${esc(t.big)}</div><div class="sm">${t.sm}</div>`;
      celebrate(res);
    }
    $("stBubble").textContent = t
      ? (t.ok ? "멋져! 천사 날개가 반짝반짝해! 뿅! 🎉" : "괜찮아! 다음 게임에서 꼭 해낼 수 있어!")
      : r.round > 0 ? "다음 게임을 기다리는 중이에요!" : "선생님이 게임을 시작하면 열려요!";
    const ans = r.status === "ended" && r.round > 0 && r.game !== "wallgo" ? answerOf(r) : null;
    $("stAnswerCard").hidden = !ans;
    if (ans && stAnswerKey !== r.round) {
      stAnswerKey = r.round;
      stAnswerBoard.load(r.puzzle.w, r.puzzle.h, r.puzzle.c);
      stAnswerBoard.showAnswer(ans);
    }
  }
}

function renderStudentFence(r, me, res) {
  if (ST.round !== r.round) {
    ST.round = r.round;
    let edges = new Set();
    if (me.sub && me.sub.round === r.round) edges = decodeEdges(me.sub.edges);
    else if (me.edges && me.edges.startsWith(r.round + ":")) edges = decodeEdges(me.edges.split(":")[1]);
    stBoard.load(r.puzzle.w, r.puzzle.h, r.puzzle.c, edges);
    setTool("draw");
    $("stLevel").textContent = `🧩 울타리치기 · ${levelLabel(r.level)}`;
  }
  const submitted = !!(me.sub && me.sub.round === r.round);
  const end = endAtOf(r);
  const timeUp = end !== null && now() > end;
  const lock = submitted || timeUp || !!res;
  stBoard.setLocked(lock);
  ["toolDraw", "toolErase", "toolClear", "toolSubmit"].forEach((id) => ($(id).disabled = lock));
  const msg = $("stGameMsg");
  msg.className = "game-msg";
  if (res) {
    const t = resultText(res);
    msg.textContent = `${t.big} ${t.ok ? `+${res.points}점` : "0점"}`;
    msg.classList.add(t.ok ? "ok" : "bad");
    if (t.ok && !stBoard.fill) stBoard.setFill(true);
    celebrate(res);
  } else if (submitted) msg.textContent = "📮 제출 완료! 채점 중이에요…";
  else if (timeUp) { msg.textContent = "⏰ 시간 종료!"; msg.classList.add("bad"); }
  else msg.textContent = "";
}

function renderStudentWallgo(r, me, res) {
  ST.round = r.round;
  const mt = me.mt && me.mt.round === r.round ? me.mt : null;
  const status = $("wgStatus"), vs = $("wgVs");
  status.className = "wg-status";
  $("wgBoardWrap").classList.toggle("hidden", !(mt && mt.id && ST.match));
  if (!mt) {
    vs.textContent = "🧱 벽바둑 1";
    status.textContent = "이번 대결은 이미 시작됐어요. 다음 게임에 함께해요!";
    $("wgTimer").textContent = "";
    return;
  }
  if (mt.bye) {
    vs.textContent = "🧱 벽바둑 1";
    status.textContent = "🍀 이번 라운드는 짝이 없어서 부전승이에요! 친구들 경기가 끝날 때까지 기다려요.";
    status.classList.add("ok");
    $("wgTimer").textContent = "";
    if (res) celebrate(res);
    return;
  }
  const m = ST.match;
  if (!m) { status.textContent = "대결 준비 중…"; return; }
  const side = mt.side, opp = WG.other(side);
  const myName = side === "a" ? m.a : m.b, oppName = side === "a" ? m.b : m.a;
  const oppP = ST.players.find((p) => p.id === oppName) || { name: oppName };
  vs.innerHTML = `<span class="vs-av">${avHTML(me)}</span><span class="wg-tag side-${side}">나 ${esc(myName)}</span> <b>VS</b> <span class="wg-tag side-${opp}">${esc(oppName)}</span><span class="vs-av">${avHTML(oppP)}</span>`;
  const myTurn = m.phase !== "done" && m.turn === side;
  wgBoard.render(m, side, { active: myTurn, showRegions: m.phase === "done" });
  if (m.phase === "done") {
    const my = side === "a" ? m.scoreA : m.scoreB, op = side === "a" ? m.scoreB : m.scoreA;
    const t = res ? resultText(res) : null;
    status.innerHTML = t ? `${esc(t.big)} <small>${t.sm}</small>` : `경기 끝! 내 땅 ${my}칸 : 상대 땅 ${op}칸 · 점수 계산 중…`;
    status.classList.add(m.winner === side || m.winner === "draw" ? "ok" : "bad");
    $("wgTimer").textContent = "";
    if (res) celebrate(res);
    return;
  }
  if (m.phase === "place") {
    const left = m.stones[side].filter((c) => c < 0).length;
    status.textContent = myTurn ? `내 차례! 말을 놓을 빈칸을 눌러요 (남은 말 ${left}개)` : `상대가 말을 놓는 중이에요… (순서: 나→상대→상대→나)`;
  } else if (myTurn) {
    status.textContent = wgBoard.dest !== null ? "③ 벽을 세울 쪽을 눌러요 (주황 점선, 또는 그 방향 칸)"
      : wgBoard.sel !== null ? "② 갈 칸을 눌러요 (초록 칸, 제자리도 OK)" : "내 차례! ① 움직일 내 말을 눌러요";
  } else {
    status.textContent = "상대 차례예요… 어디에 벽을 세울지 미리 생각해 봐요!";
  }
  if (myTurn) status.classList.add("my");
}

// ----- 나의 천사 (캐릭터 + 날개 성장) -----
let myAngelKey = null;
function renderMyAngel() {
  const me = ST.me;
  if (!me) return;
  const info = wingInfo(me.score || 0);
  const key = JSON.stringify(avOf(me)) + ":" + info.lv;
  if (key !== myAngelKey) {
    myAngelKey = key;
    $("stAv").innerHTML = avHTML(me);
    $("stHeadAv").innerHTML = avHTML(me);
  }
  $("stWingName").textContent = `🪽 ${info.name} (Lv.${info.lv + 1})`;
  const cur = WING_LEVELS[info.lv].min, nxt = WING_LEVELS[info.lv + 1];
  $("stWingBar").style.width = nxt ? Math.min(100, ((me.score || 0) - cur) / (nxt.min - cur) * 100) + "%" : "100%";
  $("stWingNext").textContent = nxt ? `${info.nextName}까지 ${info.next}점 남았어요` : "가장 멋진 황금 날개예요! ✨";
  if (ST.wingLv !== undefined && info.lv > ST.wingLv) { confetti(); toast(`🪽 날개가 자랐어요! 이제 「${info.name}」`); }
  ST.wingLv = info.lv;
}
const AV = { draft: null, tab: "face", forced: false, asked: false };
function openAvatar(forced) {
  AV.draft = cleanAvatar(ST.me && ST.me.av ? ST.me.av : randomAvatar());
  AV.forced = forced;
  $("avClose").textContent = forced ? "나중에 할게요" : "닫기";
  $("avModal").classList.remove("hidden");
  renderAvatarModal();
}
function renderAvatarModal() {
  const score = (ST.me && ST.me.score) || 0, info = wingInfo(score);
  $("avPreview").innerHTML = avatarSVG(AV.draft, score);
  $("avWingNote").textContent = `지금 날개: ${info.name} · 게임에서 점수를 모으면 날개가 자라요!`;
  $("avTabs").innerHTML = PART_ORDER.map((k) => `<button class="av-tab ${k === AV.tab ? "active" : ""}" data-avtab="${k}">${PARTS[k].name}</button>`).join("");
  let h = "";
  for (let i = 0; i < PARTS[AV.tab].n; i++) {
    const a = { ...AV.draft, [AV.tab]: i };
    h += `<button class="av-opt ${AV.draft[AV.tab] === i ? "active" : ""}" data-avopt="${i}"><span class="av-mini">${avatarSVG(a, score)}</span>${esc(OPTION_LABELS[AV.tab][i])}</button>`;
  }
  $("avOpts").innerHTML = h;
}
$("avTabs").addEventListener("click", (e) => { const b = e.target.closest("[data-avtab]"); if (b) { AV.tab = b.dataset.avtab; renderAvatarModal(); } });
$("avOpts").addEventListener("click", (e) => { const b = e.target.closest("[data-avopt]"); if (b) { AV.draft[AV.tab] = Number(b.dataset.avopt); renderAvatarModal(); } });
$("avRandom").addEventListener("click", () => { AV.draft = randomAvatar(); renderAvatarModal(); });
$("avClose").addEventListener("click", () => $("avModal").classList.add("hidden"));
$("avEditBtn").addEventListener("click", () => openAvatar(false));
$("avSave").addEventListener("click", async () => {
  if (!ST.pRef) return;
  $("avSave").disabled = true;
  try {
    await updateDoc(ST.pRef, { av: cleanAvatar(AV.draft) });
    $("avModal").classList.add("hidden");
    toast("나만의 천사가 완성됐어요! 😇");
  } catch (e) {
    console.error(e);
    toast(e && e.code === "permission-denied" ? "캐릭터 저장이 보안 규칙에 막혔어요. 선생님께 알려 주세요." : "저장하지 못했어요. 다시 눌러 주세요.");
  } finally { $("avSave").disabled = false; }
});

function renderStudentRank() {
  if (!ST.me) return;
  const list = ranked(ST.players.map((p) => ({ ...p })));
  const mine = list.find((p) => p.id === ST.name);
  $("stRankTxt").textContent = mine ? `${mine.rank}등 / ${list.length}명` : "-";
  $("stRankList").innerHTML = list.slice(0, 10).map((p) =>
    `<li class="${p.id === ST.name ? "me" : ""}"><span class="no">${p.rank}</span><span class="nm">${esc(p.name)}</span><span class="sc">${p.score || 0}점</span></li>`
  ).join("") + (mine && mine.rank > 10
    ? `<li class="me"><span class="no">${mine.rank}</span><span class="nm">${esc(mine.name)}</span><span class="sc">${mine.score || 0}점</span></li>` : "");
  const r0 = ST.room, tc = r0 && GAMES[r0.game] && GAMES[r0.game].team ? r0.teamCount || 0 : 0;
  const hasTeams = tc > 0 && ST.players.some((p) => teamOf(p, tc));
  $("stTeamCard").hidden = !hasTeams;
  if (hasTeams) {
    const myT = teamOf(ST.me, tc);
    $("stTeamList").innerHTML = teamRanking(ST.players, tc).map((x) =>
      `<li class="${x.t === myT ? "me" : ""}"><span class="no">${x.rank}</span><span class="nm">${teamLabel(x.t)} <small>${x.n}명</small></span><span class="sc">${x.avg}점</span></li>`).join("");
  }
}

let stWasUp = false;
function studentTick() {
  const r = ST.room;
  if (!r || r.status !== "playing") return;
  if (r.game === "wallgo") {
    const m = ST.match, mt = ST.me && ST.me.mt;
    if (!m || !mt || mt.bye || m.phase === "done" || mt.round !== r.round) { $("wgTimer").textContent = ""; return; }
    const left = turnLeft(m, mt.id);
    const el = $("wgTimer");
    el.textContent = fmtTime(left);
    el.classList.toggle("warn", left <= 8 && left > 0);
    // 시간이 지나면 자동으로 두기 (상대 기기가 멈춰 있으면 4초 뒤 내가 대신). 실패하면 3초마다 다시
    const myTurn = m.turn === mt.side;
    if (left <= (myTurn ? 0 : -4) && Date.now() - (ST.autoTry || 0) > 3000) {
      ST.autoTry = Date.now();
      const exp = m.moveNo;
      wgAct(ST.matchRef, (x) => (x.moveNo === exp && x.phase !== "done" ? WG.randomAction(x) : null))
        .then((res) => { if (res.ok && myTurn) toast("⏰ 시간이 지나서 아무 곳에나 두었어요."); else if (res.err) toast(wgFailMsg(res)); });
    }
    return;
  }
  const end = endAtOf(r);
  if (end === null) return;
  const left = (end - now()) / 1000;
  const el = $("stTimer");
  el.textContent = fmtTime(left);
  el.classList.toggle("warn", left <= 10 && left > 0);
  const up = left <= 0;
  if (up !== stWasUp) { stWasUp = up; renderStudent(); }
}

function setTool(m) {
  stBoard.setMode(m);
  $("toolDraw").classList.toggle("active", m === "draw");
  $("toolErase").classList.toggle("active", m === "erase");
}
$("toolDraw").addEventListener("click", () => setTool("draw"));
$("toolErase").addEventListener("click", () => setTool("erase"));
$("toolClear").addEventListener("click", async () => {
  if (!stBoard.edges.size) return;
  if (await confirmBox("그린 울타리를 모두 지울까요?", "모두 지우기")) stBoard.clear();
});
function scheduleSave() {
  clearTimeout(ST.saveTimer);
  ST.saveTimer = setTimeout(() => {
    const r = ST.room;
    if (!r || r.status !== "playing" || r.game === "wallgo" || !ST.pRef) return;
    if (ST.me && ST.me.sub && ST.me.sub.round === r.round) return;
    updateDoc(ST.pRef, { edges: `${r.round}:${encodeEdges(stBoard.edges, stBoard.w, stBoard.h)}` }).catch(console.warn);
  }, 700);
}
$("toolSubmit").addEventListener("click", async () => {
  const r = ST.room;
  if (!r || r.status !== "playing") return;
  if (!stBoard.edges.size) return toast("먼저 울타리를 그려 주세요.");
  if (!(await confirmBox("정말 제출할까요?\n제출은 딱 한 번만 할 수 있어요!", "제출하기"))) return;
  if (ST.room.round !== r.round || ST.room.status !== "playing") return toast("이미 라운드가 끝났어요.");
  clearTimeout(ST.saveTimer);
  const bits = encodeEdges(stBoard.edges, stBoard.w, stBoard.h);
  $("toolSubmit").disabled = true;
  try {
    await updateDoc(ST.pRef, { sub: { round: r.round, edges: bits, at: serverTimestamp() }, edges: `${r.round}:${bits}` });
  } catch (e) {
    console.error(e);
    toast("제출하지 못했어요. 시간이 끝났거나 이미 제출했어요.");
    renderStudent();
  }
});

// =====================================================================
// 울타리치기 혼자 연습하기 (점수 없음)
// =====================================================================
const PR_LEVELS = [0, 1, 2];
const PR_INTRO = [
  "숫자는 그 칸을 둘러싼 울타리 개수야. 3이 있는 칸부터 울타리 3개를 쳐 볼까?",
  "이번엔 숫자가 몇 개 빠졌어. 0 둘레에는 울타리를 치면 안 된다는 것도 기억해!",
  "4×4에 도전! 끊기지 않는 하나의 울타리로 닫아야 해."
];
const PR_MSG = {
  empty: "먼저 점과 점 사이를 톡 눌러 울타리를 그려 봐!",
  branch: "한 점에서 울타리가 세 갈래로 갈라졌어. 울타리는 한 줄로만 이어져야 해!",
  open: "울타리가 끊긴 곳이 있어. 끝과 끝이 꼭 만나도록 닫아 줘!",
  clue: "깜빡이는 숫자를 봐! 그 칸을 둘러싼 울타리 개수가 숫자와 달라.",
  multi: "울타리가 여러 개로 나뉘었어. 하나로 이어진 울타리여야 해!",
  ok: "정답! 울타리 안에 쏙 들어왔어. 고마워 메에~ 🎉"
};
const PR = { lv: 0, idx: -1 };
const prBoard = new Board($("prBoard"), { interactive: true, onChange: () => prSay(PR_INTRO[PR_LEVELS.indexOf(PR.lv)]) });
let prLastMsg = "";
function prSay(msg) { if (msg === prLastMsg) return; prLastMsg = msg; $("prMsg").textContent = msg; }
function prSetTool(m) {
  prBoard.setMode(m);
  $("prDraw").classList.toggle("active", m === "draw");
  $("prErase").classList.toggle("active", m === "erase");
}
function prLoad(lv) {
  PR.lv = lv;
  const L = PUZZLES[lv];
  let i;
  do { i = Math.floor(Math.random() * L.puzzles.length); } while (L.puzzles.length > 1 && i === PR.idx);
  PR.idx = i;
  prBoard.load(L.w, L.h, L.puzzles[i].c);
  prBoard.setLocked(false);
  prSetTool("draw");
  prSay(PR_INTRO[PR_LEVELS.indexOf(lv)]);
  $("prLevels").innerHTML = PR_LEVELS.map((x) => {
    const I = levelInfo(x + 1);
    return `<button class="pr-lv ${x === lv ? "active" : ""}" data-prlv="${x}">${I.tut ? "🐣 " : ""}${I.name} · ${I.size}</button>`;
  }).join("");
}
function openPractice() { $("practice").classList.remove("hidden"); prLoad(PR.lv); }
function closePractice() { $("practice").classList.add("hidden"); }
$("practiceBtn").addEventListener("click", openPractice);
$("prClose").addEventListener("click", closePractice);
$("prLevels").addEventListener("click", (e) => { const b = e.target.closest("[data-prlv]"); if (b) prLoad(Number(b.dataset.prlv)); });
$("prDraw").addEventListener("click", () => prSetTool("draw"));
$("prErase").addEventListener("click", () => prSetTool("erase"));
$("prClear").addEventListener("click", () => { prBoard.clear(); prSay(PR_INTRO[PR_LEVELS.indexOf(PR.lv)]); });
$("prNext").addEventListener("click", () => prLoad(PR.lv));
$("prCheck").addEventListener("click", () => {
  const L = PUZZLES[PR.lv];
  const d = diagnose(L.w, L.h, L.puzzles[PR.idx].c, prBoard.edges);
  prLastMsg = "";
  prSay(PR_MSG[d.reason]);
  if (d.ok) { prBoard.setFill(true); prBoard.setLocked(true); confetti(); mascotMood($("prMascot"), "happy"); }
  else { prBoard.setBad(d.reason === "clue" ? d.bad : []); mascotMood($("prMascot"), "sad"); }
});

// =====================================================================
// 교사
// =====================================================================
const T = { unsubs: [], room: null, players: [], matches: [], graded: new Map(), queue: Promise.resolve(), ending: false, sel: null, game: null, boardKey: null, answer: false, tick: null, autoTry: new Map() };
const tBoard = new Board($("tBoard"));

// 관리자: 이름 없이 관리자 비밀번호 / 선생님: 등록한 이름 + 비밀번호 (관리자 승인 필요)
async function teacherLogin(pw, name = "") {
  await authReady;
  if (!name) {
    const k = await sha256("angels-teacher:" + pw);
    const tRef = doc(db, "teachers", user.uid);
    let ok = false;
    try {
      const s = await getDoc(tRef);
      if (s.exists()) ok = s.get("k") === k;
      else { await setDoc(tRef, { k, at: serverTimestamp() }); ok = true; }
    } catch (e) { console.warn(e); ok = false; }
    if (!ok) throw userErr("관리자 비밀번호가 맞지 않아요. 등록한 선생님은 이름도 적어 주세요.");
    Object.assign(T, { role: "admin", owner: "admin", tname: "관리자" });
  } else {
    const acc = await getDoc(doc(db, "teacherAccounts", name)).catch(() => null);
    if (!acc || !acc.exists()) throw userErr("등록되지 않은 이름이에요. 먼저 선생님으로 등록해 주세요.");
    if (!acc.get("approved")) throw userErr("아직 관리자 승인을 기다리는 중이에요.");
    const k = await sha256(`angels-teacher-acc:${name}:${pw}`);
    try { await setDoc(doc(db, "tsessions", user.uid), { name, k, at: serverTimestamp() }); }
    catch (e) { console.warn(e); throw userErr("비밀번호가 맞지 않아요."); }
    Object.assign(T, { role: "teacher", owner: name, tname: name });
    localStorage.setItem("angel_teacher_name", name);
  }
  startTeacher(await pickRoom());
}
const roomKey = () => "angel_teacher_room_" + T.owner;
const canUseRoom = (r) => T.role === "admin" || (r && r.owner === T.owner);
async function pickRoom() {
  let code = localStorage.getItem(roomKey());
  if (code) {
    const s = await getDoc(doc(db, "rooms", code)).catch(() => null);
    if (!s || !s.exists() || !canUseRoom(s.data())) code = null;
  }
  if (!code) {
    const qs = await getDocs(collection(db, "rooms")).catch(() => null);
    const mine = qs ? qs.docs.filter((d) => (d.data().owner || "admin") === T.owner)
      .sort((a, b) => (ms(b.data().touchedAt) || 0) - (ms(a.data().touchedAt) || 0)) : [];
    code = mine.length ? mine[0].id : await createRoom(T.role === "teacher" ? T.owner + " 선생님 방" : "");
  }
  return code;
}

async function createRoom(memo = "") {
  for (let i = 0; i < 20; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const ref = doc(db, "rooms", code);
    const s = await getDoc(ref);
    if (s.exists()) continue;
    await setDoc(ref, {
      status: "waiting", round: 0, game: "fence", level: 1, times: DEFAULT_TIMES, pts: DEFAULT_PTS, wg: DEFAULT_WG, turnSec: DEFAULT_TURN,
      teamCount: 0, used: {}, memo: String(memo).slice(0, 30), owner: T.owner || "admin", createdAt: serverTimestamp(), touchedAt: serverTimestamp()
    });
    return code;
  }
  throw userErr("방을 만들지 못했어요. 다시 시도해 주세요.");
}

function stopTeacher() { T.unsubs.forEach((u) => u()); T.unsubs = []; clearInterval(T.tick); }

async function startTeacher(code) {
  stopTeacher();
  localStorage.setItem(roomKey(), code);
  $("tWho").textContent = T.role === "admin" ? "👑 관리자" : `🧑‍🏫 ${T.tname} 선생님`;
  $("tAdminBtn").classList.toggle("hidden", T.role !== "admin");
  const roomRef = doc(db, "rooms", code);
  Object.assign(T, { code, roomRef, room: null, players: [], matches: [], graded: new Map(), queue: Promise.resolve(), ending: false, sel: null, game: null, boardKey: null, answer: false, autoTry: new Map() });
  $("tCode").textContent = code;
  hideExplain();
  showScreen("teacher");
  await syncClock(roomRef, "touchedAt");
  T.unsubs.push(onSnapshot(roomRef, (s) => {
    if (!s.exists()) return;
    T.room = s.data(EST);
    $("tMemo").textContent = T.room.memo || "";
    $("tMemo").classList.toggle("hidden", !T.room.memo);
    if (T.sel === null || T.sel > PUZZLES.length) T.sel = Math.min(T.room.level || 1, PUZZLES.length);
    if (T.game === null) T.game = GAMES[T.room.game] ? T.room.game : "fence";
    renderTeacher(); gradePending(); gradeMatches();
  }));
  T.unsubs.push(onSnapshot(collection(db, "rooms", code, "players"), (qs) => {
    T.players = qs.docs.map((d) => ({ id: d.id, ...d.data(EST) }));
    renderTeacher(); gradePending(); gradeMatches();
  }));
  T.unsubs.push(onSnapshot(collection(db, "rooms", code, "matches"), (qs) => {
    T.matches = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTeacher(); gradeMatches();
  }));
  T.tick = setInterval(teacherTick, 250);
  if (T.role === "admin") {
    T.unsubs.push(onSnapshot(collection(db, "teacherAccounts"), (qs) => {
      T.accounts = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      const n = T.accounts.filter((a) => !a.approved).length;
      $("tPendingCnt").textContent = n ? n : "";
      if (!$("adminModal").classList.contains("hidden")) renderAdmin();
    }, (e) => console.warn("교사 목록", e)));
  }
}

const pRefOf = (id) => doc(db, "rooms", T.code, "players", id);
const mRefOf = (id) => doc(db, "rooms", T.code, "matches", id);
const times = () => { const t = T.room && T.room.times; return Array.isArray(t) && t.length === PUZZLES.length ? t : DEFAULT_TIMES; };
const pts = () => {
  const p = (T.room && T.room.pts) || {};
  return { base: Number.isFinite(p.base) ? p.base : DEFAULT_PTS.base, top: Number.isFinite(p.top) ? p.top : DEFAULT_PTS.top, mult: typeof p.mult === "boolean" ? p.mult : DEFAULT_PTS.mult };
};
const wgPts = () => ({ ...DEFAULT_WG, ...((T.room && T.room.wg) || {}) });
const turnSec = () => (T.room && T.room.turnSec) || DEFAULT_TURN;
const roundMatches = () => (T.room ? T.matches.filter((m) => m.round === T.room.round) : []);

function playerState(p, r) {
  if (!r || r.round < 1) return { cls: "", txt: "대기 중" };
  const res = p.result && p.result.round === r.round ? p.result : (T.graded.get(r.round + "|" + p.id) || null);
  if (r.game === "wallgo") {
    if (res && res !== "pending") {
      const o = res.outcome;
      return { cls: o === "lose" ? "bad" : "ok", txt: { win: "🏆 승리", draw: "🤝 무승부", lose: "😢 패배", bye: "🍀 부전승" }[o] + ` +${res.points}`, done: true };
    }
    const mt = p.mt && p.mt.round === r.round ? p.mt : null;
    if (!mt) return { cls: "", txt: r.status === "playing" ? "다음 게임부터" : "대기 중", done: r.status === "playing", spectator: true };
    const m = T.matches.find((x) => x.id === mt.id);
    if (m && m.phase === "done") return { cls: "wait", txt: "점수 계산 중…" };
    return { cls: "", txt: `⚔️ 대결 중`, solving: true };
  }
  if (res && res !== "pending") {
    if (res.correct) return { cls: "ok", txt: `✅ ${res.rank}등 · +${res.points}점`, done: true, ok: true };
    if (res.reason === "wrong") return { cls: "bad", txt: "❌ 오답", done: true, bad: true };
    return { cls: "bad", txt: "⏰ 시간 초과", done: true, late: true };
  }
  if (p.sub && p.sub.round === r.round) return { cls: "wait", txt: "📮 채점 중…" };
  if (r.status === "playing") return { cls: "", txt: "✏️ 푸는 중", solving: true };
  return { cls: "", txt: "대기 중" };
}

function renderTeacher() {
  const r = T.room;
  if (!r) return;
  const playing = r.status === "playing";
  const game = playing ? r.game : T.game;
  $("tCount").textContent = T.players.length;

  // 게임 고르기
  $("gameTabs").innerHTML = Object.entries(GAMES).map(([id, g]) =>
    `<button class="game-tab ${id === game ? "active" : ""}" data-game="${id}" ${playing ? "disabled" : ""}><span>${g.icon}</span>${g.name}</button>`).join("");
  $("gameDesc").textContent = GAMES[game].desc;
  $("fencePanel").classList.toggle("hidden", game !== "fence");
  $("wgPanel").classList.toggle("hidden", game !== "wallgo");

  // 울타리치기 단계
  $("levelBtns").innerHTML = PUZZLES.map((L, i) => {
    const lv = i + 1, info = levelInfo(lv);
    return `<button class="level-btn ${info.tut ? "tut" : ""} ${lv === T.sel ? "active" : ""}" data-lv="${lv}" ${playing ? "disabled" : ""}>
      <b>${info.tut ? "🐣 " : ""}${info.name}</b>${info.size}<br><small>${info.kind} · ${fmtTime(times()[i])}${pts().mult ? ` · ×${LEVEL_MULT[i]}` : ""}</small></button>`;
  }).join("");
  $("timeLabel").textContent = fmtTime(times()[T.sel - 1]);
  $("turnLabel").textContent = `${turnSec()}초`;
  ["timeMinus", "timePlus", "turnMinus", "turnPlus"].forEach((id) => ($(id).disabled = playing));
  $("startBtn").classList.toggle("hidden", playing);
  $("endBtn").classList.toggle("hidden", !playing);
  $("startBtn").textContent = `▶ ${GAMES[game].name} ${r.round > 0 ? r.round + 1 + "라운드 " : ""}스타트`;

  // 설명 중이면 설명 화면 (선생님이 넘김)
  if (r.explain) showExplain(r, true); else hideExplain();
  $("explainBtn").classList.toggle("hidden", playing);
  $("explainBtn").textContent = `📖 ${GAMES[game].name} 게임 설명 시작`;
  // 팀: 팀 게임에서만
  const teamGame = !!GAMES[game].team;
  $("teamCard").classList.toggle("hidden", !teamGame);
  const tc = teamGame ? r.teamCount || 0 : 0;
  $("teamCountBtns").innerHTML = [0, 2, 3, 4, 5, 6].map((n) =>
    `<button class="tc-btn ${n === tc ? "active" : ""}" data-tc="${n}">${n ? n + "팀" : "팀 없음"}</button>`).join("");
  $("teamSplitBtn").classList.toggle("hidden", !tc);

  // 울타리치기 문제판 / 벽바둑 대결 현황
  const showPuzzle = r.round > 0 && r.game === "fence" && r.puzzle;
  $("tPuzzleCard").classList.toggle("hidden", !showPuzzle);
  if (showPuzzle) {
    $("tRoundInfo").textContent = `${r.round}라운드 · 울타리치기 · ${levelLabel(r.level)}${r.status === "ended" ? " · 끝" : ""}`;
    if (T.boardKey !== r.round) { T.boardKey = r.round; T.answer = false; tBoard.load(r.puzzle.w, r.puzzle.h, r.puzzle.c); }
    $("answerBtn").classList.toggle("hidden", r.status !== "ended");
    $("answerBtn").textContent = T.answer ? "🙈 정답 숨기기" : "✅ 정답 보기";
  }
  if (!playing) { $("tTimer").textContent = ""; $("tTimer").classList.remove("warn"); }
  renderMatches();

  // 학생 카드 (팀이 있으면 팀별로 묶어서)
  const list = ranked(T.players.map((p) => ({ ...p })));
  let nOk = 0, nBad = 0, nSolve = 0, nWait = 0;
  const card = (p) => {
    const st = playerState(p, r);
    if (st.ok || (st.done && st.cls === "ok")) nOk++; else if (st.done && !st.spectator) nBad++; else if (st.solving) nSolve++; else if (st.cls === "wait") nWait++;
    const t = teamOf(p, tc);
    return `<div class="pc ${st.cls}">
      <div class="pc-top"><span class="pc-head"><span class="pc-av">${avHTML(p)}</span><span class="pc-name">${esc(p.name)}</span></span><span class="pc-score">${p.score || 0}점</span></div>
      <div class="pc-rank">${p.rank}등 ${tc ? `<button class="team-badge" data-team="${esc(p.id)}" title="눌러서 팀 바꾸기">${t ? TEAMS[t].icon + " " + TEAMS[t].name.replace(" 천사팀", "") : "팀 없음"}</button>` : ""}</div>
      <div class="pc-st">${st.txt}</div>
      <button class="kick" data-kick="${esc(p.id)}" title="내보내기">✕</button>
    </div>`;
  };
  const grouped = tc > 0 && list.some((p) => teamOf(p, tc));
  let html = "";
  if (!list.length) html = `<div class="empty">학생들이 방 번호 <b>${esc(T.code)}</b>로 들어오면 여기에 나타나요.</div>`;
  else if (grouped) {
    const tr = teamRanking(T.players, tc);
    for (const x of tr) {
      const mem = list.filter((p) => teamOf(p, tc) === x.t);
      html += `<div class="team-group t${x.t}">${teamLabel(x.t)} <small>${mem.length}명 · 평균 ${x.avg}점 · 팀 ${x.rank}등</small></div>` + mem.map(card).join("");
    }
    const none = list.filter((p) => !teamOf(p, tc));
    if (none.length) html += `<div class="team-group t0">팀 없음 <small>${none.length}명</small></div>` + none.map(card).join("");
  } else html = list.map(card).join("");
  $("tPlayers").innerHTML = html;
  // 점수 순위 목록
  const medal = (n) => (n === 1 ? "🥇" : n === 2 ? "🥈" : n === 3 ? "🥉" : n);
  $("tRankList").innerHTML = list.map((p) => {
    const w = wingInfo(p.score || 0);
    return `<li class="${p.rank <= 3 ? "top" + p.rank : ""}"><span class="no">${medal(p.rank)}</span><span class="pc-av">${avHTML(p)}</span><span class="nm">${esc(p.name)}<small>🪽 ${w.name}</small></span><span class="sc">${p.score || 0}</span></li>`;
  }).join("") || `<li>아직 학생이 없어요.</li>`;
  $("tSummary").textContent = r.round > 0
    ? (r.game === "wallgo" ? `대결 ${roundMatches().filter((m) => m.phase === "done").length} / ${roundMatches().length} 끝`
      : `정답 ${nOk} · 틀림/시간 초과 ${nBad} · 채점 중 ${nWait} · 푸는 중 ${nSolve}`) : "";
  if (!$("rankOverlay").classList.contains("hidden")) renderBigRank();
}

function renderMatches() {
  const r = T.room;
  const show = r && r.round > 0 && r.game === "wallgo";
  $("tMatchesWrap").classList.toggle("hidden", !show);
  if (!show) return;
  const ms_ = roundMatches().sort((a, b) => Number(a.id.split("-")[1]) - Number(b.id.split("-")[1]));
  const byes = T.players.filter((p) => p.mt && p.mt.round === r.round && p.mt.bye);
  $("tMatchInfo").textContent = `${r.round}라운드 · 벽바둑 1 · 한 수 ${r.turnSec || DEFAULT_TURN}초${r.status === "ended" ? " · 끝" : ""}`;
  $("tMatches").innerHTML = ms_.map((m, i) => {
    let st, cls = "";
    if (m.phase === "done") {
      const w = m.winner === "a" ? m.a : m.winner === "b" ? m.b : null;
      st = w ? `끝 · <b>${esc(w)}</b> 승 (${Math.max(m.scoreA, m.scoreB)}:${Math.min(m.scoreA, m.scoreB)})` : `끝 · 무승부 (${m.scoreA}:${m.scoreB})`;
      if (m.forced) st += " · 시간 종료";
      cls = "done";
    } else if (m.phase === "place") st = "말 놓는 중";
    else st = `경기 중 · ${Math.max(1, m.moveNo - 3)}수째`;
    const wa = m.phase === "done" && m.winner === "a", wb = m.phase === "done" && m.winner === "b";
    return `<div class="mc ${cls}">
      <span class="mc-no">${i + 1}</span>
      <span class="mc-p side-a ${wa ? "win" : ""}">${esc(m.a)}</span><span class="mc-vs">vs</span><span class="mc-p side-b ${wb ? "win" : ""}">${esc(m.b)}</span>
      <span class="mc-st">${st}</span></div>`;
  }).join("") + byes.map((p) => `<div class="mc done bye"><span class="mc-no">🍀</span><span class="mc-p">${esc(p.name)}</span><span class="mc-st">부전승</span></div>`).join("");
}

function renderBigRank() {
  const tab = $("rankOverlay").dataset.tab || "solo";
  const g = T.room && GAMES[T.room.status === "playing" ? T.room.game : T.game];
  const tc = g && g.team ? (T.room.teamCount || 0) : 0;
  $("rankTabs").classList.toggle("hidden", !tc);
  document.querySelectorAll(".rank-tab").forEach((b) => b.classList.toggle("active", b.dataset.rt === (tc ? tab : "solo")));
  const medal = (n) => (n === 1 ? "🥇" : n === 2 ? "🥈" : n === 3 ? "🥉" : n);
  if (tc && tab === "team") {
    $("bigRank").className = "big-rank teams";
    $("bigRank").innerHTML = teamRanking(T.players, tc).map((x) =>
      `<li class="${x.rank <= 3 ? "top" + x.rank : ""}"><span class="no">${medal(x.rank)}</span><span class="nm">${teamLabel(x.t)} <small>${x.n}명</small></span><span class="sc">평균 ${x.avg}점</span></li>`).join("");
    return;
  }
  $("bigRank").className = "big-rank";
  $("bigRank").innerHTML = ranked(T.players.map((p) => ({ ...p }))).map((p) =>
    `<li class="${p.rank <= 3 ? "top" + p.rank : ""}"><span class="no">${medal(p.rank)}</span><span class="big-av">${avHTML(p)}</span><span class="nm">${esc(p.name)}</span><span class="sc">${p.score || 0}점</span></li>`
  ).join("") || "<li>아직 학생이 없어요.</li>";
}

function teacherTick() {
  const r = T.room;
  if (!r || r.status !== "playing") return;
  if (r.game === "wallgo") {
    $("tTimer").textContent = "";
    // 두 기기가 다 멈춘 대결은 교사 화면이 대신 둠
    for (const m of roundMatches()) {
      if (m.phase === "done" || turnLeft(m, m.id) > -7) continue;
      const last = T.autoTry.get(m.id) || 0;
      if (Date.now() - last < 4000) continue;
      T.autoTry.set(m.id, Date.now());
      const exp = m.moveNo;
      wgAct(mRefOf(m.id), (x) => (x.moveNo === exp && x.phase !== "done" ? WG.randomAction(x) : null))
        .then((res) => { if (res.err === "permission-denied") toast("벽바둑 대결 저장이 보안 규칙에 막혔어요. angels-plan 규칙을 다시 게시해 주세요."); });
    }
    const ms_ = roundMatches();
    if (ms_.length && ms_.every((m) => m.phase === "done") && T.players.every((p) => playerState(p, r).done)) endRound();
    if (!ms_.length && T.players.every((p) => playerState(p, r).done)) endRound();
    return;
  }
  const end = endAtOf(r);
  if (end === null) return;
  const left = (end - now()) / 1000;
  $("tTimer").textContent = fmtTime(left);
  $("tTimer").classList.toggle("warn", left <= 10 && left > 0);
  if (now() > end + GRACE_MS + 800) return endRound();
  if (T.players.length && T.players.every((p) => playerState(p, r).done)) endRound();
}

// ----- 울타리치기 채점 -----
function gradePending() {
  const r = T.room;
  if (!r || r.status !== "playing" || r.game !== "fence") return;
  const round = r.round;
  const pend = T.players
    .filter((p) => p.sub && p.sub.round === round && ms(p.sub.at) && !(p.result && p.result.round === round) && !T.graded.has(round + "|" + p.id))
    .sort((a, b) => ms(a.sub.at) - ms(b.sub.at));
  for (const p of pend) {
    T.graded.set(round + "|" + p.id, "pending");
    T.queue = T.queue.then(() => gradeOne(p, round)).catch((e) => { console.error(e); T.graded.delete(round + "|" + p.id); });
  }
}
function correctCount(round) {
  const names = new Set();
  T.players.forEach((p) => { if (p.result && p.result.round === round && p.result.correct) names.add(p.id); });
  T.graded.forEach((v, k) => { if (v && v.correct && k.startsWith(round + "|")) names.add(k.slice(k.indexOf("|") + 1)); });
  return names.size;
}
async function gradeOne(p, round) {
  const r = T.room;
  if (!r || r.round !== round) return;
  const end = endAtOf(r);
  const late = end !== null && ms(p.sub.at) > end + GRACE_MS;
  const ok = !late && checkSolution(r.puzzle.w, r.puzzle.h, r.puzzle.c, decodeEdges(p.sub.edges));
  let rank = 0, points = 0;
  if (ok) { rank = correctCount(round) + 1; points = calcPoints(pts(), rank, r.level); }
  const result = { round, game: "fence", correct: ok, rank, points, reason: ok ? "ok" : late ? "late" : "wrong" };
  T.graded.set(round + "|" + p.id, result);
  await updateDoc(pRefOf(p.id), { result, score: increment(points) });
}

// ----- 벽바둑 점수 -----
function wgResult(m, side, round) {
  const P = wgPts();
  const o = m.winner === "draw" ? "draw" : m.winner === side ? "win" : "lose";
  return { round, game: "wallgo", outcome: o, points: P[o], my: side === "a" ? m.scoreA : m.scoreB, opp: side === "a" ? m.scoreB : m.scoreA, vs: side === "a" ? m.b : m.a };
}
function gradeMatches() {
  const r = T.room;
  if (!r || r.status !== "playing" || r.game !== "wallgo") return;
  const round = r.round;
  for (const m of roundMatches()) {
    if (m.phase !== "done") continue;
    for (const side of ["a", "b"]) {
      const name = m[side], key = round + "|" + name;
      const p = T.players.find((x) => x.id === name);
      if (!p || (p.result && p.result.round === round) || T.graded.has(key)) continue;
      const result = wgResult(m, side, round);
      T.graded.set(key, result);
      T.queue = T.queue.then(() => updateDoc(pRefOf(name), { result, score: increment(result.points) }))
        .catch((e) => { console.error(e); T.graded.delete(key); });
    }
  }
}

async function endRound() {
  const r = T.room;
  if (T.ending || !r || r.status !== "playing") return;
  T.ending = true;
  try {
    const round = r.round;
    const batch = writeBatch(db);
    if (r.game === "wallgo") {
      gradeMatches();
      await T.queue;
      for (const m of roundMatches()) {
        let mm = m;
        if (m.phase !== "done") { const f = WG.forceFinish(m); batch.update(mRefOf(m.id), { ...f, endedAt: now() }); mm = { ...m, ...f }; }
        for (const side of ["a", "b"]) {
          const name = mm[side], key = round + "|" + name;
          const p = T.players.find((x) => x.id === name);
          if (!p || (p.result && p.result.round === round) || T.graded.has(key)) continue;
          const result = wgResult(mm, side, round);
          T.graded.set(key, result);
          batch.update(pRefOf(name), { result, score: increment(result.points) });
        }
      }
    } else {
      gradePending();
      await T.queue;
      T.players.forEach((p) => {
        const has = (p.result && p.result.round === round) || T.graded.has(round + "|" + p.id);
        const sub = p.sub && p.sub.round === round;
        if (!has && !sub) batch.update(pRefOf(p.id), { result: { round, game: "fence", correct: false, rank: 0, points: 0, reason: "timeout" } });
      });
    }
    batch.update(T.roomRef, { status: "ended", endedAt: serverTimestamp() });
    await batch.commit();
  } catch (e) {
    console.error(e); toast("라운드를 끝내지 못했어요. 다시 눌러 주세요.");
  } finally { T.ending = false; }
}

async function startFence() {
  const r = T.room;
  const lv = T.sel, L = PUZZLES[lv - 1];
  const used = (r.used && r.used["L" + lv]) || [];
  let cand = L.puzzles.map((_, i) => i).filter((i) => !used.includes(i));
  const reset = !cand.length;
  if (reset) cand = L.puzzles.map((_, i) => i);
  const pid = cand[Math.floor(Math.random() * cand.length)];
  await updateDoc(T.roomRef, {
    status: "playing", game: "fence", round: (r.round || 0) + 1, level: lv, pid,
    puzzle: { w: L.w, h: L.h, c: L.puzzles[pid].c },
    startAt: serverTimestamp(), duration: times()[lv - 1], explain: deleteField(),
    [`used.L${lv}`]: reset ? [pid] : arrayUnion(pid)
  });
}

async function startWallgo() {
  const r = T.room;
  const list = [...T.players];
  if (list.length < 2) return toast("벽바둑은 2명 이상 들어와야 시작할 수 있어요.");
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const round = (r.round || 0) + 1, sec = turnSec(), P = wgPts();
  const batch = writeBatch(db);
  let n = 0;
  for (let i = 0; i + 1 < list.length; i += 2) {
    n++;
    const id = `${round}-${n}`, a = list[i].id, b = list[i + 1].id;
    batch.set(mRefOf(id), {
      round, a, b, phase: "place", turn: WG.PLACE_ORDER[0], placeNo: 0, moveNo: 0, turnSec: sec,
      stones: { a: [...WG.START.a, -1, -1], b: [...WG.START.b, -1, -1] }, walls: WG.emptyWalls()
    });
    batch.update(pRefOf(a), { mt: { round, id, side: "a" } });
    batch.update(pRefOf(b), { mt: { round, id, side: "b" } });
  }
  if (list.length % 2) {
    const p = list[list.length - 1];
    const result = { round, game: "wallgo", outcome: "bye", points: P.win };
    batch.update(pRefOf(p.id), { mt: { round, bye: true }, result, score: increment(P.win) });
    T.graded.set(round + "|" + p.id, result);
  }
  batch.update(T.roomRef, { status: "playing", game: "wallgo", round, startAt: serverTimestamp(), turnSec: sec, explain: deleteField() });
  await batch.commit();
}

async function startRound() {
  const r = T.room;
  if (!r || r.status === "playing") return;
  $("startBtn").disabled = true;
  try { if (T.game === "wallgo") await startWallgo(); else await startFence(); }
  catch (e) { console.error(e); toast("시작하지 못했어요. 다시 눌러 주세요."); }
  finally { $("startBtn").disabled = false; }
}

// ----- 교사 버튼 -----
$("gameTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-game]");
  if (!b || b.disabled) return;
  T.game = b.dataset.game; renderTeacher();
});
$("levelBtns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-lv]");
  if (!b || b.disabled) return;
  T.sel = Number(b.dataset.lv); renderTeacher();
});
function changeTime(d) {
  const arr = [...times()];
  arr[T.sel - 1] = Math.min(1800, Math.max(30, arr[T.sel - 1] + d));
  updateDoc(T.roomRef, { times: arr }).catch(() => toast("시간을 바꾸지 못했어요."));
}
$("timeMinus").addEventListener("click", () => changeTime(-30));
$("timePlus").addEventListener("click", () => changeTime(30));
function changeTurn(d) {
  updateDoc(T.roomRef, { turnSec: Math.min(120, Math.max(10, turnSec() + d)) }).catch(() => toast("시간을 바꾸지 못했어요."));
}
$("turnMinus").addEventListener("click", () => changeTurn(-5));
$("turnPlus").addEventListener("click", () => changeTurn(5));
$("startBtn").addEventListener("click", startRound);
$("explainBtn").addEventListener("click", () => {
  if (!T.room || T.room.status === "playing") return;
  updateDoc(T.roomRef, { explain: { game: T.game, step: 0 } }).catch(() => toast("설명을 시작하지 못했어요."));
});
function exGo(d) {
  const ex = T.room && T.room.explain;
  if (!ex) return;
  const n = EXPLAIN[ex.game].length, step = (ex.step || 0) + d;
  if (step >= n) return exStop();
  updateDoc(T.roomRef, { "explain.step": Math.max(0, step) }).catch(() => toast("넘기지 못했어요."));
}
function exStop() { updateDoc(T.roomRef, { explain: deleteField() }).catch(() => toast("설명을 끝내지 못했어요.")); }
$("exPrev").addEventListener("click", () => exGo(-1));
$("exNext").addEventListener("click", () => exGo(1));
$("exEnd").addEventListener("click", exStop);
$("endBtn").addEventListener("click", async () => {
  const msg = T.room && T.room.game === "wallgo"
    ? "지금 라운드를 끝낼까요?\n아직 끝나지 않은 대결은 지금까지 만든 땅 넓이로 승부를 정해요."
    : "지금 라운드를 끝낼까요?\n아직 제출하지 않은 학생은 0점이에요.";
  if (await confirmBox(msg, "끝내기")) endRound();
});
$("answerBtn").addEventListener("click", () => {
  const r = T.room;
  if (!r || !r.puzzle) return;
  const ans = answerOf(r);
  if (!ans) return toast("이 라운드의 정답을 찾을 수 없어요.");
  T.answer = !T.answer;
  tBoard.showAnswer(T.answer ? ans : null);
  renderTeacher();
});
$("tPlayers").addEventListener("click", async (e) => {
  const tb = e.target.closest("[data-team]");
  if (tb) {
    const tc = (T.room && T.room.teamCount) || 0;
    const p = T.players.find((x) => x.id === tb.dataset.team);
    const next = (teamOf(p, tc) % tc) + 1;
    updateDoc(pRefOf(tb.dataset.team), { team: next }).catch(() => toast("팀을 바꾸지 못했어요."));
    return;
  }
  const b = e.target.closest("[data-kick]");
  if (!b) return;
  const id = b.dataset.kick;
  if (await confirmBox(`${id} 학생을 방에서 내보낼까요?\n점수도 함께 지워져요.`, "내보내기")) deleteDoc(pRefOf(id)).catch(() => toast("내보내지 못했어요."));
});
// 팀
$("teamCountBtns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tc]");
  if (!b) return;
  updateDoc(T.roomRef, { teamCount: Number(b.dataset.tc) }).catch(() => toast("팀 수를 바꾸지 못했어요."));
});
$("teamSplitBtn").addEventListener("click", async () => {
  const tc = (T.room && T.room.teamCount) || 0;
  if (!tc || !T.players.length) return toast("학생이 들어온 뒤에 나눌 수 있어요.");
  if (T.players.some((p) => teamOf(p, tc)) && !(await confirmBox(`지금 팀을 지우고 ${tc}팀으로 다시 나눌까요?`, "다시 나누기"))) return;
  const list = [...T.players];
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const batch = writeBatch(db);
  list.forEach((p, i) => batch.update(pRefOf(p.id), { team: (i % tc) + 1 }));
  try { await batch.commit(); toast(`${tc}팀으로 나눴어요.`); } catch (e) { toast("팀을 나누지 못했어요."); }
});
// 순위판
$("tRankBtn").addEventListener("click", () => { renderBigRank(); $("rankOverlay").classList.remove("hidden"); });
$("rankClose").addEventListener("click", () => $("rankOverlay").classList.add("hidden"));
$("rankTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rt]");
  if (!b) return;
  $("rankOverlay").dataset.tab = b.dataset.rt; renderBigRank();
});
// 점수 설정
$("tPtsBtn").addEventListener("click", () => {
  const P = pts(), W = wgPts();
  $("ptsBase").value = P.base; $("ptsTop").value = P.top; $("ptsMult").checked = P.mult;
  $("wgWin").value = W.win; $("wgDraw").value = W.draw; $("wgLose").value = W.lose;
  ptsPreview();
  $("ptsModal").classList.remove("hidden");
});
$("ptsCancel").addEventListener("click", () => $("ptsModal").classList.add("hidden"));
function readPts() { return { base: Math.round(Number($("ptsBase").value)), top: Math.round(Number($("ptsTop").value)), mult: $("ptsMult").checked }; }
function readWg() { return { win: Math.round(Number($("wgWin").value)), draw: Math.round(Number($("wgDraw").value)), lose: Math.round(Number($("wgLose").value)) }; }
function ptsPreview() {
  const P = readPts();
  if (!(P.base >= 1 && P.top >= 0)) { $("ptsPreview").textContent = ""; return; }
  const lv = T.sel || 3, I = levelInfo(lv);
  const ranks = [1, 2, 3, P.top + 1].filter((v, k, a) => a.indexOf(v) === k);
  $("ptsPreview").textContent = `예) ${I.name}: ` + ranks.map((r) => `${r === P.top + 1 ? `${r}등부터` : `${r}등`} ${calcPoints(P, r, lv)}점`).join(" · ") + " · 오답 0점";
}
["ptsBase", "ptsTop", "ptsMult"].forEach((id) => $(id).addEventListener("input", ptsPreview));
$("ptsSave").addEventListener("click", async () => {
  const P = readPts(), W = readWg();
  if (!(P.base >= 1 && P.base <= 100 && P.top >= 0 && P.top <= 30)) return toast("울타리치기: 기본 점수는 1~100, 보너스 등수는 0~30으로 정해 주세요.");
  if (![W.win, W.draw, W.lose].every((v) => v >= 0 && v <= 100)) return toast("벽바둑 점수는 0~100으로 정해 주세요.");
  try { await updateDoc(T.roomRef, { pts: P, wg: W }); $("ptsModal").classList.add("hidden"); toast("점수 설정을 저장했어요."); }
  catch (e) { toast("저장하지 못했어요."); }
});
// 새 이벤트 시작: 점수·팀·대결 기록 초기화 (방과 학생 명단은 그대로)
$("tResetBtn").addEventListener("click", async () => {
  if (T.room && T.room.status === "playing") return toast("라운드가 끝난 뒤에 시작할 수 있어요.");
  if (!(await confirmBox("새 이벤트를 시작할까요?\n모든 학생의 점수와 팀이 초기화돼요.", "새 이벤트 시작"))) return;
  try {
    const batch = writeBatch(db);
    T.players.forEach((p) => batch.update(pRefOf(p.id), { score: 0, result: deleteField(), sub: deleteField(), mt: deleteField(), team: deleteField(), edges: "" }));
    T.matches.forEach((m) => batch.delete(mRefOf(m.id)));
    batch.update(T.roomRef, { status: "waiting", round: 0, used: {} });
    await batch.commit();
    T.graded = new Map();
    toast("새 이벤트를 시작했어요!");
  } catch (e) { console.error(e); toast("초기화하지 못했어요."); }
});

// ----- 방 관리: 여러 방을 두고 바꿔 쓰기, 방마다 메모 -----
const fmtDate = (t) => { const d = new Date(t); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
async function renderRooms() {
  const box = $("roomList");
  box.innerHTML = `<div class="empty">방 목록을 불러오는 중…</div>`;
  try {
    const qs = await getDocs(collection(db, "rooms"));
    const rooms = qs.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => T.role === "admin" || r.owner === T.owner)
      .sort((a, b) => (a.id === T.code ? -1 : b.id === T.code ? 1 : (ms(b.touchedAt) || 0) - (ms(a.touchedAt) || 0)));
    box.innerHTML = rooms.map((r) => {
      const cur = r.id === T.code, made = ms(r.createdAt), used = ms(r.touchedAt);
      return `<div class="room-item ${cur ? "current" : ""}">
        <span class="rc">${esc(r.id)}</span>
        <input class="memo-in" data-memo="${esc(r.id)}" maxlength="30" placeholder="메모 (예: 6학년 3반)" value="${esc(r.memo || "")}">
        ${cur ? `<span class="now">지금 방</span>` : `<button class="btn primary small" data-use="${esc(r.id)}">이 방으로</button>`}
        <button class="btn ghost small" data-del="${esc(r.id)}">지우기</button>
        <span class="meta">${T.role === "admin" ? `<span class="room-owner">${esc(!r.owner || r.owner === "admin" ? "👑 관리자" : r.owner + " 선생님")}</span> ` : ""}${made ? "만든 날 " + fmtDate(made) : ""}${used ? " · 마지막 사용 " + fmtDate(used) : ""} · ${r.round || 0}라운드 진행</span>
      </div>`;
    }).join("") || `<div class="empty">아직 방이 없어요.</div>`;
  } catch (e) { console.error(e); box.innerHTML = `<div class="empty">방 목록을 불러오지 못했어요.</div>`; }
}
async function saveMemo(input) {
  const code = input.dataset.memo, memo = input.value.trim().slice(0, 30);
  if (input.dataset.saved === memo) return;
  try { await updateDoc(doc(db, "rooms", code), { memo }); input.dataset.saved = memo; toast(`방 ${code} 메모를 저장했어요.`); }
  catch (e) { toast("메모를 저장하지 못했어요."); }
}
async function leaveCurrentRoomOk() {
  if (T.room && T.room.status === "playing") return confirmBox("지금 라운드가 진행 중이에요.\n방을 바꾸면 이 라운드 채점이 멈춰요. 그래도 바꿀까요?", "바꾸기");
  return true;
}
$("tNewRoomBtn").addEventListener("click", () => { $("newRoomMemo").value = ""; $("roomsModal").classList.remove("hidden"); renderRooms(); });
$("roomsClose").addEventListener("click", () => $("roomsModal").classList.add("hidden"));
$("roomList").addEventListener("focusin", (e) => { const inp = e.target.closest("[data-memo]"); if (inp && inp.dataset.saved === undefined) inp.dataset.saved = inp.value.trim(); });
$("roomList").addEventListener("change", (e) => { const inp = e.target.closest("[data-memo]"); if (inp) saveMemo(inp); });
$("roomList").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest("[data-memo]")) e.target.blur(); });
$("roomList").addEventListener("click", async (e) => {
  const use = e.target.closest("[data-use]"), del = e.target.closest("[data-del]");
  if (use) {
    if (!(await leaveCurrentRoomOk())) return;
    $("roomsModal").classList.add("hidden");
    startTeacher(use.dataset.use);
    toast(`방 ${use.dataset.use}(으)로 바꿨어요.`);
  } else if (del) {
    const code = del.dataset.del, cur = code === T.code;
    if (cur && T.room && T.room.status === "playing") return toast("라운드가 끝난 뒤에 지울 수 있어요.");
    if (!(await confirmBox(`방 ${code}을(를) 지울까요?\n학생 점수도 모두 지워지고, 되돌릴 수 없어요.`, "지우기"))) return;
    try {
      const batch = writeBatch(db);
      for (const sub of ["players", "matches"]) {
        const qs = await getDocs(collection(db, "rooms", code, sub));
        qs.docs.forEach((d) => batch.delete(doc(db, "rooms", code, sub, d.id)));
      }
      batch.delete(doc(db, "rooms", code));
      if (cur) stopTeacher();
      await batch.commit();
      toast(`방 ${code}을(를) 지웠어요.`);
      if (cur) {
        const left = await getDocs(collection(db, "rooms"));
        const mine = left.docs.filter((d) => T.role === "admin" || d.data().owner === T.owner);
        startTeacher(mine.length ? mine[0].id : await createRoom());
      }
      renderRooms();
    } catch (e) { console.error(e); toast("방을 지우지 못했어요."); }
  }
});
$("newRoomBtn").addEventListener("click", async () => {
  if (!(await leaveCurrentRoomOk())) return;
  $("newRoomBtn").disabled = true;
  try {
    const code = await createRoom($("newRoomMemo").value.trim());
    $("roomsModal").classList.add("hidden");
    startTeacher(code);
    toast(`새 방 ${code}을(를) 만들었어요.`);
  } catch (e) { toast(e.userMsg || "새 방을 만들지 못했어요."); }
  finally { $("newRoomBtn").disabled = false; }
});
$("tLeave").addEventListener("click", async () => {
  stopTeacher(); hideExplain(); showScreen("entry");
  if (T.role === "teacher" && user) deleteDoc(doc(db, "tsessions", user.uid)).catch(() => {});
});
// ----- 관리자: 교사 승인 -----
function renderAdmin() {
  const acc = (T.accounts || []).slice().sort((a, b) => (ms(b.createdAt) || 0) - (ms(a.createdAt) || 0));
  const row = (a, btns) => `<div class="acc"><b>${esc(a.name)}</b><small>${esc(a.school || "")}${ms(a.createdAt) ? " · 신청 " + fmtDate(ms(a.createdAt)) : ""}</small>${btns}</div>`;
  const pend = acc.filter((a) => !a.approved), ok = acc.filter((a) => a.approved);
  $("adminPending").innerHTML = pend.map((a) => row(a, `<button class="btn primary" data-approve="${esc(a.id)}">승인</button><button class="btn ghost" data-remove="${esc(a.id)}">거절</button>`)).join("") || `<div class="empty">기다리는 신청이 없어요.</div>`;
  $("adminApproved").innerHTML = ok.map((a) => row(a, `<button class="btn ghost" data-revoke="${esc(a.id)}">승인 취소</button><button class="btn ghost" data-remove="${esc(a.id)}">삭제</button>`)).join("") || `<div class="empty">아직 승인한 선생님이 없어요.</div>`;
}
$("tAdminBtn").addEventListener("click", () => { renderAdmin(); $("adminModal").classList.remove("hidden"); });
$("adminClose").addEventListener("click", () => $("adminModal").classList.add("hidden"));
$("adminModal").addEventListener("click", async (e) => {
  const ap = e.target.closest("[data-approve]"), rv = e.target.closest("[data-revoke]"), rm = e.target.closest("[data-remove]");
  try {
    if (ap) { await updateDoc(doc(db, "teacherAccounts", ap.dataset.approve), { approved: true }); toast(`${ap.dataset.approve} 선생님을 승인했어요.`); }
    else if (rv) { await updateDoc(doc(db, "teacherAccounts", rv.dataset.revoke), { approved: false }); toast("승인을 취소했어요."); }
    else if (rm) {
      const n = rm.dataset.remove;
      if (!(await confirmBox(`${n} 선생님 등록을 지울까요?\n다시 쓰려면 새로 등록해야 해요.`, "지우기"))) return;
      const b = writeBatch(db);
      b.delete(doc(db, "teacherAccounts", n)); b.delete(doc(db, "teacherSecrets", n));
      await b.commit(); toast("등록을 지웠어요.");
    }
  } catch (err) { console.error(err); toast("처리하지 못했어요. 보안 규칙을 게시했는지 확인해 주세요."); }
});
