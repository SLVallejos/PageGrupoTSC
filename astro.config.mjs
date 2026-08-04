import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// Nota: el sitio es de una sola pagina (one-pager), por lo que el sitemap.xml
// se mantiene como archivo estatico en public/ en vez de usar @astrojs/sitemap
// (pensado para sitios multi-pagina con rutas dinamicas).
export default defineConfig({
  site: 'https://www.grupotsc.com.ar',
  integrations: [react(), tailwind({ applyBaseStyles: false })],
});
