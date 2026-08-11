import { qs } from '../utils.js';
import { requireAuth, apiFetch, apiUpload, logout } from '../modules/api-client.js';
import { showSection, setActiveSidebarLink, initPanelShell } from '../modules/panel-shell.js';

/**
 * Panel de administración: gestión de tickets (ver, adjudicar/liberar,
 * cambiar estado/prioridad, escalar de nivel, resolver, comentar, subir
 * adjuntos), de clientes y de agentes de soporte (alta, listado,
 * activar/desactivar, resetear contraseña, foto de perfil).
 */

const ESTADOS = { NEW: 'Nuevo', EN_PROCESO: 'En proceso', RESUELTO: 'Resuelto' };
const ESTADOS_EDITABLES = ['NEW', 'EN_PROCESO']; // RESUELTO solo por el flujo de "Proponer Solución"
const PRIORIDADES = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', URGENTE: 'Urgente' };
const SLA_LABELS = { OK: 'SLA OK', PROXIMO: 'SLA próximo', VENCIDO: 'SLA vencido', CUMPLIDO: 'SLA cumplido', FUERA_PLAZO: 'Fuera de plazo' };
const EVENTO_LABELS = {
  CREADO: 'Ticket creado',
  ASIGNADO: 'Ticket asignado',
  LIBERADO: 'Ticket liberado',
  ESTADO: 'Cambio de estado',
  PRIORIDAD: 'Cambio de prioridad',
  ESCALADO: 'Escalado',
  COMENTARIO: 'Comentario',
  RESUELTO: 'Ticket resuelto',
};
const PAGE_SIZE = 10;
const ADJUNTOS_ACEPTADOS = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';

let ticketsPage = 1;
let ticketsTotalPages = 1;
let nivelActual = null; // null = "Todos" (el arranque ahora es la sección Inicio, no Nivel 1)
let sinAsignarActual = false;
let qFilterActual = '';
let usuarioActual = null;

/** Escapa texto para insertarlo de forma segura dentro de HTML (evita XSS con datos de tickets/comentarios). */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function formatFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mostrarAlerta(elId, mensaje, tipo = 'error') {
  const el = qs(`#${elId}`);
  if (!el) return;
  el.textContent = mensaje;
  el.className = `panel-alert is-visible${tipo === 'success' ? ' panel-alert--success' : ''}`;
  if (tipo === 'success') setTimeout(() => el.classList.remove('is-visible'), 4000);
}

/** Avatar de un agente: foto si tiene, si no un círculo con la inicial del nombre. Mismo helper para el roster de Agentes y para "Asignado a" en tarjetas de ticket. */
function avatarHtml(fotoUrl, nombre, tamano = 'sm') {
  const claseTamano = `avatar--${tamano}`;
  if (fotoUrl) {
    return `<img src="${fotoUrl}" alt="" class="avatar ${claseTamano}" />`;
  }
  const inicial = (nombre || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="avatar-fallback ${claseTamano}">${escapeHtml(inicial)}</span>`;
}

/* ====================================
   TICKETS
==================================== */

function ticketControlesHtml(t) {
  if (t.estado === 'RESUELTO') {
    return `
      <div class="solucion-box">
        <strong>Solución propuesta</strong>
        <p>${escapeHtml(t.solucion)}</p>
        <span class="ticket-card__meta">Resuelto el ${formatFecha(t.fechaResuelto)}</span>
      </div>
    `;
  }

  return `
    <div class="ticket-card__controls">
      <div class="field">
        <label class="field__label field__label--form">Estado</label>
        <select class="field__input" data-action="estado">
          ${ESTADOS_EDITABLES.map((v) => `<option value="${v}" ${v === t.estado ? 'selected' : ''}>${ESTADOS[v]}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field__label field__label--form">Prioridad</label>
        <select class="field__input" data-action="prioridad">
          ${Object.entries(PRIORIDADES).map(([v, label]) => `<option value="${v}" ${v === t.prioridad ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      ${
        t.asignadoAId === usuarioActual.id
          ? '<button type="button" class="btn btn-secondary btn--sm" data-action="liberar">Liberar ticket</button>'
          : '<button type="button" class="btn btn-secondary btn--sm" data-action="adjudicar">Adjudicarme ticket</button>'
      }
      ${
        t.nivel < 3
          ? `<button type="button" class="btn btn-secondary btn--sm" data-action="escalar-toggle">Escalar a Nivel ${t.nivel + 1}</button>`
          : ''
      }
      <button type="button" class="btn btn-secondary btn--sm" data-action="resolver-toggle">Proponer Solución</button>
    </div>
    ${
      t.nivel < 3
        ? `<div class="resolver-form" data-role="escalar-form" hidden>
             <input type="text" class="field__input" placeholder="Motivo del escalamiento…" required maxlength="500" data-role="escalar-motivo" />
             <button type="button" class="btn btn-primary btn--sm" data-action="escalar-confirmar">Confirmar escalamiento</button>
           </div>`
        : ''
    }
    <div class="resolver-form" data-role="resolver-form" hidden>
      <textarea class="field__input" placeholder="Describí la solución aplicada…" required maxlength="4000"></textarea>
      <button type="button" class="btn btn-primary btn--sm" data-action="resolver-confirmar">Confirmar resolución</button>
    </div>
  `;
}

function ticketCardHtml(t) {
  const estadoClase = `badge--estado-${t.estado.toLowerCase()}`;
  const prioridadClase = `badge--prioridad-${t.prioridad.toLowerCase()}`;
  const slaClase = `badge--sla-${t.slaEstado.toLowerCase()}`;
  const asignado = t.asignadoANombre
    ? `${avatarHtml(t.asignadoAFotoUrl, t.asignadoANombre, 'sm')} ${escapeHtml(t.asignadoANombre)}${t.asignadoATitulo ? ` · ${escapeHtml(t.asignadoATitulo)}` : ''}`
    : 'Sin asignar';
  const resuelto = t.estado === 'RESUELTO';

  return `
    <article class="glass-card ticket-card${resuelto ? ' ticket-card--resuelto' : ''}" data-id="${t.id}" data-nivel="${t.nivel}">
      <div class="ticket-card__head" data-action="toggle">
        <span class="ticket-card__id">#${t.id}</span>
        <div style="flex:1; min-width:180px;">
          <div class="ticket-card__titulo">${escapeHtml(t.titulo)}</div>
          <div class="ticket-card__meta">
            Creado por ${escapeHtml(t.usuarioNombre)} (${escapeHtml(t.usuarioEmail)}) · ${formatFecha(t.fechaCreacion)} · Nivel ${t.nivel} · Asignado a: ${asignado}
          </div>
        </div>
        ${t.categoriaNombre ? `<span class="badge badge--categoria">${escapeHtml(t.categoriaNombre)}</span>` : ''}
        <span class="badge badge--estado ${estadoClase}">${ESTADOS[t.estado] || t.estado}</span>
        <span class="badge badge--prioridad ${prioridadClase}">${PRIORIDADES[t.prioridad] || t.prioridad}</span>
        <span class="badge ${slaClase}" title="Vence: ${formatFecha(t.slaVencimiento)}">${SLA_LABELS[t.slaEstado] || t.slaEstado}</span>
        <svg class="ticket-card__toggle" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="ticket-card__body">
        <p class="ticket-card__descripcion">${escapeHtml(t.descripcion)}</p>

        ${ticketControlesHtml(t)}

        <div class="adjuntos-section">
          <strong class="adjuntos-section__title">Adjuntos</strong>
          <ul class="adjuntos-list" data-role="adjuntos"><li class="panel-status">Cargando…</li></ul>
          ${
            resuelto
              ? ''
              : `<form class="adjunto-form" data-action="subir-adjunto">
                   <input type="file" accept="${ADJUNTOS_ACEPTADOS}" required />
                   <button type="submit" class="btn btn-secondary btn--sm">Subir</button>
                 </form>`
          }
        </div>

        <div class="comment-thread" data-role="comments">
          <p class="panel-status">Cargando comentarios…</p>
        </div>
        ${
          resuelto
            ? ''
            : `<form class="comment-form" data-action="comentar">
                 <textarea class="field__input" placeholder="Escribir una respuesta…" required maxlength="4000"></textarea>
                 <button type="submit" class="btn btn-primary btn--sm" style="align-self:flex-end;">Comentar</button>
               </form>`
        }

        <div class="adjuntos-section">
          <strong class="adjuntos-section__title">Historial</strong>
          <div class="comment-thread" data-role="eventos">
            <p class="panel-status">Cargando historial…</p>
          </div>
        </div>
      </div>
    </article>
  `;
}

async function refrescarBadgesNiveles() {
  const res = await apiFetch('/api/tickets/resumen-nuevos');
  if (!res.ok) return;

  let total = 0;
  [1, 2, 3].forEach((nivel) => {
    const badge = qs(`#badge-nivel-${nivel}`);
    const cantidad = res.data[nivel] || 0;
    total += cantidad;
    badge.textContent = String(cantidad);
    badge.hidden = cantidad === 0;
  });

  // La campana del header suma los 3 niveles -- mismo dato, otra vista.
  const notifBadge = qs('#panel-notif-badge');
  notifBadge.textContent = String(total);
  notifBadge.hidden = total === 0;
}

/** Puebla el select de categoría del filtro de Tickets -- incluye inactivas (`?todas=1`) para poder filtrar tickets viejos igual. */
async function cargarCategoriasFiltro() {
  const res = await apiFetch('/api/categorias?todas=1');
  if (!res.ok) return;

  const select = qs('#filter-categoria');
  const actual = select.value;
  select.innerHTML =
    '<option value="">Todas</option>' +
    res.data.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}${c.activo ? '' : ' (inactiva)'}</option>`).join('');
  select.value = actual;
}

async function cargarTickets() {
  const estado = qs('#filter-estado').value;
  const prioridad = qs('#filter-prioridad').value;
  const categoria = qs('#filter-categoria').value;
  const soloAsignados = qs('#filter-asignados').checked;

  const params = new URLSearchParams({ page: String(ticketsPage), pageSize: String(PAGE_SIZE) });
  if (nivelActual) params.set('nivel', String(nivelActual));
  if (estado) params.set('estado', estado);
  if (prioridad) params.set('prioridad', prioridad);
  if (categoria) params.set('categoriaId', categoria);
  if (soloAsignados) params.set('soloMios', '1');
  if (sinAsignarActual) params.set('sinAsignar', '1');
  if (qFilterActual) params.set('q', qFilterActual);

  const statusEl = qs('#tickets-status');
  const listEl = qs('#tickets-list');
  statusEl.textContent = 'Cargando tickets…';
  statusEl.style.display = 'block';
  listEl.innerHTML = '';

  const res = await apiFetch(`/api/tickets?${params.toString()}`);
  if (!res.ok) {
    mostrarAlerta('tickets-alert', res.message || 'No se pudieron cargar los tickets.');
    statusEl.textContent = 'No se pudieron cargar los tickets.';
    return;
  }

  ticketsTotalPages = res.pagination?.totalPages || 1;
  qs('#tickets-page-info').textContent = `Página ${ticketsPage} de ${ticketsTotalPages}`;
  qs('#tickets-prev').disabled = ticketsPage <= 1;
  qs('#tickets-next').disabled = ticketsPage >= ticketsTotalPages;

  if (!res.data.length) {
    statusEl.textContent = 'No hay tickets que coincidan con estos filtros.';
  } else {
    statusEl.style.display = 'none';
    listEl.innerHTML = res.data.map(ticketCardHtml).join('');
  }

  refrescarBadgesNiveles();
}

async function cargarComentarios(ticketId, container) {
  const res = await apiFetch(`/api/tickets/${ticketId}/comentarios`);
  if (!res.ok) {
    container.innerHTML = '<p class="panel-status">No se pudieron cargar los comentarios.</p>';
    return;
  }
  if (!res.data.length) {
    container.innerHTML = '<p class="panel-status">Todavía no hay comentarios.</p>';
    return;
  }
  container.innerHTML = res.data
    .map(
      (c) => `
      <div class="comment-item">
        <div class="comment-item__meta"><span>${escapeHtml(c.usuarioNombre)}</span><span>${formatFecha(c.fechaCreacion)}</span></div>
        <div class="comment-item__texto">${escapeHtml(c.comentario)}</div>
      </div>
    `
    )
    .join('');
}

async function cargarAdjuntos(ticketId, container) {
  const res = await apiFetch(`/api/tickets/${ticketId}/adjuntos`);
  if (!res.ok) {
    container.innerHTML = '<li class="panel-status">No se pudieron cargar los adjuntos.</li>';
    return;
  }
  if (!res.data.length) {
    container.innerHTML = '<li class="panel-status">Todavía no hay adjuntos.</li>';
    return;
  }
  container.innerHTML = res.data
    .map(
      (a) => `
      <li class="adjunto-item">
        <a href="${a.urlDescarga}" target="_blank" rel="noopener">${escapeHtml(a.nombreOriginal)}</a>
        <span class="adjunto-item__meta">${escapeHtml(a.autorNombre)} · ${formatFecha(a.fechaCreacion)}</span>
      </li>
    `
    )
    .join('');
}

/** Texto de detalle de un evento -- ESCALADO arma su propio texto con nivel/motivo; ESTADO/PRIORIDAD traducen el código crudo que manda el backend con los mapas que ya existen acá. */
function detalleEventoTexto(e) {
  if (e.tipo === 'ESCALADO') {
    const motivo = e.motivo ? ` — Motivo: ${escapeHtml(e.motivo)}` : '';
    return `Nivel ${e.nivelAnterior} → Nivel ${e.nivelNuevo}${motivo}`;
  }
  if (e.tipo === 'ESTADO') {
    return `Nuevo estado: ${ESTADOS[e.detalle] || e.detalle}`;
  }
  if (e.tipo === 'PRIORIDAD') {
    return `Nueva prioridad: ${PRIORIDADES[e.detalle] || e.detalle}`;
  }
  return escapeHtml(e.detalle || '');
}

async function cargarEventos(ticketId, container) {
  const res = await apiFetch(`/api/tickets/${ticketId}/eventos`);
  if (!res.ok) {
    container.innerHTML = '<p class="panel-status">No se pudo cargar el historial.</p>';
    return;
  }
  if (!res.data.length) {
    container.innerHTML = '<p class="panel-status">Sin eventos todavía.</p>';
    return;
  }
  container.innerHTML = res.data
    .map(
      (e) => `
      <div class="comment-item">
        <div class="comment-item__meta"><span>${EVENTO_LABELS[e.tipo] || e.tipo} · ${escapeHtml(e.autorNombre)}</span><span>${formatFecha(e.fecha)}</span></div>
        <div class="comment-item__texto">${detalleEventoTexto(e)}</div>
      </div>
    `
    )
    .join('');
}

/**
 * Navegación del sidebar: un listener delegado que lee `data-section` (qué
 * mostrar) y, para los links de Tickets, `data-nivel`/`data-solo-mios`/
 * `data-sin-asignar` (qué filtro aplicar) -- reemplaza los tabs de nivel
 * de antes, que ahora viven acá como parte del grupo "Soporte".
 */
/** El link "Todos" es el único de Tickets sin filtro extra -- sirve de "vista por defecto" para navegación que no viene de un click de sidebar (tiles del dashboard, buscador, campana). */
function linkTodos() {
  return qs('.panel-sidebar__link[data-section="tickets"]:not([data-nivel]):not([data-solo-mios]):not([data-sin-asignar])');
}

function initSidebarNav() {
  qs('#panel-sidebar').addEventListener('click', (event) => {
    const link = event.target.closest('.panel-sidebar__link');
    if (!link) return;
    event.preventDefault();

    const section = link.dataset.section;
    showSection(section);
    setActiveSidebarLink(link);

    if (section === 'tickets') {
      nivelActual = link.dataset.nivel ? Number(link.dataset.nivel) : null;
      sinAsignarActual = link.dataset.sinAsignar === '1';
      qFilterActual = '';
      qs('#panel-search-input').value = '';
      qs('#filter-asignados').checked = link.dataset.soloMios === '1';
      ticketsPage = 1;
      cargarTickets();
    } else if (section === 'inicio') {
      cargarDashboard();
    } else if (section === 'estadisticas') {
      cargarEstadisticas();
    }
  });
}

/**
 * Ícono + color por tile -- mismos colores que ya usan los badges de
 * estado/prioridad/SLA en el resto del panel (panels.css) y los donuts de
 * Estadísticas, para que un tile y un badge se lean como la misma
 * categoría. Íconos en el mismo estilo lineal (Feather-like) que la
 * campana/chevron del header, sin librería.
 */
const DASHBOARD_STAT_META = {
  abiertos: {
    color: '#0284c7',
    bg: '#e0f2fe',
    icon: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  },
  enProgreso: {
    color: '#b45309',
    bg: '#fef3c7',
    icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  },
  escalados: {
    color: '#c2410c',
    bg: '#ffedd5',
    icon: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  },
  criticos: {
    color: '#b91c1c',
    bg: '#fee2e2',
    icon: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  },
  resueltosHoy: {
    color: '#065f46',
    bg: '#d1fae5',
    icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  },
  misTickets: {
    color: '#7c3aed',
    bg: '#ede9fe',
    icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  },
  slaEnRiesgo: {
    color: '#b45309',
    bg: '#fef3c7',
    icon: '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  },
};

/**
 * Tiles de la sección Inicio. Solo "En progreso" y "Mis tickets" son
 * clickeables: son los únicos que mapean 1:1 a un filtro que ya existe en
 * la sección Tickets (estado=EN_PROCESO / soloMios). Los demás
 * (abiertos/escalados/críticos/resueltos hoy) combinan condiciones que
 * hoy no tienen un filtro equivalente en la UI, así que quedan solo
 * informativos por ahora.
 */
function dashboardStatHtml(key, value, label, clickable) {
  const meta = DASHBOARD_STAT_META[key];
  return `
    <div class="glass-card dashboard-stat${clickable ? ' dashboard-stat--clickable' : ''}" data-stat="${key}" style="--stat-color:${meta.color}; --stat-bg:${meta.bg};">
      <div class="dashboard-stat__icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${meta.icon}</svg>
      </div>
      <div class="dashboard-stat__body">
        <div class="dashboard-stat__value">${value}</div>
        <div class="dashboard-stat__label">${label}</div>
      </div>
    </div>
  `;
}

/** Etiquetas chicas que explican por qué un ticket aparece en "Atención requerida" (SLA vencido, Sin asignar, etc). */
function motivoChipHtml(motivo) {
  return `<span class="motivo-chip">${escapeHtml(motivo)}</span>`;
}

function atencionRequeridaHtml(t) {
  const estadoClase = `badge--estado-${t.estado.toLowerCase()}`;
  const prioridadClase = `badge--prioridad-${t.prioridad.toLowerCase()}`;
  const slaClase = `badge--sla-${t.slaEstado.toLowerCase()}`;
  const asignado = t.asignadoANombre
    ? `${avatarHtml(t.asignadoAFotoUrl, t.asignadoANombre, 'sm')} ${escapeHtml(t.asignadoANombre)}`
    : 'Sin asignar';

  return `
    <div class="glass-card usuario-row" data-id="${t.id}">
      <div class="usuario-row__info">
        <div class="usuario-row__nombre">#${t.id} · ${escapeHtml(t.titulo)}</div>
        <div class="usuario-row__email">${escapeHtml(t.usuarioNombre)} · ${formatFecha(t.fechaCreacion)} · Asignado a: ${asignado}</div>
        <div class="dashboard-motivos">
          ${t.motivos.map(motivoChipHtml).join('')}
          <span class="badge badge--prioridad ${prioridadClase}">${PRIORIDADES[t.prioridad] || t.prioridad}</span>
          <span class="badge badge--estado ${estadoClase}">${ESTADOS[t.estado] || t.estado}</span>
          <span class="badge ${slaClase}" title="Vence: ${formatFecha(t.slaVencimiento)}">${SLA_LABELS[t.slaEstado] || t.slaEstado}</span>
        </div>
      </div>
      <div class="usuario-row__actions">
        <button type="button" class="btn btn-secondary btn--sm" data-action="ver-ticket" data-id="${t.id}">Ver ticket</button>
        ${t.asignadoAId === null ? `<button type="button" class="btn btn-secondary btn--sm" data-action="asignar-directo" data-id="${t.id}">Asignar</button>` : ''}
      </div>
    </div>
  `;
}

function actividadRecienteHtml(e) {
  const detalle = detalleEventoTexto(e);
  return `
    <div class="comment-item">
      <div class="comment-item__meta"><span>${EVENTO_LABELS[e.tipo] || e.tipo} · ${escapeHtml(e.autorNombre)}</span><span>${formatFecha(e.fecha)}</span></div>
      <div class="comment-item__texto">
        <a href="#" data-action="ver-ticket" data-id="${e.ticketId}">#${e.ticketId} · ${escapeHtml(e.ticketTitulo)}</a>${detalle ? ` — ${detalle}` : ''}
      </div>
    </div>
  `;
}

/**
 * Donut SVG a mano (sin librería): un `<circle>` con `fill="none"` por
 * segmento, cada uno dibujado como un tramo de `stroke-dasharray` sobre la
 * circunferencia completa, con `stroke-dashoffset` acumulado para que
 * empiecen donde termina el anterior. Rotado -90° para que el primer
 * segmento arranque arriba (12 en punto) en vez de a la derecha (3 en
 * punto, default de SVG). Con total 0 dibuja un anillo gris en vez de
 * dividir por cero.
 */
function donutChartSvg(titulo, segmentos) {
  const total = segmentos.reduce((suma, s) => suma + s.valor, 0);
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const r = 48;
  const strokeWidth = 20;
  const circunferencia = 2 * Math.PI * r;

  let arcos;
  if (total === 0) {
    arcos = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="${strokeWidth}" />`;
  } else {
    let acumulado = 0;
    arcos = segmentos
      .filter((s) => s.valor > 0)
      .map((s) => {
        const largo = (s.valor / total) * circunferencia;
        const circulo = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${strokeWidth}" stroke-dasharray="${largo} ${circunferencia - largo}" stroke-dashoffset="${-acumulado}" />`;
        acumulado += largo;
        return circulo;
      })
      .join('');
  }

  const leyenda = segmentos
    .map(
      (s) => `
      <li>
        <span class="chart-legend__dot" style="background-color:${s.color}"></span>${escapeHtml(s.label)}
        <span class="chart-legend__valor">${s.valor}</span>
      </li>`
    )
    .join('');

  return `
    <div class="glass-card chart-card">
      <h3 class="chart-card__title">${escapeHtml(titulo)}</h3>
      <svg viewBox="0 0 ${size} ${size}" width="150" height="150" role="img" aria-label="${escapeHtml(titulo)}">
        <g transform="rotate(-90 ${cx} ${cy})">${arcos}</g>
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" class="chart-donut__total">${total === 0 ? 'Sin datos' : total}</text>
      </svg>
      <ul class="chart-legend">${leyenda}</ul>
    </div>
  `;
}

/** Barras agrupadas (creados/resueltos) por día, SVG a mano -- alto proporcional al máximo de la serie, con piso de 2px para que un valor en 0 siga siendo visible como línea. */
function barChartSvg(titulo, dias) {
  const width = 320;
  const height = 160;
  const padding = 24;
  const baseline = height - padding;
  const maxBarHeight = baseline - 10;
  const max = Math.max(1, ...dias.map((d) => Math.max(d.creados, d.resueltos)));
  const groupWidth = (width - padding * 2) / dias.length;
  const barWidth = Math.min(14, groupWidth / 3);

  const barras = dias
    .map((d, i) => {
      const groupX = padding + i * groupWidth + groupWidth / 2;
      const alturaCreados = d.creados === 0 ? 2 : (d.creados / max) * maxBarHeight;
      const alturaResueltos = d.resueltos === 0 ? 2 : (d.resueltos / max) * maxBarHeight;
      const fechaLabel = new Date(`${d.fecha}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      return `
        <rect x="${groupX - barWidth - 2}" y="${baseline - alturaCreados}" width="${barWidth}" height="${alturaCreados}" fill="#0284c7" rx="2" />
        <rect x="${groupX + 2}" y="${baseline - alturaResueltos}" width="${barWidth}" height="${alturaResueltos}" fill="#065f46" rx="2" />
        <text x="${groupX}" y="${height - 6}" text-anchor="middle" class="chart-bar__label">${fechaLabel}</text>
      `;
    })
    .join('');

  return `
    <div class="glass-card chart-card">
      <h3 class="chart-card__title">${escapeHtml(titulo)}</h3>
      <ul class="chart-legend chart-legend--inline">
        <li><span class="chart-legend__dot" style="background-color:#0284c7"></span>Creados</li>
        <li><span class="chart-legend__dot" style="background-color:#065f46"></span>Resueltos</li>
      </ul>
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="160" role="img" aria-label="${escapeHtml(titulo)}">
        <line x1="${padding}" y1="${baseline}" x2="${width - padding}" y2="${baseline}" stroke="#e2e8f0" stroke-width="1" />
        ${barras}
      </svg>
    </div>
  `;
}

async function cargarDashboard() {
  const statsEl = qs('#dashboard-stats');
  const res = await apiFetch('/api/tickets/dashboard');
  if (!res.ok) {
    mostrarAlerta('dashboard-alert', res.message || 'No se pudieron cargar los indicadores.');
    return;
  }

  const d = res.data;
  statsEl.innerHTML = [
    dashboardStatHtml('abiertos', d.abiertos, 'Tickets abiertos', false),
    dashboardStatHtml('enProgreso', d.enProgreso, 'En progreso', true),
    dashboardStatHtml('escalados', d.escalados, 'Escalados', false),
    dashboardStatHtml('criticos', d.criticos, 'Críticos', false),
    dashboardStatHtml('resueltosHoy', d.resueltosHoy, 'Resueltos hoy', false),
    dashboardStatHtml('misTickets', d.misTickets, 'Mis tickets', true),
    dashboardStatHtml('slaEnRiesgo', d.slaEnRiesgo, 'SLA en riesgo', false),
  ].join('');

  qs('[data-stat="enProgreso"]').addEventListener('click', () => {
    irATickets({ link: linkTodos(), estado: 'EN_PROCESO' });
  });

  qs('[data-stat="misTickets"]').addEventListener('click', () => {
    irATickets({ link: qs('.panel-sidebar__link[data-solo-mios="1"]'), soloMios: true });
  });

  const atencionEl = qs('#atencion-requerida');
  atencionEl.innerHTML = d.atencionRequerida.length
    ? d.atencionRequerida.map(atencionRequeridaHtml).join('')
    : '<p class="panel-status">Todo al día — no hay tickets que requieran atención inmediata.</p>';

  const actividadEl = qs('#actividad-reciente');
  actividadEl.innerHTML = d.actividadReciente.length
    ? d.actividadReciente.map(actividadRecienteHtml).join('')
    : '<p class="panel-status">Sin actividad reciente.</p>';
}

/** Sección Estadísticas -- mismo endpoint que el dashboard (ya trae porEstado/porPrioridad/tendencia), pero se pinta en su propia sección del sidebar, no mezclado con Inicio. */
async function cargarEstadisticas() {
  const res = await apiFetch('/api/tickets/dashboard');
  if (!res.ok) {
    mostrarAlerta('estadisticas-alert', res.message || 'No se pudieron cargar las estadísticas.');
    return;
  }

  const d = res.data;
  qs('#dashboard-charts').innerHTML = [
    donutChartSvg('Tickets por estado', [
      { label: 'Nuevo', valor: d.porEstado.NEW, color: '#4338ca' },
      { label: 'En proceso', valor: d.porEstado.EN_PROCESO, color: '#b45309' },
      { label: 'Resuelto', valor: d.porEstado.RESUELTO, color: '#065f46' },
    ]),
    donutChartSvg('Tickets por prioridad', [
      { label: 'Baja', valor: d.porPrioridad.BAJA, color: '#64748b' },
      { label: 'Media', valor: d.porPrioridad.MEDIA, color: '#1d4ed8' },
      { label: 'Alta', valor: d.porPrioridad.ALTA, color: '#b45309' },
      { label: 'Urgente', valor: d.porPrioridad.URGENTE, color: '#b91c1c' },
    ]),
    barChartSvg('Creados vs. resueltos (últimos 7 días)', d.tendencia),
  ].join('');
}

/** Delegación de eventos de "Atención requerida" y "Actividad reciente" -- ambos bloques se re-renderizan enteros en cada cargarDashboard(), así que los listeners van en el contenedor fijo. */
function initDashboardSection() {
  qs('#atencion-requerida').addEventListener('click', async (event) => {
    const verBtn = event.target.closest('[data-action="ver-ticket"]');
    if (verBtn) {
      event.preventDefault();
      await verTicket(verBtn.dataset.id);
      return;
    }

    const asignarBtn = event.target.closest('[data-action="asignar-directo"]');
    if (asignarBtn) {
      const res = await apiFetch(`/api/tickets/${asignarBtn.dataset.id}/asignar`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('dashboard-alert', res.message || 'No se pudo asignar el ticket.');
      cargarDashboard();
    }
  });

  qs('#actividad-reciente').addEventListener('click', async (event) => {
    const link = event.target.closest('[data-action="ver-ticket"]');
    if (!link) return;
    event.preventDefault();
    await verTicket(link.dataset.id);
  });
}

/** Buscador del header: Enter filtra la sección Tickets por título/#ID. */
function initSearch() {
  qs('#panel-search-input').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    irATickets({ link: linkTodos(), q: event.target.value.trim() });
  });
}

/** Campana del header: mismo dato que los badges de nivel, sumados; al clickear, filtra por Nuevos. */
function initNotifBell() {
  qs('#panel-notif-btn').addEventListener('click', () => {
    irATickets({ link: linkTodos(), estado: 'NEW' });
  });
}

/**
 * Navegación programática a Tickets (tiles del dashboard, buscador,
 * campana -- todo lo que NO es un click directo en el sidebar). A
 * diferencia de `initSidebarNav`, siempre resetea los 5 controles de
 * filtro a un estado conocido antes de aplicar el que corresponda, para
 * que no queden mezclados con lo que haya dejado una vista anterior.
 */
async function irATickets({ link, estado = '', prioridad = '', soloMios = false, q = '' }) {
  showSection('tickets');
  setActiveSidebarLink(link);
  nivelActual = null;
  sinAsignarActual = false;
  qFilterActual = q;
  qs('#filter-estado').value = estado;
  qs('#filter-prioridad').value = prioridad;
  qs('#filter-categoria').value = '';
  qs('#filter-asignados').checked = soloMios;
  qs('#panel-search-input').value = q;
  ticketsPage = 1;
  await cargarTickets();
}

/** "Ver ticket" desde el dashboard: navega a Tickets filtrado por #id y deja la tarjeta ya expandida -- un clic para pasar de "detectar" a "resolver". */
async function verTicket(ticketId) {
  await irATickets({ link: linkTodos(), q: String(ticketId) });
  const card = qs(`.ticket-card[data-id="${ticketId}"]`);
  if (card && !card.classList.contains('is-open')) {
    qs('[data-action="toggle"]', card).click();
  }
}

function initTicketsSection() {
  qs('#filter-estado').addEventListener('change', () => {
    ticketsPage = 1;
    cargarTickets();
  });
  qs('#filter-prioridad').addEventListener('change', () => {
    ticketsPage = 1;
    cargarTickets();
  });
  qs('#filter-categoria').addEventListener('change', () => {
    ticketsPage = 1;
    cargarTickets();
  });
  qs('#filter-asignados').addEventListener('change', () => {
    ticketsPage = 1;
    cargarTickets();
  });
  qs('#tickets-prev').addEventListener('click', () => {
    if (ticketsPage > 1) {
      ticketsPage -= 1;
      cargarTickets();
    }
  });
  qs('#tickets-next').addEventListener('click', () => {
    if (ticketsPage < ticketsTotalPages) {
      ticketsPage += 1;
      cargarTickets();
    }
  });

  // Delegación de eventos: la lista se re-renderiza entera en cada carga,
  // así que los listeners van en el contenedor fijo, no en cada tarjeta.
  const listEl = qs('#tickets-list');

  listEl.addEventListener('click', async (event) => {
    const card = event.target.closest('.ticket-card');
    if (!card) return;
    const ticketId = card.dataset.id;

    if (event.target.closest('[data-action="toggle"]')) {
      const wasOpen = card.classList.contains('is-open');
      card.classList.toggle('is-open', !wasOpen);
      if (!wasOpen && !card.dataset.detalleCargado) {
        card.dataset.detalleCargado = '1';
        await Promise.all([
          cargarComentarios(ticketId, qs('[data-role="comments"]', card)),
          cargarAdjuntos(ticketId, qs('[data-role="adjuntos"]', card)),
          cargarEventos(ticketId, qs('[data-role="eventos"]', card)),
        ]);
      }
      return;
    }

    if (event.target.closest('[data-action="adjudicar"]')) {
      const res = await apiFetch(`/api/tickets/${ticketId}/asignar`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo adjudicar el ticket.');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="liberar"]')) {
      const res = await apiFetch(`/api/tickets/${ticketId}/liberar`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo liberar el ticket.');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="escalar-toggle"]')) {
      const form = qs('[data-role="escalar-form"]', card);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="escalar-confirmar"]')) {
      const form = qs('[data-role="escalar-form"]', card);
      const motivo = qs('[data-role="escalar-motivo"]', form).value.trim();
      if (!motivo) return;

      const res = await apiFetch(`/api/tickets/${ticketId}/escalar`, { method: 'PATCH', body: { motivo } });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo escalar el ticket.');
      mostrarAlerta('tickets-alert', 'Ticket escalado.', 'success');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="resolver-toggle"]')) {
      const form = qs('[data-role="resolver-form"]', card);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="resolver-confirmar"]')) {
      const form = qs('[data-role="resolver-form"]', card);
      const textarea = qs('textarea', form);
      const solucion = textarea.value.trim();
      if (!solucion) return;

      const res = await apiFetch(`/api/tickets/${ticketId}/resolver`, { method: 'PATCH', body: { solucion } });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo resolver el ticket.');
      mostrarAlerta('tickets-alert', 'Ticket resuelto.', 'success');
      cargarTickets();
    }
  });

  listEl.addEventListener('change', async (event) => {
    const card = event.target.closest('.ticket-card');
    if (!card) return;
    const ticketId = card.dataset.id;

    if (event.target.matches('[data-action="estado"]')) {
      const nuevoEstado = event.target.value;
      const res = await apiFetch(`/api/tickets/${ticketId}/estado`, { method: 'PATCH', body: { estado: nuevoEstado } });
      if (!res.ok) {
        mostrarAlerta('tickets-alert', res.message || 'No se pudo actualizar el estado.');
      } else {
        const badge = qs('.badge--estado', card);
        badge.className = `badge badge--estado badge--estado-${nuevoEstado.toLowerCase()}`;
        badge.textContent = ESTADOS[nuevoEstado] || nuevoEstado;
        mostrarAlerta('tickets-alert', 'Estado actualizado.', 'success');
        refrescarBadgesNiveles();
      }
    }

    if (event.target.matches('[data-action="prioridad"]')) {
      const nuevaPrioridad = event.target.value;
      const res = await apiFetch(`/api/tickets/${ticketId}/prioridad`, { method: 'PATCH', body: { prioridad: nuevaPrioridad } });
      if (!res.ok) {
        mostrarAlerta('tickets-alert', res.message || 'No se pudo actualizar la prioridad.');
      } else {
        const badge = qs('.badge--prioridad', card);
        badge.className = `badge badge--prioridad badge--prioridad-${nuevaPrioridad.toLowerCase()}`;
        badge.textContent = PRIORIDADES[nuevaPrioridad] || nuevaPrioridad;
        mostrarAlerta('tickets-alert', 'Prioridad actualizada.', 'success');
      }
    }
  });

  listEl.addEventListener('submit', async (event) => {
    const card = event.target.closest('.ticket-card');
    if (!card) return;
    const ticketId = card.dataset.id;

    if (event.target.matches('[data-action="comentar"]')) {
      event.preventDefault();
      const textarea = qs('textarea', event.target);
      const comentario = textarea.value.trim();
      if (!comentario) return;

      const res = await apiFetch(`/api/tickets/${ticketId}/comentarios`, { method: 'POST', body: { comentario } });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo enviar el comentario.');

      textarea.value = '';
      await cargarComentarios(ticketId, qs('[data-role="comments"]', card));
      return;
    }

    if (event.target.matches('[data-action="subir-adjunto"]')) {
      event.preventDefault();
      const input = qs('input[type="file"]', event.target);
      const archivo = input.files[0];
      if (!archivo) return;

      const formData = new FormData();
      formData.append('archivo', archivo);

      const res = await apiUpload(`/api/tickets/${ticketId}/adjuntos`, formData);
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo subir el adjunto.');

      input.value = '';
      await cargarAdjuntos(ticketId, qs('[data-role="adjuntos"]', card));
    }
  });

  cargarTickets();
}

/* ====================================
   USUARIOS (clientes)
==================================== */

function usuarioRowHtml(u) {
  return `
    <div class="glass-card usuario-row ${u.activo ? '' : 'is-inactivo'}" data-id="${u.id}">
      <div class="usuario-row__info">
        <div class="usuario-row__nombre">${escapeHtml(u.nombre)}</div>
        <div class="usuario-row__email">${escapeHtml(u.email)} · ${u.activo ? 'Activo' : 'Inactivo'}</div>
      </div>
      <div class="usuario-row__actions">
        <button type="button" class="btn btn-secondary btn--sm" data-action="reset-random">Generar contraseña aleatoria</button>
        <button type="button" class="btn btn-secondary btn--sm" data-action="reset-manual-toggle">Asignar contraseña manual</button>
        ${
          u.activo
            ? '<button type="button" class="btn btn-secondary btn--sm" data-action="desactivar">Dar de baja</button>'
            : '<button type="button" class="btn btn-secondary btn--sm" data-action="activar">Dar de alta</button>'
        }
      </div>
      <div class="reset-manual-form" data-role="reset-manual-form" hidden>
        <input type="password" class="field__input" placeholder="Nueva contraseña (mín. 6 caracteres)" minlength="6" />
        <button type="button" class="btn btn-primary btn--sm" data-action="reset-manual-confirmar">Confirmar</button>
      </div>
    </div>
  `;
}

/**
 * @param {{apiPath:string, formId:string, listId:string, statusId:string,
 *   alertId:string, entidadLabel:string, emptyLabel:string}} config
 */
function initGestionSection({ apiPath, formId, listId, statusId, alertId, entidadLabel, emptyLabel }) {
  async function cargar() {
    const statusEl = qs(`#${statusId}`);
    const listEl = qs(`#${listId}`);
    statusEl.textContent = `Cargando ${entidadLabel}s…`;
    statusEl.style.display = 'block';

    const res = await apiFetch(`${apiPath}?page=1`);
    if (!res.ok) {
      statusEl.textContent = `No se pudieron cargar los ${entidadLabel}s.`;
      return;
    }
    if (!res.data.length) {
      statusEl.textContent = emptyLabel;
      listEl.innerHTML = '';
      return;
    }
    statusEl.style.display = 'none';
    listEl.innerHTML = res.data.map(usuarioRowHtml).join('');
  }

  qs(`#${formId}`).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = {
      nombre: form.nombre.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
    };
    const res = await apiFetch(apiPath, { method: 'POST', body });
    if (!res.ok) {
      mostrarAlerta(alertId, (res.errors && res.errors.join(' ')) || res.message || `No se pudo crear el ${entidadLabel}.`);
      return;
    }
    mostrarAlerta(alertId, `Se creó "${body.nombre}".`, 'success');
    form.reset();
    cargar();
  });

  qs(`#${listId}`).addEventListener('click', async (event) => {
    const row = event.target.closest('.usuario-row');
    if (!row) return;
    const id = row.dataset.id;

    if (event.target.closest('[data-action="activar"]')) {
      const res = await apiFetch(`${apiPath}/${id}/estado`, { method: 'PATCH', body: { activo: true } });
      if (!res.ok) return mostrarAlerta(alertId, res.message || `No se pudo activar el ${entidadLabel}.`);
      cargar();
      return;
    }

    if (event.target.closest('[data-action="desactivar"]')) {
      const res = await apiFetch(`${apiPath}/${id}/estado`, { method: 'PATCH', body: { activo: false } });
      if (!res.ok) return mostrarAlerta(alertId, res.message || `No se pudo desactivar el ${entidadLabel}.`);
      cargar();
      return;
    }

    if (event.target.closest('[data-action="reset-random"]')) {
      const res = await apiFetch(`${apiPath}/${id}/reset-password`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta(alertId, res.message || 'No se pudo resetear la contraseña.');
      mostrarAlerta(alertId, `Contraseña temporal generada: ${res.data.passwordTemporal}`, 'success');
      return;
    }

    if (event.target.closest('[data-action="reset-manual-toggle"]')) {
      const form = qs('[data-role="reset-manual-form"]', row);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="reset-manual-confirmar"]')) {
      const form = qs('[data-role="reset-manual-form"]', row);
      const input = qs('input', form);
      const password = input.value;
      if (password.length < 6) {
        mostrarAlerta(alertId, 'La contraseña debe tener al menos 6 caracteres.');
        return;
      }

      const res = await apiFetch(`${apiPath}/${id}/reset-password`, { method: 'PATCH', body: { password } });
      if (!res.ok) return mostrarAlerta(alertId, res.message || 'No se pudo asignar la contraseña.');
      input.value = '';
      form.hidden = true;
      mostrarAlerta(alertId, 'Contraseña asignada correctamente.', 'success');
    }
  });

  cargar();
}

/* ====================================
   AGENTES DE SOPORTE (usuarios_administradores)
   Ya no divergen tan poco de "usuarios" como para reusar
   `initGestionSection()` -- tienen apellido/título/nivel/foto, alta con
   más campos y una acción nueva (subir/cambiar foto), así que van en
   funciones propias en vez de forzar la abstracción genérica.
==================================== */

function agenteRowHtml(a) {
  const nivelBadge = a.nivel ? `<span class="badge badge--nivel">Nivel ${a.nivel}</span>` : '';
  const apellido = a.apellido ? ` ${escapeHtml(a.apellido)}` : '';

  return `
    <div class="glass-card usuario-row ${a.activo ? '' : 'is-inactivo'}" data-id="${a.id}">
      ${avatarHtml(a.fotoUrl, a.nombre, 'lg')}
      <div class="usuario-row__info">
        <div class="usuario-row__nombre">${escapeHtml(a.nombre)}${apellido} ${nivelBadge}</div>
        ${a.titulo ? `<div class="usuario-row__email">${escapeHtml(a.titulo)}</div>` : ''}
        <div class="usuario-row__email">${escapeHtml(a.email)} · ${a.activo ? 'Activo' : 'Inactivo'}</div>
      </div>
      <div class="usuario-row__actions">
        <button type="button" class="btn btn-secondary btn--sm" data-action="foto-toggle">Cambiar foto</button>
        <button type="button" class="btn btn-secondary btn--sm" data-action="reset-random">Generar contraseña aleatoria</button>
        <button type="button" class="btn btn-secondary btn--sm" data-action="reset-manual-toggle">Asignar contraseña manual</button>
        ${
          a.activo
            ? '<button type="button" class="btn btn-secondary btn--sm" data-action="desactivar">Dar de baja</button>'
            : '<button type="button" class="btn btn-secondary btn--sm" data-action="activar">Dar de alta</button>'
        }
      </div>
      <div class="reset-manual-form" data-role="foto-form" hidden>
        <input type="file" accept="image/jpeg,image/png,image/webp" />
        <button type="button" class="btn btn-primary btn--sm" data-action="foto-confirmar">Subir</button>
      </div>
      <div class="reset-manual-form" data-role="reset-manual-form" hidden>
        <input type="password" class="field__input" placeholder="Nueva contraseña (mín. 6 caracteres)" minlength="6" />
        <button type="button" class="btn btn-primary btn--sm" data-action="reset-manual-confirmar">Confirmar</button>
      </div>
    </div>
  `;
}

function initAgentesSection() {
  const apiPath = '/api/administradores';

  async function cargar() {
    const statusEl = qs('#administradores-status');
    const listEl = qs('#administradores-list');
    statusEl.textContent = 'Cargando agentes…';
    statusEl.style.display = 'block';

    const res = await apiFetch(`${apiPath}?page=1`);
    if (!res.ok) {
      statusEl.textContent = 'No se pudieron cargar los agentes.';
      return;
    }
    if (!res.data.length) {
      statusEl.textContent = 'Todavía no hay agentes.';
      listEl.innerHTML = '';
      return;
    }
    statusEl.style.display = 'none';
    listEl.innerHTML = res.data.map(agenteRowHtml).join('');
  }

  qs('#crear-administrador-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = {
      nombre: form.nombre.value.trim(),
      apellido: form.apellido.value.trim(),
      titulo: form.titulo.value.trim(),
      nivel: form.nivel.value,
      email: form.email.value.trim(),
      password: form.password.value,
    };
    const res = await apiFetch(apiPath, { method: 'POST', body });
    if (!res.ok) {
      mostrarAlerta('administradores-alert', (res.errors && res.errors.join(' ')) || res.message || 'No se pudo crear el agente.');
      return;
    }
    mostrarAlerta('administradores-alert', `Se creó "${body.nombre} ${body.apellido}".`, 'success');
    form.reset();
    cargar();
  });

  qs('#administradores-list').addEventListener('click', async (event) => {
    const row = event.target.closest('.usuario-row');
    if (!row) return;
    const id = row.dataset.id;

    if (event.target.closest('[data-action="activar"]')) {
      const res = await apiFetch(`${apiPath}/${id}/estado`, { method: 'PATCH', body: { activo: true } });
      if (!res.ok) return mostrarAlerta('administradores-alert', res.message || 'No se pudo activar el agente.');
      cargar();
      return;
    }

    if (event.target.closest('[data-action="desactivar"]')) {
      const res = await apiFetch(`${apiPath}/${id}/estado`, { method: 'PATCH', body: { activo: false } });
      if (!res.ok) return mostrarAlerta('administradores-alert', res.message || 'No se pudo desactivar el agente.');
      cargar();
      return;
    }

    if (event.target.closest('[data-action="reset-random"]')) {
      const res = await apiFetch(`${apiPath}/${id}/reset-password`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('administradores-alert', res.message || 'No se pudo resetear la contraseña.');
      mostrarAlerta('administradores-alert', `Contraseña temporal generada: ${res.data.passwordTemporal}`, 'success');
      return;
    }

    if (event.target.closest('[data-action="reset-manual-toggle"]')) {
      const form = qs('[data-role="reset-manual-form"]', row);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="reset-manual-confirmar"]')) {
      const form = qs('[data-role="reset-manual-form"]', row);
      const input = qs('input', form);
      const password = input.value;
      if (password.length < 6) {
        mostrarAlerta('administradores-alert', 'La contraseña debe tener al menos 6 caracteres.');
        return;
      }

      const res = await apiFetch(`${apiPath}/${id}/reset-password`, { method: 'PATCH', body: { password } });
      if (!res.ok) return mostrarAlerta('administradores-alert', res.message || 'No se pudo asignar la contraseña.');
      input.value = '';
      form.hidden = true;
      mostrarAlerta('administradores-alert', 'Contraseña asignada correctamente.', 'success');
      return;
    }

    if (event.target.closest('[data-action="foto-toggle"]')) {
      const form = qs('[data-role="foto-form"]', row);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="foto-confirmar"]')) {
      const form = qs('[data-role="foto-form"]', row);
      const input = qs('input[type="file"]', form);
      const archivo = input.files[0];
      if (!archivo) return;

      const formData = new FormData();
      formData.append('foto', archivo);

      const res = await apiUpload(`${apiPath}/${id}/foto`, formData);
      if (!res.ok) return mostrarAlerta('administradores-alert', res.message || 'No se pudo subir la foto.');
      input.value = '';
      form.hidden = true;
      mostrarAlerta('administradores-alert', 'Foto actualizada.', 'success');
      cargar();
    }
  });

  cargar();
}

/* ====================================
   CATEGORÍAS
   Reusa las clases visuales de .usuario-row (nombre + estado + acciones)
   -- una categoría es "más chica" que un usuario (sin email, sin
   contraseña), así que no vale la pena forzarla dentro de
   `initGestionSection` (pensada para entidades con email/password).
==================================== */

function categoriaRowHtml(c) {
  return `
    <div class="glass-card usuario-row ${c.activo ? '' : 'is-inactivo'}" data-id="${c.id}">
      <div class="usuario-row__info">
        <div class="usuario-row__nombre">${escapeHtml(c.nombre)}</div>
        <div class="usuario-row__email">${c.activo ? 'Activa' : 'Inactiva'}</div>
      </div>
      <div class="usuario-row__actions">
        ${
          c.activo
            ? '<button type="button" class="btn btn-secondary btn--sm" data-action="desactivar">Desactivar</button>'
            : '<button type="button" class="btn btn-secondary btn--sm" data-action="activar">Activar</button>'
        }
      </div>
    </div>
  `;
}

function initCategoriasSection() {
  async function cargar() {
    const statusEl = qs('#categorias-status');
    const listEl = qs('#categorias-list');
    statusEl.textContent = 'Cargando categorías…';
    statusEl.style.display = 'block';

    const res = await apiFetch('/api/categorias?todas=1');
    if (!res.ok) {
      statusEl.textContent = 'No se pudieron cargar las categorías.';
      return;
    }
    if (!res.data.length) {
      statusEl.textContent = 'Todavía no hay categorías.';
      listEl.innerHTML = '';
      return;
    }
    statusEl.style.display = 'none';
    listEl.innerHTML = res.data.map(categoriaRowHtml).join('');
  }

  qs('#crear-categoria-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const nombre = form.nombre.value.trim();

    const res = await apiFetch('/api/categorias', { method: 'POST', body: { nombre } });
    if (!res.ok) {
      mostrarAlerta('categorias-alert', (res.errors && res.errors.join(' ')) || res.message || 'No se pudo crear la categoría.');
      return;
    }
    mostrarAlerta('categorias-alert', `Se creó "${nombre}".`, 'success');
    form.reset();
    cargar();
    cargarCategoriasFiltro();
  });

  qs('#categorias-list').addEventListener('click', async (event) => {
    const row = event.target.closest('.usuario-row');
    if (!row) return;
    const id = row.dataset.id;

    if (event.target.closest('[data-action="activar"]')) {
      const res = await apiFetch(`/api/categorias/${id}/estado`, { method: 'PATCH', body: { activo: true } });
      if (!res.ok) return mostrarAlerta('categorias-alert', res.message || 'No se pudo activar la categoría.');
      cargar();
      cargarCategoriasFiltro();
      return;
    }

    if (event.target.closest('[data-action="desactivar"]')) {
      const res = await apiFetch(`/api/categorias/${id}/estado`, { method: 'PATCH', body: { activo: false } });
      if (!res.ok) return mostrarAlerta('categorias-alert', res.message || 'No se pudo desactivar la categoría.');
      cargar();
      cargarCategoriasFiltro();
      return;
    }
  });

  cargar();
}

/* ====================================
   INIT
==================================== */

function initHeader() {
  qs('#panel-user-name').textContent = usuarioActual.nombre;
  qs('#logout-btn').addEventListener('click', async () => {
    await logout();
    window.location.href = 'login.html';
  });
}

/**
 * El logo del header linkea al sitio público (`index.html`) -- a un admin
 * no se le cierra la sesión por inactividad (a diferencia del cliente, ver
 * `initInactivityLogout` en api-client.js), pero si sale del service desk
 * hacia el sitio público sí se le cierra: al volver más tarde tiene que
 * loguearse de nuevo, no queda una sesión de panel abierta de fondo.
 */
function initBrandLink() {
  const link = qs('.brand');
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    const destino = link.href;
    await logout();
    window.location.href = destino;
  });
}

usuarioActual = await requireAuth(['ADMIN']);
if (usuarioActual) {
  initPanelShell();
  initHeader();
  initBrandLink();
  initSidebarNav();
  initSearch();
  initNotifBell();
  initDashboardSection();
  showSection('inicio');
  cargarDashboard();
  cargarEstadisticas();
  cargarCategoriasFiltro();
  initTicketsSection();
  initCategoriasSection();
  initGestionSection({
    apiPath: '/api/usuarios',
    formId: 'crear-usuario-form',
    listId: 'usuarios-list',
    statusId: 'usuarios-status',
    alertId: 'usuarios-alert',
    entidadLabel: 'cliente',
    emptyLabel: 'Todavía no hay clientes.',
  });
  initAgentesSection();
}
