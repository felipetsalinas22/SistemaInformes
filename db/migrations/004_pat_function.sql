-- ═══════════════════════════════════════════════════════════════════
--  Función PAT como responsabilidad adicional de un docente.
--  El rol PAT deja de ser una categoría de cuenta: los informes,
--  notificaciones e historial existentes se conservan.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pat_assignments (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_pat_assignments_course ON pat_assignments(course_id);

COMMENT ON TABLE pat_assignments IS
  'Función PAT: docentes con seguimiento de seguimiento/consulta de informes de los cursos asignados. No modifica su rol docente.';

-- Registro interno para que el seed pueda ser idempotente sin borrar datos.
CREATE TABLE IF NOT EXISTS seed_registry (
    key         TEXT PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El código PAT permanece en la tabla roles por compatibilidad histórica
-- (informes, auditorías y cuentas antiguas), pero ya no se asigna.
UPDATE roles
SET description = 'Función heredada. El seguimiento PAT se asigna como función a un docente (PROFESOR).',
    is_system = FALSE
WHERE code = 'PAT';

-- Convertir las cuentas PAT existentes en docentes y preservar su ámbito
-- como función PAT sobre los cursos que ya tenían asignados.
CREATE TEMP TABLE IF NOT EXISTS legacy_pat_users ON COMMIT DROP AS
SELECT u.id
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE r.code = 'PAT';

INSERT INTO pat_assignments (user_id, course_id)
SELECT legacy.id, uc.course_id
FROM legacy_pat_users legacy
JOIN user_courses uc ON uc.user_id = legacy.id
ON CONFLICT DO NOTHING;

UPDATE users
SET role_id = (SELECT id FROM roles WHERE code = 'PROFESOR'),
    updated_at = now()
WHERE id IN (SELECT id FROM legacy_pat_users)
  AND EXISTS (SELECT 1 FROM roles WHERE code = 'PROFESOR');
