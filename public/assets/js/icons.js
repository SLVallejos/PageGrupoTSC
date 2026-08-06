/**
 * Registro de íconos inline, reemplaza el import por nombre de lucide-react
 * (`iconMap` en src/components/ui/icons.jsx). Cada entrada es sólo el
 * contenido interno de un <svg> 24x24 con trazo — sin depender de ningún
 * paquete npm. 'menu' y 'close' del mapa original no se migran: ningún
 * componente los usaba (el ícono de hamburguesa se arma con <span> propios
 * en animations.css), así que eran código muerto.
 *
 * Con la decisión de HTML estático (ver data/*.js), ningún módulo importa
 * icon() en runtime: cada ícono queda escrito directo en index.html/
 * login.html usando estos mismos paths. Este archivo es la fuente única de
 * verdad de cada trazo — si un ícono cambia, se edita acá y se refleja a
 * mano en el HTML — y sirve para generar el <svg> de cualquier ícono nuevo
 * sin redibujarlo. No se elimina: no es código muerto, es el diccionario de
 * iconografía del sitio.
 */

const ICONS = {
  network:
    '<rect x="9" y="2" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="16" y="16" width="6" height="6" rx="1"/><path d="M12 8v3M5 16v-1a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8Z"/>',
  wifi:
    '<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.8a15 15 0 0 1 20 0"/><path d="M12 20h.01"/>',
  idBadge:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h3M15 12h3M6 18c0-1.7 1.3-3 3-3s3 1.3 3 3"/>',
  idCard:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M15 8h3M15 12h3M6 18c0-1.7 1.3-3 3-3s3 1.3 3 3"/>',
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a4 4 0 0 0 4-4V7"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  rocket:
    '<path d="M12 2c2.5 2.5 4 6 4 10 0 2-1 4-1 4H9s-1-2-1-4c0-4 1.5-7.5 4-10Z"/><circle cx="12" cy="9" r="1.5"/><path d="m9 16-2 4 3-1M15 16l2 4-3-1"/>',
  headset:
    '<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><path d="M21 14a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h3v4Z"/><path d="M3 14a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2H3v4Z"/>',
  medal: '<circle cx="12" cy="8" r="6"/><path d="M8.5 13.5 6 22l6-3 6 3-2.5-8.5"/>',
  cpu:
    '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>',
  tools: '<path d="M14.7 6.3a4 4 0 1 0-5.4 5.4L2 19l3 3 7.3-7.3a4 4 0 0 0 5.4-5.4Z"/>',
  landmark:
    '<path d="M3 22h18"/><path d="M4 22V10.5"/><path d="M20 22V10.5"/><path d="M3 10.5 12 4l9 6.5"/><path d="M8 22v-7M12 22v-7M16 22v-7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
  mapPin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  alert: '<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  doorOpen:
    '<path d="M11 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="M11 3v18"/><path d="M14 9v3"/><path d="M20 21V9l-9-6"/>',
  server:
    '<rect x="2" y="3" width="20" height="7" rx="1.5"/><rect x="2" y="14" width="20" height="7" rx="1.5"/><path d="M6 6.5h.01M6 17.5h.01"/>',
  ticket:
    '<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 0 0 3V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.5a1.5 1.5 0 0 0 0-3Z"/><path d="M13 5v14"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
};

export function icon(name, { size = 20, strokeWidth = 2, className = '' } = {}) {
  const inner = ICONS[name];
  if (!inner) return '';
  const classAttr = className ? ` class="${className}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${classAttr}>${inner}</svg>`;
}
