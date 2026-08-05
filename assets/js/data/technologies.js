// Contenido de referencia: los 6 tabs y paneles van como HTML estático en
// index.html (tabs.js sólo togglea visibilidad, no genera contenido). Si
// cambiás algo acá, actualizá también la sección #tecnologias en index.html.
export const technologies = [
  {
    id: 't-cctv',
    tab: 'CCTV',
    icon: 'video',
    title: 'Videovigilancia IP (CCTV)',
    text: 'Instalamos sistemas de cámaras IP de alta definición con grabación continua, visión nocturna y acceso remoto desde cualquier dispositivo. Ideal para fábricas, comercios, edificios y espacios públicos.',
    tags: ['Hikvision & Dahua', 'Cámaras domo, bala y PTZ', 'NVR y almacenamiento en nube', 'Monitoreo remoto 24/7'],
  },
  {
    id: 't-redes',
    tab: 'Redes',
    icon: 'network',
    title: 'Infraestructura de Redes LAN/WAN',
    text: 'Diseño, instalación y certificación de redes cableadas e inalámbricas para entornos corporativos e industriales. Trabajamos con switches administrables, routers y electrónica de red de primer nivel.',
    tags: ['Cisco & Ubiquiti', 'Switches administrables', 'VLANs y segmentación', 'Certificación Cat6 / Cat6A'],
  },
  {
    id: 't-wifi',
    tab: 'WiFi',
    icon: 'wifi',
    title: 'WiFi Empresarial de Alta Densidad',
    text: 'Cobertura total sin puntos ciegos para plantas de producción, oficinas y espacios abiertos. Roaming inteligente entre access points, segmentación de red y administración centralizada.',
    tags: ['Ubiquiti UniFi', 'Estudios de cobertura', 'Red de invitados segura', 'Gestión centralizada'],
  },
  {
    id: 't-acceso',
    tab: 'Acceso',
    icon: 'idBadge',
    title: 'Control de Acceso Biométrico',
    text: 'Sistemas de acceso con tarjeta, PIN, huella dactilar y reconocimiento facial para controlar el ingreso a sectores sensibles. Registro de horarios e integración con CCTV.',
    tags: ['Biometría y RFID', 'Barreras y molinetes', 'Registro de asistencia', 'Integración con CCTV'],
  },
  {
    id: 't-telefonia',
    tab: 'Telefonía IP',
    icon: 'phone',
    title: 'Telefonía IP y VoIP',
    text: 'Centralitas IP, teléfonos SIP y soluciones de comunicación unificada para reemplazar la telefonía tradicional. Llamadas internas gratuitas, gestión de colas y grabación de llamadas.',
    tags: ['Centralitas Asterisk / FreePBX', 'Teléfonos SIP Grandstream', 'Softphones y app móvil', 'Grabación de llamadas'],
  },
  {
    id: 't-fibra',
    tab: 'Fibra Óptica',
    icon: 'route',
    title: 'Tendido y Fusión de Fibra Óptica',
    text: 'Instalación de enlaces troncales de alta velocidad para interconectar edificios, plantas y sucursales. Fusionamos fibra monomodo y multimodo con equipamiento de última generación.',
    tags: ['Fusiones por arco voltaico', 'Monomodo y multimodo', 'Hasta 10 Gbps', 'Diagnóstico OTDR'],
  },
];
