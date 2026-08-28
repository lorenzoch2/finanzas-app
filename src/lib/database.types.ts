/**
 * Tipos del esquema de Supabase, en el estado POSTERIOR a las migraciones
 * 0001-0015 (ver supabase/migrations/).
 *
 * Escritos a mano porque el CLI de Supabase no está instalado. Tienen la
 * misma forma que los que genera `supabase gen types typescript`, así que se
 * pueden reemplazar por la versión generada sin tocar nada más:
 *
 *   npx supabase gen types typescript --linked > src/lib/database.types.ts
 *
 * Las columnas generadas por la base aparecen en Row pero NO en Insert ni
 * Update: la base las calcula y rechaza cualquier intento de escribirlas. El
 * tipo lo impide antes de llegar allí.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * Una transferencia no es ni ingreso ni gasto: mueve dinero entre cuentas
 * propias. Tenerla como tipo aparte es lo que impide que un traspaso infle a
 * la vez los ingresos y los gastos del mes.
 */
export type TipoTransaccion = 'ingreso' | 'egreso' | 'transferencia';

/** Unidades en que se mide el contenido de un producto. */
export type UnidadContenido = 'g' | 'kg' | 'ml' | 'l' | 'unidad';

/**
 * `peso` significa que se vende a granel: el precio es por kilo y la cantidad
 * cambia en cada compra, así que el peso real va en la compra, no aquí.
 */
export type VendidoPor = 'unidad' | 'peso';

export type TipoEstablecimiento =
  | 'supermercado'
  | 'feria'
  | 'almacen'
  | 'farmacia'
  | 'restaurante'
  | 'online'
  | 'servicio'
  | 'otro';

export interface Database {
  public: {
    Tables: {
      fuentes_cuentas: {
        Row: {
          id: string;
          nombre: string;
          tipo: string;
          es_principal: boolean;
          created_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          tipo?: string;
          es_principal?: boolean;
          user_id?: string;
        };
        Update: {
          nombre?: string;
          tipo?: string;
          es_principal?: boolean;
        };
        Relationships: [];
      };

      transacciones: {
        Row: {
          id: string;
          tipo: TipoTransaccion;
          monto: number;
          fecha: string;
          fuente_id: string | null;
          fuente_destino_id: string | null;
          establecimiento_id: string | null;
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
          fuente_destino_id?: string | null;
          establecimiento_id?: string | null;
          nota?: string | null;
          monto_sin_detalle?: number;
          user_id?: string;
        };
        Update: {
          tipo?: TipoTransaccion;
          monto?: number;
          fecha?: string;
          fuente_id?: string | null;
          fuente_destino_id?: string | null;
          establecimiento_id?: string | null;
          nota?: string | null;
          monto_sin_detalle?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_transacciones_fuente';
            columns: ['fuente_id'];
            isOneToOne: false;
            referencedRelation: 'fuentes_cuentas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transacciones_fuente_destino_id_fkey';
            columns: ['fuente_destino_id'];
            isOneToOne: false;
            referencedRelation: 'fuentes_cuentas';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transacciones_establecimiento_id_fkey';
            columns: ['establecimiento_id'];
            isOneToOne: false;
            referencedRelation: 'establecimientos';
            referencedColumns: ['id'];
          },
        ];
      };

      productos: {
        Row: {
          id: string;
          nombre: string;
          marca: string | null;
          categoria_id: string | null;
          contenido_cantidad: number | null;
          contenido_unidad: UnidadContenido | null;
          vendido_por: VendidoPor;
          created_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          marca?: string | null;
          categoria_id?: string | null;
          contenido_cantidad?: number | null;
          contenido_unidad?: UnidadContenido | null;
          vendido_por?: VendidoPor;
          user_id?: string;
        };
        Update: {
          nombre?: string;
          marca?: string | null;
          categoria_id?: string | null;
          contenido_cantidad?: number | null;
          contenido_unidad?: UnidadContenido | null;
          vendido_por?: VendidoPor;
        };
        Relationships: [
          {
            foreignKeyName: 'productos_categoria_id_fkey';
            columns: ['categoria_id'];
            isOneToOne: false;
            referencedRelation: 'categorias';
            referencedColumns: ['id'];
          },
        ];
      };

      establecimientos: {
        Row: {
          id: string;
          nombre: string;
          tipo: TipoEstablecimiento;
          created_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          tipo?: TipoEstablecimiento;
          user_id?: string;
        };
        Update: {
          nombre?: string;
          tipo?: TipoEstablecimiento;
        };
        Relationships: [];
      };

      items_detalle: {
        Row: {
          id: string;
          transaccion_id: string;
          producto_id: string | null;
          nombre_producto: string | null;
          marca: string | null;
          categoria_id: string | null;
          unidades: number | null;
          /** Peso real de esta compra. Solo se usa en productos a granel. */
          cantidad_medida: number | null;
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
          producto_id?: string | null;
          nombre_producto?: string | null;
          marca?: string | null;
          categoria_id?: string | null;
          unidades?: number | null;
          cantidad_medida?: number | null;
          precio_unitario?: number | null;
          descuento_monto?: number;
          calificacion?: number | null;
          user_id?: string;
        };
        Update: {
          producto_id?: string | null;
          nombre_producto?: string | null;
          marca?: string | null;
          categoria_id?: string | null;
          unidades?: number | null;
          cantidad_medida?: number | null;
          precio_unitario?: number | null;
          descuento_monto?: number;
          calificacion?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_items_transaccion';
            columns: ['transaccion_id'];
            isOneToOne: false;
            referencedRelation: 'transacciones';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_items_categoria';
            columns: ['categoria_id'];
            isOneToOne: false;
            referencedRelation: 'categorias';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'items_detalle_producto_id_fkey';
            columns: ['producto_id'];
            isOneToOne: false;
            referencedRelation: 'productos';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'fk_ajustes_fuente';
            columns: ['fuente_id'];
            isOneToOne: false;
            referencedRelation: 'fuentes_cuentas';
            referencedColumns: ['id'];
          },
        ];
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
        Relationships: [
          {
            foreignKeyName: 'fk_categorias_parent';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'categorias';
            referencedColumns: ['id'];
          },
        ];
      };

      presupuestos: {
        Row: {
          id: string;
          categoria_id: string | null;
          monto: number;
          vigente_desde: string;
          created_at: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          categoria_id?: string | null;
          monto: number;
          vigente_desde?: string;
          user_id?: string;
        };
        Update: {
          categoria_id?: string | null;
          monto?: number;
          vigente_desde?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'presupuestos_categoria_id_fkey';
            columns: ['categoria_id'];
            isOneToOne: false;
            referencedRelation: 'categorias';
            referencedColumns: ['id'];
          },
        ];
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
          es_principal: boolean;
          saldo_inicial: number;
          saldo_actual: number;
        }[];
      };
      resumen_mensual: {
        Args: { p_mes: string; p_tz?: string };
        // Las transferencias no aparecen aquí: no son ingreso ni gasto.
        Returns: {
          ingresos: number;
          gastos: number;
        }[];
      };
      avance_presupuesto: {
        Args: { p_mes: string; p_tz?: string };
        Returns: {
          limite: number;
          gastado: number;
          dias_transcurridos: number;
          dias_del_mes: number;
          proyeccion: number;
          es_mes_en_curso: boolean;
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
      normalizar_texto: {
        Args: { t: string };
        Returns: string;
      };

      // --- Análisis (migración 0016) ---
      gasto_por_categoria: {
        Args: { p_mes: string; p_tz?: string };
        Returns: { categoria_padre: string; categoria: string; total: number; items: number }[];
      };
      evolucion_mensual: {
        Args: { p_meses?: number; p_tz?: string };
        Returns: { mes: string; ingresos: number; gastos: number; limite: number }[];
      };
      gasto_por_establecimiento: {
        Args: { p_mes: string; p_tz?: string };
        Returns: { establecimiento: string; tipo: string; total: number; visitas: number }[];
      };
      historial_producto: {
        Args: { p_producto_id: string };
        Returns: {
          fecha: string;
          establecimiento: string;
          precio_unitario: number | null;
          precio_final: number;
          cantidad: number;
          precio_por_medida: number | null;
          unidad_medida: string | null;
        }[];
      };
      ranking_productos: {
        Args: { p_mes: string; p_tz?: string; p_limite?: number };
        Returns: {
          producto: string;
          marca: string | null;
          total: number;
          veces: number;
          calificacion: number | null;
        }[];
      };
      ahorro_descuentos: {
        Args: { p_mes: string; p_tz?: string };
        Returns: { establecimiento: string; ahorrado: number; items: number }[];
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
export type Producto = Tablas['productos']['Row'];
export type Establecimiento = Tablas['establecimientos']['Row'];
export type Presupuesto = Tablas['presupuestos']['Row'];

export type NuevaFuente = Tablas['fuentes_cuentas']['Insert'];
export type NuevoAjuste = Tablas['ajustes_saldos']['Insert'];
export type NuevaCategoria = Tablas['categorias']['Insert'];
export type NuevoProducto = Tablas['productos']['Insert'];
export type NuevoEstablecimiento = Tablas['establecimientos']['Insert'];
export type NuevoPresupuesto = Tablas['presupuestos']['Insert'];

type Funciones = Database['public']['Functions'];
export type SaldoPorFuente = Funciones['saldos_por_fuente']['Returns'][number];
export type ResumenMensual = Funciones['resumen_mensual']['Returns'][number];
export type AvancePresupuesto = Funciones['avance_presupuesto']['Returns'][number];

/** Transacción con su detalle, como la devuelve la consulta anidada. */
export type TransaccionConDetalle = Transaccion & {
  items_detalle: (ItemDetalle & { productos: Pick<Producto, 'id' | 'nombre' | 'marca'> | null })[];
  fuentes_cuentas: Pick<Fuente, 'id' | 'nombre' | 'tipo'> | null;
  /** Solo en traspasos: la cuenta que recibe. */
  destino: Pick<Fuente, 'id' | 'nombre'> | null;
  establecimientos: Pick<Establecimiento, 'id' | 'nombre' | 'tipo'> | null;
};

/** Producto con la ruta de su categoría, para los selectores. */
export type ProductoConCategoria = Producto & {
  categorias: Pick<Categoria, 'id' | 'nombre'> | null;
};
