"""Prueba la API del panel contra la copia de prueba (ver probar-en-vps.sh). Se ejecuta en el VPS.
Crea y borra una palabra clave de prueba y usa los leads de ejemplo 9992xx si existen."""
import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://10.200.41.3:18080"
fallos = []


def call(method, path, body=None, header=True):
    headers = {"Content-Type": "application/json"}
    if header:
        headers["X-IG-Panel"] = "1"
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def ok(nombre, cond, extra=""):
    print(f"  {'OK ' if cond else 'MAL'} {nombre}" + (f"  ({extra})" if extra else ""))
    if not cond:
        fallos.append(nombre)


s, reels = call("GET", "/api/reels")
reel = reels["items"][0]
s, r = call("POST", "/api/palabras", {"keyword": "PRUEBA_PANEL", "media_id": reel["id"], "media_label": "Reel de prueba",
                                      "media_permalink": reel["permalink"], "dm_message": "Hola, prueba 👋",
                                      "public_replies": ["uno", " ", "dos"]})
ok("crear palabra ligada a un reel", s == 201, r)
kid = r.get("id")
s, r = call("POST", "/api/palabras", {"keyword": "PRUEBA_PANEL", "media_id": reel["id"], "dm_message": "x", "public_replies": ["a"]})
ok("no deja duplicarla en el mismo reel", s == 409, r.get("error"))
s, r = call("POST", "/api/palabras", {"keyword": "X", "dm_message": "é" * 600, "public_replies": ["a"]})
ok("rechaza DM de más de 1000 bytes", s == 400, r.get("error"))
s, r = call("PUT", f"/api/palabras/{kid}", {"keyword": "PRUEBA_PANEL", "media_id": None, "dm_message": "Cambiado", "public_replies": ["tres"], "active": False})
ok("editar y desactivar", s == 200, r)
s, r = call("GET", "/api/palabras")
k = next(x for x in r["items"] if x["id"] == kid)
ok("se guardó bien", k["active"] is False and k["media_id"] is None and k["public_replies"] == ["tres"] and k["media_label"] == "Todos los reels")
s, r = call("DELETE", f"/api/palabras/{kid}", header=False)
ok("borrar sin la cabecera del panel se rechaza", s == 403)
s, r = call("DELETE", f"/api/palabras/{kid}")
ok("borrar", s == 200)

s, r = call("GET", "/api/leads?estado=cualificado")
demo = next((x for x in r["items"] if x["ig_username"] == "panaderia_lola_demo"), None)
if demo:
    s, r = call("GET", f"/api/leads/{demo['id']}")
    ok("detalle con conversación", s == 200 and len(r["mensajes"]) > 3, f"{len(r['mensajes'])} mensajes")
    s, r = call("PATCH", f"/api/leads/{demo['id']}", {"status": "humano"})
    ok("cambiar estado a 'lo llevo yo'", s == 200 and r["status"] == "humano")
    s, r = call("PATCH", f"/api/leads/{demo['id']}", {"status": "borrado"})
    ok("rechaza estados inventados", s == 400)
    call("PATCH", f"/api/leads/{demo['id']}", {"status": "cualificado"})
    s, r = call("POST", f"/api/leads/{demo['id']}/hq")
    ok("sin formulario de HQ configurado avisa", s == 400 and "Ajustes" in r["error"], r.get("error"))

s, r = call("GET", "/api/ajustes")
ok("leer ajustes sin el token", s == 200 and "access_token" not in json.dumps(r))
original = r["editables"]["ai_max_per_day"]
s, r = call("PUT", "/api/ajustes", {"ai_max_per_day": "16"})
ok("guardar un ajuste", s == 200 and r["editables"]["ai_max_per_day"] == "16")
call("PUT", "/api/ajustes", {"ai_max_per_day": original})
s, r = call("PUT", "/api/ajustes", {"access_token": "x"})
ok("no deja tocar el token", s == 400, r.get("error"))
s, r = call("GET", "/api/leads?q=lola")
ok("buscar", s == 200 and any("lola" in (x["ig_username"] or "") for x in r["items"]))

print("\nResultado:", "TODO BIEN" if not fallos else f"{len(fallos)} fallos: {fallos}")
