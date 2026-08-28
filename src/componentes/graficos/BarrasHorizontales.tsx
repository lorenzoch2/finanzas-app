import { useId, useState } from 'react';
import { formatearCLP } from '@/lib/dinero';

/**
 * Comparación de magnitud entre categorías.
 *
 * Barras horizontales y no verticales porque los nombres son largos
 * («Supermercado y despensa», «Salud y cuidado personal») y en vertical
 * habría que rotarlos o truncarlos.
 *
 * Color SECUENCIAL, un solo tono de claro a oscuro, no una paleta categórica.
 * El trabajo del dato aquí es magnitud, no identidad: pintar cada categoría de
 * un color distinto sugeriría que el color significa algo cuando solo
 * decoraría, y además enterraría cuál es la más grande, que es justo lo que se
 * viene a mirar.
 */

export interface Barra {
  etiqueta: string;
  valor: number;
  detalle?: string;
}

interface Props {
  datos: Barra[];
  maximo?: number;
  vacio?: string;
}

/**
 * Cinco pasos del mismo tono, de más oscuro (mayor) a más claro (menor).
 * Es la rampa de marca, así que el gráfico no introduce colores ajenos a la app.
 */
const PASOS = ['#1551c2', '#1669ef', '#2d87ff', '#4fa6ff', '#86c4ff'];

const tonoPara = (indice: number, total: number): string => {
  if (total <= 1) return PASOS[0] as string;
  const posicion = Math.floor((indice / Math.max(total - 1, 1)) * (PASOS.length - 1));
  return PASOS[Math.min(posicion, PASOS.length - 1)] as string;
};

export default function BarrasHorizontales({ datos, maximo, vacio = 'Sin datos.' }: Props) {
  const id = useId();
  const [activa, setActiva] = useState<number | null>(null);

  if (datos.length === 0) {
    return <p className="rounded-tarjeta bg-elevado p-6 text-center text-sm text-tinta-2">{vacio}</p>;
  }

  const tope = maximo ?? Math.max(...datos.map((d) => d.valor), 1);
  const total = datos.reduce((s, d) => s + d.valor, 0);

  return (
    <ul className="space-y-2.5">
      {datos.map((barra, indice) => {
        const proporcion = tope > 0 ? barra.valor / tope : 0;
        const porcentaje = total > 0 ? (barra.valor / total) * 100 : 0;
        const resaltada = activa === indice;

        return (
          <li
            key={`${id}-${barra.etiqueta}`}
            onMouseEnter={() => setActiva(indice)}
            onMouseLeave={() => setActiva(null)}
            onFocus={() => setActiva(indice)}
            onBlur={() => setActiva(null)}
            tabIndex={0}
            className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-acento"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-tinta-2">{barra.etiqueta}</span>
              {/* Etiqueta directa: el valor no se deduce midiendo la barra. */}
              <span className="shrink-0 text-sm font-semibold tabular-nums text-tinta">
                {formatearCLP(barra.valor)}
              </span>
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-elevado">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.max(proporcion * 100, 1)}%`,
                  backgroundColor: tonoPara(indice, datos.length),
                  opacity: activa === null || resaltada ? 1 : 0.5,
                }}
              />
            </div>

            {resaltada || barra.detalle ? (
              <p className="mt-1 text-xs text-tinta-3">
                {porcentaje.toFixed(1)}% del total
                {barra.detalle ? ` · ${barra.detalle}` : ''}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
