-- ═══════════════════════════════════════════════════════════════════
--  Instantánea histórica del alumno y su curso en cada informe.
--  Si el alumno cambia de curso (o se corrige su nombre/DNI), los
--  informes anteriores conservan los datos con los que se emitieron.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS student_course_id   INTEGER REFERENCES courses(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS student_first_name  TEXT,
  ADD COLUMN IF NOT EXISTS student_last_name   TEXT,
  ADD COLUMN IF NOT EXISTS student_name        TEXT,
  ADD COLUMN IF NOT EXISTS student_dni         TEXT,
  ADD COLUMN IF NOT EXISTS student_year        SMALLINT,
  ADD COLUMN IF NOT EXISTS student_division    SMALLINT,
  ADD COLUMN IF NOT EXISTS student_specialty   TEXT,
  ADD COLUMN IF NOT EXISTS student_shift       TEXT,
  ADD COLUMN IF NOT EXISTS student_legajo      TEXT;

-- Completar informes preexistentes con los datos actuales (sólo una vez).
UPDATE reports r
SET student_course_id = COALESCE(r.student_course_id, s.course_id),
    student_first_name = COALESCE(r.student_first_name, s.first_name),
    student_last_name  = COALESCE(r.student_last_name, s.last_name),
    student_name      = COALESCE(r.student_name, trim(s.first_name || ' ' || s.last_name)),
    student_dni       = COALESCE(r.student_dni, s.dni),
    student_year      = COALESCE(r.student_year, c.year),
    student_division  = COALESCE(r.student_division, c.division),
    student_specialty = COALESCE(r.student_specialty, c.specialty),
    student_shift     = COALESCE(r.student_shift, c.shift),
    student_legajo    = COALESCE(r.student_legajo, s.legajo)
FROM students s
JOIN courses c ON c.id = s.course_id
WHERE s.id = r.student_id;

ALTER TABLE reports
  ALTER COLUMN student_course_id SET NOT NULL,
  ALTER COLUMN student_first_name SET NOT NULL,
  ALTER COLUMN student_last_name SET NOT NULL,
  ALTER COLUMN student_name SET NOT NULL,
  ALTER COLUMN student_dni SET NOT NULL,
  ALTER COLUMN student_year SET NOT NULL,
  ALTER COLUMN student_division SET NOT NULL,
  ALTER COLUMN student_specialty SET NOT NULL,
  ALTER COLUMN student_shift SET NOT NULL;

CREATE INDEX IF NOT EXISTS reports_student_course_idx ON reports(student_course_id);

-- Normalizar DNI ya cargados (sin puntos ni espacios) para que la
-- restricción UNIQUE detecte duplicados reales.
UPDATE students SET dni = regexp_replace(dni, '\D', '', 'g') WHERE dni ~ '\D';
