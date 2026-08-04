import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '../ui/icons.jsx';

export default function SolutionsTabs({ items }) {
  const [active, setActive] = useState(items[0].id);
  const current = items.find((s) => s.id === active);
  const btnRefs = useRef([]);

  const focusIndex = (index) => {
    const el = btnRefs.current[index];
    el?.focus();
    setActive(items[index].id);
  };

  const handleKeyDown = (e, index) => {
    const last = items.length - 1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      focusIndex(index === last ? 0 : index + 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      focusIndex(index === 0 ? last : index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusIndex(last);
    }
  };

  return (
    <div class="mx-auto grid max-w-6xl gap-8 px-5 lg:grid-cols-[320px_1fr]">
      <div class="grid gap-2.5 sm:grid-cols-2 lg:flex lg:flex-col" role="tablist" aria-label="Soluciones especializadas">
        {items.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => (btnRefs.current[i] = el)}
            role="tab"
            id={`tab-${s.id}`}
            aria-selected={active === s.id}
            aria-controls={`panel-${s.id}`}
            tabIndex={active === s.id ? 0 : -1}
            onClick={() => setActive(s.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`flex items-center gap-3.5 rounded-2xl border px-5 py-4 text-left text-sm font-semibold transition-all ${
              active === s.id
                ? 'border-accent bg-ink-800/80 text-accent shadow-glow lg:translate-x-1.5'
                : 'border-white/5 bg-ink-800/40 text-muted hover:bg-ink-800/70 hover:text-slate-50'
            }`}
          >
            <Icon name={s.icon} size={18} />
            {s.label}
          </button>
        ))}
      </div>

      <div class="glass-card flex min-h-[400px] items-center p-6 shadow-glow sm:p-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            id={`panel-${current.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${current.id}`}
            tabIndex={0}
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            transition={{ duration: 0.3 }}
            className="grid w-full items-center gap-8 lg:grid-cols-[1.2fr_0.8fr]"
          >
            <div class="order-2 lg:order-1">
              <h3 class="mb-4 text-2xl font-semibold">{current.title}</h3>
              <p class="mb-5 text-muted">{current.text}</p>
              <ul class="flex flex-col gap-3">
                {current.benefits.map((b) => (
                  <li key={b} class="flex items-center gap-3 text-sm text-slate-100">
                    <Icon name="check" size={16} className="shrink-0 text-emerald-400" /> {b}
                  </li>
                ))}
              </ul>
            </div>
            <div class="order-1 h-[220px] overflow-hidden rounded-2xl border border-white/5 lg:order-2 lg:h-[300px]">
              <img src={`/img/${current.image}`} alt={current.title} loading="lazy" decoding="async" class="h-full w-full object-cover" />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
