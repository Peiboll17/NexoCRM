import { db } from "@/lib/db";

// ============================================================
// Motor de Automatización de Eventos (Event-Driven Architecture)
// Gatillos (triggers) → Acciones (actions), con registro de auditoría.
// ============================================================

export type AutomationTrigger =
  | "DEAL_CREATED"
  | "DEAL_STAGE_CHANGED"
  | "DEAL_WON"
  | "DEAL_LOST";

export type AutomationActionType = "CREATE_TASK" | "LOG_ACTIVITY" | "SEND_EMAIL";

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  DEAL_CREATED: "Se crea un negocio",
  DEAL_STAGE_CHANGED: "Un negocio cambia de etapa",
  DEAL_WON: "Un negocio pasa a Ganado",
  DEAL_LOST: "Un negocio pasa a Perdido",
};

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  CREATE_TASK: "Crear una tarea",
  LOG_ACTIVITY: "Registrar una actividad",
  SEND_EMAIL: "Enviar un email (simulado)",
};

type RuleLike = {
  id: string;
  name: string;
  trigger: string;
  triggerStage: string | null;
  actionType: string;
  actionConfig: string;
};

export type DealContext = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  stageName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  companyName?: string | null;
  ownerId?: string | null;
};

type ActionConfig = {
  // CREATE_TASK
  title?: string;
  days?: number;
  priority?: string;
  assigneeMode?: "DEAL_OWNER" | "ADMIN";
  // LOG_ACTIVITY
  subject?: string;
  description?: string;
  activityType?: string;
  // SEND_EMAIL
  emailSubject?: string;
  emailBody?: string;
};

/** Interpolación de variables: {negocio} {contacto} {empresa} {etapa} {monto} */
function renderTemplate(template: string, ctx: DealContext): string {
  if (!template) return template;
  return template
    .replaceAll("{negocio}", ctx.title ?? "")
    .replaceAll("{contacto}", ctx.contactName ?? "—")
    .replaceAll("{empresa}", ctx.companyName ?? "—")
    .replaceAll("{etapa}", ctx.stageName ?? "—")
    .replaceAll("{monto}", new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: ctx.currency || "EUR",
      maximumFractionDigits: 0,
    }).format(ctx.amount ?? 0));
}

/**
 * Ejecuta todas las reglas activas que aplican al evento recibido.
 * Devuelve los mensajes de log para feedback en la interfaz.
 * Nunca lanza: un fallo en una regla no debe romper la petición del usuario.
 */
export async function runAutomations(params: {
  trigger: AutomationTrigger;
  deal: DealContext;
  previousStageName?: string | null;
}): Promise<string[]> {
  const { trigger, deal, previousStageName } = params;
  const messages: string[] = [];

  try {
    const rules: RuleLike[] = await db.automationRule.findMany({
      where: { active: true, trigger },
      orderBy: { createdAt: "asc" },
    });

    for (const rule of rules) {
      try {
        // Gatillo condicionado a una etapa destino concreta
        if (
          trigger === "DEAL_STAGE_CHANGED" &&
          rule.triggerStage &&
          rule.triggerStage !== deal.stageName
        ) {
          continue;
        }

        let config: ActionConfig = {};
        try {
          config = JSON.parse(rule.actionConfig || "{}") as ActionConfig;
        } catch {
          config = {};
        }

        let message = "";

        if (rule.actionType === "CREATE_TASK") {
          const days = Number(config.days ?? 3);
          const due = new Date();
          due.setDate(due.getDate() + days);
          due.setHours(9, 0, 0, 0);
          const title = renderTemplate(
            config.title || "Tarea de seguimiento: {negocio}",
            deal
          );
          const assignedToId =
            config.assigneeMode === "ADMIN" ? await findAdminId() : deal.ownerId ?? null;
          await db.task.create({
            data: {
              title,
              description: `Generada automáticamente por la regla "${rule.name}" al pasar de "${previousStageName ?? "—"}" a "${deal.stageName ?? "—"}".`,
              dueDate: due,
              priority: config.priority || "MEDIUM",
              status: "PENDING",
              assignedToId,
              dealId: deal.id,
            },
          });
          message = `Tarea creada: "${title}" (vence en ${days} día${days === 1 ? "" : "s"})`;
        } else if (rule.actionType === "LOG_ACTIVITY") {
          const subject = renderTemplate(
            config.subject || `Actualización: {negocio}`,
            deal
          );
          const description = renderTemplate(
            config.description ||
              `El negocio "{negocio}" pasó de "{etapaAnterior}" a "{etapa}".`,
            { ...deal, ...( { stageName: deal.stageName } ) }
          ).replaceAll("{etapaAnterior}", previousStageName ?? "—");
          await db.activity.create({
            data: {
              type: config.activityType || "SYSTEM",
              subject,
              description,
              dealId: deal.id,
              userId: null,
            },
          });
          message = `Actividad registrada: "${subject}"`;
        } else if (rule.actionType === "SEND_EMAIL") {
          const subject = renderTemplate(
            config.emailSubject || "¡Enhorabuena por cerrar {negocio}!",
            deal
          );
          const body = renderTemplate(
            config.emailBody ||
              "Hola {contacto}, gracias por confiar en nosotros. Adjuntamos la información relativa a {negocio} ({monto}).",
            deal
          );
          await db.activity.create({
            data: {
              type: "EMAIL",
              subject: `[Email simulado] ${subject}`,
              description: `${body}\n\n→ Destinatario: ${deal.contactEmail ?? "sin email de contacto"}`,
              dealId: deal.id,
            },
          });
          message = `Email simulado a ${deal.contactEmail ?? "—"}: "${subject}"`;
        } else {
          continue;
        }

        await db.automationLog.create({
          data: {
            ruleId: rule.id,
            dealId: deal.id,
            message: message,
          },
        });
        messages.push(`⚙️ ${rule.name} → ${message}`);
      } catch (ruleError) {
        const msg = `La regla "${rule.name}" falló: ${ruleError instanceof Error ? ruleError.message : "error desconocido"}`;
        messages.push(msg);
        try {
          await db.automationLog.create({
            data: { ruleId: rule.id, dealId: deal.id, message: msg },
          });
        } catch {
          // ignorar fallo de auditoría
        }
      }
    }
  } catch {
    // si el motor no puede leer reglas, no bloquea la operación principal
  }

  return messages;
}

async function findAdminId(): Promise<string | null> {
  const admin = await db.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } });
  return admin?.id ?? null;
}
