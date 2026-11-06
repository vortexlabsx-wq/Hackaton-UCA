# Hornea los materiales procedurales (Noise, Voronoi, ColorRamp...) a imágenes y exporta un .glb
# que se ve con sus colores en el editor de pueblos.
#
# Cómo usarlo:
#   1. Guardá tu .blend (el script cambia materiales y UVs; si algo no te gusta, volvé a abrir el guardado).
#   2. Pestaña "Scripting" > Abrir > este archivo > botón ▶ (Run Script).
#   3. Mirá la consola (Ventana > Alternar consola del sistema) para ver el avance.
#   El .glb queda en la carpeta models/ del proyecto con el nombre del .blend.
#   El editor de pueblos también lo usa solo: al subir un .blend, servidor.py abre Blender sin ventana
#   con este script (MINIMUNDOS_SALIDA y MINIMUNDOS_NOMBRE indican dónde y con qué nombre exportar).
#
# Qué hace:
#   - Optimiza para el juego: une las piezas comunes en un solo objeto y baja los triángulos a ~80 000
#     (los objetos door_N, chimney_N, waterwheel, flag y water... quedan aparte porque el juego los anima).
#   - A cada objeto con materiales procedurales le crea un mapa UV "Horneado" y una imagen.
#   - Hornea el color (Cycles, pasada Difuso > Color) en esa imagen y la conecta al Base Color.
#   - Los materiales con color liso o que brillan (emisión) los deja como están: esos ya se exportan bien.
#   - Oculta lo que no sirve en el juego (piso de estudio, humo volumétrico, cámaras, luces) y exporta.
import bpy
import math
import os
import time

# ---------------- Ajustes ----------------
TAM_IMAGEN = 512                          # resolución de cada textura (1024 = más detalle pero más pesado)
TAM_MINIMO = 128                          # objetos chicos usan imágenes más chicas (más rápido y liviano)
MUESTRAS = 1                              # el color (sin luces) sale igual con 1 muestra
NO_EXPORTAR = ("Piso_Estudio", "Humo_Volumetrico")  # materiales cuyos objetos se ocultan al exportar
CARPETA_SALIDA = os.environ.get("MINIMUNDOS_SALIDA") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
UV_NOMBRE = "Horneado"
# Optimización para que el juego vaya fluido (la aldea de tierra original tiene ~30 000 triángulos)
OPTIMIZAR = os.environ.get("MINIMUNDOS_OPTIMIZAR", "1") != "0"
TRIANGULOS_MAX = int(os.environ.get("MINIMUNDOS_TRIANGULOS", "80000"))
TAM_UNIDO = 2048                          # textura del pueblo unido (todas las piezas comunes en una imagen)
NOMBRE_UNIDO = "Pueblo_Unido"
ESPECIALES = ("door_", "chimney_", "waterwheel", "flag", "water")  # objetos que el juego anima: no se unen


def triangulos(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def es_especial(ob):
    return ob.name.startswith(ESPECIALES)


def optimizar(escena):
    """Une las piezas comunes en un objeto (menos llamadas de dibujo) y baja los triángulos si hace falta."""
    tipos = {"MESH", "CURVE", "SURFACE", "META", "FONT"}
    unir = [o for o in escena.objects if o.type in tipos and o.visible_get()
            and not es_especial(o) and not (o.type == "MESH" and no_exportar(o))]
    if len(unir) < 2:
        return
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    # Hijos que no se unen (puertas, chimeneas...): soltarlos sin que se muevan
    for o in escena.objects:
        if o not in unir and o.parent in unir:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
    for o in bpy.context.view_layer.objects:
        o.select_set(o in unir)
    bpy.context.view_layer.objects.active = unir[0]
    bpy.ops.object.make_single_user(object=True, obdata=True)
    bpy.ops.object.convert(target="MESH")  # aplica modificadores y pasa curvas/textos a malla
    unir = [o for o in bpy.context.selected_objects if o.type == "MESH"]
    antes = sum(triangulos(o) for o in unir)
    bpy.context.view_layer.objects.active = unir[0]
    bpy.ops.object.join()
    ob = bpy.context.object
    ob.name = NOMBRE_UNIDO
    print(f"Unidas {len(unir)} piezas en una ({antes:,} triángulos)", flush=True)

    def aplicar(mod):
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)

    if triangulos(ob) > TRIANGULOS_MAX:
        # 1) Juntar caras planas: no cambia la forma (paredes, techos, pisos)
        m = ob.modifiers.new("Planar", "DECIMATE")
        m.decimate_type = "DISSOLVE"
        m.angle_limit = math.radians(4)
        m.delimit = {"MATERIAL", "SEAM", "SHARP"}
        aplicar(m)
        print(f"  caras planas juntadas: {triangulos(ob):,} triángulos", flush=True)
    if triangulos(ob) > TRIANGULOS_MAX:
        # 2) Si todavía es mucho, simplificar lo justo para llegar al máximo
        m = ob.modifiers.new("Simplificar", "DECIMATE")
        m.decimate_type = "COLLAPSE"
        m.ratio = max(0.05, TRIANGULOS_MAX / triangulos(ob))
        m.use_collapse_triangulate = True
        aplicar(m)
        print(f"  simplificado: {triangulos(ob):,} triángulos", flush=True)


def solo_volumen(mat):
    """Humo, niebla y otros materiales de volumen: no existen en glTF y saldrían como bloques sólidos."""
    if not mat or not mat.node_tree:
        return False
    for n in mat.node_tree.nodes:
        if n.type == "OUTPUT_MATERIAL" and n.is_active_output:
            return n.inputs["Volume"].is_linked and not n.inputs["Surface"].is_linked
    return False


def no_exportar(ob):
    mats = [s.material for s in ob.material_slots if s.material]
    return any(m.name.split(".")[0] in NO_EXPORTAR or solo_volumen(m) for m in mats)


def principled(mat):
    if not mat or not mat.node_tree:
        return None
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            return n
    return None


def es_procedural(mat):
    """El Base Color sale de nodos que glTF no entiende (todo lo que no sea una imagen directa)."""
    bsdf = principled(mat)
    if not bsdf:
        return False
    entrada = bsdf.inputs["Base Color"]
    if not entrada.is_linked:
        return False
    return entrada.links[0].from_node.type != "TEX_IMAGE"


def color_promedio(mat):
    """Color de respaldo si no se puede hornear: el promedio del primer ColorRamp, o el gris del Base Color."""
    for n in mat.node_tree.nodes:
        if n.type == "VALTORGB":
            els = n.color_ramp.elements
            return [sum(e.color[i] for e in els) / len(els) for i in range(4)]
    return list(principled(mat).inputs["Base Color"].default_value)


def seleccionar_solo(ob):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def preparar_uv(ob):
    # Las mallas compartidas (barriles, antorchas, postes repetidos) NO se copian: se hornean una vez
    # y todas las copias usan el mismo resultado. Copiarlas multiplicaba el peso del .glb.
    me = ob.data
    uv = me.uv_layers.get(UV_NOMBRE) or me.uv_layers.new(name=UV_NOMBRE)
    me.uv_layers.active = uv
    uv.active_render = True
    seleccionar_solo(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003 if ob.name == NOMBRE_UNIDO else 0.01)
    bpy.ops.object.mode_set(mode="OBJECT")


def necesita_horneado(ob):
    return any(es_procedural(s.material) for s in ob.material_slots if s.material)


def area_mundo(ob):
    sx, sy, sz = (abs(v) for v in ob.matrix_world.to_scale())
    k = (sx * sy + sy * sz + sx * sz) / 3
    return sum(p.area for p in ob.data.polygons) * k


def tam_para(area, area_max):
    """Objetos chicos (un barril, una antorcha) no necesitan 512 px: menos píxeles = horneado más rápido."""
    t = TAM_IMAGEN * math.sqrt(area / area_max) if area_max > 0 else TAM_IMAGEN
    p = 2 ** math.ceil(math.log2(max(t, 1)))
    return int(min(TAM_IMAGEN, max(TAM_MINIMO, p)))


def usar_gpu():
    """Hornear con la placa de video si hay (CUDA en NVIDIA es lo más rápido de arrancar)."""
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
    except Exception:
        return "CPU"
    for tipo in ("CUDA", "HIP", "ONEAPI", "METAL", "OPTIX"):
        try:
            prefs.compute_device_type = tipo
            prefs.get_devices()
        except Exception:
            continue
        gpus = [d for d in prefs.devices if d.type == tipo]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == tipo
            bpy.context.scene.cycles.device = "GPU"
            return f"GPU ({tipo}: {gpus[0].name})"
    return "CPU"


def preparar_objeto(ob, tam):
    """UV + imagen + copia de sus materiales con el nodo de imagen activo. Devuelve lo que hay que conectar después."""
    slots = [s for s in ob.material_slots if s.material]
    preparar_uv(ob)
    img = bpy.data.images.new(f"{ob.name}_color", tam, tam, alpha=False)

    # Una copia de cada material para este objeto, con un nodo de imagen activo (Cycles hornea ahí)
    nodos = []
    for s in slots:
        m = s.material.copy()
        s.material = m
        nt = m.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.location = (-600, -400)
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = UV_NOMBRE
        uvn.location = (-800, -400)
        nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
        for n in nt.nodes:
            n.select = False
        tex.select = True
        nt.nodes.active = tex
        nodos.append((m, tex, uvn))
    return {"ob": ob, "img": img, "nodos": nodos}


def conectar(prep):
    prep["img"].pack()                     # la imagen queda dentro del .blend y del .glb
    for m, tex, uvn in prep["nodos"]:
        if es_procedural(m):
            m.node_tree.links.new(tex.outputs["Color"], principled(m).inputs["Base Color"])
        else:                              # este material no necesitaba la imagen: sacar los nodos extra
            m.node_tree.nodes.remove(tex)
            m.node_tree.nodes.remove(uvn)


def hornear(objetos):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objetos:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objetos[0]
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=4, use_clear=True)


def color_liso(ob):
    """Respaldo: si no se pudo hornear, poner el color promedio para que al menos no quede blanco."""
    for s in ob.material_slots:
        m = s.material
        if m and es_procedural(m):
            bsdf = principled(m)
            col = color_promedio(m)
            for l in list(bsdf.inputs["Base Color"].links):
                m.node_tree.links.remove(l)
            bsdf.inputs["Base Color"].default_value = col


def main():
    escena = bpy.context.scene
    motor_antes = escena.render.engine
    escena.render.engine = "CYCLES"
    escena.cycles.samples = MUESTRAS
    escena.render.bake.margin = 4
    t0 = time.time()
    print("Horneando con", usar_gpu(), flush=True)
    if OPTIMIZAR:
        optimizar(escena)

    candidatos = [o for o in escena.objects if o.type == "MESH" and o.visible_get()
                  and not no_exportar(o) and necesita_horneado(o)]
    # Un objeto por malla: las copias que comparten malla se arreglan al final con el mismo resultado
    copias = {}
    for o in candidatos:
        copias.setdefault(o.data.name, []).append(o)
    objetos = [grupo[0] for grupo in copias.values()]
    print(f"\n=== Horneando {len(objetos)} objetos ===", flush=True)
    fallidos = []
    total = len(objetos) + 1               # +1 = el horneado en sí
    area_max = max((area_mundo(o) for o in objetos), default=0)

    # 1) Preparar todos (UV, imagen, materiales). Si uno falla, color liso y sigue.
    preps = []
    for i, ob in enumerate(objetos, 1):
        try:
            tam = TAM_UNIDO if ob.name == NOMBRE_UNIDO else tam_para(area_mundo(ob), area_max)
            preps.append(preparar_objeto(ob, tam))
            r = "preparado"
        except Exception as e:
            color_liso(ob)
            fallidos.append(ob.name)
            r = f"color liso ({e})"
        print(f"[{i}/{total}] {ob.name}: {r}", flush=True)

    # 2) Hornear TODOS en una sola pasada: Cycles prepara la escena una vez, no una por objeto
    if preps:
        try:
            hornear([p["ob"] for p in preps])
            for p in preps:
                conectar(p)
        except Exception as e:
            print("Horneado conjunto falló, sigo de a uno:", e, flush=True)
            for p in preps:
                try:
                    hornear([p["ob"]])
                    conectar(p)
                except Exception as e2:
                    color_liso(p["ob"])
                    fallidos.append(p["ob"].name)
                    print(f"  {p['ob'].name}: color liso ({e2})", flush=True)
    # Las copias usan los mismos materiales horneados que su original (si el material va en el objeto y no en la malla)
    for grupo in copias.values():
        base = grupo[0]
        for o in grupo[1:]:
            for i, s in enumerate(o.material_slots):
                if i < len(base.material_slots) and base.material_slots[i].material:
                    s.material = base.material_slots[i].material
    print(f"[{total}/{total}] horneado listo en {time.time() - t0:.0f} s", flush=True)

    # Agua/vidrio con transmisión (refracción): en el navegador obliga a dibujar todo dos veces.
    # Se exporta como transparencia común, que se ve parecido.
    for m in bpy.data.materials:
        bsdf = principled(m)
        tw = bsdf and (bsdf.inputs.get("Transmission Weight") or bsdf.inputs.get("Transmission"))
        if tw and not tw.is_linked and tw.default_value > 0:
            tw.default_value = 0
            bsdf.inputs["Alpha"].default_value = min(bsdf.inputs["Alpha"].default_value, 0.7)
            if hasattr(m, "surface_render_method"):
                m.surface_render_method = "BLENDED"
            print(f"Material {m.name}: transmisión -> transparencia", flush=True)

    # Ocultar lo que no va al juego
    ocultos = []
    for o in escena.objects:
        sacar = o.type in {"CAMERA", "LIGHT"} or (o.type == "MESH" and no_exportar(o))
        if sacar and o.visible_get():
            o.hide_set(True)
            ocultos.append(o)

    nombre = (os.environ.get("MINIMUNDOS_NOMBRE")
              or os.path.splitext(os.path.basename(bpy.data.filepath))[0] or "pueblo_horneado")
    os.makedirs(CARPETA_SALIDA, exist_ok=True)
    salida = os.path.join(CARPETA_SALIDA, nombre + ".glb")
    bpy.ops.object.select_all(action="DESELECT")
    # Texturas en JPEG: el .glb pesa varias veces menos y el navegador lo carga rápido
    bpy.ops.export_scene.gltf(filepath=salida, export_format="GLB", use_visible=True, export_apply=True,
                              export_image_format="JPEG", export_jpeg_quality=85)

    for o in ocultos:
        o.hide_set(False)
    escena.render.engine = motor_antes
    print(f"\n=== Listo: {salida} ===", flush=True)
    if fallidos:
        print("Con color liso (no se pudieron hornear):", ", ".join(fallidos))


main()
