-- 008: limpieza final de lenguaje en datos históricos.
-- Complementa a 007 para registros creados antes de la migración.
UPDATE reports
   SET description = replace(description, 'demostración', 'institucional'),
       student_text = replace(student_text, 'demostración', 'institucional'),
       preceptor_notes = replace(preceptor_notes, 'demostración', 'institucional'),
       pat_notes = replace(pat_notes, 'demostración', 'institucional'),
       council_notes = replace(council_notes, 'demostración', 'institucional'),
       additional_notes = replace(additional_notes, 'demostración', 'institucional'),
       other_considerations = replace(other_considerations, 'demostración', 'institucional'),
       updated_at = now()
 WHERE description LIKE '%demostración%'
    OR student_text LIKE '%demostración%'
    OR preceptor_notes LIKE '%demostración%'
    OR pat_notes LIKE '%demostración%'
    OR council_notes LIKE '%demostración%'
    OR additional_notes LIKE '%demostración%'
    OR other_considerations LIKE '%demostración%';
