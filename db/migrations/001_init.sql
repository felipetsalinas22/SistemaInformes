-- ═══════════════════════════════════════════════════════════════════
--  Sistema de Informes de Convivencia — esquema relacional
--  Escuela Técnica N° 35 D.E. 18
--  PostgreSQL 14+
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Tipos ──────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('Pendiente', 'Resuelto', 'Anulado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_stage AS ENUM ('descargo', 'consejos', 'dictamen', 'notificado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE severity_level AS ENUM ('LEVE', 'GRAVE', 'MUY GRAVE', 'SUSPENSO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Roles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id              SERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    sort_order      INTEGER NOT NULL DEFAULT 100,
    is_system       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Cursos / divisiones ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
    id              SERIAL PRIMARY KEY,
    year            SMALLINT NOT NULL CHECK (year BETWEEN 1 AND 6),
    division        SMALLINT NOT NULL CHECK (division BETWEEN 1 AND 12),
    specialty       TEXT NOT NULL CHECK (length(trim(specialty)) BETWEEN 2 AND 80),
    shift           TEXT NOT NULL DEFAULT 'Mañana',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (year, division, specialty)
);

-- ── Alumnos ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
    id              SERIAL PRIMARY KEY,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    dni             TEXT NOT NULL UNIQUE,
    legajo          TEXT UNIQUE,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    email           TEXT,
    guardian_email  TEXT,
    birth_date      DATE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS students_course_idx ON students(course_id);
CREATE INDEX IF NOT EXISTS students_name_idx ON students(lower(last_name), lower(first_name));

-- ── Usuarios ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   TEXT NOT NULL,
    password_hash           TEXT NOT NULL,
    full_name               TEXT NOT NULL,
    role_id                 INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    student_id              INTEGER REFERENCES students(id) ON DELETE SET NULL,
    scope_all               BOOLEAN NOT NULL DEFAULT FALSE,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password    BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts   INTEGER NOT NULL DEFAULT 0,
    locked_until            TIMESTAMPTZ,
    last_login_at           TIMESTAMPTZ,
    created_by              UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users(lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_student_unique_idx ON users(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role_id);

-- Un usuario alumno queda vinculado a un único legajo (índice único parcial).
-- Un tutor puede estar vinculado a varios alumnos a través de tutor_students.
CREATE TABLE IF NOT EXISTS tutor_students (
    tutor_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tutor_user_id, student_id)
);

-- Ámbito de trabajo: cursos asignados a profesores, preceptores, PAT y directivos.
CREATE TABLE IF NOT EXISTS user_courses (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id       INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS user_courses_course_idx ON user_courses(course_id);

-- ── Informes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
    id                      BIGSERIAL PRIMARY KEY,
    student_id              INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
    created_by              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    issuer_name             TEXT NOT NULL,
    issuer_role             TEXT NOT NULL,
    issuer_email            TEXT,
    issue_date              DATE NOT NULL DEFAULT CURRENT_DATE,
    reason                  TEXT NOT NULL,
    description             TEXT NOT NULL,
    student_text            TEXT NOT NULL DEFAULT '',
    statement_submitted_at  TIMESTAMPTZ,
    statement_deadline      TIMESTAMPTZ NOT NULL,
    preceptor_notes         TEXT NOT NULL DEFAULT '',
    pat_notes               TEXT NOT NULL DEFAULT '',
    council_notes           TEXT NOT NULL DEFAULT '',
    additional_notes        TEXT NOT NULL DEFAULT '',
    severity                severity_level NOT NULL DEFAULT 'SUSPENSO',
    other_considerations    TEXT NOT NULL DEFAULT '',
    director_signature      TEXT NOT NULL DEFAULT 'No Firmado',
    director_date           DATE,
    director_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    notify_student          BOOLEAN NOT NULL DEFAULT FALSE,
    notify_parent           BOOLEAN NOT NULL DEFAULT FALSE,
    status                  report_status NOT NULL DEFAULT 'Pendiente',
    stage                   report_stage NOT NULL DEFAULT 'descargo',
    previous_status         report_status,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_student_idx ON reports(student_id);
CREATE INDEX IF NOT EXISTS reports_created_by_idx ON reports(created_by);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status);
CREATE INDEX IF NOT EXISTS reports_stage_idx ON reports(stage);
CREATE INDEX IF NOT EXISTS reports_issue_date_idx ON reports(issue_date DESC);

-- ── Historial de cada informe ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_history (
    id              BIGSERIAL PRIMARY KEY,
    report_id       BIGINT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    action          TEXT NOT NULL,
    actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_name      TEXT NOT NULL,
    actor_role      TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_history_report_idx ON report_history(report_id, created_at);

-- ── Notificaciones (registro; el envío de correo es externo) ───────
CREATE TABLE IF NOT EXISTS notifications (
    id                  BIGSERIAL PRIMARY KEY,
    report_id           BIGINT REFERENCES reports(id) ON DELETE CASCADE,
    recipient_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    recipient_type      TEXT NOT NULL,
    recipient_label     TEXT NOT NULL,
    type                TEXT NOT NULL,
    message             TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'Registrada (sin envío de correo)',
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_report_idx ON notifications(report_id);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_user_id);

-- ── Auditoría del sistema ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGSERIAL PRIMARY KEY,
    actor_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email     TEXT,
    action          TEXT NOT NULL,
    entity          TEXT NOT NULL,
    entity_id       TEXT,
    detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip              INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log(actor_user_id);

-- ── Sesiones (cookie httpOnly; en la base sólo se guarda el hash) ──
CREATE TABLE IF NOT EXISTS sessions (
    token_hash      TEXT PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token      TEXT NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip              INET,
    user_agent      TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

-- ── Parámetros configurables ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           JSONB NOT NULL,
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Trigger updated_at ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER students_set_updated_at BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER courses_set_updated_at BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER reports_set_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER settings_set_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Datos base de roles y parámetros ───────────────────────────────
INSERT INTO roles (code, name, description, sort_order) VALUES
  ('ADMINISTRADOR', 'Administrador del sistema', 'Gestiona usuarios, cursos, alumnos y configuración. No dictamina informes.', 10),
  ('RECTOR',        'Rector/a',                 'Autoridad máxima de la institución.', 20),
  ('VICERRECTOR',   'Vicerrector/a',            'Autoridad institucional.', 30),
  ('REGENTE',       'Regente',                  'Autoridad de convivencia y disciplina.', 40),
  ('SUBREGENTE',    'Subregente',               'Autoridad de convivencia y disciplina.', 50),
  ('JEFE_TALLER',   'Jefe General de Taller',   'Autoridad de talleres y aspectos técnicos.', 60),
  ('PROFESOR',      'Profesor/a',               'Crea informes sobre alumnos de sus cursos.', 70),
  ('PRECEPTOR',     'Preceptor/a',              'Seguimiento de los cursos a su cargo.', 80),
  ('PAT',           'PAT',                      'Acompañamiento pedagógico y consejo de aula.', 90),
  ('DOE',           'DOE',                      'Orientación educativa.', 100),
  ('SECRETARIA',    'Secretaría',               'Consulta administrativa, sin edición de informes.', 110),
  ('ASESORIA',      'Asesoría Pedagógica',      'Consulta pedagógica, sin edición de informes.', 120),
  ('ALUMNO',        'Alumno/a',                 'Consulta sus informes y presenta su descargo.', 130),
  ('TUTOR',         'Padre/Madre/Tutor',        'Consulta los informes del alumno a su cargo.', 140)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      sort_order = EXCLUDED.sort_order;

INSERT INTO settings (key, value)
VALUES
  ('statement_days', '5'::jsonb),
  ('school_name', '"Escuela Técnica N° 35 D.E. 18 \"Ing. Eduardo Latzina\""'::jsonb),
  ('school_short_name', '"Escuela Técnica N° 35 D.E. 18"'::jsonb)
ON CONFLICT (key) DO NOTHING;
