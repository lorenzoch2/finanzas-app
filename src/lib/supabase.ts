import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Cliente único de Supabase, tipado contra el esquema.
 *
 * Dos diferencias con la versión anterior:
 *
 * - `persistSession: true`. Antes estaba en false, lo que era coherente con no
 *   tener login: la anon key del bundle daba acceso a todo sin sesión. Con RLS
 *   activo la sesión es justamente lo que da acceso, y tiene que sobrevivir a
 *   recargar la página.
 *
 * - Falla fuerte si faltan las variables. Antes solo hacía `console.warn` y
 *   seguía con strings vacíos, así que el error real aparecía mucho después,
 *   disfrazado de "no se pudo cargar".
 */

const url = import.meta.env['VITE_SUPABASE_URL'];
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copia .env.example a .env.local y complétalas.',
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Normaliza un error de Supabase a un mensaje legible.
 *
 * Los códigos que más se van a ver son los de RLS: si la sesión expiró, la
 * base no devuelve "no autorizado", devuelve cero filas o un 42501. Decirlo
 * en claro evita perseguir un bug de datos que en realidad es de sesión.
 */
export const mensajeDeError = (error: unknown): string => {
  if (!error) return 'Error desconocido.';

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const codigo = String((error as { code: unknown }).code);
    const mensaje = 'message' in error ? String((error as { message: unknown }).message) : '';

    switch (codigo) {
      case '42501':
        return 'Sin permiso para esta operación. Puede que tu sesión haya expirado: vuelve a entrar.';
      case '23505':
        return 'Ya existe un registro con esos datos.';
      case '23503':
        return 'No se puede completar: hay otro registro que depende de este.';
      case '23514':
        return `Los datos no cumplen una validación de la base. ${mensaje}`;
      case 'PGRST301':
        return 'Tu sesión expiró. Vuelve a iniciar sesión.';
      default:
        return mensaje || `Error ${codigo}.`;
    }
  }

  if (error instanceof Error) return error.message;
  return String(error);
};

/**
 * ¿El fallo es que la base todavía no tiene la función que la app pide?
 *
 * Las migraciones y el código se despliegan por separado, así que hay una
 * ventana en la que la app va por delante. Distinguir ese caso permite decir
 * qué hacer en vez de mostrar un error de PostgREST sobre un nombre de
 * función, que parece que la app está rota.
 */
export const faltaMigracion = (error: unknown): boolean => {
  const mensaje = error instanceof Error ? error.message : String(error ?? '');
  return /could not find the function|does not exist|schema cache|PGRST202|42883|42883/i.test(mensaje);
};
