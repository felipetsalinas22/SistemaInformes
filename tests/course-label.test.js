import test from 'node:test';
import assert from 'node:assert/strict';
import { courseLabel, normalizeCourseLabel } from '../server/lib/course-label.js';

test('las etiquetas de curso usan ordinales español', () => {
  assert.equal(courseLabel({ year: 1, division: 2, specialty: 'Ciclo Básico' }), '1.º 2.ª Ciclo Básico');
  assert.equal(courseLabel({ year: 6, division: 1, specialty: 'Computación' }, { includeSpecialty: false }), '6.º 1.ª');
});

test('la normalización acepta etiquetas nuevas e históricas', () => {
  assert.equal(
    normalizeCourseLabel('1.º 2.ª Computación'),
    normalizeCourseLabel('1° 2° Computación')
  );
});
