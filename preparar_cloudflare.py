"""Arma la carpeta dist/ lista para publicar en Cloudflare Pages.

    python preparar_cloudflare.py
    npx wrangler pages deploy dist --project-name minimundos

Qué hace:
  * Copia solo los archivos de la app (sin backup/, blender/, servidor.py…).
  * Comprime los .glb de models/ con KHR_mesh_quantization (normales a 8 bits y UV a 16 bits):
    se ven igual, pesan ~30 % menos y quedan bajo el límite de 25 MiB por archivo de Cloudflare.
  * Escribe dist/api/models (la lista de modelos que en local responde servidor.py).
"""
import json
import os
import re
import shutil
import struct
import sys

import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
MODELS = os.path.join(ROOT, "models")
LIMIT = 25 * 1024 * 1024  # máximo por archivo en Cloudflare Pages

APP_FILES = ["index.html", "style.css", "app.js", "world3d.js", "editor.html", "editor.js", "demo3d.html"]
SKIP_MODELS = {"Untitled.glb"}  # no lo usa ningún pueblo
NAME_OK = re.compile(r"^[\w\-. ]+\.(glb|gltf|json|bin|png|jpg|jpeg)$", re.I)

FLOAT, BYTE, USHORT = 5126, 5120, 5123


def pad4(b, fill=b"\0"):
    return b + fill * (-len(b) % 4)


def quantize_glb(src, dst):
    data = open(src, "rb").read()
    magic, _, _ = struct.unpack("<4sII", data[:12])
    assert magic == b"glTF", "no es un GLB"
    jlen = struct.unpack("<I", data[12:16])[0]
    j = json.loads(data[20:20 + jlen])
    blen = struct.unpack("<I", data[20 + jlen:24 + jlen])[0]
    binary = data[28 + jlen:28 + jlen + blen]
    acc, views = j["accessors"], j["bufferViews"]

    # Qué accesor es normal / UV
    role = {}
    for m in j.get("meshes", []):
        for p in m["primitives"]:
            for k, a in p["attributes"].items():
                role[a] = k
            for t in p.get("targets", []):  # morph targets: no tocar
                for a in t.values():
                    role[a] = "MORPH"
    by_view = {}
    for i, a in enumerate(acc):
        if "bufferView" in a:
            by_view.setdefault(a["bufferView"], []).append(i)

    out = bytearray()
    changed = False
    for vi, v in enumerate(views):
        raw = binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]
        users = by_view.get(vi, [])
        new = None
        if len(users) == 1 and "byteStride" not in v and "sparse" not in acc[users[0]]:
            ai = users[0]
            a = acc[ai]
            r = role.get(ai)
            if a["componentType"] == FLOAT and not a.get("normalized"):
                off = a.get("byteOffset", 0)
                if r == "NORMAL" and a["type"] == "VEC3":
                    f = np.frombuffer(raw, np.float32, a["count"] * 3, off).reshape(-1, 3)
                    n = np.linalg.norm(f, axis=1, keepdims=True)
                    f = np.where(n > 0, f / np.maximum(n, 1e-12), f)
                    q = np.zeros((a["count"], 4), np.int8)  # 4 bytes por vértice (alineación)
                    q[:, :3] = np.clip(np.round(f * 127), -127, 127)
                    new, stride, ctype = q.tobytes(), 4, BYTE
                elif r and r.startswith("TEXCOORD") and a["type"] == "VEC2":
                    f = np.frombuffer(raw, np.float32, a["count"] * 2, off)
                    if f.size and f.min() >= 0 and f.max() <= 1:
                        new, stride, ctype = np.round(f * 65535).astype(np.uint16).tobytes(), 4, USHORT
            if new is not None:
                a["componentType"] = ctype
                a["normalized"] = True
                a.pop("byteOffset", None)
                a.pop("min", None)
                a.pop("max", None)
                raw = new
                v["byteStride"] = stride
                changed = True
        v["byteOffset"] = len(out)
        v["byteLength"] = len(raw)
        out += pad4(bytes(raw))

    if changed:
        for key in ("extensionsUsed", "extensionsRequired"):
            lst = j.setdefault(key, [])
            if "KHR_mesh_quantization" not in lst:
                lst.append("KHR_mesh_quantization")
    j["buffers"] = [{"byteLength": len(out)}]

    jbytes = pad4(json.dumps(j, separators=(",", ":")).encode(), b" ")
    total = 12 + 8 + len(jbytes) + 8 + len(out)
    with open(dst, "wb") as fh:
        fh.write(struct.pack("<4sII", b"glTF", 2, total))
        fh.write(struct.pack("<I4s", len(jbytes), b"JSON") + jbytes)
        fh.write(struct.pack("<I4s", len(out), b"BIN\0") + bytes(out))


def main():
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(os.path.join(DIST, "models"))
    os.makedirs(os.path.join(DIST, "api"))

    for f in APP_FILES:
        shutil.copy2(os.path.join(ROOT, f), DIST)

    names = []
    for name in sorted(os.listdir(MODELS)):
        if not NAME_OK.match(name) or name in SKIP_MODELS:
            continue
        src, dst = os.path.join(MODELS, name), os.path.join(DIST, "models", name)
        if name.lower().endswith(".glb"):
            quantize_glb(src, dst)
            print(f"  {name}: {os.path.getsize(src) / 1e6:.1f} MB -> {os.path.getsize(dst) / 1e6:.1f} MB")
        else:
            shutil.copy2(src, dst)
        names.append(name)

    with open(os.path.join(DIST, "api", "models"), "w", encoding="utf-8") as fh:
        json.dump({"files": names}, fh)
    with open(os.path.join(DIST, "api", "ping"), "w", encoding="utf-8") as fh:
        json.dump({"ok": True}, fh)

    big = []
    total = 0
    for d, _, files in os.walk(DIST):
        for f in files:
            p = os.path.join(d, f)
            total += os.path.getsize(p)
            if os.path.getsize(p) > LIMIT:
                big.append(os.path.relpath(p, DIST))
    print(f"\ndist/ listo: {total / 1e6:.1f} MB en total")
    if big:
        print("ATENCIÓN: superan 25 MiB y Cloudflare los rechazará:", ", ".join(big))
        sys.exit(1)
    print("Publicar con:  npx wrangler pages deploy dist --project-name minimundos")


if __name__ == "__main__":
    main()
