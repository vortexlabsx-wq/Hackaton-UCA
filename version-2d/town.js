// Pueblos realistas de cada reino y su unión con la persona:
// caminos hacia una plaza a sus pies, aldeanos que suben por sus piernas,
// casas sobre los hombros, el elemento creciendo por el cuerpo y un orbe en la mano.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const hash = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); ctx.fill(); }
function ell(ctx, color, x, y, rx, ry, rot = 0) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU); ctx.fill(); }
function path(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
function poly(ctx, fill, pts) { path(ctx, pts); ctx.fillStyle = fill; ctx.fill(); }
function line(ctx, color, width, pts) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
}
function vgrad(ctx, y0, y1, c0, c1) { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
function hgrad(ctx, x0, x1, stops) { const g = ctx.createLinearGradient(x0, 0, x1, 0); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; }
function glowDot(ctx, x, y, r, rgb, a = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = g; circle(ctx, x, y, r); ctx.restore();
}

// ===========================================================================
// Estilos de cada reino
// ===========================================================================
const SPEC = {
  timber:     { W: 0.42, H: 0.55, D: 0.2, Dy: 0.1, R: 0.42, wall: "#e6d9bd", wallDark: "#a99878", side: "#8f7f63", roof: "#7a4029", roofDark: "#3a1d12", tex: "timber", win: "#ffc96b", chimney: true, base: "#6d665c" },
  barn:       { W: 0.55, H: 0.5, D: 0.25, Dy: 0.12, R: 0.4, wall: "#7d3024", wallDark: "#45180f", side: "#4f1d15", roof: "#4b4139", roofDark: "#221d19", tex: "plank", win: "#ffc96b", base: "#5a534b", bigDoor: true },
  basalt:     { W: 0.4, H: 0.55, D: 0.2, Dy: 0.1, R: 0.36, wall: "#4d4850", wallDark: "#242128", side: "#2c2830", roof: "#1f1c22", roofDark: "#0a090c", tex: "stone", win: "#ff9a2a", glow: "#ff6a00", chimney: true, base: "#18151a" },
  forge:      { W: 0.5, H: 0.6, D: 0.22, Dy: 0.11, R: 0.3, wall: "#3f3a42", wallDark: "#1c1a1f", side: "#25222a", roof: "#18161b", roofDark: "#060507", tex: "stone", win: "#ffb347", glow: "#ff6a00", chimney: true, forge: true, base: "#141216" },
  stilt:      { W: 0.4, H: 0.5, D: 0.2, Dy: 0.1, R: 0.38, wall: "#8d775b", wallDark: "#53442f", side: "#4f4232", roof: "#4f5f69", roofDark: "#232d33", tex: "plank", win: "#ffd28a", stilts: true },
  hut:        { W: 0.4, H: 0.5, D: 0.2, Dy: 0.1, R: 0.38, wall: "#8d775b", wallDark: "#53442f", side: "#4f4232", roof: "#4f5f69", roofDark: "#232d33", tex: "plank", win: "#ffd28a" },
  whitehouse: { W: 0.38, H: 0.55, D: 0.18, Dy: 0.09, R: 0.4, wall: "#f2f2ef", wallDark: "#c2c5cc", side: "#aeb2bb", roof: "#3f6190", roofDark: "#1d3151", tex: "white", win: "#ffe3a0" },
};

const STYLE = {
  tierra: {
    kinds: [["windmill", 0.36], ["barn", 0.3], ["timber", 0.26], ["timber", 0.24], ["timber", 0.25]],
    road: "cobble", plaza: "cobble", lamp: "lantern", shoulder: "timber",
    villager: { cloak: "#5d4630", dark: "#2f2317", hood: "#45331f", skin: "#d9a77c", item: "lantern" },
    extras: [["tree", 4, 0.2], ["well", 1, 0.12]],
  },
  fuego: {
    kinds: [["forge", 0.3], ["watchtower", 0.32], ["basalt", 0.25], ["basalt", 0.24], ["basalt", 0.25]],
    road: "obsidian", plaza: "obsidian", lamp: "brazier", shoulder: "forge",
    villager: { cloak: "#3b1c12", dark: "#140804", hood: "#26120b", skin: "#c98d6a", item: "torch" },
    extras: [],
  },
  agua: {
    kinds: [["lighthouse", 0.34], ["stilt", 0.26], ["stilt", 0.25], ["stilt", 0.26], ["stilt", 0.24]],
    road: "pier", plaza: "deck", lamp: "lantern", shoulder: "hut",
    villager: { cloak: "#2e4756", dark: "#141f26", hood: "#22343f", skin: "#d9a77c", item: "lantern" },
    extras: [],
  },
  aire: {
    kinds: [["spire", 0.32], ["spire", 0.3], ["windmill", 0.34], ["whitehouse", 0.24], ["whitehouse", 0.25]],
    road: "marble", plaza: "marble", lamp: "crystal", shoulder: "whitehouse",
    villager: { cloak: "#cfd6e4", dark: "#7f8aa1", hood: "#aab4c8", skin: "#e3b896", item: "lantern" },
    extras: [],
  },
};

const LEG_PATHS = [[27, 25, 23, 11], [28, 26, 24, 12]];

// ===========================================================================
// Creación
// ===========================================================================
export function buildTown(w) {
  const st = STYLE[w.element];
  const T = { style: st, buildings: [], lamps: [], props: [], villagers: [], shoulders: null, orb: null };
  w.town = T;
  w.grow = 0;

  // Edificios al fondo y a los costados (para no tapar a la persona)
  for (const [kind, size] of st.kinds) {
    for (let tries = 0; tries < 300; tries++) {
      const a = rand(0, TAU), r = Math.sqrt(rand(0.55 * 0.55, 0.95 * 0.95));
      const u = Math.cos(a) * r, v = Math.sin(a) * r;
      if (v > 0.3) continue;
      if (T.buildings.some((b) => Math.hypot(b.u - u, (b.v - v) * 0.45) < (b.size + size) * 0.55)) continue;
      const len = Math.hypot(u, v);
      const road = { a: { u, v: v + 0.03 }, b: { u: (u / len) * 0.33, v: (v / len) * 0.33 } };
      road.len = Math.hypot(road.a.u - road.b.u, road.a.v - road.b.v);
      T.buildings.push({ town: "building", kind, size, u, v, road, seed: rand(0, 1000), ph: rand(0, TAU) });
      break;
    }
  }
  // Farolas a mitad de cada camino
  for (const b of T.buildings) {
    const m = { u: (b.road.a.u + b.road.b.u) / 2, v: (b.road.a.v + b.road.b.v) / 2 };
    const du = b.road.b.u - b.road.a.u, dv = b.road.b.v - b.road.a.v, L = Math.hypot(du, dv) || 1;
    T.lamps.push({ town: "lamp", kind: st.lamp, size: 0.1, u: m.u - (dv / L) * 0.06, v: m.v + (du / L) * 0.06, ph: rand(0, TAU) });
  }
  // Árboles, pozo…
  for (const [kind, n, size] of st.extras) {
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 100; tries++) {
        const a = rand(0, TAU), r = rand(0.5, 0.97), u = Math.cos(a) * r, v = Math.sin(a) * r;
        if (v > 0.45) continue;
        if ([...T.buildings, ...T.props].some((b) => Math.hypot(b.u - u, (b.v - v) * 0.5) < 0.16)) continue;
        T.props.push({ town: "prop", kind, size: size * rand(0.85, 1.15), u, v, blobs: treeBlobs(), ph: rand(0, TAU) });
        break;
      }
    }
  }
  // Aldeanos
  const n = Math.min(7, T.buildings.length + 2);
  for (let i = 0; i < n; i++) {
    T.villagers.push({ town: "villager", size: 0.075, home: T.buildings[i % T.buildings.length], state: "home", timer: rand(0.3, 5), t: 0, pos: 0, blend: 0, step: rand(0, TAU), flip: 1, u: 0, v: 0, pal: st.villager });
  }
}

function treeBlobs() {
  return Array.from({ length: 7 }, (_, i) => ({ x: rand(-0.28, 0.28), y: -0.75 - rand(0, 0.45) + (i < 3 ? 0.15 : 0), r: rand(0.18, 0.28) })).sort((a, b) => a.y - b.y);
}

// ===========================================================================
// Animación
// ===========================================================================
export function updateTown(w, dt, g, A, P, emit, spawn) {
  const T = w.town;
  if (!T) return;
  const place = (o) => {
    [o.x, o.y] = P(o.u, o.v);
    o.z = o.v;
    o.s = o.size * g.rx * (1 + 0.12 * o.v);
  };

  w.grow = clamp01(w.grow + (A.pts ? dt / 5 : -dt / 2));

  for (const b of T.buildings) {
    place(b);
    const sp = SPEC[b.kind];
    if (sp?.chimney) {
      const [cx, cy] = chimneyTop(sp);
      spawn(b, "smoke", sp.forge ? 3 : 1.3, dt, () => emit(w, { type: "smoke", x: b.x + cx * b.s, y: b.y + cy * b.s, vx: g.rx * 0.03, vy: -g.rx * 0.1, size: b.s * 0.06, dur: rand(2, 3.2), z: b.z, c: w.element === "fuego" ? 55 : 190 }));
      if (sp.forge) spawn(b, "ember", 10, dt, () => emit(w, { type: "ember", x: b.x + cx * b.s, y: b.y + cy * b.s, vx: rand(-1, 1) * b.s * 0.3, vy: -b.s * rand(0.8, 1.6), size: b.s * 0.015, dur: rand(0.6, 1.2), z: b.z }));
    }
    if (b.kind === "watchtower") spawn(b, "fire", 25, dt, () => emit(w, { type: "flame", x: b.x + rand(-0.08, 0.08) * b.s, y: b.y - 1.32 * b.s, vy: -b.s * rand(0.6, 1.2), size: b.s * rand(0.06, 0.1), dur: rand(0.3, 0.6), z: b.z }));
  }
  for (const l of T.lamps) {
    place(l);
    if (l.kind === "brazier") spawn(l, "fire", 18, dt, () => emit(w, { type: "flame", x: l.x + rand(-0.1, 0.1) * l.s, y: l.y - 0.62 * l.s, vy: -l.s * rand(0.6, 1.2), size: l.s * rand(0.12, 0.2), dur: rand(0.3, 0.6), z: l.z }));
  }
  for (const p of T.props) place(p);

  // Casas sobre los hombros y orbe en la mano
  if (A.pts && w.grow > 0) {
    const tilt = Math.atan2(A.pts[12].y - A.pts[11].y, A.pts[12].x - A.pts[11].x);
    T.shoulders = [11, 12].map((i) => {
      const sh = A.pts[i], out = Math.sign(sh.x - A.cx) || 1;
      const k = easeOut(clamp01(w.grow * 1.3 - 0.2));
      return { x: sh.x + out * A.S * 0.14, y: sh.y - A.S * 0.06, rot: tilt, s: A.S * 0.3 * k, k };
    });
    for (const h of T.shoulders) {
      const sp = SPEC[T.style.shoulder];
      if (sp?.chimney && h.k > 0.5) {
        const [cx, cy] = chimneyTop(sp);
        spawn(h, "smoke", 1.2, dt, () => emit(w, { type: "smoke", x: h.x + cx * h.s, y: h.y + cy * h.s, vx: A.S * 0.05, vy: -A.S * 0.15, size: h.s * 0.07, dur: rand(1.8, 2.8), z: 1, c: w.element === "fuego" ? 55 : 190 }));
      }
    }
    const wr = A.pts[16], el = A.pts[14];
    const dx = wr.x - el.x, dy = wr.y - el.y, L = Math.hypot(dx, dy) || 1;
    T.orb = { x: wr.x + (dx / L) * A.S * 0.22, y: wr.y + (dy / L) * A.S * 0.22 - A.S * 0.1, r: A.S * 0.17 * easeOut(w.grow) };
    if (T.orb.r > 2) ORB_EMIT[w.element](w, T.orb, dt, emit, spawn);
  } else {
    T.shoulders = null;
    T.orb = null;
  }

  for (const v of T.villagers) updateVillager(v, w, dt, g, A, P);
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function chimneyTop(sp) {
  const x = sp.W * 0.5 + sp.D * 0.5;
  return [x, -(sp.stilts ? 0.36 : 0) - sp.H - sp.R * 0.55 - 0.27];
}

function legPoint(A, ids, pos) {
  const i = Math.min(Math.floor(pos), ids.length - 2), f = pos - i;
  const a = A.pts[ids[i]], b = A.pts[ids[i + 1]];
  return [lerp(a.x, b.x, f), lerp(a.y, b.y, f), Math.hypot(b.x - a.x, b.y - a.y)];
}

function updateVillager(v, w, dt, g, A, P) {
  const r = v.home.road, speed = 0.12;
  const onBody = ["climb", "perch", "down", "unblend"].includes(v.state);
  if (onBody && !A.pts) { v.state = "back"; v.blend = 0; }

  switch (v.state) {
    case "home":
      v.moving = false; v.t = 0;
      if ((v.timer -= dt) <= 0) v.state = "out";
      break;
    case "out":
      v.moving = true;
      v.t = Math.min(1, v.t + (speed * dt) / r.len);
      v.flip = r.b.u - r.a.u >= 0 ? 1 : -1;
      if (v.t >= 1) {
        if (A.pts && w.grow > 0.85 && Math.random() < 0.6) {
          const [px] = P(r.b.u, r.b.v);
          v.leg = Math.abs(A.pts[27].x - px) < Math.abs(A.pts[28].x - px) ? 0 : 1;
          v.state = "climb"; v.pos = 0; v.blend = 0;
        } else { v.state = "gaze"; v.timer = rand(2, 4); }
      }
      break;
    case "gaze":
      v.moving = false;
      v.flip = -v.u >= 0 ? 1 : -1; // mira hacia la persona
      if ((v.timer -= dt) <= 0) v.state = "back";
      break;
    case "back":
      v.moving = true;
      v.t = Math.max(0, v.t - (speed * dt) / r.len);
      v.flip = r.a.u - r.b.u >= 0 ? 1 : -1;
      if (v.t <= 0) { v.state = "home"; v.timer = rand(2, 7); }
      break;
    case "climb": {
      v.moving = true;
      v.blend = Math.min(1, v.blend + dt * 1.5);
      if (v.blend >= 1) {
        const [, , segLen] = legPoint(A, LEG_PATHS[v.leg], v.pos);
        v.pos = Math.min(3, v.pos + (0.5 * A.S * dt) / Math.max(segLen, 1));
        if (v.pos >= 3) { v.state = "perch"; v.timer = rand(3, 6); }
      }
      break;
    }
    case "perch":
      v.moving = false;
      if ((v.timer -= dt) <= 0) v.state = "down";
      break;
    case "down": {
      v.moving = true;
      const [, , segLen] = legPoint(A, LEG_PATHS[v.leg], v.pos);
      v.pos = Math.max(0, v.pos - (0.6 * A.S * dt) / Math.max(segLen, 1));
      if (v.pos <= 0) v.state = "unblend";
      break;
    }
    case "unblend":
      v.blend = Math.max(0, v.blend - dt * 1.5);
      if (v.blend <= 0) v.state = "back";
      break;
  }
  if (v.moving) v.step += dt * 9;

  v.u = lerp(r.a.u, r.b.u, v.t);
  v.v = lerp(r.a.v, r.b.v, v.t);
  const [gx, gy] = P(v.u, v.v);
  v.climbing = v.blend > 0;
  if (v.blend > 0 && A.pts) {
    const [bx, by] = legPoint(A, LEG_PATHS[v.leg], v.pos);
    v.x = lerp(gx, bx, v.blend);
    v.y = lerp(gy, by, v.blend);
    v.z = v.blend > 0.3 ? 1 : v.v;
    v.s = v.size * g.rx;
  } else {
    v.x = gx; v.y = gy; v.z = v.v;
    v.s = v.size * g.rx * (1 + 0.12 * v.v);
  }
}

// Partículas del orbe de la mano
const ORB_EMIT = {
  fuego(w, o, dt, emit, spawn) {
    spawn(o, "f", 35, dt, () => emit(w, { type: "flame", x: o.x + rand(-0.4, 0.4) * o.r, y: o.y, vy: -o.r * rand(2, 4), size: o.r * rand(0.4, 0.7), dur: rand(0.3, 0.6), z: 1 }));
  },
  agua(w, o, dt, emit, spawn) {
    spawn(o, "d", 6, dt, () => emit(w, { type: "bubble", x: o.x + rand(-0.6, 0.6) * o.r, y: o.y + o.r * 0.5, vy: o.r * rand(1, 2), size: o.r * rand(0.06, 0.12), dur: rand(0.6, 1), z: 1 }));
  },
  tierra(w, o, dt, emit, spawn) {
    spawn(o, "s", 8, dt, () => emit(w, { type: "spore", x: o.x + rand(-1, 1) * o.r, y: o.y + rand(-0.5, 0.5) * o.r, vx: rand(-1, 1) * o.r, vy: -o.r * rand(0.5, 1.2), size: o.r * 0.05, dur: rand(1, 2), z: 1 }));
  },
  aire(w, o, dt, emit, spawn) {
    spawn(o, "l", 4, dt, () => emit(w, { type: "leaf", x: o.x, y: o.y + o.r * 0.6, vx: rand(-1, 1) * o.r * 3, vy: -o.r * rand(1, 2), size: o.r * 0.15, dur: rand(0.8, 1.4), z: 1, rot: rand(0, TAU) }));
  },
};

// ===========================================================================
// Suelo del pueblo: caminos que llevan a la plaza a los pies de la persona
// ===========================================================================
export function drawTownGround(ctx, w, g, P) {
  const T = w.town;
  if (!T) return;
  const wd = g.rx * 0.055;
  ctx.save();
  ctx.lineCap = "round";
  for (const b of T.buildings) {
    const [x1, y1] = P(b.road.a.u, b.road.a.v), [x2, y2] = P(b.road.b.u, b.road.b.v);
    const seg = (color, width, dash = []) => {
      ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    };
    switch (T.style.road) {
      case "cobble":
        seg("rgba(40,34,28,0.5)", wd * 1.25);
        seg("rgba(112,102,88,0.95)", wd);
        seg("rgba(66,58,49,0.75)", wd * 0.8, [wd * 0.22, wd * 0.16]);
        break;
      case "obsidian":
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        seg(`rgba(255,90,0,${(0.28 + 0.1 * Math.sin(w.time * 3 + b.ph)).toFixed(3)})`, wd * 1.7);
        ctx.restore();
        seg("rgba(18,14,18,0.97)", wd);
        seg("rgba(70,60,75,0.5)", wd * 0.5, [wd * 0.3, wd * 0.3]);
        break;
      case "pier":
        seg("rgba(0,0,0,0.35)", wd * 1.35);
        seg("#76583b", wd * 1.1);
        seg("#3b2a1a", wd * 1.1, [1.2, wd * 0.28]);
        break;
      case "marble":
        seg("rgba(150,160,180,0.5)", wd * 1.25);
        seg("rgba(238,241,246,0.97)", wd);
        seg("rgba(205,180,110,0.7)", wd * 0.12);
        break;
    }
  }
  ctx.setLineDash([]);
  ctx.restore();

  // Plaza a los pies de la persona
  const R = g.rx * 0.33;
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.scale(1, g.ry / g.rx);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  circle(ctx, 0, R * 0.04, R * 1.06);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
  switch (T.style.plaza) {
    case "cobble": {
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, "#90877a"); gr.addColorStop(1, "#5a5349");
      ctx.fillStyle = gr; ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.strokeStyle = "rgba(40,34,28,0.55)"; ctx.lineWidth = R * 0.025;
      for (const k of [0.3, 0.52, 0.74, 0.94]) { ctx.setLineDash([R * 0.07, R * 0.035]); ctx.beginPath(); ctx.arc(0, 0, R * k, 0, TAU); ctx.stroke(); }
      break;
    }
    case "obsidian": {
      ctx.fillStyle = "#121014"; ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.strokeStyle = "rgba(80,70,90,0.6)"; ctx.lineWidth = R * 0.02;
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke(); }
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255,110,20,${(0.5 + 0.2 * Math.sin(w.time * 2.5)).toFixed(3)})`; ctx.lineWidth = R * 0.06;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, TAU); ctx.stroke();
      ctx.restore();
      break;
    }
    case "deck": {
      ctx.fillStyle = "#7a5a3b"; ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.strokeStyle = "#3e2c1b"; ctx.lineWidth = R * 0.015;
      for (let y = -R; y < R; y += R * 0.13) { ctx.beginPath(); ctx.moveTo(-R, y); ctx.lineTo(R, y); ctx.stroke(); }
      ctx.strokeStyle = "#4f3a24"; ctx.lineWidth = R * 0.06;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.96, 0, TAU); ctx.stroke();
      break;
    }
    case "marble": {
      const gr = ctx.createRadialGradient(-R * 0.3, -R * 0.3, 0, 0, 0, R);
      gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#cfd5df");
      ctx.fillStyle = gr; ctx.fillRect(-R, -R, R * 2, R * 2);
      ctx.strokeStyle = "rgba(200,170,90,0.85)"; ctx.lineWidth = R * 0.03;
      ctx.beginPath(); ctx.arc(0, 0, R * 0.85, 0, TAU); ctx.stroke();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85); ctx.lineTo(Math.cos(a + TAU / 16) * R * 0.4, Math.sin(a + TAU / 16) * R * 0.4); ctx.stroke(); }
      break;
    }
  }
  ctx.restore();
}

// ===========================================================================
// Objetos del pueblo en la escena (edificios, farolas, árboles, aldeanos)
// ===========================================================================
export function townItems(w) {
  const T = w.town;
  if (!T) return [];
  return [...T.buildings, ...T.lamps, ...T.props, ...T.villagers];
}

export function drawTownObj(ctx, o, w) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.scale(o.s * (o.flip || 1), o.s);
  if (o.town === "building") BUILDING[o.kind] ? BUILDING[o.kind](ctx, o, w) : house3d(ctx, SPEC[o.kind], o, w);
  else if (o.town === "lamp") LAMP[o.kind](ctx, o, w);
  else if (o.town === "prop") PROP[o.kind](ctx, o, w);
  else villager(ctx, o, w);
  ctx.restore();
}

// ---------- Casa con volumen (frente + costado + techo) ----------
function house3d(ctx, b, o, w) {
  const { W, H, D, Dy, R } = b;
  ell(ctx, "rgba(0,0,0,0.42)", D * 0.5, -Dy * 0.2, W + D * 0.9, 0.08);
  if (b.stilts) {
    for (const sx of [-W * 0.85, 0, W * 0.85, W + D * 0.8]) line(ctx, "#2e2317", 0.05, [[sx, 0.02], [sx, -0.34]]);
    ctx.fillStyle = "#5a4430"; ctx.fillRect(-W - 0.06, -0.38, W * 2 + D + 0.12, 0.05);
    ctx.translate(0, -0.36);
  }
  if (b.base) {
    poly(ctx, b.base, [[-W, 0], [-W, -0.07], [W, -0.07], [W, 0]]);
    poly(ctx, "rgba(0,0,0,0.5)", [[W, 0], [W, -0.07], [W + D, -0.07 - Dy], [W + D, -Dy]]);
  }
  const top = b.base ? -0.07 : 0;
  // Costado
  poly(ctx, hgrad(ctx, W, W + D, [[0, b.side], [1, b.wallDark]]), [[W, top], [W, -H], [W + D, -H - Dy], [W + D, top - Dy]]);
  ctx.save();
  ctx.transform(1, -Dy / D, 0, 1, W, 0);
  windowGlass(ctx, D * 0.3, -H * 0.72, D * 0.4, 0.17, b, w, o);
  ctx.restore();
  // Frente con hastial
  const front = [[-W, top], [-W, -H], [0, -H - R * 0.94], [W, -H], [W, top]];
  poly(ctx, vgrad(ctx, -H - R, 0, b.wall, b.wallDark), front);
  ctx.save();
  path(ctx, front); ctx.clip();
  wallTexture(ctx, b, o);
  // Oclusión ambiental en la base
  ctx.fillStyle = vgrad(ctx, -0.15, 0, "rgba(0,0,0,0)", "rgba(0,0,0,0.35)");
  ctx.fillRect(-W, -0.15, W * 2, 0.15);
  ctx.restore();
  // Ventanas y puerta
  windowGlass(ctx, -W * 0.72, -H * 0.74, 0.16, 0.18, b, w, o);
  windowGlass(ctx, W * 0.72 - 0.16, -H * 0.74, 0.16, 0.18, b, w, o);
  ctx.fillStyle = "#1d150d";
  ctx.beginPath(); ctx.arc(0, -H - R * 0.42, 0.045, 0, TAU); ctx.fill();
  ctx.save();
  ctx.shadowColor = b.glow || b.win; ctx.shadowBlur = 6;
  ell(ctx, b.win, 0, -H - R * 0.42, 0.032, 0.032);
  ctx.restore();
  if (b.forge) forgeArch(ctx, w, o);
  else door(ctx, b.bigDoor ? 0.13 : 0.075, b.bigDoor ? 0.36 : 0.27, top);
  // Techo (plano lateral) con alero
  const ridgeA = [0, -H - R], ridgeB = [D, -H - R - Dy], eaveA = [W + 0.05, -H + 0.04], eaveB = [W + D + 0.05, -H - Dy + 0.04];
  const roof = [[ridgeA[0] - 0.02, ridgeA[1] - 0.01], eaveA, eaveB, [ridgeB[0] - 0.02, ridgeB[1] - 0.01]];
  poly(ctx, vgrad(ctx, -H - R, -H, b.roof, b.roofDark), roof);
  ctx.save();
  path(ctx, roof); ctx.clip();
  for (let k = 1; k < 9; k++) {
    const t = k / 9;
    line(ctx, "rgba(0,0,0,0.3)", 0.01, [[lerp(ridgeA[0], eaveA[0], t), lerp(ridgeA[1], eaveA[1], t)], [lerp(ridgeB[0], eaveB[0], t), lerp(ridgeB[1], eaveB[1], t)]]);
  }
  for (let k = 0; k < 6; k++) {
    const t = k / 6;
    line(ctx, "rgba(0,0,0,0.18)", 0.008, [[lerp(ridgeA[0], ridgeB[0], t), lerp(ridgeA[1], ridgeB[1], t)], [lerp(eaveA[0], eaveB[0], t), lerp(eaveA[1], eaveB[1], t)]]);
  }
  ctx.restore();
  line(ctx, "rgba(255,255,255,0.15)", 0.015, [ridgeA, ridgeB]);
  line(ctx, b.roofDark, 0.035, [[-W - 0.04, -H + 0.04], [0, -H - R - 0.01], [W + 0.05, -H + 0.04]]);
  // Chimenea
  if (b.chimney) {
    const [cx, ctop] = chimneyTop({ ...b, stilts: false });
    const h = b.forge ? 0.42 : 0.27;
    const cy = ctop + 0.27 - h;
    poly(ctx, hgrad(ctx, cx - 0.05, cx + 0.05, [[0, "#6a625a"], [1, "#2c2824"]]), [[cx - 0.05, ctop + 0.27 + 0.03], [cx - 0.05, cy], [cx + 0.05, cy], [cx + 0.05, ctop + 0.27 + 0.03]]);
    ctx.fillStyle = "#24201d"; ctx.fillRect(cx - 0.065, cy - 0.025, 0.13, 0.035);
  }
}

function wallTexture(ctx, b, o) {
  const { W, H, R } = b;
  if (b.tex === "timber") {
    const c = "#3b2a1c", lw = 0.035;
    for (const x of [-W + 0.02, -W / 3, W / 3, W - 0.02]) line(ctx, c, lw, [[x, -H], [x, 0]]);
    for (const y of [-H + 0.02, -H * 0.5]) line(ctx, c, lw, [[-W, y], [W, y]]);
    line(ctx, c, lw * 0.8, [[-W, -H * 0.5], [-W / 3, -H]]);
    line(ctx, c, lw * 0.8, [[W, -H * 0.5], [W / 3, -H]]);
    line(ctx, c, lw * 0.8, [[0, -H - R], [0, -H]]);
    line(ctx, c, lw * 0.7, [[-W * 0.5, -H], [0, -H - R * 0.6]]);
    line(ctx, c, lw * 0.7, [[W * 0.5, -H], [0, -H - R * 0.6]]);
    ctx.fillStyle = "rgba(90,70,40,0.08)";
    for (let i = 0; i < 12; i++) circle(ctx, (hash(o.seed, i) - 0.5) * W * 2, -hash(i, o.seed) * H, 0.03);
  } else if (b.tex === "stone") {
    let row = 0;
    for (let y = 0; y > -H - R; y -= 0.075, row++) {
      const off = row % 2 ? 0.06 : 0;
      for (let x = -W - off; x < W; x += 0.12) {
        const hv = hash(x * 10 + o.seed, y * 10);
        ctx.fillStyle = hv > 0.6 ? "rgba(255,255,255,0.06)" : hv < 0.25 ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0)";
        ctx.fillRect(x, y - 0.075, 0.12, 0.075);
        ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 0.008;
        ctx.strokeRect(x, y - 0.075, 0.12, 0.075);
      }
    }
  } else if (b.tex === "plank") {
    for (let x = -W; x < W; x += 0.065) {
      line(ctx, "rgba(0,0,0,0.35)", 0.008, [[x, -H - R], [x, 0]]);
      ctx.fillStyle = hash(x * 30, o.seed) > 0.5 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
      ctx.fillRect(x, -H - R, 0.065, H + R);
    }
  } else {
    for (let y = -0.1; y > -H - R; y -= 0.1) line(ctx, "rgba(0,0,0,0.07)", 0.006, [[-W, y], [W, y]]);
  }
}

function windowGlass(ctx, x, y, wd, ht, b, w, o) {
  ctx.fillStyle = "#24190f";
  ctx.fillRect(x - 0.02, y - 0.02, wd + 0.04, ht + 0.04);
  ctx.save();
  const fl = b.glow ? 0.75 + 0.25 * Math.sin(w.time * 9 + x * 20 + o.seed) : 0.9 + 0.1 * Math.sin(w.time * 2 + o.seed);
  ctx.globalAlpha *= fl;
  ctx.shadowColor = b.glow || b.win; ctx.shadowBlur = 10;
  ctx.fillStyle = vgrad(ctx, y, y + ht, b.win, "#a85a1a");
  ctx.fillRect(x, y, wd, ht);
  ctx.restore();
  line(ctx, "#24190f", 0.015, [[x + wd / 2, y], [x + wd / 2, y + ht]]);
  line(ctx, "#24190f", 0.015, [[x, y + ht / 2], [x + wd, y + ht / 2]]);
  line(ctx, "rgba(255,255,255,0.25)", 0.012, [[x - 0.025, y + ht + 0.03], [x + wd + 0.025, y + ht + 0.03]]);
}

function door(ctx, hw, h, base) {
  ctx.fillStyle = "#cfc6b6";
  ctx.beginPath(); ctx.moveTo(-hw - 0.025, base); ctx.lineTo(-hw - 0.025, base - h + hw); ctx.arc(0, base - h + hw, hw + 0.025, Math.PI, 0); ctx.lineTo(hw + 0.025, base); ctx.fill();
  ctx.fillStyle = vgrad(ctx, base - h, base, "#4a3220", "#24170d");
  ctx.beginPath(); ctx.moveTo(-hw, base); ctx.lineTo(-hw, base - h + hw); ctx.arc(0, base - h + hw, hw, Math.PI, 0); ctx.lineTo(hw, base); ctx.fill();
  for (let x = -hw + 0.04; x < hw; x += 0.045) line(ctx, "rgba(0,0,0,0.4)", 0.006, [[x, base - h + hw * 0.6], [x, base]]);
  ell(ctx, "#c9a24a", hw * 0.6, base - h * 0.45, 0.012, 0.012);
}

function forgeArch(ctx, w, o) {
  const fl = 0.8 + 0.2 * Math.sin(w.time * 11 + o.seed) * Math.sin(w.time * 5.7);
  ctx.save();
  ctx.beginPath(); ctx.moveTo(-0.2, 0); ctx.lineTo(-0.2, -0.22); ctx.arc(0, -0.22, 0.2, Math.PI, 0); ctx.lineTo(0.2, 0); ctx.closePath();
  const g = ctx.createRadialGradient(0, -0.1, 0.02, 0, -0.15, 0.35);
  g.addColorStop(0, `rgba(255,240,170,${fl})`); g.addColorStop(0.4, "rgba(255,130,20,0.95)"); g.addColorStop(1, "rgba(90,20,0,1)");
  ctx.shadowColor = "#ff6a00"; ctx.shadowBlur = 25;
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#1a1512"; ctx.fillRect(-0.12, -0.08, 0.24, 0.08);
  line(ctx, "#0d0b09", 0.03, [[-0.05, -0.08], [0.05, -0.08]]);
}

// ---------- Edificios especiales ----------
const BUILDING = {
  windmill(ctx, o, w) {
    ell(ctx, "rgba(0,0,0,0.42)", 0, 0, 0.32, 0.07);
    const body = [[-0.24, 0], [0.24, 0], [0.14, -1.0], [-0.14, -1.0]];
    poly(ctx, hgrad(ctx, -0.24, 0.24, [[0, w.element === "aire" ? "#ffffff" : "#b4a996"], [0.6, w.element === "aire" ? "#d9dde5" : "#81766a"], [1, w.element === "aire" ? "#9aa1ae" : "#4e463d"]]), body);
    ctx.save(); path(ctx, body); ctx.clip();
    for (let y = -0.06; y > -1; y -= 0.08) line(ctx, "rgba(0,0,0,0.15)", 0.006, [[-0.3, y], [0.3, y]]);
    ctx.restore();
    door(ctx, 0.06, 0.2, 0);
    windowGlass(ctx, -0.05, -0.62, 0.1, 0.12, { win: "#ffc96b" }, w, o);
    poly(ctx, vgrad(ctx, -1.2, -1.0, "#6b4a33", "#3a281b"), [[-0.18, -0.98], [0.18, -0.98], [0.12, -1.12], [0, -1.18], [-0.12, -1.12]]);
    ctx.save();
    ctx.translate(0.02, -1.06);
    ctx.rotate(w.time * 1.2 + o.ph);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      line(ctx, "#4a3522", 0.03, [[0, 0], [0.78, 0]]);
      ctx.fillStyle = "rgba(232,222,200,0.88)"; ctx.fillRect(0.12, 0.01, 0.64, 0.13);
      ctx.strokeStyle = "#5b4632"; ctx.lineWidth = 0.012;
      ctx.strokeRect(0.12, 0.01, 0.64, 0.13);
      for (let x = 0.2; x < 0.76; x += 0.09) line(ctx, "#5b4632", 0.008, [[x, 0.01], [x, 0.14]]);
    }
    ell(ctx, "#2d2016", 0, 0, 0.04, 0.04);
    ctx.restore();
  },

  spire(ctx, o, w) {
    ell(ctx, "rgba(0,0,0,0.35)", 0, 0, 0.28, 0.06);
    const body = [[-0.17, 0], [0.17, 0], [0.15, -1.1], [-0.15, -1.1]];
    poly(ctx, hgrad(ctx, -0.17, 0.17, [[0, "#ffffff"], [0.55, "#d4d7de"], [1, "#8f96a4"]]), body);
    ctx.save(); path(ctx, body); ctx.clip();
    for (let y = -0.08; y > -1.1; y -= 0.09) line(ctx, "rgba(0,0,0,0.08)", 0.006, [[-0.2, y], [0.2, y]]);
    ctx.restore();
    for (const wy of [-0.85, -0.55]) {
      ctx.save(); ctx.shadowColor = "#ffd76a"; ctx.shadowBlur = 8;
      ctx.fillStyle = "#ffd98a";
      ctx.beginPath(); ctx.moveTo(-0.04, wy + 0.12); ctx.lineTo(-0.04, wy); ctx.arc(0, wy, 0.04, Math.PI, 0); ctx.lineTo(0.04, wy + 0.12); ctx.fill();
      ctx.restore();
    }
    door(ctx, 0.06, 0.2, 0);
    ell(ctx, "#c8ccd6", 0, -1.1, 0.22, 0.05);
    const cone = [[-0.21, -1.1], [0.21, -1.1], [0, -1.78]];
    poly(ctx, hgrad(ctx, -0.21, 0.21, [[0, "#6d93c4"], [0.6, "#3c5f8f"], [1, "#1c3152"]]), cone);
    ctx.save(); path(ctx, cone); ctx.clip();
    for (let k = 1; k < 7; k++) line(ctx, "rgba(0,0,0,0.2)", 0.006, [[-0.25, -1.1 - k * 0.1], [0.25, -1.1 - k * 0.1]]);
    ctx.restore();
    line(ctx, "#9aa0aa", 0.015, [[0, -1.78], [0, -2.05]]);
    const wv = Math.sin(w.time * 4 + o.ph) * 0.04;
    ctx.fillStyle = "#b3261e";
    ctx.beginPath(); ctx.moveTo(0, -2.05); ctx.quadraticCurveTo(0.12, -2.08 + wv, 0.26, -2.02 - wv); ctx.lineTo(0.24, -1.94 - wv); ctx.quadraticCurveTo(0.12, -1.98 + wv, 0, -1.94); ctx.fill();
  },

  watchtower(ctx, o, w) {
    ell(ctx, "rgba(0,0,0,0.42)", 0, 0, 0.3, 0.07);
    const body = [[-0.2, 0], [0.2, 0], [0.17, -1.15], [-0.17, -1.15]];
    poly(ctx, hgrad(ctx, -0.2, 0.2, [[0, "#57515a"], [0.6, "#35313a"], [1, "#16141a"]]), body);
    ctx.save(); path(ctx, body); ctx.clip();
    wallTexture(ctx, { W: 0.2, H: 1.15, R: 0, tex: "stone" }, o);
    ctx.restore();
    for (const wy of [-0.85, -0.5]) {
      ctx.save(); ctx.shadowColor = "#ff7a00"; ctx.shadowBlur = 10;
      ctx.fillStyle = "#ffa040"; ctx.fillRect(-0.02, wy, 0.04, 0.13);
      ctx.restore();
    }
    ctx.fillStyle = "#2a262d"; ctx.fillRect(-0.24, -1.25, 0.48, 0.1);
    for (let x = -0.24; x < 0.24; x += 0.12) { ctx.fillStyle = "#3a353f"; ctx.fillRect(x, -1.32, 0.07, 0.08); }
    glowDot(ctx, 0, -1.3, 0.35, "255,120,20", 0.5);
  },

  lighthouse(ctx, o, w) {
    ell(ctx, "rgba(0,0,0,0.4)", 0, 0, 0.32, 0.07);
    poly(ctx, "#4a4a4a", [[-0.28, 0], [0.28, 0], [0.24, -0.1], [-0.24, -0.1]]);
    const body = [[-0.2, -0.1], [0.2, -0.1], [0.12, -1.1], [-0.12, -1.1]];
    poly(ctx, hgrad(ctx, -0.2, 0.2, [[0, "#ffffff"], [0.6, "#d8d8d8"], [1, "#8a8a8a"]]), body);
    ctx.save(); path(ctx, body); ctx.clip();
    for (const y of [-0.3, -0.7]) { ctx.fillStyle = hgrad(ctx, -0.2, 0.2, [[0, "#d23a2f"], [1, "#6e1610"]]); ctx.fillRect(-0.3, y - 0.2, 0.6, 0.2); }
    ctx.restore();
    ctx.fillStyle = "#2b2b2b"; ctx.fillRect(-0.17, -1.14, 0.34, 0.05);
    ctx.save(); ctx.shadowColor = "#fff3b0"; ctx.shadowBlur = 20;
    ctx.fillStyle = "#fff6c8"; ctx.fillRect(-0.09, -1.3, 0.18, 0.16);
    ctx.restore();
    poly(ctx, "#2b2b2b", [[-0.13, -1.3], [0.13, -1.3], [0, -1.42]]);
    // Haz de luz giratorio
    const a = w.time * 1.2 + o.ph, c = Math.cos(a), len = 2.6;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const dir = c >= 0 ? 1 : -1, wdt = 0.08 + 0.25 * (1 - Math.abs(c));
    const gr = ctx.createLinearGradient(0, -1.22, dir * len, -1.22);
    gr.addColorStop(0, `rgba(255,245,190,${(0.45 * Math.abs(c) + 0.1).toFixed(3)})`); gr.addColorStop(1, "rgba(255,245,190,0)");
    poly(ctx, gr, [[0, -1.25], [dir * len * Math.abs(c), -1.22 - wdt], [dir * len * Math.abs(c), -1.22 + wdt]]);
    ctx.restore();
  },
};

// ---------- Farolas ----------
const LAMP = {
  lantern(ctx, o, w) {
    ell(ctx, "rgba(0,0,0,0.35)", 0, 0, 0.12, 0.03);
    line(ctx, "#1f1a16", 0.04, [[0, 0], [0, -0.9]]);
    line(ctx, "#1f1a16", 0.025, [[0, -0.88], [0.15, -0.88], [0.15, -0.82]]);
    ctx.fillStyle = "#2a221b"; ctx.fillRect(0.1, -0.82, 0.1, 0.03);
    ctx.save(); ctx.shadowColor = "#ffb84d"; ctx.shadowBlur = 10;
    ctx.fillStyle = "#ffd98a"; ctx.fillRect(0.11, -0.79, 0.08, 0.11);
    ctx.restore();
    glowDot(ctx, 0.15, -0.73, 0.5, "255,170,70", 0.35 + 0.05 * Math.sin(w.time * 7 + o.ph));
  },
  brazier(ctx, o) {
    ell(ctx, "rgba(0,0,0,0.4)", 0, 0, 0.16, 0.04);
    line(ctx, "#1a1512", 0.035, [[-0.12, 0], [0, -0.45]]);
    line(ctx, "#1a1512", 0.035, [[0.12, 0], [0, -0.45]]);
    line(ctx, "#1a1512", 0.035, [[0, 0], [0, -0.45]]);
    poly(ctx, vgrad(ctx, -0.62, -0.45, "#4a3f38", "#1a1512"), [[-0.18, -0.6], [0.18, -0.6], [0.1, -0.45], [-0.1, -0.45]]);
    glowDot(ctx, 0, -0.62, 0.7, "255,120,30", 0.45);
  },
  crystal(ctx, o, w) {
    const bob = Math.sin(w.time * 1.5 + o.ph) * 0.05;
    ell(ctx, "rgba(0,0,0,0.25)", 0, 0, 0.12, 0.03);
    poly(ctx, "#d9dee8", [[-0.08, 0], [0.08, 0], [0.04, -0.35], [-0.04, -0.35]]);
    ctx.save(); ctx.shadowColor = "#8fe3ff"; ctx.shadowBlur = 14;
    poly(ctx, hgrad(ctx, -0.08, 0.08, [[0, "#e6fbff"], [1, "#4fb6e8"]]), [[0, -0.75 + bob], [0.08, -0.55 + bob], [0, -0.42 + bob], [-0.08, -0.55 + bob]]);
    ctx.restore();
    glowDot(ctx, 0, -0.58 + bob, 0.45, "140,220,255", 0.35);
  },
};

// ---------- Árboles y pozo ----------
const PROP = {
  tree(ctx, o, w) {
    ell(ctx, "rgba(0,0,0,0.4)", 0.05, 0, 0.4, 0.07);
    poly(ctx, hgrad(ctx, -0.07, 0.07, [[0, "#6b4c32"], [1, "#2c1d12"]]), [[-0.07, 0], [0.07, 0], [0.04, -0.7], [-0.04, -0.7]]);
    line(ctx, "#3b2818", 0.03, [[0.02, -0.5], [0.18, -0.72]]);
    const sway = Math.sin(w.time * 1.1 + o.ph) * 0.02;
    for (const b of o.blobs) {
      const g = ctx.createRadialGradient(b.x - b.r * 0.35 + sway, b.y - b.r * 0.4, b.r * 0.1, b.x + sway, b.y, b.r);
      g.addColorStop(0, "#7da850"); g.addColorStop(0.6, "#3f6b2a"); g.addColorStop(1, "#1f3a16");
      ctx.fillStyle = g; circle(ctx, b.x + sway, b.y, b.r);
    }
  },
  well(ctx) {
    ell(ctx, "rgba(0,0,0,0.4)", 0, 0, 0.42, 0.08);
    poly(ctx, hgrad(ctx, -0.3, 0.3, [[0, "#9b9384"], [1, "#4b463e"]]), [[-0.3, 0], [-0.3, -0.3], [0.3, -0.3], [0.3, 0]]);
    for (let y = -0.08; y > -0.3; y -= 0.08) line(ctx, "rgba(0,0,0,0.3)", 0.008, [[-0.3, y], [0.3, y]]);
    ell(ctx, "#5d574e", 0, -0.3, 0.3, 0.07);
    ell(ctx, "#0f1418", 0, -0.3, 0.24, 0.05);
    line(ctx, "#4a3522", 0.03, [[-0.26, -0.3], [-0.26, -0.85]]);
    line(ctx, "#4a3522", 0.03, [[0.26, -0.3], [0.26, -0.85]]);
    poly(ctx, vgrad(ctx, -1.05, -0.8, "#6e3b26", "#3a1d12"), [[-0.38, -0.8], [0.38, -0.8], [0, -1.05]]);
    line(ctx, "#2b2018", 0.012, [[0, -0.82], [0, -0.55]]);
    ctx.fillStyle = "#5a4430"; ctx.fillRect(-0.04, -0.55, 0.08, 0.07);
  },
};

// ---------- Aldeano ----------
function villager(ctx, o, w) {
  const p = o.pal, sw = o.moving ? Math.sin(o.step) * 0.18 : 0;
  if (!o.climbing) ell(ctx, "rgba(0,0,0,0.35)", 0, 0, 0.22, 0.05);
  line(ctx, "#1e1812", 0.08, [[-0.03, -0.42], [-0.03 + sw * 0.6, 0]]);
  line(ctx, "#1e1812", 0.08, [[0.03, -0.42], [0.03 - sw * 0.6, 0]]);
  // Brazo de atrás
  const armBack = o.climbing ? [[0, -0.75], [-0.05 - sw * 0.2, -1.0]] : [[0, -0.75], [-0.08 - sw * 0.3, -0.5]];
  line(ctx, p.dark, 0.06, armBack);
  // Capa
  poly(ctx, vgrad(ctx, -0.85, -0.3, p.cloak, p.dark), [[-0.13, -0.83], [0.13, -0.83], [0.2, -0.32], [0.05, -0.28], [-0.2, -0.32]]);
  line(ctx, "rgba(255,255,255,0.08)", 0.012, [[0.08, -0.8], [0.15, -0.35]]);
  // Cabeza con capucha
  ell(ctx, p.skin, 0.05, -0.93, 0.075, 0.085);
  ctx.fillStyle = p.hood;
  ctx.beginPath(); ctx.arc(0.01, -0.93, 0.11, Math.PI * 0.55, Math.PI * 2.15); ctx.quadraticCurveTo(0.02, -0.8, -0.1, -0.84); ctx.fill();
  // Brazo de adelante con el objeto
  const hand = o.climbing ? [0.1 + sw * 0.2, -1.02] : [0.13 + sw * 0.25, -0.52];
  line(ctx, p.cloak, 0.06, [[0.03, -0.75], hand]);
  if (o.climbing) return;
  if (p.item === "lantern") {
    line(ctx, "#2a221b", 0.012, [hand, [hand[0], hand[1] + 0.08]]);
    ctx.save(); ctx.shadowColor = "#ffb84d"; ctx.shadowBlur = 8;
    ctx.fillStyle = "#ffd98a"; ctx.fillRect(hand[0] - 0.035, hand[1] + 0.08, 0.07, 0.09);
    ctx.restore();
    glowDot(ctx, hand[0], hand[1] + 0.12, 0.45, "255,170,70", 0.4);
  } else if (p.item === "torch") {
    line(ctx, "#3a281a", 0.03, [[hand[0] - 0.02, hand[1] + 0.12], [hand[0] + 0.03, hand[1] - 0.15]]);
    const fl = 1 + 0.2 * Math.sin(w.time * 18 + o.step);
    glowDot(ctx, hand[0] + 0.04, hand[1] - 0.22, 0.12 * fl, "255,220,120", 1);
    glowDot(ctx, hand[0] + 0.04, hand[1] - 0.2, 0.55, "255,120,30", 0.35);
  }
}

// ===========================================================================
// Unión con la persona: el elemento crece por las piernas, casas en los hombros, orbe en la mano
// ===========================================================================
export function drawBodyTown(ctx, w) {
  const T = w.town, A = w.anchor;
  if (!T || !A?.pts || w.grow <= 0) return;
  const S = A.S;
  for (const ids of LEG_PATHS) GROWTH[w.element](ctx, w, limbPoints(A, ids, 48), S, w.grow);
  if (T.shoulders) for (const h of T.shoulders) if (h.s > 1) shoulderHouse(ctx, w, h);
  if (T.orb && T.orb.r > 1) ORB[w.element](ctx, w, T.orb);
}

function limbPoints(A, ids, n) {
  const out = [], segs = ids.length - 1;
  for (let k = 0; k <= n; k++) {
    const t = (k / n) * segs, i = Math.min(Math.floor(t), segs - 1), f = t - i;
    const a = A.pts[ids[i]], b = A.pts[ids[i + 1]];
    out.push([lerp(a.x, b.x, f), lerp(a.y, b.y, f)]);
  }
  return out;
}

// Desplaza un recorrido hacia los lados para que se enrosque en la pierna
function wrap(pts, amp, freq, phase, upto) {
  const n = Math.max(2, Math.floor(pts.length * upto));
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const off = Math.sin(k * freq + phase) * amp;
    out.push([pts[k][0] - (dy / L) * off, pts[k][1] + (dx / L) * off]);
  }
  return out;
}

const GROWTH = {
  tierra(ctx, w, pts, S, grow) {
    const vine = wrap(pts, S * 0.08, 0.42, 0, grow);
    line(ctx, "#1f3314", S * 0.04, vine);
    line(ctx, "#4d7a2e", S * 0.014, vine);
    vine.forEach(([x, y], k) => {
      if (k % 3) return;
      const side = k % 6 ? 1 : -1, sway = Math.sin(w.time * 2 + k) * 0.2;
      const r = S * 0.055;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(side * 0.9 + sway);
      const g = ctx.createLinearGradient(0, 0, r * 2, 0);
      g.addColorStop(0, "#2f5a1f"); g.addColorStop(1, "#7fb04a");
      ell(ctx, g, r, 0, r, r * 0.45);
      line(ctx, "rgba(20,40,10,0.6)", S * 0.004, [[0, 0], [r * 1.8, 0]]);
      ctx.restore();
      if (k % 12 === 0) { ell(ctx, "#f2d7e8", x, y, S * 0.022, S * 0.022); ell(ctx, "#e8b93a", x, y, S * 0.009, S * 0.009); }
    });
  },
  fuego(ctx, w, pts, S, grow) {
    const vein = wrap(pts, S * 0.04, 0.9, 1.3, grow);
    const pulse = 0.6 + 0.4 * Math.sin(w.time * 3);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    line(ctx, `rgba(255,80,0,${(0.3 * pulse).toFixed(3)})`, S * 0.09, vein);
    line(ctx, `rgba(255,150,40,${(0.7 * pulse).toFixed(3)})`, S * 0.03, vein);
    line(ctx, "rgba(255,240,180,0.9)", S * 0.01, vein);
    vein.forEach(([x, y], k) => {
      if (k % 6) return;
      const a = Math.sin(k * 7.3) * 1.5;
      line(ctx, `rgba(255,140,30,${(0.6 * pulse).toFixed(3)})`, S * 0.012, [[x, y], [x + Math.cos(a) * S * 0.12, y + Math.sin(a) * S * 0.12]]);
    });
    ctx.restore();
  },
  agua(ctx, w, pts, S, grow) {
    for (const ph of [0, Math.PI]) {
      const stream = wrap(pts, S * 0.11, 0.35, ph + w.time * 0.5, grow);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      line(ctx, "rgba(60,150,220,0.45)", S * 0.05, stream);
      ctx.setLineDash([S * 0.08, S * 0.16]);
      ctx.lineDashOffset = w.time * S * 1.2;
      line(ctx, "rgba(215,248,255,0.8)", S * 0.014, stream);
      ctx.restore();
    }
  },
  aire(ctx, w, pts, S, grow) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const ph of [0, Math.PI]) {
      const ribbon = wrap(pts, S * 0.16, 0.3, ph - w.time * 3, grow);
      line(ctx, "rgba(220,240,255,0.25)", S * 0.03, ribbon);
      ctx.setLineDash([S * 0.15, S * 0.1]);
      ctx.lineDashOffset = -w.time * S * 2;
      line(ctx, "rgba(255,255,255,0.5)", S * 0.01, ribbon);
      ctx.setLineDash([]);
    }
    ctx.restore();
  },
};

// Base sobre el hombro y una casa del pueblo encima
function shoulderHouse(ctx, w, h) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.rot);
  ctx.scale(h.s, h.s);
  switch (w.element) {
    case "tierra":
      ell(ctx, "#4a3b28", 0.05, 0.02, 0.7, 0.16);
      ell(ctx, "#4f7a32", 0.05, -0.02, 0.66, 0.12);
      for (let k = -5; k <= 5; k++) line(ctx, "#3f6a26", 0.03, [[k * 0.11, -0.04], [k * 0.11 + 0.03, -0.14]]);
      break;
    case "fuego":
      poly(ctx, "#1a1416", [[-0.65, 0.05], [0.7, 0.05], [0.5, -0.08], [-0.45, -0.08]]);
      glowDot(ctx, 0, 0, 0.9, "255,100,20", 0.35);
      break;
    case "agua":
      ctx.fillStyle = "#5e4630"; ctx.fillRect(-0.6, -0.06, 1.3, 0.07);
      for (const x of [-0.5, 0, 0.55]) line(ctx, "#3a2a1b", 0.04, [[x, 0.01], [x, 0.18]]);
      break;
    case "aire":
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      for (let k = -3; k <= 3; k++) circle(ctx, k * 0.18, 0.02 + Math.abs(k) * 0.01, 0.17 - Math.abs(k) * 0.02);
      break;
  }
  house3d(ctx, SPEC[w.town.style.shoulder], { seed: 7 }, w);
  ctx.restore();
}

// Orbe del elemento flotando en la mano derecha
const ORB = {
  fuego(ctx, w, o) {
    const fl = 1 + 0.1 * Math.sin(w.time * 17);
    glowDot(ctx, o.x, o.y, o.r * 2.4, "255,90,10", 0.35);
    glowDot(ctx, o.x, o.y, o.r * fl, "255,200,90", 0.95);
    glowDot(ctx, o.x, o.y - o.r * 0.2, o.r * 0.45, "255,255,220", 1);
  },
  agua(ctx, w, o) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const g = ctx.createRadialGradient(o.x - o.r * 0.35, o.y - o.r * 0.35, o.r * 0.05, o.x, o.y, o.r);
    g.addColorStop(0, "rgba(230,250,255,0.9)"); g.addColorStop(0.5, "rgba(70,170,230,0.55)"); g.addColorStop(1, "rgba(20,80,160,0.35)");
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * TAU, r = o.r * (1 + 0.06 * Math.sin(a * 3 + w.time * 4));
      k ? ctx.lineTo(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r) : ctx.moveTo(o.x + Math.cos(a) * r, o.y + Math.sin(a) * r);
    }
    ctx.fill();
    ctx.restore();
    ell(ctx, "rgba(255,255,255,0.7)", o.x - o.r * 0.35, o.y - o.r * 0.4, o.r * 0.2, o.r * 0.1, -0.6);
  },
  tierra(ctx, w, o) {
    const bob = Math.sin(w.time * 1.6) * o.r * 0.1;
    const y = o.y + bob;
    poly(ctx, hgrad(ctx, o.x - o.r, o.x + o.r, [[0, "#8a7f70"], [1, "#2e2a24"]]), [[o.x - o.r, y - o.r * 0.1], [o.x + o.r, y - o.r * 0.1], [o.x + o.r * 0.5, y + o.r * 0.6], [o.x, y + o.r * 1.1], [o.x - o.r * 0.6, y + o.r * 0.5]]);
    ell(ctx, "#4f7a32", o.x, y - o.r * 0.1, o.r, o.r * 0.25);
    line(ctx, "#4a3522", o.r * 0.08, [[o.x, y - o.r * 0.1], [o.x, y - o.r * 0.8]]);
    for (const [dx, dy, r] of [[0, -0.95, 0.38], [-0.25, -0.75, 0.28], [0.25, -0.78, 0.28]]) {
      const g = ctx.createRadialGradient(o.x + dx * o.r - r * o.r * 0.3, y + dy * o.r - r * o.r * 0.3, 0, o.x + dx * o.r, y + dy * o.r, r * o.r);
      g.addColorStop(0, "#8fc25a"); g.addColorStop(1, "#24451a");
      ctx.fillStyle = g; circle(ctx, o.x + dx * o.r, y + dy * o.r, r * o.r);
    }
  },
  aire(ctx, w, o) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < 9; k++) {
      const y = o.y + o.r * 0.9 - k * o.r * 0.22, r = o.r * (0.15 + k * 0.1), a = w.time * 8 + k * 0.7;
      ctx.strokeStyle = `rgba(225,242,255,${(0.55 - k * 0.04).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, o.r * 0.07);
      ctx.beginPath(); ctx.ellipse(o.x + Math.sin(w.time * 3 + k) * o.r * 0.05, y, r, r * 0.3, 0, a, a + 4.5); ctx.stroke();
    }
    ctx.restore();
  },
};
