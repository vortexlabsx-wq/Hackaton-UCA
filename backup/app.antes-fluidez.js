// Cámara en vivo + detección de persona + minimundo elemental en el piso (MediaPipe, todo en el navegador)
import { ELEMENTS, randomElement, Realms } from "./world3d.js";

// Motor 3D (three.js): reinos con pueblos, criaturas y su unión con la persona
const realms = new Realms();
realms.load().catch((e) => { console.error(e); realms.status = "ERROR: " + (e.message || e); });
let nextTrackId = 1;

const $ = (id) => document.getElementById(id);
let lastWorldTime = performance.now();
const video = $("video");
const output = $("output");
const ctx = output.getContext("2d");

const maskCanvas = document.createElement("canvas");   // máscara a resolución del modelo
const maskCtx = maskCanvas.getContext("2d");
const personCanvas = document.createElement("canvas"); // persona recortada
const personCtx = personCanvas.getContext("2d");
const maskSoft = document.createElement("canvas");     // máscara con el borde difuminado
const maskSoftCtx = maskSoft.getContext("2d");

const state = {
  segmenter: null, model: "cargando…", camera: "—", res: "—",
  masks: "—", lastError: "", running: false,
  pose: null, poseModel: "cargando…", poses: [], feet: "—",
};
const perf = { pose: 0, seg: 0, d3: 0, total: 0, lastD3: 0 };
const ema = (k, ms) => (perf[k] = perf[k] * 0.9 + ms * 0.1);
let tracks = []; // personas seguidas: {x, y, w, missed}
let lastVideoTime = -1, bgImage = null, frames = 0, lastFpsTime = performance.now();
let currentStream = null;
let prevMask = null; // máscara del fotograma anterior (suavizado temporal)

// ---------- Utilidades de interfaz ----------
function setStatus(text, kind) {
  $("status").textContent = text;
  $("status").className = `badge badge-${kind}`;
}
const showError = (msg) => { $("errorMsg").textContent = msg; };
function updateDiag() {
  $("diag").textContent =
    `Página: ${location.protocol}//${location.host || "(archivo)"}\n` +
    `Modelo: ${state.model}\n` +
    `Cámara: ${state.camera}\n` +
    `Resolución: ${state.res}\n` +
    `Máscaras: ${state.masks}\n` +
    `Pose: ${state.poseModel}\n` +
    `3D: ${realms.status}\n` +
    `Tiempo por cuadro: ${perf.total.toFixed(0)} ms (pose ${perf.pose.toFixed(0)} · fondo ${perf.seg.toFixed(0)} · 3D ${perf.d3.toFixed(0)})\n` +
    `Personas (pose): ${state.poses.length}\n` +
    `Pies: ${state.feet}\n` +
    (state.lastError ? `Último error: ${state.lastError}` : "");
}
setInterval(updateDiag, 500);

// ---------- 1. Modelo (se carga en paralelo; la cámara no depende de él) ----------
async function loadModel() {
  const { ImageSegmenter, PoseLandmarker, FilesetResolver } = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs"
  );
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  loadPose(PoseLandmarker, vision); // en paralelo; si falla, se usa la máscara como respaldo
  const opts = (delegate) => ({
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
      delegate,
    },
    runningMode: "VIDEO",
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
  try {
    state.segmenter = await ImageSegmenter.createFromOptions(vision, opts("GPU"));
    state.model = "listo (GPU)";
  } catch (e) {
    console.warn("GPU no disponible, usando CPU", e);
    state.segmenter = await ImageSegmenter.createFromOptions(vision, opts("CPU"));
    state.model = "listo (CPU)";
  }
  if (!state.running) setStatus("Modelo listo", "ok");
}

// Modelo de pose: detecta tobillos, talones y puntas de los pies (hasta 4 personas)
async function loadPose(PoseLandmarker, vision) {
  const opts = (delegate) => ({
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate,
    },
    runningMode: "VIDEO",
    numPoses: 4,
  });
  try {
    try {
      state.pose = await PoseLandmarker.createFromOptions(vision, opts("GPU"));
      state.poseModel = "listo (GPU)";
    } catch {
      state.pose = await PoseLandmarker.createFromOptions(vision, opts("CPU"));
      state.poseModel = "listo (CPU)";
    }
  } catch (e) {
    console.error(e);
    state.poseModel = "no disponible (uso la máscara)";
  }
}

// ---------- 2. Cámara ----------
const isIR = (label) => /\bIR\b|infrared|infrarroj/i.test(label || "");

function explainError(err) {
  switch (err.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Permiso de cámara denegado.\n• Clic en el candado/ícono de cámara de la barra de direcciones → Permitir → recarga la página.\n" +
             "• Windows: Configuración > Privacidad y seguridad > Cámara > activa el acceso y 'Permitir que las aplicaciones de escritorio accedan'.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No se encontró esa cámara. Elige otra en el selector.";
    case "NotReadableError":
    case "AbortError":
      return "La cámara está ocupada por otra aplicación (Teams, Zoom, Discord, app Cámara, otra pestaña…). Ciérrala y pulsa Reintentar.";
    default:
      return `No se pudo abrir la cámara (${err.name}): ${err.message}`;
  }
}

let knownCameras = null; // ids de las cámaras vistas, para avisar cuando se conecta una nueva
const showInfo = (msg) => {
  $("infoMsg").textContent = msg;
  clearTimeout(showInfo.t);
  if (msg) showInfo.t = setTimeout(() => ($("infoMsg").textContent = ""), 6000);
};

async function listCameras() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  const sel = $("cameraSelect");
  const prev = sel.value;
  sel.innerHTML = "";

  if (!devices.length) {
    sel.innerHTML = '<option value="">(no hay cámaras)</option>';
  } else if (!devices[0].label) {
    // Sin permiso todavía, el navegador oculta los nombres
    sel.innerHTML = `<option value="">(automática — ${devices.length} cámara(s); pulsa Iniciar para ver los nombres)</option>`;
  } else {
    devices.forEach((d, i) => {
      const o = document.createElement("option");
      o.value = d.deviceId;
      // Chrome añade el id USB (vendor:product) al nombre, p. ej. "Logitech C920 (046d:082d)"
      const name = (d.label || `Cámara ${i + 1}`).replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "");
      const tag = isIR(d.label) ? " — infrarroja" : "";
      o.textContent = name + tag;
      o.disabled = isIR(d.label);
      sel.appendChild(o);
    });
    if (devices.some((d) => d.deviceId === prev)) sel.value = prev;
  }

  // Avisar de cámaras conectadas/desconectadas
  const ids = new Set(devices.map((d) => d.deviceId));
  if (knownCameras && devices[0]?.label) {
    const added = devices.filter((d) => !knownCameras.has(d.deviceId));
    const removed = [...knownCameras].filter((id) => !ids.has(id)).length;
    if (added.length) showInfo(`Cámara conectada: ${added.map((d) => d.label).join(", ")}. Elígela en el selector.`);
    else if (removed) showInfo("Se desconectó una cámara.");
  }
  if (devices[0]?.label) knownCameras = ids;
  return devices;
}

// Detectar cámaras USB conectadas o desconectadas en caliente
navigator.mediaDevices?.addEventListener?.("devicechange", () => listCameras());

function openStream(deviceId) {
  const video = deviceId ? { deviceId: { exact: deviceId } } : true;
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

async function startCamera() {
  showError("");
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    showError("El navegador bloquea la cámara porque la página no se abrió desde el servidor.\nEjecuta iniciar.bat y entra en http://localhost:8000");
    return;
  }
  const btn = $("startBtn");
  btn.disabled = true;
  btn.textContent = "Conectando…";
  try {
    currentStream?.getTracks().forEach((t) => t.stop());
    let stream = await openStream($("cameraSelect").value);

    // Si eligió la cámara infrarroja (sin imagen útil), cambiar a la normal
    const devices = await listCameras();
    if (isIR(stream.getVideoTracks()[0].label)) {
      const normal = devices.find((d) => !isIR(d.label));
      if (normal) {
        stream.getTracks().forEach((t) => t.stop());
        stream = await openStream(normal.deviceId);
      }
    }
    const track = stream.getVideoTracks()[0];
    $("cameraSelect").value = track.getSettings().deviceId || "";
    state.camera = track.label || "(sin nombre)";
    // Si desenchufan la cámara en uso, pasar a otra disponible
    track.addEventListener("ended", async () => {
      if (currentStream !== stream) return;
      showError("Se desconectó la cámara en uso. Cambiando a otra…");
      await listCameras();
      $("cameraSelect").value = "";
      const first = [...$("cameraSelect").options].find((o) => o.value && !o.disabled);
      if (first) { $("cameraSelect").value = first.value; startCamera(); }
    });
    currentStream = stream;

    if (videoURL) $("mirror").checked = true; // volviendo de un video a la cámara
    clearVideoFile();
    video.srcObject = stream;
    await onVideoReady();
    btn.textContent = "Reiniciar cámara";
    $("pauseBtn").disabled = true;
    $("speed").disabled = true;
  } catch (err) {
    console.error(err);
    state.lastError = `${err.name}: ${err.message}`;
    setStatus("Sin acceso a la cámara", "none");
    showError(explainError(err));
    btn.textContent = "Reintentar";
  } finally {
    btn.disabled = false;
  }
}

// Común a cámara y video: esperar el primer cuadro, ajustar tamaños y arrancar el bucle
async function onVideoReady() {
  await new Promise((r) => (video.readyState >= 1 ? r() : (video.onloadedmetadata = r)));
  await video.play();
  // Videos muy grandes (1080p, 4K) se procesan a 1280 px de ancho para que vaya fluido
  const k = Math.min(1, 1280 / video.videoWidth);
  output.width = personCanvas.width = Math.round(video.videoWidth * k);
  output.height = personCanvas.height = Math.round(video.videoHeight * k);
  state.res = `${video.videoWidth}×${video.videoHeight}` + (k < 1 ? ` (procesado a ${output.width}×${output.height})` : "");
  $("ph1")?.remove();
  $("ph2")?.remove();
  $("snapBtn").disabled = false;
  if (!state.running) {
    state.running = true;
    requestAnimationFrame(loop);
  }
}

// ---------- 2b. Video desde un archivo (para probar sin moverse) ----------
let videoURL = null;
function clearVideoFile() {
  if (!videoURL) return;
  video.pause();
  video.removeAttribute("src");
  URL.revokeObjectURL(videoURL);
  videoURL = null;
}

async function startVideoFile(file) {
  showError("");
  try {
    currentStream?.getTracks().forEach((t) => t.stop());
    currentStream = null;
    clearVideoFile();
    video.srcObject = null;
    videoURL = URL.createObjectURL(file);
    video.src = videoURL;
    video.loop = true;
    video.muted = true;
    $("mirror").checked = false; // un video grabado no se ve en espejo
    state.camera = `Video: ${file.name}`;
    await onVideoReady();
    $("startBtn").textContent = "Usar cámara";
    $("pauseBtn").disabled = false;
    $("pauseBtn").textContent = "⏸ Pausa";
    $("speed").disabled = false;
    video.playbackRate = parseFloat($("speed").value);
  } catch (err) {
    console.error(err);
    state.lastError = `${err.name}: ${err.message}`;
    showError(`No se pudo reproducir el video (${err.message}).\nPrueba con un MP4 (H.264) o WebM.`);
  }
}

$("videoFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) startVideoFile(file);
  e.target.value = ""; // permite volver a elegir el mismo archivo
});

$("speed").addEventListener("change", () => { if (videoURL) video.playbackRate = parseFloat($("speed").value); });

$("pauseBtn").addEventListener("click", () => {
  if (!videoURL) return;
  if (video.paused) { video.play(); $("pauseBtn").textContent = "⏸ Pausa"; }
  else { video.pause(); $("pauseBtn").textContent = "▶ Seguir"; }
});

// ---------- Calidad (rendimiento) ----------
// procW: ancho de la imagen que analizan los modelos de IA · scale: resolución del 3D · shadow: tamaño del mapa de sombras
const QUALITY = [
  { name: "Baja",  procW: 256, scale: 0.5,  shadow: 0,    poseEvery: 3 },
  { name: "Media", procW: 384, scale: 0.75, shadow: 1024, poseEvery: 2 },
  { name: "Alta",  procW: 512, scale: 1,    shadow: 2048, poseEvery: 1 },
];
let qLevel = 1, lastQChange = 0, poseTick = 0;
const quality = () => QUALITY[$("quality").value === "auto" ? qLevel : +$("quality").value];
$("quality").addEventListener("change", () => { if ($("quality").value !== "auto") qLevel = +$("quality").value; });

// Modo automático: baja la calidad si va lento y la sube si sobra potencia
function autoQuality(fps) {
  if ($("quality").value !== "auto" || !state.running) return;
  const now = performance.now();
  if (now - lastQChange < 3000) return;
  if (fps < 18 && qLevel > 0) { qLevel--; lastQChange = now; }
  else if (fps > 40 && qLevel < 2) { qLevel++; lastQChange = now; }
}

// Copia chica del cuadro para los modelos de IA (mucho más rápido que el cuadro completo)
const procCanvas = document.createElement("canvas");
const procCtx = procCanvas.getContext("2d", { willReadFrequently: false });
function procFrame() {
  const pw = quality().procW;
  const ph = Math.round((pw * video.videoHeight) / video.videoWidth);
  if (procCanvas.width !== pw || procCanvas.height !== ph) { procCanvas.width = pw; procCanvas.height = ph; }
  procCtx.drawImage(video, 0, 0, pw, ph);
  return procCanvas;
}

// ---------- 3. Bucle ----------
function loop() {
  video.classList.toggle("mirror", $("mirror").checked);

  // Con el video en pausa se sigue procesando el mismo cuadro, así el reino 3D sigue animado
  if (video.readyState >= 2 && (video.currentTime !== lastVideoTime || video.paused)) {
    lastVideoTime = video.currentTime;
    const ts = performance.now();
    const src = procFrame();
    // El esqueleto se calcula cada 1-3 cuadros según la calidad (el seguimiento suaviza el resto)
    poseTick++;
    if (state.pose && $("showRing").checked && poseTick % quality().poseEvery === 0) {
      try {
        state.poses = state.pose.detectForVideo(src, ts).landmarks || [];
        ema("pose", performance.now() - ts);
      } catch (e) {
        state.lastError = "pose: " + (e.message || e);
        state.poses = [];
      }
    } else if (!$("showRing").checked) {
      state.poses = [];
    }
    if (state.segmenter) {
      try {
        const t1 = performance.now();
        state.segmenter.segmentForVideo(src, ts, render);
        ema("seg", performance.now() - t1 - perf.lastD3);
      } catch (e) {
        state.lastError = String(e.message || e);
        drawRaw();
      }
    } else {
      drawRaw(); // el modelo todavía carga: mostrar la cámara tal cual
    }
    frames++;
    ema("total", performance.now() - ts);
  }

  const now = performance.now();
  if (now - lastFpsTime >= 1000) {
    $("fps").textContent = `${frames} · calidad ${quality().name.toLowerCase()}`;
    autoQuality(frames);
    frames = 0;
    lastFpsTime = now;
  }
  requestAnimationFrame(loop);
}

function drawRaw() {
  ctx.save();
  if ($("mirror").checked) { ctx.translate(output.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, 0, 0, output.width, output.height);
  ctx.restore();
}

// ---------- 4. Quitar el fondo ----------
function render(result) {
  perf.lastD3 = 0;
  const masks = result.confidenceMasks;
  if (!masks || !masks.length) { drawRaw(); return; }
  // Con 1 máscara = persona; con 2 = [fondo, persona] -> la persona es siempre la última
  const mask = masks[masks.length - 1];
  state.masks = `${masks.length} (${mask.width}×${mask.height})`;

  const mw = mask.width, mh = mask.height;
  const data = mask.getAsFloat32Array();
  const threshold = parseFloat($("threshold").value);

  if (maskCanvas.width !== mw || maskCanvas.height !== mh) {
    maskCanvas.width = mw;
    maskCanvas.height = mh;
  }
  // Suavizado temporal: mezclar con la máscara anterior para que el borde no parpadee
  const k = parseFloat($("smoothing").value);
  if (!prevMask || prevMask.length !== data.length) prevMask = new Float32Array(data);

  const img = maskCtx.createImageData(mw, mh);
  const half = parseFloat($("softness").value) / 2;
  const lo = threshold - half, hi = threshold + half;
  let count = 0, minX = mw, minY = mh, maxX = -1, maxY = -1;

  for (let i = 0; i < data.length; i++) {
    const p = (prevMask[i] = prevMask[i] * k + data[i] * (1 - k));
    // smoothstep: transición en curva suave en vez de un corte brusco
    let t = (p - lo) / (hi - lo);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    img.data[i * 4 + 3] = t * t * (3 - 2 * t) * 255;
    if (p > threshold) {
      count++;
      const x = i % mw, y = (i / mw) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  maskCtx.putImageData(img, 0, 0);

  const detected = count / data.length > 0.02;
  setStatus(detected ? "Persona detectada" : "No hay persona", detected ? "ok" : "none");

  const W = output.width, H = output.height;

  // Persona recortada = video ∩ máscara. Con el fondo original no hace falta (se vería igual).
  const keepBg = document.querySelector('input[name="bg"]:checked').value === "original";
  if (!keepBg) {
    // El difuminado se hace sobre la máscara chica (barato) y luego se estira
    if (maskSoft.width !== mw || maskSoft.height !== mh) { maskSoft.width = mw; maskSoft.height = mh; }
    const feather = parseInt($("feather").value, 10) * (mw / 640);
    maskSoftCtx.clearRect(0, 0, mw, mh);
    maskSoftCtx.filter = feather > 0.3 ? `blur(${feather.toFixed(1)}px)` : "none";
    maskSoftCtx.drawImage(maskCanvas, 0, 0);
    maskSoftCtx.filter = "none";
    personCtx.save();
    personCtx.globalCompositeOperation = "copy";
    personCtx.drawImage(video, 0, 0, W, H);
    personCtx.globalCompositeOperation = "destination-in";
    personCtx.drawImage(maskSoft, 0, 0, W, H);
    personCtx.restore();
  }

  // Fondo + persona
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if ($("mirror").checked) { ctx.translate(W, 0); ctx.scale(-1, 1); }
  drawBackground(W, H);

  if (!keepBg) ctx.drawImage(personCanvas, 0, 0);

  // Reino 3D: la silueta de la persona tapa lo que queda detrás de ella (oclusión por profundidad)
  const ringOn = $("showRing").checked;
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastWorldTime) / 1000);
  lastWorldTime = now;
  if (ringOn) {
    const sx = W / mw, sy = H / mh;
    const bbox = detected ? { cx: ((minX + maxX) / 2) * sx, bottom: maxY * sy, w: (maxX - minX) * sx } : null;
    updateTracks(findFeet(W, H, bbox), W);
    if (realms.ready) {
      realms.setSize(W, H, parseFloat($("ringTilt").value));
      realms.setQuality(quality().scale, $("showShadow").checked ? quality().shadow : 0);
      const t3 = performance.now();
      realms.update(dt, tracks, { ...worldOpts(), ringSize: parseFloat($("ringSize").value) });
      ctx.drawImage(realms.render(maskCanvas), 0, 0, W, H);
      perf.lastD3 = performance.now() - t3;
      ema("d3", perf.lastD3);
      if ($("showLight").checked) drawRealmLight(W, H);
    }
  } else if (realms.ready && realms.realms.size) {
    realms.clear();
  }
  if (ringOn && $("showJoints").checked) drawFeetPoints(W, H);

  if (detected && $("showBox").checked) {
    const sx = W / mw, sy = H / mh;
    ctx.strokeStyle = "#6ee38a";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 6]);
    ctx.strokeRect(minX * sx, minY * sy, (maxX - minX) * sx, (maxY - minY) * sy);
  }
  ctx.restore();

  // Nombre del elemento (fuera del espejo para que el texto no salga al revés)
  if (ringOn && $("showLabel").checked) {
    const mirror = $("mirror").checked;
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = `600 ${Math.round(W / 40)}px system-ui, sans-serif`;
    for (const t of tracks) {
      const g = worldGeom(t);
      const el = ELEMENTS[t.element];
      const lx = mirror ? W - g.x : g.x;
      const ly = Math.min(H - 10, g.y + g.ry + W / 30);
      ctx.globalAlpha = t.alpha;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.strokeText(`${el.emoji} ${el.name}`, lx, ly);
      ctx.fillStyle = el.color;
      ctx.fillText(`${el.emoji} ${el.name}`, lx, ly);
    }
    ctx.restore();
  }
}

const worldOpts = () => ({ shadow: $("showShadow").checked, light: $("showLight").checked });

// Luz del reino sobre la escena real (incluida la persona): fuego naranja que parpadea, agua azulada…
function drawRealmLight(W, H) {
  const t = performance.now() / 1000;
  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  for (const tr of tracks) {
    const el = ELEMENTS[tr.element];
    const flick = tr.element === "fuego" ? 0.8 + 0.2 * Math.sin(t * 13) * Math.sin(t * 7.3) : 0.9 + 0.1 * Math.sin(t * 1.5);
    const R = tr.w * parseFloat($("ringSize").value) * 2.8;
    const cy = tr.y - R * 0.35;
    const gr = ctx.createRadialGradient(tr.x, cy, 0, tr.x, cy, R);
    gr.addColorStop(0, el.light);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = tr.alpha * flick;
    ctx.fillStyle = gr;
    ctx.fillRect(tr.x - R, cy - R, R * 2, R * 2);
  }
  ctx.restore();
}

// Suaviza los 33 puntos del cuerpo para que las criaturas no tiemblen
function smoothBody(prev, next, a = 0.5) {
  if (!prev) return next.map((p) => ({ ...p }));
  return next.map((p, i) => ({ x: prev[i].x + (p.x - prev[i].x) * a, y: prev[i].y + (p.y - prev[i].y) * a, v: p.v }));
}

function worldGeom(t) {
  const rx = t.w * parseFloat($("ringSize").value);
  return { x: t.x, y: t.y, rx, ry: rx * 0.3, alpha: t.alpha };
}

// ---------- 4b. Detección del piso y círculo que sigue a la persona ----------
// Índices de MediaPipe Pose
const SHOULDERS = [11, 12], HIPS = [23, 24], FEET = [27, 28, 29, 30, 31, 32]; // tobillos, talones, puntas
const visible = (p) => p && (p.visibility ?? 1) > 0.5 && p.x > -0.05 && p.x < 1.05 && p.y < 1.05;

// Devuelve el punto de contacto con el piso de cada persona, en píxeles
function findFeet(W, H, bbox) {
  const out = [];
  const notes = [];
  for (const lm of state.poses) {
    const feet = FEET.map((i) => lm[i]).filter(visible);
    const hips = HIPS.map((i) => lm[i]);
    const sh = SHOULDERS.map((i) => lm[i]);
    const hipX = (hips[0].x + hips[1].x) / 2, hipY = (hips[0].y + hips[1].y) / 2;
    const shY = (sh[0].y + sh[1].y) / 2;
    // Ancho del cuerpo: el mayor entre hombros y caderas
    const bodyW = Math.max(Math.abs(sh[0].x - sh[1].x), Math.abs(hips[0].x - hips[1].x)) * W;

    let x, y;
    if (feet.length >= 2) {
      // Piso = el punto más bajo de los pies visibles
      y = Math.max(...feet.map((p) => p.y)) * H;
      x = (feet.reduce((s, p) => s + p.x, 0) / feet.length) * W;
      notes.push("visibles");
    } else {
      // Pies fuera de cuadro: estimar con proporciones (cadera→tobillo ≈ 1.7 × torso)
      const torso = Math.max(hipY - shY, 0.05);
      y = (hipY + torso * 1.7) * H;
      x = hipX * W;
      notes.push("estimados");
    }
    // Puntos del cuerpo en píxeles (para las criaturas que caminan por la persona)
    const body = lm.map((p) => ({ x: p.x * W, y: p.y * H, v: p.visibility ?? 1 }));
    out.push({ x, y, w: Math.max(bodyW, W * 0.06), body });
  }
  // Respaldo sin modelo de pose: usar la parte de abajo de la silueta
  if (!out.length && bbox && !state.pose) {
    out.push({ x: bbox.cx, y: bbox.bottom, w: bbox.w * 0.6 });
    notes.push("silueta");
  }
  state.feet = notes.length ? notes.join(", ") : "—";
  return out;
}

// Seguimiento: emparejar cada detección con el círculo más cercano y suavizar el movimiento
function updateTracks(dets, W) {
  const used = new Set();
  for (const t of tracks) {
    let best = -1, bestD = W * 0.25;
    dets.forEach((d, i) => {
      if (used.has(i)) return;
      const dist = Math.hypot(d.x - t.x, d.y - t.y);
      if (dist < bestD) { bestD = dist; best = i; }
    });
    if (best >= 0) {
      const d = dets[best];
      used.add(best);
      const a = 0.3; // suavizado (más bajo = más suave)
      t.x += (d.x - t.x) * a;
      t.y += (d.y - t.y) * a;
      t.w += (d.w - t.w) * a;
      t.body = d.body ? smoothBody(t.body, d.body) : null;
      t.missed = 0;
      t.alpha = Math.min(1, t.alpha + 0.15);
    } else {
      t.missed++;
      t.alpha = Math.max(0, t.alpha - 0.1); // se desvanece si la persona desaparece
    }
  }
  dets.forEach((d, i) => {
    if (used.has(i)) return;
    // Persona nueva: elemento al azar (sin repetir los que ya hay en pantalla si se puede)
    const element = randomElement(tracks.map((t) => t.element));
    tracks.push({ ...d, id: nextTrackId++, body: d.body || null, missed: 0, alpha: 0, element });
  });
  tracks = tracks.filter((t) => t.missed < 45); // ~1.5 s de margen para no perder el mundo
}

$("shuffleBtn").addEventListener("click", () => {
  for (const t of tracks) {
    const others = tracks.filter((o) => o !== t).map((o) => o.element);
    t.element = randomElement([...others, t.element]); // el motor 3D reconstruye el reino al ver el cambio
  }
});

function drawFeetPoints(W, H) {
  ctx.save();
  ctx.fillStyle = "#ffeb3b";
  for (const lm of state.poses) {
    for (const i of FEET) {
      const p = lm[i];
      if (!visible(p)) continue;
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBackground(W, H) {
  const mode = document.querySelector('input[name="bg"]:checked').value;
  if (mode === "original") {
    ctx.drawImage(video, 0, 0, W, H);
  } else if (mode === "blur") {
    ctx.filter = "blur(14px)";
    ctx.drawImage(video, 0, 0, W, H);
    ctx.filter = "none";
  } else if (mode === "color") {
    ctx.fillStyle = $("bgColor").value;
    ctx.fillRect(0, 0, W, H);
  } else if (mode === "image" && bgImage) {
    const s = Math.max(W / bgImage.width, H / bgImage.height);
    const w = bgImage.width * s, h = bgImage.height * s;
    ctx.drawImage(bgImage, (W - w) / 2, (H - h) / 2, w, h);
  }
}

// ---------- 5. Controles ----------
$("startBtn").addEventListener("click", startCamera);
$("cameraSelect").addEventListener("change", () => { if (currentStream) startCamera(); });
$("refreshBtn").addEventListener("click", async () => {
  const n = (await listCameras()).length;
  showInfo(`${n} cámara(s) encontrada(s).`);
});
listCameras(); // llenar el selector al abrir la página

$("bgImage").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const im = new Image();
  im.onload = () => {
    bgImage = im;
    document.querySelector('input[name="bg"][value="image"]').checked = true;
  };
  im.src = URL.createObjectURL(file);
});

$("snapBtn").addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = `captura-${Date.now()}.png`;
  a.href = output.toDataURL("image/png");
  a.click();
});

// ---------- Arranque ----------
if (!window.isSecureContext) {
  showError("Abriste el archivo directamente y así el navegador bloquea la cámara.\nEjecuta iniciar.bat y entra en http://localhost:8000");
}
loadModel().catch((err) => {
  console.error(err);
  state.model = "ERROR: " + (err.message || err);
  setStatus("Error al cargar el modelo", "none");
  showError("No se pudo cargar el modelo de detección. Revisa la conexión a internet (la cámara en vivo sí funcionará).");
});
updateDiag();
