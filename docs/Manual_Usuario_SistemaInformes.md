# Manual de usuario — Sistema de Informes de Convivencia

Escuela Técnica N.º 35 D.E. 18 “Ing. Eduardo Latzina”

## 1. Ingreso

1. Abra `http://localhost:3000/SistemaDeInformes` o la dirección pública informada por la escuela.
2. Ingrese con su correo institucional `@latzina.edu.ar` y la contraseña entregada.
3. Si es la primera vez, el sistema le pedirá cambiar la clave. Puede continuar con la contraseña inicial y cambiarla después desde **Mi cuenta**.

> No comparta su contraseña. Las cuentas las crea solamente la administración.

## 2. Perfiles y permisos

| Perfil | Qué puede hacer |
|---|---|
| Administración / Gerencia | Gestión de usuarios, alumnos, cursos, configuración, vencidos y auditoría |
| Docente | Crear y editar sus propios informes |
| Docente con función PAT | Consultar informes asignados y recibir notificaciones; **no** edita ni dictamina por ser PAT |
| Preceptoría / Regencia / Rectorado | Seguimiento, observaciones y firma según su ámbito |
| Alumno / Familia | Ver informes propios y presentar el descargo dentro del plazo |

La función PAT se asigna o se quita desde **Administración → Usuarios**. No es un rol de cuenta.

## 3. Informes

El circuito es lineal:

**Descargo → Consejos → Dictamen → Notificado**

En **Informes** puede filtrar por búsqueda, curso, gravedad, etapa y vencimiento. Las pestañas de etapa muestran las colas de trabajo; no hay páginas duplicadas por etapa.

### Crear un informe

1. Botón **＋ Nuevo informe**.
2. Buscar el alumno por nombre, apellido o DNI.
3. Completar motivo, descripción y clasificación: *Leve*, *Grave* o *Muy grave*.
4. Guardar. El sistema notifica a los destinatarios según el rol y el curso.

### Editar y dictaminar

Mientras el informe esté pendiente, el creador puede corregir los datos de creación. Las etapas posteriores son exclusivas de cada responsable. La autoridad firmante dibuja la firma en el recuadro y guarda la fecha de dictamen; el PDF se descarga automáticamente al finalizar.

## 4. Descargo del alumno

Cada informe tiene una fecha y hora límite visible en el detalle. El alumno puede responder hasta esa hora.

- Si faltan menos horas de las configuradas, el plazo aparece como **Próximo a vencer**.
- Vencido el plazo, el descargo se bloquea. Sólo la administración puede prorrogarlo.
- El campo de descargo muestra un contador dinámico: `cantidad / 5000 caracteres · quedan …`.
- Al acercarse al límite el contador se pone amarillo y, en el límite, rojo. El servidor rechaza textos de más de 5000 caracteres.

## 5. Notificaciones

El ícono **Notificaciones** muestra sólo los avisos sin leer. Cada aviso puede marcarse como leído individualmente o todos juntos. El historial se conserva. Los avisos son privados por destinatario.

Se notifican, entre otros: creación de informe, descargo presentado, dictamen y vencimiento del plazo.

## 6. Alumnos

En **Alumnos** puede:

- Buscar por nombre, apellido, DNI o legajo.
- **Filtrar por un curso específico** con el selector *Filtrar alumnos por curso*.
- Ordenar por apellido, curso y división o cantidad de informes.
- Abrir la ficha y descargar el legajo en PDF.

Los cursos activos son 1.° a 6.° año, divisiones 1.° a 3.°. En 1.° a 3.° año se cursa **Ciclo Básico**; en 4.° a 6.° año las especialidades son **Computación** y **Automotores**.

## 7. Configuración (Administración y Gerencia)

| Parámetro | Significado |
|---|---|
| `statement_days` | Días para responder el descargo |
| `statement_max_days` | Máximo de días de una prórroga |
| `statement_max_length` | Máximo de caracteres del descargo |
| `deadline_warning_hours` | Anticipación con la que se avisa un vencimiento |

Los vencimientos se calculan automáticamente en el servidor, aunque nadie tenga la página abierta.

## 8. PDF

El botón **PDF** genera el informe o el legajo del alumno. Los informes dictaminados se imprimen en una sola página cuando el texto es de extensión normal; los textos muy largos se reparten en páginas adicionales sin perder firmas ni contenido.

## 9. Contraseña

Desde **Mi cuenta → Cambiar contraseña** se actualiza sólo la clave del usuario, sin modificar sus datos ni permisos. La nueva clave debe tener al menos 10 caracteres, una letra, un número y un símbolo.

---
*Documento actualizado el 25 de noviembre de 2026.*
