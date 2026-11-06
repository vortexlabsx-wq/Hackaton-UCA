// Editor de pueblos: arma a mano el pueblo de cada reino con las mismas piezas que usa el juego.
// Lo que se edita se guarda en este navegador (la app y la demo lo leen al instante) y se puede
// exportar a models/pueblo_<elemento>.json para que quede en el proyecto.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { Realms, ELEMENTS, PIECES, makePiece, placePiece, randomLayout, defaultLayout, loadLayouts, createKit, layoutKey, glbStore, listModelFiles } from "./world3d.js";

const $ = (id) => document.getElementById(id);
const r3 = (n) => Math.round(n * 1000) / 1000;
const DEG = 180 / Math.PI;
const clone = (o) => JSON.parse(JSON.stringify(o));

let toastTimer;
function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

// ---------------------------------------------------------------------------
// Motor: reutiliza el de la app (mismas luces, materiales, texturas y partículas)
// ---------------------------------------------------------------------------
const R3 = new Realms();
await R3.load();
$("loading").remove();

const view = $("view");
const renderer = R3.renderer;
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setClearColor(0x15181e, 1);
view.prepend(renderer.domElement);
renderer.domElement.tabIndex = 0;
const scene = R3.scene;

const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.495;
orbit.minDistance = 0.2;
orbit.maxDistance = 12;

const VIEWS = {
  free: { pos: [1.7, 1.5, 2.2], target: [0, 0.15, 0] },
  cam: { pos: [0, 0.85, 3.3], target: [0, 0.35, 0] },
  top: { pos: [0, 3.4, 0.01], target: [0, 0, 0] },
};
function setView(k) {
  const v = VIEWS[k];
  camera.position.set(...v.pos);
  orbit.target.set(...v.target);
  orbit.update();
}
setView("free");

// Sol fijo, como en el juego (desde atrás a la izquierda y arriba)
const sun = R3.sun;
sun.position.set(-2.2, 5, 3);
sun.target.position.set(0, 0, 0);
sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.1, far: 14 });
sun.shadow.camera.updateProjectionMatrix();

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const scale = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  for (const p of Object.values(R3.fx)) p.mat.uniforms.scale.value = scale;
}
new ResizeObserver(resize).observe(view);

// ---------------------------------------------------------------------------
// Ayudas visuales (no se guardan)
// ---------------------------------------------------------------------------
const helpers = new THREE.Group();
scene.add(helpers);
const grid = new THREE.GridHelper(4, 40, 0x3a4250, 0x262b34);
grid.position.y = -0.004;
helpers.add(grid);

const borderMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
const border = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
  Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * Math.PI * 2), 0.01, Math.sin((i / 96) * Math.PI * 2)))), borderMat);
helpers.add(border);

// Zona delante de la persona (z > 0.25): lo grande ahí tapa a la persona en el video
const a0 = Math.asin(0.25);
const frontShape = new THREE.Shape();
frontShape.absarc(0, 0, 1, a0, Math.PI - a0, false);
frontShape.closePath();
const front = new THREE.Mesh(new THREE.ShapeGeometry(frontShape, 32).rotateX(Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
front.position.y = 0.009;
front.renderOrder = 2;
helpers.add(front);

const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.01, 1.08), 0.35, 0xffd34d, 0.1, 0.07);
helpers.add(arrow);

// Persona de referencia (alto aproximado que tiene en el juego con el tamaño por defecto)
const person = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 1.44, 6, 16),
  new THREE.MeshStandardMaterial({ color: 0x3d5a80, transparent: true, opacity: 0.35, roughness: 0.8, depthWrite: false }));
person.position.y = 0.84;
person.renderOrder = 5;
helpers.add(person);

const selBox = new THREE.BoxHelper(undefined, 0xffcc33);
selBox.visible = false;
helpers.add(selBox);

const tc = new TransformControls(camera, renderer.domElement);
tc.setSize(0.8);
scene.add(tc);

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const EL_KEYS = Object.keys(ELEMENTS);
const savedLayouts = R3.layouts || {};          // lo que hay guardado (archivo o navegador)
let el = new URLSearchParams(location.search).get("el");
if (!EL_KEYS.includes(el)) el = "tierra";
let layout = null;                               // plano del reino abierto
let kit = null;                                  // materiales y piso del reino abierto
let piecesGroup = null, decor = null, decorFx = { movers: [], emitters: [] }, groundFx = { movers: [], emitters: [] };
let entities = [];                               // { p, obj, movers, emitters }
let selected = null;
let placing = null;                              // { p, ent } mientras se coloca una pieza nueva
let undoStack = [], hIdx = -1;
let animate = true;

function normalize(L) {
  const out = { version: 1, element: el, plazaR: 0.34, plaza: true, ground: true, roads: true, lamps: true, ...clone(L) };
  out.element = el;
  out.pieces = (out.pieces || []).filter((p) => PIECES[p.kind]);
  return out;
}

// Ejecuta fn y se queda con las animaciones/partículas que registre (para poder borrarlas por pieza)
function capture(fn) {
  const m = kit.movers, e = kit.emitters;
  kit.movers = []; kit.emitters = [];
  let obj = null;
  try { obj = fn(); } catch (err) { console.error(err); }
  const res = { obj, movers: kit.movers, emitters: kit.emitters };
  kit.movers = m; kit.emitters = e;
  return res;
}

function disposeTree(o) {
  o.traverse((c) => { if (c.geometry && c !== border) c.geometry.dispose?.(); });
}

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------
function rebuildAll() {
  tc.detach();
  selected = null;
  if (kit) {
    scene.remove(kit.root);
    disposeTree(kit.root);
    for (const d of kit.disposables) d.dispose?.();
  }
  for (const p of Object.values(R3.fx)) p.clear();
  kit = createKit(R3, el, layout);
  scene.add(kit.root);
  groundFx = capture(() => kit.buildGround());
  const light = new THREE.PointLight(kit.style.light, 9, 6, 2);
  light.position.set(0, 0.5, 0.2);
  kit.root.add(light);
  piecesGroup = new THREE.Group();
  kit.root.add(piecesGroup);
  entities = layout.pieces.map((p) => buildEntity(p));
  decor = null;
  rebuildDecor();
  borderMat.color.set(ELEMENTS[el].color);
  $("swBorder").style.background = ELEMENTS[el].color;
  refreshUI();
}

function buildEntity(p) {
  const r = capture(() => makePiece(kit, p));
  let obj = r.obj;
  if (!obj) {
    // Falta el modelo (p. ej. un .glb que no está en models/): caja roja en su lugar
    obj = new THREE.Group();
    const s = p.size ?? 0.2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(s, s, s).translate(0, s / 2, 0), new THREE.MeshBasicMaterial({ color: 0xff4444, wireframe: true }));
    obj.add(box);
  }
  placePiece(obj, p);
  const ent = { p, obj, movers: r.movers, emitters: r.emitters };
  obj.userData.ent = ent;
  piecesGroup.add(obj);
  return ent;
}

function removeEntity(ent) {
  piecesGroup.remove(ent.obj);
  disposeTree(ent.obj);
}

// Plaza, caminos y farolas (dependen de dónde están las piezas)
function rebuildDecor() {
  if (decor) { kit.root.remove(decor); disposeTree(decor); }
  kit.lavaRing = null;
  decorFx = capture(() => {
    const g = new THREE.Group();
    if (layout.plaza !== false) kit.addPlaza(layout.plazaR ?? 0.34, g);
    kit.addRoads(entities.map((e) => ({ ...e.p, size: e.p.size ?? PIECES[e.p.kind].size })), layout, g);
    return g;
  });
  decor = decorFx.obj;
  kit.root.add(decor);
}
let decorQueued = false;
function queueDecor() {
  if (decorQueued) return;
  decorQueued = true;
  requestAnimationFrame(() => { decorQueued = false; rebuildDecor(); });
}

// ---------------------------------------------------------------------------
// Guardar / historial
// ---------------------------------------------------------------------------
function commit(save = true) {
  const snap = JSON.stringify(layout);
  const last = undoStack[hIdx];
  if (last && stripTime(last) === stripTime(snap)) { refreshUI(); return; }
  undoStack = undoStack.slice(0, hIdx + 1);
  undoStack.push(snap);
  if (undoStack.length > 200) undoStack.shift();
  hIdx = undoStack.length - 1;
  if (save) persist();
  refreshUI();
}
const stripTime = (s) => s.replace(/"savedAt":\d+,?/, "");

function persist() {
  layout.savedAt = Date.now();
  try {
    localStorage.setItem(layoutKey(el), JSON.stringify(layout));
    savedLayouts[el] = clone(layout);
    $("saveState").textContent = "Guardando…";
  } catch (e) {
    $("saveState").textContent = "No se pudo guardar";
    console.warn(e);
  }
  saveToProject(el, JSON.stringify(layout, null, 2));
}

// Además del navegador, cada cambio se escribe en models/pueblo_<elemento>.json (lo hace servidor.py).
// Así el pueblo queda en el proyecto y se ve igual al abrirlo otro día o desde otro navegador.
const saveTimers = {};
function saveToProject(element, json) {
  clearTimeout(saveTimers[element]);
  saveTimers[element] = setTimeout(async () => {
    const hora = new Date().toLocaleTimeString().slice(0, 5);
    try {
      const r = await fetch(`api/models/pueblo_${element}.json`, { method: "PUT", body: json, headers: { "Content-Type": "application/json" } });
      if (!r.ok) throw new Error(r.status);
      $("saveState").textContent = `Guardado en el proyecto ✓ ${hora}`;
      $("saveState").title = `models/pueblo_${element}.json`;
    } catch {
      $("saveState").textContent = `Guardado solo en este navegador ${hora} ⚠`;
      $("saveState").title = "Para que se guarde en la carpeta del proyecto, abrí la app con iniciar.bat";
    }
  }, 400);
}

// Sube un .glb a models/. Devuelve true si quedó en el proyecto.
async function uploadModel(name, buf) {
  try {
    const r = await fetch(`api/models/${encodeURIComponent(name)}`, { method: "PUT", body: buf, headers: { "Content-Type": "model/gltf-binary" } });
    return r.ok;
  } catch { return false; }
}

// Al abrir el editor: si hay pueblos o modelos que solo están en el navegador, pasarlos al proyecto
async function syncToProject() {
  const files = await listModelFiles();
  if (!files) {
    $("saveState").textContent = "Guardando solo en este navegador ⚠";
    $("saveState").title = "Para que se guarde en la carpeta del proyecto, abrí la app con iniciar.bat";
    return;
  }
  for (const [element, L] of Object.entries(savedLayouts)) {
    for (const p of L.pieces || []) {
      if (p.kind !== "glb" || !p.src) continue;
      const name = p.src.split("/").pop();
      if (files.has(name)) continue;
      const buf = await glbStore.get(p.src);
      if (buf && (await uploadModel(name, buf))) files.add(name);
      else if (!buf) toast(`Falta "${name}" en models/. Copialo a esa carpeta o volvé a cargarlo con "Modelo propio (.glb)…"`, 7000);
    }
    const jsonName = `pueblo_${element}.json`;
    const file = files.has(jsonName) ? await fetch(`models/${jsonName}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
    if (!file || (file.savedAt || 0) < (L.savedAt || 0)) saveToProject(element, JSON.stringify(L, null, 2));
  }
}

function restore(idx) {
  hIdx = idx;
  const selIdx = selected ? layout.pieces.indexOf(selected.p) : -1;
  layout = JSON.parse(undoStack[hIdx]);
  persist();
  rebuildAll();
  if (selIdx >= 0 && entities[selIdx]) select(entities[selIdx]);
}
function undo() { if (hIdx > 0) restore(hIdx - 1); }
function redo() { if (hIdx < undoStack.length - 1) restore(hIdx + 1); }

function openElement(next) {
  cancelPlacing();
  select(null);
  el = next;
  undoStack = []; hIdx = -1;
  layout = normalize(savedLayouts[el] || defaultLayout(el, R3));
  const has = !!savedLayouts[el];
  $("saveState").textContent = has ? "Pueblo guardado" : "Pueblo original (sin cambios)";
  commit(false);
  rebuildAll();
  const url = new URL(location.href);
  url.searchParams.set("el", el);
  window.history.replaceState(null, "", url);
  for (const b of $("tabs").children) b.classList.toggle("on", b.dataset.el === el);
  buildPalette();
}

// ---------------------------------------------------------------------------
// Selección y edición
// ---------------------------------------------------------------------------
function select(ent) {
  selected = ent;
  if (ent) tc.attach(ent.obj); else tc.detach();
  refreshUI();
}

function syncFromObj(ent) {
  const o = ent.obj, p = ent.p;
  p.x = r3(o.position.x);
  p.z = r3(o.position.z);
  const y = r3(o.position.y);
  if (y) p.y = y; else delete p.y;
  p.rot = r3(new THREE.Euler().setFromQuaternion(o.quaternion, "YXZ").y);
  const s = [r3(o.scale.x), r3(o.scale.y), r3(o.scale.z)];
  if (s.some((v) => v !== 1)) p.s = s; else delete p.s;
}

function rebuildEntity(ent) {
  const i = entities.indexOf(ent);
  removeEntity(ent);
  const n = buildEntity(ent.p);
  entities[i] = n;
  if (selected === ent) select(n);
  return n;
}

function addPiece(p, sel = true) {
  layout.pieces.push(p);
  const ent = buildEntity(p);
  entities.push(ent);
  rebuildDecor();
  commit();
  if (sel) select(ent);
  return ent;
}

function deleteSelected() {
  if (!selected) return;
  const ent = selected;
  select(null);
  removeEntity(ent);
  entities = entities.filter((e) => e !== ent);
  layout.pieces = layout.pieces.filter((p) => p !== ent.p);
  rebuildDecor();
  commit();
}

function duplicateSelected() {
  if (!selected) return;
  const p = clone(selected.p);
  p.x = r3(p.x + 0.08);
  p.z = r3(p.z + 0.08);
  addPiece(p);
}

function faceCenter(ent) {
  ent.p.rot = r3(Math.atan2(-ent.p.x, -ent.p.z));
  placePiece(ent.obj, ent.p);
}

// ---------------------------------------------------------------------------
// Colocar piezas nuevas
// ---------------------------------------------------------------------------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function pointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function floorPoint(e) {
  pointer(e);
  return ray.ray.intersectPlane(floor, new THREE.Vector3());
}

function startPlacing(kind, extra = {}) {
  cancelPlacing();
  select(null);
  const def = PIECES[kind];
  const p = { kind, size: def.size, x: 0, z: -0.6, rot: 0, ...extra };
  if (def.road) p.road = true;
  const ent = buildEntity(p);
  ent.obj.visible = false;
  placing = { p, ent };
  $("placingTip").textContent = `Clic en el piso para poner: ${def.label}${extra.src ? " (" + extra.src.split("/").pop() + ")" : ""} · Esc para cancelar`;
  $("placingTip").style.display = "block";
  renderer.domElement.style.cursor = "crosshair";
  renderer.domElement.focus();
}
function cancelPlacing() {
  if (!placing) return;
  removeEntity(placing.ent);
  placing = null;
  $("placingTip").style.display = "none";
  renderer.domElement.style.cursor = "";
}
function movePlacing(e) {
  const pt = floorPoint(e);
  if (!pt) return;
  const p = placing.p;
  const snapOn = $("snap").checked;
  p.x = r3(snapOn ? Math.round(pt.x / 0.05) * 0.05 : pt.x);
  p.z = r3(snapOn ? Math.round(pt.z / 0.05) * 0.05 : pt.z);
  if (p.kind !== "aldea" && p.kind !== "path") p.rot = r3(Math.atan2(-p.x, -p.z)); // mira hacia la persona
  placePiece(placing.ent.obj, p);
  placing.ent.obj.visible = true;
}
function dropPlacing(keep) {
  const { p, ent } = placing;
  removeEntity(ent);
  const kind = p.kind, extra = p.src ? { src: p.src, size: p.size } : {};
  placing = null;
  $("placingTip").style.display = "none";
  renderer.domElement.style.cursor = "";
  addPiece(clone(p), !keep);
  if (keep) startPlacing(kind, extra);
}

// ---------------------------------------------------------------------------
// Ratón y teclado en el visor
// ---------------------------------------------------------------------------
let down = null;
renderer.domElement.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
renderer.domElement.addEventListener("pointermove", (e) => { if (placing) movePlacing(e); });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || down.b !== 0) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4;
  down = null;
  if (moved || tc.dragging) return;
  if (placing) { movePlacing(e); dropPlacing(e.shiftKey); return; }
  if (tc.axis) return; // clic sobre el gizmo
  pointer(e);
  const hit = ray.intersectObjects(piecesGroup.children, true).find((h) => h.object.visible && !h.object.isSprite);
  let o = hit?.object;
  while (o && !o.userData.ent) o = o.parent;
  select(o ? o.userData.ent : null);
});
tc.addEventListener("dragging-changed", (e) => {
  orbit.enabled = !e.value;
  if (!e.value && selected) { syncFromObj(selected); rebuildDecor(); commit(); }
});
tc.addEventListener("objectChange", () => {
  if (!selected) return;
  if (tc.mode === "translate") selected.obj.position.y = Math.max(selected.obj.position.y, -0.5);
  syncFromObj(selected);
  queueDecor();
  fillProps(true);
});

function setMode(m) {
  tc.setMode(m);
  tc.showX = m !== "rotate";
  tc.showZ = m !== "rotate";
  tc.showY = true;
  $("mTranslate").classList.toggle("on", m === "translate");
  $("mRotate").classList.toggle("on", m === "rotate");
  $("mScale").classList.toggle("on", m === "scale");
  $("mode").textContent = { translate: "Mover", rotate: "Rotar (solo sobre el piso)", scale: "Escalar" }[m];
}
function applySnap() {
  const on = $("snap").checked;
  tc.setTranslationSnap(on ? 0.05 : null);
  tc.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null);
  tc.setScaleSnap(on ? 0.1 : null);
}

window.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); redo(); return; }
  if (ctrl && k === "d") { e.preventDefault(); duplicateSelected(); return; }
  if (ctrl) return;
  if (k === "escape") { if (placing) cancelPlacing(); else select(null); return; }
  if (k === "g" || k === "w") setMode("translate");
  else if (k === "r") setMode("rotate");
  else if (k === "s") setMode("scale");
  else if (k === "delete" && selected) { e.preventDefault(); deleteSelected(); }
  else if ((k === "q" || k === "e") && selected) {
    selected.p.rot = r3((selected.p.rot || 0) + (k === "q" ? 1 : -1) * Math.PI / 12);
    placePiece(selected.obj, selected.p);
    commit();
  } else if (k.startsWith("arrow") && selected) {
    e.preventDefault();
    const d = e.shiftKey ? 0.05 : 0.01;
    // empuja según hacia dónde mira la cámara
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const v = k === "arrowup" ? fwd : k === "arrowdown" ? fwd.negate() : k === "arrowright" ? right : right.negate();
    selected.p.x = r3(selected.p.x + v.x * d);
    selected.p.z = r3(selected.p.z + v.z * d);
    placePiece(selected.obj, selected.p);
    queueDecor();
    commit();
  }
});

// ---------------------------------------------------------------------------
// Interfaz
// ---------------------------------------------------------------------------
for (const k of EL_KEYS) {
  const b = document.createElement("button");
  b.dataset.el = k;
  b.textContent = `${ELEMENTS[k].emoji} ${k[0].toUpperCase() + k.slice(1)}`;
  b.onclick = () => openElement(k);
  $("tabs").append(b);
}

function buildPalette() {
  const box = $("palette");
  box.innerHTML = "";
  const groups = {};
  for (const [kind, def] of Object.entries(PIECES)) {
    if (def.hidden) continue;
    if (def.needs && !R3.models?.[def.needs]) continue;
    (groups[def.group] ||= []).push([kind, def]);
  }
  for (const [g, items] of Object.entries(groups)) {
    const h = document.createElement("div");
    h.className = "lbl";
    h.style.margin = "8px 0 4px";
    h.textContent = g;
    const grid = document.createElement("div");
    grid.className = "palette";
    for (const [kind, def] of items) {
      const b = document.createElement("button");
      b.textContent = def.label;
      b.title = `Agregar ${def.label.toLowerCase()}`;
      if (def.label.length > 12) b.className = "wide";
      b.onclick = () => startPlacing(kind);
      grid.append(b);
    }
    box.append(h, grid);
  }
  // Modelo propio hecho en Blender
  const own = document.createElement("button");
  own.className = "wide";
  own.textContent = "➕ Modelo propio (.glb)…";
  own.title = "Cargar un modelo hecho en Blender. Ponelo en la carpeta models/ del proyecto.";
  own.onclick = () => $("glbFile").click();
  let especial = [...box.querySelectorAll(".palette")].pop();
  if (!groups.Especial) {
    const h = document.createElement("div");
    h.className = "lbl"; h.style.margin = "8px 0 4px"; h.textContent = "Especial";
    especial = document.createElement("div");
    especial.className = "palette";
    box.append(h, especial);
  }
  // Archivo de Blender: el servidor lo abre con Blender, hornea los colores y lo pasa a .glb
  const blend = document.createElement("button");
  blend.className = "wide";
  blend.id = "blendBtn";
  blend.textContent = "➕ Archivo de Blender (.blend)…";
  blend.title = "Sube un .blend: Blender lo convierte solo (con colores y texturas) y se pone en el pueblo.";
  blend.onclick = () => $("blendFile").click();
  especial.append(own, blend);
}

function refreshUI() {
  if (!layout) return;
  // Ajustes del pueblo
  $("lGround").checked = layout.ground !== false;
  $("lPlaza").checked = layout.plaza !== false;
  $("lPlazaR").value = layout.plazaR ?? 0.34;
  $("lPlazaR").disabled = layout.plaza === false;
  $("lRoads").checked = layout.roads !== false;
  $("lLamps").checked = layout.lamps !== false;
  $("lLamps").disabled = layout.roads === false;
  $("lVillagers").value = layout.villagers ?? "";
  $("undo").disabled = hIdx <= 0;
  $("redo").disabled = hIdx >= undoStack.length - 1;
  // Lista de piezas
  const ul = $("list");
  ul.innerHTML = "";
  $("count").textContent = `(${entities.length})`;
  entities.forEach((ent, i) => {
    const li = document.createElement("li");
    if (ent === selected) li.className = "sel";
    const name = ent.p.kind === "glb" ? (ent.p.src || "").split("/").pop() : PIECES[ent.p.kind].label;
    li.innerHTML = `<span></span><span>${(ent.p.size ?? PIECES[ent.p.kind].size).toFixed(2)}</span>`;
    li.firstChild.textContent = `${i + 1}. ${name}`;
    li.onclick = () => select(ent);
    ul.append(li);
  });
  fillProps();
}

// Panel de la pieza seleccionada
const field = (label, html) => `<div class="row"><label>${label}</label>${html}</div>`;
function fillProps(onlyValues = false) {
  const box = $("props");
  if (!selected) { box.innerHTML = `<p class="empty">Ninguna. Hacé clic en una pieza.</p>`; return; }
  const p = selected.p, def = PIECES[p.kind];
  const s = p.s || [1, 1, 1];
  const vals = {
    pSize: p.size ?? def.size, pX: p.x, pZ: p.z, pY: p.y || 0, pRot: Math.round((p.rot || 0) * DEG),
    pSx: s[0], pSy: s[1], pSz: s[2],
  };
  if (onlyValues && $("pX")) {
    for (const [id, v] of Object.entries(vals)) if (document.activeElement !== $(id)) $(id).value = v;
    return;
  }
  const kinds = Object.entries(PIECES)
    .filter(([k, d]) => k === p.kind || (!d.hidden && (!d.needs || R3.models?.[d.needs])))
    .map(([k, d]) => `<option value="${k}" ${k === p.kind ? "selected" : ""}>${d.label}</option>`).join("");
  box.innerHTML =
    field("Tipo", `<select id="pKind">${kinds}</select>`) +
    (p.kind === "glb" ? field("Archivo", `<input type="text" id="pSrc" value="${p.src || ""}" title="Ruta dentro del proyecto" />`) : "") +
    field("Tamaño", `<input type="number" id="pSize" step="0.01" min="0.01" max="3" />`) +
    field("Posición X", `<input type="number" id="pX" step="0.01" />`) +
    field("Posición Z", `<input type="number" id="pZ" step="0.01" />`) +
    field("Altura", `<input type="number" id="pY" step="0.01" />`) +
    field("Giro (°)", `<input type="number" id="pRot" step="5" />`) +
    field("Escala XYZ", `<div class="row3"><input type="number" id="pSx" step="0.05" min="0.05" /><input type="number" id="pSy" step="0.05" min="0.05" /><input type="number" id="pSz" step="0.05" min="0.05" /></div>`) +
    `<label class="check"><input type="checkbox" id="pRoad" ${p.road ? "checked" : ""}/> Camino a la plaza (salen aldeanos)</label>` +
    `<div class="btns" style="margin-top:6px"><button id="pFace" title="Que la puerta mire hacia la persona">🧍 Mirar a la persona</button><button id="pDup">⧉ Duplicar</button><button id="pDel" class="danger">🗑 Borrar</button></div>`;
  for (const [id, v] of Object.entries(vals)) $(id).value = v;

  const num = (id) => parseFloat($(id).value);
  const live = () => {
    p.x = r3(num("pX") || 0); p.z = r3(num("pZ") || 0);
    const y = r3(num("pY") || 0); if (y) p.y = y; else delete p.y;
    p.rot = r3((num("pRot") || 0) / DEG);
    const sc = ["pSx", "pSy", "pSz"].map((id) => Math.max(0.05, r3(num(id) || 1)));
    if (sc.some((v) => v !== 1)) p.s = sc; else delete p.s;
    placePiece(selected.obj, p);
    queueDecor();
  };
  for (const id of ["pX", "pZ", "pY", "pRot", "pSx", "pSy", "pSz"]) {
    $(id).addEventListener("input", live);
    $(id).addEventListener("change", () => { live(); commit(); });
  }
  $("pSize").addEventListener("change", () => {
    p.size = Math.max(0.01, r3(num("pSize") || def.size));
    rebuildEntity(selected); rebuildDecor(); commit();
  });
  $("pKind").addEventListener("change", () => {
    const k = $("pKind").value;
    p.kind = k;
    p.size = PIECES[k].size;
    p.road = !!PIECES[k].road;
    if (k !== "glb") delete p.src;
    rebuildEntity(selected); rebuildDecor(); commit();
  });
  $("pSrc")?.addEventListener("change", async () => {
    p.src = $("pSrc").value.trim().replace(/^\.?\//, "");
    await R3.loadCustomModels({ x: { pieces: [p] } });
    rebuildEntity(selected); commit();
  });
  $("pRoad").addEventListener("change", () => { p.road = $("pRoad").checked; rebuildDecor(); commit(); });
  $("pFace").onclick = () => { faceCenter(selected); queueDecor(); commit(); };
  $("pDup").onclick = duplicateSelected;
  $("pDel").onclick = deleteSelected;
}

// Ajustes del pueblo
$("lGround").onchange = () => { layout.ground = $("lGround").checked; commit(); rebuildAll(); };
$("lPlaza").onchange = () => { layout.plaza = $("lPlaza").checked; rebuildDecor(); commit(); };
$("lPlazaR").oninput = () => { layout.plazaR = parseFloat($("lPlazaR").value); queueDecor(); };
$("lPlazaR").onchange = () => commit();
$("lRoads").onchange = () => { layout.roads = $("lRoads").checked; rebuildDecor(); commit(); };
$("lLamps").onchange = () => { layout.lamps = $("lLamps").checked; rebuildDecor(); commit(); };
$("lVillagers").onchange = () => {
  const v = parseInt($("lVillagers").value, 10);
  if (Number.isFinite(v)) layout.villagers = Math.max(0, Math.min(16, v)); else delete layout.villagers;
  commit();
};

// Barra superior
$("mTranslate").onclick = () => setMode("translate");
$("mRotate").onclick = () => setMode("rotate");
$("mScale").onclick = () => setMode("scale");
$("snap").onchange = applySnap;
$("undo").onclick = undo;
$("redo").onclick = redo;
$("vFree").onclick = () => setView("free");
$("vCam").onclick = () => setView("cam");
$("vTop").onclick = () => setView("top");
$("demo").onclick = () => { persist(); window.open(`demo3d.html?el=${el}`, "_blank"); };
$("vPerson").onchange = () => (person.visible = $("vPerson").checked);
$("vGrid").onchange = () => (grid.visible = $("vGrid").checked);
$("vAnim").onchange = () => { animate = $("vAnim").checked; if (!animate) for (const p of Object.values(R3.fx)) p.clear(); };

$("random").onclick = () => {
  layout.pieces = randomLayout(el).pieces;
  if (layout.ground === false) layout.ground = true;
  commit(); rebuildAll();
};
$("clear").onclick = () => {
  if (layout.pieces.length && !confirm("¿Borrar todas las piezas de este pueblo?")) return;
  layout.pieces = [];
  commit(); rebuildAll();
};
$("reset").onclick = async () => {
  if (!confirm("Se borra el pueblo que armaste para este reino (en el navegador y el archivo models/pueblo_" + el + ".json) y vuelve el original. ¿Seguir?")) return;
  clearTimeout(saveTimers[el]);
  localStorage.removeItem(layoutKey(el));
  await fetch(`api/models/pueblo_${el}.json`, { method: "DELETE" }).catch(() => {});
  const fresh = await loadLayouts();
  if (fresh[el]) savedLayouts[el] = fresh[el]; else delete savedLayouts[el];
  openElement(el);
  toast("Listo: volviste al pueblo original");
};

// Exportar / importar
async function saveFile(name, blob, types) {
  if (window.showSaveFilePicker) {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: name, types });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return true;
    } catch (e) { if (e.name === "AbortError") return false; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}
$("exportJson").onclick = async () => {
  persist();
  const ok = await saveFile(`pueblo_${el}.json`, new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" }),
    [{ description: "Plano de pueblo", accept: { "application/json": [".json"] } }]);
  if (ok) toast(`Guardalo como models/pueblo_${el}.json dentro del proyecto`, 4500);
};
$("importJson").onclick = () => $("jsonFile").click();
$("jsonFile").onchange = async () => {
  const f = $("jsonFile").files[0];
  $("jsonFile").value = "";
  if (!f) return;
  try {
    const L = JSON.parse(await f.text());
    if (!Array.isArray(L.pieces)) throw new Error("no tiene piezas");
    if (L.element && EL_KEYS.includes(L.element) && L.element !== el) openElement(L.element);
    await R3.loadCustomModels({ x: L });
    layout = normalize(L);
    commit(); rebuildAll();
    toast(`Importado: ${layout.pieces.length} piezas`);
  } catch (e) { toast("No se pudo leer el archivo: " + e.message, 4000); }
};
$("exportGlb").onclick = () => {
  const objs = [piecesGroup, decor].filter(Boolean);
  new GLTFExporter().parse(objs, async (glb) => {
    await saveFile(`pueblo_${el}.glb`, new Blob([glb], { type: "model/gltf-binary" }), [{ description: "Modelo 3D", accept: { "model/gltf-binary": [".glb"] } }]);
  }, (err) => toast("Error al exportar: " + err.message, 4000), { binary: true, onlyVisible: true });
};

// Modelo propio (.glb): se copia solo a models/ (y una copia queda en el navegador por si acaso)
$("glbFile").onchange = async () => {
  const f = $("glbFile").files[0];
  $("glbFile").value = "";
  if (!f) return;
  const name = f.name.replace(/[^\w\-. ()áéíóúñÁÉÍÓÚÑ]/g, "_");
  try {
    await placeGlb(name, await f.arrayBuffer(), false);
  } catch (e) { toast("No se pudo abrir el modelo: " + e.message, 4000); }
};

// Pone un .glb en el pueblo. inModels = el archivo ya está en models/ (no hace falta subirlo)
async function placeGlb(name, buf, inModels) {
  const src = "models/" + name;
  {
    const gltf = await new GLTFLoader().parseAsync(buf.slice(0), "");
    R3.custom = R3.custom || {};
    R3.custom[src] = gltf;
    await glbStore.put(src, buf).catch((e) => console.warn("No se pudo guardar el modelo en el navegador", e));
    // Tamaño inicial según lo que es: un pueblo entero (bajo y ancho, o grande en metros de Blender)
    // ocupa todo el círculo y va al centro; una casa o un objeto suelto entra más chico y se pone con clic.
    const sz = new THREE.Box3().setFromObject(gltf.scene, true).getSize(new THREE.Vector3());
    const wide = Math.max(sz.x, sz.z), tall = sz.y;
    const isTown = wide >= 12 || (wide > 0 && tall / wide < 0.45);
    if (isTown) {
      cancelPlacing();
      // El tamaño es la medida más grande del modelo: 1.9 llena casi todo el círculo (diámetro 2)
      addPiece({ kind: "glb", src, size: 1.9, x: 0, z: 0, rot: 0 });
    } else {
      startPlacing("glb", { src, size: 0.5 });
    }
    const saved = inModels || (await uploadModel(name, buf));
    const where = saved ? "Guardado en models/." : "Guardado solo en este navegador: abrí la app con iniciar.bat para que se copie a models/.";
    toast(isTown ? `Pueblo "${name}" puesto en el centro, del tamaño del círculo (ajustalo con S o "Tamaño"). ${where}` : `"${name}": hacé clic en el piso para ponerlo. ${where}`, 6000);
  }
}

// Archivo de Blender (.blend): lo convierte servidor.py con Blender (hornea los colores y exporta a models/)
$("blendFile").onchange = async () => {
  const f = $("blendFile").files[0];
  $("blendFile").value = "";
  if (!f) return;
  const btn = $("blendBtn");
  const label = btn.textContent;
  const status = (msg) => { btn.textContent = msg; $("saveState").textContent = msg; };
  btn.disabled = true;
  try {
    if (!(await listModelFiles())) throw new Error("para subir un .blend abrí la app con iniciar.bat (el servidor es el que usa Blender)");
    // ¿El servidor abierto ya sabe convertir .blend? (si es una versión anterior, corta la conexión
    // a mitad de la subida y el navegador solo dice "Failed to fetch")
    const info = await fetch("api/blender", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (!info) throw new Error("el servidor abierto es una versión anterior. Cerrá la ventana negra del servidor y abrí iniciar.bat de nuevo.");
    if (!info.blender) throw new Error("no encontré Blender instalado en esta computadora.");
    status("Subiendo .blend…");
    let r;
    try {
      r = await fetch(`api/blend?nombre=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
    } catch {
      throw new Error("se cortó la conexión con el servidor al subir el archivo. Fijate que la ventana del servidor siga abierta y probá de nuevo.");
    }
    const res = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(res.error || `el servidor respondió ${r.status}`);
    toast("Blender está convirtiendo el archivo: hornea los colores y lo pasa a .glb. Puede tardar unos minutos.", 6000);
    // Preguntar cada segundo cómo va
    let job;
    for (;;) {
      await new Promise((ok) => setTimeout(ok, 1000));
      job = await fetch(`api/blend/${res.id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => {
        throw new Error("se perdió la conexión con el servidor mientras Blender trabajaba. ¿Se cerró la ventana del servidor?");
      });
      if (job.estado === "listo" || job.estado === "error") break;
      status(job.estado === "horneando" && job.total ? `Blender: horneando ${job.avance}/${job.total}…`
        : job.estado === "exportando" ? "Blender: exportando .glb…" : "Blender: abriendo el archivo…");
    }
    if (job.estado === "error") throw new Error(job.error);
    status("Cargando el modelo…");
    const buf = await fetch(job.src, { cache: "no-store" }).then((x) => { if (!x.ok) throw new Error("no se encontró " + job.src); return x.arrayBuffer(); });
    // Si ya había una versión vieja con el mismo nombre, las piezas que la usaban pasan a la nueva
    R3.custom = R3.custom || {};
    R3.custom[job.src] = await new GLTFLoader().parseAsync(buf.slice(0), "");
    rebuildAll();
    await placeGlb(job.src.split("/").pop(), buf, true);
  } catch (e) {
    toast("No se pudo convertir el .blend: " + e.message, 8000);
    $("saveState").textContent = "—";
  } finally {
    btn.textContent = label;
    btn.disabled = false;
  }
};

// ---------------------------------------------------------------------------
// Bucle
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  orbit.update();
  if (kit) {
    kit.time += dt;
    kit.animateMaterials();
    if (animate) {
      const run = (fx) => { for (const m of fx.movers) m(dt); for (const e of fx.emitters) e(dt); };
      run(groundFx); run(decorFx);
      for (const ent of entities) run(ent);
      if (placing) for (const m of placing.ent.movers) m(dt);
    }
  }
  if (animate) for (const p of Object.values(R3.fx)) p.update(dt);
  if (selected) { selBox.setFromObject(selected.obj); selBox.visible = true; } else selBox.visible = false;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

setMode("translate");
applySnap();
resize();
openElement(el);
requestAnimationFrame(frame);
syncToProject();
window.editor = { R3, get layout() { return layout; }, get kit() { return kit; } };
