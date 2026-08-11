# Grupo TSC

Sitio institucional + portal de tickets de Grupo TSC. Frontend estático
(HTML5, CSS3, JavaScript ES6+ puro, sin build) y un backend en **PHP 8.3 +
MySQL 8** con arquitectura MVC (el backend anterior, en Node/Express + SQL
Server, fue descartado por completo — ver
[docs/BACKEND_RESET_REPORT.md](docs/BACKEND_RESET_REPORT.md)). Corre sobre
Laragon en desarrollo local — ver [docs/LOCAL_DEV_SETUP.md](docs/LOCAL_DEV_SETUP.md).

## Estructura

```
public/                  # todo lo que sirve el servidor web (document root)
  index.php               # front controller de la API (rutas /api/*)
  index.html               # home (one-pager)
  login.html                # login del portal de clientes (real, ver Estado del backend)
  panel-admin.html           # panel de administración (sesión real, tickets/usuarios pendiente)
  panel-cliente.html          # panel de cliente (sesión real, tickets pendiente)
  robots.txt, sitemap.xml, site.webmanifest
  assets/
    css/                       # reset, variables, layout, componentes, páginas, animaciones, paneles, responsive
    js/
      app.js                    # entry point del sitio público, detecta la página por body[data-page]
      utils.js                   # helpers genéricos (qs, qsa, debounce, clamp...)
      modules/                    # comportamiento de cada pieza interactiva (incluye api-client.js)
      pages/                       # wiring de home.js / login.js / panel-admin.js / panel-cliente.js
      data/                         # contenido de referencia (ver nota abajo)
    img/, icons/                     # assets estáticos

app/                      # backend PHP (namespace App\, PSR-4)
  Config/                  # Env.php, Database.php (conexiones PDO a MySQL, multi-base)
  Core/                     # Router.php, Request.php, Response.php
  Controllers/               # BaseController.php, HealthController.php, AuthController.php
  Models/                      # BaseModel.php, ClienteUsuarioModel.php
  Middleware/                     # AuthMiddleware.php (guarda de sesión)
  Helpers/                          # Validator.php

database/
  migrations/                # 001_usuarios_clientes.sql (clientes propios)
  seeds/                       # vacío por ahora

storage/, logs/, cache/     # runtime del backend (ignorados por git salvo .gitkeep)
docs/                        # informes y documentos de arquitectura
composer.json, .env.example
```

### Sobre `assets/js/data/`

El contenido real vive directo en `index.html`/`login.html` (mejor SEO y
funciona sin JavaScript). Cada archivo en `assets/js/data/` quedó como
referencia documentada — si cambiás un texto, actualizalo en el archivo de
datos *y* a mano en el HTML correspondiente.

## Desarrollo local

Todo corre con el PHP embebido de Laragon (sirve el frontend estático **y**
la API en el mismo origen, sin CORS) — comando exacto en
`.claude/launch.json` y detalle completo (MySQL) en
[docs/LOCAL_DEV_SETUP.md](docs/LOCAL_DEV_SETUP.md):

```bash
composer install
cp .env.example .env    # completar credenciales de MySQL (grupotsc)
php -S localhost:4321 -t public public/index.php
```

## Estado del backend

- Login real implementado contra dos tablas propias en `grupotsc`:
  administradores/agentes de soporte (`usuarios_administradores`) y
  clientes (`usuarios_clientes`).
- Sesión con cookie httpOnly nativa de PHP (`GET/POST /api/auth/*`) — no hay
  JWT ni token guardado en el cliente.
- **Módulo de tickets implementado**: ciclo de vida `NEW` → `EN_PROCESO` →
  `RESUELTO` (bloqueado, sin vuelta atrás), niveles de escalado 1/2/3 con
  pestañas y badge de tickets nuevos por nivel, adjuntos (imágenes/PDF,
  MIME validado con `finfo`, guardados fuera de `public/`), comentarios, y
  "Proponer Solución" que resuelve y bloquea el ticket por completo (ni
  comentarios ni adjuntos nuevos de nadie) —
  `app/Controllers/TicketController.php`,
  `database/migrations/002_tickets.sql`,
  `database/migrations/003_tickets_niveles_resolucion.sql`,
  `database/migrations/004_ticket_adjuntos.sql`. Un cliente no puede ver/
  comentar/adjuntar en tickets ajenos (403).
- Reseteo de contraseña de clientes con dos opciones: generar una aleatoria
  o asignar una manual.
- Panel admin/cliente con diseño claro (dashboard blanco, sombras suaves),
  scoped solo a esas dos páginas — el sitio público mantiene su tema oscuro
  de marca sin cambios.
- **Gestión de clientes y agentes de soporte implementada**: alta, listado,
  activar/desactivar y resetear contraseña desde el panel admin, para
  clientes (`usuarios_clientes`) y para agentes de soporte
  (`usuarios_administradores`, `app/Controllers/AdministradorController.php`,
  con nombre/apellido/título/nivel/foto de perfil) — se crean y viven
  enteramente en nuestra base, sin dependencias externas.
- Checklist de seguridad, con lo ya cubierto por el login y lo pendiente
  para cuando se agreguen esos endpoints:
  [docs/SECURITY_NOTES.md](docs/SECURITY_NOTES.md).
