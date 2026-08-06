# Guía de pruebas manuales (admin + cliente)

Instructivo para probar el sitio con tu propio navegador. El backend ya
está levantado en esta PC (Laragon: MySQL + FreeScout + nuestro servidor
PHP) — solo hace falta abrir las URLs.

## 0. Verificar que todo esté arriba

Abrí en el navegador: **http://localhost:4321/api/health**

Tiene que devolver `{"success":true,"data":{"status":"ok","db":"connected"}}`.
Si da error de conexión, avisame y vuelvo a levantar los servidores (ver
[LOCAL_DEV_SETUP.md](LOCAL_DEV_SETUP.md) para los comandos exactos).

## Credenciales de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Admin (FreeScout) | `admin@grupotsc.com.ar` | `83d55a07a4296e9683` |
| Cliente | `cliente@grupotsc.com.ar` | `5cb1a3bc91c3dba16d` |

Sitio: **http://localhost:4321** — el login está en el botón "Ticket" del
menú, o directo en http://localhost:4321/login.html

---

## Parte 1 — Como Admin

1. **Login**: entrá a `login.html`, poné el email y contraseña de admin.
   Te redirige a `panel-admin.html` con tu nombre real ("Admin Grupo TSC")
   en el header — ese dato viene de FreeScout, no está inventado.

2. **Ver tickets**: en "Tickets de Soporte" ya vas a ver el ticket de
   prueba que quedó de una sesión anterior ("No tengo señal WiFi..."),
   asignado a vos y en estado "En curso". Podés:
   - Hacer click en la tarjeta para expandirla (se cargan los comentarios).
   - Cambiar el **Estado** (Abierto/En curso/Resuelto/Cerrado) y la
     **Prioridad** con los selects — se guardan solos, sin botón de
     confirmar.
   - Si el ticket no está tomado por vos, aparece "Tomar ticket"; si ya lo
     tomaste, "Liberar ticket" (lo deja "Sin asignar" de nuevo).
   - Escribir una respuesta en el cuadro de comentarios y mandarla — queda
     en el historial de esa conversación.
   - Los filtros de arriba (Estado, Prioridad, "Solo mis tickets tomados")
     filtran la lista al cambiarlos.

3. **Gestión de clientes** (sección "Usuarios", más abajo):
   - Completá Nombre/Email/Contraseña y "Crear cliente" — aparece al
     instante en la lista de abajo.
   - Probá crear otro con el **mismo email**: tiene que rechazarlo con
     "Ya existe un cliente con ese email."
   - "Dar de baja" en cualquier fila lo marca "Inactivo" (ese cliente no
     va a poder loguearse mientras esté así); "Dar de alta" lo reactiva.
   - "Resetear contraseña" genera una nueva al azar y la muestra una sola
     vez en el aviso verde — copiala si querés probarla, no se vuelve a
     mostrar.
   - **Nota**: esta sección solo maneja clientes. Los admins (como el que
     usaste para entrar) se gestionan desde la propia UI de FreeScout, en
     http://localhost:8001.

4. **Cerrar sesión**: botón "Cerrar sesión" arriba a la derecha — te
   vuelve a mandar al login.

## Parte 2 — Como Cliente

1. **Login**: mismo `login.html`, ahora con el email/contraseña de
   cliente. Te redirige a `panel-cliente.html` ("Mis Tickets") con tu
   nombre ("Cliente de Prueba") en el header.

2. **Ver el ticket que gestionaste como admin**: en "Mis Tickets" vas a
   ver el mismo ticket de la Parte 1, con el estado/prioridad que le
   pusiste y "Lo está atendiendo Admin Grupo TSC". Expandilo para ver el
   comentario que dejaste como admin.

3. **Crear un ticket nuevo**: completá Título/Descripción/Prioridad y
   "Crear ticket" — aparece al toque en "Mis Tickets", en estado "Abierto"
   y "Todavía sin asignar".

4. **Comentar**: expandí cualquiera de tus tickets y mandá una respuesta
   en el cuadro de comentarios.

5. **Cerrar sesión** y volver a entrar como admin (Parte 1) para ver que
   el ticket nuevo aparece en su lista y que tu comentario está en el
   hilo — así se ve el circuito completo cliente ↔ admin.

## Cosas para notar mientras probás

- Un cliente **no puede** ver ni comentar tickets de otro cliente (lo
  probamos con `curl`, da 403) — no hay forma de verlo desde la UI porque
  cada cliente solo ve los suyos, pero está garantizado del lado del
  servidor.
- Las contraseñas de prueba de esta tabla son las que generamos en esta
  sesión — si las cambiás (con "Resetear contraseña" o reseteando tu
  propio login), anotá la nueva para seguir probando.
- Si cerrás la pestaña o pasa un rato largo sin actividad, la sesión sigue
  activa (no hay expiración corta configurada todavía) — para "desloguear"
  de verdad usá el botón "Cerrar sesión".
