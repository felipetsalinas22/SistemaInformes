# Manual Técnico: Sistema de Informes de Convivencia ET N° 35

## 1. Visión General

El sistema es una aplicación full-stack para la gestión de informes de convivencia estudiantil en la **Escuela Técnica N° 35 D.E. 18 "Ing. Eduardo Latzina"**. Está compuesto por:

- **Frontend**: HTML (`index.html`), CSS incrustado, JavaScript modular (`js/app.js`, `js/api.js`, `js/pdf.js`)
- **Backend**: Node.js 20+ con Express, PostgreSQL como base de datos
- **Arquitectura**: API REST con tokens CSRF, sesiones httpOnly y permisos centralizados en el servidor

> **Principio de diseño**: El frontend solo muestra lo que el servidor autoriza. Los permisos y validaciones viven exclusivamente en el backend (`server/permissions.js`, `server/routes/`).

---

## 2. Estructura del Proyecto

```
SistemaInformes-main/
├─ .env                              # Configuración (NODE_ENV, DB, origins)
├─ .env.example                      # Plantilla de variables
├─ index.html                        # UI completa (HTML + CSS incrustado)
├─ package.json                      # Dependencias y scripts
├─ iniciar-publico.ps1 / .cmd        # Script para iniciar túnel Cloudflare + servidor
├─ detener-publico.ps1 / .cmd        # Script para detener todo
├─ db/
│  ├─ migrations/
│  │  ├─ 001_init.sql                # Esquema base (roles, cursos, alumnos, usuarios, informes, notificaciones, auditoría, sesiones)
│  │  ├─ 002_report_snapshot.sql     # Instantánea histórica de curso/nombre/DNI en cada informe
│  │  ├─ 002_director_signature_image.sql # Firma del director como data URL
│  │  ├─ 003_notification_reads.sql  # Campo read_at + índice de no-leídos
│  │  ├─ 004_pat_function.sql        # PAT como función asignable a docentes
│  │  ├─ 005_pat_guards_and_deadline_settings.sql # Guardas PAT y plazos
│  │  ├─ 006_manager_role_and_deadline_tracking.sql # Gerente y vencimientos
│  │  ├─ 007_institutional_courses_and_accounts.sql # Especialidades y cuentas institucionales
│  │  └─ 008_language_cleanup.sql    # Limpieza de textos históricos
│  └─ schema_posts/                  # (no existe; las migraciones suben sobre el existente)
├─ server/
│  ├─ app.js                         # Configuración de Express (middleware, rutas, CORS, seguridad)
│  ├─ auth.js                        # Middleware de sesión, origen, CSRF, destrucción de cookies
│  ├─ config.js                      # Configuración centralizada (orígenes, SSL, sesión, proxy)
│  ├─ db.js                          # Pool de conexiones pg
│  ├─ lib/
│  │  ├─ audit.js                    # Registro de auditoría en tabla audit_log
│  │  ├─ http.js                      # Clases de error API (ApiError)
│  │  ├─ notifications.js            # Inserción y listado de notificaciones
│  │  ├─ password.js                  # Hash scrypt, verificación, generación de tokens
│  │  ├─ scope.js                     # Ámbitos SQL reutilizables (por curso, por alumno)
│  │  ├─ severity.js                 # Severidades activas vs retiradas (SUSPENSO solo histórico)
│  │  └─ validate.js                 # Schemas Zod para validación de cuerpo
│  ├─ routes/
│  │  ├─ auth.js                     # Login, logout, cambio de contraseña, config
│  │  ├─ meta.js                     # Roles, cursos, parámetros del sistema
│  │  ├─ reports.js                   # CRUD de informes (crear, editar, anular, revertir)
│  │  ├─ students.js                 # CRUD + import CSV de alumnos
│  │  ├─ users.js                    # Gestión de usuarios (admin-only)
│  │  ├─ courses.js                 # Gestión de cursos (admin-only)
│  │  ├─ notifications.js            # Listado/marcar-leído de notificaciones (siempre scoped al usuario)
│  │  ├─ settings.js                 # Configuración institucional (admin-only)
│  │  └─ audit.js                     # Consulta de auditoría (admin-only)
│  └─ scripts/
     ├─ create-admin.js             # Creación del primer usuario administrador
     ├─ migrate.js                    # Aplicador de migraciones SQL
     └─ seed.js                       # Carga de datos institucionales de prueba (roles, cursos, alumnos, usuarios)
├─ js/
│  ├─ api.js                         # Cliente HTTP fetch (csrf, sesión, métodos GET/POST/PATCH/DELETE)
│  ├─ app.js                         # Aplicación completa: sesión, navegación, formularios, reportes, alumnos, admin
│  └─ pdf.js                         # Generación de PDFs con jsPDF (sin CDN)
├─ tests/
│  └─ permissions.test.js            # Tests de regresión de permisos y severidad
└─ docs/
   └─ DESPLIEGUE.md                  # Instrucciones de despliegue
```

---

## 3. Flujo de Datos y Arquitectura

### 3.1 Autenticación y Sesiones

1. **Login** (`POST /api/auth/login`): Valida email/contraseña contra PostgreSQL. Si es exitoso:
   - Genera un token CSRF y un session token (hash sha256).
   - Establece una cookie `et35_sid` con `HttpOnly`, `SameSite=lax` y `Secure` solo en HTTPS.
   - Devuelve al frontend: `user`, `permissions` (desde `buildPermissions`) y `csrfToken`.

2. **Sesión** (`GET /api/auth/me`): Verifica la cookie `et35_sid` contra la tabla `sessions`. Si es válida, carga los datos del usuario y sus asignaciones (cursos, alumnos a cargo, scope_all).

3. **Logout** (`POST /api/auth/logout`): Destruye la sesión en la base de datos y limpia la cookie.

> **Cookies**: `secure: config.isProduction || Boolean(secureRequest)`. En HTTP local no son `Secure`; en producción (TryCloudflare con HTTPS) sí lo son.

### 3.2 Permisos y Validación

Todos los permisos se calculan en el backend y se envían al frontend al login. El frontend **nunca** toma decisiones de seguridad por sí mismo.

Funciones clave en `server/permissions.js`:

| Función | Descripción |
|---|---|
| `canCreateReports(user)` | Solo ADMIN, PROFESOR, PRECEPTOR, directivos o usuarios con cursos asignados |
| `canViewReport(user, report)` | Lógica compleja: admin ve todo; profesor solo los suyos; tutor los de sus alumnos; estudiante solo el suyo |
| `editableFields(user, report)` | Cuáles campos puede modificar según rol y etapa (etapa `descargo`, `consejos`, `dictamen`, `notificado`) |
| `canAnnullReport(user, report)` | Solo directivos del ámbito |
| `hasGlobalScope(user)` | Admin o dirección con `scope_all`; **nunca** un profesor con scope_all |

> **Regla de oro**: `scope_all` solo amplía el ámbito para roles de dirección y consulta. Un profesor con `scope_all` **nunca** obtiene acceso global.

### 3.3 Flujo de un Informe

1. **Crear** (`POST /reports`):
   - Schema Zod: `student_id`, `reason` (mín. 3 chars), `description` (mín. 10), `issue_date`, `severity` (solo `LEVE`, `GRAVE`, `MUY GRAVE`).
   - El servidor rechaza `SUSPENSO` para nuevos informes.
   - Se calcula `statement_deadline` = `issue_date + statement_days * 1 day + 23h59m`.
   - Se envían notificaciones automáticas a familia, cuerpo docente y autoridades.

2. **Editar** (`PATCH /reports/:id`):
   - Valida que el informe esté en etapa `Pendiente`.
   - Verifica `editableFields(user, row)` para permitir/denegar campos.
   - `SUSPENSO` está **deshabilitado** en edición; si el informe ya lo tiene, se muestra como `Advertencia (histórico)` pero no se puede asignar nuevo.
   - Campos de dictamen (`council_notes`, `severity`, `director_date`, `director_signature_image`) solo son editables en etapas `descargo` o `consejos`.

3. **Etapas (workflow)**:
   - `descargo` → `consejos` (cuando el alumno presenta su descargo).
   - `consejos` → `dictamen` (cuándo autoridad emite dictamen; requiere `director_date` y firma).
   - `dictamen` → `notificado` (marca el informe como resuelto y envía notificaciones).

4. **Anulación** (`POST /reports/:id/annul`): Solo directivos del ámbito; conserva historial.

---

## 4. Base de Datos (PostgreSQL)

### 4.1 Tablas Principales

| Tabla | Propósito |
|---|---|
| `roles` | Catálogo de roles (ADMINISTRADOR, GERENTE, RECTOR, PROFESOR, PRECEPTOR, DOE, SECRETARIA, ASESORIA, ALUMNO, TUTOR, etc.). `PAT` fue retirado como rol de cuenta |
| `users` | Usuarios del sistema (email, password_hash scrypt, role_id, student_id, scope_all, is_active) |
| `students` | Alumnos (first_name, last_name, dni, legajo, course_id, is_active, guardian_email) |
| `courses` | Cursos (1.°-6.°, divisiones 1.°-3.°; 1.°-3.° Ciclo Básico; 4.°-6.° Computación o Automotores) |
| `reports` | Informes de convivencia (estatus `Pendiente/Resuelto/Anulado`, stage `descargo/consejos/dictamen/notificado`, severity) |
| `report_history` | Historial de cambios por informe (quién, cuándo, acción, descripción) |
| `notifications` | Avisos internos (tipo, mensaje, leído mediante `read_at`, scoped por `recipient_user_id`) |
| `audit_log` | Registro de todas las acciones del sistema (actor, acción, entidad, detalle, IP) |
| `sessions` | Tokens de sesión (hash sha256, user_id, csrf_token, expires_at) |
| `user_courses` | Cursos asignados a cada usuario (ámbito de profesor/preceptor/DOE) |
| `pat_assignments` | Función PAT asignada a docentes sobre cursos concretos (consulta y notificaciones, sin edición) |
| `tutor_students` | Vinculación tutor ↔ alumnos |

### 4.2 Migraciones Aplicadas

| Archivo | Cambio |
|---|---|
| `001_init.sql` | Esquema base + roles + tipos ENUM (status, stage, severity_level) |
| `002_report_snapshot.sql` | Columnas `student_course_id`, `student_first_name`, etc. en `reports` para instantánea histórica |
| `002_director_signature_image.sql` | Columna `director_signature_image` (data URL PNG) |
| `003_notification_reads.sql` | `notifications.read_at`, índice `notifications_unread_idx`, default `severity = 'LEVE'` en reports |
| `004_pat_function.sql` | Tabla `pat_assignments` y conversión de cuentas PAT históricas a profesores con función |
| `005_pat_guards_and_deadline_settings.sql` | Trigger que impide asignar PAT a no docentes, índice de tutores y parámetros de plazos |
| `006_manager_role_and_deadline_tracking.sql` | Rol GERENTE, retiro del rol PAT vacío, marcas `deadline_expired_at`/`deadline_notified_at` e índice de plazos abiertos |

---

## 5. Frontend (JavaScript)

### 5.1 `js/app.js` (aplicación principal)

Es un IIFE (Inmediately Invoked Function Expression) que gestiona:

- **Sesión**: `boot()` → `api.config()` → `api.me()` → `startSession()`.
- **Navegación**: `showSection('informes')`, `showAdminTab('usuarios')`, etc.
- **Reportes**: `renderReports()`, `renderStageQueues()`, `renderWorkflow()`, `handleReportAction()`.
- **Alumnos**: `setupStudentPicker()` (búsqueda combinable, click-to-select, clear), `renderStudents()`, `showStudentDetail()`.
- **Administración**: Usuarios, alumnos, cursos, configuración, auditoría, importación CSV.
- **Modales**: Abrir/cerrar, renderizar formularios de creación/edición.
- **Firma manuscrita**: `setupSignaturePad()` usando canvas.
- **Password show/hide**: `enhancePasswordToggles()`.
- **Notificaciones**: `renderNotifications()`, `startNotificationPolling()`, `markNotificationsRead()`.

> **Principio UI**: Cada sección se muestra/oculta con `classList.toggle('visible')`. Los controles que no corresponden al rol se ocultan (`$('#nav-admin')?.classList.toggle('hidden', !hasAdminAccess())`).

### 5.2 `js/api.js` (cliente HTTP)

- Base `/api${path}` con `credentials: 'same-origin'`.
- CSRF token en header `X-CSRF-Token` para métodos POST/PATCH/DELETE.
- Manejo de errores: lanza `ApiError` con código y mensaje.
- Métodos: `get`, `post`, `patch`, `del`.
- Endpoints: auth, reports, students, users, courses, notifications, settings, audit.

### 5.3 `js/pdf.js` (generación de PDFs)

- Usa **jsPDF** empaquetado localmente (no CDN).
- Dos funciones: `report()` (PDF de un informe) y `studentHistory()` (legajo PDF).
- Solo incluye campos que el servidor autorizó para el usuario actual.
- Firmas director como imágenes incrustadas.
- Cabecera institucional fija (Escuela Técnica N° 35 D.E. 18, Ing. Eduardo Latzina).
- Diseño compacto a una página para informes dictaminados con texto realista; textos extremos se reparten en páginas adicionales sin salirse del papel.

### 5.4 `index.html` (marco y estilos)

- CSS incrustado con variables institucionales (colores del escudo).
- Estructura de secciones (`app-section visible/hidden`).
- Sidebar fijo, header brand, navegación por pestañas.
- Modales con `role="dialog"`.
- Íconos SVG para toggles de contraseña, firma, etc.
- Barra de notificación con contador `nav-notif-count`.

---

## 6. API Routes (Resumen)

| Ruta | Método | Descripción |
|---|---|---|
| `/api/auth/login` | POST | Autenticación |
| `/api/auth/logout` | POST | Cerrar sesión |
| `/api/auth/me` | GET | Datos de sesión actual |
| `/api/auth/change-password` | POST | Cambiar contraseña |
| `/api/auth/config` | GET | Configuración del entorno |
| `/api/meta` | GET | Roles, cursos, parámetros |
| `/api/reports` | GET | Listado con filtros (status, severity, stage, q, curso, estudiante, emisor) |
| `/api/reports/:id` | GET | Detalle de un informe |
| `/api/reports` | POST | Crear informe |
| `/api/reports/:id` | PATCH | Actualizar campos autorizados |
| `/api/reports/:id/annul` | POST | Anular informe |
| `/api/reports/:id/revert` | POST | Revertir anulación |
| `/api/students` | GET | Listado con filtros y conteos de informes |
| `/api/students/:id` | GET | Ficha de alumno |
| `/api/students` | POST | Crear alumno |
| `/api/students/:id` | PATCH | Actualizar alumno |
| `/api/students/:id` | DELETE | Baja lógica (is_active=FALSE) o permanente |
| `/api/students/import` | POST | Importar CSV |
| `/api/users` | GET | Listado admin |
| `/api/users` | POST | Crear usuario |
| `/api/users/:id` | PATCH | Actualizar usuario |
| `/api/users/:id/reset-password` | POST | Resetear contraseña |
| `/api/courses` | GET/POST/DELETE | Gestión de cursos |
| `/api/settings` | GET/PATCH | Parámetros institucionales |
| `/api/audit` | GET | Registro de auditoría |
| `/api/notifications` | GET/Listado, POST/marcar-leído | Siempre scoped al usuario autenticado |

---

## 7. Seguridad

### 7.1 Autenticación

- Passwords con **scrypt** (N=32768, r=8, p=1).
- Bloqueo de cuenta después de 5 intentos fallidos (15 min).
- Rate limiting: 12 intentos/login window de 15 min; 600 requests window de 15 min.

### 7.2 Autorización

- CSRF token requerido en todas las escrituras.
- Origin check: solo se aceptan orígenes listados en `APP_ORIGIN` (del `.env`).
- Cada endpoint verifica `req.user` y los permisos correspondientes.
- Los datos nunca se exponen si el usuario no tiene permiso (filtering en SQL + frontend).

### 7.3 Cookie & HTTPS

- `setSessionCookie(res, token, expiresAt, secureRequest)`:
  - `httpOnly: true`
  - `secure: config.isProduction || Boolean(secureRequest)` → `true` en HTTPS, `false` en HTTP local.
  - `sameSite: 'lax'`
  - `path: '/'`
  - `expires: expiresAt` (8 horas por defecto).

### 7.4 Content Security

- Helmet.js con CSP restrictiva (`defaultSrc: ["'self'"]`, `scriptSrc: ["'self'"]`, `styleSrc: ["'self'", "'unsafe-inline'"]`).
- `x-powered-by` desactivado.
- En producción: HSTS `maxAge: 15552000`.

---

## 8. Despliegue y Operaciones

### 8.1 Prerrequisitos

- **Node.js >= 20**
- **PostgreSQL** con base `sistema_informes` y usuario `sistema_informes` / contraseña del `.env`.
- **Cloudflare Cloudflared** para túnel público (opcional).
- **Dominio** (opcional, para hostname fijo).

### 8.2 Instalación Local

```bash
# 1. Clonar o copiar la carpeta
cd /ruta/a/SistemaInformes-main

# 2. Variables de entorno
cp .env.example .env
# Editar .env con:
#   DATABASE_URL=postgres://sistema_informes:CLAVE@localhost:5432/sistema_informes
#   APP_ORIGIN=http://localhost:3000  (o las IPs de la red local)

# 3. Instalar dependencias
npm install

# 4. Ejecutar migraciones (solo primera vez o al agregar nuevas)
npm run db:migrate

# 5. Cargar datos institucionales de prueba (solo si no hay usuarios)
npm run db:seed

# 6. Iniciar servidor
npm start
# O en desarrollo con auto-reload:
npm run dev
```

### 8.3 Túnel Público (TryCloudflare)

Script `iniciar-publico.ps1`:

1. Mata procesos previos de `cloudflared.exe` y `node.exe`.
2. Crea túnel: `cloudflared tunnel --url http://localhost:3000`.
3. Espera a que la URL sea asignada (hasta 40 seg).
4. Actualiza `.env` con `APP_ORIGIN` de la nueva URL.
5. Arranca `node server/server.js`.
6. Health check `GET /api/health` → `{ok: true, db: 'up'}`.

Para detener: `detener-publico.ps1` (mata `cloudflared` y `node`).

> **Nota**: La URL de TryCloudflare cambia cada vez que se reinicia el túnel. El script actualiza `.env` automáticamente. Si se necesita un hostname estable, se requiere un dominio propio y túnel nombrado.

### 8.4 HTTPS y Cookies Seguras

- Cuando el túnel funciona sobre HTTPS, las cookies vienen con `Secure+HttpOnly`.
- En HTTP local, las cookies funcionan sin `Secure` (para desarrollo).
- El script `autenticar-publico.ps1` (no mostrado pero referenciado) marca cookies `Secure` cuando el request llega por HTTPS.

### 8.5 Vencimientos automáticos

- `server/lib/deadlines.js` corre dentro del proceso del servidor, sin depender de que haya una pestaña abierta.
- Frecuencia: variable `DEADLINE_SCAN_MINUTES` (por defecto 5 minutos).
- Cada informe abierto con `statement_deadline < now()` se marca con `deadline_expired_at` una sola vez y dispara notificación persistida a familia, personal del curso y creador (`notifyDeadlineExpired`).
- `extend-statement` limpia `deadline_expired_at` y `deadline_notified_at` para que el nuevo plazo vuelva a contar.
- Estados expuestos al frontend: `pendiente`, `proximo`, `vencido`, `completado`; el filtro `?deadline=vencido` consulta directamente PostgreSQL.
- Parámetros configurables en Administración: `statement_days`, `statement_max_days`, `statement_max_length`, `deadline_warning_hours`.

---

## 9. Testing

- `npm test` → ejecuta `node --test` (tests en modo native ESM).
- `npm run check` → valida sintaxis de todos los archivos JS (`node --check`).
- Tests de permisos en `tests/permissions.test.js` cubren:
  - Validación de severidad (`SUSPENSO` no offerto en creación/filters/edición).
  - Permisos por rol (administrador, gerente, profesor con/sin función PAT, preceptor, DOE, secretario, alumno, tutor).
  - Lectura/edición de campos según etapa.
  - Reglas de anulación y reversión.

> **Cobertura**: 7 tests de permisos passing; integración API final 45 checks con 0 fallos (login por rol, gerente, asignación/quita PAT, restricciones PAT, vencimientos, prórroga, contador y configuración). Prueba adicional de PDF: breve y realista en 1 página; texto extremo se reparte sin perder contenido.

---

## 10. Decisiones de Diseño Notables

1. **Permisos server-side only**: El frontend oculta acciones pero la validación final siempre es en el backend. Nunca confiar en el cliente.

2. **SUSPENSO como valor histórico**: Se conserva en registros antiguos pero está **deshabilitado** para nuevos informes y filtros. `ACTIVE_SEVERITIES = ['LEVE', 'GRAVE', 'MUY GRAVE']`.

3. **Notificaciones scoped**: Cada usuario solo ve sus propios avisos (`recipient_user_id`). La administración no ve avisos de terceros en su lista personal.

4. **Instantánea histórica**: Las columnas `student_course_id`, `student_first_name`, etc. en `reports` aseguran que si un alumno cambia de curso, los informes anteriores conservan los datos con los que se emitieron.

5. **Etapas en lugar de páginas duplicadas**: El workflow es lineal (`descargo` → `consejos` → `dictamen` → `notificado`) usando filtros y colas clickeables, no páginas separadas por etapa.

6. **Password show/hide que preserva selección**: `enhancePasswordToggles()` en `app.js` guarda `selectionStart`/`selectionEnd` y los Restaura después de cambiar el tipo de input.

7. **Search student combobox**: Soporta typing, resultados clickables, nombre seleccionado visible, ID retenido en input hidden, y limpieza del ID y el texto cuando el usuario vuelve a escribir.

8. **Search icon overlap fix**: CSS `.admin-toolbar .search-box input { padding-left: 32px; }` deja 6px de separación entre el icono y el texto en la toolbar de administración.

9. **Public alias `/SistemaDeInformes`**: Redirección 302 desde `/SistemaDeInformes` a `/`. El hostname de TryCloudflare es aleatorio; la ruta es estable.

10. **Sin registro público**: Las cuentas las crea exclusivamente un administrador mediante `POST /api/users` o `create-admin.js`.

---

## 11. Próximos Pasos y Consideraciones

- **Dominio propio**: Si se quiere hostname estable, configurar túnel named con dominio (ej. `informes.et35.edu.ar`).
- **Anonimización de datos**: La base contiene nombres/DNI reales; para entornos no productivos usar datos de prueba.
- **Backup y recuperación**: Las migraciones son idempotentes; `npm run db:migrate` puede ejecutarse varias veces.
- **Contraseña inicial**: las cuentas nuevas ingresan con `123`; `ALLOW_INITIAL_PASSWORD=true` permite continuar con esa clave y cambiarla después desde Mi cuenta.
- **Auditoría activa**: Toda acción del usuario se registra en `audit_log` (actor, acción, entidad, detalle, IP).
- **No se borra información**: Informes solo se anulan; alumnos solo se dan de baja lógicamente (`is_active = FALSE`).

---

## 12. Cuentas institucionales de acceso inicial

Todas las cuentas nuevas usan la contraseña inicial `123`. Se solicita el cambio desde **Mi cuenta**, sin bloquear el ingreso:

| Perfil | Correo | Observaciones |
|---|---|---|
| Administración | `admin@latzina.edu.ar` | Gestión total |
| Gerencia | `gerente@latzina.edu.ar` | Usuarios, PAT, vencidos y configuración |
| Docencia con PAT | `prof.laura.gomez@latzina.edu.ar` | Función PAT en 6.° 2.° y 1.° 3.° |
| Alumnado | `camila.garcia@latzina.edu.ar` | Descargos propios |
| Rectorado | `rector@latzina.edu.ar` | Firma institucional |
| Regencia | `regente@latzina.edu.ar` | Firma institucional |
| Preceptoría | `preceptoria@latzina.edu.ar` | Seguimiento por curso |
| Cuentas históricas | `*.institucional@latzina.edu.ar` | Conservan sus contraseñas originales |

---
*Documento actualizado el 25 de noviembre de 2026. Basado en el código fuente del repositorio `SistemaInformes` versión 4.0.0.*