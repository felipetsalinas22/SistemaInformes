# Manual de usuario — Sistema de Informes de Convivencia

Escuela Técnica N.º 35 D.E. 18 “Ing. Eduardo Latzina”

## 1. Ingreso

1. Abra `http://localhost:3000/SistemaDeInformes` o la dirección pública informada por la escuela.
2. Ingrese con su correo institucional `@latzina.edu.ar`. Las familias/tutores también pueden ingresar con el correo externo que tengan registrado (por ejemplo `@gmail.com`), siempre que la administración lo haya vinculado a sus alumnos.
3. Si es la primera vez, el sistema le recomienda cambiar la clave inicial `123`. Puede hacerlo en el momento o elegir **Hacerlo más tarde** y cambiarla después desde **Mi cuenta**. El diálogo tiene además un botón ✕ para cerrarlo.

> No comparta su contraseña. Las cuentas las crea solamente la administración.

## 2. Perfiles y permisos

| Perfil | Qué puede hacer |
|---|---|
| Administración / Gerencia | Gestión de usuarios, alumnos, cursos, configuración, vencidos y auditoría |
| Docente | Crear y editar sus propios informes |
| Docente con función PAT | Consultar informes asignados y recibir notificaciones; **no** edita ni dictamina por ser PAT |
| Preceptoría / Regencia / Rectorado | Seguimiento, observaciones y firma según su ámbito |
| Alumno / Familia | Ver informes propios y presentar el descargo dentro del plazo |

La función PAT se asigna o se quita desde **Administración → Usuarios**. No es un rol de cuenta: un docente PAT mantiene su rol docente y recibe esta responsabilidad adicional. En la barra superior aparece el distintivo **PAT** y, en el detalle del informe, un bloque amarillo explica su intervención y nombra al docente responsable del curso. El PAT acompaña y hace seguimiento; no dictamina ni modifica el informe.

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

Se notifican, entre otros: creación de informe, descargo presentado, dictamen y vencimiento del plazo. Cada aviso indica el estado real del correo: **Notificado/a** cuando la entrega fue confirmada, **En proceso** mientras se intenta el envío (por ejemplo, si aún no se configuró SMTP) o **Error de envío** si el servidor de correo rechazó el mensaje. El detalle del informe usa los mismos estados en lugar de un simple «Sí/No».

## 6. Alumnos

En **Alumnos** puede:

- Buscar por nombre, apellido, DNI o legajo.
- **Filtrar por un curso específico** con el selector *Filtrar alumnos por curso*.
- Ordenar por apellido, curso y división o cantidad de informes.
- Abrir la ficha y descargar el legajo en PDF.
- Importar una lista desde **Importar CSV** si se cuenta con administración. Un CSV es un archivo de texto con columnas separadas por comas que se abre como planilla en Excel, Sheets o LibreOffice; las columnas requeridas son `nombres, apellidos, dni, curso` y las opcionales `legajo, email, email_tutor, nacimiento`. Guárdelo como **CSV UTF-8**. La herramienta valida las filas antes de guardarlas; es para **importar** alumnos, no para exportarlos.

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

El botón **PDF** genera el informe o el legajo del alumno. El informe se arma para **una sola página A4**, con más espacio entre secciones y un recuadro reservado para las firmas. Si el historial es muy extenso, se resumen los últimos eventos que caben y se indica que el historial completo está disponible en el sistema. Las fechas con `a.m./p.m.` se mantienen unidas para que no se partan entre renglones.

## 9. Contraseña

Desde **Mi cuenta → Cambiar contraseña** se actualiza sólo la clave del usuario, sin modificar sus datos ni permisos. La nueva clave debe tener al menos 10 caracteres, una letra, un número y un símbolo.

---
*Documento actualizado el 25 de noviembre de 2026.*
