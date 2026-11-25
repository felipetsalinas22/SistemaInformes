// Etiquetas de curso en español rioplatense: "6.º 2.ª Computación".
// Un único formato para todas las API evita cursos escritos a mano en el frontend.

export function courseLabel(row, { includeSpecialty = true } = {}) {
  const year = Number(row?.year);
  const division = Number(row?.division);
  const specialty = String(row?.specialty || '').trim();
  const safeYear = Number.isFinite(year) && year > 0 ? year : '?';
  const safeDivision = Number.isFinite(division) && division > 0 ? division : '?';
  const base = `${safeYear}.º ${safeDivision}.ª`;
  return includeSpecialty && specialty ? `${base} ${specialty}` : base;
}

// Acepta etiquetas nuevas ("1.º 2.ª Informática") e históricas ("1° 2° Informática").
export function normalizeCourseLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[°ºª·.\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
