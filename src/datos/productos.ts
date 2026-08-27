import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { claves } from '@/lib/query';
import { mensajeDeError, supabase } from '@/lib/supabase';
import type { Database, NuevoProducto, Producto, UnidadContenido } from '@/lib/database.types';

export type CambiosProducto = Database['public']['Tables']['productos']['Update'];

/**
 * Catálogo de productos.
 *
 * Existe porque comparar precios entre establecimientos exige saber que dos
 * compras son del MISMO producto. Con el nombre en texto libre eso no se
 * sostenía: los datos históricos ya traían «Colún» y «Colun», «Pechuga Pollo»
 * y «Pechuga pollo».
 *
 * La base impone la unicidad sobre el nombre normalizado, así que el duplicado
 * es imposible por construcción, no por disciplina de quien escribe.
 */

export interface ProductoBuscado extends Producto {
  /** Etiqueta lista para mostrar: «Leche Entera · Colún · 1 L». */
  etiqueta: string;
}

const formatearContenido = (
  cantidad: number | null,
  unidad: UnidadContenido | null,
): string | null => {
  if (cantidad == null || unidad == null) return null;
  if (unidad === 'unidad') return `${cantidad} u`;
  return `${cantidad} ${unidad}`;
};

export const etiquetaDe = (producto: Producto): string =>
  [producto.nombre, producto.marca, formatearContenido(producto.contenido_cantidad, producto.contenido_unidad)]
    .filter(Boolean)
    .join(' · ');

/**
 * Todo el catálogo de una vez.
 *
 * Se baja entero a propósito: son decenas de productos, no miles, y tenerlos
 * en memoria permite buscar mientras se escribe sin un viaje al servidor por
 * cada tecla. En el supermercado, con mala señal, esa diferencia es la que
 * decide si el formulario se usa o se abandona.
 */
export function useProductos() {
  const consulta = useQuery({
    queryKey: claves.productos,
    queryFn: async (): Promise<Producto[]> => {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw new Error(mensajeDeError(error));
      return data ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const productos = useMemo(() => consulta.data ?? [], [consulta.data]);

  const conEtiqueta = useMemo<ProductoBuscado[]>(
    () => productos.map((p) => ({ ...p, etiqueta: etiquetaDe(p) })),
    [productos],
  );

  return { ...consulta, productos, conEtiqueta };
}

/** Normalización equivalente a la de la base, para que busquen igual. */
export const normalizar = (texto: string): string =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Busca en el catálogo ya cargado.
 *
 * Ordena por dónde aparece la coincidencia: lo que empieza por lo escrito va
 * antes que lo que solo lo contiene. Escribir «pan» debe ofrecer «Pan» antes
 * que «Pechuga de pollo con pan rallado».
 */
export const buscarProductos = (
  catalogo: ProductoBuscado[],
  texto: string,
  limite = 8,
): ProductoBuscado[] => {
  const q = normalizar(texto);
  if (!q) return catalogo.slice(0, limite);

  return catalogo
    .map((p) => {
      const nombre = normalizar(p.nombre);
      const marca = normalizar(p.marca ?? '');
      if (nombre.startsWith(q)) return { p, peso: 0 };
      if (nombre.includes(q)) return { p, peso: 1 };
      if (marca.startsWith(q)) return { p, peso: 2 };
      if (marca.includes(q)) return { p, peso: 3 };
      return null;
    })
    .filter((x): x is { p: ProductoBuscado; peso: number } => x !== null)
    .sort((a, b) => a.peso - b.peso || a.p.nombre.localeCompare(b.p.nombre, 'es'))
    .slice(0, limite)
    .map((x) => x.p);
};

export function useCrearProducto() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (producto: NuevoProducto): Promise<Producto> => {
      const nombre = producto.nombre.trim();
      if (!nombre) throw new Error('El producto necesita un nombre.');

      const { data, error } = await supabase
        .from('productos')
        .insert({
          ...producto,
          nombre,
          marca: producto.marca?.trim() || null,
        })
        .select()
        .single();

      if (error) {
        // 23505 es la unicidad del catálogo. En vez de fallar, se recupera el
        // producto que ya existía: quien captura una compra quiere seguir, no
        // enterarse de que alguien registró lo mismo hace tres meses.
        if (typeof error === 'object' && 'code' in error && error.code === '23505') {
          const existente = await buscarExistente(producto);
          if (existente) return existente;
        }
        throw new Error(mensajeDeError(error));
      }

      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: claves.productos }),
  });
}

/** Recupera el producto que choca con la unicidad. */
const buscarExistente = async (producto: NuevoProducto): Promise<Producto | null> => {
  let consulta = supabase.from('productos').select('*').ilike('nombre', producto.nombre.trim());

  if (producto.marca) consulta = consulta.ilike('marca', producto.marca.trim());
  else consulta = consulta.is('marca', null);

  const { data } = await consulta.limit(1);
  return data?.[0] ?? null;
};

export function useEditarProducto() {
  const qc = useQueryClient();

  return useMutation({
    // El tipo Update, no Partial<Insert>: la base rechaza escribir `id` y
    // `user_id`, y el tipo lo impide antes de intentarlo.
    mutationFn: async ({ id, cambios }: { id: string; cambios: CambiosProducto }) => {
      const { error } = await supabase.from('productos').update(cambios).eq('id', id);
      if (error) throw new Error(mensajeDeError(error));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claves.productos });
      void qc.invalidateQueries({ queryKey: ['transacciones'] });
    },
  });
}
