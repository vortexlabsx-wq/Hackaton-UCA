# Servidor local de Minimundos: sirve la página y deja que el editor guarde en la carpeta models/
#   python servidor.py        -> http://localhost:8000
# Solo escucha en esta computadora (127.0.0.1) y solo puede escribir archivos .json y .glb dentro de models/.
import glob
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(ROOT, "models")
NAME_OK = re.compile(r"^[\w\-. ()áéíóúñÁÉÍÓÚÑ]+\.(glb|json)$", re.IGNORECASE)
MAX_BYTES = 300 * 1024 * 1024  # 300 MB por archivo


# ---------- Archivos .blend: Blender (sin ventana) hornea los materiales y exporta un .glb a models/ ----------
SCRIPT_BLEND = os.path.join(ROOT, "blender", "hornear_y_exportar.py")
BLEND_TMP = os.path.join(tempfile.gettempdir(), "minimundos_blend")
BLEND_TIMEOUT = 20 * 60  # segundos
jobs = {}                # id -> {estado, avance, total, src, error, log}
blender_lock = threading.Lock()  # de a un .blend por vez (hornear usa mucha CPU/GPU)


def find_blender():
    """Variable MINIMUNDOS_BLENDER, o la versión más nueva en Archivos de programa, o 'blender' en el PATH."""
    env = os.environ.get("MINIMUNDOS_BLENDER")
    if env and os.path.isfile(env):
        return env
    found = []
    for base in (os.environ.get("ProgramFiles", r"C:\Program Files"), os.environ.get("ProgramFiles(x86)", "")):
        found += glob.glob(os.path.join(base, "Blender Foundation", "*", "blender.exe"))
    if found:
        ver = lambda p: [int(x) for x in re.findall(r"\d+", os.path.basename(os.path.dirname(p)))]
        return max(found, key=ver)
    return shutil.which("blender")


# Recuerda qué .blend ya se convirtió (por su contenido): subir el mismo archivo otra vez es instantáneo
CACHE_FILE = os.path.join(MODELS, ".blend_convertidos.json")


def blend_key(data):
    import hashlib
    h = hashlib.sha1(data)
    try:  # si cambia el script de horneado, hay que volver a convertir
        h.update(str(os.path.getmtime(SCRIPT_BLEND)).encode())
    except OSError:
        pass
    return h.hexdigest()


def cache_get(key, name):
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            hit = json.load(f).get(key)
    except (OSError, ValueError):
        return None
    return hit if hit == name and os.path.exists(os.path.join(MODELS, name + ".glb")) else None


def cache_put(key, name):
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            c = json.load(f)
    except (OSError, ValueError):
        c = {}
    c[key] = name
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(c, f, indent=1)


def glb_name_for(filename):
    base = os.path.splitext(os.path.basename(filename))[0]
    base = re.sub(r"[^\w\-]+", "_", base).strip("_") or "pueblo_blender"
    return base[:60]


def run_blender_job(job_id, blend_path, name, key=None):
    job = jobs[job_id]
    exe = find_blender()
    if not exe:
        job.update(estado="error", error="No encontré Blender instalado. Instalalo o poné su ruta en la variable MINIMUNDOS_BLENDER.")
        return
    env = dict(os.environ, MINIMUNDOS_SALIDA=MODELS, MINIMUNDOS_NOMBRE=name)
    cmd = [exe, "-b", blend_path, "--python-exit-code", "1", "--python", SCRIPT_BLEND]
    with blender_lock:
        job["estado"] = "horneando"
        print(f"Blender: convirtiendo {os.path.basename(blend_path)} -> models/{name}.glb")
        try:
            p = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                 text=True, encoding="utf-8", errors="replace",
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            start = time.time()
            for line in p.stdout:
                line = line.rstrip()
                job["log"] = (job["log"] + [line])[-40:]
                m = re.match(r"\[(\d+)/(\d+)\]", line)
                if m:
                    job["avance"], job["total"] = int(m.group(1)), int(m.group(2))
                elif "glTF" in line or "Extracting primitive" in line:
                    job["estado"] = "exportando"
                if time.time() - start > BLEND_TIMEOUT:
                    p.kill()
                    raise RuntimeError("Blender tardó demasiado (más de 20 minutos)")
            p.wait()
            out = os.path.join(MODELS, name + ".glb")
            if p.returncode != 0 or not os.path.exists(out):
                err = next((l for l in reversed(job["log"]) if "Error" in l or "error" in l), "Blender terminó con un error")
                raise RuntimeError(err)
            job.update(estado="listo", src=f"models/{name}.glb")
            if key:
                cache_put(key, name)
            print(f"Blender: listo models/{name}.glb")
        except Exception as e:
            job.update(estado="error", error=str(e))
            print("Blender: error:", e)
        finally:
            try:
                os.remove(blend_path)
            except OSError:
                pass


def model_path(url_path):
    """/api/models/<nombre> -> ruta segura dentro de models/ (o None)."""
    from urllib.parse import unquote
    name = unquote(url_path[len("/api/models/"):])
    if not NAME_OK.match(name) or name.startswith("."):
        return None
    path = os.path.abspath(os.path.join(MODELS, name))
    return path if os.path.dirname(path) == MODELS else None


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # Que el navegador siempre lea la versión recién guardada
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def reply(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/ping":
            return self.reply(200, {"ok": True})
        if self.path == "/api/models":
            # Lista de archivos de models/: la app pide solo los que existen (sin errores 404 en la consola)
            names = sorted(n for n in os.listdir(MODELS) if NAME_OK.match(n)) if os.path.isdir(MODELS) else []
            return self.reply(200, {"files": names})
        if self.path.startswith("/api/blend/"):
            job = jobs.get(self.path[len("/api/blend/"):])
            if not job:
                return self.reply(404, {"error": "trabajo desconocido"})
            return self.reply(200, {k: v for k, v in job.items() if k != "log"} | {"ultima": (job["log"] or [""])[-1]})
        if self.path == "/api/blender":
            return self.reply(200, {"blender": find_blender()})
        return super().do_GET()

    def do_POST(self):
        # Subir un .blend: /api/blend?nombre=<archivo.blend>  (el cuerpo es el archivo)
        from urllib.parse import urlparse, parse_qs
        url = urlparse(self.path)
        if url.path != "/api/blend":
            return self.reply(404, {"error": "ruta desconocida"})
        filename = (parse_qs(url.query).get("nombre") or ["pueblo.blend"])[0]
        size = int(self.headers.get("Content-Length") or 0)
        if size <= 0 or size > MAX_BYTES:
            self.close_connection = True
            return self.reply(413, {"error": "el archivo es demasiado grande (máximo 300 MB)"})
        # Leer el archivo entero antes de contestar: si se corta a mitad de la subida,
        # el navegador solo muestra "Failed to fetch" en vez del motivo
        data = self.rfile.read(size)
        if not filename.lower().endswith(".blend"):
            return self.reply(400, {"error": "tiene que ser un archivo .blend"})
        if not find_blender():
            return self.reply(501, {"error": "No encontré Blender instalado en esta computadora."})
        # .blend normal empieza con "BLENDER"; comprimido, con la firma de zstd o gzip
        if not (data.startswith(b"BLENDER") or data[:4] == b"\x28\xb5\x2f\xfd" or data[:2] == b"\x1f\x8b"):
            return self.reply(400, {"error": "el archivo no parece un .blend"})
        job_id = uuid.uuid4().hex[:12]
        name = glb_name_for(filename)
        key = blend_key(data)
        if cache_get(key, name):  # este mismo archivo ya se convirtió: no hace falta abrir Blender
            jobs[job_id] = {"estado": "listo", "avance": 1, "total": 1, "src": f"models/{name}.glb",
                            "error": None, "log": ["ya convertido antes"], "nombre": name, "cache": True}
            print(f"Blender: {filename} ya estaba convertido (models/{name}.glb)")
            return self.reply(200, {"id": job_id, "nombre": name, "cache": True})
        os.makedirs(BLEND_TMP, exist_ok=True)
        blend_path = os.path.join(BLEND_TMP, job_id + ".blend")
        with open(blend_path, "wb") as f:
            f.write(data)
        jobs[job_id] = {"estado": "en cola", "avance": 0, "total": 0, "src": None, "error": None, "log": [], "nombre": name}
        threading.Thread(target=run_blender_job, args=(job_id, blend_path, name, key), daemon=True).start()
        return self.reply(200, {"id": job_id, "nombre": name})

    def do_PUT(self):
        if not self.path.startswith("/api/models/"):
            return self.reply(404, {"error": "ruta desconocida"})
        path = model_path(self.path)
        if not path:
            return self.reply(400, {"error": "nombre de archivo no permitido"})
        size = int(self.headers.get("Content-Length") or 0)
        if size <= 0 or size > MAX_BYTES:
            return self.reply(413, {"error": "tamaño inválido"})
        data = self.rfile.read(size)
        os.makedirs(MODELS, exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:  # se escribe aparte y se reemplaza: nunca queda un archivo a medias
            f.write(data)
        os.replace(tmp, path)
        print(f"Guardado: models/{os.path.basename(path)} ({size // 1024} KB)")
        return self.reply(200, {"ok": True, "src": "models/" + os.path.basename(path)})

    def do_DELETE(self):
        path = model_path(self.path) if self.path.startswith("/api/models/") else None
        if not path or not path.lower().endswith(".json"):  # solo se borran planos, nunca modelos
            return self.reply(400, {"error": "no permitido"})
        if os.path.exists(path):
            os.remove(path)
        return self.reply(200, {"ok": True})

    def log_message(self, fmt, *args):
        if self.command != "GET":
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print(f"Minimundos en http://localhost:{PORT}  (Ctrl+C para cerrar)")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
