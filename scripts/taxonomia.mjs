/**
 * Taxonomía de categorías propuesta para la v3, y el mapeo de cada producto
 * histórico a su subcategoría.
 *
 * Vive en un archivo aparte, y no incrustada en la migración, para poder
 * revisarla y corregirla sin tocar SQL. La migración 0010 se genera a partir
 * de aquí, así que lo que se apruebe leyendo esto es exactamente lo que se
 * aplica.
 *
 *   node scripts/proponer-categorias.mjs        ve la propuesta y su cobertura
 *   node scripts/generar-migracion-categorias.mjs   genera el SQL
 */

/** Diez categorías principales, cada una con sus subcategorías. */
export const TAXONOMIA = {
  'Supermercado y despensa': [
    'Frutas y verduras',
    'Carnes y pescados',
    'Lácteos y huevos',
    'Panadería',
    'Abarrotes',
    'Café e infusiones',
    'Snacks y dulces',
    'Bebidas',
    'Feria',
  ],
  'Comer fuera': ['Comida rápida', 'Restaurante', 'Cafetería', 'Delivery'],
  Alcohol: ['Para la casa', 'Salidas y bares'],
  Hogar: ['Aseo y limpieza', 'Menaje y cocina', 'Muebles', 'Ferretería'],
  'Salud y cuidado personal': [
    'Higiene personal',
    'Farmacia',
    'Consultas y exámenes',
    'Deporte y suplementos',
  ],
  'Cuentas y servicios': ['Luz, agua y gas', 'Gastos comunes', 'Internet y telefonía', 'Arriendo'],
  'Suscripciones digitales': ['Streaming', 'Herramientas y software'],
  Transporte: ['Combustible', 'Transporte público', 'Apps de movilidad', 'Vehículo'],
  'Compras personales': ['Ropa y calzado', 'Tecnología', 'Entretenimiento', 'Regalos'],
  Otros: ['Educación', 'Viajes', 'Imprevistos', 'Préstamos a terceros'],
};

/**
 * Producto histórico -> subcategoría.
 *
 * La clave se compara normalizada (sin tildes, sin mayúsculas, sin espacios
 * sobrantes), que es justamente lo que hoy hace que «Pechuga Pollo» y
 * «Pechuga pollo» se traten como dos cosas distintas.
 */
export const MAPEO = {
  // Supermercado y despensa
  Lechuga: 'Frutas y verduras',
  'Lechuga Costina Corazón': 'Frutas y verduras',
  Champiñon: 'Frutas y verduras',
  'Lomo Centro': 'Carnes y pescados',
  'Pechuga Pollo': 'Carnes y pescados',
  'Trutro pollo': 'Carnes y pescados',
  'Pana pollo': 'Carnes y pescados',
  'Atún agua': 'Carnes y pescados',
  'Paté de Ternera': 'Carnes y pescados',
  'Leche Entera': 'Lácteos y huevos',
  'Queso chanco': 'Lácteos y huevos',
  Huevos: 'Lácteos y huevos',
  Hallulla: 'Panadería',
  Pan: 'Panadería',
  'Pan dobladas': 'Panadería',
  Sopaipilla: 'Panadería',
  Arroz: 'Abarrotes',
  'Fideo Huevo': 'Abarrotes',
  'Pack Salsa Tomate': 'Abarrotes',
  Nuez: 'Abarrotes',
  Chancaca: 'Abarrotes',
  Café: 'Café e infusiones',
  'Café Descafeinado': 'Café e infusiones',
  Twix: 'Snacks y dulces',
  Chocolate: 'Snacks y dulces',
  'Chocolate de leche': 'Snacks y dulces',
  Alfajor: 'Snacks y dulces',
  // Dulce chileno, no el vino de Mendoza. Lo aclaró Lorenzo: del dato solo se
  // veía «Mendocino $2.000», que daba pie a las dos lecturas.
  Mendocino: 'Snacks y dulces',
  Gatorade: 'Bebidas',
  Suerox: 'Bebidas',
  Feria: 'Feria',

  // Comer fuera
  Completo: 'Comida rápida',
  Pizza: 'Comida rápida',
  Subway: 'Comida rápida',
  Sandwich: 'Comida rápida',
  'Colación Pollo Asado': 'Comida rápida',
  Queque: 'Cafetería',
  Bebida: 'Cafetería',

  // Alcohol
  Cerveza: 'Para la casa',
  Piscola: 'Para la casa',

  // Hogar
  'Papel higiénico': 'Aseo y limpieza',
  Confort: 'Aseo y limpieza',
  'Toalla Nova': 'Aseo y limpieza',
  Servilleta: 'Aseo y limpieza',
  'Bolsas de basura': 'Aseo y limpieza',
  'Toalla húmeda': 'Aseo y limpieza',
  'Tapa olla': 'Menaje y cocina',
  Escurridor: 'Menaje y cocina',
  Verdulero: 'Menaje y cocina',
  'Papelero baño': 'Menaje y cocina',
  Tendedero: 'Menaje y cocina',
  'Escritorio Home Studio': 'Muebles',
  'Mesa Comedor': 'Muebles',
  Soldadura: 'Ferretería',

  // Salud y cuidado personal
  'Acondicionador Rosa Mosqueta': 'Higiene personal',
  'Cepillo interdental': 'Higiene personal',
  'Enjuague bucal': 'Higiene personal',
  Remedios: 'Farmacia',
  'Creatina Monohidratada': 'Deporte y suplementos',
  'Pesas tobilleras': 'Deporte y suplementos',

  // Cuentas y servicios
  Luz: 'Luz, agua y gas',
  GGCC: 'Gastos comunes',
  Wifi: 'Internet y telefonía',
  'Datos Móviles': 'Internet y telefonía',
  'Entel Hogar': 'Internet y telefonía',
  'Enter Movil': 'Internet y telefonía',

  // Suscripciones digitales
  Youtube: 'Streaming',
  Netlify: 'Herramientas y software',

  // Transporte
  // «Red» es Red Movilidad, el transporte público de Santiago: una recarga de
  // la Bip, no un producto. Del dato solo se veía «Red $10.000», que era
  // indescifrable sin preguntarlo.
  Red: 'Transporte público',

  // Otros
  'Préstamo papá': 'Préstamos a terceros',
  Electromechanics: 'Educación',
};

/** Ningún producto queda sin clasificar: los dos ambiguos se resolvieron. */
export const AMBIGUOS = {};

const normalizar = (texto) =>
  String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Índice normalizado, para que las variantes de tilde y mayúscula coincidan. */
export const MAPEO_NORMALIZADO = new Map(
  Object.entries(MAPEO).map(([producto, sub]) => [normalizar(producto), sub]),
);

export const subcategoriaDe = (nombreProducto) =>
  MAPEO_NORMALIZADO.get(normalizar(nombreProducto)) ?? null;

/** Subcategoría -> categoría principal. */
export const PADRE_DE = new Map(
  Object.entries(TAXONOMIA).flatMap(([padre, hijas]) => hijas.map((h) => [h, padre])),
);

export { normalizar };
