import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, KeyRound, Loader2, LogIn, Mail, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Modo = 'entrar' | 'registrarse' | 'recuperar';

/**
 * Pantalla de acceso.
 *
 * Incluye registro porque la app nace sin ninguna cuenta, e incluye
 * recuperación porque no la hay: si olvidas la contraseña de una app de un
 * solo usuario, no existe un administrador que te rescate. Sin este flujo,
 * olvidarla significa perder el acceso a tu propia contabilidad.
 */
export default function Login() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiarModo = (nuevo: Modo) => {
    setModo(nuevo);
    setError(null);
    setAviso(null);
  };

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    setAviso(null);

    const correo = email.trim();
    if (!correo) {
      setError('Escribe tu correo.');
      return;
    }

    if (modo !== 'recuperar' && !password) {
      setError('Escribe tu contraseña.');
      return;
    }

    if (modo === 'registrarse' && password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setEnviando(true);

    try {
      if (modo === 'entrar') {
        const { error: fallo } = await supabase.auth.signInWithPassword({ email: correo, password });
        if (fallo) throw fallo;
        // El SesionProvider detecta el cambio y la app se redibuja sola.
      } else if (modo === 'registrarse') {
        const { data, error: fallo } = await supabase.auth.signUp({ email: correo, password });
        if (fallo) throw fallo;

        if (data.session) {
          setAviso('Cuenta creada. Ya puedes entrar.');
        } else {
          setAviso('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.');
          cambiarModo('entrar');
        }
      } else {
        const { error: fallo } = await supabase.auth.resetPasswordForEmail(correo, {
          // Vuelve a la misma app; Supabase abre una sesión de recuperación y
          // el SesionProvider la reconoce por el evento PASSWORD_RECOVERY.
          redirectTo: window.location.origin,
        });
        if (fallo) throw fallo;

        // Se responde igual exista o no la cuenta: decir "ese correo no está
        // registrado" le confirma a cualquiera qué direcciones tienen cuenta.
        setAviso('Si ese correo tiene cuenta, te llegará un enlace para cambiar la contraseña.');
      }
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo completar la operación.');
    } finally {
      setEnviando(false);
    }
  };

  const titulo = modo === 'recuperar' ? 'Recuperar el acceso' : 'Orden absoluto del dinero';

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold tracking-[0.3em] text-acento uppercase">finanzapp</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-tinta">{titulo}</h1>
        </div>

        <form onSubmit={(e) => void enviar(e)} className="card space-y-4 p-6">
          {modo === 'recuperar' ? (
            <p className="text-sm text-tinta-2">
              Te enviamos un enlace para fijar una contraseña nueva.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <label className="label" htmlFor="email">
              Correo
            </label>
            <div className="relative">
              <Mail
                size={16}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-tinta-3"
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

          {modo !== 'recuperar' ? (
            <div className="space-y-1.5">
              <label className="label" htmlFor="password">
                Contraseña
              </label>
              <div className="relative">
                <KeyRound
                  size={16}
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-tinta-3"
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
          ) : null}

          {error ? <p className="mensaje-error">{error}</p> : null}
          {aviso ? <p className="mensaje-ok">{aviso}</p> : null}

          <button type="submit" className="button-primary w-full" disabled={enviando}>
            {enviando ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : modo === 'entrar' ? (
              <LogIn size={16} aria-hidden />
            ) : modo === 'registrarse' ? (
              <UserPlus size={16} aria-hidden />
            ) : (
              <Mail size={16} aria-hidden />
            )}
            {modo === 'entrar' ? 'Entrar' : modo === 'registrarse' ? 'Crear cuenta' : 'Enviar enlace'}
          </button>

          {modo === 'recuperar' ? (
            <button type="button" className="button-ghost w-full" onClick={() => cambiarModo('entrar')}>
              <ArrowLeft size={16} aria-hidden /> Volver
            </button>
          ) : (
            <>
              <button
                type="button"
                className="button-ghost w-full"
                onClick={() => cambiarModo(modo === 'entrar' ? 'registrarse' : 'entrar')}
              >
                {modo === 'entrar' ? '¿Primera vez? Crear cuenta' : 'Ya tengo cuenta'}
              </button>

              {modo === 'entrar' ? (
                <button
                  type="button"
                  className="w-full text-center text-sm text-tinta-3 underline underline-offset-4 hover:text-tinta-2"
                  onClick={() => cambiarModo('recuperar')}
                >
                  Olvidé mi contraseña
                </button>
              ) : null}
            </>
          )}
        </form>
      </div>
    </div>
  );
}
