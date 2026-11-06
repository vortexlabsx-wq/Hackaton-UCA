// Reinos elementales en 3D (three.js) alrededor y sobre cada persona.
//
// Cómo encaja con el video:
//  · La cámara 3D está en el origen mirando hacia -Z. La persona vive en un plano a profundidad D.
//  · Cada píxel de la imagen se convierte a un punto 3D de ese plano (toWorld).
//  · Un "oclusor" invisible en ese plano, recortado con la máscara de la persona, escribe profundidad:
//    lo que queda detrás de la persona se oculta y lo que está delante se dibuja encima.
//  · El piso del reino es horizontal, a la altura de los pies, así que la perspectiva es real.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const CDN = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/";
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// Mezcla aditiva que también escribe transparencia: así la luz (fuego, brillos, viento)
// se ve bien al pintar el canvas 3D transparente encima del video.
const ADD = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
};

export const ELEMENTS = {
  agua:   { name: "Reino del Agua",     emoji: "💧", color: "#4fd1ff", light: "rgba(40,150,255,0.5)" },
  fuego:  { name: "Reino del Fuego",    emoji: "🔥", color: "#ff7a1a", light: "rgba(255,110,20,0.6)" },
  tierra: { name: "Reino de la Tierra", emoji: "🌿", color: "#9bd35a", light: "rgba(130,190,80,0.35)" },
  aire:   { name: "Reino del Aire",     emoji: "🌪️", color: "#e6f6ff", light: "rgba(200,230,255,0.4)" },
};
const KEYS = Object.keys(ELEMENTS);
export function randomElement(exclude = []) {
  const pool = KEYS.filter((k) => !exclude.includes(k));
  const list = pool.length ? pool : KEYS;
  return list[Math.floor(Math.random() * list.length)];
}

// Modelos animados (ejemplos oficiales de three.js) y su giro para que miren hacia +Z
const MODELS = {
  horse:    { file: "models/gltf/Horse.glb", yaw: 0 },
  flamingo: { file: "models/gltf/Flamingo.glb", yaw: 0 },
  parrot:   { file: "models/gltf/Parrot.glb", yaw: 0 },
  stork:    { file: "models/gltf/Stork.glb", yaw: 0 },
  soldier:  { file: "models/gltf/Soldier.glb", yaw: Math.PI },
  robot:    { file: "models/gltf/RobotExpressive/RobotExpressive.glb", yaw: 0 },
};
const TEXTURES = {
  water: "textures/waternormals.jpg",
  grass: "textures/terrain/grasslight-big.jpg",
  lava: "textures/lava/lavatile.jpg",
  brick: "textures/brick_diffuse.jpg",
  wood: "textures/hardwood2_diffuse.jpg",
};

// Recorridos por el cuerpo (índices de MediaPipe Pose)
const PATHS = [[27, 25, 23, 11, 13, 15], [28, 26, 24, 12, 14, 16], [15, 13, 11, 12, 14, 16]];
const LEGS = [[27, 25, 23, 11], [28, 26, 24, 12]];

// ===========================================================================
// Texturas generadas por código
// ===========================================================================
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function makeProceduralTextures() {
  const dot = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.6)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, false);
  const puff = canvasTex(128, 128, (g, w) => {
    for (let i = 0; i < 14; i++) {
      const x = w / 2 + rand(-18, 18), y = w / 2 + rand(-18, 18), r = rand(18, w / 2 - 2 - Math.max(Math.abs(x - w / 2), Math.abs(y - w / 2)));
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
    }
  }, false);
  const fade = canvasTex(256, 256, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, "#fff"); gr.addColorStop(0.72, "#fff"); gr.addColorStop(1, "#000");
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, false);
  const timber = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#e2d6ba"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${pick(["90,70,40", "255,255,255"])},${rand(0.03, 0.08)})`; g.fillRect(rand(0, w), rand(0, h), rand(1, 4), rand(1, 4)); }
    g.strokeStyle = "#3b2a1c"; g.lineWidth = 14; g.lineCap = "square";
    for (const x of [7, 128, 249]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (const y of [7, 128, 249]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.lineWidth = 10;
    g.beginPath(); g.moveTo(7, 128); g.lineTo(128, 7); g.moveTo(249, 128); g.lineTo(128, 7); g.moveTo(7, 249); g.lineTo(128, 128); g.stroke();
  });
  const tiles = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#777"; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) {
      for (let col = -1; col < 9; col++) {
        const x = col * 32 + (row % 2 ? 16 : 0), y = row * 32;
        const gr = g.createLinearGradient(0, y, 0, y + 32);
        const l = rand(150, 210);
        gr.addColorStop(0, `rgb(${l},${l},${l})`); gr.addColorStop(1, `rgb(${l * 0.45},${l * 0.45},${l * 0.45})`);
        g.fillStyle = gr;
        g.beginPath(); g.roundRect(x + 1, y, 30, 31, [0, 0, 10, 10]); g.fill();
      }
    }
  });
  const marble = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#f3f3f1"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = `rgba(120,125,140,${rand(0.05, 0.2)})`; g.lineWidth = rand(0.5, 2.5);
      g.beginPath(); g.moveTo(rand(0, w), 0);
      g.bezierCurveTo(rand(0, w), rand(0, h), rand(0, w), rand(0, h), rand(0, w), h); g.stroke();
    }
    g.strokeStyle = "rgba(0,0,0,0.08)"; g.lineWidth = 2;
    for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  const stripes = canvasTex(64, 256, (g, w, h) => {
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? "#c62f25" : "#f4f4f2"; g.fillRect(0, (i * h) / 4, w, h / 4); }
  });
  const leaf = canvasTex(64, 64, (g, w) => {
    g.fillStyle = "#4e8a2e";
    g.beginPath(); g.moveTo(w / 2, 2); g.quadraticCurveTo(w - 4, w / 2, w / 2, w - 2); g.quadraticCurveTo(4, w / 2, w / 2, 2); g.fill();
    g.strokeStyle = "#2c5418"; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, 4); g.lineTo(w / 2, w - 4); g.stroke();
  });
  return { dot, puff, fade, timber, tiles, marble, stripes, leaf };
}

// ===========================================================================
// Partículas (fuego, humo, chispas, agua) con tamaño, color y transparencia por partícula
// ===========================================================================
const PVERT = `
attribute vec3 pcolor; attribute float palpha; attribute float psize;
uniform float scale; varying vec3 vC; varying float vA;
void main(){ vC=pcolor; vA=palpha; vec4 mv=modelViewMatrix*vec4(position,1.0);
  gl_PointSize=psize*scale/max(0.001,-mv.z); gl_Position=projectionMatrix*mv; }`;
const PFRAG = `
uniform sampler2D map; varying vec3 vC; varying float vA;
void main(){ vec4 t=texture2D(map,gl_PointCoord); float a=t.a*vA; if(a<0.004) discard;
  gl_FragColor=vec4(vC*t.rgb,a);
  #include <colorspace_fragment>
}`;

class Particles {
  constructor(scene, map, additive, max = 900) {
    this.max = max; this.n = 0;
    const f = (k) => new Float32Array(max * k);
    Object.assign(this, { p: f(3), v: f(3), c: f(3), a: f(1), s: f(1), c0: f(3), c1: f(3), life: f(1), dur: f(1), s0: f(1), sg: f(1), g: f(1), a0: f(1) });
    this.geo = new THREE.BufferGeometry();
    const attr = (arr, k) => new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("position", attr(this.p, 3));
    this.geo.setAttribute("pcolor", attr(this.c, 3));
    this.geo.setAttribute("palpha", attr(this.a, 1));
    this.geo.setAttribute("psize", attr(this.s, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, scale: { value: 400 } },
      vertexShader: PVERT, fragmentShader: PFRAG,
      transparent: true, depthWrite: false,
      ...(additive ? ADD : { blending: THREE.NormalBlending }),
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
  }
  emit(pos, vel, o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.p.set([pos.x, pos.y, pos.z], i * 3);
    this.v.set([vel.x, vel.y, vel.z], i * 3);
    this.c0.set(o.c0, i * 3); this.c1.set(o.c1 || o.c0, i * 3);
    this.life[i] = 0; this.dur[i] = o.dur; this.s0[i] = o.size; this.sg[i] = o.grow || 0; this.g[i] = o.grav || 0; this.a0[i] = o.alpha ?? 1;
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (const [arr, k] of [[this.p, 3], [this.v, 3], [this.c0, 3], [this.c1, 3], [this.life, 1], [this.dur, 1], [this.s0, 1], [this.sg, 1], [this.g, 1], [this.a0, 1]]) arr.copyWithin(i * k, j * k, j * k + k);
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt / this.dur[i];
      if (this.life[i] >= 1) { this.kill(i); continue; }
      const t = this.life[i], i3 = i * 3;
      this.v[i3 + 1] += this.g[i] * dt;
      for (let k = 0; k < 3; k++) {
        this.p[i3 + k] += this.v[i3 + k] * dt;
        this.c[i3 + k] = lerp(this.c0[i3 + k], this.c1[i3 + k], t);
      }
      this.a[i] = this.a0[i] * Math.min(1, t * 6) * (1 - t);
      this.s[i] = this.s0[i] * (1 + this.sg[i] * t);
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    for (const k of ["position", "pcolor", "palpha", "psize"]) this.geo.attributes[k].needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

const FIRE = { c0: [1.0, 0.85, 0.45], c1: [0.9, 0.15, 0.02] };
const EMBER = { c0: [1.0, 0.7, 0.3], c1: [1.0, 0.25, 0.05] };

// ===========================================================================
// Motor 3D (uno para todas las personas)
// ===========================================================================
export class Realms {
  constructor() {
    this.ready = false;
    this.status = "cargando 3D…";
    this.W = 0; this.H = 0;
    this.D = 6;
    this.fov = 45;
    this.realms = new Map();

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.fov, 16 / 9, 0.05, 200);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(r), 0.04).texture;

    this.hemi = new THREE.HemisphereLight(0xdde8ff, 0x2a2118, 0.55);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.tex = makeProceduralTextures();
    this.fx = {
      fire: new Particles(this.scene, this.tex.dot, true),
      spark: new Particles(this.scene, this.tex.dot, true, 600),
      smoke: new Particles(this.scene, this.tex.puff, false, 500),
      water: new Particles(this.scene, this.tex.dot, false, 500),
    };

    // Oclusor: la silueta de la persona (solo profundidad, invisible).
    // La máscara se lee en coordenadas de pantalla, así siempre coincide con el video.
    this.maskTex = null;
    this.occMat = new THREE.ShaderMaterial({
      uniforms: { mask: { value: null }, res: { value: new THREE.Vector2(1, 1) } },
      vertexShader: "void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform sampler2D mask; uniform vec2 res; void main(){ if (texture2D(mask, gl_FragCoord.xy / res).a < 0.5) discard; gl_FragColor = vec4(0.0); }",
      colorWrite: false,
      side: THREE.DoubleSide,
    });
    this.occluder = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.occMat);
    this.occluder.renderOrder = -10;
    this.occluder.visible = false;
    this.scene.add(this.occluder);
  }

  async load() {
    const tl = new THREE.TextureLoader();
    const gl = new GLTFLoader();
    const loadTex = (f, srgb) => tl.loadAsync(CDN + f).then((t) => {
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      return t;
    });
    const texKeys = Object.keys(TEXTURES);
    const texRes = await Promise.allSettled(texKeys.map((k) => loadTex(TEXTURES[k], k !== "water")));
    texKeys.forEach((k, i) => { if (texRes[i].status === "fulfilled") this.tex[k] = texRes[i].value; });
    this.models = {};
    const modelKeys = Object.keys(MODELS);
    const modelRes = await Promise.allSettled(modelKeys.map((k) => gl.loadAsync(CDN + MODELS[k].file)));
    modelKeys.forEach((k, i) => { if (modelRes[i].status === "fulfilled") this.models[k] = modelRes[i].value; });
    const missing = [...texKeys.filter((k, i) => texRes[i].status !== "fulfilled"), ...modelKeys.filter((k, i) => modelRes[i].status !== "fulfilled")];
    // Pueblo de tierra modelado en Blender (blender/aldea_tierra.py → models/aldea_tierra.glb)
    try { this.models.aldea = await gl.loadAsync(new URL("./models/aldea_tierra.glb", import.meta.url).href); }
    catch (e) { console.warn("Sin diorama de tierra", e); missing.push("aldea_tierra"); }
    // Pueblos diseñados en el editor (editor.html): models/pueblo_<elemento>.json o guardado del navegador
    this.layouts = await loadLayouts();
    await this.loadCustomModels();
    this.status = missing.length ? `listo (faltan: ${missing.join(", ")})` : "listo";
    this.ready = true;
    // Si se guarda un pueblo en el editor (otra pestaña), se rearma en vivo
    if (typeof window !== "undefined") window.addEventListener("storage", (e) => {
      if (!e.key || !e.key.startsWith(LAYOUT_PREFIX)) return;
      loadLayouts().then(async (L) => { this.layouts = L; await this.loadCustomModels(); this.clear(); });
    });
  }

  // Modelos .glb propios usados como piezas en los pueblos (ruta relativa al proyecto, p. ej. "models/casa.glb")
  async loadCustomModels(layouts = this.layouts) {
    this.custom = this.custom || {};
    const srcs = new Set();
    for (const L of Object.values(layouts || {})) for (const p of L.pieces || []) if (p.kind === "glb" && p.src) srcs.add(p.src);
    const gl = new GLTFLoader();
    await Promise.all([...srcs].filter((s) => !this.custom[s]).map((s) =>
      gl.loadAsync(new URL("./" + s, import.meta.url).href).then((g) => { this.custom[s] = g; }).catch((e) => console.warn("No se pudo cargar", s, e))));
  }

  // pitch = cuánto mira hacia abajo la cámara (en grados), como una webcam real
  setSize(W, H, pitch = 12) {
    if (W === this.W && H === this.H && pitch === this.pitch) return;
    this.W = W; this.H = H; this.pitch = pitch;
    this.camera.aspect = W / H;
    this.camera.rotation.set(-THREE.MathUtils.degToRad(pitch), 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.occluder.scale.set(this.D * 6, this.D * 6, 1);
    this.occluder.position.set(0, 0, -this.D);
    this.applyRenderSize();
  }

  // Calidad: escala de resolución del 3D (se dibuja más chico y se estira) y tamaño de las sombras (0 = sin sombras)
  setQuality(scale = 1, shadowSize = 2048) {
    if (scale !== this.rs) { this.rs = scale; this.applyRenderSize(); }
    if (shadowSize !== this.shadowSize) {
      this.shadowSize = shadowSize;
      if (shadowSize > 0) {
        this.sun.shadow.mapSize.set(shadowSize, shadowSize);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  applyRenderSize() {
    if (!this.W) return;
    const s = this.rs ?? 1;
    const rw = Math.max(2, Math.round(this.W * s)), rh = Math.max(2, Math.round(this.H * s));
    this.renderer.setSize(rw, rh, false);
    this.occMat.uniforms.res.value.set(rw, rh);
    const scale = rh / (2 * Math.tan(THREE.MathUtils.degToRad(this.fov / 2)));
    for (const p of Object.values(this.fx)) p.mat.uniforms.scale.value = scale;
  }

  // Píxel de la imagen → punto 3D del plano vertical de la persona (z = -D)
  toWorld(px, py, dz = 0) {
    const ndc = V((px / this.W) * 2 - 1, -(py / this.H) * 2 + 1, 0.5).unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    const t = (-this.D + dz - this.camera.position.z) / dir.z;
    return this.camera.position.clone().addScaledVector(dir, t);
  }
  // Unidades del mundo por píxel alrededor de un punto de la imagen
  unitsPerPx(px, py) {
    return this.toWorld(px, py).distanceTo(this.toWorld(px + 100, py)) / 100;
  }

  instModel(key, size, opts = {}) {
    const g = this.models?.[key];
    if (!g) return null;
    const inner = SkeletonUtils.clone(g.scene);
    inner.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      if (opts.material) { o.material = opts.material; return; }
      o.material = o.material.clone();
      if (opts.tint) o.material.color.multiply(new THREE.Color(opts.tint));
      if (opts.emissive) { o.material.emissive = new THREE.Color(opts.emissive); o.material.emissiveIntensity = opts.emissiveIntensity ?? 1; }
      if (opts.roughness != null) o.material.roughness = opts.roughness;
    });
    // Medida real del modelo (con esqueleto aplicado), calculada una vez por modelo
    if (!g.userData.norm) {
      inner.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inner, true);
      g.userData.norm = { sz: box.getSize(V()), c: box.getCenter(V()), minY: box.min.y };
    }
    const { sz, c, minY } = g.userData.norm;
    const k = size / Math.max(sz.x, sz.y, sz.z);
    inner.scale.multiplyScalar(k);
    inner.position.set(-c.x * k, -minY * k, -c.z * k);
    const turn = new THREE.Group();
    turn.rotation.y = MODELS[key].yaw;
    turn.add(inner);
    const obj = new THREE.Group();
    obj.add(turn);
    const mixer = new THREE.AnimationMixer(inner);
    const actions = {};
    for (const clip of g.animations) actions[clip.name] = mixer.clipAction(clip);
    const m = { obj, mixer, actions, anim: null };
    m.play = (name, fade = 0.3) => {
      const target = name && actions[name] ? name : Object.keys(actions)[0];
      if (!target || m.anim === target) return;
      if (m.anim) actions[m.anim].fadeOut(fade);
      actions[target].reset().fadeIn(fade).play();
      actions[target].time = rand(0, actions[target].getClip().duration);
      m.anim = target;
    };
    return m;
  }

  // Sincroniza un reino por persona y avanza la animación
  update(dt, tracks, opts) {
    if (!this.ready || !this.W) return;
    const alive = new Set();
    for (const t of tracks) {
      alive.add(t.id);
      let realm = this.realms.get(t.id);
      if (!realm || realm.element !== t.element) {
        realm?.dispose();
        realm = new Realm(this, t.element);
        this.realms.set(t.id, realm);
      }
      realm.update(dt, t, opts);
    }
    for (const [id, realm] of this.realms) if (!alive.has(id)) { realm.dispose(); this.realms.delete(id); }

    // El sol sigue al primer reino para que sus sombras se vean nítidas
    const first = this.realms.values().next().value;
    this.sun.castShadow = !!opts.shadow && this.shadowSize !== 0;
    if (first) {
      const F = first.root.position, R = first.Rw;
      this.sun.position.set(F.x - R * 2.2, F.y + R * 5, F.z + R * 3);
      this.sun.target.position.copy(F);
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -R * 1.8; cam.right = cam.top = R * 1.8;
      cam.near = 0.1; cam.far = R * 14;
      cam.updateProjectionMatrix();
    }
    for (const p of Object.values(this.fx)) p.update(dt);
  }

  render(maskCanvas) {
    if (maskCanvas && maskCanvas.width) {
      if (!this.maskTex || this.maskTex.image.width !== maskCanvas.width || this.maskTex.image.height !== maskCanvas.height) {
        this.maskTex?.dispose();
        this.maskTex = new THREE.CanvasTexture(maskCanvas);
        this.occMat.uniforms.mask.value = this.maskTex;
      }
      this.maskTex.needsUpdate = true;
      this.occluder.visible = true;
    }
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }

  clear() {
    for (const realm of this.realms.values()) realm.dispose();
    this.realms.clear();
    for (const p of Object.values(this.fx)) p.clear();
  }
}

// ===========================================================================
// Estilos de pueblo por elemento
// ===========================================================================
const STYLE = {
  tierra: {
    kinds: [["windmill", 0.3], ["barn", 0.27], ["house", 0.22], ["house", 0.2], ["house", 0.21], ["tree", 0.2], ["tree", 0.18], ["tree", 0.22], ["well", 0.1]],
    villagerTint: 0xb89a7a, light: 0xffd9a0, lamp: "lantern",
  },
  fuego: {
    kinds: [["forge", 0.26], ["watchtower", 0.3], ["house", 0.22], ["house", 0.2], ["house", 0.21]],
    villagerTint: 0x8a4a3a, light: 0xff6a20, lamp: "brazier",
  },
  agua: {
    kinds: [["lighthouse", 0.34], ["house", 0.22], ["house", 0.2], ["house", 0.21], ["house", 0.2]],
    villagerTint: 0x7a9ab0, light: 0x60b8ff, lamp: "lantern",
  },
  aire: {
    kinds: [["spire", 0.32], ["spire", 0.28], ["windmill", 0.3], ["house", 0.2], ["house", 0.21]],
    villagerTint: 0xe0e6f0, light: 0xcfe8ff, lamp: "crystal",
  },
};

// ===========================================================================
// Un reino (una persona)
// ===========================================================================
class Realm {
  constructor(R3, element) {
    this.R3 = R3;
    this.element = element;
    this.style = STYLE[element];
    this.time = 0;
    this.grow = 0;
    this.Rw = 1;
    this.root = new THREE.Group();   // piso del reino (escala = radio del círculo)
    this.body = new THREE.Group();   // cosas sobre/alrededor del cuerpo (coordenadas de mundo)
    R3.scene.add(this.root, this.body);
    this.movers = [];
    this.disposables = [];
    this.emitters = [];
    this.layout = R3.layouts?.[element] || defaultLayout(element, R3);
    this.diorama = this.layout.pieces.some((p) => p.kind === "aldea"); // pueblo grande que pasa del círculo
    this.waterMats = [];
    this.makeMaterials();
    this.buildGround();
    this.buildTown();
    CREATURES[element](this);
    this.buildBodyUnion();

    this.light = new THREE.PointLight(this.style.light, 0, 0, 2);
    this.light.position.set(0, 0.5, 0.2);
    this.root.add(this.light);
  }

  // ---------- Materiales ----------
  makeMaterials() {
    const T = this.R3.tex, el = this.element;
    const tex = (t, rx = 1, ry = 1) => { if (!t) return null; const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; this.disposables.push(c); return c; };
    const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); this.disposables.push(m); return m; };
    const M = (this.mat = {});
    M.wood = mat({ map: tex(T.wood, 1, 1), color: 0x9b8466, roughness: 0.85 });
    M.darkWood = mat({ map: tex(T.wood, 1, 1), color: 0x4a3626, roughness: 0.9 });
    M.stone = mat({ map: tex(T.brick, 1, 1), color: el === "fuego" ? 0x4a4550 : el === "aire" ? 0xf0f0f4 : 0xb8ad9a, roughness: 0.95 });
    M.window = mat({ color: 0x221a10, emissive: el === "fuego" ? 0xff7a1a : 0xffc070, emissiveIntensity: el === "fuego" ? 3 : 2.2, roughness: 0.4 });
    M.door = mat({ map: tex(T.wood, 0.5, 1), color: 0x5a3d26, roughness: 0.9 });
    M.metal = mat({ color: 0x2a2624, roughness: 0.5, metalness: 0.8 });
    M.cloth = mat({ color: 0xe8dcc4, roughness: 1, side: THREE.DoubleSide });
    M.flag = mat({ color: 0xb3261e, roughness: 0.9, side: THREE.DoubleSide });
    M.glow = mat({ color: 0x000000, emissive: 0xffc070, emissiveIntensity: 3 });
    if (el === "tierra") {
      M.wall = mat({ map: tex(T.timber, 1, 1), roughness: 0.95 });
      M.roof = mat({ map: tex(T.tiles, 2, 2), color: 0x8a4428, roughness: 0.8 });
    } else if (el === "fuego") {
      M.wall = mat({ map: tex(T.brick, 1, 1), color: 0x4d4852, roughness: 0.95 });
      M.roof = mat({ map: tex(T.tiles, 2, 2), color: 0x2a2730, roughness: 0.7 });
    } else if (el === "agua") {
      M.wall = mat({ map: tex(T.wood, 1, 1), color: 0x8d7a60, roughness: 0.9 });
      M.roof = mat({ map: tex(T.tiles, 2, 2), color: 0x4a5c68, roughness: 0.6 });
    } else {
      M.wall = mat({ map: tex(T.marble, 1, 1), roughness: 0.4 });
      M.roof = mat({ map: tex(T.tiles, 2, 2), color: 0x3f6190, roughness: 0.5, metalness: 0.1 });
    }
    M.plaza = {
      tierra: () => mat({ map: tex(T.brick, 3, 3), color: 0x9a907f, roughness: 1 }),
      fuego: () => mat({ map: tex(T.brick, 3, 3), color: 0x2e2a30, roughness: 0.6 }),
      agua: () => mat({ map: tex(T.wood, 2, 2), color: 0x8a6a48, roughness: 0.85 }),
      aire: () => mat({ map: tex(T.marble, 2, 2), roughness: 0.35 }),
    }[el]();
    this.texFn = tex;
    this.matFn = mat;
  }

  geo(g) { this.disposables.push(g); return g; }
  mesh(g, m, shadow = true) {
    const o = new THREE.Mesh(this.geo(g), m);
    o.castShadow = shadow; o.receiveShadow = true;
    return o;
  }

  // ---------- Piso ----------
  buildGround() {
    const T = this.R3.tex, el = this.element, M = this.mat;
    if (this.layout.ground === false) {
      const blobMat = new THREE.MeshBasicMaterial({ map: T.dot, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
      this.disposables.push(blobMat);
      const blob = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2)), blobMat);
      blob.position.y = 0.012;
      this.root.add(blob);
      this.emitters.push((dt) => this.spawnAmbient(dt, 5, (p) => {
        this.R3.fx.spark.emit(p.add(V(0, 0.05 * this.Rw, 0)), V(rand(-0.03, 0.03), rand(0.05, 0.15), 0).multiplyScalar(this.Rw), { dur: rand(2, 4), size: this.Rw * 0.01, c0: [0.6, 1, 0.5], c1: [0.3, 0.8, 0.3] });
      }));
      return;
    }
    const disc = this.geo(new THREE.CircleGeometry(1.05, 72).rotateX(-Math.PI / 2));
    let mat;
    if (el === "fuego") {
      mat = this.matFn({ map: this.texFn(T.lava, 3, 3), color: 0x3a2a24, emissive: 0xff4a10, emissiveMap: this.texFn(T.lava, 3, 3), emissiveIntensity: 1.2, roughness: 0.85, alphaMap: T.fade, transparent: true });
    } else if (el === "agua") {
      mat = this.matFn({ color: 0x0c4a66, roughness: 0.06, metalness: 0.15, normalMap: this.texFn(T.water, 3, 3), normalScale: new THREE.Vector2(0.7, 0.7), alphaMap: T.fade, transparent: true, opacity: 0.92, envMapIntensity: 1.6 });
    } else if (el === "tierra") {
      mat = this.matFn({ map: this.texFn(T.grass, 3, 3), color: 0xc8dca8, roughness: 1, alphaMap: T.fade, transparent: true });
    } else {
      mat = this.matFn({ color: 0xf4f8ff, roughness: 1, emissive: 0x334455, emissiveIntensity: 0.25, alphaMap: T.fade, transparent: true, opacity: 0.6 });
    }
    this.groundMat = mat;
    const ground = new THREE.Mesh(disc, mat);
    ground.receiveShadow = true;
    ground.renderOrder = 1;
    this.root.add(ground);

    // Sombras sobre el piso real (fuera del disco)
    const catcherMat = new THREE.ShadowMaterial({ opacity: 0.4 });
    this.disposables.push(catcherMat);
    const catcher = new THREE.Mesh(this.geo(new THREE.CircleGeometry(1.8, 48).rotateX(-Math.PI / 2)), catcherMat);
    catcher.position.y = -0.002;
    catcher.receiveShadow = true;
    this.root.add(catcher);

    // Sombra de contacto de la persona
    const blobMat = new THREE.MeshBasicMaterial({ map: T.dot, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
    this.disposables.push(blobMat);
    const blob = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(0.75, 0.75).rotateX(-Math.PI / 2)), blobMat);
    blob.position.y = 0.006;
    this.root.add(blob);

    // Detalles del piso
    if (el === "tierra") this.addGrass(650);
    if (el === "aire") this.addClouds();
    const rockMat = this.matFn({
      color: { fuego: 0x15121a, agua: 0x2a3438, tierra: 0x6e675c, aire: 0xd8d6d0 }[el],
      roughness: { fuego: 0.25, agua: 0.2, tierra: 0.95, aire: 0.8 }[el], metalness: el === "fuego" ? 0.3 : 0, flatShading: true,
    });
    for (let i = 0; i < 7; i++) {
      const a = rand(0, TAU), r = rand(0.55, 0.98);
      const rock = this.mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
      rock.scale.set(rand(0.025, 0.06), rand(0.02, 0.05), rand(0.025, 0.06));
      rock.position.set(Math.cos(a) * r, 0.01, Math.sin(a) * r);
      rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      this.root.add(rock);
    }
    if (el === "fuego") this.emitters.push((dt) => this.spawnAmbient(dt, 16, (p) => {
      this.R3.fx.spark.emit(p, V(rand(-0.05, 0.05), rand(0.3, 0.7), 0).multiplyScalar(this.Rw), { dur: rand(1, 2.2), size: this.Rw * 0.012, ...EMBER });
    }));
    if (el === "tierra") this.emitters.push((dt) => this.spawnAmbient(dt, 6, (p) => {
      this.R3.fx.spark.emit(p, V(rand(-0.03, 0.03), rand(0.05, 0.15), 0).multiplyScalar(this.Rw), { dur: rand(2, 4), size: this.Rw * 0.01, c0: [0.6, 1, 0.5], c1: [0.3, 0.8, 0.3] });
    }));
  }

  spawnAmbient(dt, rate, fn) {
    this._amb = (this._amb || 0) + rate * dt;
    while (this._amb >= 1) {
      this._amb--;
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * 0.95;
      fn(this.root.localToWorld(V(Math.cos(a) * r, 0.01, Math.sin(a) * r)));
    }
  }

  addGrass(n) {
    const g = this.geo(new THREE.PlaneGeometry(0.008, 0.045).translate(0, 0.0225, 0));
    const m = this.matFn({ color: 0x5f8a36, roughness: 1, side: THREE.DoubleSide });
    const inst = new THREE.InstancedMesh(g, m, n);
    const d = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), r = Math.sqrt(rand(0.13, 0.95));
      d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      d.rotation.set(rand(-0.25, 0.25), rand(0, TAU), rand(-0.25, 0.25));
      d.scale.setScalar(rand(0.6, 1.4));
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
      inst.setColorAt(i, col.setHSL(rand(0.22, 0.3), rand(0.35, 0.55), rand(0.22, 0.38)));
    }
    inst.receiveShadow = true;
    this.root.add(inst);
  }

  addClouds() {
    const T = this.R3.tex;
    for (let i = 0; i < 22; i++) {
      const sm = new THREE.SpriteMaterial({ map: T.puff, color: 0xffffff, transparent: true, opacity: rand(0.5, 0.85), depthWrite: false });
      this.disposables.push(sm);
      const s = new THREE.Sprite(sm);
      const a = (i / 22) * TAU + rand(-0.1, 0.1), r = rand(0.55, 1.05);
      const sc = rand(0.35, 0.6);
      s.scale.setScalar(sc);
      s.position.set(Math.cos(a) * r, sc * 0.5, Math.sin(a) * r); // flota sobre el piso, sin cortarse
      this.root.add(s);
      const st = { a, r, sp: rand(0.05, 0.12) };
      this.movers.push((dt) => { st.a += st.sp * dt; s.position.x = Math.cos(st.a) * st.r; s.position.z = Math.sin(st.a) * st.r; });
    }
  }

  // ---------- Pueblo (se arma desde un "plano": ver defaultLayout / editor.html) ----------
  buildTown() {
    const L = this.layout, plazaR = L.plazaR ?? 0.34;
    this.buildings = [];
    if (L.plaza !== false) this.addPlaza(plazaR);
    for (const p of L.pieces) {
      const obj = makePiece(this, p);
      if (!obj) continue;
      placePiece(obj, p);
      this.root.add(obj);
      this.buildings.push({ ...p, size: p.size ?? PIECES[p.kind]?.size ?? 0.2, obj });
    }
    // El reino todavía está en el origen con escala 1: mundo = coordenadas del reino
    this.root.updateMatrixWorld(true);
    const homes = this.addRoads(this.buildings, L, this.root);
    for (const b of this.buildings) for (const d of b.obj.userData.doors || []) {
      const p = d.getWorldPosition(V());
      p.y = 0;
      homes.push({ door: p, plaza: V(p.x, 0, p.z).normalize().multiplyScalar(Math.max(0.1, plazaR - 0.07)) });
    }
    // Aldeanos: salen de cada puerta y caminan hacia la plaza (donde está la persona)
    this.villagers = [];
    if (!homes.length) return;
    const n = L.villagers ?? Math.min(this.diorama ? 7 : 6, homes.length + 1);
    for (let i = 0; i < n; i++) {
      const m = this.R3.instModel("soldier", this.diorama ? 0.07 : 0.08, { tint: this.style.villagerTint });
      if (!m) break;
      m.play("Idle");
      this.root.add(m.obj);
      this.villagers.push({ m, home: homes[i % homes.length], state: "home", timer: rand(0.3, 4), t: 0, pos: 0, blend: 0 });
    }
  }

  addPlaza(plazaR, parent = this.root) {
    const plaza = new THREE.Mesh(this.geo(new THREE.CircleGeometry(plazaR, 48).rotateX(-Math.PI / 2)), this.mat.plaza);
    plaza.position.y = 0.004;
    plaza.receiveShadow = true;
    parent.add(plaza);
    if (this.element === "fuego") {
      const ringMat = this.matFn({ color: 0x220800, emissive: 0xff5a10, emissiveIntensity: 2.5 });
      const ring = new THREE.Mesh(this.geo(new THREE.TorusGeometry(plazaR, 0.012, 8, 64).rotateX(-Math.PI / 2)), ringMat);
      ring.position.y = 0.006;
      parent.add(ring);
      this.lavaRing = ringMat;
    }
  }

  // Caminos desde cada edificio (con "camino") hasta la plaza, con farolas. Devuelve las casas para los aldeanos.
  addRoads(list, L, parent = this.root) {
    const homes = [], plazaR = L.plazaR ?? 0.34;
    for (const b of list) {
      if (!b.road) continue;
      const len = Math.hypot(b.x, b.z);
      if (len < 1e-3) continue;
      const ux = b.x / len, uz = b.z / len;
      const start = len - b.size * 0.45, end = plazaR - 0.02;
      const Lr = start - end;
      if (Lr <= 0.02) continue;
      homes.push({ door: V(ux * start, 0, uz * start), plaza: V(ux * (plazaR - 0.04), 0, uz * (plazaR - 0.04)) });
      if (L.roads === false) continue;
      const road = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(0.075, Lr).rotateX(-Math.PI / 2)), this.mat.plaza);
      road.position.set(ux * (start + end) / 2, 0.003, uz * (start + end) / 2);
      road.rotation.y = Math.atan2(ux, uz);
      road.receiveShadow = true;
      parent.add(road);
      if (L.lamps === false) continue;
      const lamp = LAMP[this.style.lamp](this);
      lamp.position.set(ux * (start + end) / 2 - uz * 0.07, 0, uz * (start + end) / 2 + ux * 0.07);
      parent.add(lamp);
    }
    return homes;
  }

  // Animación de materiales (lava que late, agua que corre)
  animateMaterials() {
    if (this.element === "fuego") {
      if (this.groundMat) this.groundMat.emissiveIntensity = 1.0 + 0.4 * Math.sin(this.time * 2);
      if (this.lavaRing) this.lavaRing.emissiveIntensity = 2 + Math.sin(this.time * 3);
    }
    for (const m of this.waterMats) m.normalMap?.offset.set(this.time * 0.03, -this.time * 0.08);
    if (this.element === "agua" && this.groundMat?.normalMap) {
      this.groundMat.normalMap.offset.set(this.time * 0.02, this.time * 0.013);
    }
  }

  // ---------- Unión con la persona ----------
  buildBodyUnion() {
    const el = this.element;
    const M = {
      tierra: this.matFn({ color: 0x3d5a24, roughness: 0.9 }),
      fuego: this.matFn({ color: 0x1a0a05, emissive: 0xff5a10, emissiveIntensity: 3, roughness: 0.6 }),
      agua: this.matFn({ color: 0x5ec8ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, emissive: 0x0a3a6a, emissiveIntensity: 0.6, envMapIntensity: 2 }),
      aire: new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.35, ...ADD, depthWrite: false }),
    }[el];
    if (el === "aire") this.disposables.push(M);
    this.growthMat = M;
    const strands = el === "agua" || el === "aire" ? 2 : 1;
    this.tubes = [];
    for (let leg = 0; leg < 2; leg++) for (let s = 0; s < strands; s++) {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), M);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.userData = { leg, phase: s * Math.PI };
      this.body.add(mesh);
      this.tubes.push(mesh);
    }
    if (el === "tierra") {
      const lm = this.matFn({ map: this.R3.tex.leaf, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
      this.leaves = new THREE.InstancedMesh(this.geo(new THREE.PlaneGeometry(1, 1)), lm, 60);
      this.leaves.frustumCulled = false;
      this.body.add(this.leaves);
    }

    // Casas sobre los hombros
    this.shoulderHouses = [0, 1].map(() => {
      const g = new THREE.Group();
      const baseMat = el === "aire" ? this.matFn({ color: 0xffffff, roughness: 1 }) : el === "agua" ? this.mat.wood : el === "fuego" ? this.matFn({ color: 0x15121a, roughness: 0.4 }) : this.matFn({ map: this.texFn(this.R3.tex.grass, 0.5, 0.5), roughness: 1 });
      const base = this.mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.05, 20), baseMat);
      base.position.y = -0.025;
      g.add(base);
      const house = BUILD.house(this, 0.22, { small: true });
      g.add(house);
      g.userData.chimney = house.userData.chimney;
      g.visible = false;
      this.body.add(g);
      return g;
    });

    // Orbe del elemento en la mano derecha
    this.orb = ORB[el](this);
    this.orb.visible = false;
    this.body.add(this.orb);
  }

  // ===========================================================================
  update(dt, t, opts) {
    const R3 = this.R3;
    this.time += dt;
    const F = R3.toWorld(t.x, t.y);
    const Rw = (this.Rw = Math.max(0.2, t.w * opts.ringSize * R3.unitsPerPx(t.x, t.y)));
    this.root.position.copy(F);
    this.root.scale.setScalar(Rw);
    const vis = t.alpha > 0.05;
    this.root.visible = this.body.visible = vis;

    // Ancla del cuerpo en 3D
    let A;
    if (t.body) {
      const pts = t.body.map((p) => R3.toWorld(p.x, p.y));
      const S = Math.max(pts[11].distanceTo(pts[12]), Rw * 0.35);
      const C = pts[11].clone().add(pts[12]).add(pts[23]).add(pts[24]).multiplyScalar(0.25);
      const top = Math.max(pts[0].y, (pts[11].y + pts[12].y) / 2 + S * 0.5);
      A = { pts, S, C, top, bottom: F.y, z: F.z };
    } else {
      const S = Rw * 0.6;
      A = { pts: null, S, C: V(F.x, F.y + S * 2.4, F.z), top: F.y + S * 4, bottom: F.y, z: F.z };
    }
    this.A = A;
    this.grow = clamp01(this.grow + (A.pts ? dt / 5 : -dt / 2));

    // Luz del reino
    const flick = this.element === "fuego" ? 0.75 + 0.25 * Math.sin(this.time * 13) * Math.sin(this.time * 7.1) : 1;
    this.light.intensity = opts.light ? 9 * Rw * Rw * flick : 0;
    this.light.distance = Rw * 6;
    this.animateMaterials();
    for (const m of this.movers) m(dt);
    for (const e of this.emitters) e(dt);
    for (const v of this.villagers) this.updateVillager(v, dt);
    if (vis) this.updateBodyUnion(dt);
  }

  // ---------- Aldeanos: caminan a la plaza, miran a la persona y algunos suben a sus hombros ----------
  updateVillager(v, dt) {
    const A = this.A, b = v.home, m = v.m;
    const speed = 0.11, L = b.door.distanceTo(b.plaza);
    const onBody = ["climb", "perch", "down", "unblend"].includes(v.state);
    if (onBody && !A.pts) { v.state = "back"; v.blend = 0; }
    switch (v.state) {
      case "home":
        m.play("Idle"); v.t = 0;
        if ((v.timer -= dt) <= 0) v.state = "out";
        break;
      case "out":
        m.play("Walk");
        v.t = Math.min(1, v.t + (speed * dt) / L);
        if (v.t >= 1) {
          if (A.pts && this.grow > 0.85 && Math.random() < 0.55) {
            const p = this.root.localToWorld(b.plaza.clone());
            v.leg = Math.abs(A.pts[27].x - p.x) < Math.abs(A.pts[28].x - p.x) ? 0 : 1;
            v.state = "climb"; v.pos = 0; v.blend = 0;
          } else { v.state = "gaze"; v.timer = rand(2, 4); }
        }
        break;
      case "gaze":
        m.play("Idle");
        if ((v.timer -= dt) <= 0) v.state = "back";
        break;
      case "back":
        m.play("Walk");
        v.t = Math.max(0, v.t - (speed * dt) / L);
        if (v.t <= 0) { v.state = "home"; v.timer = rand(2, 7); }
        break;
      case "climb":
        m.play("Walk");
        v.blend = Math.min(1, v.blend + dt * 1.2);
        if (v.blend >= 1) { v.pos = Math.min(3, v.pos + dt * 0.35); if (v.pos >= 3) { v.state = "perch"; v.timer = rand(3, 6); } }
        break;
      case "perch":
        m.play("Idle");
        if ((v.timer -= dt) <= 0) v.state = "down";
        break;
      case "down":
        m.play("Walk");
        v.pos = Math.max(0, v.pos - dt * 0.4);
        if (v.pos <= 0) v.state = "unblend";
        break;
      case "unblend":
        v.blend = Math.max(0, v.blend - dt * 1.2);
        if (v.blend <= 0) v.state = "back";
        break;
    }
    m.mixer.update(dt);

    const local = b.door.clone().lerp(b.plaza, v.t);
    if (v.blend > 0 && A.pts) {
      if (m.obj.parent !== this.body) this.body.attach(m.obj);
      const ground = this.root.localToWorld(local.clone());
      const ids = LEGS[v.leg], i = Math.min(Math.floor(v.pos), 2), f = v.pos - i;
      const onLeg = A.pts[ids[i]].clone().lerp(A.pts[ids[i + 1]], f);
      onLeg.z = A.z + A.S * 0.14;
      m.obj.position.copy(ground.lerp(onLeg, v.blend));
      m.obj.rotation.set(0, 0, 0); // de frente a la cámara mientras trepa
      m.obj.scale.setScalar(this.Rw);
    } else {
      if (m.obj.parent !== this.root) this.root.attach(m.obj);
      m.obj.position.copy(local);
      m.obj.scale.setScalar(1);
      const dir = v.state === "back" ? b.door.clone().sub(b.plaza) : b.plaza.clone().sub(b.door);
      m.obj.rotation.y = v.state === "gaze" ? Math.atan2(-local.x, -local.z) : Math.atan2(dir.x, dir.z);
    }
  }

  // ---------- El reino creciendo por el cuerpo ----------
  updateBodyUnion(dt) {
    const A = this.A, el = this.element;
    const on = !!A.pts && this.grow > 0.01;
    for (const tb of this.tubes) tb.visible = on;
    if (this.leaves) this.leaves.visible = on;
    for (const h of this.shoulderHouses) h.visible = on;
    this.orb.visible = on;
    if (!on) return;
    const S = A.S, g = easeOut(this.grow);

    // Enredaderas / venas de lava / corrientes de agua / cintas de viento enroscadas en las piernas
    let leafI = 0;
    const dObj = new THREE.Object3D();
    for (const tb of this.tubes) {
      const ids = LEGS[tb.userData.leg];
      const N = 36, pts = [];
      const upto = Math.max(3, Math.floor(N * g));
      const spin = el === "aire" ? -this.time * 3 : el === "agua" ? this.time * 0.6 : 0;
      for (let k = 0; k <= upto; k++) {
        const tt = (k / N) * (ids.length - 1), i = Math.min(Math.floor(tt), ids.length - 2), f = tt - i;
        const p = A.pts[ids[i]].clone().lerp(A.pts[ids[i + 1]], f);
        const th = k * (el === "aire" ? 0.45 : 0.55) + tb.userData.phase + spin;
        const rad = S * (el === "aire" ? 0.2 : 0.13);
        p.x += Math.cos(th) * rad;
        p.z = A.z + Math.sin(th) * rad;
        pts.push(p);
      }
      tb.geometry.dispose();
      const radius = S * { tierra: 0.018, fuego: 0.014, agua: 0.028, aire: 0.01 }[el];
      tb.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), upto * 2, radius, 6, false);
      if (this.leaves) {
        pts.forEach((p, k) => {
          if (k % 2 || leafI >= 60) return;
          dObj.position.copy(p);
          dObj.rotation.set(rand(-0.3, 0.3) + k, k * 1.3, Math.sin(this.time * 2 + k) * 0.3);
          dObj.scale.setScalar(S * 0.08);
          dObj.updateMatrix();
          this.leaves.setMatrixAt(leafI++, dObj.matrix);
        });
      }
      if (el === "fuego" && Math.random() < dt * 20) {
        const p = pick(pts);
        this.R3.fx.spark.emit(p, V(rand(-0.1, 0.1), rand(0.2, 0.5), 0).multiplyScalar(S), { dur: rand(0.5, 1), size: S * 0.02, ...EMBER });
      }
      if (el === "agua" && Math.random() < dt * 8) {
        const p = pick(pts);
        this.R3.fx.water.emit(p, V(rand(-0.1, 0.1), rand(0.1, 0.3), 0).multiplyScalar(S), { dur: rand(0.6, 1), size: S * 0.025, c0: [0.8, 0.95, 1], alpha: 0.8 });
      }
    }
    if (this.leaves) { this.leaves.count = leafI; this.leaves.instanceMatrix.needsUpdate = true; }
    if (el === "fuego") this.growthMat.emissiveIntensity = 2.5 + Math.sin(this.time * 3) * 1;

    // Casas sobre los hombros
    const [Lp, Rp] = A.pts[11].x < A.pts[12].x ? [A.pts[11], A.pts[12]] : [A.pts[12], A.pts[11]];
    const tilt = Math.atan2(Rp.y - Lp.y, Rp.x - Lp.x);
    const k = easeOut(clamp01(this.grow * 1.3 - 0.2));
    [11, 12].forEach((idx, j) => {
      const h = this.shoulderHouses[j], sh = A.pts[idx];
      const out = Math.sign(sh.x - A.C.x) || 1;
      h.position.set(sh.x + out * S * 0.16, sh.y + S * 0.02, A.z + S * 0.02);
      h.rotation.set(0, out * 0.5, tilt);
      h.scale.setScalar(Math.max(0.001, S * 0.9 * k));
      if (k > 0.6 && h.userData.chimney && Math.random() < dt * 2) {
        const p = h.localToWorld(h.userData.chimney.clone());
        this.R3.fx.smoke.emit(p, V(0.05, 0.25, 0).multiplyScalar(S), { dur: rand(1.6, 2.6), size: S * 0.12, grow: 2, c0: this.element === "fuego" ? [0.25, 0.22, 0.2] : [0.8, 0.8, 0.8], alpha: 0.5 });
      }
    });

    // Orbe en la mano derecha
    const wr = A.pts[16], elb = A.pts[14];
    const dir = wr.clone().sub(elb).normalize();
    this.orb.position.copy(wr).addScaledVector(dir, S * 0.22);
    this.orb.position.y += S * 0.08;
    this.orb.position.z = A.z + S * 0.25;
    this.orb.scale.setScalar(Math.max(0.001, S * 0.17 * g));
    this.orb.userData.update?.(dt, this);
  }

  dispose() {
    this.R3.scene.remove(this.root, this.body);
    this.root.traverse((o) => { if (o.geometry && !this.disposables.includes(o.geometry)) o.geometry.dispose(); });
    for (const tb of this.tubes) tb.geometry.dispose();
    for (const d of this.disposables) d.dispose?.();
    this.root.traverse((o) => { if (o.isMesh && o.material && o.material !== this.groundMat) o.material.dispose?.(); });
  }
}

// ===========================================================================
// Edificios (unidades del reino: radio del círculo = 1)
// ===========================================================================
const BUILD = {
  house(R, size, opts = {}) {
    const M = R.mat, el = R.element, g = new THREE.Group();
    const w = size, d = size * 0.85, h = size * 0.75, rh = size * 0.55;
    const stilts = el === "agua" && !opts.small ? size * 0.4 : 0;
    if (stilts) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const post = R.mesh(new THREE.CylinderGeometry(size * 0.025, size * 0.025, stilts, 6), M.darkWood);
        post.position.set(sx * w * 0.42, stilts / 2, sz * d * 0.42);
        g.add(post);
      }
      const deck = R.mesh(new THREE.BoxGeometry(w * 1.2, size * 0.04, d * 1.2), M.wood);
      deck.position.y = stilts;
      g.add(deck);
    }
    const y0 = stilts;
    const base = R.mesh(new THREE.BoxGeometry(w * 1.04, size * 0.08, d * 1.04), M.stone);
    base.position.y = y0 + size * 0.04;
    g.add(base);
    const walls = R.mesh(new THREE.BoxGeometry(w, h, d), M.wall);
    walls.position.y = y0 + h / 2;
    g.add(walls);
    // Techo a dos aguas: un prisma triangular
    const roof = R.mesh(new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateX(-Math.PI / 2), M.roof);
    roof.scale.set((w * 1.18) / 1.732, rh / 1.5, d * 1.12);
    roof.position.y = y0 + h + rh / 3;
    g.add(roof);
    // Ventanas iluminadas y puerta
    const win = (x, y, z, ry) => {
      const frame = R.mesh(new THREE.BoxGeometry(size * 0.17, size * 0.2, size * 0.02), M.darkWood, false);
      frame.position.set(x, y, z); frame.rotation.y = ry;
      const glass = R.mesh(new THREE.PlaneGeometry(size * 0.13, size * 0.16), M.window, false);
      glass.position.set(x + Math.sin(ry) * size * 0.012, y, z + Math.cos(ry) * size * 0.012); glass.rotation.y = ry;
      g.add(frame, glass);
    };
    win(-w * 0.27, y0 + h * 0.6, d / 2, 0);
    win(w * 0.27, y0 + h * 0.6, d / 2, 0);
    win(w / 2, y0 + h * 0.6, 0, Math.PI / 2);
    win(-w / 2, y0 + h * 0.6, 0, -Math.PI / 2);
    const door = R.mesh(new THREE.BoxGeometry(size * 0.18, size * 0.34, size * 0.02), M.door, false);
    door.position.set(0, y0 + size * 0.17 + size * 0.08, d / 2 + 0.002);
    g.add(door);
    // Chimenea
    if (el !== "aire") {
      const ch = R.mesh(new THREE.BoxGeometry(size * 0.12, size * 0.4, size * 0.12), M.stone);
      ch.position.set(w * 0.25, y0 + h + rh * 0.55, -d * 0.15);
      g.add(ch);
      g.userData.chimney = V(w * 0.25, y0 + h + rh * 0.55 + size * 0.22, -d * 0.15);
      if (!opts.small) R.emitters.push((dt) => {
        if (Math.random() > dt * 1.6) return;
        const p = g.localToWorld(g.userData.chimney.clone());
        R.R3.fx.smoke.emit(p, V(0.03, 0.12, 0).multiplyScalar(R.Rw), { dur: rand(2, 3.2), size: R.Rw * 0.06, grow: 2.5, c0: el === "fuego" ? [0.2, 0.18, 0.17] : [0.75, 0.75, 0.75], alpha: 0.55 });
      });
    }
    return g;
  },

  barn(R, size) {
    const g = BUILD.house(R, size);
    g.scale.set(1.35, 1, 1.1);
    g.traverse((o) => { if (o.isMesh && o.material === R.mat.wall) o.material = R.matFn({ map: R.texFn(R.R3.tex.wood, 1, 1), color: 0x8a3428, roughness: 0.9 }); });
    return g;
  },

  windmill(R, size) {
    const g = new THREE.Group(), M = R.mat;
    const tower = R.mesh(new THREE.CylinderGeometry(size * 0.18, size * 0.3, size, 18), M.stone);
    tower.position.y = size / 2;
    const cap = R.mesh(new THREE.ConeGeometry(size * 0.22, size * 0.25, 18), M.darkWood);
    cap.position.y = size + size * 0.12;
    g.add(tower, cap);
    const door = R.mesh(new THREE.BoxGeometry(size * 0.14, size * 0.24, size * 0.02), M.door, false);
    door.position.set(0, size * 0.12, size * 0.28);
    const win = R.mesh(new THREE.PlaneGeometry(size * 0.08, size * 0.1), M.window, false);
    win.position.set(0, size * 0.6, size * 0.235);
    g.add(door, win);
    const hub = new THREE.Group();
    hub.position.set(0, size * 0.95, size * 0.26);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      const spar = R.mesh(new THREE.BoxGeometry(size * 0.025, size * 0.75, size * 0.02), M.darkWood);
      spar.position.y = size * 0.37;
      const sail = R.mesh(new THREE.PlaneGeometry(size * 0.16, size * 0.55), M.cloth);
      sail.position.set(size * 0.09, size * 0.45, 0.002);
      arm.add(spar, sail);
      hub.add(arm);
    }
    g.add(hub);
    R.movers.push((dt) => { hub.rotation.z += dt * 0.9; });
    return g;
  },

  spire(R, size) {
    const g = new THREE.Group(), M = R.mat;
    const body = R.mesh(new THREE.CylinderGeometry(size * 0.15, size * 0.18, size, 20), M.wall);
    body.position.y = size / 2;
    const ring = R.mesh(new THREE.CylinderGeometry(size * 0.2, size * 0.2, size * 0.04, 20), M.wall);
    ring.position.y = size;
    const cone = R.mesh(new THREE.ConeGeometry(size * 0.2, size * 0.55, 20), M.roof);
    cone.position.y = size + size * 0.29;
    g.add(body, ring, cone);
    for (const y of [0.45, 0.75]) {
      const w = R.mesh(new THREE.PlaneGeometry(size * 0.06, size * 0.12), M.window, false);
      w.position.set(0, size * y, size * 0.165);
      g.add(w);
    }
    const pole = R.mesh(new THREE.CylinderGeometry(size * 0.006, size * 0.006, size * 0.25, 4), M.metal);
    pole.position.y = size * 1.66;
    const flag = R.mesh(new THREE.PlaneGeometry(size * 0.18, size * 0.09), M.flag, false);
    flag.position.set(size * 0.09, size * 1.74, 0);
    g.add(pole, flag);
    R.movers.push(() => { flag.rotation.y = Math.sin(R.time * 3 + size * 40) * 0.4; });
    return g;
  },

  watchtower(R, size) {
    const g = new THREE.Group(), M = R.mat;
    const body = R.mesh(new THREE.BoxGeometry(size * 0.32, size, size * 0.32), M.wall);
    body.position.y = size / 2;
    g.add(body);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const c = R.mesh(new THREE.BoxGeometry(size * 0.08, size * 0.1, size * 0.08), M.wall);
      c.position.set(x * size * 0.14, size + size * 0.05, z * size * 0.14);
      g.add(c);
    }
    for (const y of [0.35, 0.65]) {
      const w = R.mesh(new THREE.PlaneGeometry(size * 0.04, size * 0.12), M.window, false);
      w.position.set(0, size * y, size * 0.162);
      g.add(w);
    }
    const fireLight = new THREE.PointLight(0xff7a20, 0, 0, 2);
    fireLight.position.set(0, size * 1.15, 0);
    g.add(fireLight);
    R.emitters.push((dt) => {
      fireLight.intensity = 2.5 * R.Rw * R.Rw * (0.7 + 0.3 * Math.sin(R.time * 15));
      fireLight.distance = R.Rw * 1.5;
      const n = Math.floor(dt * 40 + Math.random());
      for (let i = 0; i < n; i++) {
        const p = g.localToWorld(V(rand(-0.04, 0.04) * size, size * 1.05, rand(-0.04, 0.04) * size));
        R.R3.fx.fire.emit(p, V(rand(-0.02, 0.02), rand(0.15, 0.3), 0).multiplyScalar(R.Rw), { dur: rand(0.3, 0.6), size: R.Rw * size * 0.25, ...FIRE });
      }
    });
    return g;
  },

  forge(R, size) {
    const g = BUILD.house(R, size);
    const arch = R.mesh(new THREE.PlaneGeometry(size * 0.3, size * 0.3), R.matFn({ color: 0x000000, emissive: 0xff6a10, emissiveIntensity: 4 }), false);
    arch.position.set(-size * 0.25, size * 0.25, size * 0.43);
    g.add(arch);
    R.emitters.push((dt) => {
      arch.material.emissiveIntensity = 3 + 1.5 * Math.sin(R.time * 11) * Math.sin(R.time * 5.3);
      if (Math.random() < dt * 12 && g.userData.chimney) {
        const p = g.localToWorld(g.userData.chimney.clone());
        R.R3.fx.spark.emit(p, V(rand(-0.05, 0.05), rand(0.3, 0.6), 0).multiplyScalar(R.Rw), { dur: rand(0.6, 1.2), size: R.Rw * 0.012, ...EMBER });
      }
    });
    return g;
  },

  lighthouse(R, size) {
    const g = new THREE.Group(), M = R.mat;
    const rock = R.mesh(new THREE.CylinderGeometry(size * 0.3, size * 0.36, size * 0.1, 16), R.matFn({ color: 0x3a4246, roughness: 0.9 }));
    rock.position.y = size * 0.05;
    const stripes = R.texFn(R.R3.tex.stripes, 1, 1);
    const body = R.mesh(new THREE.CylinderGeometry(size * 0.12, size * 0.2, size, 24), R.matFn({ map: stripes, roughness: 0.6 }));
    body.position.y = size * 0.1 + size / 2;
    const gallery = R.mesh(new THREE.CylinderGeometry(size * 0.18, size * 0.18, size * 0.03, 24), M.metal);
    gallery.position.y = size * 1.1;
    const lamp = R.mesh(new THREE.CylinderGeometry(size * 0.1, size * 0.1, size * 0.14, 16), R.matFn({ color: 0xfff6c8, emissive: 0xfff0a0, emissiveIntensity: 4 }), false);
    lamp.position.y = size * 1.19;
    const cap = R.mesh(new THREE.ConeGeometry(size * 0.14, size * 0.12, 16), M.metal);
    cap.position.y = size * 1.32;
    g.add(rock, body, gallery, lamp, cap);
    // Haz de luz giratorio
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.18, ...ADD, depthWrite: false, side: THREE.DoubleSide });
    R.disposables.push(beamMat);
    const beam = new THREE.Mesh(R.geo(new THREE.ConeGeometry(size * 0.35, size * 4, 20, 1, true).translate(0, -size * 2, 0).rotateZ(Math.PI / 2)), beamMat);
    const pivot = new THREE.Group();
    pivot.position.y = size * 1.19;
    pivot.add(beam);
    g.add(pivot);
    R.movers.push((dt) => { pivot.rotation.y += dt * 0.8; });
    return g;
  },

  tree(R, size) {
    const g = new THREE.Group();
    const trunk = R.mesh(new THREE.CylinderGeometry(size * 0.05, size * 0.08, size * 0.6, 8), R.mat.darkWood);
    trunk.position.y = size * 0.3;
    g.add(trunk);
    const leafMat = R.matFn({ color: 0x3f6b2a, roughness: 0.95, flatShading: true });
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.IcosahedronGeometry(size * rand(0.22, 0.32), 1);
      const pos = geo.attributes.position;
      for (let j = 0; j < pos.count; j++) pos.setXYZ(j, pos.getX(j) * rand(0.85, 1.15), pos.getY(j) * rand(0.85, 1.15), pos.getZ(j) * rand(0.85, 1.15));
      geo.computeVertexNormals();
      const blob = R.mesh(geo, leafMat);
      blob.position.set(rand(-0.15, 0.15) * size, size * (0.65 + rand(0, 0.35)), rand(-0.15, 0.15) * size);
      g.add(blob);
    }
    return g;
  },

  well(R, size) {
    const g = new THREE.Group();
    const ring = R.mesh(new THREE.CylinderGeometry(size * 0.35, size * 0.38, size * 0.35, 16, 1, true), R.mat.stone);
    ring.position.y = size * 0.175;
    const water = R.mesh(new THREE.CircleGeometry(size * 0.33, 16).rotateX(-Math.PI / 2), R.matFn({ color: 0x0a2a3a, roughness: 0.05 }), false);
    water.position.y = size * 0.25;
    g.add(ring, water);
    for (const s of [-1, 1]) {
      const post = R.mesh(new THREE.BoxGeometry(size * 0.05, size * 0.7, size * 0.05), R.mat.darkWood);
      post.position.set(s * size * 0.3, size * 0.5, 0);
      g.add(post);
    }
    const roof = R.mesh(new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateX(-Math.PI / 2), R.mat.roof);
    roof.scale.set(size * 0.5, size * 0.2, size * 0.5);
    roof.rotation.y = Math.PI / 2;
    roof.position.y = size * 0.9;
    g.add(roof);
    return g;
  },
};

// ---------- Farolas ----------
function glowSprite(R, color, scale) {
  const sm = new THREE.SpriteMaterial({ map: R.R3.tex.dot, color, transparent: true, ...ADD, depthWrite: false, opacity: 0.8 });
  R.disposables.push(sm);
  const s = new THREE.Sprite(sm);
  s.scale.setScalar(scale);
  return s;
}
const LAMP = {
  lantern(R) {
    const g = new THREE.Group();
    const post = R.mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.1, 6), R.mat.metal);
    post.position.y = 0.05;
    const box = R.mesh(new THREE.BoxGeometry(0.014, 0.018, 0.014), R.mat.glow, false);
    box.position.y = 0.105;
    const glow = glowSprite(R, 0xffb060, 0.09);
    glow.position.y = 0.105;
    g.add(post, box, glow);
    return g;
  },
  brazier(R) {
    const g = new THREE.Group();
    const stand = R.mesh(new THREE.CylinderGeometry(0.004, 0.01, 0.06, 6), R.mat.metal);
    stand.position.y = 0.03;
    const bowl = R.mesh(new THREE.CylinderGeometry(0.02, 0.012, 0.015, 10), R.mat.metal);
    bowl.position.y = 0.065;
    g.add(stand, bowl, glowSprite(R, 0xff7020, 0.12));
    g.children[2].position.y = 0.08;
    R.emitters.push((dt) => {
      if (Math.random() > dt * 18) return;
      const p = g.localToWorld(V(rand(-0.008, 0.008), 0.075, rand(-0.008, 0.008)));
      R.R3.fx.fire.emit(p, V(0, rand(0.08, 0.16), 0).multiplyScalar(R.Rw), { dur: rand(0.3, 0.55), size: R.Rw * 0.03, ...FIRE });
    });
    return g;
  },
  crystal(R) {
    const g = new THREE.Group();
    const base = R.mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.05, 8), R.mat.wall);
    base.position.y = 0.025;
    const cry = R.mesh(new THREE.OctahedronGeometry(0.016, 0), R.matFn({ color: 0x9fe8ff, emissive: 0x4fc8ff, emissiveIntensity: 2, roughness: 0.1, metalness: 0.2 }), false);
    cry.scale.y = 1.8;
    const glow = glowSprite(R, 0x8fe3ff, 0.1);
    g.add(base, cry, glow);
    const ph = rand(0, TAU);
    R.movers.push(() => { cry.position.y = glow.position.y = 0.09 + Math.sin(R.time * 1.5 + ph) * 0.008; cry.rotation.y = R.time; });
    return g;
  },
};

// ===========================================================================
// Piezas y planos de pueblo (los usa el juego y el editor: editor.html)
// ===========================================================================
// Un plano ("layout") es un JSON:
//   { version, element, savedAt, plazaR, plaza, ground, roads, lamps, villagers?,
//     pieces: [{ kind, size, x, z, y?, rot, s?: [sx, sy, sz], road?, src? }] }
// Coordenadas del reino: la persona está en (0,0), el borde del círculo a radio 1, +Z es hacia la cámara.
export const LAYOUT_PREFIX = "minimundos.pueblo.";
export const layoutKey = (el) => LAYOUT_PREFIX + el;

// Engancha los objetos con nombre de un modelo de Blender (misma convención que aldea_tierra.glb):
//   door_N (salen aldeanos) · chimney_N (humo) · waterwheel (gira) · flag (ondea) · water* (agua animada)
function wireNamedNodes(R, scene) {
  const doors = [], chimneys = [];
  let wheel = null, flag = null;
  scene.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    const n = o.name || "";
    if (n.startsWith("door_")) doors.push(o);
    else if (n.startsWith("chimney_")) chimneys.push(o);
    else if (n === "waterwheel") wheel = o;
    else if (n === "flag") flag = o;
    else if (n.startsWith("water")) {
      o.traverse((c) => {
        if (!c.isMesh) return;
        const m = c.material.clone();
        m.normalMap = R.texFn(R.R3.tex.water, 3, 3);
        m.normalScale = new THREE.Vector2(0.6, 0.6);
        m.roughness = 0.05; m.metalness = 0.1; m.envMapIntensity = 1.6;
        R.disposables.push(m);
        R.waterMats.push(m);
        c.material = m;
        c.castShadow = false;
      });
    }
  });
  if (wheel) R.movers.push((dt) => wheel.rotateZ(dt * 1.1));
  if (flag) {
    const q0 = flag.quaternion.clone(), q = new THREE.Quaternion(), up = V(0, 1, 0);
    R.movers.push(() => flag.quaternion.copy(q0).multiply(q.setFromAxisAngle(up, Math.sin(R.time * 3.2) * 0.35)));
  }
  for (const c of chimneys) {
    R.emitters.push((dt) => {
      if (Math.random() > dt * 1.5) return;
      const p = c.getWorldPosition(V());
      R.R3.fx.smoke.emit(p, V(0.03, 0.12, 0).multiplyScalar(R.Rw), { dur: rand(2, 3.2), size: R.Rw * 0.06, grow: 2.5, c0: [0.75, 0.75, 0.75], alpha: 0.5 });
    });
  }
  return doors;
}

const ROCK = { fuego: 0x15121a, agua: 0x2a3438, tierra: 0x6e675c, aire: 0xd8d6d0 };
const lampPiece = (key) => (R, size) => { const g = LAMP[key](R); g.scale.setScalar(size / 0.1); return g; };

// Catálogo: nombre en el editor, grupo, tamaño por defecto, si lleva camino a la plaza, y cómo se construye
export const PIECES = {
  house:      { label: "Casa", group: "Edificios", size: 0.21, road: true, build: (R, s) => BUILD.house(R, s) },
  barn:       { label: "Establo", group: "Edificios", size: 0.27, road: true, build: (R, s) => BUILD.barn(R, s) },
  windmill:   { label: "Molino", group: "Edificios", size: 0.3, road: true, build: (R, s) => BUILD.windmill(R, s) },
  spire:      { label: "Torre blanca", group: "Edificios", size: 0.3, road: true, build: (R, s) => BUILD.spire(R, s) },
  watchtower: { label: "Torre de vigía", group: "Edificios", size: 0.3, road: true, build: (R, s) => BUILD.watchtower(R, s) },
  forge:      { label: "Forja", group: "Edificios", size: 0.26, road: true, build: (R, s) => BUILD.forge(R, s) },
  lighthouse: { label: "Faro", group: "Edificios", size: 0.34, road: true, build: (R, s) => BUILD.lighthouse(R, s) },
  tree:       { label: "Árbol", group: "Naturaleza", size: 0.2, build: (R, s) => BUILD.tree(R, s) },
  bush: {
    label: "Arbusto", group: "Naturaleza", size: 0.08,
    build(R, size) {
      const g = new THREE.Group();
      const m = R.matFn({ color: R.element === "fuego" ? 0x3a2a20 : R.element === "aire" ? 0x9fc8a0 : 0x4a7a30, roughness: 0.95, flatShading: true });
      for (let i = 0; i < 3; i++) {
        const b = R.mesh(new THREE.IcosahedronGeometry(size * rand(0.35, 0.5), 0), m);
        b.position.set(rand(-0.3, 0.3) * size, size * 0.3, rand(-0.3, 0.3) * size);
        g.add(b);
      }
      return g;
    },
  },
  rock: {
    label: "Roca", group: "Naturaleza", size: 0.08,
    build(R, size) {
      const m = R.matFn({ color: ROCK[R.element], roughness: R.element === "tierra" ? 0.95 : 0.4, metalness: R.element === "fuego" ? 0.3 : 0, flatShading: true });
      const rock = R.mesh(new THREE.DodecahedronGeometry(size * 0.5, 0), m);
      rock.scale.set(1, 0.75, 1);
      rock.position.y = size * 0.2;
      const g = new THREE.Group();
      g.add(rock);
      return g;
    },
  },
  pond: {
    label: "Estanque / lava", group: "Naturaleza", size: 0.22,
    build(R, size) {
      const g = new THREE.Group(), T = R.R3.tex;
      const m = R.element === "fuego"
        ? R.matFn({ map: R.texFn(T.lava, 1, 1), emissive: 0xff4a10, emissiveMap: R.texFn(T.lava, 1, 1), emissiveIntensity: 1.5, roughness: 0.8 })
        : R.matFn({ color: 0x1a5a78, roughness: 0.05, metalness: 0.1, normalMap: R.texFn(T.water, 1, 1), normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.6 });
      if (m.normalMap) R.waterMats.push(m);
      const water = R.mesh(new THREE.CircleGeometry(size * 0.5, 32).rotateX(-Math.PI / 2), m, false);
      water.position.y = 0.005;
      g.add(water);
      const rim = R.mesh(new THREE.TorusGeometry(size * 0.5, size * 0.04, 6, 32).rotateX(-Math.PI / 2), R.mat.stone);
      rim.position.y = 0.005;
      g.add(rim);
      return g;
    },
  },
  well:    { label: "Pozo", group: "Decoración", size: 0.1, build: (R, s) => BUILD.well(R, s) },
  lantern: { label: "Farol", group: "Decoración", size: 0.1, build: lampPiece("lantern") },
  brazier: { label: "Brasero", group: "Decoración", size: 0.1, build: lampPiece("brazier") },
  crystal: { label: "Cristal", group: "Decoración", size: 0.1, build: lampPiece("crystal") },
  wall: {
    label: "Muralla", group: "Decoración", size: 0.3,
    build(R, size) {
      const g = new THREE.Group(), h = size * 0.3, t = size * 0.08;
      const w = R.mesh(new THREE.BoxGeometry(size, h, t), R.mat.stone);
      w.position.y = h / 2;
      g.add(w);
      for (let i = 0; i < 5; i++) {
        const c = R.mesh(new THREE.BoxGeometry(size * 0.1, size * 0.07, t), R.mat.stone);
        c.position.set((i / 4 - 0.5) * size * 0.9, h + size * 0.035, 0);
        g.add(c);
      }
      return g;
    },
  },
  fence: {
    label: "Cerca", group: "Decoración", size: 0.25,
    build(R, size) {
      const g = new THREE.Group(), h = 0.05;
      for (let i = 0; i <= 4; i++) {
        const p = R.mesh(new THREE.BoxGeometry(0.008, h, 0.008), R.mat.darkWood);
        p.position.set((i / 4 - 0.5) * size, h / 2, 0);
        g.add(p);
      }
      for (const y of [0.4, 0.8]) {
        const r = R.mesh(new THREE.BoxGeometry(size, 0.006, 0.004), R.mat.wood);
        r.position.y = h * y;
        g.add(r);
      }
      return g;
    },
  },
  path: {
    label: "Camino suelto", group: "Decoración", size: 0.3,
    build(R, size) {
      const p = new THREE.Mesh(R.geo(new THREE.PlaneGeometry(0.075, size).rotateX(-Math.PI / 2)), R.mat.plaza);
      p.position.y = 0.003;
      p.receiveShadow = true;
      const g = new THREE.Group();
      g.add(p);
      return g;
    },
  },
  aldea: {
    label: "Aldea de Blender (completa)", group: "Especial", size: 0.85, needs: "aldea",
    build(R, size) {
      const src = R.R3.models?.aldea;
      if (!src) return null;
      const scene = src.scene.clone(true);
      scene.scale.setScalar(size);
      scene.userData.doors = wireNamedNodes(R, scene);
      return scene;
    },
  },
  glb: {
    label: "Modelo propio (.glb)", group: "Especial", size: 0.3, hidden: true,
    build(R, size, p) {
      const gltf = R.R3.custom?.[p.src];
      if (!gltf) return null;
      const inner = SkeletonUtils.clone(gltf.scene);
      inner.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(inner, true);
      const sz = box.getSize(V()), c = box.getCenter(V());
      const k = size / Math.max(sz.x, sz.y, sz.z, 1e-6);
      inner.scale.multiplyScalar(k);
      inner.position.set(-c.x * k, -box.min.y * k, -c.z * k);
      const g = new THREE.Group();
      g.add(inner);
      if (gltf.animations?.length) {
        const mixer = new THREE.AnimationMixer(inner);
        for (const clip of gltf.animations) mixer.clipAction(clip).play();
        R.movers.push((dt) => mixer.update(dt));
      }
      g.userData.doors = wireNamedNodes(R, g);
      return g;
    },
  },
};

// Construye una pieza (grupo exterior = posición/giro/escala del plano; interior = la pieza)
export function makePiece(R, p) {
  const def = PIECES[p.kind];
  if (!def) return null;
  const inner = def.build(R, p.size ?? def.size, p);
  if (!inner) return null;
  const g = new THREE.Group();
  g.add(inner);
  g.userData.doors = inner.userData.doors;
  g.userData.chimney = inner.userData.chimney;
  return g;
}
export function placePiece(obj, p) {
  obj.position.set(p.x || 0, p.y || 0, p.z || 0);
  obj.rotation.set(0, p.rot || 0, 0);
  const s = p.s || [1, 1, 1];
  obj.scale.set(s[0], s[1], s[2]);
}

const r3 = (n) => Math.round(n * 1000) / 1000;
// Pueblo al azar (lo que hacía el juego antes del editor)
export function randomLayout(el) {
  const pieces = [];
  for (const [kind, size] of STYLE[el].kinds) {
    for (let tries = 0; tries < 300; tries++) {
      const a = rand(0, TAU), r = Math.sqrt(rand(0.56 * 0.56, 0.95 * 0.95));
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 0.25) continue; // nada grande delante de la persona
      if (pieces.some((b) => Math.hypot(b.x - x, (b.z - z) * 0.6) < (b.size + size) * 0.55)) continue;
      pieces.push({ kind, size, x: r3(x), z: r3(z), rot: r3(Math.atan2(-x, -z)), road: !!PIECES[kind].road });
      break;
    }
  }
  return { version: 1, element: el, plazaR: 0.34, plaza: true, ground: true, roads: true, lamps: true, pieces };
}
// Pueblo por defecto: la aldea de Blender en tierra (si cargó), al azar en el resto
export function defaultLayout(el, R3) {
  if (el === "tierra" && R3?.models?.aldea) {
    return { version: 1, element: el, plazaR: 0.34, plaza: false, ground: false, roads: false, lamps: false, pieces: [{ kind: "aldea", size: 0.85, x: 0, z: 0, rot: 0 }] };
  }
  return randomLayout(el);
}

// Lee los planos: models/pueblo_<el>.json y lo guardado por el editor en este navegador (gana el más nuevo)
export async function loadLayouts() {
  const out = {};
  await Promise.all(KEYS.map(async (el) => {
    let file = null, local = null;
    try {
      const r = await fetch(new URL(`./models/pueblo_${el}.json`, import.meta.url).href, { cache: "no-store" });
      if (r.ok) file = await r.json();
    } catch { /* sin archivo */ }
    try { local = JSON.parse(localStorage.getItem(layoutKey(el)) || "null"); } catch { /* sin guardado */ }
    const best = [file, local].filter((l) => l && Array.isArray(l.pieces)).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
    if (best) out[el] = best;
  }));
  return out;
}

// "Kit" para el editor: un reino sin persona ni criaturas, con los mismos materiales, piso y piezas que el juego
export function createKit(R3, element, layout) {
  const k = Object.create(Realm.prototype);
  Object.assign(k, {
    R3, element, style: STYLE[element], time: 0, grow: 0, Rw: 1,
    root: new THREE.Group(), body: new THREE.Group(),
    movers: [], emitters: [], disposables: [], waterMats: [], villagers: [],
    layout: layout || { pieces: [] },
  });
  k.makeMaterials();
  return k;
}

// ===========================================================================
// Criaturas
// ===========================================================================
// Corre/vuela en círculo sobre el piso del reino (coordenadas del reino)
function groundCircler(R, key, size, r, sp, opts = {}) {
  const m = R.R3.instModel(key, size, opts);
  if (!m) return null;
  R.root.add(m.obj);
  m.play(opts.clip);
  const st = { a: rand(0, TAU), ph: rand(0, TAU) };
  R.movers.push((dt) => {
    st.a += sp * dt;
    const rr = r + 0.05 * Math.sin(R.time * 0.7 + st.ph);
    const h = (opts.h || 0) + (opts.h ? Math.sin(R.time * 1.3 + st.ph) * 0.03 : 0);
    m.obj.position.set(Math.cos(st.a) * rr, h, Math.sin(st.a) * rr);
    const s = Math.sign(sp);
    m.obj.rotation.set(0, Math.atan2(-Math.sin(st.a) * s, Math.cos(st.a) * s), opts.h ? -s * 0.25 : 0);
    m.mixer.update(dt * (opts.animSpeed || 1));
    opts.onUpdate?.(m, dt);
  });
  return m;
}

// Vuela alrededor del cuerpo de la persona (coordenadas de mundo)
function bodyFlyer(R, key, size, rk, hk, sp, opts = {}) {
  const m = R.R3.instModel(key, 1, opts);
  if (!m) return null;
  R.body.add(m.obj);
  m.play(opts.clip);
  const st = { a: rand(0, TAU), ph: rand(0, TAU) };
  R.movers.push((dt) => {
    const A = R.A;
    if (!A) return;
    st.a += sp * dt;
    const rad = A.S * rk * (1 + 0.15 * Math.sin(R.time * 0.6 + st.ph));
    const y = lerp(A.top, A.bottom, hk + 0.08 * Math.sin(R.time * 0.5 + st.ph));
    m.obj.position.set(A.C.x + Math.cos(st.a) * rad, y, A.z + Math.sin(st.a) * rad);
    const s = Math.sign(sp);
    m.obj.rotation.set(0, Math.atan2(-Math.sin(st.a) * s, Math.cos(st.a) * s), -s * 0.3);
    m.obj.scale.setScalar(A.S * size);
    m.mixer.update(dt * (opts.animSpeed || 1));
    opts.onUpdate?.(m, dt);
  });
  return m;
}

function emitAt(R, obj, sys, rate, dt, make) {
  const n = Math.floor(rate * dt + Math.random());
  for (let i = 0; i < n; i++) {
    const [local, vel, o] = make();
    R.R3.fx[sys].emit(obj.localToWorld(local), vel, o);
  }
}

// Bola de energía que recorre el cuerpo (brasa viva, luciérnaga, chispa)
function bodyCrawler(R, color, sys, partColor) {
  const glow = glowSprite(R, color, 1);
  R.body.add(glow);
  const st = { path: pick(PATHS), pos: rand(0, 4), dir: 1 };
  R.movers.push((dt) => {
    const A = R.A;
    if (!A?.pts) { glow.visible = false; return; }
    glow.visible = R.grow > 0.3;
    const last = st.path.length - 1;
    st.pos += dt * 0.8;
    if (st.pos >= last) {
      const e = st.path[last];
      const next = PATHS.flatMap((p) => (p[0] === e ? [p] : p[p.length - 1] === e ? [[...p].reverse()] : []));
      st.path = pick(next); st.pos = 0;
    }
    const i = Math.min(Math.floor(st.pos), st.path.length - 2), f = st.pos - i;
    const p = A.pts[st.path[i]].clone().lerp(A.pts[st.path[i + 1]], f);
    p.z = A.z + A.S * 0.15;
    glow.position.copy(p);
    glow.scale.setScalar(A.S * 0.16 * (1 + 0.2 * Math.sin(R.time * 9)));
    if (glow.visible && Math.random() < dt * 25) R.R3.fx[sys].emit(p, V(rand(-0.1, 0.1), rand(0.05, 0.3), 0).multiplyScalar(A.S), { dur: rand(0.3, 0.7), size: A.S * 0.03, c0: partColor, c1: partColor.map((c) => c * 0.4) });
  });
}

const CREATURES = {
  fuego(R) {
    // Corceles de pesadilla: caballos de obsidiana con crin de fuego
    for (const [r, sp] of [[0.86, 0.75], [0.72, -0.9]]) {
      groundCircler(R, "horse", 0.3, r, sp, {
        tint: 0x2a1a14, emissive: 0xff3a00, emissiveIntensity: 0.35, roughness: 0.4, animSpeed: 1.1,
        onUpdate: (m, dt) => emitAt(R, m.obj, "fire", 70, dt, () => [V(rand(-0.01, 0.01), 0.2, rand(0.02, 0.1)), V(0, 0.12, 0).multiplyScalar(R.Rw), { dur: rand(0.25, 0.45), size: R.Rw * 0.035, ...FIRE }]),
      });
    }
    // Fénix: ave de fuego con estela
    bodyFlyer(R, "parrot", 1.0, 2.1, -0.3, 0.5, {
      tint: 0xffb040, emissive: 0xff5a00, emissiveIntensity: 1.6,
      onUpdate: (m, dt) => emitAt(R, m.obj, "fire", 90, dt, () => [V(rand(-0.3, 0.3), rand(0, 0.15), rand(-0.4, 0)), V(0, 0.2, 0).multiplyScalar(R.A.S), { dur: rand(0.3, 0.6), size: R.A.S * 0.12, ...FIRE }]),
    });
    // Fuegos fatuos
    for (let i = 0; i < 3; i++) {
      const g = glowSprite(R, 0xff8a30, 1);
      R.body.add(g);
      const st = { a: rand(0, TAU), rk: rand(1.1, 1.6), hk: rand(0.15, 0.8), sp: rand(0.8, 1.3) * pick([1, -1]) };
      R.movers.push((dt) => {
        const A = R.A; if (!A) return;
        st.a += st.sp * dt;
        g.position.set(A.C.x + Math.cos(st.a) * A.S * st.rk, lerp(A.top, A.bottom, st.hk), A.z + Math.sin(st.a) * A.S * st.rk);
        g.scale.setScalar(A.S * 0.35 * (1 + 0.15 * Math.sin(R.time * 14 + i)));
        if (Math.random() < dt * 30) R.R3.fx.fire.emit(g.position, V(0, A.S * 0.6, 0), { dur: rand(0.25, 0.45), size: A.S * 0.09, ...FIRE });
      });
    }
    for (let i = 0; i < 2; i++) bodyCrawler(R, 0xff7a20, "spark", [1, 0.6, 0.2]);
  },

  agua(R) {
    // Serpiente marina enroscada alrededor de la persona
    const serpMat = R.matFn({ color: 0x167a78, roughness: 0.3, metalness: 0.35, normalMap: R.texFn(R.R3.tex.water, 4, 1), normalScale: new THREE.Vector2(0.6, 0.6), envMapIntensity: 1.4 });
    const serp = new THREE.Mesh(new THREE.BufferGeometry(), serpMat);
    serp.frustumCulled = false;
    serp.castShadow = true;
    const head = R.mesh(new THREE.SphereGeometry(1, 16, 12), serpMat);
    const eyeMat = R.matFn({ color: 0x000000, emissive: 0x9ffcff, emissiveIntensity: 3 });
    for (const s of [-1, 1]) {
      const eye = R.mesh(new THREE.SphereGeometry(0.18, 8, 6), eyeMat, false);
      eye.position.set(s * 0.45, 0.35, 0.65);
      head.add(eye);
    }
    R.body.add(serp, head);
    const ph = rand(0, TAU);
    R.movers.push(() => {
      const A = R.A; if (!A) return;
      const pts = [];
      for (let i = 0; i < 34; i++) {
        const t = R.time - i * 0.07;
        const p = 0.5 + 0.42 * Math.sin(t * 0.22 + ph);
        const ang = p * 2.6 * TAU + t * 0.6;
        const rad = A.S * (0.85 - 0.2 * p);
        pts.push(V(A.C.x + Math.cos(ang) * rad, lerp(A.bottom, A.top, p), A.z + Math.sin(ang) * rad));
      }
      serp.geometry.dispose();
      serp.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, A.S * 0.065, 10, false);
      head.position.copy(pts[0]);
      head.scale.set(A.S * 0.09, A.S * 0.08, A.S * 0.13);
      head.lookAt(pts[0].clone().add(pts[0].clone().sub(pts[1])));
      if (Math.random() < 0.15) R.R3.fx.water.emit(pts[0], V(0, A.S * 0.3, 0), { dur: rand(0.8, 1.4), size: A.S * 0.03, c0: [0.85, 0.97, 1], alpha: 0.7 });
    });
    R.extraDispose = () => serp.geometry.dispose();

    // Medusas luminosas que suben alrededor del cuerpo
    for (let i = 0; i < 3; i++) {
      const hue = rand(0.5, 0.85);
      const bellMat = R.matFn({ color: new THREE.Color().setHSL(hue, 0.7, 0.75), emissive: new THREE.Color().setHSL(hue, 0.9, 0.5), emissiveIntensity: 1.2, transparent: true, opacity: 0.55, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
      const jelly = new THREE.Group();
      jelly.add(R.mesh(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2), bellMat, false));
      const tentMat = new THREE.LineBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.8, 0.8), transparent: true, opacity: 0.5 });
      R.disposables.push(tentMat);
      const tents = [];
      for (let k = 0; k < 8; k++) {
        const geo = R.geo(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 10 }, () => V())));
        const line = new THREE.Line(geo, tentMat);
        line.frustumCulled = false;
        jelly.add(line);
        tents.push(line);
      }
      R.body.add(jelly);
      const st = { a: rand(0, TAU), rk: rand(1.2, 1.8), hk: rand(-0.2, 1), rise: rand(0.04, 0.07), sp: rand(0.2, 0.4) * pick([1, -1]) };
      R.movers.push((dt) => {
        const A = R.A; if (!A) return;
        st.hk -= st.rise * dt;
        if (st.hk < -0.25) { st.hk = 1.05; st.a = rand(0, TAU); }
        st.a += st.sp * dt;
        jelly.position.set(A.C.x + Math.cos(st.a) * A.S * st.rk, lerp(A.top, A.bottom, st.hk), A.z + Math.sin(st.a) * A.S * st.rk);
        const pulse = 1 + 0.12 * Math.sin(R.time * 3 + i);
        jelly.scale.set(A.S * 0.18 * pulse, A.S * 0.16 / pulse, A.S * 0.18 * pulse);
        tents.forEach((ln, k) => {
          const pos = ln.geometry.attributes.position;
          const a = (k / tents.length) * TAU;
          for (let j = 0; j < 10; j++) {
            const y = -j * 0.25;
            pos.setXYZ(j, Math.cos(a) * 0.6 + Math.sin(R.time * 2 + j * 0.6 + k) * 0.15 * (j / 10), y, Math.sin(a) * 0.6 + Math.cos(R.time * 2 + j * 0.5) * 0.15 * (j / 10));
          }
          pos.needsUpdate = true;
        });
        bellMat.opacity = 0.55 * Math.max(0, Math.min(1, (1.05 - st.hk) * 4, (st.hk + 0.25) * 4));
      });
    }
    // Flamencos volando bajo sobre el agua y cigüeñas alrededor del cuerpo
    for (let i = 0; i < 2; i++) groundCircler(R, "flamingo", 0.3, rand(0.75, 0.95), rand(0.35, 0.5) * pick([1, -1]), { h: rand(0.15, 0.3) });
    for (let i = 0; i < 2; i++) bodyFlyer(R, "stork", 0.55, rand(1.8, 2.4), rand(-0.25, 0.1), rand(0.35, 0.5) * pick([1, -1]));
    bodyCrawler(R, 0x7fe0ff, "water", [0.7, 0.95, 1]);
  },

  tierra(R) {
    // Caballos galopando y un gólem de piedra caminando
    const rings = R.diorama ? [[1.62, 0.42], [1.82, -0.5]] : [[0.86, 0.7], [0.74, -0.85]];
    for (const [r, sp] of rings) groundCircler(R, "horse", 0.28, r, sp, {});
    const stoneMat = R.matFn({ map: R.texFn(R.R3.tex.brick, 1, 1), color: 0x8a8578, roughness: 1, flatShading: true });
    const golem = R.R3.instModel("robot", 0.42, { material: stoneMat });
    if (golem) {
      R.root.add(golem.obj);
      const st = { x: 0.6, z: 0.3, head: rand(0, TAU), turn: 2, pause: 0 };
      R.movers.push((dt) => {
        if (R.diorama) {
          // Guardián que rodea el pedestal del pueblo
          golem.play("Walking");
          st.a = (st.a ?? rand(0, TAU)) + dt * 0.07;
          golem.obj.position.set(Math.cos(st.a) * 1.55, 0, Math.sin(st.a) * 1.55);
          golem.obj.rotation.y = Math.atan2(-Math.sin(st.a), Math.cos(st.a));
          golem.mixer.update(dt * 0.6);
          return;
        }
        if (st.pause > 0) { st.pause -= dt; golem.play("Idle"); }
        else {
          golem.play("Walking");
          if ((st.turn -= dt) <= 0) { st.head += rand(-1, 1); st.turn = rand(2, 4); if (Math.random() < 0.3) st.pause = rand(1.5, 3); }
          const r = Math.hypot(st.x, st.z);
          if (r > 0.9) st.head = Math.atan2(-st.x, -st.z) + rand(-0.4, 0.4);
          else if (r < 0.5) st.head = Math.atan2(st.x, st.z) + rand(-0.4, 0.4);
          st.x += Math.sin(st.head) * 0.05 * dt;
          st.z += Math.cos(st.head) * 0.05 * dt;
        }
        golem.obj.position.set(st.x, 0, st.z);
        golem.obj.rotation.y = st.head;
        golem.mixer.update(dt * 0.6);
      });
    }
    for (let i = 0; i < 2; i++) bodyFlyer(R, "stork", 0.55, rand(1.8, 2.4), rand(-0.3, 0.1), rand(0.3, 0.45) * pick([1, -1]));
    bodyFlyer(R, "parrot", 0.4, 1.5, 0.35, 0.8, {});
    for (let i = 0; i < 3; i++) bodyCrawler(R, 0xb6ff6a, "spark", [0.7, 1, 0.4]);
  },

  aire(R) {
    for (let i = 0; i < 3; i++) bodyFlyer(R, "parrot", 0.4, rand(1.3, 1.9), rand(0.1, 0.7), rand(0.7, 1.0) * pick([1, -1]));
    for (let i = 0; i < 2; i++) bodyFlyer(R, "stork", 0.65, rand(2.2, 2.8), rand(-0.4, -0.2), rand(0.3, 0.4) * pick([1, -1]));
    for (let i = 0; i < 2; i++) groundCircler(R, "flamingo", 0.3, rand(0.8, 1.0), rand(0.3, 0.45) * pick([1, -1]), { h: rand(0.3, 0.5) });
    // Cintas de viento girando alrededor del cuerpo
    const ribMat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.16, ...ADD, depthWrite: false });
    R.disposables.push(ribMat);
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.BufferGeometry(), ribMat);
      rib.frustumCulled = false;
      R.body.add(rib);
      const st = { a: rand(0, TAU), rk: rand(1.1, 1.5), hk: rand(0.15, 0.8), sp: rand(1.4, 2) * pick([1, -1]) };
      R.movers.push((dt) => {
        const A = R.A; if (!A) return;
        st.a += st.sp * dt;
        const pts = [];
        for (let k = 0; k < 24; k++) {
          const ak = st.a - k * 0.08 * Math.sign(st.sp);
          const y = lerp(A.top, A.bottom, st.hk + 0.1 * Math.sin(R.time - k * 0.05 + i));
          pts.push(V(A.C.x + Math.cos(ak) * A.S * st.rk, y, A.z + Math.sin(ak) * A.S * st.rk));
        }
        rib.geometry.dispose();
        rib.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, A.S * 0.008, 5, false);
      });
    }
    // Rocas flotando alrededor del reino
    const rockMat = R.matFn({ color: 0x8a8378, roughness: 0.95, flatShading: true });
    const grassMat = R.matFn({ map: R.texFn(R.R3.tex.grass, 0.3, 0.3), roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      const rock = R.mesh(new THREE.ConeGeometry(0.06, 0.12, 7), rockMat);
      rock.rotation.x = Math.PI;
      rock.position.y = -0.06;
      const top = R.mesh(new THREE.CylinderGeometry(0.062, 0.06, 0.012, 7), grassMat);
      g.add(rock, top);
      R.root.add(g);
      const st = { a: rand(0, TAU), r: rand(0.95, 1.1), h: rand(0.2, 0.45), sp: rand(0.08, 0.15), ph: rand(0, TAU) };
      R.movers.push((dt) => {
        st.a += st.sp * dt;
        g.position.set(Math.cos(st.a) * st.r, st.h + Math.sin(R.time + st.ph) * 0.02, Math.sin(st.a) * st.r);
        g.rotation.y += dt * 0.2;
      });
    }
    for (let i = 0; i < 2; i++) bodyCrawler(R, 0xbfe6ff, "spark", [0.8, 0.9, 1]);
  },
};

// ===========================================================================
// Orbe del elemento en la mano
// ===========================================================================
const ORB = {
  fuego(R) {
    const g = new THREE.Group();
    g.add(R.mesh(new THREE.SphereGeometry(0.6, 20, 14), R.matFn({ color: 0x000000, emissive: 0xffa040, emissiveIntensity: 4 }), false));
    g.add(glowSprite(R, 0xff6a10, 4));
    const light = new THREE.PointLight(0xff7a20, 0, 0, 2);
    g.add(light);
    g.userData.update = (dt, R) => {
      const S = R.A.S;
      light.intensity = 3 * S * S * (0.8 + 0.2 * Math.sin(R.time * 17));
      light.distance = S * 4;
      if (Math.random() < dt * 40) R.R3.fx.fire.emit(g.position, V(rand(-0.1, 0.1), rand(0.5, 1), 0).multiplyScalar(S), { dur: rand(0.3, 0.6), size: S * 0.12, ...FIRE });
    };
    return g;
  },
  agua(R) {
    const g = new THREE.Group();
    const sphere = R.mesh(new THREE.SphereGeometry(1, 32, 20), R.matFn({ color: 0x5ec8ff, transparent: true, opacity: 0.55, roughness: 0, metalness: 0.1, envMapIntensity: 2.5, emissive: 0x0a4a7a, emissiveIntensity: 0.5 }), false);
    const core = glowSprite(R, 0x7fe0ff, 1.6);
    g.add(sphere, core);
    g.userData.update = (dt, R) => {
      const t = R.time;
      sphere.scale.set(1 + 0.05 * Math.sin(t * 4), 1 + 0.05 * Math.sin(t * 4 + 2), 1 + 0.05 * Math.sin(t * 4 + 4));
      sphere.rotation.y = t;
    };
    return g;
  },
  tierra(R) {
    const g = new THREE.Group();
    const rock = R.mesh(new THREE.DodecahedronGeometry(0.9, 0), R.matFn({ color: 0x6e675c, roughness: 1, flatShading: true }));
    rock.scale.y = 0.6;
    const top = R.mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 9), R.matFn({ map: R.texFn(R.R3.tex.grass, 0.5, 0.5), roughness: 1 }));
    top.position.y = 0.45;
    const tree = BUILD.tree(R, 1.2);
    tree.position.y = 0.48;
    g.add(rock, top, tree);
    g.userData.update = (dt, R) => { g.rotation.y += dt * 0.5; g.position.y += Math.sin(R.time * 1.6) * R.A.S * 0.01; };
    return g;
  },
  aire(R) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.35, ...ADD, depthWrite: false });
    R.disposables.push(mat);
    const rings = [];
    for (let i = 0; i < 6; i++) {
      const tor = new THREE.Mesh(R.geo(new THREE.TorusGeometry(0.25 + i * 0.13, 0.03, 6, 32, Math.PI * 1.5).rotateX(Math.PI / 2)), mat);
      tor.position.y = -0.6 + i * 0.25;
      g.add(tor);
      rings.push(tor);
    }
    g.userData.update = (dt) => rings.forEach((r, i) => { r.rotation.y += dt * (6 - i * 0.5); });
    return g;
  },
};
