# 🏗️ Arquitectura de NexoCRM

Este documento describe la arquitectura general del sistema, las decisiones técnicas tomadas y cómo fluyen la autenticación, los datos y los eventos.

---

## 1. Visión general

NexoCRM es una aplicación **fullstack monolítica** construida sobre Next.js (App Router). Frontend y backend viven en el mismo despliegue: las páginas React consumen una API REST servida por las *route handlers* de `src/app/api/*`, que acceden a la base de datos a través de Prisma.

```
┌────────────────────────────────────────────────────────────┐
│                        Navegador                           │
│   Shell SPA (src/app/page.tsx) + vistas de src/components  │
│   Cliente fetch tipado (src/lib/client.ts)                 │
└──────────────────────────┬─────────────────────────────────┘
                           │ fetch /api/*  (cookie httpOnly)
┌──────────────────────────▼─────────────────────────────────┐
│                   Next.js Route Handlers                   │
│   src/app/api/**/route.ts                                  │
│   ┌────────────┐ ┌──────────────┐ ┌─────────────────────┐  │
│   │ auth.ts    │ │ automations  │ │ weekly-alerts.ts    │  │
│   │ sesión+RBAC│ │ (eventos)    │ │ (cron perezoso)     │  │
│   └────────────┘ └──────────────┘ └─────────────────────┘  │
└──────────────────────────┬─────────────────────────────────┘
                           │ Prisma Client
┌──────────────────────────▼─────────────────────────────────┐
│        SQLite (dev) / PostgreSQL (producción)              │
│        11 modelos — ver docs/modelo-de-datos.md            │
└────────────────────────────────────────────────────────────┘
```

**Principio MVP:** cada capa se mantiene deliberadamente simple. No hay microservicios, colas externas ni servidores de render: toda la lógica de negocio vive en módulos TypeScript puros de `src/lib/`, fáciles de testear y de extraer si el proyecto crece.

---

## 2. Estructura por capas

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Presentación | `src/app/page.tsx`, `src/components/crm/*` | Shell SPA con navegación por vistas (Dashboard, Pipeline, Reportes, …), componentes shadcn/ui, gráficos Recharts y Kanban con dnd-kit |
| Cliente HTTP | `src/lib/client.ts` | Wrapper `fetch` tipado (`api<T>()`), tipos compartidos (`SessionUser`, `ReportData`) y manejo de errores |
| API REST | `src/app/api/**/route.ts` | Validación de sesión/RBAC, validación de payloads, orquestación de casos de uso |
| Dominio | `src/lib/auth.ts`, `automations.ts`, `weekly-alerts.ts`, `report-pdf.ts`, `includes.ts` | Reglas de negocio puras: sesión, RBAC, motor de automatización, alerta semanal, PDF |
| Acceso a datos | `src/lib/db.ts` + `prisma/schema.prisma` | Instancia única de PrismaClient y modelo relacional |

---

## 3. Decisiones técnicas

### 3.1 ¿Monolito Next.js en vez de NestJS/Django + SPA?

El alcance original contemplaba un backend NestJS o Django separado. Se optó por **route handlers de Next.js** porque:

- Un solo despliegue (frontend + API) reduce el coste operativo y la fricción de arranque, alineado con el principio MVP.
- Compartir tipos TypeScript entre API y UI elimina toda una clase de errores de contrato.
- Si el proyecto crece, los módulos de dominio (`src/lib/*`) son agnósticos del transporte y pueden migrarse a un servicio NestJS con cambios mínimos.

### 3.2 SQLite con camino a PostgreSQL

El modelo está definido en Prisma, por lo que el motor es intercambiable. En desarrollo se usa SQLite (cero configuración); la migración a PostgreSQL es cambiar `provider` y la `DATABASE_URL` — ver [despliegue.md](./despliegue.md#4-migración-de-sqlite-a-postgresql). Los campos que en PostgreSQL serían `enum` se modelan como `String` validados en la API, y los JSON como `String` serializado, para mantener compatibilidad entre ambos motores.

### 3.3 Cron perezoso para la alerta semanal

En lugar de exigir un scheduler externo (Redis + worker), la alerta semanal usa un **patrón de cron perezoso**: la primera petición que llega cada semana ISO comprueba si existe la alerta y, si no, la genera. El cerrojo anti-duplicados es la clave única `AlertLog.weekStart` (lunes de la semana): si dos peticiones concurrentes intentan crearla, la segunda falla por constraint único y se ignora. Esto aporta las garantías de un cron sin infraestructura adicional; si se despliega con un scheduler real, basta con llamar a `ensureWeeklyAlert()` periódicamente — ver [automatizaciones-y-alertas.md](./automatizaciones-y-alertas.md).

### 3.4 PDF en el cliente

El informe se exporta con jsPDF + jspdf-autotable directamente en el navegador: no consume recursos de servidor, funciona offline sobre los datos ya cargados y evita un servicio de render (Puppeteer/wkhtmltopdf) en producción.

---

## 4. Autenticación y sesión

```
Login (POST /api/auth/login)
  ├─ 1. Busca el usuario por email
  ├─ 2. verifyPassword(): scrypt(salt aleatorio) + timingSafeEqual
  ├─ 3. createSessionToken(): payload {userId, exp} → base64url
  │     + firma HMAC-SHA256 con AUTH_SECRET
  └─ 4. Set-Cookie: crm_session=<token>; HttpOnly; SameSite=Lax; 7 días

Cada petición a /api/*
  ├─ getSessionUser(): verifica firma + expiración
  ├─ Carga el usuario de la BD (role incluido)
  └─ isManager() / ownershipFilter() aplican el RBAC
```

Detalles clave:

- **Contraseñas**: `scrypt` (keylen 64) con salt aleatoria de 16 bytes, almacenadas como `salt:hash`.
- **Firma HMAC**: el token es `payload.signature`; la verificación usa `crypto.timingSafeEqual` para evitar ataques de temporización.
- **Secreto**: `AUTH_SECRET` del entorno; en desarrollo hay un valor por defecto documentado como inseguro (cámbialo en producción).
- **No hay estado de sesión en servidor**: el token lleva `userId` + expiración y se revalida contra la BD en cada petición (revocación inmediata al eliminar el usuario).

---

## 5. Control de acceso (RBAC)

Tres roles jerárquicos, definidos en `src/lib/auth.ts`:

| Rol | Alcance de datos | Módulos exclusivos |
|---|---|---|
| `ADMIN` | Todo el sistema | Gestión de usuarios, roles y cuotas |
| `SALES_DIRECTOR` | Todo el pipeline y reportes de equipo | Automatizaciones, envío manual de alertas |
| `SALES_REP` | Únicamente los registros donde es propietario (`ownerId`) o responsable (`assignedToId`) | — |

El patrón aplicado en cada endpoint es:

```ts
const me = await getSessionUser();
if (!me) return UNAUTHORIZED();            // 401 sin sesión
if (!isManager(me.role)) return FORBIDDEN(); // 403 según módulo
const ownerId = ownershipFilter(me);        // null = todo, me.id = solo lo suyo
```

El filtrado se aplica **en el servidor**, nunca en el cliente: un comercial que manipule el cliente HTTP sigue recibiendo solo sus datos.

---

## 6. Flujo de eventos (automatizaciones)

Cuando la API muta un negocio (crear, cambiar de etapa, ganar, perder), `src/lib/automations.ts` se invoca tras la escritura:

```
PATCH /api/deals/:id  (stageId cambia)
        │
        ▼
runAutomations({ trigger: "DEAL_STAGE_CHANGED", deal, previousStageName })
        │
        ├─ Busca reglas activas con ese trigger
        ├─ Filtra por triggerStage (si la regla la define)
        ├─ Ejecuta la acción:
        │     CREATE_TASK  → crea tarea vinculada al negocio
        │     LOG_ACTIVITY → registra actividad tipo SYSTEM
        │     SEND_EMAIL   → registra actividad EMAIL (entrega real: roadmap)
        └─ Escribe AutomationLog (auditoría, éxito o error)
```

El log de auditoría permite a la vista de Automatizaciones mostrar el histórico completo de ejecuciones.

---

## 7. Convenciones del código

- **Idioma de la interfaz**: español; identificadores de dominio en inglés (`quota`, `compliance`) y comentarios en español cuando aportan contexto de negocio.
- **Moneda**: EUR formateado con `Intl.NumberFormat("es-ES")`, importes redondeados a entero.
- **Fechas**: siempre `Date` en servidor, ISO 8601 en tránsito; semanas ISO que empiezan en lunes (`mondayOf()`).
- **Respuestas de la API**: JSON puro; errores como `{ "error": "mensaje" }` con códigos HTTP 400/401/403/404.
- **Estilo**: ESLint (`eslint-config-next`), TypeScript estricto sin `ignoreBuildErrors`.
