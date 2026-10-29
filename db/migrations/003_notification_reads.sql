-- ═══════════════════════════════════════════════════════════════════
--  003 · Notificaciones leídas + clasificación por defecto
--  - Agrega el estado de lectura persistente por destinatario.
--  - Mantiene intactos los datos históricos (incluidos los informes
--    antiguos con clasificación SUSPENSO).
--  - Cambia sólo el valor por defecto para nuevas filas; la aplicación
--    siempre envía una clasificación explícita al crear un informe.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON notifications(recipient_user_id, read_at, created_at DESC);

ALTER TABLE reports
  ALTER COLUMN severity SET DEFAULT 'LEVE';
