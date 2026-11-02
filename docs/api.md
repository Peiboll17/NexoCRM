# 🔌 API REST — Referencia

Todas las rutas viven bajo `/api/**` como *route handlers* de Next.js. Toda respuesta es JSON; los errores usan la forma `{ "error": "mensaje" }` con los códigos HTTP 400 (validación), 401 (sin sesión), 403 (sin permisos) y 404 (no encontrado).

**Autenticación:** cookie `crm_session` (httpOnly, firmada HMAC-SHA256, 7 días de validez). Se establece con `POST /api/auth/login` y se verifica en cada petición.

**Convenio RBAC:** en las tablas, *público* = cualquier usuario autenticado; *dirección* = `ADMIN` o `SALES_DIRECTOR`; *admin* = solo `ADMIN`.

---

## 1. Autenticación — `/api/auth`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/login` | público | Valida email + contraseña (`scrypt`) y establece la cookie de sesión |
| `POST` | `/api/auth/logout` | público | Borra la cookie de sesión |
| `GET` | `/api/auth/me` | público | Devuelve `{ user }` del usuario en sesión o 401 |

```bash
# Ejemplo: iniciar sesión y consultar la sesión
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@nexocrm.com","password":"demo1234"}'

curl -b cookies.txt http://localhost:3000/api/auth/me
# → { "user": { "id": "...", "email": "admin@nexocrm.com", "name": "Laura Giménez", "role": "ADMIN" } }
```

---

## 2. Negocios — `/api/deals`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/deals?status=OPEN\|WON\|LOST` | público (filtrado por propietario) | Lista negocios con etapa, empresa y contacto; los comerciales solo reciben los suyos |
| `POST` | `/api/deals` | público | Crea negocio (título obligatorio; asigna primera etapa abierta si no se indica) y dispara `DEAL_CREATED` |
| `PATCH` | `/api/deals/:id` | público | Actualiza negocio. Si cambia `stageId` dispara `DEAL_STAGE_CHANGED`; si la etapa destino es Ganado/Perdido cierra el negocio (`status`, `closedAt`) y dispara `DEAL_WON`/`DEAL_LOST` |
| `DELETE` | `/api/deals/:id` | público* | Elimina negocio (con sus actividades/tareas por cascada) |

Cuerpo típico de `POST`:

```json
{
  "title": "Implantación suite analítica",
  "amount": 18500,
  "stageId": "clr…",
  "companyId": "clr…",
  "contactId": "clr…",
  "expectedCloseDate": "2026-12-15",
  "source": "Referido",
  "ownerId": "clr…"
}
```

> *La política fina de borrado (solo propietario o dirección) se aplica en el handler.

---

## 3. Empresas — `/api/companies` · Contactos — `/api/contacts`

Ambos recursos exponen el mismo CRUD:

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/companies` · `/api/contacts` | público (filtrado) | Listado con búsqueda y recuentos; incluye `company` en contactos y `contacts`/`deals` en empresas |
| `POST` | `/api/companies` · `/api/contacts` | público | Crea registro (nombre / firstName obligatorios) |
| `PATCH` | `/api/companies/:id` · `/api/contacts/:id` | público | Actualiza campos; reasignar `companyId` de un contacto |
| `DELETE` | `/api/companies/:id` · `/api/contacts/:id` | público* | Elimina registro |

El listado de contactos acepta `q` (búsqueda por nombre/email/teléfono) y `companyId` (filtro por empresa).

---

## 4. Tareas — `/api/tasks` · Actividades — `/api/activities`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/tasks?status=PENDING` | público (filtrado) | Tareas del usuario (o todas para dirección) con contacto/negocio/empresa |
| `POST` | `/api/tasks` | público | Crea tarea: `title`, `assignedToId`, `dueDate`, `priority`, y anclaje opcional |
| `PATCH` | `/api/tasks/:id` | público | Cambia estado (`PENDING`⇄`DONE`), fecha, prioridad o responsable |
| `DELETE` | `/api/tasks/:id` | público* | Elimina tarea |
| `GET` | `/api/activities?contactId=…&dealId=…` | público (filtrado) | Cronología omnicanal ordenada por `occurredAt` desc |
| `POST` | `/api/activities` | público | Registra interacción: `type` (`CALL`/`EMAIL`/`MEETING`/`NOTE`/`SUPPORT`), `subject`, `description`, anclajes |

---

## 5. Pipeline — `/api/pipelines`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/pipelines` | público | Etapas del embudo ordenadas, con totales por columna (nº negocios, importe, previsión ponderada) |
| `POST` | `/api/pipelines` | dirección | Crea etapa (`name`, `probability`, `color`, `order`) |
| `PATCH` | `/api/pipelines/:id` | dirección | Modifica etapa (incluye `isWon`/`isLost`) |
| `DELETE` | `/api/pipelines/:id` | dirección | Elimina etapa no vacía (los negocios quedan `SetNull`) |

---

## 6. Usuarios — `/api/users`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/users` | dirección | Lista usuarios con **cuota** y contadores de cartera |
| `POST` | `/api/users` | admin | Crea usuario: `name`, `email`, `role`, `password` (≥6), `quota` (EUR/mes, opcional) |
| `PATCH` | `/api/users/:id` | admin | Actualiza nombre, rol, contraseña o **cuota** |
| `DELETE` | `/api/users/:id` | admin | Da de baja un usuario (los registros comerciales quedan `SetNull`) |

```bash
# Ejemplo: fijar la cuota mensual de un comercial (ADMIN)
curl -b cookies.txt -X PATCH http://localhost:3000/api/users/usr_123 \
  -H "Content-Type: application/json" \
  -d '{"quota": 15000}'
```

---

## 7. Reportes — `/api/reports`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/reports?period=month\|quarter\|year\|all&userId=<id>\|all` | público | Panel de reportes por comercial (ver desglose) |

**RBAC del sujeto del informe:** un `SALES_REP` siempre recibe su propio informe (`userId` se ignora). La dirección puede pedir cualquier comercial (`userId=<id>`) o el agregado del equipo (`userId=all`).

**Respuesta (resumen):**

```jsonc
{
  "period": "month",
  "subject": { "id": "…", "name": "Carmen Soto", "role": "SALES_REP", "isTeam": false },
  "teamSize": null,
  "kpis": {
    "wonValue": 12800, "wonCount": 3, "lostCount": 1, "winRate": 75,
    "openValue": 34000, "weightedValue": 21000, "openCount": 7,
    "avgTicket": 4266, "avgCycleDays": 24,
    "activitiesCount": 41, "tasksDone": 12, "tasksOpen": 5, "tasksOverdue": 1,
    "newContacts": 8
  },
  "quota": { "monthlyQuota": 15000, "target": 15000, "achieved": 12800, "compliance": 85 },
  "activityByType": [ { "type": "CALL", "label": "Llamada", "count": 18 } ],
  "stageStats": [ { "name": "Negociación", "count": 2, "total": 12000, "weighted": 10200 } ],
  "monthly": [ { "label": "jun", "wonValue": 9000, "wonCount": 2, "lostCount": 1, "createdCount": 5 } ],
  "topOpenDeals": [ /* 5 mayores negocios abiertos */ ],
  "topWonDeals": [ /* 5 mayores negocios ganados */ ],
  "users": [ /* selector de comercial (solo dirección) */ ],
  "ranking": [ /* ranking del equipo (solo dirección), con quota y compliance */ ]
}
```

La exportación a PDF se genera **en el cliente** a partir de esta misma respuesta (`src/lib/report-pdf.ts`), sin endpoint adicional.

---

## 8. Dashboard — `/api/dashboard`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/dashboard` | público (filtrado) | KPIs para la vista principal: pipeline abierto y previsión, ganados del mes, tareas vencidas, últimas actividades y avances de negocio |

---

## 9. Automatizaciones — `/api/automations`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/automations` | dirección | Reglas configuradas + catálogo de gatillos y acciones |
| `POST` | `/api/automations` | dirección | Crea regla: `name`, `trigger`, `triggerStage?`, `actionType`, `actionConfig` |
| `PATCH` | `/api/automations/:id` | dirección | Actualiza regla o alterna `active` |
| `DELETE` | `/api/automations/:id` | dirección | Elimina regla |
| `GET` | `/api/automations/logs` | dirección | Log de auditoría de ejecuciones recientes |

`actionConfig` es JSON serializado según la acción:

| Acción | Configuración |
|---|---|
| `CREATE_TASK` | `{ "title": "Preparar propuesta", "dueInDays": 3, "priority": "HIGH" }` |
| `LOG_ACTIVITY` | `{ "subject": "Etapa actualizada", "description": "…" }` |
| `SEND_EMAIL` | `{ "subject": "¡Enhorabuena!", "body": "…" }` (hoy se registra como actividad EMAIL; envío real en roadmap) |

---

## 10. Alertas y notificaciones — `/api/alerts`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api/alerts` | público | **Cron perezoso**: si esta semana aún no existe la alerta semanal, la genera; devuelve la bandeja del usuario (últimas 20) + `unreadCount` |
| `POST` | `/api/alerts/weekly` | dirección | Regenera y reenvía la alerta semanal ahora (botón «Enviar ahora»); devuelve el ranking |
| `POST` | `/api/alerts/read` | público | Marca todas las notificaciones del usuario como leídas |

```bash
# Forzar el envío de la alerta semanal (dirección)
curl -b cookies.txt -X POST http://localhost:3000/api/alerts/weekly
# → { "ok": true, "recipients": 4, "weekStart": "…", "ranking": [ … ] }
```

---

## 11. Salud — `/api`

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/api` | público | Comprobación de salud de la API |
