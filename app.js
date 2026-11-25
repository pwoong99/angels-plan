// 엔젤스 플랜 — 우리 반 두뇌 게임 대회 (GitHub Pages + Firebase angels-plan 프로젝트)
// 게임: 울타리치기(개인 시간 경쟁) · 벽바둑 1(2~4명 조 대결) · 큐브 세기(개인 시간 경쟁, 한 판 5문제)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, collection, getDoc, getDocs, getDocFromServer, setDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp, increment, arrayUnion, writeBatch, deleteField, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { PUZZLES } from "./puzzles.js?v=v1.11";
import { Board, checkSolution, diagnose, encodeEdges, decodeEdges, decodeAnswer } from "./board.js?v=v1.11";
import * as WG from "./wallgo.js?v=v1.11";
import { CUBES, cubeSVG, cubeCount, cubeTopHTML } from "./cubes.js?v=v1.11";
import { SYM, symInfo, SymBoard, checkSym, decodeState, encodeState, initialState, answerState } from "./sym.js?v=v1.11";
import { SPOT_LEVELS, SpotGame, spotBoxes, spotTitle, preloadSpot } from "./spot.js?v=v1.11";
import { avatarSVG, preloadAvatar, PARTS, PART_ORDER, OPTION_LABELS, randomAvatar, cleanAvatar, shownOptions, wingInfo, WING_LEVELS, DEFAULT_WING_TH, validWingTh, setWingThresholds } from "./avatar.js?v=v1.11";

const VERSION = "v1.11";

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
  wallgo: { name: "벽바둑 1", icon: "🧱", desc: "2~4명이 한 조로 대결 · 벽을 세워 내 땅 넓히기", team: false },
  wallgo2: { name: "벽바둑 2", icon: "🔷", desc: "벽바둑에 네모 말(곧게 1~2칸)·동그라미 말(ㄱ자로 꼭 2칸)이 생겼어요 · 2~4명", team: false },
  sym: { name: "대칭 퍼즐", icon: "🦋", desc: "조각을 옮기고 돌려서 선대칭 모양 만들기 · 개인전 · 먼저 완성할수록 높은 등수", team: false },
  cube: { name: "큐브 세기", icon: "🧊", desc: "쌓인 큐브가 모두 몇 개인지 빨리 세기 · 개인전 · 한 판 5문제", team: false },
  spot: { name: "달라진 그림 찾기", icon: "🔍", desc: "원래 그림을 외운 뒤, 사라지고 나온 바뀐 그림에서 바뀐 곳 찾기 · 개인전 · 다 찾으면 빨리 찾은 순서로 등수", team: false }
};
// 달라진 그림 찾기: 9단계(⭐ 세트 난이도 × 쉬움·보통·어려움), 단계별 기본 시간과 배율
const DEFAULT_PTIMES = [90, 120, 180, 90, 150, 180, 120, 180, 240];
const SPOT_MULT = [0.6, 0.7, 0.8, 0.8, 0.9, 1, 1.1, 1.3, 1.5];
// 외우는 시간(초): 원래 그림만 보여 주는 시간. ⭐ 작은 장면은 짧게, ⭐⭐⭐ 넓은 장면은 길게
const DEFAULT_PMEM = [15, 15, 15, 25, 25, 25, 40, 40, 40];
// 외우기가 끝나는 때(서버 시각). startAt이 아직 안 정해졌으면 외우는 중으로 봄
const spotMemEnd = (r) => { const s = ms(r && r.startAt); return s ? s + ((r.spot && r.spot.mem) || 0) * 1000 : Infinity; };
const spotKey = (r) => (r && r.spot && spotBoxes(r.spot.k).length ? r.spot.k : null);
// 진행 중 찾은 곳: edges 칸에 "라운드:번호,번호,…;t누른횟수", 다 찾거나 기회를 다 쓰면 sub로 제출
// 누를 기회 = 바뀐 곳 개수 (아무 데나 마구 누르지 못하게)
function spotText(p, round) {
  if (p && p.sub && p.sub.round === round && typeof p.sub.edges === "string") return p.sub.edges;
  if (p && typeof p.edges === "string" && p.edges.startsWith(round + ":")) return p.edges.slice(String(round).length + 1);
  return "";
}
function spotFound(p, round) {
  const t = spotText(p, round).split(";")[0];
  return t ? [...new Set(t.split(",").map(Number).filter((n) => Number.isInteger(n) && n >= 0))] : [];
}
function spotTaps(p, round) { const m = spotText(p, round).match(/;t(\d+)/); return m ? Number(m[1]) : spotFound(p, round).length; }
const isWG = (g) => g === "wallgo" || g === "wallgo2";
// 방마다 쓸 게임: 방 문서 off 칸(끈 게임 이름 목록). 끈 게임은 선생님 게임 고르기·학생 연습·게임 방법에서 빠짐
const gameOn = (r, g) => !(r && Array.isArray(r.off) && r.off.includes(g));
const onGames = (r) => { const l = Object.keys(GAMES).filter((g) => gameOn(r, g)); return l.length ? l : Object.keys(GAMES); };
// 대칭 퍼즐: 단계별 기본 제한 시간(0 = 제한 없음)
const DEFAULT_STIMES = [60, 60, 90, 120, 150, 180, 240, 300];
// 방 문서에는 문제 번호만 저장(Firestore는 배열 안의 배열을 못 담음) → 문제 내용은 sym.js에서 꺼냄
const symPz = (r) => { const q = r && r.sym; if (!q || q.lv === undefined) return null; const L = SYM.levels[q.lv - 1]; return (L && L.puzzles[q.i]) || null; };
const symLabel = (lv) => { const i = symInfo(lv); return `${i.name} · 조각 ${i.k}개 · ${i.size}`; };
const newWG = (game, n, extra) => (game === "wallgo2" ? WG.newMatch2(n, extra) : WG.newMatch(n, extra));
// 큐브 세기: 한 판 문제 수와 단계별 기본 시간(5문제 전체)
const CUBE_Q = 5;
const DEFAULT_CTIMES = [40, 50, 60, 75, 90, 100, 120, 140, 160, 180];
const cubeInfo = (lv) => { const L = CUBES[lv - 1] || CUBES[0]; return { name: L.name, size: `${L.w}×${L.h}`, max: L.max, tut: L.tut }; };
const cubeLabel = (lv) => { const i = cubeInfo(lv); return `${i.name} · ${i.size} 바닥 · 최대 ${i.max}층`; };
// 울타리치기 단계: 연습1·연습2(3×3) → 1~8단계(4×4~7×7)
const DEFAULT_TIMES = [60, 90, 120, 120, 180, 180, 240, 240, 360, 360];
// 울타리치기 점수: 맞히면 기본 점수 + 빠른 순서 보너스(1등 +top … top등 +1), 단계 배율을 곱함
const DEFAULT_PTS = { base: 15, top: 5, mult: true, part: 2 };
// ===== 점수 기준 (모든 게임을 비슷한 크기로 맞춤, 보통 단계 1등 ≈ 20점) =====
// 혼자 푸는 게임(울타리치기·큐브 세기·대칭 퍼즐): 정답 기본 15 + 빠른 순서 보너스(1등 +5 … 5등 +1) × 단계 배율
//   틀리거나 시간 초과여도 참여 점수 2점. 단계 배율은 ×0.6 ~ ×1.5로 좁혀서 한 게임만 점수가 튀지 않게 함
// 대결 게임(벽바둑 1·2): 1등 20 · 중간/무승부 12 · 꼴찌 5
const LEVEL_MULT = [0.6, 0.6, 0.8, 0.8, 1, 1, 1.2, 1.2, 1.5, 1.5];
const PTS_V = 2;   // 점수 기준 판. 예전 판으로 저장된 방 설정은 무시하고 새 기본값을 씀
// 대칭 퍼즐은 8단계라 배율표가 따로 있음
const SYM_MULT = [0.6, 0.6, 0.8, 1, 1, 1.2, 1.2, 1.5];
const multOf = (game, level) => (game === "sym" ? SYM_MULT : game === "spot" ? SPOT_MULT : LEVEL_MULT)[level - 1] || 1;
function calcPoints(P, rank, level, game = "fence") {
  const bonus = Math.max(0, P.top - (rank - 1));
  const m = P.mult ? multOf(game, level) : 1;
  return Math.round((P.base + bonus) * m);
}
// 벽바둑 점수와 한 수 시간
const DEFAULT_WG = { win: 20, draw: 12, lose: 5 };
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
  if (isWG(res.game)) {
    const sc = res.my !== undefined ? ` (${res.my}:${res.opp})` : "";
    if (res.outcome === "bye") return { ok: true, big: "🍀 부전승!", sm: `+${res.points}점 · 이번 라운드는 짝이 없어서 승리로 쳐요` };
    if (res.n > 2) {
      const land = res.my !== undefined ? ` · 내 땅 ${res.my}칸` : "";
      if (res.outcome === "win") return { ok: true, big: `🏆 ${res.n}명 중 1등!`, sm: `+${res.points}점${land}` };
      if (res.outcome === "draw") return { ok: true, big: `🥈 ${res.n}명 중 ${res.rank}등`, sm: `+${res.points}점${land}` };
      return { ok: false, big: `😢 ${res.n}명 중 ${res.rank}등`, sm: `참여 점수 +${res.points}점${land}` };
    }
    if (res.outcome === "win") return { ok: true, big: `🏆 승리!${sc}`, sm: `${esc(res.vs || "")}에게 이겼어요 · +${res.points}점` };
    if (res.outcome === "draw") return { ok: true, big: `🤝 무승부${sc}`, sm: `${esc(res.vs || "")}와 비겼어요 · +${res.points}점` };
    return { ok: false, big: `😢 아쉽게 졌어요${sc}`, sm: `${esc(res.vs || "")}에게 졌지만 참여 점수 +${res.points}점` };
  }
  if (res.game === "spot") {
    if (res.correct) return { ok: true, big: `🎉 ${res.total}곳 모두 찾았어요! ${res.rank}등`, sm: `+${res.points}점을 얻었어요` };
    if (res.n > 0) return { ok: true, big: `👍 ${res.total}곳 중 ${res.n}곳 찾았어요`, sm: `+${res.points}점 · 다 찾으면 빠른 순서 보너스도 받아요` };
    return { ok: false, big: "⏰ 시간 종료", sm: `다른 곳을 찾지 못했어요 · 참여 점수 +${res.points || 0}점` };
  }
  if (res.game === "cube") {
    if (res.correct) return { ok: true, big: `🎉 ${res.total}문제 모두 정답! ${res.rank}등`, sm: `+${res.points}점을 얻었어요` };
    if (res.reason === "timeout") return { ok: false, big: "⏰ 시간 초과", sm: `시간 안에 답을 하나도 내지 못했어요 · 참여 점수 +${res.points || 0}점` };
    if (res.n > 0) return { ok: true, big: `👍 ${res.total}문제 중 ${res.n}개 정답`, sm: `+${res.points}점 · 다 맞히면 빠른 순서 보너스도 받아요` };
    return { ok: false, big: "😢 맞힌 문제가 없어요", sm: `보이지 않는 아래쪽 큐브도 세어 봐요 · 참여 점수 +${res.points || 0}점` };
  }
  if (res.correct) return { ok: true, big: `🎉 정답! ${res.rank}등`, sm: `+${res.points}점을 얻었어요` };
  const pp = res.points ? ` · 참여 점수 +${res.points}점` : "";
  if (res.reason === "late") return { ok: false, big: "⏰ 시간 초과", sm: "제한 시간이 지난 뒤에 제출됐어요" + pp };
  if (res.reason === "timeout") return { ok: false, big: "⏰ 시간 초과", sm: "시간 안에 제출하지 못했어요" + pp };
  return { ok: false, big: "😢 아쉬워요, 오답!", sm: "다음 라운드에 다시 도전해요" + pp };
}

// ---------- 새 버전 알아채기 (브라우저에 저장된 예전 파일 대신 새 파일 불러오기) ----------
async function checkVersion() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    const j = await r.json();
    if (!j.version || j.version === VERSION) return;
    const reload = () => location.replace(location.pathname + "?v=" + encodeURIComponent(j.version));
    const onFront = $("intro").classList.contains("active") || $("entry").classList.contains("active");
    const key = "angel_reload_" + j.version;
    let tried = false;
    try { tried = !!sessionStorage.getItem(key); sessionStorage.setItem(key, "1"); } catch (e) { /* 없음 */ }
    if (onFront && !tried) return reload();
    $("updText").textContent = `새 버전(${j.version})이 나왔어요!`;
    $("updBar").classList.remove("hidden");
    $("updBtn").onclick = reload;
  } catch (e) { /* 오프라인 등 */ }
}
checkVersion();
preloadAvatar();
setInterval(checkVersion, 3 * 60 * 1000);

// ---------- 캐릭터 ----------
// 아직 캐릭터를 안 만든 학생은 이름으로 정해지는 기본 캐릭터
function avOf(p) {
  if (p && p.av) return p.av;
  let h = 0; const n = (p && (p.name || p.id)) || "";
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = {}; PART_ORDER.forEach((k, i) => { const o = shownOptions(k); a[k] = o[(h >>> (i * 3)) % o.length]; });
  return a;
}
// 날개 기준: 총 점수 (예전 학생은 총 점수가 없으면 이번 점수)
const wingScore = (p) => Math.max((p && p.total) || 0, (p && p.score) || 0);
const avHTML = (p, cls = "avatar") => avatarSVG(avOf(p), wingScore(p), { cls });

// ---------- 게임 설명 (설명 캐릭터가 장면마다 설명, 선생님이 넘김) ----------
// 설명 캐릭터 그림: 새 그림을 받으면 img/ 에 넣고 아래 이름만 바꾸면 됨
const GUIDE_IMG = {
  fence: ["guide-main", "guide-point", "guide-think", "guide-book", "guide-thumb"],
  wallgo: ["guide-main", "guide-point", "guide-three", "guide-book", "guide-think", "guide-bow"],
  wallgo2: ["guide-main", "guide-point", "guide-three", "guide-think", "guide-book", "guide-bow"],
  cube: ["guide-main", "guide-think", "guide-point", "guide-thumb"],
  sym: ["guide-main", "guide-point", "guide-think", "guide-thumb"],
  spot: ["guide-main", "guide-point", "guide-think", "guide-thumb"]
};
const FENCE_DEMO = (() => { const L = PUZZLES[0], P = L.puzzles[0]; return { w: L.w, h: L.h, c: P.c, ans: decodeAnswer(P.a) }; })();
const WG_DEMO = (() => {
  let m = WG.newMatch(2, { turnSec: DEFAULT_TURN });
  const snaps = { init: m };
  while (m.phase === "place") m = { ...m, ...WG.randomAction(m) };
  snaps.placed = m;
  for (let i = 0; i < 8 && m.phase === "play"; i++) m = { ...m, ...WG.randomAction(m) };
  snaps.mid = m;
  let g = 0; while (m.phase !== "done" && g++ < 400) m = { ...m, ...WG.randomAction(m) };
  snaps.end = m;
  return snaps;
})();
const WG2_DEMO = (() => {
  let m = WG.newMatch2(2, { turnSec: DEFAULT_TURN });
  const snaps = { init: m };
  while (m.phase === "place") m = { ...m, ...WG.randomAction(m) };
  snaps.placed = m;
  for (let i = 0; i < 8 && m.phase === "play"; i++) m = { ...m, ...WG.randomAction(m) };
  snaps.mid = m;
  let g = 0; while (m.phase !== "done" && g++ < 400) m = { ...m, ...WG.randomAction(m) };
  snaps.end = m;
  return snaps;
})();
const wg2Sel = (m, kind) => m.stones[m.turn].find((c, i) => c >= 0 && m.kinds[m.turn][i] === kind);
const exFence = new Board($("exFence"));
const exWall = new WG.WallBoard($("exWall"), {});
const pill = (t, c = "") => `<span class="ex-pill ${c}">${t}</span>`;
function fenceShow(edges, opt = {}) {
  noBoard();
  $("exFence").style.display = ""; $("exWall").style.display = "none";
  exFence.load(FENCE_DEMO.w, FENCE_DEMO.h, FENCE_DEMO.c, edges);
  if (opt.bad) exFence.setBad(opt.bad);
  if (opt.fill) exFence.setFill(true);
}
function wallShow(m, opt = {}) {
  noBoard(); $("exWall").style.display = "";
  exWall.render(m, opt.me || null, { active: !!opt.active, showRegions: !!opt.regions });
  if (opt.sel !== undefined) { exWall.me = m.turn; exWall.sel = opt.sel; exWall.dest = opt.dest !== undefined ? opt.dest : null; exWall.draw(); }
}
function noBoard() { $("exSpot").style.display = "none"; $("exSym").style.display = "none"; $("exFence").style.display = "none"; $("exWall").style.display = "none"; $("exCube").innerHTML = ""; $("exCube").style.display = "none"; }
const SYM_DEMO = SYM.levels[2].puzzles[0];
let exSymBoard = null;
function symShow(answer) {
  noBoard();
  $("exSym").style.display = "";
  if (!exSymBoard) exSymBoard = new SymBoard($("exSym"));
  exSymBoard.load(SYM_DEMO, answer ? answerState(SYM_DEMO) : initialState(SYM_DEMO), { locked: true });
}
const SPOT_DEMO = "1_easy";
let exSpot = null;
function spotShow(found, view = "both") {
  noBoard();
  $("exSpot").style.display = "";
  if (!exSpot) exSpot = new SpotGame($("exSpot"));
  exSpot.load(SPOT_DEMO, found, { locked: true });
  exSpot.setView(view);
  return "";
}
const CUBE_DEMO = { L: CUBES[1], key: CUBES[1].puzzles[0] };
function cubeShow(top) {
  noBoard();
  const { L, key } = CUBE_DEMO;
  $("exCube").style.display = "";
  $("exCube").innerHTML = cubeSVG(key, L.w, L.h, { cls: "cube-svg ex" }) + (top ? `<div class="ex-cube-top"><small>위에서 보면 (칸마다 쌓인 수)</small>${cubeTopHTML(key, L.w, L.h)}</div>` : "");
}
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
      show: (r) => { noBoard(); const P = roomPts(r); return pill(`맞히면 ${P.base}점`, "g") + pill(`1등 +${P.top} … ${P.top}등 +1`, "y") + pill(P.mult ? "어려운 단계 ×1.5까지" : "배율 없음", "p") + pill(`틀려도 참여 ${P.part}점`); } }
  ],
  wallgo: [
    { title: "🧱 벽바둑 1이란?", text: "친구들과 2~4명이 겨루는 땅따먹기 게임이에요. 7×7 판을 써요.\n2명이면 말 4개씩, 3~4명이면 말 2개씩!", show: () => wallShow(WG_DEMO.init) },
    { title: "말 놓기", text: "처음엔 정해진 자리에 말이 놓여 있어요. 나머지 말은 순서대로 빈칸에 직접 놓아요.\n2명: 분홍 → 파랑 → 파랑 → 분홍 · 3~4명: 한 개씩 거꾸로 순서", show: () => wallShow(WG_DEMO.placed) },
    { title: "말 움직이기", text: "내 차례엔 내 말 하나를 꼭 1~2칸 움직여요. 제자리는 안 돼요!\n상하좌우로, 꺾어서 가도 돼요. 초록 칸이 갈 수 있는 곳! 움직일 말이 하나도 없으면 차례가 저절로 넘어가요.",
      show: () => wallShow(WG_DEMO.placed, { active: true, sel: WG_DEMO.placed.stones[WG_DEMO.placed.turn][0] }) },
    { title: "벽 세우기", text: "움직인 칸의 둘레 중 한 곳에 벽을 꼭 세워요. (주황 점선)\n벽과 다른 말은 지나갈 수 없고, 세운 벽은 없앨 수 없어요.",
      show: () => { const m = WG_DEMO.mid, lm = WG.legalMoves(m, m.turn)[0]; wallShow(m, lm ? { active: true, sel: lm.from, dest: lm.to } : {}); } },
    { title: "끝과 승부", text: "서로 다른 색 말이 같은 공간에 없으면 끝!\n내 말만 있는 공간의 칸 수가 내 땅이에요. 땅이 넓은 순서로 등수가 정해져요.",
      show: () => { const m = WG_DEMO.end; wallShow(m, { regions: true }); return pill(`분홍 땅 ${m.scores.a}칸`, "p") + pill(`파랑 땅 ${m.scores.b}칸`); } },
    { title: "시간과 점수", text: "한 수마다 제한 시간이 있어요. 시간이 지나면 아무 곳에나 저절로 둬요.\n져도 참여 점수를 받아요!",
      show: (r) => { noBoard(); const W = roomWg(r); return pill(`한 수 ${(r && r.turnSec) || DEFAULT_TURN}초`) + pill(`1등 ${W.win}점`, "g") + pill(`중간 등수·무승부 ${W.draw}점`, "y") + pill(`꼴찌 ${W.lose}점`, "p"); } }
  ],
  wallgo2: [
    { title: "🔷 벽바둑 2란?", text: "벽바둑 1과 같은 땅따먹기인데, 말이 두 종류예요!\n네모 말과 동그라미 말을 잘 골라 써야 해요.", show: () => wallShow(WG2_DEMO.init) },
    { title: "말 놓기", text: "2명: 네모 2개 + 동그라미 2개 (정해진 자리에 하나씩, 직접 놓기도 하나씩)\n3~4명: 네모 1개(정해진 자리) + 동그라미 1개(직접 놓기)", show: () => wallShow(WG2_DEMO.placed) },
    { title: "🟦 네모 말", text: "한 방향으로 곧게 1~2칸 가요.\n꺾을 수는 없고, 제자리도 안 돼요.",
      show: () => { const m = WG2_DEMO.placed; wallShow(m, { active: true, sel: wg2Sel(m, "s") }); return pill("곧게 1~2칸", "y"); } },
    { title: "⚪ 동그라미 말", text: "꼭 2칸을 ㄱ자로 움직여요. 상하좌우로 한 칸 간 다음, 거기서 반드시 꺾어서 한 칸 더!\n그래서 대각선 칸에 도착해요. 한 칸만 가거나 곧게 2칸 가는 건 안 돼요. 지나가는 칸에 벽이나 말이 있으면 그 길로는 못 가요.",
      show: () => { const m = WG2_DEMO.placed; wallShow(m, { active: true, sel: wg2Sel(m, "r") }); return pill("한 칸 → 꺾어서 한 칸 (ㄱ자)", "g") + pill("한 칸만 ✕ · 곧게 2칸 ✕", "p"); } },
    { title: "벽 세우기와 끝", text: "움직인 칸 둘레에 벽을 꼭 하나 세워요.\n서로 다른 색 말이 같은 공간에 없으면 끝! 내 말만 있는 공간이 내 땅이에요.",
      show: () => { const m = WG2_DEMO.end; wallShow(m, { regions: true }); return pill(`분홍 땅 ${m.scores.a}칸`, "p") + pill(`파랑 땅 ${m.scores.b}칸`); } },
    { title: "시간과 점수", text: "한 수마다 제한 시간이 있어요. 시간이 지나면 아무 곳에나 저절로 둬요.\n져도 참여 점수를 받아요!",
      show: (r) => { noBoard(); const W = roomWg(r); return pill(`한 수 ${(r && r.turnSec) || DEFAULT_TURN}초`) + pill(`1등 ${W.win}점`, "g") + pill(`중간 등수·무승부 ${W.draw}점`, "y") + pill(`꼴찌 ${W.lose}점`, "p"); } }
  ],
  sym: [
    { title: "🦋 대칭 퍼즐이란?", text: "흩어진 조각들을 모아서 선대칭 모양을 만드는 퍼즐이에요.\n선대칭: 한 줄을 따라 접으면 양쪽이 꼭 겹치는 모양!", show: () => symShow(false) },
    { title: "옮기고 돌리기", text: "조각을 손가락으로 끌면 옮겨져요.\n조각을 한 번 톡 누르면 오른쪽으로 90° 돌아가요. (뒤집기는 안 돼요)", show: () => { symShow(false); return pill("끌기 = 옮기기", "y") + pill("톡 = 돌리기", "g"); } },
    { title: "완성하면 저절로 제출!", text: "조각을 모두 겹치지 않게 붙여서 선대칭 모양을 만들면 바로 제출돼요.\n대칭축은 세로·가로·대각선 어느 쪽이든 괜찮아요. 정답 모양이 여러 개일 수도 있어요!", show: () => { symShow(true); return pill("점선 = 대칭축", "p"); } },
    { title: "점수", text: "먼저 완성할수록 높은 등수!\n어려운 단계일수록 점수가 커져요.",
      show: (r) => { noBoard(); const P = roomPts(r); return pill(`완성 ${P.base}점`, "g") + pill(`1등 +${P.top} … ${P.top}등 +1`, "y") + pill(P.mult ? "어려운 단계 ×1.5까지" : "배율 없음") + pill(`틀려도 참여 ${P.part}점`); } }
  ],
  spot: [
    { title: "🔍 달라진 그림 찾기란?", text: "먼저 원래 그림을 잘 보고 외워요. 시간이 지나면 원래 그림은 사라져요!\n그다음 몇 곳이 바뀐 그림이 나오면, 외운 것과 달라진 곳을 모두 찾아요.", show: () => spotShow([], "orig") + pill("① 👀 외우기", "y") },
    { title: "👀 외우는 시간", text: "원래 그림만 보여요. 무엇이 어디에, 무슨 색으로 있는지 잘 외워요.\n다 외웠으면 [✅ 다 외웠어요]를 눌러 바로 시작해도 돼요. 시간이 끝나면 저절로 넘어가요.",
      show: () => spotShow([], "orig") + pill("시간이 끝나면 그림이 사라져요", "p") },
    { title: "🎯 누를 기회", text: "누를 수 있는 기회는 바뀐 곳 개수만큼이에요. 5곳이 바뀌었으면 5번!\n틀린 곳을 누르면 기회가 하나 줄어요. 아무 데나 누르지 말고 확실한 곳만 눌러요.",
      show: () => spotShow([0], "chg") + pill("기회 = 바뀐 곳 개수", "y") + pill("틀리면 기회 −1", "p") },
    { title: "찾으면 톡!", text: "원래 그림은 사라지고 바뀐 그림만 나와요.\n외운 것과 달라진 곳을 톡 눌러요. 맞으면 ⭕, 틀리면 ✕!\n기회를 다 쓰거나 모두 찾으면 저절로 제출돼요.",
      show: () => spotShow([0, 1], "chg") + pill("② 🔍 찾기", "y") + pill("맞으면 ⭕", "g") + pill("틀리면 ✕ · 기회 −1", "p") },
    { title: "🔍 크게 보기", text: "작은 곳이 잘 안 보이면 [🔍 크게]를 눌러요.\n크게 본 채로 그림을 끌면 둘러볼 수 있어요.", show: () => spotShow([], "chg") + pill("🔍 크게 / 작게", "y") + pill("끌기 = 둘러보기") },
    { title: "점수", text: "바뀐 곳을 모두 찾으면 저절로 제출! 먼저 찾을수록 높은 등수예요.\n일부만 찾아도 찾은 만큼 점수를 받아요. ⭐가 많고 어려운 단계일수록 점수가 커져요.",
      show: (r) => { const P = roomPts(r); return spotShow([0, 1, 2, 3, 4], "both") + pill(`모두 찾으면 ${P.base}점`, "g") + pill(`1등 +${P.top} … ${P.top}등 +1`, "y") + pill("일부만 찾으면 찾은 만큼", "p") + pill(P.mult ? "어려운 단계 ×1.5까지" : "배율 없음"); } }
  ],
  cube: [
    { title: "🧊 큐브 세기란?", text: "쌓여 있는 큐브가 모두 몇 개인지 세는 게임이에요.\n한 판에 5문제! 정확하게, 그리고 빠르게 세어 봐요.", show: () => cubeShow(false) },
    { title: "보이지 않는 큐브도 세요", text: "큐브는 공중에 떠 있지 않아요. 위에 큐브가 보이면 그 아래에도 큐브가 있어요.\n칸마다 몇 층인지 세어서 모두 더하면 돼요!", show: () => { cubeShow(true); return pill(`이 모양은 모두 ${cubeCount(CUBE_DEMO.key)}개`, "g"); } },
    { title: "답 입력하기", text: "숫자 버튼으로 개수를 누르고 [확인]을 눌러요.\n확인하면 바로 다음 문제로 넘어가고, 앞 문제는 고칠 수 없어요.", show: () => { cubeShow(false); return pill("숫자 누르기 → 확인", "y") + pill("⌫ 로 지우기"); } },
    { title: "점수", text: "5문제를 모두 맞히면 기본 점수 + 빨리 끝낸 순서 보너스!\n일부만 맞혀도 맞힌 만큼 점수를 받아요. 어려운 단계일수록 점수가 커져요.",
      show: (r) => { noBoard(); const P = roomPts(r); return pill(`모두 맞히면 ${P.base}점`, "g") + pill(`1등 +${P.top} … ${P.top}등 +1`, "y") + pill("일부만 맞히면 맞힌 만큼", "p") + pill(P.mult ? "어려운 단계 ×1.5까지" : "배율 없음"); } }
  ]
};
let exKey = null;
Object.values(GUIDE_IMG).flat().forEach((n) => { const im = new Image(); im.src = `img/${n}.jpg`; });
// 설명 화면 모드: room(선생님이 넘김, 학생은 보기만) / teacher(선생님 조작) / local(학생이 혼자 넘겨 봄)
const EXM = { mode: null, game: null, step: 0 };
function showExplain(r, teacher) {
  const ex = r && r.explain;
  if (!ex || !EXPLAIN[ex.game]) { hideExplain(); return; }
  EXM.mode = teacher ? "teacher" : "room";
  drawExplain(ex.game, ex.step || 0, r);
}
function openHowTo(game) {
  Object.assign(EXM, { mode: "local", game, step: 0 });
  drawExplain(game, 0, ST.room);
}
function drawExplain(game, stepIn, r) {
  const steps = EXPLAIN[game], local = EXM.mode === "local", ctrl = EXM.mode !== "room";
  const step = Math.max(0, Math.min(steps.length - 1, stepIn)), S = steps[step];
  $("explainView").classList.remove("hidden");
  $("exCtrl").classList.toggle("hidden", !ctrl);
  $("exWait").classList.toggle("hidden", ctrl);
  $("exPrev").disabled = step === 0;
  $("exNext").textContent = step === steps.length - 1 ? (local ? "다 봤어요" : "설명 다 했어요") : "다음";
  $("exEnd").textContent = local ? "닫기" : "설명 끝내기";
  $("exEnd").classList.toggle("danger", !local);
  $("exEnd").classList.toggle("ghost", local);
  const ex = { game, step };
  const key = game + ":" + step + ":" + EXM.mode;
  if (key === exKey) return;
  exKey = key;
  $("exGame").textContent = `${GAMES[ex.game].icon} ${GAMES[ex.game].name} 게임 설명`;
  $("exStep").textContent = `${step + 1} / ${steps.length}`;
  $("exDots").innerHTML = steps.map((_, k) => `<i class="${k === step ? "on" : ""}"></i>`).join("");
  const gi = GUIDE_IMG[ex.game] || GUIDE_IMG.fence;
  $("exImg").src = `img/${gi[step % gi.length]}.jpg`;
  $("exTitle").textContent = S.title;
  $("exText").textContent = S.text;
  const extra = S.show(r) || "";
  $("exExtra").innerHTML = extra;
}
function hideExplain() { $("explainView").classList.add("hidden"); exKey = null; EXM.mode = null; }

// ---------- 엔젤스 플랜 소개 (포롱이) ----------
const INTRO = [
  { img: "porong-host", text: "안녕! 나는 엔젤스 플랜의 구름 천사, 포롱이야! 뿅!" },
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
  $("introNext").textContent = last ? "엔젤스 플랜 시작하기" : "다음";
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

// ---------- 날개 단계 기준 점수 (관리자가 settings/wings에서 정함, 모두가 읽음) ----------
let wingTh = DEFAULT_WING_TH;
authReady.then(() => onSnapshot(doc(db, "settings", "wings"), (snap) => {
  const th = snap.exists() ? snap.data().th : null;
  wingTh = validWingTh(th) ? th : DEFAULT_WING_TH;
  setWingThresholds(wingTh);
  try { if (ST.room) renderStudent(); if (T.room) renderTeacher(); } catch (e) { console.warn(e); }
}, (e) => console.warn("날개 설정", e)));

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
    : wgBoard.sel !== null ? "② 갈 칸을 눌러요 (초록 칸, 제자리는 안 돼요)" : "내 차례! ① 움직일 내 말을 눌러요";
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

// 끝나는 시각. 제한 시간 없음(duration 0)이면 null → 시간 초과·늦은 제출 없이, 모두 끝내거나 선생님이 끝낼 때까지 진행
function endAtOf(r) { const s = ms(r && r.startAt); return s && r.duration > 0 ? s + r.duration * 1000 : null; }
const elapsedOf = (r) => { const s = ms(r && r.startAt); return s ? (now() - s) / 1000 : 0; };

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
  $("stTotal").textContent = wingScore(me);
  renderMyAngel();
  if (r.explain && r.status !== "playing") showExplain(r, false);
  else if (EXM.mode === "local" && r.status !== "playing") { /* 학생이 혼자 보는 중 */ }
  else hideExplain();
  if (!me.av && !AV.asked && r.status !== "playing") { AV.asked = true; openAvatar(true); }
  const tc = GAMES[r.game] && GAMES[r.game].team ? r.teamCount || 0 : 0, tm = teamOf(me, tc);
  $("stTeam").textContent = teamLabel(tm);
  $("stTeam").classList.toggle("hidden", !tm);
  renderStudentRank();

  applyGameOn(r);
  const playing = r.status === "playing";
  const res = me.result && me.result.round === r.round ? me.result : null;
  if (!res && celebrated !== null && celebrated !== r.round) porongFace("wave");
  $("stGame").classList.toggle("hidden", !playing);
  document.body.classList.toggle("st-playing", playing);   // 게임 중: 판을 화면 높이에 맞춰 크게
  $("stLobby").classList.toggle("hidden", playing);
  if (playing) closePractice();

  if (playing) {
    $("fenceArea").classList.toggle("hidden", r.game !== "fence");
    $("wgArea").classList.toggle("hidden", !isWG(r.game));
    $("cubeArea").classList.toggle("hidden", r.game !== "cube");
    $("symArea").classList.toggle("hidden", r.game !== "sym");
    $("spotArea").classList.toggle("hidden", r.game !== "spot");
    if (isWG(r.game)) renderStudentWallgo(r, me, res);
    else if (r.game === "cube") renderStudentCube(r, me, res);
    else if (r.game === "spot") renderStudentSpot(r, me, res);
    else if (r.game === "sym") renderStudentSym(r, me, res);
    else renderStudentFence(r, me, res);
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
    const cubeEnd = r.status === "ended" && r.round > 0 && r.game === "cube" && r.cube;
    const symEnd = r.status === "ended" && r.round > 0 && r.game === "sym" && symPz(r);
    $("stSymAns").style.display = symEnd ? "" : "none";
    if (symEnd && stSymAnsKey !== r.round) { stSymAnsKey = r.round; stSymAns.load(symPz(r), answerState(symPz(r)), { locked: true }); }
    const spotEnd = r.status === "ended" && r.round > 0 && r.game === "spot" && spotKey(r);
    $("stSpotAns").classList.toggle("hidden", !spotEnd);
    if (spotEnd && stSpotAnsKey !== r.round) { stSpotAnsKey = r.round; stSpotAns.load(spotKey(r), spotFound(me, r.round), { locked: true, showAll: true }); stSpotAns.setView("both"); }
    const ans = r.status === "ended" && r.round > 0 && r.game === "fence" ? answerOf(r) : null;
    $("stAnswerCard").hidden = !ans && !cubeEnd && !symEnd && !spotEnd;
    $("stAnswerBoard").style.display = ans ? "" : "none";
    $("stCubeAns").innerHTML = cubeEnd ? cubeReviewHTML(r, cubeMyAnswers(me, r.round)) : "";
    $("stAnswerTitle").textContent = cubeEnd ? "✅ 이번 판 정답" : symEnd ? "✅ 정답 예시 (다른 모양도 대칭이면 정답!)" : spotEnd ? "✅ 다른 곳 (초록 = 내가 찾은 곳, 주황 = 못 찾은 곳)" : "✅ 이번 문제 정답";
    if (ans && stAnswerKey !== r.round) {
      stAnswerKey = r.round;
      stAnswerBoard.load(r.puzzle.w, r.puzzle.h, r.puzzle.c);
      stAnswerBoard.showAnswer(ans);
    }
  }
}

// 선생님이 끈 게임은 연습 버튼·게임 방법 버튼을 숨기고, 열려 있던 연습 창도 닫음
const PRAC = [["practiceBtn", "practice", ["fence"]], ["wgPracBtn", "wgPractice", ["wallgo", "wallgo2"]], ["cubePracBtn", "cubePractice", ["cube"]], ["symPracBtn", "symPractice", ["sym"]]];
let gameOnKey = null;
function applyGameOn(r) {
  const key = JSON.stringify((r && r.off) || []);
  if (key === gameOnKey) return;
  gameOnKey = key;
  for (const [btn, ov, games] of PRAC) {
    const on = games.some((g) => gameOn(r, g));
    $(btn).classList.toggle("hidden", !on);
    if (!on && !$(ov).classList.contains("hidden")) {
      if (ov === "wgPractice") closeWgPractice(); else $(ov).classList.add("hidden");
      toast("선생님이 이 게임을 껐어요.");
    }
  }
  document.querySelectorAll("[data-how]").forEach((b) => b.classList.toggle("hidden", !gameOn(r, b.dataset.how)));
  if (EXM.mode === "local" && EXM.game && !gameOn(r, EXM.game)) hideExplain();
  // 벽바둑 연습: 켜진 쪽만
  const wv = WP.v;
  if (!gameOn(r, WP.v === 2 ? "wallgo2" : "wallgo")) WP.v = gameOn(r, "wallgo2") ? 2 : 1;
  if (!$("wgPractice").classList.contains("hidden")) { if (WP.v !== wv) wpNew(); else $("wpLevels").querySelectorAll("[data-wpv]").forEach((x) => x.classList.toggle("hidden", !gameOn(r, x.dataset.wpv === "2" ? "wallgo2" : "wallgo"))); }
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
    msg.textContent = `${t.big} ${res.points ? `+${res.points}점` : "0점"}`;
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
    vs.textContent = `${GAMES[r.game].icon} ${GAMES[r.game].name}`;
    status.textContent = "이번 대결은 이미 시작됐어요. 다음 게임에 함께해요!";
    $("wgTimer").textContent = "";
    return;
  }
  if (mt.bye) {
    vs.textContent = `${GAMES[r.game].icon} ${GAMES[r.game].name}`;
    status.textContent = "🍀 이번 라운드는 짝이 없어서 부전승이에요! 친구들 경기가 끝날 때까지 기다려요.";
    status.classList.add("ok");
    $("wgTimer").textContent = "";
    if (res) celebrate(res);
    return;
  }
  const m = ST.match;
  if (!m) { status.textContent = "대결 준비 중…"; return; }
  const side = mt.side, sides = WG.sidesOf(m);
  vs.innerHTML = sides.map((sd) => {
    const nm = m[sd], p = sd === side ? me : (ST.players.find((x) => x.id === nm) || { name: nm });
    const turn = m.phase !== "done" && m.turn === sd ? " turn" : "";
    return `<span class="vs-one${turn}"><span class="vs-av">${avHTML(p)}</span><span class="wg-tag side-${sd}">${sd === side ? "나 " : ""}${esc(nm)}</span></span>`;
  }).join(`<b class="vs-x">VS</b>`);
  const myTurn = m.phase !== "done" && m.turn === side;
  wgBoard.render(m, side, { active: myTurn, showRegions: m.phase === "done" });
  if (m.phase === "done") {
    const sc = m.scores || { a: m.scoreA, b: m.scoreB };
    const t = res ? resultText(res) : null;
    status.innerHTML = t ? `${esc(t.big)} <small>${t.sm}</small>` : `경기 끝! 내 땅 ${sc[side]}칸 · 점수 계산 중…`;
    status.classList.add(WG.outcomeOf(m, side) === "lose" ? "bad" : "ok");
    $("wgTimer").textContent = "";
    if (res) celebrate(res);
    return;
  }
  if (m.phase === "place") {
    const left = m.stones[side].filter((c) => c < 0).length;
    const order = WG.placeOrder(m).map((sd) => WG.SIDE_NAMES[sd]).join("→");
    const kd = m.v === 2 ? `${WG.KIND_NAMES[WG.nextPlaceKind(m, m.turn)]} 말을 ` : "말을 ";
    status.textContent = myTurn ? `내 차례! ${kd}놓을 빈칸을 눌러요 (남은 말 ${left}개)` : `${WG.SIDE_NAMES[m.turn]}(${m[m.turn]})가 말을 놓는 중… (순서: ${order})`;
  } else if (myTurn) {
    status.textContent = wgBoard.dest !== null ? "③ 벽을 세울 쪽을 눌러요 (주황 점선, 또는 그 방향 칸)"
      : wgBoard.sel !== null ? "② 갈 칸을 눌러요 (초록 칸, 제자리는 안 돼요)" : "내 차례! ① 움직일 내 말을 눌러요";
  } else {
    const skip = m.last && Array.isArray(m.last.skip) ? m.last.skip : [];
    status.textContent = skip.includes(side) ? `🚫 내 말이 모두 움직일 곳이 없어서 차례가 넘어갔어요. 지금은 ${WG.SIDE_NAMES[m.turn]}(${m[m.turn]}) 차례예요.`
      : `${WG.SIDE_NAMES[m.turn]}(${m[m.turn]}) 차례예요… 어디에 벽을 세울지 미리 생각해 봐요!`;
  }
  if (myTurn) status.classList.add("my");
}

// ----- 대칭 퍼즐 (학생) -----
// 옮길 때마다 edges 칸에 "라운드:상태" 저장(새로고침해도 이어짐), 선대칭이 되면 바로 제출
const SY = { round: null, saveT: null, sent: null };
const syBoard = new SymBoard($("syBoard"), { onChange: (st, res) => symChange(st, res) });
const stSymAns = new SymBoard($("stSymAns"));
let stSymAnsKey = null;
const SYM_WHY = { overlap: "조각끼리 겹쳐 있어요.", apart: "조각이 모두 붙어 있어야 해요.", notsym: "아직 선대칭이 아니에요. 접었을 때 꼭 맞는 모양을 만들어 봐요!", out: "" };
function renderStudentSym(r, me, res) {
  const pz = symPz(r);
  if (!pz) return;
  const submitted = !!(me.sub && me.sub.round === r.round);
  const end = endAtOf(r), timeUp = end !== null && now() > end;
  const lock = submitted || timeUp || !!res || SY.sent === r.round;
  if (SY.round !== r.round) {
    SY.round = r.round; SY.sent = null;
    let st = null;
    if (submitted) st = decodeState(me.sub.edges, pz.p.length);
    else if (typeof me.edges === "string" && me.edges.startsWith(r.round + ":")) st = decodeState(me.edges.slice(String(r.round).length + 1), pz.p.length);
    syBoard.load(pz, st || initialState(pz), { locked: lock });
    $("syLevel").textContent = `🦋 대칭 퍼즐 · ${symLabel(r.level)}`;
  } else if (syBoard.locked !== lock) syBoard.setLocked(lock);
  $("syReset").disabled = lock;
  const msg = $("syMsg");
  msg.className = "game-msg";
  if (res) {
    const t = resultText(res);
    msg.textContent = `${t.big} ${res.points ? `+${res.points}점` : "0점"}`;
    msg.classList.add(t.ok ? "ok" : "bad");
    celebrate(res);
  } else if (submitted || SY.sent === r.round) { msg.textContent = "🦋 완성! 채점 중이에요…"; msg.classList.add("ok"); }
  else if (timeUp) { msg.textContent = "⏰ 시간 종료!"; msg.classList.add("bad"); }
}
function symChange(st, res) {
  const r = ST.room, me = ST.me;
  if (!r || r.game !== "sym" || r.status !== "playing" || !ST.pRef) return;
  if (me && me.sub && me.sub.round === r.round) return;
  const txt = encodeState(st), round = r.round;
  clearTimeout(SY.saveT);
  if (res && res.ok) {
    SY.sent = round;
    renderStudent();
    updateDoc(ST.pRef, { sub: { round, edges: txt, at: serverTimestamp() }, edges: `${round}:${txt}` })
      .catch((e) => { console.error(e); SY.sent = null; toast("제출하지 못했어요. 시간이 끝났을 수 있어요."); renderStudent(); });
    return;
  }
  const why = res && SYM_WHY[res.why];
  $("syMsg").className = "game-msg"; $("syMsg").textContent = why || "";
  SY.saveT = setTimeout(() => updateDoc(ST.pRef, { edges: `${round}:${txt}` }).catch(console.warn), 700);
}
$("syReset").addEventListener("click", () => {
  const r = ST.room;
  const pz = symPz(r);
  if (!r || r.game !== "sym" || !pz || syBoard.locked) return;
  syBoard.load(pz, initialState(pz));
  symChange(syBoard.state(), checkSym(pz, syBoard.state()));
});

// ----- 달라진 그림 찾기 (학생) -----
// 찾을 때마다 edges 칸에 "라운드:번호,…" 저장(새로고침해도 이어짐), 모두 찾으면 바로 제출
const PT = { round: null, sent: null, saveT: null, msgT: null };
const zoomLabel = (z) => (z >= 3 ? "↩ 원래 크기" : z >= 2 ? "🔍 더 크게" : "🔍 크게");
const ptGame = new SpotGame($("ptBoard"), {
  maxTaps: true, wrongWait: 600,
  onFind: (i, found, taps) => spotFindSave(found, taps),
  onWrong: (wait, found, taps) => { spotMsg($("ptMsg"), `✕ 거기는 똑같아요! 남은 기회 ${ptGame.tapsLeft}번`, "bad", 2000); spotFindSave(found, taps); },
  onZoom: (z) => ($("ptZoom").textContent = zoomLabel(z))
});
const stSpotAns = new SpotGame($("stSpotAns"));
let stSpotAnsKey = null;
function spotMsg(el, text, cls, wait) {
  clearTimeout(PT.msgT);
  el.className = "game-msg" + (cls ? " " + cls : ""); el.textContent = text;
  if (wait) PT.msgT = setTimeout(() => { if (el.textContent === text) { el.textContent = ""; el.className = "game-msg"; } }, wait);
}
function spotProg() { $("ptProg").textContent = `찾은 곳 ${ptGame.found.length}/${ptGame.total} · 🎯 남은 기회 ${ptGame.tapsLeft}`; }
// 지금 단계: 외우기(mem) → 찾기(find). 다 외웠어요를 눌렀거나, 이미 찾은 곳이 있거나(새로고침), 외우는 시간이 끝나면 찾기
function spotPhase(r, me) {
  if (PT.ready === r.round || (me && me.sub && me.sub.round === r.round) || spotTaps(me, r.round) > 0) return "find";
  return now() >= spotMemEnd(r) ? "find" : "mem";
}
function renderStudentSpot(r, me, res) {
  const key = spotKey(r);
  if (!key) return;
  const submitted = !!(me.sub && me.sub.round === r.round);
  const end = endAtOf(r), timeUp = end !== null && now() > end;
  const phase = res || timeUp ? "find" : spotPhase(r, me);
  const lock = submitted || timeUp || !!res || PT.sent === r.round || phase === "mem";
  if (PT.round !== r.round) {
    PT.round = r.round; PT.sent = null; PT.phase = null; PT.lastN = spotFound(me, r.round).length;
    ptGame.load(key, spotFound(me, r.round), { locked: lock, taps: spotTaps(me, r.round) });
    $("ptLevel").textContent = `🔍 ${spotTitle(key)}`;
  } else if (ptGame.locked !== lock) ptGame.setLocked(lock);
  if (PT.phase !== phase) { PT.phase = phase; ptGame.setZoom(1); ptGame.setView(phase === "mem" ? "orig" : "chg"); }
  $("ptReady").classList.toggle("hidden", phase !== "mem");
  $("ptZoom").disabled = false;
  spotProg();
  const msg = $("ptMsg");
  if (phase === "mem") { $("ptProg").textContent = `바뀔 곳 ${ptGame.total}곳 · 🎯 기회 ${ptGame.total}번`; spotMsg(msg, "👀 원래 그림을 잘 외워요! 시간이 끝나면 사라지고 바뀐 그림이 나와요", ""); return; }
  if (PT.shownFind !== r.round && !res && !submitted && !timeUp) { PT.shownFind = r.round; spotMsg(msg, `🔍 원래 그림이 사라졌어요! 바뀐 곳을 찾아 톡 눌러요 (기회 ${ptGame.total}번)`, "", 3000); }
  if (res) {
    const t = resultText(res);
    spotMsg(msg, `${t.big} ${res.points ? `+${res.points}점` : "0점"}`, t.ok ? "ok" : "bad");
    celebrate(res);
  } else if (submitted || PT.sent === r.round) spotMsg(msg, ptGame.found.length >= ptGame.total ? "🔍 모두 찾았어요! 채점 중이에요…" : `🎯 기회를 다 썼어요 (${ptGame.found.length}곳 찾음). 채점 중이에요…`, "ok");
  else if (timeUp) spotMsg(msg, "⏰ 시간 종료!", "bad");
}
function spotFindSave(found, taps) {
  const r = ST.room, me = ST.me;
  spotProg();
  if (!r || r.game !== "spot" || r.status !== "playing" || !ST.pRef) return;
  if (me && me.sub && me.sub.round === r.round) return;
  const txt = found.join(",") + ";t" + taps, round = r.round;
  clearTimeout(PT.saveT);
  if (found.length >= ptGame.total || taps >= ptGame.total) {
    PT.sent = round;
    ptGame.setLocked(true);
    renderStudent();
    updateDoc(ST.pRef, { sub: { round, edges: txt, at: serverTimestamp() }, edges: `${round}:${txt}` })
      .catch((e) => { console.error(e); PT.sent = null; toast("제출하지 못했어요. 시간이 끝났을 수 있어요."); renderStudent(); });
    return;
  }
  if (found.length && found[found.length - 1] !== undefined && PT.lastN !== found.length) { PT.lastN = found.length; spotMsg($("ptMsg"), `⭕ 찾았어요! 남은 곳 ${ptGame.total - found.length}곳 · 남은 기회 ${ptGame.tapsLeft}번`, "ok", 2000); }
  PT.saveT = setTimeout(() => updateDoc(ST.pRef, { edges: `${round}:${txt}` }).catch(console.warn), 300);
}
$("ptZoom").addEventListener("click", () => ptGame.setZoom(ptGame.zoom >= 3 ? 1 : ptGame.zoom + 1));
$("ptReady").addEventListener("click", () => { if (ST.room) { PT.ready = ST.room.round; renderStudent(); } });

// ----- 큐브 세기 (학생) -----
// 진행 중 답은 edges 칸에 "라운드:답,답,…"로 저장(새로고침해도 이어짐), 다 풀면 sub로 제출
const CB = { round: null, ans: [], input: "" };
function cubeMyAnswers(me, round) {
  if (me && me.sub && me.sub.round === round && typeof me.sub.edges === "string") return me.sub.edges ? me.sub.edges.split(",") : [];
  if (me && typeof me.edges === "string" && me.edges.startsWith(round + ":")) { const t = me.edges.slice(String(round).length + 1); return t ? t.split(",") : []; }
  return [];
}
function cubeReviewHTML(r, mine) {
  const L = CUBES[(r.cube.lv || 1) - 1];
  return `<div class="cube-review">` + r.cube.qs.map((key, i) => {
    const right = cubeCount(key), my = mine[i], ok = my !== undefined && Number(my) === right;
    return `<div class="cr ${my === undefined ? "" : ok ? "ok" : "bad"}"><div class="cr-pic">${cubeSVG(key, L.w, L.h)}</div>
      <b>${i + 1}번 · 정답 ${right}개</b><small>${my === undefined ? "못 풀었어요" : `내 답 ${esc(my)}개 ${ok ? "⭕" : "❌"}`}</small></div>`;
  }).join("") + `</div>`;
}
function renderStudentCube(r, me, res) {
  const C = r.cube;
  if (!C) return;
  if (CB.round !== r.round) { CB.round = r.round; CB.ans = cubeMyAnswers(me, r.round); CB.input = ""; }
  const L = CUBES[C.lv - 1];
  const submitted = !!(me.sub && me.sub.round === r.round);
  if (submitted) CB.ans = cubeMyAnswers(me, r.round);
  const end = endAtOf(r), timeUp = end !== null && now() > end;
  const q = CB.ans.length, done = q >= C.qs.length;
  const lock = submitted || timeUp || !!res || done;
  $("cbLevel").textContent = `🧊 큐브 세기 · ${cubeLabel(C.lv)}`;
  $("cbProg").textContent = done ? `${C.qs.length}문제 끝!` : `${q + 1} / ${C.qs.length}번`;
  const key = done ? null : C.qs[q];
  const picKey = r.round + ":" + q + ":" + (res ? "r" : "");
  if ($("cbPic").dataset.k !== picKey) {
    $("cbPic").dataset.k = picKey;
    $("cubeArea").classList.toggle("review", !!res);
    $("cbPic").innerHTML = key && !res ? cubeSVG(key, L.w, L.h, { cls: "cube-svg big" }) : "";
  }
  $("cbAsk").classList.toggle("hidden", lock);
  $("cbPad").classList.toggle("hidden", lock);
  $("cbIn").textContent = CB.input || "?";
  $("cbPad").querySelectorAll("button").forEach((b) => (b.disabled = lock));
  const msg = $("cbMsg");
  msg.className = "game-msg";
  const rv = $("cbReview");
  if (res) {
    const t = resultText(res);
    msg.textContent = `${t.big} ${res.points ? `+${res.points}점` : "0점"}`;
    msg.classList.add(t.ok ? "ok" : "bad");
    rv.innerHTML = cubeReviewHTML(r, CB.ans); rv.classList.remove("hidden");
    celebrate(res);
  } else {
    rv.classList.add("hidden"); rv.innerHTML = "";
    if (submitted || done) msg.textContent = "📮 다 풀었어요! 채점 중이에요…";
    else if (timeUp) { msg.textContent = "⏰ 시간 종료! 푼 문제까지만 채점해요."; msg.classList.add("bad"); }
    else msg.textContent = "";
  }
}
async function cubeConfirm() {
  const r = ST.room, me = ST.me;
  if (!r || r.status !== "playing" || r.game !== "cube" || !r.cube) return;
  if (me && me.sub && me.sub.round === r.round) return;
  const end = endAtOf(r);
  if (end !== null && now() > end) return toast("시간이 끝났어요.");
  if (!CB.input) return toast("먼저 숫자를 눌러 개수를 넣어 주세요.");
  CB.ans = [...CB.ans, String(Number(CB.input))]; CB.input = "";
  const txt = CB.ans.join(",");
  const last = CB.ans.length >= r.cube.qs.length;
  renderStudent();
  try {
    if (last) await updateDoc(ST.pRef, { sub: { round: r.round, edges: txt, at: serverTimestamp() }, edges: `${r.round}:${txt}` });
    else await updateDoc(ST.pRef, { edges: `${r.round}:${txt}` });
  } catch (e) { console.error(e); toast(last ? "제출하지 못했어요. 시간이 끝났을 수 있어요." : "답을 저장하지 못했어요. 인터넷을 확인해 주세요."); }
}
$("cbPad").addEventListener("click", (e) => {
  const b = e.target.closest("[data-k]");
  if (!b || b.disabled) return;
  const k = b.dataset.k;
  if (k === "ok") return cubeConfirm();
  if (k === "del") CB.input = CB.input.slice(0, -1);
  else if (CB.input.length < 3) CB.input = (CB.input + k).replace(/^0+(?=\d)/, "");
  $("cbIn").textContent = CB.input || "?";
});

// ----- 나의 천사 (캐릭터 + 날개 성장) -----
let myAngelKey = null;
function renderMyAngel() {
  const me = ST.me;
  if (!me) return;
  const ws = wingScore(me), info = wingInfo(ws);
  $("stAngelTitle").textContent = `😇 ${me.name || ST.name}의 천사`;
  const key = JSON.stringify(avOf(me)) + ":" + info.lv;
  if (key !== myAngelKey) {
    myAngelKey = key;
    $("stAv").innerHTML = avHTML(me);
    $("stHeadAv").innerHTML = avHTML(me);
  }
  $("stWingName").textContent = `🪽 ${info.name} (Lv.${info.lv + 1})`;
  const cur = WING_LEVELS[info.lv].min, nxt = WING_LEVELS[info.lv + 1];
  $("stWingBar").style.width = nxt ? Math.min(100, (ws - cur) / (nxt.min - cur) * 100) + "%" : "100%";
  $("stWingNext").textContent = `총 점수 ${ws}점 · ` + (nxt ? `${info.nextName}까지 ${info.next}점` : "가장 멋진 전설의 날개예요! ✨");
  if (ST.wingLv !== undefined && info.lv > ST.wingLv) { confetti(); toast(`🪽 새 날개를 얻었어요! 이제 「${info.name}」`); }
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
  const score = wingScore(ST.me), info = wingInfo(score);
  $("avPreview").innerHTML = avatarSVG(AV.draft, score);
  $("avWingNote").textContent = `지금 날개: ${info.name} · 게임에서 점수를 모으면 날개가 자라요!`;
  $("avTabs").innerHTML = PART_ORDER.map((k) => `<button class="av-tab ${k === AV.tab ? "active" : ""}" data-avtab="${k}">${PARTS[k].name}</button>`).join("");
  let h = "";
  for (const i of shownOptions(AV.tab)) {
    const a = { ...AV.draft, [AV.tab]: i };
    h += `<button class="av-opt ${AV.draft[AV.tab] === i ? "active" : ""}" data-avopt="${i}"><span class="av-mini">${avatarSVG(a, score, { view: AV.tab === "body" ? "0 0 120 150" : "14 2 92 96" })}</span>${esc(OPTION_LABELS[AV.tab][i])}</button>`;
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
  const medal = (n) => (n === 1 ? "🥇" : n === 2 ? "🥈" : n === 3 ? "🥉" : n);
  const row = (p) => `<li class="${p.id === ST.name ? "me" : ""}"><span class="no">${medal(p.rank)}</span><span class="rk-av">${avHTML(p)}</span><span class="nm">${esc(p.name)}<small>🪽 ${wingInfo(wingScore(p)).name}</small></span><span class="sc">${p.score || 0}점<small>총 ${wingScore(p)}</small></span></li>`;
  $("stRankList").innerHTML = list.slice(0, 10).map(row).join("") + (mine && mine.rank > 10 ? row(mine) : "");
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
  if (isWG(r.game)) {
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
  // 달라진 그림 찾기: 외우는 동안은 남은 외우기 시간, 외우기가 끝나면 찾기 화면으로
  let spotMem = false;
  if (r.game === "spot") {
    const ph = spotPhase(r, ST.me);
    if (ph !== PT.phase && PT.round === r.round) renderStudent();
    if (ph === "mem") {
      spotMem = true;
      const ml = spotMemEnd(r) === Infinity ? (r.spot && r.spot.mem) || 0 : (spotMemEnd(r) - now()) / 1000;
      $("ptTimer").textContent = "👀 " + fmtTime(ml); $("ptTimer").classList.remove("free"); $("ptTimer").classList.toggle("warn", ml <= 5);
    }
  }
  const end = endAtOf(r);
  if (end === null) {   // 제한 시간 없음: 지난 시간만 보여 줌
    for (const el of [$("stTimer"), $("cbTimer"), $("syTimer"), $("ptTimer")]) {
      if (spotMem && el.id === "ptTimer") continue;
      const el2 = r.game === "spot" && el.id === "ptTimer" && spotMemEnd(r) !== Infinity ? Math.max(0, (now() - spotMemEnd(r)) / 1000) : elapsedOf(r);
      el.textContent = "⏱ " + fmtTime(el2); el.classList.remove("warn"); el.classList.add("free");
    }
    return;
  }
  const left = (end - now()) / 1000;
  for (const el of [$("stTimer"), $("cbTimer"), $("syTimer"), $("ptTimer")]) {
    if (spotMem && el.id === "ptTimer") continue;
    el.classList.remove("free");
    el.textContent = fmtTime(left);
    el.classList.toggle("warn", left <= 10 && left > 0);
  }
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
    if (!r || r.status !== "playing" || r.game !== "fence" || !ST.pRef) return;
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
function closePractice() { $("practice").classList.add("hidden"); closeWgPractice(); const cp = document.getElementById("cubePractice"); if (cp) cp.classList.add("hidden"); const sp = document.getElementById("symPractice"); if (sp) sp.classList.add("hidden"); }
$("practiceBtn").addEventListener("click", openPractice);
$("prClose").addEventListener("click", closePractice);
$("prLevels").addEventListener("click", (e) => { const b = e.target.closest("[data-prlv]"); if (b) prLoad(Number(b.dataset.prlv)); });
$("prDraw").addEventListener("click", () => prSetTool("draw"));
$("prErase").addEventListener("click", () => prSetTool("erase"));
$("prClear").addEventListener("click", () => { prBoard.clear(); prSay(PR_INTRO[PR_LEVELS.indexOf(PR.lv)]); });
$("prNext").addEventListener("click", () => prLoad(PR.lv));
// 힌트: 틀린 울타리가 있으면 하나 치우고, 없으면 맞는 울타리를 하나 쳐 줌
$("prHint").addEventListener("click", () => {
  if (prBoard.locked) return;
  const ans = decodeAnswer(PUZZLES[PR.lv].puzzles[PR.idx].a);
  const wrong = [...prBoard.edges].find((e) => !ans.has(e));
  prLastMsg = "";
  if (wrong !== undefined) { prBoard.edges.delete(wrong); prSay("틀린 울타리 하나를 치웠어! 다시 생각해 봐."); }
  else {
    const miss = [...ans].filter((e) => !prBoard.edges.has(e));
    if (!miss.length) return prSay("이미 다 맞았어! [정답 확인]을 눌러 봐.");
    prBoard.edges.add(miss[Math.floor(Math.random() * miss.length)]);
    prSay("울타리 하나를 대신 쳐 줬어. 나머지는 직접 해 봐!");
  }
  prBoard.bad = []; prBoard.fill = false; prBoard.draw();
});

// =====================================================================
// 벽바둑 AI와 연습 (점수 없음, 내 기기에서만)
// =====================================================================
const WP_LEVELS = [["easy", "🐣 쉬움"], ["normal", "🙂 보통"], ["hard", "🔥 어려움"]];
const WP = { m: null, level: "easy", me: "a", n: 2, v: 1, busy: false, timer: null };
const wpBoard = new WG.WallBoard($("wpBoard"), {
  onPlace: (c) => wpHuman((x) => WG.applyPlace(x, WP.me, c)),
  onMove: (f, t, w) => wpHuman((x) => WG.applyMove(x, WP.me, f, t, w)),
  onHint: (msg) => toast(msg)
});
wpBoard.onStep = () => wpStatus();
function wpNew() {
  clearTimeout(WP.timer); WP.busy = false;
  WP.m = WP.v === 2 ? WG.newMatch2(WP.n) : WG.newMatch(WP.n);
  WP.me = WP.m.sides[Math.floor(Math.random() * WP.n)];
  $("wpLevels").innerHTML = [1, 2].filter((v) => gameOn(ST.room, v === 2 ? "wallgo2" : "wallgo")).map((v) => `<button class="pr-lv ${v === WP.v ? "active" : ""}" data-wpv="${v}">벽바둑 ${v}</button>`).join("") + `<span class="pr-gap"></span>` + [2, 3, 4].map((k) => `<button class="pr-lv ${k === WP.n ? "active" : ""}" data-wpn="${k}">${k}명</button>`).join("")
    + `<span class="pr-gap"></span>` + WP_LEVELS.map(([k, n]) => `<button class="pr-lv ${k === WP.level ? "active" : ""}" data-wplv="${k}">AI ${n}</button>`).join("");
  $("wpFace").src = "img/porong-wave.jpg";
  wpRender(); wpBot();
}
function wpHuman(fn) {
  if (!WP.m || WP.busy || WP.m.turn !== WP.me || WP.m.phase === "done") return;
  const d = fn(WP.m);
  if (!d) return toast("거기는 둘 수 없어요.");
  WP.m = { ...WP.m, ...d }; wpRender(); wpBot();
}
function wpBot() {
  const m = WP.m;
  if (!m || m.phase === "done" || m.turn === WP.me) return;
  WP.busy = true; wpRender();
  WP.timer = setTimeout(() => {
    const d = WG.botAction(WP.m, WP.level);
    if (d) WP.m = { ...WP.m, ...d };
    WP.busy = false; wpRender(); wpBot();
  }, 650);
}
function wpRender() {
  const m = WP.m;
  wpBoard.render(m, WP.me, { active: m.phase !== "done" && m.turn === WP.me && !WP.busy, showRegions: m.phase === "done" });
  wpStatus();
}
function wpStatus() {
  const m = WP.m, el = $("wpMsg");
  if (!m) return;
  const color = WG.SIDE_NAMES[WP.me];
  if (m.phase === "done") {
    const o = WG.outcomeOf(m, WP.me), win = o === "win", draw = o === "draw";
    const others = m.sides.filter((sd) => sd !== WP.me).map((sd) => `${WG.SIDE_NAMES[sd]} ${m.scores[sd]}칸`).join(", ");
    const head = WP.n === 2 ? (win ? "🏆 이겼어!" : draw ? "🤝 비겼어!" : "😢 AI가 이겼어.") : `${win ? "🏆" : draw ? "🥈" : "😢"} ${WP.n}명 중 ${m.ranks[WP.me]}등!`;
    el.textContent = `${head} 내 땅 ${m.scores[WP.me]}칸 (AI: ${others}). [새 판 시작]으로 다시 해 봐!`;
    $("wpFace").src = `img/porong-${win ? "trophy" : draw ? "cheer" : "cheerup"}.jpg`;
    if (win) confetti();
    return;
  }
  if (WP.busy || m.turn !== WP.me) { el.textContent = m.last && Array.isArray(m.last.skip) && m.last.skip.includes(WP.me) ? "네 말이 모두 움직일 곳이 없어서 차례가 넘어갔어. AI가 두는 중이야…" : "AI가 생각하는 중이야… 🤔"; return; }
  if (m.phase === "place") el.textContent = `나는 ${color}! ${m.v === 2 ? WG.KIND_NAMES[WG.nextPlaceKind(m, m.turn)] + " " : ""}말을 놓을 빈칸을 눌러 봐. (순서: ${WG.placeOrder(m).map((sd) => WG.SIDE_NAMES[sd]).join("→")})`;
  else el.textContent = wpBoard.dest !== null ? "③ 벽을 세울 쪽을 눌러 (주황 점선, 또는 그 방향 칸)"
    : wpBoard.sel !== null ? "② 갈 칸을 눌러 (초록 칸, 제자리는 안 돼요)" : `내 차례(${color})! ① 움직일 내 말을 눌러 봐`;
}
function closeWgPractice() { clearTimeout(WP.timer); WP.busy = false; $("wgPractice").classList.add("hidden"); }
$("wgPracBtn").addEventListener("click", () => { $("wgPractice").classList.remove("hidden"); wpNew(); });

// =====================================================================
// 대칭 퍼즐 혼자 연습하기 (점수 없음)
// =====================================================================
const SP = { lv: 0, i: -1, pz: null };
const spBoard = new SymBoard($("spBoard"), { onChange: (st, res) => spChange(res) });
function spLoad(lv, next = true) {
  SP.lv = lv;
  const L = SYM.levels[lv];
  if (next || SP.i < 0) { let i; do { i = Math.floor(Math.random() * L.puzzles.length); } while (L.puzzles.length > 1 && i === SP.i); SP.i = i; }
  SP.pz = L.puzzles[SP.i];
  spBoard.load(SP.pz, initialState(SP.pz));
  $("spLevels").innerHTML = SYM.levels.map((x, i) => `<button class="pr-lv ${i === lv ? "active" : ""}" data-splv="${i}">${x.tut ? "🐣 " : ""}${x.name}</button>`).join("");
  $("spMsg").textContent = "조각을 끌어서 옮기고, 톡 누르면 돌아가. 선대칭 모양을 만들어 봐!";
  $("spMsg").className = "bubble";
}
function spChange(res) {
  if (res && res.ok) { $("spMsg").textContent = "완성! 🦋 점선이 대칭축이야. 다른 문제도 풀어 볼까?"; $("spMsg").className = "bubble ok"; spBoard.setLocked(true); confetti(); return; }
  $("spMsg").textContent = (res && SYM_WHY[res.why]) || "조각을 끌어서 옮기고, 톡 누르면 돌아가.";
  $("spMsg").className = "bubble";
}
$("symPracBtn").addEventListener("click", () => { $("symPractice").classList.remove("hidden"); spLoad(SP.lv, SP.i < 0); });
$("spClose").addEventListener("click", () => $("symPractice").classList.add("hidden"));
$("spNext").addEventListener("click", () => spLoad(SP.lv));
$("spReset").addEventListener("click", () => spLoad(SP.lv, false));
$("spAnswer").addEventListener("click", () => { spBoard.load(SP.pz, answerState(SP.pz), { locked: true }); $("spMsg").textContent = "이렇게 하면 돼! (다른 모양도 대칭이면 정답이야)"; $("spMsg").className = "bubble"; });
$("spLevels").addEventListener("click", (e) => { const b = e.target.closest("[data-splv]"); if (b) spLoad(Number(b.dataset.splv)); });

// =====================================================================
// 큐브 세기 혼자 연습하기 (점수 없음, 바로 정답 확인)
// =====================================================================
const CP = { lv: 0, key: null, input: "", done: false, streak: 0 };
function cpLoad(lv) {
  CP.lv = lv; CP.input = ""; CP.done = false;
  const L = CUBES[lv];
  let k;
  do { k = L.puzzles[Math.floor(Math.random() * L.puzzles.length)]; } while (L.puzzles.length > 1 && k === CP.key);
  CP.key = k;
  $("cpLevels").innerHTML = CUBES.map((x, i) => `<button class="pr-lv ${i === lv ? "active" : ""}" data-cplv="${i}">${x.tut ? "🐣 " : ""}${x.name}</button>`).join("");
  $("cpPic").innerHTML = cubeSVG(k, L.w, L.h, { cls: "cube-svg big" });
  $("cpTop").innerHTML = "";
  $("cpMsg").textContent = "큐브가 모두 몇 개일까? 보이지 않는 아래쪽 큐브도 세어 봐!";
  $("cpMsg").className = "bubble";
  cpDraw();
}
function cpDraw() {
  $("cpIn").textContent = CP.input || "?";
  $("cpPad").classList.toggle("hidden", CP.done);
  $("cpNext").classList.toggle("hidden", !CP.done);
}
function cpCheck() {
  if (!CP.input) return toast("먼저 숫자를 눌러 개수를 넣어 주세요.");
  const L = CUBES[CP.lv], right = cubeCount(CP.key), ok = Number(CP.input) === right;
  CP.done = true; CP.streak = ok ? CP.streak + 1 : 0;
  $("cpMsg").textContent = ok ? `정답! 모두 ${right}개야. 🎉${CP.streak > 1 ? ` ${CP.streak}문제 연속 정답!` : ""}` : `아쉬워! 정답은 ${right}개야. 위에서 본 모양으로 칸마다 몇 층인지 확인해 봐.`;
  $("cpMsg").className = "bubble " + (ok ? "ok" : "bad");
  $("cpTop").innerHTML = `<small>위에서 보면 (칸마다 쌓인 수)</small>${cubeTopHTML(CP.key, L.w, L.h)}`;
  if (ok) confetti();
  cpDraw();
}
$("cubePracBtn").addEventListener("click", () => { $("cubePractice").classList.remove("hidden"); cpLoad(CP.lv); });
$("cpClose").addEventListener("click", () => $("cubePractice").classList.add("hidden"));
$("cpNext").addEventListener("click", () => cpLoad(CP.lv));
$("cpLevels").addEventListener("click", (e) => { const b = e.target.closest("[data-cplv]"); if (b) cpLoad(Number(b.dataset.cplv)); });
$("cpPad").addEventListener("click", (e) => {
  const b = e.target.closest("[data-k]");
  if (!b || CP.done) return;
  const k = b.dataset.k;
  if (k === "ok") return cpCheck();
  if (k === "del") CP.input = CP.input.slice(0, -1);
  else if (CP.input.length < 3) CP.input = (CP.input + k).replace(/^0+(?=\d)/, "");
  cpDraw();
});
$("wpClose").addEventListener("click", closeWgPractice);
$("wpNew").addEventListener("click", wpNew);
$("wpLevels").addEventListener("click", (e) => {
  const b = e.target.closest("[data-wplv]"), c = e.target.closest("[data-wpn]");
  if (b) { WP.level = b.dataset.wplv; wpNew(); }
  if (c) { WP.n = Number(c.dataset.wpn); wpNew(); }
  const v = e.target.closest("[data-wpv]");
  if (v) { WP.v = Number(v.dataset.wpv); wpNew(); }
});
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
const T = { unsubs: [], room: null, players: [], matches: [], graded: new Map(), queue: Promise.resolve(), ending: false, sel: null, csel: null, ssel: null, psel: null, game: null, boardKey: null, answer: false, tick: null, autoTry: new Map() };
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
      status: "waiting", round: 0, game: "fence", level: 1, times: DEFAULT_TIMES, pts: DEFAULT_PTS, wg: DEFAULT_WG, ptsV: PTS_V, turnSec: DEFAULT_TURN,
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
  Object.assign(T, { code, roomRef, room: null, players: [], matches: [], graded: new Map(), queue: Promise.resolve(), ending: false, sel: null, csel: null, ssel: null, psel: null, game: null, boardKey: null, answer: false, autoTry: new Map() });
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
    if (T.ssel === null || T.ssel > SYM.levels.length) T.ssel = Math.min((T.room.game === "sym" && T.room.level) || 1, SYM.levels.length);
    if (T.csel === null || T.csel > CUBES.length) T.csel = Math.min((T.room.cube && T.room.cube.lv) || 1, CUBES.length);
    if (T.psel === null || T.psel > SPOT_LEVELS.length) T.psel = Math.min((T.room.spot && T.room.spot.lv) || 1, SPOT_LEVELS.length);
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
const stimes = () => { const t = T.room && T.room.stimes; return Array.isArray(t) && t.length === SYM.levels.length ? t : DEFAULT_STIMES; };   // 0 = 제한 시간 없음
const ctimes = () => { const t = T.room && T.room.ctimes; return Array.isArray(t) && t.length === CUBES.length ? t : DEFAULT_CTIMES; };   // 0 = 제한 시간 없음
const pmems = () => { const t = T.room && T.room.pmem; return Array.isArray(t) && t.length === SPOT_LEVELS.length ? t : DEFAULT_PMEM; };
const ptimes = () => { const t = T.room && T.room.ptimes; return Array.isArray(t) && t.length === SPOT_LEVELS.length ? t : DEFAULT_PTIMES; };   // 0 = 제한 시간 없음
const roomPts = (r) => {
  const p = (r && r.ptsV === PTS_V && r.pts) || {};
  const n = (v, d) => (Number.isFinite(v) ? v : d);
  return { base: n(p.base, DEFAULT_PTS.base), top: n(p.top, DEFAULT_PTS.top), mult: typeof p.mult === "boolean" ? p.mult : DEFAULT_PTS.mult, part: n(p.part, DEFAULT_PTS.part) };
};
const roomWg = (r) => ({ ...DEFAULT_WG, ...((r && r.ptsV === PTS_V && r.wg) || {}) });
const pts = () => roomPts(T.room);
const wgPts = () => roomWg(T.room);
const turnSec = () => (T.room && T.room.turnSec) || DEFAULT_TURN;
const roundMatches = () => (T.room ? T.matches.filter((m) => m.round === T.room.round) : []);

function playerState(p, r) {
  if (!r || r.round < 1) return { cls: "", txt: "대기 중" };
  const res = p.result && p.result.round === r.round ? p.result : (T.graded.get(r.round + "|" + p.id) || null);
  if (isWG(r.game)) {
    if (res && res !== "pending") {
      const o = res.outcome;
      const lbl = res.n > 2 ? { win: "🏆 1등", draw: `🥈 ${res.rank}등`, lose: `😢 ${res.rank}등` }[o] : { win: "🏆 승리", draw: "🤝 무승부", lose: "😢 패배", bye: "🍀 부전승" }[o];
      return { cls: o === "lose" ? "bad" : "ok", txt: `${lbl} +${res.points}`, done: true };
    }
    const mt = p.mt && p.mt.round === r.round ? p.mt : null;
    if (!mt) return { cls: "", txt: r.status === "playing" ? "다음 게임부터" : "대기 중", done: r.status === "playing", spectator: true };
    const m = T.matches.find((x) => x.id === mt.id);
    if (m && m.phase === "done") return { cls: "wait", txt: "점수 계산 중…" };
    return { cls: "", txt: `⚔️ 대결 중`, solving: true };
  }
  if (res && res !== "pending" && r.game !== "cube" && r.game !== "spot") {
    if (res.correct) return { cls: "ok", txt: `✅ ${res.rank}등 · +${res.points}점`, done: true, ok: true };
    if (res.reason === "wrong") return { cls: "bad", txt: "❌ 오답", done: true, bad: true };
    return { cls: "bad", txt: "⏰ 시간 초과", done: true, late: true };
  }
  if (r.game === "cube" && res && res !== "pending") {
    if (res.correct) return { cls: "ok", txt: `✅ ${res.total}/${res.total} · ${res.rank}등 · +${res.points}점`, done: true, ok: true };
    if (res.reason === "timeout") return { cls: "bad", txt: "⏰ 시간 초과", done: true, late: true };
    return { cls: res.n ? "ok" : "bad", txt: `🟡 ${res.n}/${res.total} 정답 · +${res.points}점`, done: true, bad: !res.n };
  }
  if (r.game === "spot" && res && res !== "pending") {
    if (res.correct) return { cls: "ok", txt: `✅ ${res.total}/${res.total} · ${res.rank}등 · +${res.points}점`, done: true, ok: true };
    return { cls: res.n ? "ok" : "bad", txt: `🟡 ${res.n}/${res.total}곳 · +${res.points}점`, done: true, bad: !res.n };
  }
  if (p.sub && p.sub.round === r.round) return { cls: "wait", txt: "📮 채점 중…" };
  if (r.status === "playing" && r.game === "spot") return { cls: "", txt: `🔍 찾는 중 ${spotFound(p, r.round).length}/${spotBoxes(spotKey(r)).length}`, solving: true };
  if (r.status === "playing" && r.game === "cube") return { cls: "", txt: `✏️ 푸는 중 ${cubeMyAnswers(p, r.round).length}/${(r.cube && r.cube.qs.length) || CUBE_Q}`, solving: true };
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
  const ons = onGames(r);
  if (!playing && !ons.includes(T.game)) { T.game = ons[0]; return renderTeacher(); }
  $("gameOnBtns").innerHTML = Object.entries(GAMES).map(([id, g]) => {
    const on = gameOn(r, id), lock = playing && r.game === id;
    return `<button class="tc-btn game-on ${on ? "active" : ""}" data-gon="${id}" ${lock ? "disabled title=\"지금 하는 게임은 끌 수 없어요\"" : ""}>${on ? "✅" : "⬜"} ${g.icon} ${g.name}</button>`;
  }).join("");
  $("gameOnNote").textContent = `켠 게임 ${ons.length}개 · 끈 게임은 학생 연습과 게임 방법에서도 사라져요`;
  $("gameTabs").innerHTML = Object.entries(GAMES).filter(([id]) => ons.includes(id) || (playing && r.game === id)).map(([id, g]) =>
    `<button class="game-tab ${id === game ? "active" : ""}" data-game="${id}" ${playing ? "disabled" : ""}><span>${g.icon}</span>${g.name}</button>`).join("");
  $("gameDesc").textContent = GAMES[game].desc;
  $("fencePanel").classList.toggle("hidden", game !== "fence");
  $("wgPanel").classList.toggle("hidden", !isWG(game));
  $("cubePanel").classList.toggle("hidden", game !== "cube");
  $("symPanel").classList.toggle("hidden", game !== "sym");
  $("spotPanel").classList.toggle("hidden", game !== "spot");
  $("spotLevelBtns").innerHTML = SPOT_LEVELS.map((L, i) => {
    const lv = i + 1, t = ptimes()[i];
    return `<button class="level-btn ${lv === T.psel ? "active" : ""}" data-plv="${lv}" ${playing ? "disabled" : ""}>
      <b>${L.name}</b>바뀐 곳 ${L.count} · 그림 ${L.keys.length}개<br><small>👀 ${pmems()[i]}초 → 🔍 ${t > 0 ? fmtTime(t) : "제한 없음"}${pts().mult ? ` · ×${SPOT_MULT[i]}` : ""}</small></button>`;
  }).join("");
  const ptt = ptimes()[T.psel - 1];
  $("ptimeLabel").textContent = ptt > 0 ? fmtTime(ptt) : "제한 없음";
  $("ptimeLabel").classList.toggle("free", !(ptt > 0));
  $("ptimeFree").textContent = ptt > 0 ? "♾️ 제한 없음" : "⏱ 시간 정하기";
  $("ptimeFree").classList.toggle("on", !(ptt > 0));
  $("ptimeNote").classList.toggle("hidden", ptt > 0);
  ["ptimePlus", "ptimeFree"].forEach((id) => ($(id).disabled = playing));
  $("pmemLabel").textContent = `${pmems()[T.psel - 1]}초`;
  ["pmemMinus", "pmemPlus"].forEach((id) => ($(id).disabled = playing));
  $("ptimeMinus").disabled = playing || !(ptt > 0);
  $("symLevelBtns").innerHTML = SYM.levels.map((L, i) => {
    const lv = i + 1, t = stimes()[i];
    return `<button class="level-btn ${L.tut ? "tut" : ""} ${lv === T.ssel ? "active" : ""}" data-slv="${lv}" ${playing ? "disabled" : ""}>
      <b>${L.tut ? "🐣 " : ""}${L.name}</b>조각 ${L.k}개 · ${L.size}<br><small>${t > 0 ? fmtTime(t) : "시간 제한 없음"}${pts().mult ? ` · ×${SYM_MULT[i]}` : ""}</small></button>`;
  }).join("");
  const stt = stimes()[T.ssel - 1];
  $("stimeLabel").textContent = stt > 0 ? fmtTime(stt) : "제한 없음";
  $("stimeLabel").classList.toggle("free", !(stt > 0));
  $("stimeFree").textContent = stt > 0 ? "♾️ 제한 없음" : "⏱ 시간 정하기";
  $("stimeFree").classList.toggle("on", !(stt > 0));
  $("stimeNote").classList.toggle("hidden", stt > 0);
  ["stimePlus", "stimeFree"].forEach((id) => ($(id).disabled = playing));
  $("stimeMinus").disabled = playing || !(stt > 0);
  $("cubeLevelBtns").innerHTML = CUBES.map((L, i) => {
    const lv = i + 1;
    return `<button class="level-btn ${L.tut ? "tut" : ""} ${lv === T.csel ? "active" : ""}" data-clv="${lv}" ${playing ? "disabled" : ""}>
      <b>${L.tut ? "🐣 " : ""}${L.name}</b>${L.w}×${L.h} · ${L.max}층<br><small>${CUBE_Q}문제 · ${ctimes()[i] > 0 ? fmtTime(ctimes()[i]) : "시간 제한 없음"}${pts().mult ? ` · ×${LEVEL_MULT[i]}` : ""}</small></button>`;
  }).join("");
  const ct = ctimes()[T.csel - 1];
  $("ctimeLabel").textContent = ct > 0 ? fmtTime(ct) : "제한 없음";
  $("ctimeLabel").classList.toggle("free", !(ct > 0));
  $("ctimeFree").textContent = ct > 0 ? "♾️ 제한 없음" : "⏱ 시간 정하기";
  $("ctimeFree").classList.toggle("on", !(ct > 0));
  $("ctimeNote").classList.toggle("hidden", ct > 0);
  ["ctimeMinus", "ctimePlus", "ctimeFree"].forEach((id) => ($(id).disabled = playing));
  $("ctimeMinus").disabled = playing || !(ct > 0);

  // 울타리치기 단계
  $("levelBtns").innerHTML = PUZZLES.map((L, i) => {
    const lv = i + 1, info = levelInfo(lv);
    return `<button class="level-btn ${info.tut ? "tut" : ""} ${lv === T.sel ? "active" : ""}" data-lv="${lv}" ${playing ? "disabled" : ""}>
      <b>${info.tut ? "🐣 " : ""}${info.name}</b>${info.size}<br><small>${info.kind} · ${fmtTime(times()[i])}${pts().mult ? ` · ×${LEVEL_MULT[i]}` : ""}</small></button>`;
  }).join("");
  $("timeLabel").textContent = fmtTime(times()[T.sel - 1]);
  $("turnLabel").textContent = `${turnSec()}초`;
  const sz = wgSize();
  $("wgSizeBtns").innerHTML = [2, 3, 4].map((k) => `<button class="tc-btn ${k === sz ? "active" : ""}" data-wgsize="${k}" ${playing ? "disabled" : ""}>${k}명씩</button>`).join("");
  const cnt = {}; makeGroups(T.players, sz).forEach((g) => (cnt[g.length] = (cnt[g.length] || 0) + 1));
  $("wgSizeNote").textContent = T.players.length < 2 ? "학생이 2명 이상 들어오면 조가 짜여요."
    : `지금 ${T.players.length}명 → ` + Object.keys(cnt).sort().map((k) => `${k}명 조 ${cnt[k]}개`).join(", ") + " (2명 조는 말 4개, 3~4명 조는 말 2개)";
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
  const showCube = r.round > 0 && r.game === "cube" && r.cube;
  const showSym = r.round > 0 && r.game === "sym" && symPz(r);
  const showSpot = r.round > 0 && r.game === "spot" && spotKey(r);
  $("tPuzzleCard").classList.toggle("hidden", !showPuzzle && !showCube && !showSym && !showSpot);
  $("tSpot").classList.toggle("hidden", !showSpot);
  if (showSpot) {
    $("tRoundInfo").textContent = `${r.round}라운드 · 달라진 그림 찾기 · ${spotTitle(spotKey(r))} · ${spotBoxes(spotKey(r)).length}곳 · 👀 ${(r.spot && r.spot.mem) || 0}초${r.status === "playing" && now() < spotMemEnd(r) ? "(외우는 중)" : ""}${r.duration > 0 ? "" : " · 시간 제한 없음"}${r.status === "ended" ? " · 끝" : ""}`;
    const k = r.round + ":" + T.answer;
    if (T.spotKey !== k) { T.spotKey = k; tSpotGame.load(spotKey(r), [], { locked: true, showAll: T.answer }); tSpotGame.setView("both"); }
    $("answerBtn").classList.toggle("hidden", r.status !== "ended");
    $("answerBtn").textContent = T.answer ? "🙈 다른 곳 숨기기" : "✅ 다른 곳 보기";
  }
  $("tSym").style.display = showSym ? "" : "none";
  if (showSym) {
    $("tRoundInfo").textContent = `${r.round}라운드 · 대칭 퍼즐 · ${symLabel(r.level)}${r.duration > 0 ? "" : " · 시간 제한 없음"}${r.status === "ended" ? " · 끝" : ""}`;
    const k = r.round + ":" + T.answer;
    if (T.symKey !== k) { T.symKey = k; const pz = symPz(r); tSymBoard.load(pz, T.answer ? answerState(pz) : initialState(pz), { locked: true }); }
    $("answerBtn").classList.toggle("hidden", r.status !== "ended");
    $("answerBtn").textContent = T.answer ? "🙈 정답 예시 숨기기" : "✅ 정답 예시 보기";
  }
  $("tBoard").style.display = showPuzzle ? "" : "none";
  $("tCubes").classList.toggle("hidden", !showCube);
  if (showCube) {
    $("tRoundInfo").textContent = `${r.round}라운드 · 큐브 세기 · ${cubeLabel(r.cube.lv)}${r.duration > 0 ? "" : " · 시간 제한 없음"}${r.status === "ended" ? " · 끝" : ""}`;
    const L = CUBES[r.cube.lv - 1], k = r.round + ":" + T.answer;
    if ($("tCubes").dataset.k !== k) {
      $("tCubes").dataset.k = k;
      $("tCubes").innerHTML = r.cube.qs.map((key, i) => `<div class="tc-q"><div class="cr-pic">${cubeSVG(key, L.w, L.h)}</div><b>${i + 1}번${T.answer ? ` · ${cubeCount(key)}개` : ""}</b></div>`).join("");
    }
    $("answerBtn").classList.toggle("hidden", r.status !== "ended");
    $("answerBtn").textContent = T.answer ? "🙈 정답 숨기기" : "✅ 정답 보기";
  }
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
    const w = wingInfo(wingScore(p));
    return `<li class="${p.rank <= 3 ? "top" + p.rank : ""}"><span class="no">${medal(p.rank)}</span><span class="pc-av">${avHTML(p)}</span><span class="nm">${esc(p.name)}<small>🪽 ${w.name}</small></span><span class="sc">${p.score || 0}<small>총 ${wingScore(p)}</small></span></li>`;
  }).join("") || `<li>아직 학생이 없어요.</li>`;
  $("tSummary").textContent = r.round > 0
    ? (isWG(r.game) ? `대결 ${roundMatches().filter((m) => m.phase === "done").length} / ${roundMatches().length} 끝`
      : `정답 ${nOk} · 틀림/시간 초과 ${nBad} · 채점 중 ${nWait} · 푸는 중 ${nSolve}`) : "";
  if (!$("rankOverlay").classList.contains("hidden")) renderBigRank();
}

function renderMatches() {
  const r = T.room;
  const show = r && r.round > 0 && isWG(r.game);
  $("tMatchesWrap").classList.toggle("hidden", !show);
  if (!show) return;
  const ms_ = roundMatches().sort((a, b) => Number(a.id.split("-")[1]) - Number(b.id.split("-")[1]));
  const byes = T.players.filter((p) => p.mt && p.mt.round === r.round && p.mt.bye);
  $("tMatchInfo").textContent = `${r.round}라운드 · ${GAMES[r.game].name} · 한 수 ${r.turnSec || DEFAULT_TURN}초${r.status === "ended" ? " · 끝" : ""}`;
  $("tMatches").innerHTML = ms_.map((m, i) => {
    let st, cls = "";
    const sides = WG.sidesOf(m), done = m.phase === "done";
    const sc = m.scores || { a: m.scoreA, b: m.scoreB };
    if (done) {
      const order = [...sides].sort((x, y) => (sc[y] || 0) - (sc[x] || 0));
      st = "끝 · " + order.map((sd) => `${(m.ranks || {})[sd] || ""}등 <b>${esc(m[sd])}</b>(${sc[sd] || 0})`).join(" · ");
      if (m.forced) st += " · 시간 종료";
      cls = "done";
    } else if (m.phase === "place") st = "말 놓는 중";
    else st = `경기 중 · ${Math.max(1, m.moveNo - WG.placeOrder(m).length + 1)}수째 · ${esc(m[m.turn] || "")} 차례`;
    const ps = sides.map((sd) => `<span class="mc-p side-${sd} ${done && (m.ranks || {})[sd] === 1 ? "win" : ""}">${esc(m[sd])}</span>`).join(`<span class="mc-vs">vs</span>`);
    return `<div class="mc ${cls}"><span class="mc-no">${i + 1}</span>${ps}<span class="mc-st">${st}</span></div>`;
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
  if (isWG(r.game)) {
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
  const allDone = T.players.length && T.players.every((p) => playerState(p, r).done);
  if (end === null) {   // 제한 시간 없음: 지난 시간 표시, 모두 끝내면 자동 종료(아니면 선생님이 [라운드 끝내기])
    if (!ms(r.startAt)) return;
    $("tTimer").textContent = "⏱ " + fmtTime(elapsedOf(r));
    $("tTimer").classList.remove("warn"); $("tTimer").classList.add("free");
    if (allDone) endRound();
    return;
  }
  const left = (end - now()) / 1000;
  $("tTimer").classList.remove("free");
  $("tTimer").textContent = fmtTime(left);
  $("tTimer").classList.toggle("warn", left <= 10 && left > 0);
  if (now() > end + GRACE_MS + 800) return endRound();
  if (T.players.length && T.players.every((p) => playerState(p, r).done)) endRound();
}

// ----- 울타리치기 채점 -----
function gradePending() {
  const r = T.room;
  if (!r || r.status !== "playing" || !["fence", "cube", "sym", "spot"].includes(r.game)) return;
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
// 큐브 세기 채점: 모두 맞히면 끝낸 순서로 등수·보너스, 일부만 맞히면 맞힌 비율만큼
function cubeResult(r, answers, round, late) {
  const qs = r.cube.qs, P = pts();
  const n = qs.reduce((a, key, i) => a + (answers[i] !== undefined && Number(answers[i]) === cubeCount(key) ? 1 : 0), 0);
  const perfect = !late && n === qs.length;
  let rank = 0, points;
  if (perfect) { rank = correctCount(round) + 1; points = calcPoints(P, rank, r.level); }
  else points = Math.max(P.part, Math.round(P.base * (n / qs.length) * (P.mult ? (LEVEL_MULT[r.level - 1] || 1) : 1)));
  return { round, game: "cube", correct: perfect, n, total: qs.length, rank, points, reason: perfect ? "ok" : answers.length ? "partial" : "timeout" };
}
// 달라진 그림 찾기 채점: 모두 찾으면 찾은 순서로 등수·보너스, 일부만 찾으면 찾은 비율만큼
function spotResult(r, found, round, late) {
  const total = spotBoxes(spotKey(r)).length, P = pts();
  const n = found.filter((i) => i < total).length;
  const perfect = !late && total > 0 && n >= total;
  let rank = 0, points;
  if (perfect) { rank = correctCount(round) + 1; points = calcPoints(P, rank, r.level, "spot"); }
  else points = Math.max(P.part, Math.round(P.base * (n / (total || 1)) * (P.mult ? multOf("spot", r.level) : 1)));
  return { round, game: "spot", correct: perfect, n, total, rank, points, reason: perfect ? "ok" : n ? "partial" : "timeout" };
}
async function gradeOne(p, round) {
  const r = T.room;
  if (!r || r.round !== round) return;
  if (r.game === "spot") {
    const end = endAtOf(r);
    const late = end !== null && ms(p.sub.at) > end + GRACE_MS;
    const result = spotResult(r, spotFound(p, round), round, late);
    T.graded.set(round + "|" + p.id, result);
    await updateDoc(pRefOf(p.id), { result, score: increment(result.points), total: increment(result.points) });
    return;
  }
  if (r.game === "cube") {
    const end = endAtOf(r);
    const late = end !== null && ms(p.sub.at) > end + GRACE_MS;
    const result = cubeResult(r, cubeMyAnswers(p, round), round, late);
    T.graded.set(round + "|" + p.id, result);
    await updateDoc(pRefOf(p.id), { result, score: increment(result.points), total: increment(result.points) });
    return;
  }
  if (r.game === "sym") {
    const end = endAtOf(r);
    const late = end !== null && ms(p.sub.at) > end + GRACE_MS;
    const pz = symPz(r);
    const ok = !late && !!pz && checkSym(pz, decodeState(p.sub.edges, pz.p.length)).ok;
    let rank = 0, points = pts().part;
    if (ok) { rank = correctCount(round) + 1; points = calcPoints(pts(), rank, r.level, "sym"); }
    const result = { round, game: "sym", correct: ok, rank, points, reason: ok ? "ok" : late ? "late" : "wrong" };
    T.graded.set(round + "|" + p.id, result);
    await updateDoc(pRefOf(p.id), { result, score: increment(points), total: increment(points) });
    return;
  }
  const end = endAtOf(r);
  const late = end !== null && ms(p.sub.at) > end + GRACE_MS;
  const ok = !late && checkSolution(r.puzzle.w, r.puzzle.h, r.puzzle.c, decodeEdges(p.sub.edges));
  let rank = 0, points = pts().part;
  if (ok) { rank = correctCount(round) + 1; points = calcPoints(pts(), rank, r.level); }
  const result = { round, game: "fence", correct: ok, rank, points, reason: ok ? "ok" : late ? "late" : "wrong" };
  T.graded.set(round + "|" + p.id, result);
  await updateDoc(pRefOf(p.id), { result, score: increment(points), total: increment(points) });
}

// ----- 벽바둑 점수 -----
function wgResult(m, side, round) {
  const P = wgPts(), sides = WG.sidesOf(m);
  const sc = m.scores || { a: m.scoreA || 0, b: m.scoreB || 0 };
  const ranks = m.ranks || WG.ranksOf(sc);
  const o = WG.outcomeOf({ ...m, ranks }, side);
  const others = sides.filter((sd) => sd !== side);
  return { round, game: "wallgo", outcome: o, points: P[o], rank: ranks[side], n: sides.length, my: sc[side] || 0,
    opp: Math.max(...others.map((sd) => sc[sd] || 0)), vs: others.map((sd) => m[sd]).join(", ") };
}
function gradeMatches() {
  const r = T.room;
  if (!r || r.status !== "playing" || !isWG(r.game)) return;
  const round = r.round;
  for (const m of roundMatches()) {
    if (m.phase !== "done") continue;
    for (const side of WG.sidesOf(m)) {
      const name = m[side], key = round + "|" + name;
      const p = T.players.find((x) => x.id === name);
      if (!p || (p.result && p.result.round === round) || T.graded.has(key)) continue;
      const result = wgResult(m, side, round);
      T.graded.set(key, result);
      T.queue = T.queue.then(() => updateDoc(pRefOf(name), { result, score: increment(result.points), total: increment(result.points) }))
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
    if (isWG(r.game)) {
      gradeMatches();
      await T.queue;
      for (const m of roundMatches()) {
        let mm = m;
        if (m.phase !== "done") { const f = WG.forceFinish(m); batch.update(mRefOf(m.id), { ...f, endedAt: now() }); mm = { ...m, ...f }; }
        for (const side of WG.sidesOf(mm)) {
          const name = mm[side], key = round + "|" + name;
          const p = T.players.find((x) => x.id === name);
          if (!p || (p.result && p.result.round === round) || T.graded.has(key)) continue;
          const result = wgResult(mm, side, round);
          T.graded.set(key, result);
          batch.update(pRefOf(name), { result, score: increment(result.points), total: increment(result.points) });
        }
      }
    } else {
      gradePending();
      await T.queue;
      T.players.forEach((p) => {
        const has = (p.result && p.result.round === round) || T.graded.has(round + "|" + p.id);
        const sub = p.sub && p.sub.round === round;
        if (has || sub) return;
        if (r.game === "spot") {
          const result = spotResult(r, spotFound(p, round), round, true);
          T.graded.set(round + "|" + p.id, result);
          batch.update(pRefOf(p.id), { result, score: increment(result.points), total: increment(result.points) });
        } else if (r.game === "cube") {
          const result = cubeResult(r, cubeMyAnswers(p, round), round, true);
          T.graded.set(round + "|" + p.id, result);
          batch.update(pRefOf(p.id), { result, score: increment(result.points), total: increment(result.points) });
        } else {
          const pp = pts().part;
          batch.update(pRefOf(p.id), { result: { round, game: r.game, correct: false, rank: 0, points: pp, reason: "timeout" }, score: increment(pp), total: increment(pp) });
        }
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

async function startSym() {
  const r = T.room;
  const lv = T.ssel, L = SYM.levels[lv - 1];
  const used = (r.used && r.used["S" + lv]) || [];
  let cand = L.puzzles.map((_, i) => i).filter((i) => !used.includes(i));
  const reset = !cand.length;
  if (reset) cand = L.puzzles.map((_, i) => i);
  const pick = cand[Math.floor(Math.random() * cand.length)];
  await updateDoc(T.roomRef, {
    status: "playing", game: "sym", round: (r.round || 0) + 1, level: lv, sym: { lv, i: pick },
    startAt: serverTimestamp(), duration: stimes()[lv - 1], explain: deleteField(),
    [`used.S${lv}`]: reset ? [pick] : arrayUnion(pick)
  });
}
async function startSpot() {
  const r = T.room;
  const lv = T.psel, L = SPOT_LEVELS[lv - 1];
  const used = (r.used && r.used["P" + lv]) || [];
  let cand = L.keys.filter((k) => !used.includes(k));
  const reset = !cand.length;
  if (reset) cand = [...L.keys];
  const k = cand[Math.floor(Math.random() * cand.length)];
  await updateDoc(T.roomRef, {
    // duration = 외우는 시간 + 찾는 시간 (찾는 시간 제한이 없으면 0)
    status: "playing", game: "spot", round: (r.round || 0) + 1, level: lv, spot: { lv, k, mem: pmems()[lv - 1] },
    startAt: serverTimestamp(), duration: ptimes()[lv - 1] > 0 ? pmems()[lv - 1] + ptimes()[lv - 1] : 0, explain: deleteField(),
    [`used.P${lv}`]: reset ? [k] : arrayUnion(k)
  });
}
async function startCube() {
  const r = T.room;
  const lv = T.csel, L = CUBES[lv - 1];
  const used = (r.used && r.used["C" + lv]) || [];
  let cand = L.puzzles.map((_, i) => i).filter((i) => !used.includes(i));
  const reset = cand.length < CUBE_Q;
  if (reset) cand = L.puzzles.map((_, i) => i);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  // 한 판 5문제는 되도록 답(큐브 개수)이 서로 다르게, 앞 판에서 나온 답도 되도록 피함
  if (!reset) { const before = new Set(used.map((i) => cubeCount(L.puzzles[i]))); cand.sort((x, y) => before.has(cubeCount(L.puzzles[x])) - before.has(cubeCount(L.puzzles[y]))); }
  const pick = [], got = new Set();
  for (const i of cand) { if (pick.length >= CUBE_Q) break; const n = cubeCount(L.puzzles[i]); if (!got.has(n)) { got.add(n); pick.push(i); } }
  for (const i of cand) { if (pick.length >= CUBE_Q) break; if (!pick.includes(i)) pick.push(i); }
  await updateDoc(T.roomRef, {
    status: "playing", game: "cube", round: (r.round || 0) + 1, level: lv,
    cube: { lv, qs: pick.map((i) => L.puzzles[i]) },
    startAt: serverTimestamp(), duration: ctimes()[lv - 1], explain: deleteField(),
    [`used.C${lv}`]: reset ? pick : arrayUnion(...pick)
  });
}

// 정한 인원(2~4명)에 가깝게, 부전승 없이 모두 2~4명 조로 나누기
function makeGroups(list, k) {
  const n = list.length;
  if (n < 2) return [];
  let g = Math.round(n / k);
  g = Math.max(g, Math.ceil(n / 4));
  g = Math.max(1, Math.min(g, Math.floor(n / 2)));
  const base = Math.floor(n / g), extra = n % g, groups = [];
  let i = 0;
  for (let j = 0; j < g; j++) { const sz = base + (j < extra ? 1 : 0); groups.push(list.slice(i, i + sz)); i += sz; }
  return groups;
}
const wgSize = () => { const v = T.room && T.room.wgSize; return v >= 2 && v <= 4 ? v : 2; };
async function startWallgo() {
  const r = T.room;
  const list = [...T.players];
  if (list.length < 2) return toast("벽바둑은 2명 이상 들어와야 시작할 수 있어요.");
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  const round = (r.round || 0) + 1, sec = turnSec(), size = wgSize();
  const batch = writeBatch(db);
  makeGroups(list, size).forEach((grp, gi) => {
    const id = `${round}-${gi + 1}`, m = newWG(T.game, grp.length, { round, turnSec: sec });
    m.sides.forEach((sd, k) => {
      m[sd] = grp[k].id;
      batch.update(pRefOf(grp[k].id), { mt: { round, id, side: sd } });
    });
    batch.set(mRefOf(id), m);
  });
  batch.update(T.roomRef, { status: "playing", game: T.game, round, startAt: serverTimestamp(), turnSec: sec, wgSize: size, explain: deleteField() });
  await batch.commit();
}

async function startRound() {
  const r = T.room;
  if (!r || r.status === "playing") return;
  $("startBtn").disabled = true;
  try { if (isWG(T.game)) await startWallgo(); else if (T.game === "cube") await startCube(); else if (T.game === "sym") await startSym(); else if (T.game === "spot") await startSpot(); else await startFence(); }
  catch (e) { console.error(e); toast("시작하지 못했어요. 다시 눌러 주세요."); }
  finally { $("startBtn").disabled = false; }
}

// ----- 교사 버튼 -----
$("gameOnBtn").addEventListener("click", () => $("gameOnBox").classList.toggle("hidden"));
$("gameOnBtns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-gon]");
  if (!b || b.disabled || !T.room) return;
  const id = b.dataset.gon, off = new Set(Array.isArray(T.room.off) ? T.room.off : []);
  if (off.has(id)) off.delete(id);
  else {
    if (onGames(T.room).length <= 1) return toast("게임을 하나는 켜 두어야 해요.");
    off.add(id);
  }
  updateDoc(T.roomRef, { off: [...off] }).catch(() => toast("바꾸지 못했어요."));
});
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
$("cubeLevelBtns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-clv]");
  if (!b || b.disabled) return;
  T.csel = Number(b.dataset.clv); renderTeacher();
});
function changeCTime(d) {
  const arr = [...ctimes()];
  const cur = arr[T.csel - 1];
  arr[T.csel - 1] = d === "free" ? (cur > 0 ? 0 : DEFAULT_CTIMES[T.csel - 1])
    : !(cur > 0) ? DEFAULT_CTIMES[T.csel - 1] : Math.min(900, Math.max(20, cur + d));
  updateDoc(T.roomRef, { ctimes: arr }).catch(() => toast("시간을 바꾸지 못했어요."));
}
$("ctimeMinus").addEventListener("click", () => changeCTime(-10));
$("ctimePlus").addEventListener("click", () => changeCTime(10));
$("ctimeFree").addEventListener("click", () => changeCTime("free"));
$("symLevelBtns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-slv]");
  if (!b || b.disabled) return;
  T.ssel = Number(b.dataset.slv); renderTeacher();
});
function changeSTime(d) {
  const arr = [...stimes()], i = T.ssel - 1, cur = arr[i];
  arr[i] = d === "free" ? (cur > 0 ? 0 : DEFAULT_STIMES[i]) : !(cur > 0) ? DEFAULT_STIMES[i] : Math.min(900, Math.max(20, cur + d));
  updateDoc(T.roomRef, { stimes: arr }).catch(() => toast("시간을 바꾸지 못했어요."));
}
$("stimeMinus").addEventListener("click", () => changeSTime(-30));
$("stimePlus").addEventListener("click", () => changeSTime(30));
$("stimeFree").addEventListener("click", () => changeSTime("free"));
const tSymBoard = new SymBoard($("tSym"));
const tSpotGame = new SpotGame($("tSpot"), { wrongWait: 0 });
$("spotLevelBtns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-plv]");
  if (!b || b.disabled) return;
  T.psel = Number(b.dataset.plv); renderTeacher();
  const L = SPOT_LEVELS[T.psel - 1]; if (L) L.keys.forEach(preloadSpot);
});
function changePTime(d) {
  const arr = [...ptimes()], i = T.psel - 1, cur = arr[i];
  arr[i] = d === "free" ? (cur > 0 ? 0 : DEFAULT_PTIMES[i]) : !(cur > 0) ? DEFAULT_PTIMES[i] : Math.min(900, Math.max(20, cur + d));
  updateDoc(T.roomRef, { ptimes: arr }).catch(() => toast("시간을 바꾸지 못했어요."));
}
function changePMem(d) {
  const arr = [...pmems()], i = T.psel - 1;
  arr[i] = Math.min(120, Math.max(5, arr[i] + d));
  updateDoc(T.roomRef, { pmem: arr }).catch(() => toast("시간을 바꾸지 못했어요."));
}
$("pmemMinus").addEventListener("click", () => changePMem(-5));
$("pmemPlus").addEventListener("click", () => changePMem(5));
$("ptimeMinus").addEventListener("click", () => changePTime(-30));
$("ptimePlus").addEventListener("click", () => changePTime(30));
$("ptimeFree").addEventListener("click", () => changePTime("free"));
$("timePlus").addEventListener("click", () => changeTime(30));
function changeTurn(d) {
  updateDoc(T.roomRef, { turnSec: Math.min(120, Math.max(10, turnSec() + d)) }).catch(() => toast("시간을 바꾸지 못했어요."));
}
$("turnMinus").addEventListener("click", () => changeTurn(-5));
$("wgSizeBtns").addEventListener("click", (e) => {
  const b = e.target.closest("[data-wgsize]");
  if (!b || b.disabled) return;
  updateDoc(T.roomRef, { wgSize: Number(b.dataset.wgsize) }).catch(() => toast("인원을 바꾸지 못했어요."));
});
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
function exLocal(d) {
  const n = EXPLAIN[EXM.game].length, step = EXM.step + d;
  if (step >= n) return hideExplain();
  EXM.step = Math.max(0, step);
  drawExplain(EXM.game, EXM.step, ST.room);
}
$("exPrev").addEventListener("click", () => (EXM.mode === "local" ? exLocal(-1) : exGo(-1)));
$("exNext").addEventListener("click", () => (EXM.mode === "local" ? exLocal(1) : exGo(1)));
$("exEnd").addEventListener("click", () => (EXM.mode === "local" ? hideExplain() : exStop()));
document.querySelectorAll("[data-how]").forEach((b) => b.addEventListener("click", () => openHowTo(b.dataset.how)));
$("endBtn").addEventListener("click", async () => {
  const msg = T.room && isWG(T.room.game)
    ? "지금 라운드를 끝낼까요?\n아직 끝나지 않은 대결은 지금까지 만든 땅 넓이로 승부를 정해요."
    : T.room && T.room.game === "cube"
      ? "지금 라운드를 끝낼까요?\n다 풀지 못한 학생은 지금까지 푼 문제만 채점해요."
      : T.room && T.room.game === "spot"
        ? "지금 라운드를 끝낼까요?\n다 찾지 못한 학생은 지금까지 찾은 곳만큼 점수를 받아요."
      : "지금 라운드를 끝낼까요?\n아직 제출하지 않은 학생은 0점이에요.";
  if (await confirmBox(msg, "끝내기")) endRound();
});
$("answerBtn").addEventListener("click", () => {
  const r = T.room;
  if (r && (r.game === "cube" || r.game === "sym" || r.game === "spot")) { T.answer = !T.answer; renderTeacher(); return; }
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
  $("ptsBase").value = P.base; $("ptsTop").value = P.top; $("ptsMult").checked = P.mult; $("ptsPart").value = P.part;
  $("wgWin").value = W.win; $("wgDraw").value = W.draw; $("wgLose").value = W.lose;
  ptsPreview();
  $("ptsModal").classList.remove("hidden");
});
$("ptsCancel").addEventListener("click", () => $("ptsModal").classList.add("hidden"));
$("ptsDefault").addEventListener("click", () => {
  $("ptsBase").value = DEFAULT_PTS.base; $("ptsTop").value = DEFAULT_PTS.top; $("ptsMult").checked = DEFAULT_PTS.mult; $("ptsPart").value = DEFAULT_PTS.part;
  $("wgWin").value = DEFAULT_WG.win; $("wgDraw").value = DEFAULT_WG.draw; $("wgLose").value = DEFAULT_WG.lose; ptsPreview();
});
function readPts() { return { base: Math.round(Number($("ptsBase").value)), top: Math.round(Number($("ptsTop").value)), mult: $("ptsMult").checked, part: Math.round(Number($("ptsPart").value)) }; }
function readWg() { return { win: Math.round(Number($("wgWin").value)), draw: Math.round(Number($("wgDraw").value)), lose: Math.round(Number($("wgLose").value)) }; }
function ptsPreview() {
  const P = readPts();
  if (!(P.base >= 1 && P.top >= 0)) { $("ptsPreview").textContent = ""; return; }
  const lv = T.sel || 3, I = levelInfo(lv);
  const ranks = [1, 2, 3, P.top + 1].filter((v, k, a) => a.indexOf(v) === k);
  $("ptsPreview").textContent = `예) 울타리치기 ${I.name}: ` + ranks.map((r) => `${r === P.top + 1 ? `${r}등부터` : `${r}등`} ${calcPoints(P, r, lv)}점`).join(" · ") + ` · 오답 ${P.part}점`;
}
["ptsBase", "ptsTop", "ptsMult", "ptsPart"].forEach((id) => $(id).addEventListener("input", ptsPreview));
$("ptsSave").addEventListener("click", async () => {
  const P = readPts(), W = readWg();
  if (!(P.base >= 1 && P.base <= 100 && P.top >= 0 && P.top <= 30 && P.part >= 0 && P.part <= 50)) return toast("혼자 푸는 게임: 기본 점수 1~100, 보너스 등수 0~30, 참여 점수 0~50으로 정해 주세요.");
  if (![W.win, W.draw, W.lose].every((v) => v >= 0 && v <= 100)) return toast("벽바둑 점수는 0~100으로 정해 주세요.");
  try { await updateDoc(T.roomRef, { pts: P, wg: W, ptsV: PTS_V }); $("ptsModal").classList.add("hidden"); toast("점수 설정을 저장했어요."); }
  catch (e) { toast("저장하지 못했어요."); }
});
// 새 이벤트 시작: 점수·팀·대결 기록 초기화 (방과 학생 명단은 그대로)
$("tResetBtn").addEventListener("click", async () => {
  if (T.room && T.room.status === "playing") return toast("라운드가 끝난 뒤에 시작할 수 있어요.");
  if (!(await confirmBox("오늘 점수를 새로 시작할까요?\n모든 학생의 '오늘 점수'(순위판 점수)와 팀이 0으로 돌아가요.\n'총 점수'와 천사 날개는 그대로 남아요.", "오늘 점수 새로 시작"))) return;
  try {
    const batch = writeBatch(db);
    T.players.forEach((p) => batch.update(pRefOf(p.id), { score: 0, result: deleteField(), sub: deleteField(), mt: deleteField(), team: deleteField(), edges: "" }));
    T.matches.forEach((m) => batch.delete(mRefOf(m.id)));
    batch.update(T.roomRef, { status: "waiting", round: 0, used: {} });
    await batch.commit();
    T.graded = new Map();
    toast("오늘 점수를 새로 시작했어요! (총 점수·날개는 그대로)");
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
function renderWingSet(th) {
  $("wingSet").innerHTML = WING_LEVELS.map((w, i) => `<label class="ws-row"><span>${i + 1}단계 · ${w.name}</span>
    <input type="number" min="0" step="10" data-wt="${i}" value="${th[i]}" ${i === 0 ? "disabled" : ""}>
    <small>${i === 0 ? "처음부터" : `앞 단계보다 +${th[i] - th[i - 1]}`}</small></label>`).join("");
}
function readWingSet() { return [...document.querySelectorAll("[data-wt]")].map((el) => Math.round(Number(el.value))); }
$("wingSet").addEventListener("input", () => {
  const th = readWingSet();
  document.querySelectorAll(".ws-row small").forEach((el, i) => (el.textContent = i === 0 ? "처음부터" : `앞 단계보다 +${th[i] - th[i - 1]}`));
});
$("wingDefault").addEventListener("click", () => renderWingSet(DEFAULT_WING_TH));
$("wingSave").addEventListener("click", async () => {
  const th = readWingSet();
  if (!validWingTh(th)) return toast("단계가 올라갈수록 점수가 커지게 넣어 주세요 (1단계는 0).");
  try { await setDoc(doc(db, "settings", "wings"), { th, at: serverTimestamp() }); toast("날개 기준 점수를 저장했어요. 모든 방에 바로 적용돼요."); }
  catch (e) { console.error(e); toast("저장하지 못했어요. 보안 규칙을 새로 게시했는지 확인해 주세요."); }
});
function renderAdmin() {
  renderWingSet(wingTh);
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

// ---------- 전체화면 (위쪽 막대의 버튼) ----------
function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement; }
function fsSync() {
  const on = !!fsEl();
  document.querySelectorAll(".fs-btn").forEach((b) => { b.textContent = on ? "⛶ 전체화면 끄기" : "⛶ 전체화면"; b.classList.toggle("on", on); });
}
async function fsToggle() {
  const d = document.documentElement;
  try {
    if (fsEl()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else if (d.requestFullscreen) await d.requestFullscreen({ navigationUI: "hide" });
    else if (d.webkitRequestFullscreen) d.webkitRequestFullscreen();
    else toast("이 기기에서는 전체화면을 지원하지 않아요.");
  } catch (e) { console.warn(e); toast("전체화면으로 바꾸지 못했어요."); }
}
document.querySelectorAll(".fs-btn").forEach((b) => b.addEventListener("click", fsToggle));
document.addEventListener("fullscreenchange", fsSync);
document.addEventListener("webkitfullscreenchange", fsSync);
if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) document.querySelectorAll(".fs-btn").forEach((b) => (b.style.display = "none"));
