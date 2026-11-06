# Genera el pueblo de tierra (diorama medieval) en Blender y lo exporta a GLB para la app.
#
# Uso (sin abrir Blender):
#   blender -b --python-exit-code 1 -P blender/aldea_tierra.py -- models/aldea_tierra.glb vista_previa.png
#
# Inspirado en la imagen de referencia: base cuadrada con muros de piedra, torre sobre una colina,
# casas con entramado de madera, molino con rueda hidráulica, río con puente de piedra y cascadas,
# plaza empedrada con fuente, puestos de mercado, árboles y faroles.
#
# Objetos con nombre que la app usa:
#   waterwheel (gira) · flag (ondea) · water* (agua animada) · door_N (puertas: salen aldeanos)
#   chimney_N (humo) · plaza (centro, donde está la persona)

import bpy, bmesh, math, random, sys
import numpy as np
from mathutils import Matrix, Vector, Euler, noise

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT_GLB = argv[0] if len(argv) > 0 else "aldea_tierra.glb"
OUT_PNG = argv[1] if len(argv) > 1 else ""
random.seed(11)
rng = np.random.default_rng(11)

bpy.ops.wm.read_factory_settings(use_empty=True)

S = 1.2          # medio lado de la base
TOP = 0.0        # altura del piso (pies de la persona)
BASE_H = 0.5     # alto del bloque de piedra

# =============================================================================
# Texturas generadas (numpy) — todas repetibles en mosaico
# =============================================================================
N = 512
yy, xx = np.mgrid[0:N, 0:N]

def smooth_noise(cells):
    g = rng.random((cells + 1, cells + 1))
    g[cells, :] = g[0, :]
    g[:, cells] = g[:, 0]
    t = np.linspace(0, cells, N, endpoint=False)
    i = t.astype(int)
    f = t - i
    f = f * f * (3 - 2 * f)
    a, b = g[np.ix_(i, i)], g[np.ix_(i, i + 1)]
    c, d = g[np.ix_(i + 1, i)], g[np.ix_(i + 1, i + 1)]
    fy, fx = f[:, None], f[None, :]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy

def fbm(base, octaves=4):
    out, amp, tot = np.zeros((N, N)), 1.0, 0.0
    for o in range(octaves):
        out += smooth_noise(base * 2 ** o) * amp
        tot += amp
        amp *= 0.5
    return out / tot

def hexc(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])

def tex_stone(base="#8a857c", moss=True):
    img = np.zeros((N, N, 3))
    mortar = hexc("#3a3632")
    b = hexc(base)
    y = 0
    while y < N:
        y2 = min(N, y + int(rng.integers(38, 66)))
        x = -int(rng.integers(0, 90))
        while x < N:
            w = int(rng.integers(55, 130))
            x1, x2 = max(0, x), min(N, x + w)
            if x2 > x1:
                tone = rng.uniform(0.75, 1.15)
                warm = rng.uniform(-0.025, 0.025)
                img[y:y2, x1:x2] = b * tone + np.array([warm, warm * 0.6, -warm * 0.3])
                img[max(y, y2 - 7):y2, x1:x2] *= 0.78
                img[y:y2, max(x1, x2 - 6):x2] *= 0.84
                img[y:min(y2, y + 4), x1:x2] *= 1.12
                img[y:y2, max(0, x2 - 3):x2] = mortar
            x += w
        img[max(0, y2 - 3):y2, :] = mortar
        y = y2
    img *= (0.72 + 0.55 * fbm(8))[..., None]
    if moss:
        m = np.clip((fbm(3, 3) - 0.66) * 3, 0, 1)[..., None]
        img = img * (1 - m * 0.45) + hexc("#4f5c30") * m * 0.45
    return img

def tex_cobble():
    cell, G = 32, N // 32
    jit = rng.random((G, G, 2)) * cell * 0.8 + cell * 0.1
    tone = rng.uniform(0.7, 1.15, (G, G))
    cx, cy = xx // cell, yy // cell
    d1 = np.full((N, N), 1e9); d2 = np.full((N, N), 1e9); idg = np.zeros((N, N), int)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            gx, gy = (cx + dx) % G, (cy + dy) % G
            px = (cx + dx) * cell + jit[gy, gx, 0]
            py = (cy + dy) * cell + jit[gy, gx, 1]
            d = np.hypot(xx - px, yy - py)
            closer = d < d1
            d2 = np.where(closer, d1, np.minimum(d2, d))
            idg = np.where(closer, gy * G + gx, idg)
            d1 = np.where(closer, d, d1)
    t = tone.ravel()[idg]
    img = hexc("#8f887c")[None, None, :] * t[..., None] * (1.05 - 0.4 * np.clip(d1 / cell, 0, 1))[..., None]
    edge = np.clip((d2 - d1) / 5, 0, 1)[..., None]
    img = img * edge + hexc("#3b3730") * (1 - edge)
    img *= (0.85 + 0.3 * fbm(6, 3))[..., None]
    return img

def tex_tiles(base):
    b = hexc(base)
    row = yy // 32
    ty = (yy % 32) / 32
    off = (row % 2) * 14
    tx = ((xx + off) % 28) / 28
    tid = row * 100 + (xx + off) // 28
    r = np.sin(tid * 12.9898) * 43758.5453
    r = r - np.floor(r)
    shade = 1.12 - 0.5 * ty
    shade = np.where(tx < 0.07, shade * 0.55, shade)
    shade = np.where(ty > 0.88, shade * 0.5, shade)
    img = b[None, None, :] * (shade * (0.82 + 0.36 * r))[..., None]
    img *= (0.8 + 0.4 * fbm(5, 3))[..., None]
    m = np.clip((fbm(3, 3) - 0.65) * 4, 0, 1)[..., None]  # algo de musgo
    return img * (1 - m * 0.5) + hexc("#56602e") * m * 0.5

def tex_plaster():
    img = hexc("#e6dcc4")[None, None, :] * (0.88 + 0.2 * fbm(6))[..., None]
    stains = np.clip((fbm(2, 3) - 0.55) * 2, 0, 1)[..., None]
    return img * (1 - stains * 0.25) + hexc("#a89878") * stains * 0.25

def tex_wood(base="#7a5536"):
    b = hexc(base)
    plank = (xx // 46) % 7
    grain = smooth_noise(64)[:, :]  # vetas
    gx = np.roll(fbm(32, 3), 0)
    img = b[None, None, :] * (0.78 + 0.12 * plank[..., None] / 6 + 0.25 * gx[..., None])
    img[(xx % 46) < 2] *= 0.5
    return img

def tex_grass():
    n = fbm(6, 5)[..., None]
    img = hexc("#4d7a2c") * (0.7 + 0.6 * n)
    dry = np.clip((fbm(3, 3) - 0.58) * 3, 0, 1)[..., None]
    img = img * (1 - dry * 0.5) + hexc("#8a8a3a") * dry * 0.5
    speck = (rng.random((N, N)) > 0.985)[..., None]
    return np.where(speck, hexc("#9cc25a"), img)

def tex_foliage():
    n = fbm(16, 4)[..., None]
    img = hexc("#3f6e28") * (0.55 + 0.9 * n)
    speck = (rng.random((N, N)) > 0.97)[..., None]
    return np.where(speck, hexc("#8fbf55"), img)

def tex_rock():
    n = fbm(5, 5)[..., None]
    img = hexc("#7c776e") * (0.6 + 0.7 * n)
    m = np.clip((fbm(3, 3) - 0.6) * 4, 0, 1)[..., None]
    return img * (1 - m * 0.6) + hexc("#4d6230") * m * 0.6

def tex_stripes(c1, c2):
    s = ((xx // 64) % 2)[..., None]
    img = np.where(s == 0, hexc(c1), hexc(c2)) * (0.9 + 0.15 * fbm(4, 2))[..., None]
    return img

def tex_water():
    n = fbm(4, 5)[..., None]
    return hexc("#2c6f96") * (0.75 + 0.5 * n) + np.clip(fbm(16, 2) - 0.7, 0, 1)[..., None] * 1.2

def tex_banner():
    img = np.zeros((N, N, 3)) + hexc("#1f3f8f")
    d = np.abs(xx - N / 2) + np.abs(yy - N / 2)
    img[(d < 110) & (d > 80)] = hexc("#e0b84a")
    img[d < 45] = hexc("#e0b84a")
    return img * (0.85 + 0.2 * fbm(4, 2))[..., None]

def make_image(name, arr):
    arr = np.clip(arr, 0, 1)
    img = bpy.data.images.new(name, N, N, alpha=False)
    rgba = np.ones((N, N, 4), dtype=np.float32)
    rgba[..., :3] = arr[::-1]  # Blender guarda las filas de abajo hacia arriba
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img

# =============================================================================
# Materiales
# =============================================================================
MATS = {}
def material(name, img=None, color=(0.8, 0.8, 0.8), rough=0.85, metal=0.0, emit=None, emit_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if img is not None:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (*color, 1)
    if emit is not None:
        bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = emit_strength
    MATS[name] = m
    return m

print("Generando texturas…")
material("piedra", make_image("piedra", tex_stone()), rough=0.95)
material("piedra_clara", make_image("piedra_clara", tex_stone("#a39d92", moss=False)), rough=0.9)
material("empedrado", make_image("empedrado", tex_cobble()), rough=0.9)
material("teja_roja", make_image("teja_roja", tex_tiles("#b4542e")), rough=0.8)
material("teja_pizarra", make_image("teja_pizarra", tex_tiles("#4d586a")), rough=0.6)
material("revoque", make_image("revoque", tex_plaster()), rough=0.95)
material("madera", make_image("madera", tex_wood()), rough=0.85)
material("viga", color=(0.12, 0.075, 0.045), rough=0.85)
material("pasto", make_image("pasto", tex_grass()), rough=1.0)
material("follaje", make_image("follaje", tex_foliage()), rough=0.95)
material("roca", make_image("roca", tex_rock()), rough=0.95)
material("toldo_rojo", make_image("toldo_rojo", tex_stripes("#c8452f", "#efe6d2")), rough=0.9)
material("toldo_azul", make_image("toldo_azul", tex_stripes("#2f5f9e", "#efe6d2")), rough=0.9)
material("agua", make_image("agua", tex_water()), rough=0.05, metal=0.1)
material("espuma", color=(0.92, 0.96, 1.0), rough=0.3)
material("estandarte", make_image("estandarte", tex_banner()), rough=0.9)
material("vidrio", color=(0.2, 0.12, 0.05), rough=0.3, emit=(1.0, 0.68, 0.32), emit_strength=3.0)
material("metal", color=(0.08, 0.08, 0.08), rough=0.5, metal=0.8)
material("tronco", make_image("tronco", tex_wood("#5a3e28")), rough=0.95)
material("flor_roja", color=(0.75, 0.12, 0.15), rough=0.8)
material("flor_rosa", color=(0.9, 0.45, 0.6), rough=0.8)
material("flor_amarilla", color=(0.95, 0.8, 0.2), rough=0.8)
material("estatua", color=(0.62, 0.6, 0.56), rough=0.7)
material("gallina", color=(0.95, 0.93, 0.88), rough=0.9)
material("verdura", color=(0.35, 0.6, 0.2), rough=0.8)
material("calabaza", color=(0.9, 0.45, 0.1), rough=0.8)
material("tierra", color=(0.32, 0.22, 0.14), rough=1.0)

TILE = {"piedra": 0.32, "piedra_clara": 0.3, "empedrado": 0.42, "teja_roja": 0.22, "teja_pizarra": 0.22, "revoque": 0.35,
        "madera": 0.3, "pasto": 0.7, "follaje": 0.22, "roca": 0.35, "toldo_rojo": 0.12, "toldo_azul": 0.12, "agua": 0.6,
        "estandarte": 0.1, "tronco": 0.12}

# =============================================================================
# Geometría acumulada por objeto y material
# =============================================================================
GEOM = {}      # objeto -> material -> {v, f, uv}
SMOOTH = set()  # materiales con sombreado suave
XFORM = {}     # objeto -> (posición, rotación)  (pivote propio: rueda, bandera)
EMPTIES = []   # (nombre, posición)

def add_bm(bm, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), obj="aldea", uv_swap=False, smooth=False):
    bm.transform(Matrix.Diagonal((*scale, 1)))
    bm.normal_update()
    bm.verts.index_update()
    tile = TILE.get(mat, 0.3)
    ox, oy = random.random(), random.random()
    g = GEOM.setdefault(obj, {}).setdefault(mat, {"v": [], "f": [], "uv": []})
    base = len(g["v"])
    R = Matrix.LocRotScale(Vector(loc), Euler(rot).to_quaternion(), Vector((1, 1, 1)))
    for v in bm.verts:
        g["v"].append(tuple(R @ v.co))
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        g["f"].append([base + l.vert.index for l in f.loops])
        for l in f.loops:
            c = l.vert.co
            u, w = (c.x, c.y) if ax == 2 else (c.y, c.z) if ax == 0 else (c.x, c.z)
            if uv_swap:
                u, w = w, u
            g["uv"].append((u / tile + ox, w / tile + oy))
    if smooth:
        SMOOTH.add(mat)
    bm.free()

def box(mat, loc, size, rot=(0, 0, 0), **k):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    add_bm(bm, mat, loc, rot, size, **k)

def cyl(mat, loc, r1, r2, h, seg=16, rot=(0, 0, 0), **k):
    """Cilindro/cono con la base en loc (z = abajo)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2))
    add_bm(bm, mat, loc, rot, (1, 1, 1), **k)

def blob(mat, loc, r, squash=1.0, rough=0.3, sub=2, **k):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    seed = Vector((random.random() * 100, random.random() * 100, random.random() * 100))
    for v in bm.verts:
        v.co *= 1 + rough * noise.noise(v.co * 1.7 + seed)
    add_bm(bm, mat, loc, (0, 0, random.random() * 6.28), (r, r, r * squash), smooth=True, **k)

def prism_xz(mat, pts, y0, y1, loc=(0, 0, 0), rot=(0, 0, 0), **k):
    """Polígono en el plano XZ extruido entre y0 e y1 (hastiales, arcos)."""
    bm = bmesh.new()
    a = [bm.verts.new((x, y0, z)) for x, z in pts]
    b = [bm.verts.new((x, y1, z)) for x, z in pts]
    bm.faces.new(a[::-1])
    bm.faces.new(b)
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    add_bm(bm, mat, loc, rot, (1, 1, 1), **k)

def ribbon(mat, pts, width, z, obj="aldea"):
    """Cinta plana siguiendo una polilínea (río, caminos)."""
    bm = bmesh.new()
    L, R = [], []
    for i, p in enumerate(pts):
        a = Vector(pts[max(0, i - 1)]); b = Vector(pts[min(len(pts) - 1, i + 1)])
        d = (b - a).normalized()
        n = Vector((-d.y, d.x)) * (width[i] if isinstance(width, list) else width) / 2
        L.append(bm.verts.new((p[0] + n.x, p[1] + n.y, z)))
        R.append(bm.verts.new((p[0] - n.x, p[1] - n.y, z)))
    for i in range(len(pts) - 1):
        bm.faces.new((L[i], R[i], R[i + 1], L[i + 1]))
    add_bm(bm, mat, obj=obj)

def empty(name, loc):
    EMPTIES.append((name, loc))

def zrot(face, rx=0.0, ry=0.0):
    """Rotación local (x, y) y luego giro 'face' alrededor de Z, como ángulos de Euler."""
    m = Matrix.Rotation(face, 4, "Z") @ Matrix.Rotation(ry, 4, "Y") @ Matrix.Rotation(rx, 4, "X")
    e = m.to_euler()
    return (e.x, e.y, e.z)

def rot2(x, y, a):
    c, s = math.cos(a), math.sin(a)
    return (x * c - y * s, x * s + y * c)

# =============================================================================
# Base del diorama
# =============================================================================
print("Construyendo la base…")
box("piedra", (0, 0, TOP - BASE_H / 2 - 0.02), (2 * S, 2 * S, BASE_H))
box("pasto", (0, 0, TOP - 0.01), (2 * S + 0.01, 2 * S + 0.01, 0.02))
# Borde con musgo y piedras sueltas
for i in range(90):
    t = random.uniform(-S, S)
    side = random.randrange(4)
    x, y = [(t, -S), (t, S), (-S, t), (S, t)][side]
    blob(random.choice(["follaje", "follaje", "roca"]), (x, y, TOP - 0.005), random.uniform(0.02, 0.045), squash=0.6)
# Piedras grandes que sobresalen del muro
for i in range(26):
    t = random.uniform(-S + 0.1, S - 0.1)
    side = random.randrange(4)
    x, y = [(t, -S), (t, S), (-S, t), (S, t)][side]
    blob("roca", (x, y, TOP - random.uniform(0.08, 0.4)), random.uniform(0.05, 0.09), squash=0.8, rough=0.35, sub=1)

# =============================================================================
# Plaza y caminos (empedrado)
# =============================================================================
print("Plaza, río y puente…")
cyl("empedrado", (0, 0, TOP), 0.55, 0.55, 0.012, seg=48)
empty("plaza", (0, 0, TOP))
ribbon("empedrado", [(0.2, -0.35), (0.38, -0.62), (0.55, -0.85), (0.75, -1.1)], 0.16, TOP + 0.013)   # hacia el puente
ribbon("empedrado", [(-0.25, 0.2), (-0.45, 0.32)], 0.14, TOP + 0.013)                                # hacia la escalera
ribbon("empedrado", [(0.3, 0.35), (0.45, 0.6)], 0.16, TOP + 0.013)                                   # hacia las casas
ribbon("empedrado", [(0.4, 0.05), (0.75, 0.25)], 0.14, TOP + 0.013)
ribbon("empedrado", [(-0.3, -0.3), (-0.5, -0.5)], 0.14, TOP + 0.013)                                 # hacia el molino

# =============================================================================
# Río con orillas de roca, puente y cascadas
# =============================================================================
river = [(-0.55, -0.78), (-0.2, -0.86), (0.15, -0.8), (0.45, -0.72), (0.8, -0.62), (S + 0.01, -0.58)]
ribbon("tierra", river, 0.26, TOP + 0.003)
ribbon("agua", river, 0.19, TOP + 0.006, obj="water")
for i in range(len(river) - 1):
    a, b = Vector(river[i]), Vector(river[i + 1])
    for k in range(5):
        p = a.lerp(b, k / 5)
        d = (b - a).normalized()
        n = Vector((-d.y, d.x))
        for side in (-1, 1):
            q = p + n * side * random.uniform(0.11, 0.14)
            blob("roca", (q.x, q.y, TOP + 0.005), random.uniform(0.018, 0.035), squash=0.6, sub=1)
# Cascada por el muro derecho
box("agua", (S + 0.012, -0.58, TOP - BASE_H / 2), (0.01, 0.17, BASE_H), obj="water")
for i in range(10):
    blob("espuma", (S + 0.03, -0.58 + random.uniform(-0.08, 0.08), TOP - BASE_H + random.uniform(0, 0.05)), random.uniform(0.02, 0.04), squash=0.6)

# Puente de piedra en arco cruzando el río
bx, by = 0.42, -0.72
ang = math.atan2(-0.85 + 0.35, 0.55 - 0.2)  # dirección del camino
span = 0.38
pts = [(-span / 2, 0.0)]
for k in range(17):
    a = math.pi - k * math.pi / 16
    pts.append((math.cos(a) * 0.12, math.sin(a) * 0.1))
pts += [(span / 2, 0.0), (span / 2, 0.11), (0.0, 0.16), (-span / 2, 0.11)]
# El arco se arma en XZ y se gira para que siga el camino
rot = (0, 0, ang)
prism_xz("piedra_clara", pts, -0.075, 0.075, loc=(bx, by, TOP), rot=rot)
for side in (-1, 1):
    for k in range(7):
        t = -span / 2 + 0.03 + k * (span - 0.06) / 6
        hz = 0.11 + 0.05 * (1 - (2 * t / span) ** 2)
        lx, ly = rot2(t, side * 0.068, ang)
        box("piedra_clara", (bx + lx, by + ly, TOP + hz + 0.025), (0.05, 0.02, 0.05), rot=(0, 0, ang))

# =============================================================================
# Casas con entramado de madera
# =============================================================================
DOORS = []
CHIMNEYS = []

def house(cx, cy, w, d, h, roof, floors=1, stone_lower=False, chimney=True, flowers=True):
    """Casa mirando hacia la plaza. Coordenadas locales: el frente mira hacia -Y."""
    face = math.atan2(-cy, -cx) + math.pi / 2  # gira para que el frente mire al centro
    def P(x, y, z=0):
        lx, ly = rot2(x, y, face)
        return (cx + lx, cy + ly, TOP + z)
    R = (0, 0, face)
    box("piedra", P(0, 0, 0.03), (w + 0.025, d + 0.025, 0.06), rot=R)
    total = h * floors
    wall_mat = "revoque"
    if stone_lower:
        box("piedra", P(0, 0, 0.06 + h / 2), (w, d, h), rot=R)
        if floors > 1:
            box("revoque", P(0, 0, 0.06 + h + h * (floors - 1) / 2), (w, d, h * (floors - 1)), rot=R)
    else:
        box(wall_mat, P(0, 0, 0.06 + total / 2), (w, d, total), rot=R)
    top = 0.06 + total
    # Entramado (frente y fondo)
    for sy in (-1, 1):
        yv = sy * (d / 2 + 0.006)
        for x in (-w / 2, -w / 6, w / 6, w / 2):
            box("viga", P(x, yv, 0.06 + total / 2), (0.018, 0.012, total), rot=R)
        for f in range(floors + 1):
            box("viga", P(0, yv, 0.06 + f * h), (w + 0.01, 0.012, 0.018), rot=R)
        for f in range(floors):
            z0 = 0.06 + f * h
            ln = math.hypot(w / 3, h)
            a = math.atan2(h, w / 3)
            for sx in (-1, 1):
                if stone_lower and f == 0:
                    continue
                box("viga", P(sx * w / 3, yv, z0 + h / 2), (ln, 0.01, 0.014), rot=zrot(face, ry=sx * a))
    # Entramado en los costados
    for sx in (-1, 1):
        xv = sx * (w / 2 + 0.006)
        for y in (-d / 2, 0, d / 2):
            box("viga", P(xv, y, 0.06 + total / 2), (0.012, 0.018, total), rot=R)
        for f in range(floors + 1):
            box("viga", P(xv, 0, 0.06 + f * h), (0.012, d + 0.01, 0.018), rot=R)
    # Hastial (frente y fondo) y techo a dos aguas (cumbrera de frente a fondo)
    rh = w * 0.55
    prism_xz(wall_mat, [(-w / 2, 0), (w / 2, 0), (0, rh)], -d / 2, d / 2, loc=P(0, 0, top), rot=R)
    for sy in (-1, 1):
        box("viga", P(0, sy * (d / 2 + 0.006), top + rh * 0.45), (0.016, 0.012, rh * 0.9), rot=R)
    pitch = math.atan2(rh, w / 2)
    slope = math.hypot(w / 2, rh) + 0.05
    for sx in (-1, 1):
        mx, mz = sx * (w / 4 + 0.012), top + rh / 2 + 0.012
        lx, ly = rot2(mx, 0, face)
        box(roof, (cx + lx, cy + ly, TOP + mz), (slope, d + 0.09, 0.028), rot=zrot(face, ry=sx * pitch), uv_swap=True)
    box("viga", P(0, 0, top + rh + 0.012), (0.03, d + 0.1, 0.03), rot=R)  # cumbrera
    # Ventanas iluminadas, maceteros y puerta
    for f in range(floors):
        zc = 0.06 + f * h + h * 0.58
        xs = (-w * 0.3, w * 0.3) if not (f == 0) else (-w * 0.3, w * 0.3)
        for x in xs:
            if stone_lower and f == 0 and x > 0:
                continue
            box("viga", P(x, -d / 2 - 0.008, zc), (0.075, 0.012, 0.085), rot=R)
            box("vidrio", P(x, -d / 2 - 0.012, zc), (0.055, 0.008, 0.065), rot=R)
            if flowers and f >= 0 and random.random() < 0.7:
                box("madera", P(x, -d / 2 - 0.025, zc - 0.05), (0.075, 0.025, 0.02), rot=R)
                for k in range(4):
                    blob(random.choice(["flor_roja", "flor_rosa", "follaje"]), P(x - 0.028 + k * 0.019, -d / 2 - 0.027, zc - 0.035), 0.012)
        for sx in (-1, 1):
            box("viga", P(sx * (w / 2 + 0.008), 0, zc), (0.012, 0.075, 0.085), rot=R)
            box("vidrio", P(sx * (w / 2 + 0.012), 0, zc), (0.008, 0.055, 0.065), rot=R)
    box("vidrio", P(0, -d / 2 - 0.004, top + rh * 0.35), (0.04, 0.008, 0.04), rot=R)
    box("madera", P(0, -d / 2 - 0.01, 0.06 + 0.065), (0.075, 0.014, 0.13), rot=R)
    box("viga", P(0, -d / 2 - 0.016, 0.06 + 0.135), (0.09, 0.016, 0.016), rot=R)
    DOORS.append(P(0, -d / 2 - 0.07, 0))
    # Chimenea
    if chimney:
        hx, hy = w * 0.22, d * 0.15
        box("piedra", P(hx, hy, top + rh * 0.6), (0.065, 0.065, rh * 0.9 + 0.12), rot=R)
        box("piedra_clara", P(hx, hy, top + rh * 1.05 + 0.065), (0.08, 0.08, 0.02), rot=R)
        CHIMNEYS.append(P(hx, hy, top + rh * 1.05 + 0.09))
    # Barriles y cajas al lado de la puerta
    if random.random() < 0.7:
        cyl("madera", P(w / 2 - 0.03, -d / 2 - 0.06, 0), 0.025, 0.022, 0.06, seg=10, rot=R)
    if random.random() < 0.6:
        box("madera", P(-w / 2 + 0.03, -d / 2 - 0.06, 0.02), (0.04, 0.04, 0.04), rot=(0, 0, face + 0.3))

print("Casas…")
house(-0.2, 0.82, 0.3, 0.26, 0.2, "teja_roja", floors=2)
house(0.22, 0.9, 0.28, 0.26, 0.21, "teja_pizarra", floors=2)
house(0.62, 0.8, 0.3, 0.27, 0.2, "teja_roja", floors=2)
house(0.9, 0.36, 0.3, 0.27, 0.2, "teja_roja", floors=2)
house(-0.68, 0.05, 0.22, 0.2, 0.17, "teja_pizarra", floors=1)

# =============================================================================
# Molino con rueda hidráulica (esquina izquierda, junto al muro)
# =============================================================================
print("Molino…")
house(-0.72, -0.62, 0.36, 0.3, 0.2, "teja_pizarra", floors=2, stone_lower=True)
wheel_pos = (-0.92, -0.92, TOP + 0.09)
XFORM["waterwheel"] = (wheel_pos, (0, 0, math.atan2(-0.62 + 0.92, -0.72 + 0.92)))
WR = 0.15
for side in (-0.03, 0.03):
    for k in range(20):
        a = k / 20 * math.tau
        box("madera", (math.cos(a) * WR, side, math.sin(a) * WR), (0.05, 0.012, 0.016), rot=(0, -a + math.pi / 2, 0), obj="waterwheel")
for k in range(8):
    a = k / 8 * math.tau
    box("madera", (math.cos(a) * WR / 2, 0, math.sin(a) * WR / 2), (WR, 0.012, 0.012), rot=(0, -a, 0), obj="waterwheel")
for k in range(16):
    a = k / 16 * math.tau
    box("madera", (math.cos(a) * (WR + 0.01), 0, math.sin(a) * (WR + 0.01)), (0.012, 0.075, 0.04), rot=(0, -a, 0), obj="waterwheel")
cyl("metal", (0, -0.06, 0), 0.015, 0.015, 0.12, seg=8, rot=(math.pi / 2, 0, 0), obj="waterwheel")
# Canal y cascada debajo de la rueda
ribbon("agua", [(-0.92, -0.55), (-0.92, -0.92), (-0.92, -S - 0.01)], 0.1, TOP + 0.007, obj="water")
box("agua", (-0.92, -S - 0.012, TOP - BASE_H / 2), (0.1, 0.01, BASE_H), obj="water")
for i in range(8):
    blob("espuma", (-0.92 + random.uniform(-0.05, 0.05), -S - 0.03, TOP - BASE_H + random.uniform(0, 0.05)), random.uniform(0.02, 0.035), squash=0.6)

# =============================================================================
# Torre sobre una colina de roca, con escalera
# =============================================================================
print("Torre…")
tx, ty = -0.78, 0.52
blob("roca", (tx, ty, TOP + 0.02), 0.33, squash=0.55, rough=0.25)
cyl("pasto", (tx, ty, TOP + 0.15), 0.25, 0.22, 0.04, seg=20)
TB = TOP + 0.19
cyl("piedra", (tx, ty, TB), 0.15, 0.14, 0.62, seg=20)
for k in range(12):
    a = k / 12 * math.tau
    box("piedra", (tx + math.cos(a) * 0.16, ty + math.sin(a) * 0.16, TB + 0.66), (0.06, 0.05, 0.06), rot=(0, 0, a))
cyl("piedra", (tx, ty, TB + 0.6), 0.17, 0.17, 0.04, seg=20)
for k in range(6):
    a = k / 6 * math.tau + 0.3
    cyl("viga", (tx + math.cos(a) * 0.13, ty + math.sin(a) * 0.13, TB + 0.64), 0.008, 0.008, 0.13, seg=6)
cyl("madera", (tx, ty, TB + 0.765), 0.15, 0.15, 0.015, seg=20)
cyl("teja_pizarra", (tx, ty, TB + 0.775), 0.21, 0.0, 0.3, seg=20)
cyl("metal", (tx, ty, TB + 1.06), 0.004, 0.004, 0.18, seg=6)
XFORM["flag"] = ((tx, ty, TB + 1.2), (0, 0, 0))
box("estandarte", (0.065, 0, 0), (0.12, 0.004, 0.075), obj="flag")
fa = math.atan2(-ty, -tx)
for k, z in enumerate((0.25, 0.45)):
    lx, ly = math.cos(fa + 0.5 * (k - 0.5)) * 0.146, math.sin(fa + 0.5 * (k - 0.5)) * 0.146
    box("viga", (tx + lx, ty + ly, TB + z), (0.03, 0.03, 0.07), rot=(0, 0, fa))
    box("vidrio", (tx + lx * 1.03, ty + ly * 1.03, TB + z), (0.018, 0.018, 0.05), rot=(0, 0, fa))
lx, ly = math.cos(fa - 0.6) * 0.15, math.sin(fa - 0.6) * 0.15
box("estandarte", (tx + lx, ty + ly, TB + 0.38), (0.006, 0.07, 0.16), rot=(0, 0, fa - 0.6))
# Escalera desde la colina a la plaza
for k in range(7):
    t = k / 6
    x, y = -0.6 + t * 0.2, 0.38 - t * 0.12
    box("piedra_clara", (x, y, TOP + 0.15 * (1 - t) / 2 + 0.01), (0.07, 0.12, 0.15 * (1 - t) + 0.02), rot=(0, 0, -0.5))
# Baranda de madera
for k in range(6):
    t = k / 5
    x, y = -0.62 + t * 0.22, 0.46 - t * 0.12
    cyl("viga", (x, y, TOP + 0.16 * (1 - t)), 0.006, 0.006, 0.07, seg=6)

# =============================================================================
# Plaza: fuente con estatua, puestos de mercado, faroles y estandartes
# =============================================================================
print("Plaza…")
fx, fy = 0.12, 0.38
cyl("piedra_clara", (fx, fy, TOP), 0.13, 0.13, 0.06, seg=8)
cyl("agua", (fx, fy, TOP + 0.061), 0.11, 0.11, 0.004, seg=8, obj="water")
cyl("piedra_clara", (fx, fy, TOP), 0.04, 0.035, 0.12, seg=8)
cyl("estatua", (fx, fy, TOP + 0.12), 0.025, 0.018, 0.09, seg=10)
blob("estatua", (fx, fy, TOP + 0.225), 0.018, sub=1, rough=0.05)
box("estatua", (fx + 0.02, fy, TOP + 0.19), (0.05, 0.012, 0.012), rot=(0, -0.6, 0))

def stall(x, y, awning):
    a = math.atan2(-y, -x) + math.pi / 2
    def P(lx, ly, z):
        rx, ry = rot2(lx, ly, a)
        return (x + rx, y + ry, TOP + z)
    for sx in (-1, 1):
        for sy in (-1, 1):
            cyl("viga", P(sx * 0.07, sy * 0.05, 0), 0.006, 0.006, 0.15 if sy > 0 else 0.12, seg=6)
    box("madera", P(0, -0.03, 0.06), (0.15, 0.06, 0.012), rot=(0, 0, a))
    box("madera", P(0, -0.03, 0.03), (0.15, 0.06, 0.06), rot=(0, 0, a))
    box(awning, P(0, 0, 0.14), (0.17, 0.13, 0.008), rot=zrot(a, rx=0.35))
    for k in range(5):
        blob(random.choice(["verdura", "calabaza", "flor_amarilla", "flor_roja"]), P(-0.05 + k * 0.025, -0.03, 0.073), 0.012, sub=1)
    box("madera", P(0.09, -0.08, 0.02), (0.04, 0.04, 0.04), rot=(0, 0, a + 0.4))

stall(-0.42, 0.18, "toldo_rojo")
stall(-0.3, 0.42, "toldo_azul")
stall(0.48, 0.22, "toldo_azul")
stall(0.42, -0.25, "toldo_rojo")

for (x, y) in [(0.52, -0.5), (-0.52, -0.25), (0.35, 0.55), (-0.5, 0.36), (0.6, 0.05)]:
    cyl("metal", (x, y, TOP), 0.006, 0.005, 0.2, seg=6)
    box("vidrio", (x, y, TOP + 0.21), (0.028, 0.028, 0.035))
    box("metal", (x, y, TOP + 0.232), (0.036, 0.036, 0.008))
for (x, y) in [(0.25, -0.5), (-0.35, -0.42), (0.55, 0.42)]:
    cyl("metal", (x, y, TOP), 0.004, 0.004, 0.24, seg=6)
    box("estandarte", (x + 0.02, y, TOP + 0.18), (0.004, 0.05, 0.1), rot=(0, 0, math.atan2(-y, -x)))

# =============================================================================
# Árboles, arbustos, cercas, huerta con gallinas
# =============================================================================
print("Vegetación…")
def tree(x, y, s=1.0):
    cyl("tronco", (x, y, TOP), 0.022 * s, 0.016 * s, 0.17 * s, seg=8)
    for k in range(6):
        blob("follaje", (x + random.uniform(-0.06, 0.06) * s, y + random.uniform(-0.06, 0.06) * s, TOP + (0.2 + random.uniform(0, 0.12)) * s), random.uniform(0.07, 0.1) * s, rough=0.35)

for (x, y, s) in [(-1.02, 0.1, 1.1), (-1.0, 0.95, 1.2), (-0.45, 1.05, 1.0), (0.42, 1.08, 0.9), (1.02, 1.02, 1.2), (1.05, 0.0, 1.0),
                  (0.98, -0.95, 0.9), (-0.15, -1.02, 0.8), (-1.02, -0.3, 0.9), (0.78, -0.3, 0.85), (-0.55, 0.8, 0.8)]:
    tree(x, y, s)
for i in range(45):
    a = random.uniform(0, math.tau)
    r = random.uniform(0.62, 1.12)
    x, y = math.cos(a) * r, math.sin(a) * r
    if abs(x) < S - 0.03 and abs(y) < S - 0.03:
        blob("follaje", (x, y, TOP), random.uniform(0.03, 0.055), squash=0.7, rough=0.35, sub=1)
for i in range(20):
    a = random.uniform(0, math.tau)
    r = random.uniform(0.6, 1.1)
    x, y = math.cos(a) * r, math.sin(a) * r
    if abs(x) < S - 0.03 and abs(y) < S - 0.03:
        blob(random.choice(["flor_roja", "flor_amarilla", "flor_rosa"]), (x, y, TOP + 0.01), 0.012, sub=1)

# Cerca y huerta en la esquina derecha
fence = [(0.6, -0.05), (1.12, -0.05), (1.12, -0.42)]
for i in range(len(fence) - 1):
    a, b = Vector(fence[i]), Vector(fence[i + 1])
    n = int((b - a).length / 0.07) + 1
    for k in range(n + 1):
        p = a.lerp(b, k / n)
        cyl("viga", (p.x, p.y, TOP), 0.006, 0.006, 0.07, seg=6)
    mid = (a + b) / 2
    ang = math.atan2(b.y - a.y, b.x - a.x)
    for z in (0.025, 0.055):
        box("madera", (mid.x, mid.y, TOP + z), ((b - a).length, 0.008, 0.01), rot=(0, 0, ang))
for r in range(4):
    box("tierra", (0.85, -0.12 - r * 0.07, TOP + 0.004), (0.4, 0.045, 0.012))
    for k in range(6):
        blob("verdura", (0.68 + k * 0.065, -0.12 - r * 0.07, TOP + 0.015), 0.015, sub=1)
for i in range(4):
    x, y = random.uniform(0.62, 1.0), random.uniform(0.0, 0.25)
    blob("gallina", (x, y, TOP + 0.015), 0.014, squash=0.8, sub=1, rough=0.05)
    box("flor_roja", (x + 0.01, y, TOP + 0.03), (0.006, 0.004, 0.008))

# Rocas sueltas
for i in range(18):
    a = random.uniform(0, math.tau)
    r = random.uniform(0.6, 1.1)
    blob("roca", (math.cos(a) * r, math.sin(a) * r, TOP), random.uniform(0.015, 0.035), squash=0.6, sub=1)

# =============================================================================
# Crear objetos, padre girado 45° (esquina hacia la cámara) y exportar
# =============================================================================
print("Creando mallas…")
root = bpy.data.objects.new("aldea_tierra", None)
bpy.context.collection.objects.link(root)
root.rotation_euler = (0, 0, -math.pi / 4)

for objname, mats in GEOM.items():
    verts, faces, uvs, mat_idx = [], [], [], []
    slots = list(mats.keys())
    for si, mname in enumerate(slots):
        g = mats[mname]
        base = len(verts)
        verts += g["v"]
        faces += [[base + i for i in f] for f in g["f"]]
        uvs += g["uv"]
        mat_idx += [si] * len(g["f"])
    mesh = bpy.data.meshes.new(objname)
    mesh.from_pydata(verts, [], faces)
    uvl = mesh.uv_layers.new(name="UVMap")
    uvl.data.foreach_set("uv", [c for uv in uvs for c in uv])
    for mname in slots:
        mesh.materials.append(MATS[mname])
    mesh.polygons.foreach_set("material_index", mat_idx)
    mesh.polygons.foreach_set("use_smooth", [slots[i] in SMOOTH for i in mat_idx])
    mesh.validate()
    ob = bpy.data.objects.new(objname, mesh)
    bpy.context.collection.objects.link(ob)
    if objname in XFORM:
        ob.location, ob.rotation_euler = XFORM[objname][0], XFORM[objname][1]
    ob.parent = root

for i, p in enumerate(DOORS):
    EMPTIES.append((f"door_{i}", p))
for i, p in enumerate(CHIMNEYS):
    EMPTIES.append((f"chimney_{i}", p))
for name, p in EMPTIES:
    e = bpy.data.objects.new(name, None)
    e.location = p
    e.empty_display_size = 0.03
    bpy.context.collection.objects.link(e)
    e.parent = root

tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" for p in o.data.polygons)
print(f"Objetos: {len(GEOM)} mallas, {len(EMPTIES)} marcadores, ~{tris} triángulos")

bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB")
print("Exportado:", OUT_GLB)

# =============================================================================
# Vista previa (render)
# =============================================================================
if OUT_PNG:
    scn = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            scn.render.engine = eng
            break
        except TypeError:
            pass
    scn.render.resolution_x = scn.render.resolution_y = 900
    scn.render.film_transparent = False
    world = bpy.data.worlds.new("mundo")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.75, 0.75, 0.76, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scn.world = world
    sun = bpy.data.objects.new("sol", bpy.data.lights.new("sol", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    bpy.context.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 3.8
    cam.location = (0, -6, 4.6)
    cam.rotation_euler = (math.radians(52), 0, 0)
    bpy.context.collection.objects.link(cam)
    scn.camera = cam
    scn.render.filepath = OUT_PNG
    bpy.ops.render.render(write_still=True)
    print("Vista previa:", OUT_PNG)
