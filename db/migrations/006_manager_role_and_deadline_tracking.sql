-- ═══════════════════════════════════════════════════════════════════
-- 006 · Gerente, seguimiento automático de plazos y retiro del rol PAT
-- ═══════════════════════════════════════════════════════════════════

-- El "gerente" institucional se modela como un rol de gestión: administra
-- usuarios, cursos, alumnos, configuración y la función PAT, sin quitarle
-- al Administrador las mismas facultades para la demostración.
INSERT INTO roles (code, name, description, sort_order)
VALUES ('GERENTE', 'Gerente institucional',
        'Gestiona usuarios, cursos, configuración y asignaciones PAT. Consulta todos los informes y vencimientos.',
        15)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order;

-- PAT deja de ofrecerse como rol de cuenta. Si quedara alguna cuenta
-- histórica, se conserva y se migró en 004; sólo se retira el rol vacío.
DELETE FROM roles
WHERE code = 'PAT'
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.role_id = roles.id);

CREATE OR REPLACE FUNCTION prevent_legacy_pat_role() RETURNS trigger AS $$
BEGIN
  IF NEW.code = 'PAT' THEN
    RAISE EXCEPTION 'PAT es una función asignable a docentes, no un rol de cuenta.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roles_no_legacy_pat ON roles;
CREATE TRIGGER roles_no_legacy_pat
  BEFORE INSERT OR UPDATE OF code ON roles
  FOR EACH ROW EXECUTE FUNCTION prevent_legacy_pat_role();

-- Marcas persistentes para el trabajo automático de vencimientos.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS deadline_expired_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS deadline_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reports_open_deadlines
  ON reports (statement_deadline)
  WHERE status = 'Pendiente' AND stage = 'descargo' AND statement_submitted_at IS NULL;

COMMENT ON COLUMN reports.deadline_expired_at IS
  'Primera vez en que el servidor detectó el plazo vencido, sin depender de una página abierta.';
COMMENT ON COLUMN reports.deadline_notified_at IS
  'Última notificación automática de vencimiento enviada a los destinatarios.';
