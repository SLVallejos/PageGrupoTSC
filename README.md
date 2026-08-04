# Grupo TSC — Web (Astro + React islands + Tailwind)

Migración del sitio institucional de Grupo TSC desde HTML/CSS/JS puro a Astro,
manteniendo 1:1 el contenido, copy, imágenes y SEO del sitio original, con
arquitectura componentizada y diseño elevado. Ver `PROPUESTA_MIGRACION_GrupoTSC.md`
(carpeta raíz de la entrega) para el diagnóstico completo, la justificación del
stack y el plan de migración por fases.

## Requisitos

- Node.js 18.17+ (recomendado 20 o 22)

## Uso

```bash
npm install
npm run dev       # servidor de desarrollo en http://localhost:4321
npm run build     # build de producción en ./dist
npm run preview   # sirve el build de ./dist localmente
```

## Estructura

- `src/data/` — todo el contenido de texto (servicios, proyectos, FAQ, etc.), separado de la presentación.
- `src/layouts/BaseLayout.astro` — `<head>`, metadata SEO, Open Graph, JSON-LD.
- `src/components/layout/` — Navbar, Footer, botón de WhatsApp.
- `src/components/sections/` — una sección de la página por archivo `.astro`.
- `src/components/islands/` — los únicos 5 componentes con JavaScript en el cliente (tabs de Tecnologías, tabs de Soluciones, carrusel de Proyectos, acordeón de FAQ, formulario de Contacto).
- `src/components/ui/` — piezas reutilizables (`Card`, `SectionHeading`, mapa de íconos).
- `src/scripts/reveal.js` — animaciones de scroll-reveal y contadores con GSAP.

## Pendiente para producción

- Reemplazar `site` en `astro.config.mjs` y las URLs de `robots.txt` / `sitemap.xml` / `BaseLayout.astro` por el dominio final.
- Revisar `public/sitemap.xml` si se agregan páginas nuevas (hoy es un sitio de una sola página).
