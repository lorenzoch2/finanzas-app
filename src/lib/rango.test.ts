import { describe, expect, it } from 'vitest';
import {
  desplazarMes,
  diaLegible,
  mesesDelRango,
  nombrarRango,
  rangoDeMes,
  rangoDePreset,
  ultimoDiaDelMes,
} from './rango';

describe('ultimoDiaDelMes', () => {
  it('conoce la longitud de cada mes', () => {
    expect(ultimoDiaDelMes('2026-01')).toBe('2026-01-31');
    expect(ultimoDiaDelMes('2026-04')).toBe('2026-04-30');
    expect(ultimoDiaDelMes('2026-12')).toBe('2026-12-31');
  });

  it('acierta febrero en años normales y bisiestos', () => {
    // El caso que se rompe solo si se codifica «28» a mano.
    expect(ultimoDiaDelMes('2026-02')).toBe('2026-02-28');
    expect(ultimoDiaDelMes('2028-02')).toBe('2028-02-29');
    // 2100 no es bisiesto pese a ser divisible por 4.
    expect(ultimoDiaDelMes('2100-02')).toBe('2100-02-28');
  });
});

describe('rangoDeMes', () => {
  it('cubre el mes entero, con ambos extremos incluidos', () => {
    const rango = rangoDeMes('2026-08');
    expect(rango.desde).toBe('2026-08-01');
    expect(rango.hasta).toBe('2026-08-31');
    expect(rango.mes).toBe('2026-08');
  });
});

describe('desplazarMes', () => {
  it('cruza bien el fin de año en ambos sentidos', () => {
    expect(desplazarMes(rangoDeMes('2026-01'), -1).mes).toBe('2025-12');
    expect(desplazarMes(rangoDeMes('2026-12'), 1).mes).toBe('2027-01');
  });

  it('recalcula los extremos, no solo el mes', () => {
    const febrero = desplazarMes(rangoDeMes('2028-03'), -1);
    expect(febrero.desde).toBe('2028-02-01');
    expect(febrero.hasta).toBe('2028-02-29');
  });

  it('no hace nada si el rango no es un mes', () => {
    // «Últimos 3 meses» no tiene un «anterior» evidente, así que se deja igual
    // en vez de inventar un desplazamiento que sorprenda.
    const libre = { desde: '2026-03-05', hasta: '2026-05-20', preset: 'personalizado' as const };
    expect(desplazarMes(libre, -1)).toEqual(libre);
  });
});

describe('rangoDePreset', () => {
  it('los últimos 3 meses incluyen el actual', () => {
    const rango = rangoDePreset('ultimos-3', 'UTC');
    expect(mesesDelRango(rango)).toHaveLength(3);
  });

  it('el año va de enero a diciembre', () => {
    const rango = rangoDePreset('ano', 'UTC');
    expect(rango.desde.slice(5)).toBe('01-01');
    expect(rango.hasta.slice(5)).toBe('12-31');
  });
});

describe('mesesDelRango', () => {
  it('enumera los meses que toca, cruzando el año', () => {
    expect(mesesDelRango({ desde: '2026-11-15', hasta: '2027-02-03', preset: 'personalizado' })).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });

  it('un rango dentro de un mes devuelve ese mes', () => {
    expect(mesesDelRango({ desde: '2026-08-03', hasta: '2026-08-17', preset: 'personalizado' })).toEqual([
      '2026-08',
    ]);
  });
});

describe('nombrarRango', () => {
  it('un mes completo se dice por su nombre, no por sus extremos', () => {
    // «Del 1 al 31 de agosto» es la misma información contada peor.
    expect(nombrarRango(rangoDeMes('2026-08'))).toBe('Agosto de 2026');
  });

  it('un rango libre muestra sus fechas', () => {
    expect(nombrarRango({ desde: '2026-08-03', hasta: '2026-08-17', preset: 'personalizado' })).toBe(
      '3 de agosto – 17 de agosto de 2026',
    );
  });

  it('incluye el año en ambos extremos si los cruza', () => {
    expect(nombrarRango({ desde: '2026-12-20', hasta: '2027-01-05', preset: 'personalizado' })).toBe(
      '20 de diciembre de 2026 – 5 de enero de 2027',
    );
  });

  it('un preset se dice por su nombre', () => {
    expect(nombrarRango(rangoDePreset('ultimos-3', 'UTC'))).toBe('Últimos 3 meses');
  });
});

describe('diaLegible', () => {
  it('no pasa por Date, para no arrastrar zonas horarias', () => {
    // new Date('2026-08-15') se interpreta en UTC y en Chile mostraria el 14.
    expect(diaLegible('2026-08-15')).toBe('15 de agosto');
    expect(diaLegible('2026-01-01', true)).toBe('1 de enero de 2026');
  });
});
