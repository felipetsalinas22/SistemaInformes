-- ═══════════════════════════════════════════════════════════════════
-- 005 · Refuerzos de PAT, índice de tutoría y configuración de plazos
-- ═══════════════════════════════════════════════════════════════════

-- PAT es una función adicional de un docente, nunca un rol de cuenta.
CREATE OR REPLACE FUNCTION enforce_pat_assignment() RETURNS trigger AS $$
DECLARE
  role_code TEXT;
BEGIN
  SELECT r.code INTO role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = NEW.user_id;

  IF role_code IS NULL THEN
    RAISE EXCEPTION 'El usuario de la asignación PAT no existe.';
  END IF;

  IF role_code <> 'PROFESOR' THEN
    RAISE EXCEPTION 'La función PAT sólo puede asignarse a usuarios con rol PROFESOR (se recibió %).', role_code;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pat_assignments_role_guard ON pat_assignments;
CREATE TRIGGER pat_assignments_role_guard
  BEFORE INSERT OR UPDATE ON pat_assignments
  FOR EACH ROW EXECUTE FUNCTION enforce_pat_assignment();

-- Las notificaciones buscan destinatarios por alumno; este índice evita
-- recorrer tutor_students completo en cada informe nuevo.
CREATE INDEX IF NOT EXISTS tutor_students_student_idx ON tutor_students(student_id);

-- Configuración de plazos y límites editable desde administración.
INSERT INTO settings (key, value) VALUES
  ('statement_max_days', '30'::jsonb),
  ('statement_max_length', '5000'::jsonb),
  ('deadline_warning_hours', '24'::jsonb)
ON CONFLICT (key) DO NOTHING;
