import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEstadoApp } from '@/lib/estadoApp';
import { mesActual } from '@/lib/fecha';
import {
  ETIQUETAS_PRESET,
  desplazarMes,
  nombrarRango,
  rangoDePreset,
} from '@/lib/rango';
import type { Preset } from '@/lib/rango';

/**
 * Selector de período.
 *
 * Las flechas de mes se conservan porque cambiar de mes es lo que más se hace
 * y debe costar un toque. El desplegable añade los atajos y las fechas libres
 * para cuando hace falta otra cosa, sin estorbar al caso normal.
 *
 * Las flechas solo aparecen cuando el rango ES un mes: en «últimos 3 meses»,
 * «anterior» no significa nada evidente y sería un botón que hace algo
 * inesperado.
 */

const PRESETS: Preset[] = ['mes', 'mes-anterior', 'ultimos-3', 'ultimos-6', 'ultimos-12', 'ano'];

export default function SelectorRango() {
  const { rango, setRango, zona } = useEstadoApp();
  const [abierto, setAbierto] = useState(false);
  const [desde, setDesde] = useState(rango.desde);
  const [hasta, setHasta] = useState(rango.hasta);
  const contenedor = useRef<HTMLDivElement>(null);

  // Cerrar al pulsar fuera. Sin esto el panel se queda abierto tapando la app.
  useEffect(() => {
    if (!abierto) return;

    const alPulsar = (evento: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(evento.target as Node)) {
        setAbierto(false);
      }
    };

    document.addEventListener('mousedown', alPulsar);
    return () => document.removeEventListener('mousedown', alPulsar);
  }, [abierto]);

  useEffect(() => {
    setDesde(rango.desde);
    setHasta(rango.hasta);
  }, [rango.desde, rango.hasta]);

  const esMes = Boolean(rango.mes);
  const futuro = esMes && rango.mes! >= mesActual(zona);

  const aplicarPersonalizado = () => {
    if (!desde || !hasta) return;
    // Si se invierten, se ordenan en vez de rechazar: la intención es clara.
    const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
    setRango({ desde: a, hasta: b, preset: 'personalizado' });
    setAbierto(false);
  };

  return (
    <div ref={contenedor} className="relative">
      <div className="flex items-center gap-0.5 rounded-campo border border-borde bg-tarjeta px-1 py-1">
        {esMes ? (
          <button
            type="button"
            className="button-ghost px-1.5 py-1.5"
            onClick={() => setRango(desplazarMes(rango, -1))}
            aria-label="Período anterior"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          className="flex min-w-[8rem] items-center justify-center gap-1.5 px-2 text-xs font-semibold text-tinta-2"
        >
          <CalendarDays size={14} className="shrink-0 text-tinta-3" aria-hidden />
          <span className="truncate">{nombrarRango(rango)}</span>
        </button>

        {esMes ? (
          <button
            type="button"
            className="button-ghost px-1.5 py-1.5"
            onClick={() => setRango(desplazarMes(rango, 1))}
            disabled={futuro}
            aria-label="Período siguiente"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        ) : null}
      </div>

      {abierto ? (
        <div className="absolute right-0 z-50 mt-2 w-72 rounded-tarjeta border border-borde bg-tarjeta p-3 shadow-alzada">
          <p className="mb-2 text-xs font-semibold text-tinta-3">Atajos</p>
          <ul className="mb-3 space-y-0.5">
            {PRESETS.map((preset) => (
              <li key={preset}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-[0.5rem] px-2.5 py-2 text-left text-sm transition ${
                    rango.preset === preset
                      ? 'bg-acento-suave text-acento'
                      : 'text-tinta-2 hover:bg-elevado'
                  }`}
                  onClick={() => {
                    setRango(rangoDePreset(preset, zona));
                    setAbierto(false);
                  }}
                >
                  {ETIQUETAS_PRESET[preset]}
                  {rango.preset === preset ? <Check size={14} aria-hidden /> : null}
                </button>
              </li>
            ))}
          </ul>

          <p className="mb-2 border-t border-borde-suave pt-3 text-xs font-semibold text-tinta-3">
            Fechas exactas
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-tinta-3">Desde</span>
              <input
                type="date"
                className="input py-1.5 text-sm"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-tinta-3">Hasta</span>
              <input
                type="date"
                className="input py-1.5 text-sm"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </label>
          </div>

          <button type="button" className="button-primary mt-3 w-full" onClick={aplicarPersonalizado}>
            Aplicar
          </button>
        </div>
      ) : null}
    </div>
  );
}
