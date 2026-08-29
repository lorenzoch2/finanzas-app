/**
 * Tipos del mapeo del historico.
 *
 * El generador es .mjs a proposito: se ejecuta con node suelto, sin pasar por
 * el bundler. Pero sus reglas deciden donde acaba cada peso del historico, asi
 * que las pruebas viven en src/ y necesitan tipos.
 */
export type Via = 'regla' | 'base';

export interface Clasificacion {
  sub: string;
  via: Via;
}

export interface Establecimiento {
  nombre: string;
  tipo: string;
}

export declare function clasificar(nombre: string, categoriaHoja?: string): Clasificacion;
export declare function establecimientoDe(nombre: string): Establecimiento | null;
export declare function esCanasta(nombre: string): boolean;
export declare function normalizar(t: unknown): string;
export declare function fraccionDeFechaFalsa(valor: unknown): number | null;

export declare const SUBCATEGORIAS_NUEVAS: { padre: string; nombre: string; porque: string }[];
export declare const BASE_POR_CATEGORIA: Record<string, string>;
export declare const REGLAS: [RegExp, string][];
export declare const ESTABLECIMIENTOS: [RegExp, string, string][];
export declare const CANASTA: RegExp;
