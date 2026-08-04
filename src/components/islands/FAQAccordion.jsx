import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from '../ui/icons.jsx';

export default function FAQAccordion({ items }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div class="mx-auto flex max-w-3xl flex-col gap-4" role="list">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div
            key={item.question}
            class="glass-card group overflow-hidden transition-all duration-300 hover:border-accent/40 hover:shadow-glow"
            role="listitem"
          >
            <button
              class="flex w-full items-center gap-4 p-5 text-left"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent transition-all group-hover:border-accent group-hover:bg-accent group-hover:text-ink-900">
                <Icon name={item.icon} size={18} />
              </span>
              <h3 class="flex-1 text-base font-semibold sm:text-lg">{item.question}</h3>
              <motion.span animate={{ rotate: isOpen ? 180 : 0 }} className="shrink-0 text-accent">
                <Icon name="chevronDown" size={18} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="bg-black/10"
                >
                  <p class="pb-5 pl-[76px] pr-5 text-sm leading-relaxed text-muted">{item.answer}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
