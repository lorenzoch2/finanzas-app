import { describe, expect, it } from 'vitest';
// El mapeo vive en scripts/ porque es un generador, no código de la app. Sus
// tipos están en scripts/mapeo-historico.d.ts: las reglas deciden dónde acaba
// cada peso del histórico, y eso no debería poder cambiar sin que salte algo.
import {
  clasificar,
  esCanasta,
  establecimientoDe,
  fraccionDeFechaFalsa,
} from '../../scripts/mapeo-historico.mjs';

/**
 * Cada caso de aquí nació de una fila real del Google Sheet, y varios de un
 * fallo que ya cometí una vez.
 */

describe('fracciones que Google convirtió en fechas', () => {
  // En Chile la carne se pide por cuartos de kilo. Al teclear «2/4», Sheets lo
  // interpretó como el 2 de abril y lo guardó como fecha. Las filas vecinas lo
  // confirman: «5 bistec + 2/4 carne molida normal».
  it('lee 2/4 como medio kilo', () => {
    expect(fraccionDeFechaFalsa('2025-04-02')).toBe(0.5);
  });

  it('lee 1/2 como medio kilo', () => {
    expect(fraccionDeFechaFalsa('2025-02-01')).toBe(0.5);
  });

  it('lee 1/4 como un cuarto de kilo', () => {
    expect(fraccionDeFechaFalsa('2025-04-01')).toBe(0.25);
  });

  it('no inventa una fracción donde no hay fecha', () => {
    expect(fraccionDeFechaFalsa(1.5)).toBeNull();
    expect(fraccionDeFechaFalsa(null)).toBeNull();
  });
});

describe('el orden de las reglas', () => {
  // Si «carne» ganara a «gato», la comida del gato acabaría contada como
  // carnicería y la subcategoría Mascotas saldría vacía.
  it('el gato gana a la carne', () => {
    expect(clasificar('carne y arena gato', 'Supermercado/Feria').sub).toBe('Mascotas');
  });

  // En una salida manda el alcohol, no el completo que lo acompaña.
  it('el alcohol gana a comer fuera', () => {
    expect(clasificar('Completo y chelas', 'Entretenimiento').sub).toBe('Salidas y bares');
  });

  it('separa el vino de la casa de las salidas', () => {
    expect(clasificar('Vino tinto', 'Supermercado/Feria').sub).toBe('Para la casa');
  });

  // «metrónomo» contiene «metro». Sin el descarte iría a transporte público.
  it('el metrónomo no es transporte', () => {
    expect(clasificar('Piscolas sala metrónomo', 'Entretenimiento').sub).toBe('Salidas y bares');
  });

  it('acepta el plural de carne molida', () => {
    expect(clasificar('2 carnes molidas', 'Supermercado/Feria').sub).toBe(
      'Carnes y pescados',
    );
  });
});

describe('compra entera frente a producto', () => {
  // Esta distinción decide si la fila lleva detalle o va con monto_sin_detalle.
  it.each([
    'Santa Isabel',
    'compras',
    '4 bistec, 1/4 carne molida especial, bandeja huevo y 1 kilo de arroz',
    'Pan, tomate, aceite, fósforo, Bebida y alfajor',
    'No sé',
    'minimarket',
  ])('«%s» es una compra sin desglose', (nombre) => {
    expect(esCanasta(nombre)).toBe(true);
  });

  it.each(['Lechuga', 'Café liofilizado', 'Detergente', 'Entel', 'trutro de pollo'])(
    '«%s» sí es un producto',
    (nombre) => {
      expect(esCanasta(nombre)).toBe(false);
    },
  );
});

describe('establecimientos', () => {
  it('reconoce el supermercado dentro del texto', () => {
    expect(establecimientoDe('compras santa isabel')).toEqual({
      nombre: 'Santa Isabel',
      tipo: 'supermercado',
    });
  });

  it('trata los servicios como establecimiento, que es lo que son', () => {
    expect(establecimientoDe('Chilquinta')?.tipo).toBe('servicio');
  });

  it('no fuerza un establecimiento donde no lo hay', () => {
    expect(establecimientoDe('Lechuga')).toBeNull();
  });
});

describe('respaldo cuando ninguna regla acierta', () => {
  it('cae en la categoría que traía del Sheet', () => {
    expect(clasificar('algo que no existe', 'Servicios básicos').sub).toBe('Luz, agua y gas');
    expect(clasificar('algo que no existe', 'Servicios básicos').via).toBe('base');
  });

  it('nunca deja una fila sin subcategoría', () => {
    expect(clasificar('', undefined).sub).toBe('Imprevistos');
  });
});
