/**
 * Reglas para convertir el histórico del Google Sheet a la taxonomía v3.
 *
 * Por qué reglas y no una tabla de 280 nombres a mano: la tabla sería
 * ilegible, imposible de revisar y se quedaría corta con el primer dato
 * nuevo. Una regla dice además POR QUÉ algo va donde va, que es lo único que
 * permite discutirla.
 *
 * El orden importa: gana la primera que coincide. Lo específico va antes que
 * lo general, porque «carne y arena gato» es del gato y no de la carnicería.
 *
 * Aquí NO hay importes: este archivo se versiona, y los montos no.
 */

/**
 * Dos subcategorías que el histórico obliga a añadir.
 *
 * La taxonomía v3 se diseñó contra 96 ítems en los que esto no aparecía. Con
 * 428 filas de 2025 sí aparece, y con peso: no es una excepción.
 */
export const SUBCATEGORIAS_NUEVAS = [
  {
    padre: 'Hogar',
    nombre: 'Mascotas',
    porque:
      'Comida, arena y antiparasitario del gato: 8 compras. Más que Transporte e Internet juntos en todo el histórico.',
  },
  {
    padre: 'Cuentas y servicios',
    nombre: 'Comisiones bancarias',
    porque:
      'Cargos por débito e importe de tarjeta. Son gasto, pero no son una compra: mezclarlos con el resto ensucia cualquier comparación de precios.',
  },
];

/** Categoría del Sheet -> subcategoría v3 por defecto, si ninguna regla acierta. */
export const BASE_POR_CATEGORIA = {
  'Supermercado/Feria': 'Abarrotes',
  'Restaurantes/Comida rápida': 'Comida rápida',
  Entretenimiento: 'Entretenimiento',
  'Compras personales': 'Entretenimiento',
  'Servicios básicos': 'Luz, agua y gas',
  'Internet/Telefonía': 'Internet y telefonía',
  Suscripciones: 'Streaming',
  Transporte: 'Transporte público',
  Educación: 'Educación',
  Salud: 'Consultas y exámenes',
  Regalos: 'Regalos',
  Imprevistos: 'Imprevistos',
  'Arriendo/Hipoteca': 'Arriendo',
  Ahorro: 'Imprevistos',
  '': 'Imprevistos',
};

/** [patrón, subcategoría]. Gana la primera que coincide. */
export const REGLAS = [
  // Mascotas antes que carnes y que aseo, o se las llevan ellas.
  [/gato|josera|paz pet|antiparasitario/, 'Mascotas'],

  [/importe tarjeta|cargo por debito|banco estado/, 'Comisiones bancarias'],

  // El alcohol antes que «comer fuera»: en una salida manda la piscola.
  [/piscola|chela|cerveza|heineken|cusque|royal|liberty|copete|barbazul|club level|batuta|bebidas y hielo|^bar$/, 'Salidas y bares'],
  [/vino (tinto|blanco)/, 'Para la casa'],

  [/ggcc|gastos comunes|comunidad feliz/, 'Gastos comunes'],
  [/chilquinta|esval|gasvalpo|gas valpo|^luz|agua depto|servicios basicos/, 'Luz, agua y gas'],
  [/entel|wifi|datos moviles|internet/, 'Internet y telefonía'],
  [/youtube|spotify|tidal|netflix/, 'Streaming'],
  [/malwarebytes|office|soundiiz|netlify|licencia/, 'Herramientas y software'],

  [/farmacia|salcobrand|trioval|propoleo|melena de leon|remedio/, 'Farmacia'],
  [/terapia|psiconectar/, 'Consultas y exámenes'],
  [/deporte|fitai|creatina|pesas|proteic/, 'Deporte y suplementos'],
  [/afeitadora|rasurad|prestobarba|pasta dental|cepillo|desodorante|jabon|panuelo|condones|shampoo|acondicionador|enjuague|corte pelo|peluquer/, 'Higiene personal'],

  [/unab|diplomado|pdsm|cuadernos|materiales|curso/, 'Educación'],

  [/uber|cabify|didi/, 'Apps de movilidad'],
  [/^bip|pasaje|^bus$|micro|metro(?!nomo)/, 'Transporte público'],
  [/bencina|combustible|copec|shell/, 'Combustible'],

  [/mc ?donald|wendy|subway|quick lun|completo|churro|empanada|pizza|hamburguesa|lomito|sandwich|pollo asado|colacion/, 'Comida rápida'],
  [/pedidos ?ya|delivery|^envio/, 'Delivery'],
  [/restaurant|caleta portales|^salida$|desayuno en la playa|helados/, 'Restaurante'],
  [/^cafe|cafe helado|medias lunas|tecito|^te$|torta/, 'Cafetería'],

  [/pan amasado|marraqueta|hallulla|berlin|sopaipilla|dobladas|coliza|hayuya|pan batido|^pan$|^pan /, 'Panadería'],
  [/bistec|carnes? molida|posta|paleta|escalopa|ganso|trutro|pana de pollo|panita|patas de pollo|caldo de hueso|pollo|atun|pate|^carne/, 'Carnes y pescados'],
  [/leche|queso|mantequilla|huevo|yogur|manjar/, 'Lácteos y huevos'],
  [/platano|tomate|lechuga|palta|zanahoria|naranja|limon|^ajo|cebolla|pimenton|champinon|zapallo|verduler|^feria$/, 'Frutas y verduras'],
  [/cafe liofilizado|cafe descafeinado|caja de te/, 'Café e infusiones'],
  [/chocolate|twix|alfajor|trufa|gomita|dulce|mendocino|castana|nuez|nueces|semillas|granola|cacao/, 'Snacks y dulces'],
  [/coca.?cola|bebida|jugo|agua|gatorade|suerox|chincol|bidon/, 'Bebidas'],
  [/detergente|suavizante|lavaloza|confort|servilleta|nova|bolsa|esponja|virutex|papel higi|alcohol spray|vela/, 'Aseo y limpieza'],
  [/cuchara|colador|escurridor|dispensador|olla|verdulero|papelero|tendedero|taza|plato/, 'Menaje y cocina'],
  [/tijera|desatornillador|chispero|enchufe|pila|molino|soldadura|ampolleta/, 'Ferretería'],
  [/arroz|fideo|salsa|aceite|azucar|lenteja|poroto|harina|laurel|comino|maggi|chancaca|membrillo|ensalada/, 'Abarrotes'],

  [/polera|chaqueta|botin|^ropa|plantilla|zapat|calcet|funda/, 'Ropa y calzado'],
  [/mouse|ssd|ram|notebook|audifono|soporte|lampara|tarjeta|corrector espalda|plataforma/, 'Tecnología'],
  [/libro|cuerdas|guitarra|joystick|juegos|metal slug|tarima|bateria|sala (de )?(estudio|ensayo)|metronomo|entrada|bachata|weed|papel boquilla/, 'Entretenimiento'],
  [/regalo|flores|dia de la madre|escurridores/, 'Regalos'],
  [/prestamo|aporte/, 'Préstamos a terceros'],
  [/^mesa|escritorio|mueble/, 'Muebles'],
];

/**
 * Nombres que NO son un producto sino una compra entera.
 *
 * Esta es la distinción que decide si la fila lleva detalle o no. «Santa
 * Isabel» no es un producto llamado Santa Isabel: es una compra de la
 * que no se anotó el desglose. La app ya tiene `monto_sin_detalle` justo para
 * eso, y usarlo dice la verdad —hubo gasto, no sabemos en qué—. Inventar un
 * producto llamado «compras» sería peor que no tenerlo: ensuciaría el catálogo
 * y el seguimiento de precios con un fantasma.
 */
export const CANASTA =
  /,| y |\+|^compras?$|^compra |compra x|^cosas$|^comida$|^no se$|^x$|minimarket|verduler|santa isabel|supermercado|^jumbo|^giro|^cuentas$|^copete$|^juegos$|^libros$|pan y |^promo |^salida$/;

/** [patrón, nombre del establecimiento, tipo]. */
export const ESTABLECIMIENTOS = [
  [/santa isabel/, 'Santa Isabel', 'supermercado'],
  [/jumbo/, 'Jumbo', 'supermercado'],
  [/minimarket/, 'Minimarket', 'almacen'],
  [/verduler/, 'Verdulería', 'feria'],
  [/^feria$/, 'Feria', 'feria'],
  [/mc ?donald/, 'McDonalds', 'restaurante'],
  [/wendy/, 'Wendys', 'restaurante'],
  [/subway/, 'Subway', 'restaurante'],
  [/quick lun/, 'Quick Lunch Alemán', 'restaurante'],
  [/caleta portales/, 'Restaurant Caleta Portales', 'restaurante'],
  [/pedidos ?ya/, 'PedidosYa', 'online'],
  [/liberty/, 'Liberty', 'restaurante'],
  [/batuta/, 'La Batuta', 'restaurante'],
  [/barbazul/, 'Barbazul', 'restaurante'],
  [/salcobrand/, 'Salcobrand', 'farmacia'],
  [/chilquinta/, 'Chilquinta', 'servicio'],
  [/esval/, 'Esval', 'servicio'],
  [/gas ?valpo/, 'GasValpo', 'servicio'],
  [/entel/, 'Entel', 'servicio'],
  [/banco estado/, 'BancoEstado', 'servicio'],
  [/unab/, 'UNAB', 'servicio'],
  [/youtube/, 'YouTube', 'online'],
  [/spotify/, 'Spotify', 'online'],
  [/tidal/, 'Tidal', 'online'],
  [/malwarebytes/, 'Malwarebytes', 'online'],
  [/josera|paz pet/, 'Tienda de mascotas', 'otro'],
];

/** Sin tildes, sin mayúsculas, sin espacios de más. Igual que en la base. */
export const normalizar = (t) =>
  String(t ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

/** Devuelve la subcategoría v3 y si vino de una regla o del respaldo. */
export function clasificar(nombre, categoriaHoja) {
  const n = normalizar(nombre);
  for (const [patron, sub] of REGLAS) if (patron.test(n)) return { sub, via: 'regla' };
  return { sub: BASE_POR_CATEGORIA[categoriaHoja ?? ''] ?? 'Imprevistos', via: 'base' };
}

export function establecimientoDe(nombre) {
  const n = normalizar(nombre);
  for (const [patron, nom, tipo] of ESTABLECIMIENTOS) if (patron.test(n)) return { nombre: nom, tipo };
  return null;
}

export const esCanasta = (nombre) => CANASTA.test(normalizar(nombre));

/**
 * «2/4» de carne molida son dos cuartos de kilo, no el 2 de abril.
 *
 * Google Sheets convirtió esas fracciones en fechas al teclearlas, y el
 * export las trae como tales. Las filas vecinas lo confirman: «5 bistec + 2/4
 * carne molida normal». Se recupera la fracción del día y el mes.
 */
export function fraccionDeFechaFalsa(valor) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(String(valor));
  if (!m) return null;
  const denominador = Number(m[1]);
  const numerador = Number(m[2]);
  if (!denominador || !numerador) return null;
  return numerador / denominador;
}
