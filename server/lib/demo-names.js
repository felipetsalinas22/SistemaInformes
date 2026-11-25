// Nombres usados por los datos de demostración. Se centralizan para que el
// seed y la regularización de la nómina usen exactamente el mismo criterio:
// nunca repetir un nombre completo en dos divisiones distintas.

export const FIRST_NAMES = [
  'Agustina', 'Facundo', 'Camila', 'Lautaro', 'Sofía', 'Matías', 'Valentina', 'Santiago',
  'Julieta', 'Martina', 'Nicolás', 'Lucía', 'Tomás', 'Evelyn', 'Bruno', 'Ailen',
  'Ezequiel', 'Fiorella', 'Gabriel', 'Hernán', 'Isabel', 'Joaquín', 'Karina', 'Luis',
  'Mariana', 'Nahuel', 'Oriana', 'Paolo', 'Quimey', 'Ramiro', 'Soledad', 'Tiago',
  'Verónica', 'Wesley', 'Yamila', 'Zoe', 'Bautista', 'Candela', 'Dante', 'Emilia'
];

export const LAST_NAMES = [
  'Aguirre', 'Benítez', 'Cabrera', 'Díaz', 'Espinoza', 'Fernández', 'Gómez', 'Herrera',
  'Ibarra', 'Juárez', 'Kowalski', 'López', 'Martínez', 'Navarro', 'Ortiz', 'Pereyra',
  'Quiroga', 'Ramírez', 'Sosa', 'Torres', 'Urrutia', 'Vargas', 'Wagner', 'Ybarra',
  'Zamora', 'Acosta', 'Bustos', 'Córdoba', 'Delgado', 'Enriquez', 'Flores', 'García',
  'Haedo', 'Insaurralde', 'Jiménez', 'Luna', 'Mendoza', 'Núñez', 'Ocampo', 'Paz'
];

export function normalizeName(name) {
  return String(name || '')
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function pairAt(index) {
  const firstIndex = index % FIRST_NAMES.length;
  const lastIndex = Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length;
  return { first: FIRST_NAMES[firstIndex], last: LAST_NAMES[lastIndex] };
}

/**
 * Devuelve el siguiente nombre completo que todavía no esté reservado.
 * `cursor` se actualiza con el índice devuelto para no revisar combinaciones
 * ya descartadas en llamadas sucesivas.
 */
export function nextGeneratedName(cursor, reservedNames) {
  let index = Math.max(0, Number(cursor) || 0);
  const total = FIRST_NAMES.length * LAST_NAMES.length;
  while (index < total) {
    const pair = pairAt(index);
    const key = normalizeName(`${pair.first} ${pair.last}`);
    if (!reservedNames.has(key)) {
      reservedNames.add(key);
      return { ...pair, cursor: index + 1 };
    }
    index += 1;
  }
  throw new Error('No quedan combinaciones de nombres de demostración disponibles.');
}
