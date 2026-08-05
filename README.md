# Grupo TSC — Web (HTML5 + CSS3 + JavaScript vanilla)

Sitio institucional de Grupo TSC en HTML5, CSS3 y JavaScript ES6+ puro — sin
frameworks, sin librerías de UI y sin paso de build. Migrado desde una versión
previa en Astro + React islands + Tailwind, preservando 1:1 el contenido, el
diseño, las animaciones y la funcionalidad.

## Requisitos

Ninguno para producción: es HTML/CSS/JS estático, servible desde cualquier
hosting (Netlify, GitHub Pages, S3, un Apache/Nginx, etc.).

Para desarrollo local hace falta servir la carpeta por HTTP (los `<script
type="module">` no cargan de forma confiable abriendo el archivo directo con
doble clic en todos los navegadores):

```bash
npx serve .
# o
python -m http.server 8000
```

## Estructura

```
index.html          # home (one-pager)
login.html           # portal de clientes (stub)
robots.txt, sitemap.xml, site.webmanifest

assets/
  css/
    reset.css         # reset moderno, sin colores
    variables.css      # design tokens: color, tipografía, espaciado, radios, sombras
    layout.css          # base del documento, header, footer, contenedores, grillas
    components.css       # botones, cards, tabs, acordeón, carrusel, formulario, etc.
    pages.css             # estilos de un solo uso (Hero, Login, bloques puntuales)
    animations.css         # scroll-reveal, marquee, ícono de menú
    responsive.css          # todos los breakpoints, en orden ascendente

  js/
    app.js              # entry point, detecta la página por body[data-page]
    utils.js             # helpers genéricos (qs, qsa, debounce, clamp...)
    icons.js              # registro de íconos SVG inline (sin lucide-react)
    animations.js          # scroll-reveal + contadores (IntersectionObserver)
    modules/                # comportamiento de cada pieza interactiva
    pages/                   # wiring de home.js / login.js
    data/                     # contenido de referencia (ver nota abajo)

  img/, video/, icons/    # assets estáticos
```

### Sobre `assets/js/data/`

Estos archivos existían en la versión Astro como fuente de contenido para el
build. Como ahora no hay build, **el contenido real vive directo en
`index.html`/`login.html`** (mejor SEO y funciona sin JavaScript). Cada
archivo de datos quedó como referencia documentada — si cambiás un texto,
actualizalo en el archivo de datos *y* a mano en el HTML correspondiente
(cada uno indica en su comentario de cabecera qué sección tocar).

## Pendiente para producción

- Reemplazar el dominio de ejemplo (`https://www.grupotsc.com.ar/`) en
  `index.html`, `login.html`, `robots.txt` y `sitemap.xml` si cambia.
- Revisar `sitemap.xml` si se agregan páginas nuevas (hoy es un sitio de una
  sola página + login).
