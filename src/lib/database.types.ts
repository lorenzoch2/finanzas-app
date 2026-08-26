/**
 * Tipos del esquema de Supabase, en el estado POSTERIOR a las migraciones
 * 0001-0006 (ver supabase/migrations/).
 *
 * Están escritos a mano porque el CLI de Supabase no está instalado. Tienen la
 * misma forma que los que genera `supabase gen types typescript`, así que se
 * pueden reemplazar por la versión generada sin tocar nada más:
 *
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * Las columnas generadas (precio_final, descuento_porcentaje, tuvo_descuento,
 * total_linea) aparecen en Row pero NO en Insert ni Update: la base las
 * calcula y rechaza cualquier intento de escribirlas. El tipo lo impide antes.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type TipoTransaccion = 'ingreso' | 'egreso';

export interface Database {
  public: {
    Tables: {
      fuentes_cuentas: {
        Row: {
          id: string;
          nombre: string;
          tipo: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          tipo?: string;
          created_at?: string;
          user_id?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          tipo?: string;
          user_id?: string;
        };
      };

      transacciones: {
        Row: {
          id: string;
          tipo: TipoTransaccion;
          monto: number;
          fecha: string;
          fuente_id: string | null;
          nota: string | null;
          monto_sin_detalle: number;
          created_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          tipo: TipoTransaccion;
          monto: number;
          fecha: string;
          fuente_id?: string | null;
          nota?: string | null;
          monto_sin_detalle?: number;
          user_id?: string;
        };
        Update: {
          tipo?: TipoTransaccion;
          monto?: number;
          fecha?: string;
          fuente_id?: string | null;
          nota?: string | null;
          monto_sin_detalle?: number;
        };
      };

      items_detalle: {
        Row: {
          id: string;
          transaccion_id: string;
          nombre_producto: string | null;
          marca: string | null;
          categoria_id: string | null;
          unidades: number | null;
          peso_volumen: string | null;
          precio_unitario: number | null;
          descuento_monto: number;
          calificacion: number | null;
          user_id: string;
          // Generadas por la base. Solo lectura.
          precio_final: number;
          descuento_porcentaje: number;
          tuvo_descuento: boolean;
          total_linea: number;
        };
        Insert: {
          id?: string;
          transaccion_id: string;
          nombre_producto?: string | null;
          marca?: string | null;
          categoria_id?: string | null;
          unidades?: number | null;
          peso_volumen?: string | null;
          precio_unitario?: number | null;
          descuento_monto?: number;
          calificacion?: number | null;
          user_id?: string;
        };
        Update: {
          nombre_producto?: string | null;
          marca?: string | null;
          categoria_id?: string | null;
          unidades?: number | null;
          peso_volumen?: string | null;
          precio_unitario?: number | null;
          descuento_monto?: number;
          calificacion?: number | null;
        };
      };

      ajustes_saldos: {
        Row: {
          id: string;
          fuente_id: string;
          fecha_referencia: string;
          monto_ajustado: number;
          nota: string | null;
          user_id: string;
        };
        Insert: {
          id?: string;
          fuente_id: string;
          fecha_referencia: string;
          monto_ajustado: number;
          nota?: string | null;
          user_id?: string;
        };
        Update: {
          fuente_id?: string;
          fecha_referencia?: string;
          monto_ajustado?: number;
          nota?: string | null;
        };
      };

      categorias: {
        Row: {
          id: string;
          nombre: string;
          parent_id: string | null;
          user_id: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          parent_id?: string | null;
          user_id?: string;
        };
        Update: {
          nombre?: string;
          parent_id?: string | null;
        };
      };
    };

    Views: Record<string, never>;

    Functions: {
      saldos_por_fuente: {
        Args: { p_mes: string; p_tz?: string };
        Returns: {
          fuente_id: string;
          nombre: string;
          tipo: string;
          saldo_inicial: number;
          saldo_actual: number;
        }[];
      };
      resumen_mensual: {
        Args: { p_mes: string; p_tz?: string };
        Returns: {
          total_disponible: number;
          ingresos: number;
          gastos: number;
        }[];
      };
      guardar_transaccion: {
        Args: { p_transaccion: Json; p_items?: Json; p_id?: string | null };
        Returns: string;
      };
      borrar_transaccion: {
        Args: { p_id: string };
        Returns: undefined;
      };
    };

    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

// Atajos que usa el resto de la app.
type Tablas = Database['public']['Tables'];

export type Fuente = Tablas['fuentes_cuentas']['Row'];
export type Transaccion = Tablas['transacciones']['Row'];
export type ItemDetalle = Tablas['items_detalle']['Row'];
export type AjusteSaldo = Tablas['ajustes_saldos']['Row'];
export type Categoria = Tablas['categorias']['Row'];

export type NuevaTransaccion = Tablas['transacciones']['Insert'];
export type NuevoItem = Tablas['items_detalle']['Insert'];
export type NuevaFuente = Tablas['fuentes_cuentas']['Insert'];
export type NuevoAjuste = Tablas['ajustes_saldos']['Insert'];
export type NuevaCategoria = Tablas['categorias']['Insert'];

export type SaldoPorFuente = Database['public']['Functions']['saldos_por_fuente']['Returns'][number];
export type ResumenMensual = Database['public']['Functions']['resumen_mensual']['Returns'][number];

/** Transacción con su detalle, como la devuelve la consulta anidada. */
export type TransaccionConDetalle = Transaccion & {
  items_detalle: ItemDetalle[];
  fuentes_cuentas: Pick<Fuente, 'id' | 'nombre' | 'tipo'> | null;
};
