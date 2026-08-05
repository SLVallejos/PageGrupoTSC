import { debounce, prefersReducedMotion } from '../utils.js';

/**
 * Fondo animado de partículas conectadas para el Hero (canvas 2D), a partir
 * de la plantilla provista por el cliente + elementos tomados de una
 * referencia visual (dígitos binarios, variedad de íconos, remolino sutil
 * cerca del centro). El color sale de --color-accent (variables.css) en vez
 * de estar hardcodeado. Respeta prefers-reduced-motion (un solo frame
 * estático, sin loop) y se pausa fuera de vista o con la pestaña en
 * segundo plano.
 */

const PARTICLE_COUNT = 55;
const ICON_TYPES = ['camera', 'shield', 'monitor', 'phone', 'laptop'];
const ICON_COUNT_PER_TYPE = 2;
const CONNECT_DISTANCE = 140;
const PARTICLE_SPEED = 0.4;
const SPIRAL_STRENGTH = 55;
const SPIRAL_MAX = 0.5;

const BIT_COUNT = 26;
const BIT_SPEED = 0.15;
const BIT_FONT_SIZE = 13;

function readAccentRgb() {
  const hex = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return { r: 56, g: 189, b: 248 };
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function createParticles(width, height) {
  const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * PARTICLE_SPEED,
    vy: (Math.random() - 0.5) * PARTICLE_SPEED,
    radius: Math.random() * 1.6 + 1.4,
    icon: null,
  }));

  const usedIndexes = new Set();
  ICON_TYPES.forEach((type) => {
    let assigned = 0;
    while (assigned < ICON_COUNT_PER_TYPE && usedIndexes.size < particles.length) {
      const index = Math.floor(Math.random() * particles.length);
      if (usedIndexes.has(index)) continue;
      usedIndexes.add(index);
      particles[index].icon = type;
      assigned += 1;
    }
  });

  return particles;
}

function createBits(width, height) {
  return Array.from({ length: BIT_COUNT }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vy: BIT_SPEED + Math.random() * BIT_SPEED,
    char: Math.random() < 0.5 ? '0' : '1',
    opacity: 0.12 + Math.random() * 0.18,
  }));
}

function drawIcon(ctx, type, x, y, color) {
  const s = 6;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (type) {
    case 'camera':
      ctx.translate(-s, -s * 0.75);
      ctx.strokeRect(0, s * 0.3, s * 1.3, s * 1.1);
      ctx.beginPath();
      ctx.moveTo(s * 1.3, s * 0.55);
      ctx.lineTo(s * 2, s * 0.2);
      ctx.lineTo(s * 2, s * 1.4);
      ctx.lineTo(s * 1.3, s * 0.95);
      ctx.closePath();
      ctx.stroke();
      break;

    case 'shield':
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.1);
      ctx.lineTo(s * 0.9, -s * 0.6);
      ctx.lineTo(s * 0.9, s * 0.3);
      ctx.quadraticCurveTo(s * 0.9, s * 1.2, 0, s * 1.5);
      ctx.quadraticCurveTo(-s * 0.9, s * 1.2, -s * 0.9, s * 0.3);
      ctx.lineTo(-s * 0.9, -s * 0.6);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, 0);
      ctx.lineTo(-s * 0.1, s * 0.35);
      ctx.lineTo(s * 0.45, -s * 0.35);
      ctx.stroke();
      break;

    case 'monitor':
      ctx.strokeRect(-s * 1.1, -s * 0.9, s * 2.2, s * 1.4);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.5);
      ctx.lineTo(0, s * 0.9);
      ctx.moveTo(-s * 0.6, s * 0.9);
      ctx.lineTo(s * 0.6, s * 0.9);
      ctx.stroke();
      break;

    case 'phone':
      ctx.strokeRect(-s * 0.55, -s * 1.1, s * 1.1, s * 2.2);
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, s * 0.85);
      ctx.lineTo(s * 0.2, s * 0.85);
      ctx.stroke();
      break;

    case 'laptop':
      ctx.strokeRect(-s * 1.1, -s * 0.9, s * 2.2, s * 1.3);
      ctx.beginPath();
      ctx.moveTo(-s * 1.4, s * 0.7);
      ctx.lineTo(s * 1.4, s * 0.7);
      ctx.stroke();
      break;

    default:
      break;
  }

  ctx.restore();
}

export function initHeroNetwork(canvas) {
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const { r, g, b } = readAccentRgb();
  const container = canvas.parentElement;

  let width = 0;
  let height = 0;
  let particles = [];
  let bits = [];
  let rafId = null;
  let isRunning = false;

  function resize() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    width = rect.width;
    height = rect.height;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    particles = createParticles(width, height);
    bits = createBits(width, height);
  }

  function drawFrame() {
    ctx.clearRect(0, 0, width, height);

    ctx.font = `${BIT_FONT_SIZE}px monospace`;
    ctx.textBaseline = 'middle';
    bits.forEach((bit) => {
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${bit.opacity})`;
      ctx.fillText(bit.char, bit.x, bit.y);
    });

    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECT_DISTANCE) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${(1 - dist / CONNECT_DISTANCE) * 0.5})`;
          ctx.lineWidth = 0.6;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    particles.forEach((particle) => {
      if (particle.icon) {
        drawIcon(ctx, particle.icon, particle.x, particle.y, `rgba(${r}, ${g}, ${b}, 0.9)`);
        return;
      }
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.shadowBlur = 6;
      ctx.shadowColor = `rgb(${r}, ${g}, ${b})`;
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  function step() {
    const centerX = width / 2;
    const centerY = height / 2;

    particles.forEach((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;

      const dx = particle.x - centerX;
      const dy = particle.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const spiral = Math.min(SPIRAL_STRENGTH / dist, SPIRAL_MAX);
      particle.x += -dy * (spiral / dist);
      particle.y += dx * (spiral / dist);

      if (particle.x < 0 || particle.x > width) particle.vx *= -1;
      if (particle.y < 0 || particle.y > height) particle.vy *= -1;
    });

    bits.forEach((bit) => {
      bit.y += bit.vy;
      if (bit.y > height + BIT_FONT_SIZE) {
        bit.y = -BIT_FONT_SIZE;
        bit.x = Math.random() * width;
      }
    });

    drawFrame();
    rafId = requestAnimationFrame(step);
  }

  function start() {
    if (isRunning || prefersReducedMotion()) return;
    isRunning = true;
    rafId = requestAnimationFrame(step);
  }

  function stop() {
    isRunning = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  resize();
  drawFrame();

  if (prefersReducedMotion()) return;

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && document.visibilityState === 'visible') {
          start();
        } else {
          stop();
        }
      });
    },
    { threshold: 0 }
  );
  visibilityObserver.observe(canvas);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stop();
    } else {
      start();
    }
  });

  window.addEventListener(
    'resize',
    debounce(() => {
      resize();
      drawFrame();
    }, 150)
  );
}
