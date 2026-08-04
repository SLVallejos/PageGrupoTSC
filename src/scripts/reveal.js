import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reduceMotion) {
  const items = gsap.utils.toArray('.reveal');
  items.forEach((el, i) => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power2.out',
      delay: (i % 3) * 0.08,
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        once: true,
      },
    });
  });

  const sideItems = gsap.utils.toArray('.reveal-left, .reveal-right');
  sideItems.forEach((el) => {
    gsap.to(el, {
      opacity: 1,
      x: 0,
      duration: 0.8,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: el,
        start: 'top 88%',
        once: true,
      },
    });
  });
} else {
  gsap.set('.reveal, .reveal-left, .reveal-right', { opacity: 1, y: 0, x: 0 });
}

const counters = document.querySelectorAll('.stat-num');
counters.forEach((el) => {
  const target = Number(el.dataset.target || '0');
  const prefix = el.dataset.prefix || '';
  const suffix = el.dataset.suffix || '';
  const state = { value: reduceMotion ? target : 0 };

  const render = () => {
    el.textContent = `${prefix}${Math.round(state.value)}${suffix}`;
  };
  render();

  if (reduceMotion) return;

  ScrollTrigger.create({
    trigger: el,
    start: 'top 90%',
    once: true,
    onEnter: () => {
      gsap.to(state, {
        value: target,
        duration: 1.8,
        ease: 'power1.out',
        onUpdate: render,
      });
    },
  });
});
