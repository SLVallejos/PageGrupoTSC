// Contenido de referencia: los 6 tabs y paneles van como HTML estático en
// index.html (tabs.js sólo togglea visibilidad, no genera contenido). Cada
// panel es un módulo .tech-split (ficha técnica + mockup visual animado por
// tech-showcase.js) con chips de marcas/features y un CTA inteligente que
// pre-completa el formulario de contacto. Si cambiás algo acá, actualizá
// también la sección #tecnologias en index.html.
export const technologies = [
  {
    id: 't-cctv',
    tab: 'CCTV',
    title: 'Videovigilancia IP (CCTV)',
    problem: 'Zonas sin control visual y siniestros que se descubren tarde, sin evidencia grabada para reclamos.',
    scope: ['Cámaras IP HD con visión nocturna', 'Grabación continua en NVR o nube', 'Acceso remoto desde cualquier dispositivo'],
    benefit: 'Monitoreo en tiempo real y evidencia grabada las 24 horas, desde el celular.',
    chips: [
      { label: 'Hikvision', brand: true, tip: 'Cámaras y NVR de alta resolución — la marca que más instalamos.' },
      { label: 'Dahua', brand: true, tip: 'Alternativa robusta para proyectos de gran escala.' },
      { label: 'PTZ motorizadas', tip: 'Cámaras que giran e inclinan para cubrir áreas amplias.' },
      { label: 'Grabación en la nube', tip: 'Respaldo redundante además del NVR local.' },
    ],
    ctaService: 'cctv',
    ctaMessage: 'Hola, quisiera solicitar asesoramiento y cotización para un sistema de CCTV / Videovigilancia IP.',
  },
  {
    id: 't-redes',
    tab: 'Redes',
    title: 'Infraestructura de Redes LAN/WAN',
    problem: 'Cortes de red y una topología desordenada que ralentiza la operación y complica cada mantenimiento.',
    scope: ['Cableado Cat6 / Cat6A certificado', 'Switches administrables y VLANs', 'Documentación y etiquetado del rack'],
    benefit: 'Red estable y escalable que sostiene el crecimiento sin rediseñar desde cero.',
    chips: [
      { label: 'Cisco', brand: true, tip: 'Switches y routers de nivel empresarial.' },
      { label: 'Ubiquiti', brand: true, tip: 'Buena relación costo-beneficio para pymes e industria.' },
      { label: 'Cat6A', tip: 'Certificación de cableado con capacidad hasta 10 Gbps.' },
      { label: 'VLANs', tip: 'Segmentación de tráfico por área o tipo de dispositivo.' },
    ],
    ctaService: 'redes',
    ctaMessage: 'Hola, quisiera solicitar asesoramiento y cotización para infraestructura de red (cableado y electrónica).',
  },
  {
    id: 't-wifi',
    tab: 'WiFi',
    title: 'WiFi Empresarial de Alta Densidad',
    problem: 'Zonas muertas de señal y saturación en horas pico que frenan la operación diaria.',
    scope: ['Access points de alta densidad', 'Roaming inteligente entre equipos', 'Red de invitados segmentada'],
    benefit: 'Cobertura total sin puntos ciegos, incluso con cientos de dispositivos conectados.',
    chips: [
      { label: 'Ubiquiti UniFi', brand: true, tip: 'Gestión centralizada de todos los access points.' },
      { label: 'Mikrotik', brand: true, tip: 'Ideal para redes con requerimientos avanzados de ruteo.' },
      { label: 'Mapa de calor', tip: 'Estudio de cobertura previo a la instalación.' },
    ],
    ctaService: 'wifi',
    ctaMessage: 'Hola, quisiera solicitar asesoramiento y cotización para WiFi empresarial de alta densidad.',
  },
  {
    id: 't-acceso',
    tab: 'Acceso',
    title: 'Control de Acceso Biométrico',
    problem: 'Ingresos no controlados a sectores sensibles, sin registro de quién entra y sale.',
    scope: ['Biometría y tarjetas RFID', 'Reconocimiento facial', 'Integración con el CCTV existente'],
    benefit: 'Trazabilidad completa de accesos y restricción por horarios sin intervención manual.',
    chips: [
      { label: 'Hikvision', brand: true, tip: 'Terminales biométricas integradas con CCTV.' },
      { label: 'ZKTeco', brand: true, tip: 'Especialistas en control de presentismo y accesos.' },
      { label: 'RFID', tip: 'Tarjetas y llaveros de proximidad.' },
    ],
    ctaService: 'acceso',
    ctaMessage: 'Hola, quisiera solicitar asesoramiento y cotización para control de acceso.',
  },
  {
    id: 't-telefonia',
    tab: 'Telefonía IP',
    title: 'Telefonía IP y VoIP',
    problem: 'Costos altos de telefonía tradicional y cero visibilidad sobre la atención al cliente.',
    scope: ['Centralitas IP (Asterisk / FreePBX)', 'Teléfonos SIP y softphones', 'Grabación y colas de llamadas'],
    benefit: 'Comunicación unificada con menor costo y trazabilidad de cada llamada.',
    chips: [
      { label: 'Grandstream', brand: true, tip: 'Teléfonos SIP de uso corporativo.' },
      { label: 'Yealink', brand: true, tip: 'Alternativa premium para salas de reunión.' },
      { label: 'FreePBX', tip: 'Central telefónica open-source, sin licencias por usuario.' },
    ],
    ctaService: 'telefonia',
    ctaMessage: 'Hola, quisiera solicitar asesoramiento y cotización para telefonía IP / VoIP.',
  },
  {
    id: 't-soporte',
    tab: 'Soporte Técnico',
    title: 'Soporte Técnico y Help Desk',
    problem: 'Fallas que se acumulan sin resolverse, tickets sin seguimiento y ningún proveedor que responda fuera de horario.',
    scope: ['Mesa de ayuda remota con diagnóstico inmediato', 'Mantenimiento preventivo y correctivo programado', 'Guardias técnicas de emergencia 24/7 (abonados)'],
    benefit: 'Un solo número para resolver cualquier incidencia, con tiempos de respuesta comprometidos.',
    chips: [
      { label: 'Mesa de ayuda remota', tip: 'Resolución de incidencias sin esperar una visita técnica.' },
      { label: 'SLA de respuesta', tip: 'Tiempos de atención comprometidos según el plan contratado.' },
      { label: 'Guardias 24/7', tip: 'Exclusivas para clientes con abono técnico activo.' },
    ],
    ctaService: 'soporte',
    ctaMessage: 'Hola, quisiera solicitar información sobre planes de soporte técnico y guardias de emergencia.',
  },
];
