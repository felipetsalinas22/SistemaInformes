-- 007: identidad institucional definitiva
--  - Especialidades: sólo Computación y Automotores (1.°-3.° Ciclo Básico).
--  - Cuentas históricas migran a correos @latzina.edu.ar conservando su hash.
--  - Informes, snapshots y registry dejan de exponer nombres "demo".
-- Aditiva e idempotente: no borra cursos, alumnos, informes ni cuentas.

UPDATE courses AS c
   SET specialty = v.specialty,
       updated_at = now()
  FROM (VALUES
    (1, 1, 'Ciclo Básico'),
    (1, 2, 'Ciclo Básico'),
    (1, 3, 'Ciclo Básico'),
    (2, 1, 'Ciclo Básico'),
    (2, 2, 'Ciclo Básico'),
    (2, 3, 'Ciclo Básico'),
    (3, 1, 'Ciclo Básico'),
    (3, 2, 'Ciclo Básico'),
    (3, 3, 'Ciclo Básico'),
    (4, 1, 'Computación'),
    (4, 2, 'Automotores'),
    (4, 3, 'Computación'),
    (5, 1, 'Automotores'),
    (5, 2, 'Computación'),
    (5, 3, 'Automotores'),
    (6, 1, 'Computación'),
    (6, 2, 'Computación'),
    (6, 3, 'Automotores')
  ) AS v(year, division, specialty)
 WHERE c.year = v.year
   AND c.division = v.division
   AND c.specialty IS DISTINCT FROM v.specialty;

UPDATE reports AS r
   SET student_specialty = c.specialty,
       student_shift = c.shift,
       updated_at = now()
  FROM courses AS c
 WHERE r.student_course_id = c.id
   AND (r.student_specialty IS DISTINCT FROM c.specialty
        OR r.student_shift IS DISTINCT FROM c.shift);

UPDATE users AS u
   SET email = v.new_email,
       full_name = v.new_name,
       updated_at = now()
  FROM (VALUES
    ('admin@et35.demo', 'admin.institucional@latzina.edu.ar', 'Administrador institucional'),
    ('profesor@et35.demo', 'profesor.institucional@latzina.edu.ar', 'Docente institucional'),
    ('preceptor@et35.demo', 'preceptor.institucional@latzina.edu.ar', 'Preceptoría institucional'),
    ('pat@et35.demo', 'pat.institucional@latzina.edu.ar', 'Equipo PAT institucional'),
    ('regente@et35.demo', 'regente.institucional@latzina.edu.ar', 'Regencia institucional'),
    ('rector@et35.demo', 'rector.institucional@latzina.edu.ar', 'Rectorado institucional'),
    ('secretaria@et35.demo', 'secretaria.institucional@latzina.edu.ar', 'Secretaría institucional'),
    ('alumno@et35.demo', 'alumno.institucional@latzina.edu.ar', 'Guinsburg Mateo'),
    ('tutor@et35.demo', 'familia.institucional@latzina.edu.ar', 'Familia Guinsburg')
  ) AS v(old_email, new_email, new_name)
 WHERE lower(u.email) = v.old_email
   AND NOT EXISTS (
     SELECT 1 FROM users existing
      WHERE lower(existing.email) = lower(v.new_email)
   );

UPDATE reports AS r
   SET issuer_email = v.new_email
  FROM (VALUES
    ('admin@et35.demo', 'admin.institucional@latzina.edu.ar'),
    ('profesor@et35.demo', 'profesor.institucional@latzina.edu.ar'),
    ('preceptor@et35.demo', 'preceptor.institucional@latzina.edu.ar'),
    ('pat@et35.demo', 'pat.institucional@latzina.edu.ar'),
    ('regente@et35.demo', 'regente.institucional@latzina.edu.ar'),
    ('rector@et35.demo', 'rector.institucional@latzina.edu.ar'),
    ('secretaria@et35.demo', 'secretaria.institucional@latzina.edu.ar'),
    ('alumno@et35.demo', 'alumno.institucional@latzina.edu.ar'),
    ('tutor@et35.demo', 'familia.institucional@latzina.edu.ar')
  ) AS v(old_email, new_email)
 WHERE lower(r.issuer_email) = v.old_email;

UPDATE reports
   SET description = replace(replace(description, 'Registro de demostración N°', 'Registro institucional N°'), 'demostración', 'institucional'),
       student_text = replace(replace(student_text, 'Descargo de demostración del alumno/a', 'Descargo del alumno/a'), 'demostración', 'institucional'),
       preceptor_notes = replace(preceptor_notes, 'demostración', 'institucional'),
       pat_notes = replace(pat_notes, 'demostración', 'institucional'),
       council_notes = replace(council_notes, 'demostración', 'institucional'),
       additional_notes = replace(additional_notes, 'demostración', 'institucional'),
       other_considerations = replace(other_considerations, 'demostración', 'institucional')
 WHERE description LIKE '%demostración%'
    OR student_text LIKE '%demostración%'
    OR preceptor_notes LIKE '%demostración%'
    OR pat_notes LIKE '%demostración%'
    OR council_notes LIKE '%demostración%'
    OR additional_notes LIKE '%demostración%'
    OR other_considerations LIKE '%demostración%';

UPDATE seed_registry
   SET key = 'institutional-report-' || substring(key from 13)
 WHERE key LIKE 'demo-report-%'
   AND NOT EXISTS (
     SELECT 1 FROM seed_registry s2
      WHERE s2.key = 'institutional-report-' || substring(seed_registry.key from 13)
   );
