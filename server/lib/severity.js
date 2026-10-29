// Clasificaciones admitidas para informes nuevos o editados.
// SUSPENSO se conserva únicamente para lectura de registros históricos.
export const ACTIVE_SEVERITIES = Object.freeze(['LEVE', 'GRAVE', 'MUY GRAVE']);
export const RETIRED_SEVERITIES = Object.freeze(['SUSPENSO']);

export function isActiveSeverity(value) {
  return ACTIVE_SEVERITIES.includes(value);
}
