import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '../ui/icons.jsx';

export default function TechTabs({ items }) {
  const [active, setActive] = useState(items[0].id);
  const current = items.find((t) => t.id === active);
  const btnRefs = useRef([]);

  const focusIndex = (index) => {
    const el = btnRefs.current[index];
    el?.focus();
    setActive(items[index].id);
  };

  const handleKeyDown = (e, index) => {
    const last = items.length - 1;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusIndex(index === last ? 0 : index + 1);
    } else if (e.key === 'ArrowLeft') {
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
    <div>
      <div class="mb-8 flex flex-wrap justify-center gap-3" role="tablist" aria-label="Áreas de trabajo">
        {items.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => (btnRefs.current[i] = el)}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => setActive(t.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`flex min-w-[110px] flex-col items-center gap-2 rounded-2xl border px-6 py-4 text-sm font-semibold transition-all ${
              active === t.id
                ? 'border-accent bg-accent/10 text-accent shadow-glow'
                : 'border-white/5 bg-ink-800/50 text-muted hover:border-accent/20 hover:bg-accent/5 hover:text-slate-50'
            }`}
          >
            <Icon name={t.icon} size={22} />
            <span>{t.tab}</span>
          </button>
        ))}
      </div>

      <div class="glass-card min-h-[280px] p-6 sm:p-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            id={`panel-${current.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${current.id}`}
            tabIndex={0}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left"
          >
            <div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <Icon name={current.icon} size={30} />
            </div>
            <div>
              <h3 class="mb-3 text-2xl font-semibold">{current.title}</h3>
              <p class="mb-5 text-muted">{current.text}</p>
              <div class="flex flex-wrap justify-center gap-2 sm:justify-start">
                {current.tags.map((tag) => (
                  <span key={tag} class="flex items-center gap-2 rounded-full border border-accent/15 bg-accent/5 px-3.5 py-1.5 text-sm text-slate-100">
                    <Icon name="check" size={13} className="text-accent" /> {tag}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
