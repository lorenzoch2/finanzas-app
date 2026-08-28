import { Star } from 'lucide-react';

/**
 * Calificación de 1 a 5 estrellas.
 *
 * Sustituye a un campo numérico suelto que en 96 compras no se usó ni una vez.
 * La sospecha es que pedía un número sin decir para qué servía ni qué escala
 * usar. Con estrellas, el gesto es evidente y cuesta un toque.
 *
 * Sirve para responder algo que el precio solo no contesta: si una marca
 * barata compensa. Volver a tocar la misma estrella la quita, porque es la
 * única forma de deshacer un toque accidental sin salir del formulario.
 */

interface Props {
  valor: number | null;
  onCambiar: (valor: number | null) => void;
  etiqueta: string;
}

export default function Estrellas({ valor, onCambiar, etiqueta }: Props) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={etiqueta}>
      {[1, 2, 3, 4, 5].map((n) => {
        const activa = valor != null && n <= valor;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onCambiar(valor === n ? null : n)}
            aria-label={`${n} de 5`}
            aria-pressed={activa}
            className="rounded p-1 transition hover:scale-110"
          >
            <Star
              size={18}
              aria-hidden
              className={activa ? 'fill-alerta text-alerta' : 'text-tinta-3'}
            />
          </button>
        );
      })}

      {valor != null ? (
        <button
          type="button"
          onClick={() => onCambiar(null)}
          className="ml-1 text-xs text-tinta-3 underline underline-offset-2"
        >
          quitar
        </button>
      ) : null}
    </div>
  );
}
