# Deploy de la beta a `beta.grupotsc-ar.com`

Guía para publicar el sitio + panel de tickets en el hosting real, sin
tocar el sitio corporativo que ya está en vivo en `grupotsc-ar.com`.

No tengo acceso en vivo a tu panel de hosting, así que esta guía es para
que vos hagas los pasos del panel; yo ya dejé preparado todo el código y
los archivos para subir.

## 1. Crear el subdominio

En "Administración de subdominios" del panel, creá `beta`
(`beta.grupotsc-ar.com`). Fijate qué carpeta te crea — normalmente algo
como `.../212471/beta` (mismo patrón que vimos para el dominio principal,
`.../212471/www`). **Avisame la ruta exacta** que te muestre, por si hay
que ajustar algo.

## 2. Crear la base de datos

En "Administración de bases de datos" (tenías 1 de 2 usados, así que hay
lugar). Anotá:
- Nombre de la base
- Usuario
- Contraseña

Pasámelos si querés que te arme el `.env` completo, o completalos vos
mismo en el archivo (paso 4) antes de subirlo — cualquiera de las dos
está bien, es una contraseña de aplicación nueva que elegís vos en el
panel, no la de tu cuenta de hosting.

## 3. Subir los archivos

**Ajuste real vs. plan original:** el usuario FTP de este hosting no tiene
permiso de escritura en la raíz (`/`) — solo dentro de `beta/` y `www/`
(confirmado con un `550 Permission denied` al intentar crear una carpeta
de prueba en `/`). Por eso **todo** va adentro de `beta/`, no solo
`public/`. `public/index.php` ya detecta este layout automáticamente
(busca `vendor/` al lado suyo antes que un nivel arriba), así que no hace
falta nada especial más que subir todo junto:

**Adentro de `beta/`** (todo al mismo nivel):
```
index.php, index.html, login.html, panel-admin.html, panel-cliente.html,
.htaccess, robots.txt, sitemap.xml, site.webmanifest, assets/   (contenido de public/)
app/, vendor/, database/, storage/, logs/, cache/                (carpetas completas)
.env                                                              (ver paso 4, no .env.production.example)
```

`app/`, `vendor/`, `storage/`, `database/`, `logs/`, `cache/` tienen su
propio `.htaccess` bloqueando el acceso HTTP directo, y el `.htaccess`
principal (el de `public/`) bloquea cualquier dotfile (`.env` incluido) —
doble seguro ya que ahora conviven con el docroot público en vez de quedar
afuera.

Por FTP: `ftp.grupotsc-ar.com`. Si FileZilla corta la conexión en medio de
la subida de `vendor/` (muchos archivos chicos), bajá "Número máximo de
transferencias simultáneas" a 1 en Edición → Configuración → Transferencias,
y forzá modo binario (Transferencia → Tipo de transferencia → Binario)
para evitar el aviso `SIZE not allowed in ASCII mode`.

## 4. Armar el `.env`

Copiá `.env.production.example` (raíz del proyecto) a `.env`, completá los
datos de la base del paso 2, y subilo junto con `app/`/`vendor/`/etc (**no**
adentro del docroot público). `APP_URL` ya viene con
`https://beta.grupotsc-ar.com`.

## 5. Cargar el esquema de la base

`database/deploy/schema_produccion.sql` — pegalo entero en la pestaña SQL
de phpMyAdmin, sobre la base que creaste. Ya probado localmente antes de
dártelo (tablas + un admin de arranque).

**Credenciales del admin de arranque** (cambialas desde "Resetear
contraseña" en el panel apenas puedas entrar):

| Email | Contraseña |
|---|---|
| `admin@beta.grupotsc-ar.com` | `ad89052b1d4d8ece14` |

## 6. Verificar

1. `https://beta.grupotsc-ar.com/api/health` tiene que devolver
   `{"success":true,"data":{"status":"ok","db":"connected"}}`. Si da error,
   pasame el mensaje exacto.
2. `https://beta.grupotsc-ar.com/login.html` con el admin de arranque.
3. Si `https://` no anda solo (candado roto o error de certificado), el
   panel suele emitir SSL automático poco después de crear el subdominio
   — si tarda, buscá la sección de SSL/AutoSSL.

## 7. Después de subir

Una vez que confirmes que anda: te ayudo a crear un cliente de prueba
(no viene en el seed) para probar el circuito completo — crear ticket
como cliente, gestionarlo como admin — igual que hicimos en local
(ver [GUIA_DE_PRUEBAS.md](GUIA_DE_PRUEBAS.md), mismos pasos, otra URL).

## Pendiente para cuando se retome

- Certificado SSL si no se emite solo.
- Mover esto de `beta.` a producción real cuando decidan reemplazar el
  sitio actual — en ese momento hay que decidir qué pasa con el sitio
  corporativo viejo (¿se archiva? ¿queda en otro subdominio?).
