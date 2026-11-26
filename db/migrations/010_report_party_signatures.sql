ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS issuer_signature_image TEXT,
  ADD COLUMN IF NOT EXISTS alumno_signature_image TEXT,
  ADD COLUMN IF NOT EXISTS familia_signature_image TEXT;

COMMENT ON COLUMN reports.director_signature_image IS 'Firma manuscrita del regente/autoridad que emite el dictamen.';
COMMENT ON COLUMN reports.issuer_signature_image IS 'Firma manuscrita de quien crea el informe.';
COMMENT ON COLUMN reports.alumno_signature_image IS 'Firma manuscrita del alumno/a al presentar el descargo.';
COMMENT ON COLUMN reports.familia_signature_image IS 'Firma manuscrita de la familia al tomar conocimiento.';
