import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Icon } from '../ui/icons.jsx';

export default function ContactForm({ endpoint, typeOptions, whatsappHref }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ mode: 'onTouched' });
  const [status, setStatus] = useState(null); // 'success' | 'error' | null
  const [statusMsg, setStatusMsg] = useState('');

  const onSubmit = async (data) => {
    setStatus(null);
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => formData.append(key, value ?? ''));
      formData.append('_subject', 'Nueva consulta desde Grupo TSC');

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        setStatus('success');
        setStatusMsg('Consulta enviada correctamente. Te responderemos a la brevedad.');
        reset();
      } else {
        setStatus('error');
        setStatusMsg('No pudimos enviar tu consulta. Intentá nuevamente o escribinos por WhatsApp.');
      }
    } catch {
      setStatus('error');
      setStatusMsg('Ocurrió un error de conexión. Intentá nuevamente o escribinos por WhatsApp.');
    }
  };

  const inputClass =
    'w-full rounded-md border border-white/10 bg-ink-950/50 p-3 text-slate-50 outline-none transition-all focus:border-accent focus:bg-ink-950/80 focus:shadow-glow';
  const labelClass = 'text-xs font-semibold uppercase tracking-wide text-muted';

  return (
    <form class="relative flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="text" tabIndex={-1} autoComplete="off" class="hidden" {...register('_gotcha')} />

      <div class="flex flex-col gap-1.5">
        <label htmlFor="tipo" class={labelClass}>Tipo de consulta</label>
        <select id="tipo" class={inputClass} defaultValue="" {...register('tipo')}>
          {typeOptions.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.value === ''}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div class="flex flex-col gap-1.5">
        <label htmlFor="nombre" class={labelClass}>Nombre completo <span class="text-accent">*</span></label>
        <input
          id="nombre"
          class={inputClass}
          placeholder="Nombre y apellido"
          autoComplete="name"
          maxLength={100}
          aria-required="true"
          aria-invalid={errors.nombre ? 'true' : 'false'}
          aria-describedby={errors.nombre ? 'error-nombre' : undefined}
          {...register('nombre', { required: 'Ingresá tu nombre completo.' })}
        />
        {errors.nombre && <span id="error-nombre" role="alert" class="text-sm text-red-300">{errors.nombre.message}</span>}
      </div>

      <div class="flex flex-col gap-1.5">
        <label htmlFor="email" class={labelClass}>Correo electrónico <span class="text-accent">*</span></label>
        <input
          id="email"
          type="email"
          class={inputClass}
          placeholder="nombre@empresa.com"
          autoComplete="email"
          maxLength={254}
          aria-required="true"
          aria-invalid={errors.email ? 'true' : 'false'}
          aria-describedby={errors.email ? 'error-email' : undefined}
          {...register('email', {
            required: 'Ingresá tu correo electrónico.',
            pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Ingresá un correo electrónico válido.' },
          })}
        />
        {errors.email && <span id="error-email" role="alert" class="text-sm text-red-300">{errors.email.message}</span>}
      </div>

      <div class="flex flex-col gap-1.5">
        <label htmlFor="telefono" class={labelClass}>Teléfono</label>
        <input
          id="telefono"
          type="tel"
          class={inputClass}
          placeholder="3511234567"
          inputMode="tel"
          autoComplete="tel"
          aria-invalid={errors.telefono ? 'true' : 'false'}
          aria-describedby={errors.telefono ? 'error-telefono' : undefined}
          {...register('telefono', {
            validate: (v) => !v || (v.replace(/[^\d]/g, '').length >= 8 && v.replace(/[^\d]/g, '').length <= 15) || 'Ingresá un teléfono válido. Ejemplo: 3511234567 o +54 351 1234567.',
          })}
        />
        {errors.telefono && <span id="error-telefono" role="alert" class="text-sm text-red-300">{errors.telefono.message}</span>}
      </div>

      <div class="flex flex-col gap-1.5">
        <label htmlFor="mensaje" class={labelClass}>Contanos qué necesitás <span class="text-accent">*</span></label>
        <textarea
          id="mensaje"
          class={`${inputClass} h-32 resize-none`}
          placeholder="Ej: necesitamos cablear e instalar cámaras en una planta de 800 m²..."
          maxLength={2000}
          aria-required="true"
          aria-invalid={errors.mensaje ? 'true' : 'false'}
          aria-describedby={errors.mensaje ? 'error-mensaje' : undefined}
          {...register('mensaje', { required: 'Contanos brevemente qué necesitás.' })}
        />
        {errors.mensaje && <span id="error-mensaje" role="alert" class="text-sm text-red-300">{errors.mensaje.message}</span>}
      </div>

      <button type="submit" disabled={isSubmitting} class="btn-primary disabled:cursor-wait disabled:opacity-70">
        <Icon name="send" size={16} /> {isSubmitting ? 'Enviando...' : 'Enviar Consulta'}
      </button>

      <p class="mt-1 text-sm leading-relaxed text-slate-300/70">
        También podés{' '}
        {whatsappHref ? (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" class="font-semibold text-accent hover:underline">
            escribirnos por WhatsApp
          </a>
        ) : (
          'escribirnos por WhatsApp'
        )}{' '}
        para una atención más rápida.
      </p>

      {status && (
        <p role="status" class={`mt-1 rounded-lg border px-4 py-3.5 text-sm ${status === 'success' ? 'border-emerald-600/35 bg-emerald-600/10 text-emerald-200' : 'border-red-600/35 bg-red-600/10 text-red-200'}`}>
          {statusMsg}
        </p>
      )}
    </form>
  );
}
