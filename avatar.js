// 나만의 천사 캐릭터 — 얼굴(얼굴형·피부·눈·입·머리·머리색) + 몸(옷 세트: 옷·손·다리·신발) + 점수로 자라는 날개
export const PARTS = {
  face: { name: "얼굴형", n: 4 },
  skin: { name: "피부색", n: 6 },
  eyes: { name: "눈", n: 6 },
  mouth: { name: "표정", n: 6 },
  hair: { name: "머리 모양", n: 8 },
  hairColor: { name: "머리색", n: 8 },
  body: { name: "옷 세트", n: 6 }
};
export const PART_ORDER = ["face", "skin", "eyes", "mouth", "hair", "hairColor", "body"];
const SKIN = ["#ffe3cf", "#f8d0b0", "#eab48c", "#d39a6a", "#a8704a", "#7a4e33"];
const HAIR = ["#3b2a20", "#6b4226", "#a86b3c", "#e8c170", "#e86f5a", "#8e6cd8", "#5b8def", "#ff8fb4"];
const BODY = [
  { name: "하늘 후드티", top: "#7fb2ff", dark: "#4f84e0", pants: "#4a5577", shoe: "#ffffff", kind: "hood" },
  { name: "분홍 원피스", top: "#ff9ec0", dark: "#e7709c", pants: null, shoe: "#ff7aa2", kind: "dress" },
  { name: "초록 체육복", top: "#5fd3a0", dark: "#2fa775", pants: "#2f8f66", shoe: "#ffffff", kind: "sport" },
  { name: "노랑 멜빵바지", top: "#ffffff", dark: "#e6c24d", pants: "#ffd166", shoe: "#8a5a31", kind: "overall" },
  { name: "남색 정장", top: "#3d4a7a", dark: "#28335c", pants: "#28335c", shoe: "#3b2a20", kind: "suit" },
  { name: "보라 마법사 망토", top: "#a07cff", dark: "#7a55d8", pants: "#4b3d80", shoe: "#4b3d80", kind: "cape" }
];
export const BODY_NAMES = BODY.map((b) => b.name);
export const OPTION_LABELS = {
  face: ["동글", "갸름", "네모", "말랑"],
  skin: ["1", "2", "3", "4", "5", "6"],
  eyes: ["초롱", "반짝", "웃음", "윙크", "졸림", "별"],
  mouth: ["미소", "활짝", "고양이", "오!", "메롱", "씨익"],
  hair: ["짧은 머리", "단발", "긴 머리", "양갈래", "곱슬", "삐죽", "포니테일", "똥머리"],
  hairColor: ["흑갈색", "갈색", "밤색", "금발", "다홍", "보라", "파랑", "분홍"],
  body: BODY_NAMES
};

// 날개 단계: 총 점수(새 이벤트를 해도 남는 점수)가 기준 점수를 넘을 때마다 한 단계씩 자람
export const WING_LEVELS = [
  { min: 0, name: "새싹 날개" }, { min: 20, name: "아기 날개" }, { min: 50, name: "솜털 날개" },
  { min: 90, name: "반짝 날개" }, { min: 140, name: "큰 날개" }, { min: 200, name: "무지개 날개" },
  { min: 280, name: "황금 날개" }, { min: 380, name: "전설의 날개" }
];
export function wingLevel(score) {
  let lv = 0;
  WING_LEVELS.forEach((w, i) => { if ((score || 0) >= w.min) lv = i; });
  return lv;
}
export function wingInfo(score) {
  const lv = wingLevel(score), next = WING_LEVELS[lv + 1];
  return { lv, name: WING_LEVELS[lv].name, next: next ? next.min - (score || 0) : 0, nextName: next ? next.name : null };
}

export function randomAvatar() {
  const a = {};
  PART_ORDER.forEach((k) => (a[k] = Math.floor(Math.random() * PARTS[k].n)));
  return a;
}
export function cleanAvatar(a) {
  const out = {};
  PART_ORDER.forEach((k) => { const v = Number(a && a[k]); out[k] = Number.isInteger(v) && v >= 0 && v < PARTS[k].n ? v : 0; });
  return out;
}

let seq = 0;
// SVG 문자열 (viewBox 0 0 120 150)
export function avatarSVG(av, score = 0, opts = {}) {
  const a = cleanAvatar(av), lv = opts.wing !== undefined ? opts.wing : wingLevel(score);
  const id = "av" + (++seq);
  const skin = SKIN[a.skin], skinD = shade(skin, -18), hair = HAIR[a.hairColor], hairD = shade(hair, -22), B = BODY[a.body];
  const p = [];
  p.push(`<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" class="${opts.cls || "avatar"}" overflow="visible" role="img" aria-label="천사 캐릭터">`);
  const WC = lv >= 6 ? ["#fff8d6", "#ffd166", "#f0a92e"] : lv === 5 ? ["#ffd1e1", "#cfe4ff", "#c8f3dc"] : lv >= 3 ? ["#ffffff", "#e6f0ff", "#c9dcff"] : ["#ffffff", "#f2f6ff", "#d6e6ff"];
  p.push(`<defs><linearGradient id="${id}w" x1="0" y1="0" x2="1" y2="1">${WC.map((c, i) => `<stop offset="${i / 2}" stop-color="${c}"/>`).join("")}</linearGradient>`
    + `<radialGradient id="${id}g"><stop offset="0" stop-color="#ffe680" stop-opacity=".7"/><stop offset="1" stop-color="#ffe680" stop-opacity="0"/></radialGradient></defs>`);
  p.push(`<ellipse cx="60" cy="146" rx="30" ry="3.5" fill="#000" opacity=".08"/>`);
  p.push(wings(lv, id));
  // 뒷머리
  p.push(hairBack(a.hair, hair, hairD));
  // 몸
  p.push(body(B, skin, skinD));
  // 머리(얼굴)
  p.push(face(a.face, skin, skinD));
  p.push(`<circle cx="44" cy="62" r="4.5" fill="#ff9ab5" opacity=".55"/><circle cx="76" cy="62" r="4.5" fill="#ff9ab5" opacity=".55"/>`);
  p.push(eyes(a.eyes));
  p.push(mouth(a.mouth));
  p.push(hairFront(a.hair, hair, hairD));
  // 후광
  p.push(`<ellipse cx="60" cy="10" rx="17" ry="4.6" fill="none" stroke="#ffd166" stroke-width="3.4"/>`);
  // 반짝이: 단계가 높을수록 많이
  const SP = [[16, 30, 1], [104, 22, .8], [10, 74, .7], [110, 70, .9], [22, 112, .6], [100, 108, .7]];
  const nSp = lv >= 7 ? 6 : lv >= 6 ? 4 : lv >= 3 ? 2 : 0;
  if (nSp) p.push(`<g fill="${lv >= 6 ? "#ffcc33" : "#a9c6ff"}">` + SP.slice(0, nSp).map(([x, y, k]) => `<path transform="translate(${x} ${y}) scale(${k})" d="M0 -5l1.6 3.4 3.4 1.6-3.4 1.6L0 5l-1.6-3.4-3.4-1.6 3.4-1.6z"/>`).join("") + `</g>`);
  p.push(`</svg>`);
  return p.join("");
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return "#" + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function wings(lv, id) {
  if (lv === 0) return `<g fill="url(#${id}w)" stroke="#c9dafc" stroke-width="1.5"><ellipse cx="43" cy="96" rx="5" ry="7" transform="rotate(-25 43 96)"/><ellipse cx="77" cy="96" rx="5" ry="7" transform="rotate(25 77 96)"/></g>`;
  const s = [0, 0.5, 0.62, 0.74, 0.86, 0.96, 1.06, 1.14][lv];
  const edge = lv >= 6 ? "#e9a92e" : lv === 5 ? "#c7b5ff" : "#c9dafc";
  const feather = lv >= 6 ? "#f0c35a" : lv === 5 ? "#ffffff" : "#d6e2fb";
  const one = `<path d="M0 0 C-14 -22 -40 -26 -46 -12 C-50 -2 -40 4 -28 4 C-40 8 -44 18 -34 22 C-24 26 -12 16 -4 8 Z" fill="url(#${id}w)" stroke="${edge}" stroke-width="2"/>`
    + (lv >= 2 ? `<path d="M-10 -4 C-20 -12 -30 -14 -36 -10" stroke="${feather}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` : "")
    + (lv >= 3 ? `<path d="M-12 4 C-22 4 -30 8 -32 12" stroke="${feather}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` : "")
    + (lv >= 4 ? `<path d="M-8 -12 C-16 -20 -26 -22 -32 -20 M-14 12 C-20 14 -24 18 -26 20" stroke="${feather}" stroke-width="1.4" fill="none" stroke-linecap="round"/>` : "");
  const glow = lv >= 7 ? `<ellipse cx="60" cy="88" rx="62" ry="40" fill="url(#${id}g)"/>` : "";
  return glow + `<g transform="translate(46 92) scale(${s})">${one}</g><g transform="translate(74 92) scale(${-s} ${s})">${one}</g>`;
}
function face(k, skin, skinD) {
  const st = `fill="${skin}" stroke="${skinD}" stroke-width="1.6"`;
  const ears = `<ellipse cx="31" cy="52" rx="4.5" ry="6" ${st}/><ellipse cx="89" cy="52" rx="4.5" ry="6" ${st}/>`;
  if (k === 1) return ears + `<ellipse cx="60" cy="50" rx="27" ry="31" ${st}/>`;
  if (k === 2) return ears + `<rect x="32" y="22" width="56" height="56" rx="20" ${st}/>`;
  if (k === 3) return ears + `<path d="M60 80 C38 80 32 64 32 50 C32 32 44 22 60 22 C76 22 88 32 88 50 C88 64 82 80 60 80 Z" ${st}/>`;
  return ears + `<circle cx="60" cy="51" r="29" ${st}/>`;
}
function eyes(k) {
  const ink = "#3b3f58";
  if (k === 1) return `<g><circle cx="49" cy="52" r="6" fill="${ink}"/><circle cx="71" cy="52" r="6" fill="${ink}"/><circle cx="51" cy="50" r="2.2" fill="#fff"/><circle cx="73" cy="50" r="2.2" fill="#fff"/><circle cx="47.5" cy="54.5" r="1" fill="#fff"/><circle cx="69.5" cy="54.5" r="1" fill="#fff"/></g>`;
  if (k === 2) return `<g fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"><path d="M44 53 q5 -6 10 0"/><path d="M66 53 q5 -6 10 0"/></g>`;
  if (k === 3) return `<g><circle cx="49" cy="52" r="4" fill="${ink}"/><circle cx="50.3" cy="50.6" r="1.4" fill="#fff"/><path d="M66 52 l10 -3 M66 52 l10 3" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/></g>`;
  if (k === 4) return `<g stroke="${ink}" stroke-width="2.6" stroke-linecap="round"><path d="M44 53 h10"/><path d="M66 53 h10"/></g>`;
  if (k === 5) return `<g fill="#ffd166" stroke="#e9b23c" stroke-width="1"><path d="M49 46l1.8 4 4.4.5-3.3 3 1 4.3-3.9-2.3-3.9 2.3 1-4.3-3.3-3 4.4-.5z"/><path d="M71 46l1.8 4 4.4.5-3.3 3 1 4.3-3.9-2.3-3.9 2.3 1-4.3-3.3-3 4.4-.5z"/></g>`;
  return `<g><circle cx="49" cy="52" r="4" fill="${ink}"/><circle cx="71" cy="52" r="4" fill="${ink}"/><circle cx="50.3" cy="50.6" r="1.4" fill="#fff"/><circle cx="72.3" cy="50.6" r="1.4" fill="#fff"/></g>`;
}
function mouth(k) {
  const ink = "#3b3f58";
  if (k === 1) return `<path d="M52 63 q8 10 16 0 z" fill="#ff7a8a" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/>`;
  if (k === 2) return `<path d="M53 63 q3.5 3 7 0 q3.5 3 7 0" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>`;
  if (k === 3) return `<ellipse cx="60" cy="65" rx="3.4" ry="4" fill="#ff7a8a" stroke="${ink}" stroke-width="1.8"/>`;
  if (k === 4) return `<g><path d="M54 63 q6 5 12 0" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/><path d="M60 65 q4 0 4 4 q-4 2 -4 -4" fill="#ff7a8a"/></g>`;
  if (k === 5) return `<path d="M52 62 q8 7 16 0" fill="#fff" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>`;
  return `<path d="M54 63 q6 5 12 0" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
}
function hairBack(k, c, d) {
  const st = `fill="${c}" stroke="${d}" stroke-width="1.5"`;
  if (k === 2) return `<path d="M30 48 C30 22 90 22 90 48 L92 96 C80 102 40 102 28 96 Z" ${st}/>`;
  if (k === 3) return `<g ${st}><ellipse cx="22" cy="66" rx="9" ry="19"/><ellipse cx="98" cy="66" rx="9" ry="19"/></g>`;
  if (k === 6) return `<path d="M84 40 C104 44 102 82 92 92 C96 72 92 56 82 50 Z" ${st}/>`;
  if (k === 7) return `<circle cx="60" cy="13" r="11" ${st}/>`;
  if (k === 1) return `<path d="M30 48 C30 22 90 22 90 48 L90 74 C78 78 42 78 30 74 Z" ${st}/>`;
  return "";
}
function hairFront(k, c, d) {
  const st = `fill="${c}" stroke="${d}" stroke-width="1.5" stroke-linejoin="round"`;
  // 머리 윗부분(모자처럼 덮는 모양) + 앞머리 끝선
  const cap = (edge, side = 58) => `<path d="M29 ${side} C24 14 96 14 91 ${side} ${edge} Z" ${st}/>`;
  const shine = `<path d="M44 27 q8 -5 16 -4" stroke="#fff" stroke-width="2.4" fill="none" opacity=".35" stroke-linecap="round"/>`;
  if (k === 0) return cap("C88 44 82 40 74 40 C66 43 56 41 50 38 C42 41 34 44 29 56", 54) + shine;
  if (k === 1) return cap("C86 46 80 36 70 36 C60 44 46 44 40 40 C34 44 31 50 29 60", 62) + shine;
  if (k === 2) return cap("C87 46 74 34 62 34 C58 40 50 40 46 38 C38 42 32 48 29 62", 64) + shine;
  if (k === 3) return `<g>${cap("C86 44 78 40 70 41 C64 43 56 43 50 41 C42 40 34 44 29 56", 56)}<circle cx="27" cy="52" r="3.4" fill="#ff7aa2"/><circle cx="93" cy="52" r="3.4" fill="#ff7aa2"/></g>` + shine;
  if (k === 4) return `<g ${st}><circle cx="33" cy="48" r="8"/><circle cx="87" cy="48" r="8"/><circle cx="36" cy="34" r="10"/><circle cx="84" cy="34" r="10"/><circle cx="48" cy="25" r="11"/><circle cx="72" cy="25" r="11"/><circle cx="60" cy="22" r="11"/><circle cx="47" cy="39" r="7"/><circle cx="60" cy="38" r="7"/><circle cx="73" cy="39" r="7"/></g>`;
  if (k === 5) return `<path d="M29 56 C26 36 30 30 34 28 L33 14 L44 24 L48 8 L56 21 L62 6 L68 21 L76 9 L79 24 L88 15 L87 30 C92 34 94 42 91 56 C88 46 82 41 74 41 C66 44 54 44 46 41 C38 42 32 47 29 56 Z" ${st}/>`;
  if (k === 6) return `<g>${cap("C88 44 80 39 70 39 C62 41 52 41 46 38 C38 40 32 46 29 56", 56)}<circle cx="88" cy="40" r="3.4" fill="#ffd166"/></g>` + shine;
  if (k === 7) return `<g>${cap("C88 44 80 40 70 40 C62 42 54 42 48 40 C40 41 33 46 29 56", 56)}<path d="M54 14 q6 -4 12 0" stroke="${d}" stroke-width="1.5" fill="none"/></g>` + shine;
  return "";
}
function body(B, skin, skinD) {
  const p = [];
  const arm = (x, flip) => `<path d="M${x} 86 q${flip ? 10 : -10} 10 ${flip ? 12 : -12} 22" stroke="${B.kind === "suit" || B.kind === "cape" ? B.top : B.kind === "overall" ? "#ffffff" : B.top}" stroke-width="9" stroke-linecap="round" fill="none"/><circle cx="${x + (flip ? 12 : -12)}" cy="109" r="5.2" fill="${skin}" stroke="${skinD}" stroke-width="1.4"/>`;
  // 다리 + 신발
  const legC = B.pants || skin;
  p.push(`<rect x="48" y="112" width="9" height="24" rx="4.5" fill="${legC}"/><rect x="63" y="112" width="9" height="24" rx="4.5" fill="${legC}"/>`);
  p.push(`<ellipse cx="51.5" cy="138" rx="7.5" ry="4.2" fill="${B.shoe}" stroke="#c9cfe0" stroke-width="1.2"/><ellipse cx="68.5" cy="138" rx="7.5" ry="4.2" fill="${B.shoe}" stroke="#c9cfe0" stroke-width="1.2"/>`);
  if (B.kind === "cape") p.push(`<path d="M42 82 L30 128 C48 134 72 134 90 128 L78 82 Z" fill="${B.dark}"/>`);
  p.push(arm(42, false), arm(78, true));
  // 몸통
  if (B.kind === "dress") p.push(`<path d="M46 80 L74 80 L84 120 C70 126 50 126 36 120 Z" fill="${B.top}" stroke="${B.dark}" stroke-width="1.6"/><path d="M40 112 C52 118 68 118 80 112" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/>`);
  else p.push(`<rect x="42" y="78" width="36" height="38" rx="13" fill="${B.top}" stroke="${B.dark}" stroke-width="1.6"/>`);
  if (B.kind === "hood") p.push(`<path d="M48 80 q12 10 24 0" stroke="${B.dark}" stroke-width="3" fill="none"/><rect x="52" y="98" width="16" height="9" rx="4" fill="${B.dark}" opacity=".5"/>`);
  if (B.kind === "sport") p.push(`<path d="M46 82 L46 114 M74 82 L74 114" stroke="#fff" stroke-width="3"/><path d="M56 80 L60 90 L64 80" stroke="#fff" stroke-width="2.2" fill="none"/>`);
  if (B.kind === "overall") p.push(`<rect x="45" y="94" width="30" height="22" rx="7" fill="${B.pants}" stroke="${B.dark}" stroke-width="1.5"/><path d="M48 80 L50 96 M72 80 L70 96" stroke="${B.dark}" stroke-width="3.2"/><circle cx="50" cy="96" r="1.8" fill="#8a5a31"/><circle cx="70" cy="96" r="1.8" fill="#8a5a31"/>`);
  if (B.kind === "suit") p.push(`<path d="M52 79 L60 92 L68 79 Z" fill="#fff"/><path d="M58 84 L60 98 L62 84 Z" fill="#ff7aa2"/><path d="M52 79 L58 96 M68 79 L62 96" stroke="${B.dark}" stroke-width="2"/>`);
  if (B.kind === "cape") p.push(`<circle cx="60" cy="82" r="3" fill="#ffd166"/><path d="M48 96 L60 100 L72 96" stroke="#ffd166" stroke-width="2" fill="none"/>`);
  return p.join("");
}
