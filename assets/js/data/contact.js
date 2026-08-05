// Contenido de referencia: el bloque de contacto y el <select> de
// "tipo de consulta" van como HTML estático en index.html. contact-form.js
// no importa este archivo: lee el endpoint desde el atributo
// data-endpoint del <form>. Si cambiás algo acá, actualizá también la
// sección #contacto en index.html.
export const contact = {
  formEndpoint: 'https://formspree.io/f/xpqgwkql',
  phoneDisplay: '+54 9 351 454-354',
  phoneHref: 'tel:+549351454354',
  email: 'grupotsctecnico@gmail.com',
  location: 'Pasaje Juan Ramón Jiménez 1169, Córdoba, Argentina',
  schedule: [{ label: 'Lunes a Viernes:', value: '08:00 a 17:00 hs' }],
  note: 'Guardias técnicas 24/7 exclusivas para clientes con abono activo.',
  whatsapp: {
    href: 'https://wa.me/5493525536785?text=Hola%20Grupo%20TSC,%20vi%20su%20sitio%20web%20y%20quisiera%20asesoramiento.',
  },
  typeOptions: [
    { value: '', label: '¿Qué necesitás? (opcional)' },
    { value: 'redes', label: 'Redes / Conectividad' },
    { value: 'cctv', label: 'Cámaras / CCTV' },
    { value: 'acceso', label: 'Control de Acceso' },
    { value: 'fibra', label: 'Fibra Óptica' },
    { value: 'wifi', label: 'WiFi Empresarial' },
    { value: 'soporte', label: 'Soporte Técnico' },
    { value: 'otro', label: 'Otro' },
  ],
};

export const footerLinks = [
  { href: '#servicios', label: 'Servicios' },
  { href: '#proyectos', label: 'Proyectos' },
  { href: '#faq', label: 'FAQ' },
  { href: '#contacto', label: 'Contacto' },
  { href: '#contacto', label: 'Política de Privacidad' },
];
