import { useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useSesion } from '@/auth/SesionProvider';
import { supabase } from '@/lib/supabase';

/**
 * Fijar una contraseña nueva tras llegar por el enlace de recuperación.
 *
 * Supabase abre una sesión válida en cuanto se sigue ese enlace, así que sin
 * esta pantalla el usuario entraría directo al dashboard con la contraseña
 * vieja intacta: el enlace le habría dado acceso sin arreglar nada, y a la
 * siguiente visita volvería a estar bloqueado.
 */
export default function CambiarPassword() {
  const { terminarRecuperacion, cerrarSesion } = useSesion();
  const [password, setPassword] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== repetida) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setEnviando(true);

    try {
      const { error: fallo } = await supabase.auth.updateUser({ password });
      if (fallo) throw fallo;
      terminarRecuperacion();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo cambiar la contraseña.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold tracking-[0.3em] text-acento uppercase">finanzapp</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-tinta">Nueva contraseña</h1>
        </div>

        <form onSubmit={(e) => void enviar(e)} className="card space-y-4 p-6">
          <div className="space-y-1.5">
            <label className="label" htmlFor="nueva">
              Contraseña nueva
            </label>
            <div className="relative">
              <KeyRound
                size={16}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-tinta-3"
              />
              <input
                id="nueva"
                type="password"
                autoComplete="new-password"
                className="input pl-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="label" htmlFor="repetir">
              Repítela
            </label>
            <input
              id="repetir"
              type="password"
              autoComplete="new-password"
              className="input"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
              required
            />
          </div>

          {error ? <p className="mensaje-error">{error}</p> : null}

          <button type="submit" className="button-primary w-full" disabled={enviando}>
            {enviando ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            Guardar y entrar
          </button>

          <button type="button" className="button-ghost w-full" onClick={() => void cerrarSesion()}>
            Cancelar y salir
          </button>
        </form>
      </div>
    </div>
  );
}
