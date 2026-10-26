# IG Automation · panel

Panel de la automatización de Instagram de LogiQD ("comentario → DM → conversación con IA"),
como app de [la tienda de Umbrel de LogiQD](https://github.com/LogiQDAdmin/umbrel-app-store).

Los flujos los hace n8n; este panel solo gestiona lo que n8n lee y escribe en su base de datos:

- **Vídeos y palabras clave**: qué palabra se busca en los comentarios de cada reel (o de todos), el DM
  que se manda y las respuestas públicas que se eligen al azar. El reel se elige por su miniatura.
- **Leads**: quién ha comentado, en qué estado está, qué datos ha dado y la conversación completa.
  Botones para «lo llevo yo» (el bot se calla), devolverlo al bot, descartarlo y **enviarlo a HQ**.
- **Ajustes**: modelo de IA, límites de mensajes, días sin repetir el DM, formulario de HQ y la
  caducidad del token de Instagram (nunca se muestra el token).

## Cómo funciona

- Un servidor Node (`server/`) sirve la web (`web/`, React + Vite) y una API JSON en `/api`.
- Se conecta al Postgres de la automatización (`logiqd-ig-db`, alias `ig-db.internal` en la red de
  Umbrel). La conexión sale de `PGHOST`, `PGUSER`, `PGPASSWORD`… que la app lee de
  `/data/logiqd-services/ig-automation/panel.env` en el Umbrel de LogiQD (fuera de git).
- La lista de reels la pide a la API de Instagram con el token guardado en la base de datos.
- **Enviar a HQ** manda el lead al formulario público de HQ (`POST /api/v1/public/forms/<clave>`).
  En HQ entra como solicitud y se convierte en negocio, contacto y tarea desde allí.
- No tiene login propio: Umbrel lo protege con el login de HQ. Los cambios exigen la cabecera
  `X-IG-Panel` y el mismo origen, para que otra web no pueda hacerlos en tu nombre.

## Formulario de HQ

En HQ → Formularios, crea uno propio con la clave que pongas en Ajustes (p. ej. `instagram`) y estos
campos, todos de tipo texto y opcionales salvo el nombre:

| Clave | Etiqueta |
|---|---|
| `nombre` | Usuario de Instagram |
| `telefono` | Teléfono o WhatsApp |
| `empresa` | Negocio |
| `sector` | Sector |
| `zona` | Zona |
| `web` | Web actual |
| `interes` | Le interesa |
| `instagram` | Perfil de Instagram |
| `mensaje` | Resumen (texto largo) |

`nombre`, `telefono`, `empresa` y `mensaje` son los que HQ reconoce para rellenar el contacto.

## Desarrollo

```bash
./dev/probar-en-vps.sh          # construye y arranca una copia de prueba en el Umbrel
./dev/probar-en-vps.sh --parar
```

La imagen se construye con `docker build .` (compila, pasa las pruebas del servidor y la web).

## Publicar una versión

1. Sube la versión en `server/package.json` y `web/package.json`.
2. `git tag vX.Y.Z && git push --tags`: GitHub Actions publica `ghcr.io/<dueño>/ig-panel:X.Y.Z`.
   La primera vez, marca el paquete como público en GitHub para que Umbrel pueda descargarlo.
3. En la tienda, cambia la versión en `logiqd-ig-panel/umbrel-app.yml` y la imagen en su
   `docker-compose.yml`.
