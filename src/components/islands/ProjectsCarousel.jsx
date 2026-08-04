import { useRef } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, A11y } from 'swiper/modules';
import { Icon } from '../ui/icons.jsx';
import 'swiper/css';

export default function ProjectsCarousel({ items }) {
  const prevRef = useRef(null);
  const nextRef = useRef(null);

  return (
    <div class="relative mx-auto max-w-5xl px-2 sm:px-10">
      <button ref={prevRef} aria-label="Anterior" class="absolute left-0 top-1/2 z-10 hidden -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full border-2 border-accent bg-ink-800 text-accent transition-all hover:bg-accent hover:text-ink-900 sm:flex">
        <Icon name="chevronLeft" size={18} />
      </button>

      <Swiper
        modules={[Navigation, A11y]}
        onBeforeInit={(swiper) => {
          swiper.params.navigation.prevEl = prevRef.current;
          swiper.params.navigation.nextEl = nextRef.current;
        }}
        navigation={{ prevEl: prevRef.current, nextEl: nextRef.current }}
        spaceBetween={20}
        slidesPerView={1}
        breakpoints={{ 768: { slidesPerView: 2 } }}
        className="!overflow-hidden !rounded-2xl"
      >
        {items.map((p) => (
          <SwiperSlide key={p.title}>
            <div class="glass-card flex h-full flex-col overflow-hidden !rounded-2xl border border-accent/5 shadow-glow">
              <div class="relative h-[220px] w-full overflow-hidden">
                <img src={`/img/${p.image}`} alt={p.title} loading="lazy" decoding="async" class="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
                <span class="absolute left-4 top-4 rounded bg-accent px-3 py-1 text-xs font-bold text-ink-900">{p.tag}</span>
              </div>
              <div class="flex flex-1 flex-col p-6">
                <div class="mb-4 h-[3px] w-12 rounded-full bg-accent opacity-85" />
                <h3 class="mb-2.5 text-lg font-semibold">{p.title}</h3>
                <p class="text-sm text-muted">{p.text}</p>
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      <button ref={nextRef} aria-label="Siguiente" class="absolute right-0 top-1/2 z-10 hidden -translate-y-1/2 h-11 w-11 items-center justify-center rounded-full border-2 border-accent bg-ink-800 text-accent transition-all hover:bg-accent hover:text-ink-900 sm:flex">
        <Icon name="chevronRight" size={18} />
      </button>
    </div>
  );
}
