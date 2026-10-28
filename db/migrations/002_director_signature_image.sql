-- Firma manuscrita de la autoridad competente.
-- Se guarda como data URL PNG (canvas del navegador) para incluirla en el PDF.
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS director_signature_image TEXT;
