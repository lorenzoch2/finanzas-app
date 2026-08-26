import { useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, Loader2, LogIn, Mail, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Modo = 'entrar' | 'registrarse';

/**
 * Pantalla de acceso.
 *
 * Incluye registro porque la app nace sin ninguna cuenta: la primera vez hay
 * que crear la tuya, y recién entonces la migración 0001 puede adjudicarte los
 * 91 movimientos que ya existen en la base.
 */
export default function Login() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    setAviso(null);

    if (!email.trim() || !password) {
      setError('Completa correo y contraseña.');
      return;
    }

    if (modo === 'registrarse' && password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setEnviando(true);

    try {
      if (modo === 'entrar') {
        const { error: fallo } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (fallo) throw fallo;
        // El SesionProvider detecta el cambio y la app se redibuja sola.
      } else {
        const { data, error: fallo } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (fallo) throw fallo;

        if (data.session) {
          setAviso('Cuenta creada. Ya puedes entrar.');
        } else {
          // El proyecto tiene confirmación por correo activada.
          setAviso('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.');
          setModo('entrar');
        }
      }
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold tracking-[0.3em] text-brand-600 uppercase">finanzapp</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            Orden absoluto del dinero
          </h1>
        </div>

        <form onSubmit={enviar} className="card space-y-4 p-6">
          <div className="space-y-1.5">
            <label className="label" htmlFor="email">
              Correo
            </label>
            <div className="relative">
              <Mail
                size={16}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
              />
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input pl-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.cl"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="label" htmlFor="password">
              Contraseña
            </label>
            <div className="relative">
              <KeyRound
                size={16}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-slate-400"
              />
              <input
                id="password"
                type="password"
                autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                className="input pl-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {error ? <p className="mensaje-error">{error}</p> : null}
          {aviso ? <p className="mensaje-ok">{aviso}</p> : null}

          <button type="submit" className="button-primary w-full" disabled={enviando}>
            {enviando ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : modo === 'entrar' ? (
              <LogIn size={16} aria-hidden />
            ) : (
              <UserPlus size={16} aria-hidden />
            )}
            {modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
          </button>

          <button
            type="button"
            className="button-ghost w-full"
            onClick={() => {
              setModo(modo === 'entrar' ? 'registrarse' : 'entrar');
              setError(null);
              setAviso(null);
            }}
          >
            {modo === 'entrar' ? '¿Primera vez? Crear cuenta' : 'Ya tengo cuenta'}
          </button>
        </form>
      </div>
    </div>
  );
}
