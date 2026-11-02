# 🚢 Despliegue

Guía para pasar NexoCRM de local a producción: opciones de hosting, migración a PostgreSQL, variables de entorno e integración continua.

---

## 1. Requisitos

| Componente | Mínimo |
|---|---|
| Bun | ≥ 1.1 (recomendado) o Node.js ≥ 20 |
| Base de datos | SQLite (incluida) o PostgreSQL ≥ 14 |
| Memoria | 512 MB (el build standalone es ligero) |

---

## 2. Build de producción

```bash
bun install
bunx prisma generate
bun run build          # genera .next/standalone (output: "standalone")
bun run start          # sirve en http://localhost:3000
```

El build standalone empaqueta el servidor con lo mínimo imprescindible (`server.js` autocontenido), ideal para Docker o un VPS sin dependencias globales.

---

## 3. Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | Cadena de conexión SQLite o PostgreSQL (ver §4) |
| `AUTH_SECRET` | ✅ en producción | Secreto de firma de cookies de sesión. Genera uno con `openssl rand -hex 32` |
| `PORT` | — | Puerto del servidor standalone (por defecto 3000) |
| `NODE_ENV` | — | `production` en despliegues (lo fija `bun run start`) |

> ⚠️ Nunca subas el archivo `.env` al repositorio: está excluido por `.gitignore`. Usa el gestor de secretos de tu plataforma (Vercel env vars, Docker secrets, systemd EnvironmentFile…).

---

## 4. Migración de SQLite a PostgreSQL

El modelo es Prisma puro, así que el cambio de motor es mecánico:

1. **Provisiona** una base PostgreSQL y anota la URL de conexión.
2. **Cambia el datasource** en `prisma/schema.prisma`:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

3. **Ajusta `DATABASE_URL`** en tu entorno:

   ```
   DATABASE_URL="postgresql://usuario:contrasena@host:5432/nexocrm?schema=public"
   ```

4. **Sincroniza el esquema y recarga datos**:

   ```bash
   bunx prisma db push       # crea el esquema en PostgreSQL
   bun scripts/seed.ts       # datos demo (opcional)
   ```

### 4.1 Mejoras opcionales al pasar a PostgreSQL

El esquema mantiene compatibilidad con ambos motores; en PostgreSQL puedes reforzarlo:

- **Enums reales**: los campos `role`, `status`, `type`, `trigger`… son `String` validados en la API. Pueden convertirse a `enum` de Prisma/PostgreSQL.
- **JSON nativo**: `AutomationRule.actionConfig`, `Notification.payload` y `AlertLog.payload` son `String` con JSON serializado → pueden pasar a `Json`.
- **Índices de texto**: si el volumen de contactos crece, añade índices GIN (`pg_trgm`) para búsquedas `LIKE`.

---

## 5. Opciones de hosting

### 5.1 Vercel

La vía más directa para un proyecto Next.js:

1. Importa el repositorio en Vercel.
2. Configura `DATABASE_URL` (Neon, Supabase, Railway…) y `AUTH_SECRET` en *Project → Settings → Environment Variables*.
3. Con PostgreSQL, ejecuta `bunx prisma db push` desde CI o localmente apuntando a la BD de producción.

> Con SQLite en Vercel la base de datos sería efímera: en producción usa siempre PostgreSQL u otra BD gestionada.

### 5.2 Docker (VPS / Cloud Run)

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Dependencias
COPY package.json bun.lock prisma ./
RUN bun install --frozen-lockfile && bunx prisma generate

# Build
COPY . .
RUN bun run build

# Runtime
EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", ".next/standalone/server.js"]
```

```bash
docker build -t nexocrm .
docker run -p 3000:3000 \
  -e DATABASE_URL="file:./db/custom.db" \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  -v nexocrm-data:/app/db \
  nexocrm
```

> Con SQLite monta un **volumen** persistente en la ruta de la base de datos. Sin volumen, los datos se pierden al recrear el contenedor.

### 5.3 VPS tradicional (systemd)

```ini
# /etc/systemd/system/nexocrm.service
[Unit]
Description=NexoCRM
After=network.target

[Service]
WorkingDirectory=/opt/nexocrm
ExecStart=/usr/local/bin/bun .next/standalone/server.js
Environment=NODE_ENV=production
EnvironmentFile=/opt/nexocrm/.env
Restart=always

[Install]
WantedBy=multi-user.target
```

Pon Nginx o Caddy delante como proxy inverso TLS hacia `:3000`.

---

## 6. Primer arranque en producción

1. Aplica el esquema (`bunx prisma db push`).
2. Crea los usuarios reales — o siembra y edita:

   ```bash
   bun scripts/seed.ts
   ```

   El seed crea el equipo demo con contraseñas `demo1234`: **cámbialas inmediatamente** (ADMIN → Usuarios) o elimina esos usuarios tras crear los reales.
3. Define las **cuotas mensuales** de cada comercial (ADMIN → Usuarios) para activar el cálculo de cumplimiento.
4. Verifica `AUTH_SECRET` fuerte y HTTPS activo (las cookies son `Secure` solo detrás de TLS real).

---

## 7. Integración continua (GitHub Actions)

El repositorio incluye [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), que en cada push/PR ejecuta:

1. `bun install --frozen-lockfile` — dependencias reproducibles
2. `bunx prisma generate` — cliente Prisma
3. `bun run lint` — ESLint
4. `bunx tsc --noEmit` — verificación de tipos estricta
5. `bun run build` — build de producción completo

Un PR solo es mergeable si compila, tipa y lintea limpio.

---

## 8. Copias de seguridad

- **SQLite**: copia atómica del archivo (o `VACUUM INTO 'backup.db'`) + almacenamiento externo.
- **PostgreSQL**: `pg_dump` diario programado; retención mínima de 7 días.
- Las notificaciones y logs de auditoría (`Notification`, `AlertLog`, `AutomationLog`) son históricos: inclúyelos en el backup para conservar el histórico de alertas.
