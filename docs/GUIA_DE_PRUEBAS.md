# Guía de pruebas manuales (admin + cliente)

Instructivo para probar el sitio con tu propio navegador. El backend ya
está levantado en esta PC (Laragon: MySQL + nuestro servidor PHP) — solo
hace falta abrir las URLs.

## 0. Verificar que todo esté arriba

Abrí en el navegador: **http://localhost:4321/api/health**

Tiene que devolver `{"success":true,"data":{"status":"ok","db":"connected"}}`.
Si da error de conexión, avisame y vuelvo a levantar los servidores (ver
[LOCAL_DEV_SETUP.md](LOCAL_DEV_SETUP.md) para los comandos exactos).

## Credenciales de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Admin local (creado desde el panel) | `ana@grupotsc.com.ar` | `AnaSoporte123` |
| Cliente | `cliente@grupotsc.com.ar` | `5cb1a3bc91c3dba16d` |

Si alguna de las dos ya no funciona (por ejemplo porque la cambiaste en una
prueba anterior), usá "Resetear contraseña" desde el panel admin para
volver a fijarla, o avisame.

Sitio: **http://localhost:4321** — el login está en el botón "Ticket" del
menú, o directo en http://localhost:4321/login.html

---

## Parte 1 — Como Admin

1. **Login**: entrá a `login.html`, poné el email y contraseña de admin.
   Te redirige a `panel-admin.html` con tu nombre en el header.

2. **Pestañas de Nivel** (arriba de todo): Nivel 1 / Nivel 2 / Nivel 3, cada
   una con un badge rojo que muestra cuántos tickets **nuevos** (`NEW`) hay
   ahí. Arrancás en Nivel 1.

3. **Ver y gestionar un ticket**:
   - Click en la tarjeta para expandirla (carga comentarios y adjuntos).
   - Si nadie lo tomó, aparece **"Adjudicarme ticket"** — al tomarlo pasa
     de `NUEVO` a `EN PROCESO` automáticamente. Si ya es tuyo, aparece
     "Liberar ticket".
   - **Estado** y **Prioridad**: selects que guardan solos al cambiarlos
     (el estado acá solo permite Nuevo/En proceso — Resuelto tiene su
     propio flujo, ver punto 5).
   - **"Escalar a Nivel N"**: lo manda al nivel siguiente y desaparece de
     la pestaña actual — probalo y fijate que aparece en la pestaña de al
     lado.
   - Filtros (Estado, Prioridad, "Solo mis tickets tomados") sobre lo que
     ya estás mirando en la pestaña activa.

4. **Adjuntos**: dentro de la tarjeta expandida, subí una imagen (jpg,
   png, webp, gif) o un PDF con el selector de archivo + "Subir". Aparece
   al toque en la lista de adjuntos con link de descarga.

5. **Resolver un ticket**: botón **"Proponer Solución"** abre un cuadro de
   texto — escribí la solución y "Confirmar resolución". La tarjeta se
   pone **verde**, el badge pasa a "RESUELTO", y **desaparece toda la
   gestión** (no hay más selects, botones de tomar/escalar, ni forms de
   comentar/adjuntar) — queda de solo lectura con la solución visible.
   Esto es definitivo: no hay forma de reabrirlo desde acá.

6. **Gestión de clientes** (sección "Usuarios", más abajo):
   - Completá Nombre/Email/Contraseña y "Crear cliente".
   - Probá el mismo email dos veces: el segundo intento tiene que
     rechazarse ("Ya existe un cliente con ese email").
   - "Dar de baja"/"Dar de alta" activa o desactiva el login de ese cliente.
   - Reseteo de contraseña con **dos opciones**: "Generar contraseña
     aleatoria" (te muestra una nueva una sola vez) o "Asignar contraseña
     manual" (despliega un campo para escribir la que quieras).
   - **Nota**: esta sección solo maneja clientes.

7. **Gestión de agentes de soporte** (sección "Agentes de Soporte", debajo
   de "Usuarios"): crea gente que puede loguearse y gestionar tickets en
   este panel, con nombre/apellido/título/nivel y foto de perfil — ya hay
   uno de prueba, "Ana Soporte" (credenciales arriba). Cerrá sesión y
   volvé a entrar con esas credenciales: vas a ver el mismo panel, con los
   mismos permisos.

8. **Cerrar sesión**: botón arriba a la derecha.

## Parte 2 — Como Cliente

1. **Login**: mismo `login.html`, con el email/contraseña de cliente. Te
   redirige a "Mis Tickets".

2. **Ver un ticket que gestionaste como admin**: vas a ver el estado,
   nivel, prioridad y quién lo está atendiendo. Si lo resolviste, aparece
   en modo solo lectura con la solución y sin forms de comentar/adjuntar
   (igual que del lado admin).

3. **Crear un ticket nuevo**: Título/Descripción/Prioridad → "Crear
   ticket". Nace en estado `NUEVO`, Nivel 1, sin asignar.

4. **Comentar y adjuntar**: expandí un ticket que no esté resuelto y
   probá ambos — comentario de texto y subida de archivo.

5. **Cerrar sesión** y volver a entrar como admin para ver el ticket nuevo
   con el badge de "nuevo" en Nivel 1, y adjudicártelo/escalarlo/
   resolverlo — así se ve el circuito completo cliente ↔ admin.

## Cosas para notar mientras probás

- Un cliente **no puede** ver/comentar/adjuntar en tickets de otro
  cliente (403 del lado servidor, ya probado con `curl`).
- Un ticket **resuelto queda bloqueado para siempre**: ni el admin que lo
  resolvió puede reasignarlo, comentar o escalarlo — es intencional.
- "Solo mis tickets tomados" filtra correctamente — cada admin ve solo lo
  suyo.
- Las contraseñas de esta tabla son las que generamos en esta sesión — si
  las cambiás, anotá la nueva para seguir probando.
- Si cerrás la pestaña o pasa un rato sin actividad, la sesión sigue
  activa (sin expiración corta configurada todavía) — usá "Cerrar sesión"
  para desloguear de verdad.
