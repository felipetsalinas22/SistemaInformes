// Nombres usados por los datos de demostración. Se centralizan para que el
// seed y la regularización de la nómina usen exactamente el mismo criterio:
// nombres y apellidos argentinos variados, sin repetir un nombre completo.

const RAW_NAMES = `
Mateo Rodríguez
Santiago Fernández
Thiago González
Benjamín López
Joaquín Martínez
Lucas García
Bautista Pérez
Tomás Sánchez
Valentino Romero
Felipe Díaz
Nicolás Torres
Lautaro Álvarez
Franco Ruiz
Agustín Acosta
Juan Ignacio Gómez
Facundo Castro
Bruno Herrera
Máximo Medina
Simón Suárez
Valentín Domínguez
Emiliano Molina
Ignacio Silva
Gonzalo Rojas
Luciano Cabrera
Ramiro Navarro
Benicio Ortiz
Julián Giménez
Salvador Peralta
Damián Flores
Ezequiel Aguirre
Martín Vega
Federico Sosa
Alan Benítez
Gabriel Correa
Joaquín Ponce
Matías Luna
Kevin Carrizo
Axel Morales
Dylan Figueroa
Iñaki Pereyra
Camila Rodríguez
Valentina Fernández
Martina González
Sofía López
Isabella Martínez
Emilia García
Olivia Pérez
Catalina Sánchez
Julieta Romero
Morena Díaz
Mía Torres
Delfina Álvarez
Agustina Ruiz
Victoria Acosta
Lucía Gómez
Paula Castro
Abril Herrera
Renata Medina
Josefina Suárez
Antonella Domínguez
Florencia Molina
Milagros Silva
Malena Rojas
Guadalupe Cabrera
Alma Navarro
Bianca Ortiz
Clara Giménez
Aitana Peralta
Zoe Flores
Rocío Aguirre
Candela Vega
Lara Sosa
Juliana Benítez
Nicole Correa
Kiara Ponce
Evelyn Luna
Jazmín Carrizo
Aylén Morales
Brenda Figueroa
Morena Pereyra
Manuel Roldán
Pedro Villalba
Esteban Núñez
Leandro Márquez
Rodrigo Ibarra
Sebastián Vázquez
Cristian Quiroga
Nahuel Maldonado
Mauro Escobar
Gonzalo Farías
Mariano Godoy
Diego Miranda
Pablo Ríos
Ariel Soto
Iván Toledo
Enzo Cáceres
Lorenzo Bustos
Ciro Arias
Elías Bravo
Dante Ocampo
Milena Roldán
Victoria Villalba
Carolina Núñez
Rocío Márquez
Lourdes Ibarra
Celeste Vázquez
Daniela Quiroga
Melina Maldonado
Karen Escobar
Micaela Farías
Nadia Godoy
Antonella Miranda
Belén Ríos
Natalia Soto
Romina Toledo
Ayelén Cáceres
Pilar Bustos
Zoe Arias
Sol Bravo
Maite Ocampo
Juan Cruz Roldán
Lucas Villalba
Thiago Núñez
Benjamín Márquez
Mateo Ibarra
Santiago Vázquez
Joaquín Quiroga
Tomás Maldonado
Franco Escobar
Bautista Farías
Lautaro Godoy
Nicolás Miranda
Valentín Ríos
Facundo Soto
Agustín Toledo
Bruno Cáceres
Máximo Bustos
Simón Arias
Emiliano Bravo
Ignacio Ocampo
Camila Roldán
Martina Villalba
Sofía Núñez
Valentina Márquez
Emilia Ibarra
Julieta Vázquez
Isabella Quiroga
Catalina Maldonado
Olivia Escobar
Delfina Farías
Mía Godoy
Lucía Miranda
Agustina Ríos
Josefina Soto
Malena Toledo
Alma Cáceres
Renata Bustos
Clara Arias
Bianca Bravo
Guadalupe Ocampo
Francisco Leiva
Joaquín Colombo
Lisandro Ferrer
Federico Moyano
Andrés Coronel
Ramiro Paredes
Bautista Vera
Mateo Cordero
Nicolás Sarmiento
Tomás Ledesma
Felipe Gallardo
Lautaro Méndez
Franco Valdez
Agustín Benítez
Santiago Olivera
Benicio Suárez
Thiago Mansilla
Valentín Roldán
Bruno Páez
Simón Ferreyra
Camila Leiva
Martina Colombo
Sofía Ferrer
Valentina Moyano
Emilia Coronel
Julieta Paredes
Isabella Vera
Catalina Cordero
Olivia Sarmiento
Delfina Ledesma
Mía Gallardo
Lucía Méndez
Agustina Valdez
Josefina Olivera
Malena Mansilla
Alma Páez
Renata Ferreyra
Clara Leiva
Bianca Colombo
Guadalupe Ferrer
Ezequiel Moyano
Martín Coronel
Alan Paredes
Gabriel Vera
Facundo Cordero
Matías Sarmiento
Kevin Ledesma
Axel Gallardo
Dylan Méndez
Iñaki Valdez
Manuel Olivera
Pedro Mansilla
Esteban Páez
Leandro Ferreyra
Rodrigo Leiva
Sebastián Colombo
Cristian Ferrer
Nahuel Moyano
Mauro Coronel
Mariano Paredes
Milagros Vera
Florencia Cordero
Abril Sarmiento
Antonella Ledesma
Rocío Gallardo
Candela Méndez
Lara Valdez
Juliana Olivera
Nicole Mansilla
Kiara Páez
Evelyn Ferreyra
Jazmín Leiva
Brenda Colombo
Aylén Ferrer
Pilar Moyano
Maite Coronel
Sol Paredes
Celeste Vera
Daniela Cordero
Melina Sarmiento
Juan Manuel Duarte
Lucas Bianchi
Mateo Aguado
Santiago Villagra
Thiago Amaya
Benjamín Escudero
Tomás Arce
Joaquín Andrada
Felipe Pizarro
Lautaro Rivas
Nicolás Barrios
Franco Ojeda
Agustín Tapia
Bautista Godoy
Valentín Rosales
Bruno Cáceres
Simón Villanueva
Máximo Acuña
Emiliano Bustamante
Ignacio Alarcón
Camila Duarte
Martina Bianchi
Valentina Aguado
Sofía Villagra
Emilia Amaya
Isabella Escudero
Julieta Arce
Catalina Andrada
Olivia Pizarro
Delfina Rivas
Mía Barrios
Lucía Ojeda
Agustina Tapia
Josefina Rosales
Malena Villanueva
Alma Acuña
Renata Bustamante
Clara Alarcón
Bianca Duarte
Guadalupe Bianchi
Federico Aguado
Ramiro Villagra
Manuel Amaya
Pedro Escudero
Esteban Arce
Leandro Andrada
Rodrigo Pizarro
Sebastián Rivas
Cristian Barrios
Nahuel Ojeda
Mauro Tapia
Mariano Rosales
Diego Villanueva
Pablo Acuña
Ariel Bustamante
Iván Alarcón
Enzo Duarte
Lorenzo Bianchi
Ciro Aguado
Elías Villagra
Milena Amaya
Carolina Escudero
Lourdes Arce
Nadia Andrada
Belén Pizarro
Natalia Rivas
Romina Barrios
Ayelén Ojeda
Pilar Tapia
Zoe Rosales
Sol Villanueva
Maite Acuña
Celeste Bustamante
Daniela Alarcón
Melina Duarte
Karen Bianchi
Micaela Aguado
Antonella Villagra
Rocío Amaya
Candela Escudero
Juan Pablo Arce
Lucas Andrada
Mateo Pizarro
Santiago Rivas
Thiago Barrios
Benjamín Ojeda
Tomás Tapia
Joaquín Rosales
Felipe Villanueva
Lautaro Acuña
Nicolás Bustamante
Franco Alarcón
Agustín Duarte
Bautista Bianchi
Valentín Aguado
Bruno Villagra
Simón Amaya
Máximo Escudero
Emiliano Arce
Ignacio Andrada
Camila Pizarro
Martina Rivas
Valentina Barrios
Sofía Ojeda
Emilia Tapia
Isabella Rosales
Julieta Villanueva
Catalina Acuña
Olivia Bustamante
Delfina Alarcón
Mía Duarte
Lucía Bianchi
Agustina Aguado
Josefina Villagra
Malena Amaya
Alma Escudero
Renata Arce
Clara Andrada
Bianca Pizarro
Guadalupe Rivas
Francisco Barrios
Joaquín Ojeda
Lisandro Tapia
Federico Rosales
Andrés Villanueva
Ramiro Acuña
Bautista Bustamante
Mateo Alarcón
Nicolás Duarte
Tomás Bianchi
Felipe Aguado
Lautaro Villagra
Franco Amaya
Agustín Escudero
Santiago Arce
Benicio Andrada
Thiago Pizarro
Valentín Rivas
Bruno Barrios
Simón Ojeda
Milagros Tapia
Florencia Rosales
Abril Villanueva
Antonella Acuña
Rocío Bustamante
Candela Alarcón
Lara Duarte
Juliana Bianchi
Nicole Aguado
Kiara Villagra
Evelyn Amaya
Jazmín Escudero
Brenda Arce
Aylén Andrada
Pilar Pizarro
Maite Rivas
Sol Barrios
Celeste Ojeda
Daniela Tapia
Melina Rosales
Juan Ignacio Villanueva
Lucas Acuña
Mateo Bustamante
Santiago Alarcón
Thiago Duarte
Benjamín Bianchi
Tomás Aguado
Joaquín Villagra
Felipe Amaya
Lautaro Escudero
Nicolás Arce
Franco Andrada
Agustín Pizarro
Bautista Rivas
Valentín Barrios
Bruno Ojeda
Simón Tapia
Máximo Rosales
Emiliano Villanueva
Ignacio Acuña
Camila Bustamante
Martina Alarcón
Valentina Duarte
Sofía Bianchi
Emilia Villagra
`.trim();

/** El último token es el apellido; el resto compone el nombre de pila. */
export const DEMO_NAMES = RAW_NAMES.split('\n').map(line => {
  const parts = line.trim().split(/\s+/);
  const last = parts.pop() || '';
  return { first: parts.join(' '), last };
}).filter(item => item.first && item.last);

// Se mantienen estos exports para los nombres de ejemplo de tutores del seed.
export const FIRST_NAMES = DEMO_NAMES.map(item => item.first);
export const LAST_NAMES = DEMO_NAMES.map(item => item.last);

export function normalizeName(name) {
  return String(name || '')
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Devuelve el siguiente nombre completo que todavía no esté reservado.
 * `cursor` se actualiza con el índice devuelto para no revisar combinaciones
 * ya descartadas en llamadas sucesivas.
 */
export function nextGeneratedName(cursor, reservedNames) {
  let index = Math.max(0, Number(cursor) || 0);
  while (index < DEMO_NAMES.length) {
    const item = DEMO_NAMES[index];
    const key = normalizeName(`${item.first} ${item.last}`);
    if (!reservedNames.has(key)) {
      reservedNames.add(key);
      return { first: item.first, last: item.last, cursor: index + 1 };
    }
    index += 1;
  }
  throw new Error('No quedan nombres de demostración disponibles.');
}
