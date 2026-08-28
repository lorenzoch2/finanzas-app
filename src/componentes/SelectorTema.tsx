import { Monitor, Moon, Sun } from 'lucide-react';
import { useTema } from '@/lib/preferencias';
import type { Tema } from '@/lib/preferencias';

/**
 * Claro, oscuro o el del sistema.
 *
 * Tres estados y no un interruptor de dos, porque «seguir al sistema» es una
 * elección real y la más habitual: la app cambia sola al anochecer sin que
 * nadie toque nada.
 */

const OPCIONES: { valor: Tema; etiqueta: string; icono: typeof Sun }[] = [
  { valor: 'claro', etiqueta: 'Claro', icono: Sun },
  { valor: 'sistema', etiqueta: 'Automático', icono: Monitor },
  { valor: 'oscuro', etiqueta: 'Oscuro', icono: Moon },
];

export default function SelectorTema({ compacto = false }: { compacto?: boolean }) {
  const [tema, setTema] = useTema();

  if (compacto) {
    // En la cabecera solo cabe un botón: rota entre los tres estados.
    const actual = OPCIONES.find((o) => o.valor === tema) ?? OPCIONES[1]!;
    const siguiente = OPCIONES[(OPCIONES.indexOf(actual) + 1) % OPCIONES.length]!;
    const Icono = actual.icono;

    return (
      <button
        type="button"
        className="button-ghost px-2.5"
        onClick={() => setTema(siguiente.valor)}
        aria-label={`Tema: ${actual.etiqueta}. Cambiar a ${siguiente.etiqueta}`}
        title={`Tema: ${actual.etiqueta}`}
      >
        <Icono size={18} aria-hidden />
      </button>
    );
  }

  return (
    <div
      className="inline-flex rounded-campo border border-borde bg-elevado p-1"
      role="group"
      aria-label="Tema de la aplicación"
    >
      {OPCIONES.map(({ valor, etiqueta, icono: Icono }) => (
        <button
          key={valor}
          type="button"
          onClick={() => setTema(valor)}
          aria-pressed={tema === valor}
          className={`inline-flex items-center gap-1.5 rounded-[0.5rem] px-3 py-1.5 text-xs font-medium transition ${
            tema === valor ? 'bg-tarjeta text-tinta shadow-suave' : 'text-tinta-3 hover:text-tinta-2'
          }`}
        >
          <Icono size={14} aria-hidden />
          {etiqueta}
        </button>
      ))}
    </div>
  );
}
