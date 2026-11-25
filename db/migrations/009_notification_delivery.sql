-- Registro real del estado de entrega de cada correo institucional.
-- El aviso interno sigue existiendo, pero ahora además se registra si el
-- correo fue enviado, quedó pendiente o falló. Nunca se marca como enviado
-- un correo que no llegó a transportarse.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'en_proceso',
  ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE notifications n
   SET recipient_email = u.email
  FROM users u
 WHERE u.id = n.recipient_user_id
   AND n.recipient_email IS NULL;

UPDATE notifications
   SET status = 'En proceso'
 WHERE status = 'Registrada (sin envío de correo)';

CREATE INDEX IF NOT EXISTS notifications_delivery_idx ON notifications(delivery_status);
