// Reinos elementales con criaturas, dibujados alrededor y sobre cada persona.
//
// Hay dos espacios de coordenadas:
//  · Suelo (u, v, h): disco unidad del círculo del piso. u = izq/der, v = fondo/frente, h = altura.
//  · Cuerpo: píxeles de pantalla, usando los puntos de pose de la persona (hombros, codos, muñecas…).
//
// Cada objeto tiene una profundidad (v en el suelo, z alrededor del cuerpo): si es >= 0 está DELANTE
// de la persona y se dibuja encima; si es < 0 está DETRÁS y la persona lo tapa.
// Los sprites se dibujan en unidades locales mirando a la derecha.

import { buildTown, updateTown, drawTownGround, townItems, drawTownObj, drawBodyTown } from "./town.js";

export const ELEMENTS = {
  agua:   { name: "Reino del Agua",     emoji: "💧", color: "#4fd1ff", light: "rgba(40,150,255,0.6)" },
  fuego:  { name: "Reino del Fuego",    emoji: "🔥", color: "#ff7a1a", light: "rgba(255,110,20,0.7)" },
  tierra: { name: "Reino de la Tierra", emoji: "🌿", color: "#9bd35a", light: "rgba(130,190,80,0.45)" },
  aire:   { name: "Reino del Aire",     emoji: "🌪️", color: "#e6f6ff", light: "rgba(200,230,255,0.5)" },
};
const KEYS = Object.keys(ELEMENTS);

export function randomElement(exclude = []) {
  const pool = KEYS.filter((k) => !exclude.includes(k));
  const list = pool.length ? pool : KEYS;
  return list[Math.floor(Math.random() * list.length)];
}

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
function inRing(rMin, rMax) {
  const a = rand(0, TAU), r = Math.sqrt(rand(rMin * rMin, rMax * rMax));
  return { u: Math.cos(a) * r, v: Math.sin(a) * r };
}

// Recorridos por el cuerpo (índices de MediaPipe Pose)
// 11/12 hombros · 13/14 codos · 15/16 muñecas · 23/24 caderas · 25/26 rodillas · 27/28 tobillos
const PATHS = [
  [27, 25, 23, 11, 13, 15], // pie izq → mano izq
  [28, 26, 24, 12, 14, 16], // pie der → mano der
  [15, 13, 11, 12, 14, 16], // mano izq → hombros → mano der
];

// ===========================================================================
// Formas de roca precalculadas
// ===========================================================================
function rockShape(n = 10, rough = 0.3) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rand(-0.15, 0.15), r = 1 - rand(0, rough);
    pts.push([Math.cos(a) * r * 0.5, Math.min(0, -0.42 + Math.sin(a) * r * 0.45)]);
  }
  return pts;
}
function blob(rx, ry, n = 9, rough = 0.25, pivotTop = false) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, r = 1 - rand(0, rough);
    pts.push([Math.cos(a) * rx * r, Math.sin(a) * ry * r + (pivotTop ? ry : 0)]);
  }
  return pts;
}
function makeCracks(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let a = (i / n) * TAU + rand(-0.3, 0.3), r = rand(0.05, 0.2);
    const pts = [];
    while (r < 1.0) { pts.push({ u: Math.cos(a) * r, v: Math.sin(a) * r }); r += rand(0.06, 0.13); a += rand(-0.3, 0.3); }
    out.push(pts);
  }
  return out;
}

const ROCK = {
  obsidiana: { light: "#3b3448", dark: "#0a090e", edge: "rgba(255,120,40,0.35)" },
  mojada:    { light: "#6f8389", dark: "#1c262a", wet: true },
  musgo:     { light: "#80776a", dark: "#2b2722", moss: "rgba(84,128,48,0.9)" },
  clara:     { light: "#cfcac2", dark: "#605b54" },
};

// ===========================================================================
// Creación
// ===========================================================================
const runner  = (type, size, r, sp, x = {}) => ({ type, size, ai: "run", a: rand(0, TAU), r, sp, ph: rand(0, TAU), step: rand(0, TAU), h0: 0, flip: 1, ...x });
const walker  = (type, size, speed, x = {}) => ({ type, size, ai: "walk", ...inRing(0.5, 0.9), head: rand(0, TAU), speed, turnT: rand(0, 2), pause: 0, step: rand(0, TAU), flip: 1, ...x });
const orbiter = (type, size, rk, hk, sp, x = {}) => ({ type, size, ai: "orbit", a: rand(0, TAU), rk, hk, sp, ph: rand(0, TAU), step: rand(0, TAU), flip: 1, ...x });
const climber = (type, size, speed, x = {}) => {
  const p = pick(PATHS);
  return { type, size, ai: "climb", path: Math.random() < 0.5 ? p : [...p].reverse(), pos: rand(0, p.length - 1.01), speed, pause: 0, side: rand(-1, 1), step: rand(0, TAU), ...x };
};

function addProps(w, n, rMin, rMax, make, vMax = 1) {
  for (let i = 0; i < n; i++) {
    let p, tries = 0;
    do p = inRing(rMin, rMax); while (p.v > vMax && tries++ < 60);
    w.props.push({ ...p, ...make() });
  }
}
function addSpots(w, n, colors) {
  for (let i = 0; i < n; i++) w.spots.push({ ...inRing(0, 0.95), r: rand(0.01, 0.045), c: pick(colors), rot: rand(0, TAU) });
}

const BUILD = {
  fuego(w) {
    w.cracks = makeCracks(10);
    w.pools = [0, 1, 2].map(() => ({ ...inRing(0.35, 0.8), r: rand(0.07, 0.13), ph: rand(0, TAU) }));
    addSpots(w, 80, ["rgba(0,0,0,0.35)", "rgba(95,65,52,0.3)", "rgba(255,120,40,0.07)"]);
    addProps(w, 6, 0.62, 1.0, () => ({ kind: "shard", size: rand(0.12, 0.22), pts: [[-0.2, 0], [rand(-0.15, -0.05), -1], [rand(0, 0.1), rand(-0.85, -0.6)], [0.22, 0]] }), 0.3);
    addProps(w, 6, 0.5, 1.0, () => ({ kind: "rock", pal: ROCK.obsidiana, size: rand(0.07, 0.13), pts: rockShape() }));
    w.creatures.push(runner("hound", 0.24, 0.88, 0.9), runner("hound", 0.21, 0.74, -1.1));
    w.creatures.push(climber("salamander", 0.34, 1.1), climber("salamander", 0.28, 0.9));
    w.creatures.push(orbiter("phoenix", 0.9, 2.3, -0.3, 0.5 * pick([1, -1])));
    for (let i = 0; i < 3; i++) w.creatures.push(orbiter("wisp", 0.16, rand(1.1, 1.7), rand(0.15, 0.8), rand(0.8, 1.4) * pick([1, -1])));
  },

  agua(w) {
    addProps(w, 5, 0.75, 1.0, () => ({ kind: "reeds", size: rand(0.18, 0.28), blades: reedBlades() }), 0.25);
    addProps(w, 6, 0.55, 1.0, () => ({ kind: "rock", pal: ROCK.mojada, size: rand(0.07, 0.13), pts: rockShape() }));
    w.creatures.push({ type: "serpent", ai: "helix", size: 0.11, ph: rand(0, TAU), segs: null });
    for (let i = 0; i < 3; i++) w.creatures.push({ type: "jelly", ai: "float", size: rand(0.35, 0.5), a: rand(0, TAU), rk: rand(1.2, 1.9), hk: rand(-0.2, 1), rise: rand(0.04, 0.07), sp: rand(0.2, 0.4) * pick([1, -1]), step: rand(0, TAU), hue: rand(170, 300), flip: 1 });
    for (let i = 0; i < 3; i++) w.creatures.push(orbiter("koi", 0.5, rand(1.4, 2.0), rand(0.25, 0.75), rand(0.5, 0.8) * pick([1, -1]), { patches: koiPatches() }));
    for (let i = 0; i < 3; i++) w.creatures.push(walker("crab", 0.11, 0.2, { stepRate: 16 }));
    w.creatures.push(climber("newt", 0.3, 0.9));
  },

  tierra(w) {
    addSpots(w, 90, ["rgba(28,20,12,0.4)", "rgba(125,105,75,0.35)", "rgba(70,110,40,0.4)", "rgba(160,150,130,0.55)"]);
    w.leaves = Array.from({ length: 30 }, () => ({ ...inRing(0.1, 0.95), rot: rand(0, TAU), c: pick(["#8a5a2b", "#a0702a", "#6b4a1f", "#7a8a2a"]) }));
    addProps(w, 16, 0.35, 1.0, () => ({ kind: "grass", size: rand(0.08, 0.13), blades: grassBlades() }));
    addProps(w, 6, 0.55, 1.0, () => ({ kind: "rock", pal: ROCK.musgo, size: rand(0.08, 0.15), pts: rockShape() }), 0.4);
    addProps(w, 7, 0.5, 0.98, () => ({ kind: "mushroom", size: rand(0.05, 0.08), hue: pick([175, 190, 140]) }));
    w.creatures.push(walker("golem", 0.34, 0.05, { stepRate: 4, rocks: golemRocks() }));
    w.creatures.push(runner("wolf", 0.22, 0.86, 0.8), runner("wolf", 0.2, 0.72, -0.95));
    for (let i = 0; i < 3; i++) w.creatures.push(climber("beetle", 0.2, 0.7));
    for (let i = 0; i < 4; i++) w.creatures.push(orbiter("bat", 0.32, rand(1.3, 2.2), rand(-0.05, 0.4), rand(1.1, 1.7) * pick([1, -1]), { stepRate: 16 }));
  },

  aire(w) {
    w.fog = Array.from({ length: 9 }, () => ({ ...inRing(0, 0.8), r: rand(0.35, 0.6), sp: rand(0.2, 0.5), ph: rand(0, TAU) }));
    addProps(w, 3, 0.6, 1.0, () => ({ kind: "rock", pal: ROCK.clara, size: rand(0.06, 0.1), pts: rockShape() }), 0.3);
    w.creatures.push(orbiter("hawk", 1.0, 2.7, -0.35, 0.32 * pick([1, -1]), { stepRate: 3 }));
    for (let i = 0; i < 3; i++) w.creatures.push(orbiter("sylph", 0.09, rand(1.1, 1.6), rand(0.15, 0.8), rand(1.4, 2.1) * pick([1, -1])));
    for (let i = 0; i < 3; i++) w.creatures.push({ type: "dragonfly", ai: "dart", size: 0.35, dx: rand(-2, 2), hk: rand(0.1, 0.8), zc: rand(-1, 1), tx: 0, thk: 0.5, tz: 0, hover: 0, step: 0, stepRate: 30, flip: 1 });
    for (let i = 0; i < 2; i++) w.creatures.push(climber("spark", 0.22, 2.4));
    for (let i = 0; i < 2; i++) w.creatures.push(runner("dustdevil", 0.28, rand(0.7, 0.9), rand(0.5, 0.7) * pick([1, -1])));
    for (let i = 0; i < 4; i++) w.creatures.push(runner("floatrock", rand(0.08, 0.13), rand(0.88, 1.05), rand(0.1, 0.18), { h0: rand(0.15, 0.4), pts: floatRockShape() }));
  },
};

function reedBlades() {
  return Array.from({ length: 6 }, () => ({ x: rand(-0.25, 0.25), h: rand(0.6, 1), b: rand(-0.2, 0.2), cat: Math.random() < 0.5 }));
}
function grassBlades() {
  return Array.from({ length: 11 }, () => ({ x: rand(-0.35, 0.35), h: rand(0.4, 1), b: rand(-0.3, 0.3), c: `hsl(${rand(75, 105)},${rand(30, 50)}%,${rand(22, 38)}%)` }));
}
function koiPatches() {
  return Array.from({ length: 3 }, () => ({ x: rand(-0.3, 0.3), y: rand(-0.1, 0.05), rx: rand(0.08, 0.16), ry: rand(0.05, 0.1), c: pick(["#ff5a1f", "#e63900", "#1a1a1a"]) }));
}
function golemRocks() {
  return { torso: blob(0.3, 0.27, 11), head: blob(0.13, 0.11, 8), arm: blob(0.1, 0.27, 8, 0.2, true), leg: blob(0.11, 0.2, 8, 0.2, true) };
}
function floatRockShape() {
  return [[-0.5, -0.08], [0.5, -0.08], [0.38, 0.12], [rand(0.15, 0.25), 0.4], [0.05, rand(0.55, 0.75)], [-0.1, 0.38], [-0.3, 0.25]];
}

export function createWorld(element) {
  const w = { element, time: 0, creatures: [], props: [], parts: [], spots: [], ripples: [], cracks: [], pools: [], anchor: null };
  BUILD[element](w);
  w.props.sort((a, b) => a.v - b.v);
  buildTown(w);
  return w;
}

// ===========================================================================
// Animación
// ===========================================================================
// Ancla del cuerpo: centro del torso, alto de cabeza a pies y ancho de hombros (escala)
function anchorOf(g, body) {
  if (body) {
    const p = (i) => body[i];
    const S = Math.max(Math.hypot(p(11).x - p(12).x, p(11).y - p(12).y), g.rx * 0.35);
    const cx = (p(11).x + p(12).x + p(23).x + p(24).x) / 4;
    const cy = (p(11).y + p(12).y + p(23).y + p(24).y) / 4;
    const top = Math.min(p(0).y, (p(11).y + p(12).y) / 2 - S * 0.5);
    return { cx, cy, top, bottom: g.y, S, pts: body };
  }
  const S = g.rx * 0.5;
  return { cx: g.x, cy: g.y - S * 2.6, top: g.y - S * 4.2, bottom: g.y, S, pts: null };
}

function spawn(holder, key, rate, dt, fn) {
  holder.acc ??= {};
  holder.acc[key] = (holder.acc[key] || 0) + rate * dt;
  while (holder.acc[key] >= 1) { holder.acc[key]--; fn(); }
}
function emit(w, p) { if (w.parts.length < 450) w.parts.push({ life: 0, vx: 0, vy: 0, grav: 0, ...p }); }

const AI = {
  run(o, w, dt, g, A, P) {
    o.a += o.sp * dt;
    const r = o.r + 0.06 * Math.sin(w.time * 0.7 + o.ph);
    o.u = Math.cos(o.a) * r;
    o.v = Math.sin(o.a) * r;
    const h = o.h0 ? o.h0 + 0.03 * Math.sin(w.time * 1.2 + o.ph) : 0;
    [o.x, o.y] = P(o.u, o.v, h);
    o.s = o.size * g.rx * (1 + 0.12 * o.v);
    o.z = o.v;
    o.flip = -Math.sin(o.a) * Math.sign(o.sp) >= 0 ? 1 : -1;
    o.moving = true;
    o.step += dt * (o.stepRate || 12);
  },

  walk(o, w, dt, g, A, P) {
    if (o.pause > 0) { o.pause -= dt; o.moving = false; }
    else {
      o.moving = true;
      o.turnT -= dt;
      if (o.turnT <= 0) { o.head += rand(-1.2, 1.2); o.turnT = rand(1, 3); if (Math.random() < 0.3) o.pause = rand(0.8, 2.5); }
      const r = Math.hypot(o.u, o.v);
      if (r > 0.92) o.head = Math.atan2(-o.v, -o.u) + rand(-0.4, 0.4);
      else if (r < 0.45) o.head = Math.atan2(o.v, o.u) + rand(-0.4, 0.4);
      o.u += Math.cos(o.head) * o.speed * dt;
      o.v += Math.sin(o.head) * o.speed * dt;
      o.flip = Math.cos(o.head) >= 0 ? 1 : -1;
      o.step += dt * (o.stepRate || 8);
    }
    [o.x, o.y] = P(o.u, o.v);
    o.s = o.size * g.rx * (1 + 0.12 * o.v);
    o.z = o.v;
  },

  orbit(o, w, dt, g, A) {
    o.a += o.sp * dt;
    const R = A.S * o.rk * (1 + 0.2 * Math.sin(w.time * 0.6 + o.ph));
    const hk = o.hk + 0.12 * Math.sin(w.time * 0.5 + o.ph * 2);
    o.x = A.cx + Math.cos(o.a) * R;
    o.y = lerp(A.top, A.bottom, hk) + Math.sin(o.a) * R * 0.22;
    if (o.type === "bat") { o.y += Math.sin(w.time * 4 + o.ph) * A.S * 0.18; o.x += Math.sin(w.time * 3.3 + o.ph) * A.S * 0.12; }
    o.z = Math.sin(o.a);
    o.s = o.size * A.S * (1 + 0.22 * o.z);
    o.flip = -Math.sin(o.a) * Math.sign(o.sp) >= 0 ? 1 : -1;
    o.step += dt * (o.stepRate || 8);
  },

  climb(o, w, dt, g, A) {
    if (!A.pts) { o.hidden = true; return; }
    o.hidden = false;
    const last = o.path.length - 1;
    if (o.pause > 0) { o.pause -= dt; o.moving = false; }
    else {
      o.moving = true;
      const i = Math.min(Math.floor(o.pos), last - 1);
      const a = A.pts[o.path[i]], b = A.pts[o.path[i + 1]];
      o.pos += (o.speed * A.S * dt) / Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1);
      o.step += dt * 14;
      if (Math.random() < 0.15 * dt) o.pause = rand(0.4, 1.5);
      if (o.pos >= last) {
        // Al llegar a un extremo, seguir por otro recorrido que empiece en ese punto
        const e = o.path[last];
        const next = PATHS.flatMap((p) => (p[0] === e ? [p] : p[p.length - 1] === e ? [[...p].reverse()] : []));
        o.path = pick(next);
        o.pos = 0;
      }
    }
    const i = Math.min(Math.floor(o.pos), o.path.length - 2), f = o.pos - i;
    const a = A.pts[o.path[i]], b = A.pts[o.path[i + 1]];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    o.x = lerp(a.x, b.x, f) - Math.sin(ang) * o.side * A.S * 0.08;
    o.y = lerp(a.y, b.y, f) + Math.cos(ang) * o.side * A.S * 0.08;
    o.rot = ang;
    o.z = 1;
    o.flip = 1;
    o.s = o.size * A.S;
  },

  // Serpiente enroscada en espiral alrededor de la persona (cada segmento delante o detrás)
  helix(o, w, dt, g, A) {
    const N = 30, segs = [];
    for (let i = 0; i < N; i++) {
      const t = w.time - i * 0.07;
      const p = 0.5 + 0.42 * Math.sin(t * 0.22 + o.ph);
      const ang = p * 2.6 * TAU + t * 0.6;
      const R = A.S * (0.95 - 0.2 * p);
      const z = Math.sin(ang);
      segs.push({
        x: A.cx + Math.cos(ang) * R,
        y: lerp(A.bottom, A.top, p) + z * R * 0.2,
        z,
        r: A.S * o.size * (i === 0 ? 1.15 : 1 - (i / N) * 0.8) * (1 + 0.15 * z),
      });
    }
    o.segs = segs;
    o.x = segs[0].x; o.y = segs[0].y; o.z = segs[0].z;
  },

  float(o, w, dt, g, A) {
    o.hk -= o.rise * dt;
    if (o.hk < -0.25) { o.hk = 1.05; o.a = rand(0, TAU); }
    o.a += o.sp * dt;
    const R = A.S * o.rk;
    o.x = A.cx + Math.cos(o.a) * R + Math.sin(w.time * 0.8 + o.hue) * A.S * 0.1;
    o.y = lerp(A.top, A.bottom, o.hk) + Math.sin(o.a) * R * 0.2;
    o.z = Math.sin(o.a);
    o.s = o.size * A.S * (1 + 0.2 * o.z);
    o.alpha = Math.max(0, Math.min(1, (1.05 - o.hk) * 4, (o.hk + 0.25) * 4));
    o.step += dt * 3;
  },

  dart(o, w, dt, g, A) {
    const k = Math.min(1, dt * 2.2);
    if (Math.abs(o.tx - o.dx) < 0.05 && Math.abs(o.thk - o.hk) < 0.03) {
      o.hover -= dt;
      if (o.hover <= 0) { o.tx = rand(-2.2, 2.2); o.thk = rand(0.05, 0.85); o.tz = rand(-1, 1); o.hover = rand(0.3, 1.2); }
    }
    const vx = (o.tx - o.dx) * k;
    o.dx += vx; o.hk += (o.thk - o.hk) * k; o.zc += (o.tz - o.zc) * k;
    if (Math.abs(vx) > 0.002) o.flip = vx > 0 ? 1 : -1;
    o.x = A.cx + o.dx * A.S;
    o.y = lerp(A.top, A.bottom, o.hk) + Math.sin(w.time * 18 + o.tz * 9) * A.S * 0.012;
    o.z = o.zc;
    o.s = o.size * A.S * (1 + 0.2 * o.z);
    o.step += dt * o.stepRate;
  },
};

// Partículas que suelta cada criatura
const EMIT = {
  hound(o, w, dt) {
    spawn(o, "e", 28, dt, () => emit(w, { type: "ember", x: o.x - o.flip * o.s * rand(-0.2, 0.4), y: o.y - o.s * rand(0.5, 0.65), vx: -o.flip * o.s * rand(0.5, 1.5), vy: -o.s * rand(0.4, 1.2), size: o.s * 0.025, dur: rand(0.4, 0.9), z: o.z }));
  },
  salamander(o, w, dt) {
    if (!o.hidden) spawn(o, "e", 6, dt, () => emit(w, { type: "ember", x: o.x, y: o.y, vx: rand(-1, 1) * o.s * 0.3, vy: -o.s * rand(0.5, 1), size: o.s * 0.04, dur: rand(0.5, 1), z: 1 }));
  },
  phoenix(o, w, dt) {
    spawn(o, "f", 55, dt, () => emit(w, { type: "flame", x: o.x - o.flip * o.s * rand(0.1, 0.4), y: o.y + o.s * rand(-0.05, 0.08), vx: -o.flip * o.s * rand(0.5, 1.2), vy: o.s * rand(-0.3, 0.2), size: o.s * rand(0.08, 0.14), dur: rand(0.35, 0.6), z: o.z }));
  },
  wisp(o, w, dt) {
    spawn(o, "f", 14, dt, () => emit(w, { type: "flame", x: o.x + rand(-1, 1) * o.s * 0.15, y: o.y, vy: -o.s * rand(1, 2), size: o.s * rand(0.25, 0.4), dur: rand(0.3, 0.5), z: o.z }));
  },
  serpent(o, w, dt) {
    if (o.segs) spawn(o, "b", 5, dt, () => emit(w, { type: "bubble", x: o.x, y: o.y, vx: rand(-1, 1) * 8, vy: -rand(15, 35), size: rand(2, 5), dur: rand(1, 1.8), z: o.z }));
  },
  koi(o, w, dt) {
    spawn(o, "b", 1.5, dt, () => emit(w, { type: "bubble", x: o.x + o.flip * o.s * 0.4, y: o.y, vy: -rand(10, 25), size: rand(2, 4), dur: rand(1, 1.6), z: o.z }));
  },
  golem(o, w, dt) {
    if (o.moving) spawn(o, "d", 5, dt, () => emit(w, { type: "dust", x: o.x + rand(-1, 1) * o.s * 0.2, y: o.y, vx: rand(-1, 1) * o.s * 0.2, vy: -o.s * rand(0.05, 0.2), size: o.s * 0.06, dur: rand(0.8, 1.4), z: o.z }));
  },
  wolf(o, w, dt) {
    spawn(o, "d", 9, dt, () => emit(w, { type: "dust", x: o.x - o.flip * o.s * 0.3, y: o.y, vx: -o.flip * o.s * rand(0.2, 0.6), vy: -o.s * rand(0.05, 0.2), size: o.s * 0.05, dur: rand(0.5, 1), z: o.z }));
  },
  dustdevil(o, w, dt) {
    spawn(o, "d", 22, dt, () => emit(w, { type: "dust", x: o.x + rand(-1, 1) * o.s * 0.2, y: o.y, vx: rand(-1, 1) * o.s * 0.6, vy: -o.s * rand(0.8, 1.6), size: o.s * 0.05, dur: rand(0.6, 1.1), z: o.z }));
  },
  spark(o, w, dt) {
    if (!o.hidden) spawn(o, "s", 22, dt, () => emit(w, { type: "spark", x: o.x, y: o.y, vx: rand(-1, 1) * o.s * 2, vy: rand(-1, 1) * o.s * 2, size: o.s * 0.05, dur: rand(0.15, 0.35), z: 1 }));
  },
};

// Partículas del ambiente
const AMBIENT = {
  fuego(w, dt, g, A, P) {
    spawn(w, "e", 14, dt, () => {
      const p = inRing(0, 0.95), [x, y] = P(p.u, p.v);
      emit(w, { type: "ember", x, y, vx: rand(-1, 1) * g.rx * 0.05, vy: -g.rx * rand(0.25, 0.6), size: g.rx * 0.008, dur: rand(1, 2.2), z: p.v });
    });
    for (const pool of w.pools) spawn(pool, "s", 1.2, dt, () => {
      const [x, y] = P(pool.u, pool.v);
      emit(w, { type: "smoke", x, y, vx: g.rx * 0.03, vy: -g.rx * 0.12, size: g.rx * 0.04, dur: rand(2, 3), z: pool.v, c: 60 });
    });
  },
  agua(w, dt) {
    spawn(w, "r", 1.2, dt, () => w.ripples.push({ ...inRing(0.2, 0.85), r: 0, life: 1 }));
  },
  tierra(w, dt, g, A, P) {
    spawn(w, "s", 7, dt, () => {
      const m = w.props.filter((p) => p.kind === "mushroom");
      const p = m.length && Math.random() < 0.6 ? pick(m) : inRing(0, 0.95);
      const [x, y] = P(p.u, p.v, 0.05);
      emit(w, { type: "spore", x, y, vx: rand(-1, 1) * g.rx * 0.04, vy: -g.rx * rand(0.08, 0.2), size: g.rx * 0.006, dur: rand(2, 4), z: p.v });
    });
  },
  aire(w, dt, g, A, P) {
    spawn(w, "l", 3, dt, () => {
      const p = inRing(0.5, 1), [x, y] = P(p.u, p.v, rand(0, 0.5));
      emit(w, { type: "leaf", x, y, vx: g.rx * rand(0.4, 0.9) * pick([1, -1]), vy: -g.rx * rand(0.1, 0.4), size: g.rx * 0.02, dur: rand(1.5, 2.5), z: p.v, rot: rand(0, TAU) });
    });
  },
};

export function updateWorld(w, dt, g, body = null) {
  w.time += dt;
  const A = anchorOf(g, body);
  w.anchor = A;
  const P = (u, v, h = 0) => [g.x + u * g.rx, g.y + v * g.ry - h * g.rx];

  for (const o of w.creatures) {
    AI[o.ai](o, w, dt, g, A, P);
    EMIT[o.type]?.(o, w, dt);
  }
  AMBIENT[w.element](w, dt, g, A, P);
  updateTown(w, dt, g, A, P, emit, spawn);

  for (const p of w.parts) {
    p.life += dt / p.dur;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.grav * dt;
    if (p.type === "leaf") p.rot += dt * 6;
  }
  w.parts = w.parts.filter((p) => p.life < 1);
  for (const r of w.ripples) { r.r += 0.3 * dt; r.life -= 0.7 * dt; }
  w.ripples = w.ripples.filter((r) => r.life > 0);
}

// ===========================================================================
// Dibujo
// ===========================================================================
const SPECIAL = { serpent: drawSerpent, sylph: drawSylph };

export function drawWorld(ctx, w, g, layer, opts = {}) {
  const front = layer === "front";
  const P = (u, v, h = 0) => [g.x + u * g.rx, g.y + v * g.ry - h * g.rx];
  if (!w.anchor) w.anchor = anchorOf(g, null);

  ctx.save();
  ctx.globalAlpha = g.alpha ?? 1;

  if (!front) {
    if (opts.shadow) drawShadow(ctx, g);
    GROUND[w.element](ctx, w, g, P);
    drawTownGround(ctx, w, g, P);
  } else {
    // El reino creciendo por el cuerpo, casas en los hombros y orbe en la mano
    drawBodyTown(ctx, w);
  }

  // Criaturas con varias partes (cada parte decide si va delante o detrás)
  for (const o of w.creatures) if (SPECIAL[o.type]) SPECIAL[o.type](ctx, o, w, front);

  const items = [];
  for (const pr of w.props) if ((pr.v >= 0) === front) items.push({ d: pr.v, pr });
  for (const t of townItems(w)) if (t.x != null && (t.z >= 0) === front) items.push({ d: t.z, t });
  for (const o of w.creatures) if (!SPECIAL[o.type] && !o.hidden && o.x != null && (o.z >= 0) === front) items.push({ d: o.z, o });
  for (const p of w.parts) if ((p.z >= 0) === front) items.push({ d: p.z, p });
  items.sort((a, b) => a.d - b.d);
  for (const it of items) {
    if (it.pr) drawProp(ctx, it.pr, w, g, P);
    else if (it.t) drawTownObj(ctx, it.t, w);
    else if (it.o) drawCreature(ctx, it.o, w);
    else drawParticle(ctx, it.p);
  }

  if (front && opts.light) applyLight(ctx, w, g);
  ctx.restore();
}

function drawCreature(ctx, o, w) {
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(o.s * (o.flip || 1), o.s);
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  SPR[o.type](ctx, o, w);
  ctx.restore();
}

function drawProp(ctx, pr, w, g, P) {
  const [x, y] = P(pr.u, pr.v);
  const s = pr.size * g.rx * (1 + 0.12 * pr.v);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  PROPS[pr.kind](ctx, pr, w);
  ctx.restore();
}

// Luz del reino sobre la escena (incluida la persona)
function applyLight(ctx, w, g) {
  const el = ELEMENTS[w.element];
  const flick = w.element === "fuego" ? 0.8 + 0.2 * Math.sin(w.time * 13) * Math.sin(w.time * 7.3) : 0.9 + 0.1 * Math.sin(w.time * 1.5);
  const cx = g.x, cy = g.y - g.rx * 0.7, R = g.rx * 2.8;
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.globalAlpha = (g.alpha ?? 1) * flick;
  const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  gr.addColorStop(0, el.light);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gr;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  if (w.element === "fuego") {
    // Resplandor cálido desde el suelo
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.18 * flick * (g.alpha ?? 1);
    const g2 = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.rx * 1.4);
    g2.addColorStop(0, "rgba(255,120,30,1)");
    g2.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(g.x - g.rx * 1.4, g.y - g.rx * 1.4, g.rx * 2.8, g.rx * 2.8);
  }
  ctx.restore();
}

// ---------- Utilidades ----------
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); ctx.fill(); }
function ell(ctx, color, x, y, rx, ry, rot = 0) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); ctx.fill();
}
function poly(ctx, fill, pts) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath(); ctx.fill();
}
function line(ctx, color, width, pts) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.stroke();
}
function softDisc(ctx, { x, y, rx, ry }, stops, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  const R = rx * scale;
  const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  ctx.fillStyle = gr;
  circle(ctx, 0, 0, R);
  ctx.restore();
}
function clipDisc(ctx, { x, y, rx, ry }) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.clip(); }
function vgrad(ctx, y0, y1, c0, c1) { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
function drawShadow(ctx, { x, y, rx, ry }) {
  softDisc(ctx, { x, y: y + ry * 0.1, rx, ry }, [[0, "rgba(0,0,0,0.5)"], [0.7, "rgba(0,0,0,0.3)"], [1, "rgba(0,0,0,0)"]], 1.2);
}
function contactShadow(ctx, w = 0.45) { ell(ctx, "rgba(0,0,0,0.38)", 0, 0, w, w * 0.14); }

// ===========================================================================
// Suelos
// ===========================================================================
const GROUND = {
  fuego(ctx, w, g, P) {
    softDisc(ctx, g, [[0, "rgba(50,30,22,0.97)"], [0.7, "rgba(28,16,12,0.95)"], [1, "rgba(15,8,6,0)"]], 1.08);
    for (const s of w.spots) { const [x, y] = P(s.u, s.v); ell(ctx, s.c, x, y, s.r * g.rx, s.r * g.ry, 0); }
    // Pozos de lava
    for (const p of w.pools) {
      const [x, y] = P(p.u, p.v);
      const R = p.r * g.rx * (1 + 0.06 * Math.sin(w.time * 2 + p.ph));
      ctx.save();
      ctx.translate(x, y); ctx.scale(1, g.ry / g.rx);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, "#fff2a8"); gr.addColorStop(0.35, "#ffb020"); gr.addColorStop(0.75, "#d94100"); gr.addColorStop(1, "rgba(80,10,0,0)");
      ctx.fillStyle = gr;
      circle(ctx, 0, 0, R);
      ctx.restore();
    }
    // Grietas: halo ancho + núcleo brillante
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const pass of [0, 1]) {
      w.cracks.forEach((pts, i) => {
        const pulse = 0.6 + 0.4 * Math.sin(w.time * 2.5 + i * 1.3);
        ctx.strokeStyle = pass ? `rgba(255,${Math.round(190 + 50 * pulse)},110,${(0.85 * pulse).toFixed(3)})` : `rgba(255,80,0,${(0.3 * pulse).toFixed(3)})`;
        ctx.lineWidth = pass ? Math.max(1, g.rx * 0.007) : Math.max(3, g.rx * 0.035);
        ctx.beginPath();
        pts.forEach((p, k) => { const [px, py] = P(p.u, p.v); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
        ctx.stroke();
      });
    }
    ctx.restore();
  },

  agua(ctx, w, g, P) {
    softDisc(ctx, g, [[0, "rgba(45,125,155,0.9)"], [0.65, "rgba(12,55,85,0.9)"], [1, "rgba(5,25,45,0)"]], 1.08);
    ctx.save();
    clipDisc(ctx, g);
    // Cáusticas (luz refractada en el fondo)
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "rgba(150,230,255,0.10)";
    ctx.lineWidth = Math.max(1, g.rx * 0.006);
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const u = -1 + k / 12;
        const v = -0.95 + i * 0.125 + Math.sin(u * 7 + w.time * 1.4 + i * 1.7) * 0.035;
        const [px, py] = P(u, v);
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    // Reflejos especulares
    for (let i = 0; i < 4; i++) {
      const [x, y] = P(Math.sin(w.time * 0.3 + i * 2) * 0.5, -0.5 + i * 0.3);
      ell(ctx, "rgba(255,255,255,0.07)", x, y, g.rx * 0.25, g.ry * 0.05);
    }
    ctx.globalCompositeOperation = "source-over";
    for (const r of w.ripples) {
      const [cx, cy] = P(r.u, r.v);
      ctx.strokeStyle = `rgba(220,245,255,${(r.life * 0.5).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, g.rx * 0.006);
      ctx.beginPath(); ctx.ellipse(cx, cy, r.r * g.rx, r.r * g.ry, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  },

  tierra(ctx, w, g, P) {
    softDisc(ctx, g, [[0, "rgba(80,64,44,0.97)"], [0.6, "rgba(58,46,31,0.95)"], [1, "rgba(40,30,20,0)"]], 1.08);
    for (const s of w.spots) { const [x, y] = P(s.u, s.v); ell(ctx, s.c, x, y, s.r * g.rx, s.r * g.ry, s.rot); }
    for (const l of w.leaves) { const [x, y] = P(l.u, l.v); ell(ctx, l.c, x, y, g.rx * 0.018, g.ry * 0.03, l.rot); }
  },

  aire(ctx, w, g, P) {
    for (const f of w.fog) {
      const [x, y] = P(f.u + Math.sin(w.time * f.sp + f.ph) * 0.15, f.v);
      ctx.save();
      ctx.translate(x, y); ctx.scale(1, g.ry / g.rx);
      const R = f.r * g.rx;
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, "rgba(240,248,255,0.4)");
      gr.addColorStop(1, "rgba(240,248,255,0)");
      ctx.fillStyle = gr;
      circle(ctx, 0, 0, R);
      ctx.restore();
    }
    // Remolino tenue
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = Math.max(1, g.rx * 0.008);
    for (let s = 0; s < 3; s++) {
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const t = k / 40, a = w.time * 0.8 + s * (TAU / 3) + t * 4;
        const [px, py] = P(Math.cos(a) * (0.2 + t * 0.8), Math.sin(a) * (0.2 + t * 0.8));
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};

// ===========================================================================
// Elementos del suelo (unidades locales, base en 0,0)
// ===========================================================================
const PROPS = {
  rock(ctx, pr) {
    const pal = pr.pal;
    contactShadow(ctx, 0.55);
    const gr = ctx.createLinearGradient(-0.35, -0.85, 0.35, 0);
    gr.addColorStop(0, pal.light); gr.addColorStop(1, pal.dark);
    poly(ctx, gr, pr.pts);
    ctx.save();
    ctx.clip();
    if (pal.moss) ell(ctx, pal.moss, 0, -0.85, 0.5, 0.22);
    if (pal.edge) ell(ctx, pal.edge, 0.35, -0.1, 0.25, 0.25);
    ctx.restore();
    if (pal.wet) ell(ctx, "rgba(255,255,255,0.35)", -0.14, -0.62, 0.12, 0.04, -0.3);
    ctx.beginPath();
    pr.pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 0.02; ctx.stroke();
  },

  shard(ctx, pr) {
    contactShadow(ctx, 0.35);
    const gr = ctx.createLinearGradient(-0.2, -1, 0.2, 0);
    gr.addColorStop(0, "#3a2f4a"); gr.addColorStop(1, "#050407");
    poly(ctx, gr, pr.pts);
    line(ctx, "rgba(255,140,60,0.55)", 0.02, [pr.pts[2], pr.pts[3]]);
    line(ctx, "rgba(255,255,255,0.18)", 0.015, [pr.pts[0], pr.pts[1]]);
  },

  reeds(ctx, pr, w) {
    for (const b of pr.blades) {
      const sway = Math.sin(w.time * 1.3 + b.x * 8) * 0.06;
      ctx.strokeStyle = "#2d4a22"; ctx.lineWidth = 0.035; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(b.x, 0); ctx.quadraticCurveTo(b.x + b.b * 0.5, -b.h * 0.6, b.x + b.b + sway, -b.h); ctx.stroke();
      if (b.cat) ell(ctx, "#5a3a1e", b.x + b.b * 0.8 + sway * 0.8, -b.h * 0.85, 0.035, 0.1, b.b * 0.4);
    }
  },

  grass(ctx, pr, w) {
    for (const b of pr.blades) {
      const sway = Math.sin(w.time * 1.8 + b.x * 10) * 0.08;
      ctx.strokeStyle = b.c; ctx.lineWidth = 0.05; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(b.x, 0); ctx.quadraticCurveTo(b.x + b.b * 0.4, -b.h * 0.6, b.x + b.b + sway, -b.h); ctx.stroke();
    }
  },

  mushroom(ctx, pr, w) {
    contactShadow(ctx, 0.4);
    const glow = 0.7 + 0.3 * Math.sin(w.time * 1.5 + pr.u * 9);
    ctx.fillStyle = "#e9e2cf"; ctx.fillRect(-0.07, -0.55, 0.14, 0.55);
    ctx.save();
    ctx.shadowColor = `hsla(${pr.hue},100%,60%,${glow})`;
    ctx.shadowBlur = 14;
    const gr = ctx.createRadialGradient(0, -0.6, 0, 0, -0.6, 0.4);
    gr.addColorStop(0, `hsla(${pr.hue},100%,80%,1)`);
    gr.addColorStop(1, `hsla(${pr.hue},80%,35%,1)`);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(0, -0.55, 0.35, 0.25, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
    ctx.restore();
    for (const [sx, sy] of [[-0.15, -0.65], [0.1, -0.7], [0.2, -0.6]]) ell(ctx, "rgba(255,255,255,0.6)", sx, sy, 0.03, 0.02);
  },
};

// ===========================================================================
// Criaturas (unidades locales, mirando a la derecha)
// ===========================================================================

// Cuadrúpedo genérico (lobo, sabueso de lava) — base en el suelo
function quadruped(ctx, o, pal) {
  const ph = o.step, bob = Math.sin(ph * 2) * 0.025;
  const leg = (x, a, col, wd) => {
    const y = -0.42 + bob;
    const kx = x + Math.sin(a) * 0.2, ky = y + Math.cos(a) * 0.2;
    const fx = kx + Math.sin(a * 0.4 - 0.15) * 0.2, fy = Math.min(0, ky + Math.cos(a * 0.4) * 0.2);
    line(ctx, col, wd * 1.7, [[x, y - 0.05], [kx, ky]]); // muslo con músculo
    line(ctx, col, wd, [[kx, ky], [fx, fy]]);             // pata
    ell(ctx, col, fx + 0.025, fy - 0.012, 0.04, 0.02);    // pie
  };
  contactShadow(ctx, 0.5);
  leg(-0.32, Math.sin(ph + 0.5) * 0.7, pal.far, 0.07);
  leg(0.26, Math.sin(ph + Math.PI + 0.5) * 0.7, pal.far, 0.06);

  ctx.save();
  ctx.translate(0, bob);
  line(ctx, pal.top, pal.tailW, [[-0.48, -0.52], [-0.64, -0.56 + Math.sin(ph) * 0.05], [-0.8, -0.5 + Math.sin(ph) * 0.08]]);
  ctx.beginPath();
  ctx.moveTo(-0.5, -0.52);
  ctx.bezierCurveTo(-0.25, -0.63, 0.1, -0.61, 0.3, -0.58);
  ctx.bezierCurveTo(0.4, -0.6, 0.44, -0.74, 0.5, -0.78);
  ctx.lineTo(0.6, -0.76); ctx.lineTo(0.72, -0.7); ctx.lineTo(0.73, -0.66); ctx.lineTo(0.6, -0.63);
  ctx.bezierCurveTo(0.5, -0.58, 0.46, -0.48, 0.38, -0.4);
  ctx.bezierCurveTo(0.2, -0.34, -0.15, -0.38, -0.35, -0.38);
  ctx.bezierCurveTo(-0.5, -0.4, -0.56, -0.46, -0.5, -0.52);
  ctx.closePath();
  const gr = ctx.createLinearGradient(0, -0.65, 0, -0.34);
  gr.addColorStop(0, pal.top); gr.addColorStop(1, pal.bottom);
  ctx.fillStyle = gr; ctx.fill();
  ctx.strokeStyle = pal.rim; ctx.lineWidth = 0.015; ctx.stroke();
  // Volumen: luz arriba, sombra en la panza y pelaje
  ctx.save();
  ctx.clip();
  ctx.fillStyle = vgrad(ctx, -0.66, -0.5, "rgba(255,255,255,0.14)", "rgba(255,255,255,0)");
  ctx.fillRect(-0.6, -0.7, 1.4, 0.2);
  ell(ctx, "rgba(0,0,0,0.3)", -0.02, -0.36, 0.42, 0.06);
  ell(ctx, "rgba(0,0,0,0.18)", 0.28, -0.48, 0.12, 0.1);   // hombro
  ell(ctx, "rgba(0,0,0,0.18)", -0.36, -0.47, 0.13, 0.1);  // anca
  for (let k = 0; k < 18; k++) {
    const fx = -0.48 + k * 0.05, fy = -0.6 + Math.sin(k * 1.7) * 0.02 + Math.abs(fx) * 0.05;
    line(ctx, k % 2 ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.2)", 0.008, [[fx, fy], [fx - 0.035, fy + 0.05]]);
  }
  ctx.restore();
  poly(ctx, pal.top, [[0.49, -0.77], [0.48, -0.9], [0.57, -0.78]]);
  poly(ctx, "rgba(0,0,0,0.35)", [[0.505, -0.785], [0.495, -0.86], [0.545, -0.785]]);
  ell(ctx, "#050505", 0.722, -0.683, 0.02, 0.016);                       // nariz
  line(ctx, "rgba(0,0,0,0.6)", 0.008, [[0.62, -0.643], [0.715, -0.66]]); // boca
  line(ctx, "rgba(0,0,0,0.25)", 0.01, [[0.5, -0.66], [0.6, -0.69]]);    // mejilla
  pal.extra?.(ctx, o);
  ctx.save();
  ctx.shadowColor = pal.eye; ctx.shadowBlur = 8;
  ell(ctx, pal.eye, 0.6, -0.72, 0.02, 0.013);
  ctx.restore();
  ctx.restore();

  leg(-0.28, Math.sin(ph) * 0.7, pal.near, 0.075);
  leg(0.3, Math.sin(ph + Math.PI) * 0.7, pal.near, 0.065);
}

const HOUND = {
  top: "#2a1712", bottom: "#0c0604", far: "#120a07", near: "#1e110c", rim: "rgba(255,120,40,0.35)", eye: "#ffd23a", tailW: 0.05,
  extra(ctx, o) {
    const pulse = 0.6 + 0.4 * Math.sin(o.step * 0.5);
    ctx.save();
    ctx.shadowColor = "#ff7a00"; ctx.shadowBlur = 10;
    for (const pts of [[[-0.38, -0.5], [-0.24, -0.46], [-0.12, -0.53]], [[0.0, -0.56], [0.12, -0.47], [0.27, -0.51]], [[0.4, -0.62], [0.47, -0.69]], [[-0.2, -0.42], [-0.05, -0.4]]]) {
      line(ctx, `rgba(255,${Math.round(130 + 80 * pulse)},40,0.95)`, 0.022, pts);
    }
    ctx.restore();
  },
};
const WOLF = {
  top: "#6a6560", bottom: "#2a2724", far: "#24211f", near: "#3d3935", rim: "rgba(255,255,255,0.12)", eye: "#ffb627", tailW: 0.08,
  extra(ctx) {
    line(ctx, "rgba(255,255,255,0.12)", 0.012, [[-0.3, -0.58], [-0.1, -0.6], [0.15, -0.59]]);
    ell(ctx, "rgba(220,215,205,0.5)", 0.42, -0.5, 0.06, 0.1, 0.3);
  },
};

// Lagarto visto desde arriba (salamandra, tritón) — centrado
function lizard(ctx, o, pal) {
  const N = 12, pts = [];
  for (let i = 0; i < N; i++) pts.push([0.42 - i * 0.085, Math.sin(o.step - i * 0.55) * 0.05 * (0.3 + i / N)]);
  for (const [i, ph] of [[2, 0], [6, Math.PI]]) {
    const [bx, by] = pts[i];
    for (const s of [-1, 1]) {
      const m = o.moving ? Math.sin(o.step + ph + (s > 0 ? Math.PI : 0)) : 0;
      const knee = [bx + 0.06 + m * 0.06, by + s * 0.11];
      const foot = [knee[0] + 0.05 + m * 0.05, knee[1] + s * 0.05];
      line(ctx, pal.leg, 0.035, [[bx, by], knee, foot]);
    }
  }
  ctx.save();
  if (pal.glow) { ctx.shadowColor = pal.glow; ctx.shadowBlur = 10; }
  for (let i = N - 1; i >= 1; i--) {
    const r = 0.075 * Math.pow(1 - i / N, 0.8) + 0.008;
    ell(ctx, pal.body, pts[i][0], pts[i][1], r, r);
  }
  ell(ctx, pal.body, pts[0][0] + 0.06, pts[0][1], 0.1, 0.07);
  ctx.restore();
  // Escamas, franja dorsal y brillo
  for (let i = 1; i < N - 2; i++) {
    const r = 0.075 * Math.pow(1 - i / N, 0.8);
    for (const s of [-0.5, 0.5]) ell(ctx, "rgba(0,0,0,0.25)", pts[i][0], pts[i][1] + s * r, r * 0.25, r * 0.18);
  }
  line(ctx, "rgba(0,0,0,0.35)", 0.012, pts.slice(0, N - 1));
  for (const i of [2, 4, 6, 8]) ell(ctx, pal.spot, pts[i][0], pts[i][1], 0.025, 0.02);
  ell(ctx, "rgba(255,255,255,0.18)", 0.1, -0.02, 0.25, 0.02);
  ell(ctx, pal.eye, pts[0][0] + 0.1, pts[0][1] - 0.045, 0.018, 0.018);
  ell(ctx, pal.eye, pts[0][0] + 0.1, pts[0][1] + 0.045, 0.018, 0.018);
}

// Ave vista de lado (halcón, fénix)
function birdSide(ctx, o, wingNear, wingFar, body, amp) {
  const f = Math.sin(o.step) * amp;
  const wing = (dy, fill) => {
    ctx.beginPath();
    ctx.moveTo(0.12, -0.02);
    ctx.quadraticCurveTo(0.02, -0.35 * f - 0.1 + dy, -0.15, -0.75 * f + dy);
    ctx.lineTo(-0.27, -0.7 * f + 0.02 + dy);
    ctx.lineTo(-0.3, -0.62 * f + 0.06 + dy);
    ctx.lineTo(-0.34, -0.52 * f + 0.1 + dy);
    ctx.quadraticCurveTo(-0.25, -0.2 * f + 0.08, -0.12, 0.03);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    // Plumas: primarias hacia la punta y cobertoras cerca del cuerpo
    ctx.save();
    ctx.clip();
    for (let k = 0; k < 7; k++) {
      const t = k / 6;
      const tx = lerp(-0.15, -0.34, t), ty = lerp(-0.75 * f + dy, -0.52 * f + 0.1 + dy, t);
      line(ctx, "rgba(0,0,0,0.28)", 0.008, [[0.06 - t * 0.12, -0.02], [tx, ty]]);
    }
    ctx.globalAlpha *= 0.5;
    ell(ctx, "rgba(255,255,255,0.18)", 0.02, -0.18 * f - 0.02 + dy, 0.12, 0.08, -0.6 * f);
    ctx.restore();
  };
  wing(0.04, wingFar);
  poly(ctx, body.tail, [[-0.28, -0.02], [-0.56, -0.09], [-0.6, 0.05], [-0.28, 0.04]]);
  const gr = ctx.createLinearGradient(0, -0.1, 0, 0.1);
  gr.addColorStop(0, body.top); gr.addColorStop(1, body.belly);
  ell(ctx, gr, 0, 0, 0.36, 0.09);
  ell(ctx, body.top, 0.34, -0.05, 0.09, 0.075);
  poly(ctx, body.beak, [[0.41, -0.07], [0.52, -0.03], [0.42, -0.01]]);
  ell(ctx, body.eye, 0.37, -0.07, 0.015, 0.015);
  wing(0, wingNear);
}

const SPR = {
  hound: (ctx, o) => quadruped(ctx, o, HOUND),
  wolf: (ctx, o) => quadruped(ctx, o, WOLF),

  salamander: (ctx, o) => lizard(ctx, o, { body: "#3a0d06", leg: "#2a0904", spot: "#ff8a1a", eye: "#ffd23a", glow: "#ff5a00" }),
  newt: (ctx, o) => lizard(ctx, o, { body: "#0f4c5c", leg: "#0b3a46", spot: "#ffd166", eye: "#111", glow: "rgba(80,220,255,0.6)" }),

  phoenix(ctx, o, w) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const wf = ctx.createLinearGradient(0, 0, -0.2, -0.8);
    wf.addColorStop(0, "rgba(255,240,170,0.95)"); wf.addColorStop(0.5, "rgba(255,130,20,0.85)"); wf.addColorStop(1, "rgba(200,30,0,0.2)");
    for (let k = 0; k < 3; k++) {
      const yy = 0.02 + k * 0.03, sw = Math.sin(w.time * 4 + k) * 0.08;
      ctx.strokeStyle = `rgba(255,${150 - k * 40},30,${0.7 - k * 0.2})`;
      ctx.lineWidth = 0.05 - k * 0.012; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-0.28, yy); ctx.bezierCurveTo(-0.6, yy + 0.1 + sw, -0.9, yy - 0.05 - sw, -1.25, yy + 0.15 + sw); ctx.stroke();
    }
    birdSide(ctx, o, wf, "rgba(255,90,0,0.6)", { top: "rgba(255,170,40,0.95)", belly: "rgba(255,230,150,0.95)", tail: "rgba(255,110,10,0.8)", beak: "#ffe08a", eye: "#fff" }, 1);
    ctx.restore();
  },

  hawk(ctx, o) {
    birdSide(ctx, o, "#4a3526", "#2c1f16", { top: "#5e4430", belly: "#e3d6c3", tail: "#6e5038", beak: "#f2c14e", eye: "#111" }, 0.7);
  },

  wisp(ctx, o, w) {
    const fl = 1 + 0.15 * Math.sin(w.time * 15 + o.ph);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.5 * fl);
    gr.addColorStop(0, "rgba(255,250,210,1)"); gr.addColorStop(0.3, "rgba(255,170,50,0.8)"); gr.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = gr;
    circle(ctx, 0, 0, 0.5 * fl);
    ctx.restore();
  },

  koi(ctx, o) {
    const wig = Math.sin(o.step) * 0.12;
    poly(ctx, "rgba(255,150,80,0.55)", [[-0.36, 0], [-0.72, -0.22 + wig], [-0.62, wig * 0.5], [-0.72, 0.22 + wig]]);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, 0.42, 0.14, 0, 0, TAU);
    const gr = ctx.createLinearGradient(0, -0.14, 0, 0.14);
    gr.addColorStop(0, "#fffaf2"); gr.addColorStop(1, "#d9c6b0");
    ctx.fillStyle = gr; ctx.fill();
    ctx.clip();
    for (const p of o.patches) ell(ctx, p.c, p.x, p.y, p.rx, p.ry);
    ell(ctx, "rgba(255,255,255,0.35)", 0.05, -0.08, 0.3, 0.03);
    ctx.restore();
    poly(ctx, "rgba(255,150,80,0.55)", [[-0.15, -0.12], [0.1, -0.13], [-0.05, -0.26]]);
    ell(ctx, "rgba(255,170,110,0.5)", 0.1, 0.12, 0.1, 0.035, 0.5 + wig);
    ell(ctx, "#111", 0.32, -0.03, 0.022, 0.022);
    line(ctx, "rgba(240,220,200,0.6)", 0.008, [[0.4, 0.03], [0.5, 0.08]]);
  },

  jelly(ctx, o) {
    const pulse = 1 + 0.12 * Math.sin(o.step * 2);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    for (let k = -3; k <= 3; k++) {
      ctx.strokeStyle = `hsla(${o.hue},80%,80%,0.35)`;
      ctx.lineWidth = 0.018;
      ctx.beginPath();
      for (let j = 0; j <= 10; j++) {
        const y = 0.02 + j * 0.09;
        const x = k * 0.07 * pulse + Math.sin(o.step * 2 + y * 7 + k) * 0.04 * (j / 10);
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.shadowColor = `hsla(${o.hue},100%,70%,0.9)`;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.3 * pulse, 0.27 / pulse, 0, Math.PI, TAU);
    ctx.quadraticCurveTo(0, 0.1, -0.3 * pulse, 0);
    const gr = ctx.createRadialGradient(0, -0.12, 0, 0, -0.05, 0.35);
    gr.addColorStop(0, `hsla(${o.hue},90%,90%,0.7)`);
    gr.addColorStop(0.6, `hsla(${o.hue},80%,65%,0.35)`);
    gr.addColorStop(1, `hsla(${o.hue},80%,55%,0.1)`);
    ctx.fillStyle = gr; ctx.fill();
    ctx.restore();
    ell(ctx, `hsla(${o.hue + 40},90%,75%,0.35)`, 0, -0.08, 0.11, 0.07);
  },

  crab(ctx, o) {
    contactShadow(ctx, 0.5);
    const sc = o.step;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const lift = o.moving ? Math.max(0, Math.sin(sc * 1.5 + k * 1.6 + (s > 0 ? Math.PI : 0))) * 0.08 : 0;
        line(ctx, "#7a2418", 0.04, [[s * 0.2, -0.2 + k * 0.02], [s * (0.42 + k * 0.04), -0.34 - lift], [s * (0.55 + k * 0.06), -lift * 0.5]]);
      }
      line(ctx, "#8e2a1c", 0.06, [[s * 0.22, -0.27], [s * 0.38, -0.44]]);
      ell(ctx, "#b8432f", s * 0.44, -0.52, 0.13, 0.08, s * 0.5);
      poly(ctx, "#9a3322", [[s * 0.5, -0.6], [s * 0.62, -0.66], [s * 0.55, -0.55]]);
    }
    ctx.save();
    const gr = ctx.createRadialGradient(-0.08, -0.34, 0.02, 0, -0.26, 0.36);
    gr.addColorStop(0, "#ff9a76"); gr.addColorStop(0.5, "#c0392b"); gr.addColorStop(1, "#4a140c");
    ell(ctx, gr, 0, -0.26, 0.32, 0.17);
    ctx.restore();
    for (const s of [-1, 1]) {
      line(ctx, "#7a2418", 0.025, [[s * 0.07, -0.38], [s * 0.09, -0.48]]);
      ell(ctx, "#111", s * 0.09, -0.5, 0.03, 0.03);
    }
    ell(ctx, "rgba(255,255,255,0.25)", -0.1, -0.34, 0.1, 0.03);
  },

  golem(ctx, o) {
    const sw = o.moving ? Math.sin(o.step) * 0.35 : 0;
    const bob = o.moving ? Math.abs(Math.cos(o.step)) * 0.02 : 0;
    const R = o.rocks;
    const stone = (pts, x, y, rot, dark) => {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(rot);
      const gr = ctx.createLinearGradient(-0.2, -0.3, 0.2, 0.3);
      gr.addColorStop(0, dark ? "#5a554e" : "#8f897f"); gr.addColorStop(1, dark ? "#211f1c" : "#3a3631");
      poly(ctx, gr, pts);
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 0.012; ctx.stroke();
      ctx.restore();
    };
    contactShadow(ctx, 0.55);
    stone(R.leg, -0.06, -0.4, -sw, true);
    stone(R.arm, -0.14, -0.95 + bob, sw * 0.8, true);
    stone(R.torso, 0, -0.72 + bob, 0, false);
    ctx.save();
    ctx.translate(0, -0.72 + bob);
    poly(ctx, "rgba(0,0,0,0)", R.torso);
    ctx.clip();
    ell(ctx, "rgba(86,130,52,0.85)", 0.02, -0.25, 0.3, 0.08);
    ctx.shadowColor = "#a6ff4d"; ctx.shadowBlur = 10;
    line(ctx, "rgba(170,255,90,0.8)", 0.015, [[-0.1, -0.05], [0, 0.05], [0.1, -0.03], [0.05, 0.1]]);
    ctx.restore();
    stone(R.head, 0.17, -1.07 + bob, 0, false);
    ctx.save();
    ctx.shadowColor = "#b6ff6a"; ctx.shadowBlur = 10;
    ell(ctx, "#d4ff8a", 0.25, -1.09 + bob, 0.025, 0.014);
    ctx.restore();
    stone(R.leg, 0.09, -0.4, sw, false);
    stone(R.arm, 0.16, -0.93 + bob, -sw * 0.8, false);
  },

  beetle(ctx, o) {
    for (const k of [-1, 0, 1]) {
      for (const s of [-1, 1]) {
        const m = o.moving ? Math.sin(o.step + (k + s) * 1.5) * 0.06 : 0;
        line(ctx, "#140f0a", 0.035, [[k * 0.18, s * 0.15], [k * 0.22 + m, s * 0.33], [k * 0.3 + m * 1.5, s * 0.44]]);
      }
    }
    line(ctx, "#140f0a", 0.02, [[0.52, -0.04], [0.68, -0.14]]);
    line(ctx, "#140f0a", 0.02, [[0.52, 0.04], [0.68, 0.14]]);
    ell(ctx, "#111", 0.5, 0, 0.07, 0.09);
    const pg = ctx.createRadialGradient(0.3, -0.06, 0, 0.33, 0, 0.18);
    pg.addColorStop(0, "#3d7a4a"); pg.addColorStop(1, "#0d1f14");
    ell(ctx, pg, 0.34, 0, 0.12, 0.16);
    const gr = ctx.createRadialGradient(-0.05, -0.1, 0.02, 0, 0, 0.45);
    gr.addColorStop(0, "#b7ff6a"); gr.addColorStop(0.3, "#2f9e44"); gr.addColorStop(0.7, "#1b4332"); gr.addColorStop(1, "#2a0f3a");
    ell(ctx, gr, -0.02, 0, 0.36, 0.27);
    line(ctx, "rgba(0,0,0,0.6)", 0.015, [[0.22, 0], [-0.38, 0]]);
    ell(ctx, "rgba(255,255,255,0.35)", -0.02, -0.13, 0.15, 0.04);
  },

  spark(ctx, o, w) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.45);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.3, "rgba(150,210,255,0.8)"); gr.addColorStop(1, "rgba(60,120,255,0)");
    ctx.fillStyle = gr;
    circle(ctx, 0, 0, 0.45);
    ctx.strokeStyle = "rgba(190,230,255,0.85)"; ctx.lineWidth = 0.04;
    for (let j = 0; j < 3; j++) {
      let a = rand(0, TAU), x = 0, y = 0;
      ctx.beginPath(); ctx.moveTo(0, 0);
      for (let k = 0; k < 5; k++) { a += rand(-0.6, 0.6); x += Math.cos(a) * 0.16; y += Math.sin(a) * 0.16; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.restore();
  },

  bat(ctx, o) {
    const f = Math.sin(o.step);
    for (const s of [-1, 1]) {
      const wy = -0.35 * f;
      ctx.beginPath();
      ctx.moveTo(s * 0.05, -0.05);
      ctx.lineTo(s * 0.35, -0.15 + wy);
      ctx.lineTo(s * 0.75, 0.05 + wy * 1.3);
      ctx.quadraticCurveTo(s * 0.6, 0.05 + wy, s * 0.55, 0.2 + wy * 0.8);
      ctx.quadraticCurveTo(s * 0.42, 0.1 + wy * 0.6, s * 0.3, 0.24 + wy * 0.5);
      ctx.quadraticCurveTo(s * 0.18, 0.12, s * 0.05, 0.14);
      ctx.closePath();
      ctx.fillStyle = "rgba(28,20,22,0.95)"; ctx.fill();
      line(ctx, "rgba(90,70,70,0.6)", 0.012, [[s * 0.35, -0.15 + wy], [s * 0.55, 0.2 + wy * 0.8]]);
    }
    ell(ctx, "#2b1f1f", 0, 0.03, 0.08, 0.13);
    ell(ctx, "#2b1f1f", 0, -0.1, 0.07, 0.06);
    poly(ctx, "#2b1f1f", [[-0.06, -0.12], [-0.05, -0.22], [-0.01, -0.13]]);
    poly(ctx, "#2b1f1f", [[0.06, -0.12], [0.05, -0.22], [0.01, -0.13]]);
    ctx.save();
    ctx.shadowColor = "#ff2a2a"; ctx.shadowBlur = 6;
    ell(ctx, "#ff4d4d", -0.025, -0.1, 0.012, 0.012);
    ell(ctx, "#ff4d4d", 0.025, -0.1, 0.012, 0.012);
    ctx.restore();
  },

  dragonfly(ctx, o) {
    for (let k = 0; k < 8; k++) ell(ctx, `hsl(${185 - k * 4},65%,${40 - k * 2}%)`, -0.12 - k * 0.08, 0.005 * k, 0.045 - k * 0.003, 0.03);
    ell(ctx, "#1f6f78", 0, 0, 0.1, 0.07);
    ell(ctx, "#0d3b44", 0.12, -0.01, 0.06, 0.06);
    ell(ctx, "#6ad8ff", 0.14, -0.025, 0.045, 0.045);
    ell(ctx, "rgba(255,255,255,0.6)", 0.13, -0.045, 0.015, 0.01);
    const fl = Math.sin(o.step);
    const a = 0.16 + 0.1 * Math.abs(fl);
    ell(ctx, `rgba(220,240,255,${a.toFixed(3)})`, -0.05, -0.2, 0.42, 0.06, -0.3 + fl * 0.35);
    ell(ctx, `rgba(220,240,255,${a.toFixed(3)})`, -0.1, -0.16, 0.36, 0.05, -0.6 + fl * 0.35);
  },

  dustdevil(ctx, o, w) {
    ctx.lineCap = "round";
    for (let k = 0; k < 10; k++) {
      const y = -k * 0.11, r = 0.05 + k * 0.035, a = w.time * 7 + k * 0.7;
      ctx.strokeStyle = `rgba(200,185,160,${(0.32 - k * 0.022).toFixed(3)})`;
      ctx.lineWidth = 0.045;
      ctx.beginPath();
      ctx.ellipse(Math.sin(w.time * 3 + k * 0.5) * 0.025 * k, y, r, r * 0.3, 0, a, a + 4.2);
      ctx.stroke();
    }
    for (let k = 0; k < 6; k++) {
      const a = w.time * 5 + k, y = -0.15 - k * 0.15, r = 0.1 + k * 0.05;
      ell(ctx, "rgba(110,95,75,0.7)", Math.cos(a) * r, y + Math.sin(a) * r * 0.3, 0.02, 0.015);
    }
  },

  floatrock(ctx, o) {
    const gr = ctx.createLinearGradient(0, -0.1, 0, 0.7);
    gr.addColorStop(0, "#8a8378"); gr.addColorStop(1, "#2a2723");
    poly(ctx, gr, o.pts);
    ell(ctx, "#5c7a44", 0, -0.08, 0.5, 0.1);
    ell(ctx, "rgba(255,255,255,0.15)", -0.1, -0.11, 0.3, 0.04);
  },
};

// ---------- Serpiente marina (cada segmento con su profundidad) ----------
function drawSerpent(ctx, o, w, front) {
  const segs = o.segs;
  if (!segs) return;
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    if ((s.z >= 0) !== front) continue;
    if (i % 3 === 0 && i > 0 && i < segs.length - 3) {
      poly(ctx, "rgba(110,225,255,0.4)", [[s.x - s.r * 0.6, s.y - s.r * 0.6], [s.x - s.r * 0.2, s.y - s.r * 1.7], [s.x + s.r * 0.6, s.y - s.r * 0.6]]);
    }
    const gr = ctx.createRadialGradient(s.x - s.r * 0.35, s.y - s.r * 0.45, s.r * 0.1, s.x, s.y, s.r);
    gr.addColorStop(0, "#9ff7ea"); gr.addColorStop(0.45, "#13807c"); gr.addColorStop(1, "#05252d");
    ctx.fillStyle = gr;
    circle(ctx, s.x, s.y, s.r);
    if (i === 0) {
      const d = Math.atan2(s.y - segs[1].y, s.x - segs[1].x);
      ctx.save();
      ctx.translate(s.x, s.y); ctx.rotate(d);
      const hg = ctx.createLinearGradient(0, -s.r, 0, s.r);
      hg.addColorStop(0, "#2bb3a8"); hg.addColorStop(1, "#06323a");
      ell(ctx, hg, s.r * 0.6, 0, s.r * 1.25, s.r * 0.75);
      line(ctx, "#bdf7ff", s.r * 0.12, [[s.r * 0.1, -s.r * 0.6], [-s.r * 0.6, -s.r * 1.3]]);
      line(ctx, "#bdf7ff", s.r * 0.12, [[s.r * 0.1, s.r * 0.6], [-s.r * 0.6, s.r * 1.3]]);
      ctx.shadowColor = "#7ffcff"; ctx.shadowBlur = 12;
      ell(ctx, "#e6ffff", s.r * 0.95, -s.r * 0.35, s.r * 0.18, s.r * 0.11);
      ell(ctx, "#e6ffff", s.r * 0.95, s.r * 0.35, s.r * 0.18, s.r * 0.11);
      ctx.restore();
    }
  }
}

// ---------- Silfo: cinta de viento que gira alrededor del cuerpo ----------
function drawSylph(ctx, o, w, front) {
  const A = w.anchor, N = 28;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  let prev = null;
  for (let k = 0; k <= N; k++) {
    const ak = o.a - k * 0.06 * Math.sign(o.sp);
    const hk = o.hk + 0.15 * Math.sin(w.time * 0.8 - k * 0.05 + o.ph);
    const R = A.S * o.rk * (1 + 0.15 * Math.sin(ak * 2 + o.ph));
    const pt = { x: A.cx + Math.cos(ak) * R, y: lerp(A.top, A.bottom, hk) + Math.sin(ak) * R * 0.22, z: Math.sin(ak) };
    if (prev && ((prev.z + pt.z) / 2 >= 0) === front) {
      const t = k / N;
      ctx.strokeStyle = `rgba(205,232,255,${(0.55 * (1 - t)).toFixed(3)})`;
      ctx.lineWidth = A.S * o.size * (1 - t) + 1;
      ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
    }
    if (k === 0 && (pt.z >= 0) === front) {
      const r = A.S * o.size * 1.2;
      const gr = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(1, "rgba(180,220,255,0)");
      ctx.fillStyle = gr;
      circle(ctx, pt.x, pt.y, r);
    }
    prev = pt;
  }
  ctx.restore();
}

// ---------- Partículas ----------
function drawParticle(ctx, p) {
  const t = p.life;
  switch (p.type) {
    case "ember":
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(255,${Math.round(210 - t * 130)},70,${(1 - t).toFixed(3)})`;
      circle(ctx, p.x, p.y, Math.max(1, p.size * (1 - t * 0.5)));
      ctx.restore();
      break;
    case "flame": {
      const r = Math.max(1, p.size * (1 - t * 0.5));
      const rgb = t < 0.3 ? "255,230,130" : t < 0.6 ? "255,140,30" : "200,45,10";
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, `rgba(${rgb},${(0.9 * (1 - t)).toFixed(3)})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = gr; circle(ctx, p.x, p.y, r);
      ctx.restore();
      break;
    }
    case "smoke": {
      const c = p.c ?? 120;
      ctx.fillStyle = `rgba(${c},${c},${c},${(0.35 * (1 - t)).toFixed(3)})`;
      circle(ctx, p.x, p.y, p.size * (1 + t * 2));
      break;
    }
    case "bubble":
      ctx.strokeStyle = `rgba(220,250,255,${(0.6 * (1 - t)).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
      break;
    case "spark":
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(190,230,255,${(1 - t).toFixed(3)})`;
      circle(ctx, p.x, p.y, Math.max(1, p.size));
      ctx.restore();
      break;
    case "dust":
      ctx.fillStyle = `rgba(165,145,115,${(0.3 * (1 - t)).toFixed(3)})`;
      circle(ctx, p.x, p.y, p.size * (1 + t * 1.5));
      break;
    case "spore":
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = `rgba(160,255,170,${(0.8 * Math.sin(t * Math.PI)).toFixed(3)})`;
      circle(ctx, p.x, p.y, Math.max(1, p.size));
      ctx.restore();
      break;
    case "leaf":
      ell(ctx, `rgba(130,150,70,${(1 - t).toFixed(3)})`, p.x, p.y, p.size, p.size * 0.45, p.rot);
      break;
  }
}
