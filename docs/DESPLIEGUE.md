# Documentación técnica y despliegue

Aplicación web para registrar y seguir informes de convivencia de la Escuela Técnica N° 35 D.E. 18.

- Frontend: HTML/CSS/JavaScript.
- Backend: Node.js + Express.
- Base de datos: PostgreSQL (datos persistentes y centralizados).
- Autenticación: sesiones en base de datos, cookie `httpOnly`, CSRF y contraseñas con `scrypt`.
- Roles: administrador, directivos, profesor, preceptor, PAT, DOE, secretaría, asesoría, alumno y tutor.

> El manual de uso para el perfil Profesor/a está en el [README principal](../README.md).

## Datos de demostración

La nómina de alumnos fue restaurada desde el archivo original provisto. Los informes y las cuentas son de demostración.

El administrador puede crear informes y corregir los datos de creación mientras el informe esté pendiente y antes del descargo. No completa el descargo, la preceptoría, el PAT ni el dictamen: esas etapas siguen asignadas a cada rol responsable.

| Rol | Mail | Contraseña |
|---|---|---|
| Administrador | `admin@et35.demo` | `Admin.2026!` |
| Profesor | `profesor@et35.demo` | `Profesor.2026!` |
| Preceptor | `preceptor@et35.demo` | `Preceptor.2026!` |
| PAT | `pat@et35.demo` | `Pat.2026!` |
| Regente | `regente@et35.demo` | `Regente.2026!` |
| Rector | `rector@et35.demo` | `Rector.2026!` |
| Secretaría | `secretaria@et35.demo` | `Secretaria.2026!` |
| Alumno (Guinsburg Mateo) | `alumno@et35.demo` | `Alumno.2026!` |
| Tutor (Guinsburg Mateo) | `tutor@et35.demo` | `Tutor.2026!` |

No se muestra ningún registro público. Las cuentas se crean desde el panel de administración.

## Firma manuscrita y PDF

Al completar el dictamen, los roles directivos ven un recuadro para dibujar la firma con el mouse o el dedo. La firma se guarda en PostgreSQL como imagen PNG junto con el informe y se incluye en la línea de la dirección/autoridad competente del PDF.

La firma es obligatoria para guardar la fecha de dictamen y finalizar el informe. Al finalizar se descarga automáticamente el PDF firmado; también se puede volver a descargar desde el botón **PDF** del detalle o del listado.

## Requisitos

- Node.js 20 o superior.
- PostgreSQL 14 o superior.
- Windows, Linux o macOS.

En esta instalación se probó con Node.js 24 y PostgreSQL 17.

## Configuración

1. Copiar `.env.example` a `.env` si todavía no existe.
2. Completar como mínimo:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://USUARIO:CLAVE@127.0.0.1:5432/sistema_informes
APP_ORIGIN=http://localhost:3000
SESSION_HOURS=8
STATEMENT_DAYS=5
DEMO_MODE=true
TRUST_PROXY=0
```

3. Para permitir el acceso desde otra computadora, agregar las direcciones exactas separadas por coma:

```env
APP_ORIGIN=http://localhost:3000,http://192.168.0.190:3000
```

No agregar una barra `/` al final. Si cambia la IP del servidor, actualizar este valor y reiniciar la aplicación.

## Instalación

Desde la carpeta del proyecto:

```powershell
npm install
npm run db:migrate
npm run db:seed
npm start
```

Para borrar y recrear los datos de demostración:

```powershell
npm run db:reset
```

El servidor queda disponible en `http://localhost:3000`.

## Acceso desde la misma computadora

1. Verificar que PostgreSQL esté iniciado.
2. Abrir PowerShell en la carpeta del proyecto.
3. Ejecutar `npm start`.
4. Abrir `http://localhost:3000` en el navegador.
5. Ingresar con `admin@et35.demo` / `Admin.2026!`.

## Acceso desde otra computadora de la misma red

1. Conectar las dos computadoras a la misma red/WiFi.
2. En la computadora servidor, obtener la IPv4 con `ipconfig`.
   En esta instalación la dirección actual es `192.168.0.190`.
3. Agregar esa dirección a `APP_ORIGIN` en `.env`, por ejemplo:

```env
APP_ORIGIN=http://localhost:3000,http://192.168.0.190:3000
```

4. Reiniciar el servidor con `npm start`.
5. Permitir Node.js o el puerto TCP 3000 en el Firewall de Windows. Si hace falta, ejecutar PowerShell como administrador:

```powershell
New-NetFirewallRule -DisplayName "Sistema Informes 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private,Public
```

6. En la otra computadora abrir:

```text
http://192.168.0.190:3000
```

No usar `localhost` desde la otra computadora: `localhost` apunta a esa computadora, no al servidor.

Para comprobar la conexión desde la otra computadora se puede abrir:

```text
http://192.168.0.190:3000/api/health
```

Debe responder:

```json
{"ok":true,"db":"up"}
```

Si se usa Radmin VPN, conectar ambas computadoras a la misma red de Radmin y abrir la IP de Radmin del servidor. En esta instalación es `http://26.214.26.46:3000`.

## Acceso desde fuera de la red local (sin mismo WiFi)

El sistema no queda publicado en Internet automáticamente. Para usarlo desde las computadoras del colegio sin compartir la misma red hay tres caminos:

### Opción A: Radmin VPN (privada, ya instalada en esta computadora)

1. Instalar Radmin VPN en las computadoras del colegio.
2. Unirlas a la misma red privada de Radmin.
3. En la computadora servidor, verificar la IP de Radmin con `ipconfig`.
   En esta instalación es `26.214.26.46`.
4. Abrir desde el colegio:

```text
http://26.214.26.46:3000
```

La PC personal debe quedar encendida y con `npm start` activo. Algunas redes escolares bloquean VPN; en ese caso usar otra opción.

### Opción B: Cloudflare Tunnel (URL pública temporal, sin instalar nada en el colegio)

Requiere instalar `cloudflared` sólo en la computadora personal:

```powershell
winget install --id Cloudflare.cloudflared
```

Con el servidor Node funcionando, abrir otra terminal y ejecutar:

```powershell
cloudflared tunnel --url http://localhost:3000
```

Cloudflare devuelve una URL parecida a:

```text
https://algo-aleatorio.trycloudflare.com
```

Agregar esa URL exacta a `APP_ORIGIN` en `.env` y reiniciar Node:

```env
APP_ORIGIN=http://localhost:3000,http://26.214.26.46:3000,https://algo-aleatorio.trycloudflare.com
TRUST_PROXY=1
```

Las computadoras del colegio entran con esa URL HTTPS, sin instalación adicional. Limitaciones: la PC personal debe quedar encendida, la URL cambia cada vez que se reinicia el túnel y el túnel rápido no tiene control de acceso propio. Para un uso institucional estable conviene un túnel con nombre y Cloudflare Access, o la opción C.

En este proyecto hay atajos para Windows:

- `iniciar-publico.cmd`: inicia o reinicia el servidor y el túnel, actualiza `APP_ORIGIN` automáticamente y muestra la nueva URL pública.
- `detener-publico.cmd`: detiene el servidor y el túnel.

Los registros quedan en `.runtime/`. Cada vez que se inicia el túnel rápido cambia la URL; hay que usar la que muestra la ventana.

### Opción C: servidor en la nube (recomendada para uso permanente)

Desplegar el backend y PostgreSQL en un servicio con URL fija (por ejemplo, Render, Railway o Fly.io) o en un servidor del colegio con VPN. Ventajas: las computadoras personales pueden apagarse y la URL no cambia. Hay que configurar `DATABASE_URL`, `NODE_ENV=production`, HTTPS, `APP_ORIGIN` con el dominio público y ejecutar las migraciones.

No alcanza con publicar sólo `index.html` en GitHub Pages: el frontend necesita el backend y la base PostgreSQL. En producción usar HTTPS y cambiar `NODE_ENV=production`. No exponer PostgreSQL directamente a Internet.

Antes de publicar datos de menores fuera de la red escolar, revisar autorización, privacidad, control de acceso y respaldos.

## Operación y respaldo

- Los datos se guardan en PostgreSQL, no en el navegador.
- Los informes conservan una instantánea del alumno y del curso al momento de crearse.
- Antes de cargar datos reales, definir consentimiento, acceso, respaldo y política de privacidad.
- Realizar respaldos periódicos de PostgreSQL.
- Cambiar las contraseñas demo antes de cualquier uso institucional.
- No subir `.env` ni respaldos de la base a repositorios públicos.

## Scripts útiles

```powershell
npm run db:migrate   # aplica migraciones pendientes
npm run db:seed      # carga datos demo si la base está vacía
npm run db:reset     # borra y recrea los datos demo
npm run check        # verifica sintaxis del backend y frontend
```

## Estructura

```text
index.html              interfaz
js/api.js               cliente HTTP, CSRF y manejo de errores
js/app.js               lógica de la interfaz y formularios dinámicos
js/pdf.js               exportación PDF local
server/                 API, autenticación, permisos y rutas
db/migrations/          esquema PostgreSQL
server/scripts/seed.js  datos de demostración
```
