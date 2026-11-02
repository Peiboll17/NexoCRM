# ⚙️ Automatizaciones, cuotas y alerta semanal

Los tres sistemas de «trabajo automático» de NexoCRM comparten una idea: **la dirección define reglas una vez y el sistema ejecuta sin intervención**. Este documento explica cómo funcionan y qué fórmulas aplican.

---

## 1. Motor de automatizaciones (`src/lib/automations.ts`)

Modelo **gatillo → acción** con registro de auditoría. Las reglas se gestionan desde la vista *Automatizaciones* (solo dirección) y se guardan en la tabla `AutomationRule`.

### 1.1 Catálogo de gatillos (triggers)

| Gatillo | Se dispara cuando… | Filtro adicional |
|---|---|---|
| `DEAL_CREATED` | Se crea un negocio (`POST /api/deals`) | — |
| `DEAL_STAGE_CHANGED` | El negocio cambia de etapa (drag & drop o `PATCH`) | `triggerStage`: solo si la etapa destino coincide |
| `DEAL_WON` | El negocio entra en una etapa `isWon` | — |
| `DEAL_LOST` | El negocio entra en una etapa `isLost` | — |

### 1.2 Catálogo de acciones

| Acción | Efecto | Configuración (`actionConfig`) |
|---|---|---|
| `CREATE_TASK` | Crea una tarea vinculada al negocio, asignada al propietario | `{ "title": "Preparar propuesta", "dueInDays": 3, "priority": "HIGH" }` |
| `LOG_ACTIVITY` | Registra una actividad de tipo `SYSTEM` en el timeline | `{ "subject": "…", "description": "…" }` |
| `SEND_EMAIL` | Registra una actividad de tipo `EMAIL` (entrega real por SMTP: roadmap) | `{ "subject": "…", "body": "…" }` |

### 1.3 Ejecución y auditoría

```
mutación del negocio en la API
        → runAutomations({ trigger, deal, previousStageName })
              ├─ SELECT reglas WHERE active = true AND trigger = ?
              ├─ por cada regla (con filtro triggerStage si aplica):
              │     ejecutar acción + crear AutomationLog("✓ …")
              └─ si una regla falla: AutomationLog("✗ motivo") y continúa
```

Cada ejecución queda en `AutomationLog` (con `ruleId` y `dealId`), visible en la vista de Automatizaciones. El fallo de una regla **nunca bloquea** la operación del usuario que la provocó.

### 1.4 Ejemplos de recetas típicas

| Receta | Gatillo | Acción |
|---|---|---|
| Seguimiento post-propuesta | `DEAL_STAGE_CHANGED` (etapa «Propuesta enviada») | `CREATE_TASK` «Llamada de seguimiento» en 2 días |
| Celebración de cierre | `DEAL_WON` | `LOG_ACTIVITY` «Negocio ganado 🎉» |
| Rescate de perdidos | `DEAL_LOST` | `CREATE_TASK` «Llamada de feedback» en 7 días |
| Bienvenida | `DEAL_CREATED` | `LOG_ACTIVITY` «Negocio creado desde formulario» |

---

## 2. Alerta semanal de ranking (`src/lib/weekly-alerts.ts`)

**Objetivo:** que todo el equipo reciba, una vez por semana, el ranking de resultados de la semana anterior.

### 2.1 Cuándo se envía — patrón «cron perezoso»

No hay worker ni Redis: la primera petición que llega al CRM cada semana (`GET /api/alerts`, que llama `ensureWeeklyAlert()`) comprueba si ya existe la alerta de la semana y, si no, la genera al vuelo.

```
GET /api/alerts
  └─ ensureWeeklyAlert()
       ├─ lockWeek = mondayOf(hoy)
       ├─ ¿existe AlertLog(lockWeek)?  → sí: return false (nada que hacer)
       └─ no: generateWeeklyAlert() → notificación a TODOS los usuarios
```

Garantías:

- **Exactamente 1 alerta por semana ISO**: la clave única `AlertLog.weekStart` (lunes de la semana en curso) actúa como cerrojo atómico. Si dos peticiones concurrentes compiten, solo una inserta; la otra recibe el error de unicidad y se retira.
- **Contenido de la semana completada**: la ventana reportada es `lunes anterior (00:00) → lunes actual (exclusivo)`, siempre lun–dom completos.
- **Reenvío manual**: `POST /api/alerts/weekly` (dirección) regenera con `force: true` — borra el cerrojo y las notificaciones de esa semana y vuelve a crearlas.

> Si despliegas con un scheduler real (cron de sistema, Vercel Cron…), programa una llamada a `ensureWeeklyAlert()` los lunes a primera hora y el comportamiento será idéntico al de la comprobación perezosa.

### 2.2 Qué contiene la alerta

Campos calculados por usuario para la semana reportada (`WeeklyRankingRow`):

| Campo | Significado |
|---|---|
| `wonValue` / `wonCount` | Importe y nº de negocios ganados (cierran en la ventana) |
| `lostCount` | Negocios perdidos |
| `activitiesCount` | Actividades registradas (llamadas, emails, reuniones…) |
| `weeklyTarget` | Objetivo semanal prorrateado de la cuota (ver §3.3) |
| `compliance` | % de cumplimiento semanal = `wonValue / weeklyTarget × 100` |

Orden del ranking: primero por importe ganado, desempate por nº de actividades.

El texto de la notificación incluye el **podio** (`1º Nombre (12.400 €) · 2º … · 3º …`), el total del equipo y el líder con su % de objetivo semanal. Si no hubo cierres, el mensaje cambia a un tono motivador.

### 2.3 Ejemplo de payload persistido

```json
{
  "weekStart": "2026-10-26T00:00:00.000Z",
  "weekEnd": "2026-11-02T00:00:00.000Z",
  "teamWonValue": 21400,
  "ranking": [
    { "name": "Carmen Soto", "wonValue": 12800, "wonCount": 3, "lostCount": 1,
      "activitiesCount": 22, "weeklyTarget": 3500, "compliance": 366 },
    { "name": "Javier Mira", "wonValue": 8600, "wonCount": 2, "lostCount": 0,
      "activitiesCount": 19, "weeklyTarget": 2800, "compliance": 307 }
  ]
}
```

---

## 3. Cuotas y cumplimiento (`User.quota`)

### 3.1 Dónde se define

- Cada usuario tiene `quota: Float?` — **objetivo mensual en EUR** (`null` = sin objetivo; los roles de dirección pueden no tenerlo).
- Se define y edita desde *Usuarios* (ADMIN) con `POST/PATCH /api/users`.

### 3.2 Escalado al periodo del informe

El panel de reportes (`GET /api/reports`) escala la cuota mensual al periodo seleccionado:

| `period` | Factor | Objetivo |
|---|---|---|
| `month` | ×1 | `quota` |
| `quarter` | ×3 | `quota × 3` |
| `year` | ×12 | `quota × 12` |
| `all` | — | sin objetivo comparable (`compliance: null`) |

En el modo **equipo** (dirección, `userId=all`) el objetivo es la suma de las cuotas de todos los usuarios con cuota definida.

### 3.3 Fórmulas

```
objetivo periodo   = quota_mensual × factor(periodo)          [o Σ quotas en modo equipo]
logro periodo      = Σ amount de deals con status = "WON"
                      AND closedAt ∈ periodo
cumplimiento %     = round(logro / objetivo × 100)            [null si objetivo = 0/null]

objetivo semanal   = round(quota_mensual × 7 / días_del_mes)  [alerta semanal]
cumplimiento sem.  = round(won_semana / objetivo_semanal × 100)
```

### 3.4 Dónde se ve el cumplimiento

| Superficie | Uso |
|---|---|
| Panel de Reportes | Barra de progreso cuota vs logro + % con semáforo (≥100 verde, ≥70 ámbar, <70 rojo) |
| Ranking del equipo (dirección) | Columna de cumplimiento por comercial, ordenable |
| Exportación a PDF | Sección «Cuota y cumplimiento» con el mismo semáforo |
| Alerta semanal | % de objetivo semanal del líder y de cada fila del ranking |
