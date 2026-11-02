/**
 * Datos semilla del CRM — escenario demo: "Nova Solutions", equipo comercial B2B SaaS.
 * Ejecutar: bun scripts/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const daysAgo = (n: number, h = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, 0, 0, 0);
  return d;
};
const daysFromNow = (n: number, h = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(h, 0, 0, 0);
  return d;
};

async function main() {
  console.log("🌱 Limpiando base de datos...");
  await db.notification.deleteMany();
  await db.alertLog.deleteMany();
  await db.automationLog.deleteMany();
  await db.automationRule.deleteMany();
  await db.activity.deleteMany();
  await db.task.deleteMany();
  await db.deal.deleteMany();
  await db.contact.deleteMany();
  await db.company.deleteMany();
  await db.stage.deleteMany();
  await db.user.deleteMany();

  // ---------- Usuarios (RBAC) ----------
  console.log("👥 Usuarios...");
  const admin = await db.user.create({
    data: { name: "Laura Giménez", email: "admin@nexocrm.com", role: "ADMIN", passwordHash: hashPassword("demo1234") },
  });
  const director = await db.user.create({
    data: { name: "Carlos Ruiz", email: "director@nexocrm.com", role: "SALES_DIRECTOR", passwordHash: hashPassword("demo1234") },
  });
  const carmen = await db.user.create({
    data: { name: "Carmen Soto", email: "comercial@nexocrm.com", role: "SALES_REP", quota: 15000, passwordHash: hashPassword("demo1234") },
  });
  const javier = await db.user.create({
    data: { name: "Javier Mira", email: "javier@nexocrm.com", role: "SALES_REP", quota: 12000, passwordHash: hashPassword("demo1234") },
  });

  // ---------- Embudo (pipeline) ----------
  console.log("🏁 Etapas del embudo...");
  const sNuevos = await db.stage.create({ data: { name: "Nuevos", order: 0, probability: 10, color: "#64748b" } });
  const sContactado = await db.stage.create({ data: { name: "Contactado", order: 1, probability: 25, color: "#0d9488" } });
  const sReunion = await db.stage.create({ data: { name: "Reunión agendada", order: 2, probability: 45, color: "#ca8a04" } });
  const sPropuesta = await db.stage.create({ data: { name: "Propuesta enviada", order: 3, probability: 70, color: "#ea580c" } });
  const sNegociacion = await db.stage.create({ data: { name: "Negociación", order: 4, probability: 85, color: "#dc2626" } });
  const sGanado = await db.stage.create({ data: { name: "Ganado", order: 5, probability: 100, color: "#16a34a", isWon: true } });
  const sPerdido = await db.stage.create({ data: { name: "Perdido", order: 6, probability: 0, color: "#94a3b8", isLost: true } });

  // ---------- Empresas ----------
  console.log("🏢 Empresas...");
  const acme = await db.company.create({ data: { name: "Acme Logistics", legalName: "Acme Logistics S.L.", website: "https://acmelogistics.es", sector: "Logística", city: "Madrid", country: "España", phone: "+34 910 220 145", address: "Calle Alcalá 120", ownerId: carmen.id } });
  const biodental = await db.company.create({ data: { name: "BioDental Group", legalName: "Biodental Group S.A.", website: "https://biodental.es", sector: "Salud dental", city: "Valencia", country: "España", phone: "+34 963 118 220", ownerId: javier.id } });
  const cava = await db.company.create({ data: { name: "Cava & Co", legalName: "Cava and Co. Consulting", website: "https://cavaco.io", sector: "Consultoría", city: "Barcelona", country: "España", phone: "+34 932 442 118", ownerId: carmen.id } });
  const delta = await db.company.create({ data: { name: "Delta Manufacturing", legalName: "Delta Manufacturing S.L.", website: "https://deltamanufacturing.com", sector: "Industrial", city: "Zaragoza", country: "España", ownerId: javier.id } });
  const everia = await db.company.create({ data: { name: "Everia Retail", legalName: "Everia Retail Group", website: "https://everia.es", sector: "Retail", city: "Sevilla", country: "España", phone: "+34 954 330 771", ownerId: carmen.id } });

  // ---------- Contactos ----------
  console.log("🧑‍💼 Contactos...");
  const mkContact = (data: { firstName: string; lastName?: string; email: string; phone?: string; position?: string; companyId?: string; ownerId: string; createdAgo: number }) =>
    db.contact.create({
      data: {
        firstName: data.firstName, lastName: data.lastName ?? null, email: data.email,
        phone: data.phone ?? null, position: data.position ?? null,
        companyId: data.companyId ?? null, ownerId: data.ownerId,
        createdAt: daysAgo(data.createdAgo),
      },
    });

  const ana = await mkContact({ firstName: "Ana", lastName: "Beltrán", email: "ana.beltran@acmelogistics.es", phone: "+34 620 145 778", position: "Directora de Operaciones", companyId: acme.id, ownerId: carmen.id, createdAgo: 45 });
  const bruno = await mkContact({ firstName: "Bruno", lastName: "Cifuentes", email: "bruno.cifuentes@biodental.es", phone: "+34 671 902 334", position: "CEO", companyId: biodental.id, ownerId: javier.id, createdAgo: 30 });
  const clara = await mkContact({ firstName: "Clara", lastName: "Domínguez", email: "clara.dominguez@cavaco.io", phone: "+34 645 771 009", position: "CFO", companyId: cava.id, ownerId: carmen.id, createdAgo: 21 });
  const diego = await mkContact({ firstName: "Diego", lastName: "Estévez", email: "diego.estevez@delta.es", phone: "+34 699 210 556", position: "Gerente de Planta", companyId: delta.id, ownerId: javier.id, createdAgo: 14 });
  const elena = await mkContact({ firstName: "Elena", lastName: "Ferrer", email: "elena.ferrer@everia.es", phone: "+34 688 404 121", position: "Directora de e-commerce", companyId: everia.id, ownerId: carmen.id, createdAgo: 8 });
  const felix = await mkContact({ firstName: "Félix", lastName: "Garrido", email: "felix.garrido@acmelogistics.es", phone: "+34 610 228 993", position: "Responsable IT", companyId: acme.id, ownerId: carmen.id, createdAgo: 45 });
  const gloria = await mkContact({ firstName: "Gloria", lastName: "Hurtado", email: "gloria.hurtado@cavaco.io", position: "Socia fundadora", companyId: cava.id, ownerId: carmen.id, createdAgo: 5 });

  // ---------- Negocios ----------
  console.log("💼 Negocios...");
  const mkDeal = (d: { title: string; amount: number; stageId: string; status?: string; companyId?: string; contactId?: string; ownerId: string; closeIn?: number; createdAgo: number; source?: string }) =>
    db.deal.create({
      data: {
        title: d.title, amount: d.amount, currency: "EUR",
        stageId: d.stageId, status: d.status ?? "OPEN",
        companyId: d.companyId ?? null, contactId: d.contactId ?? null,
        ownerId: d.ownerId, source: d.source ?? null,
        expectedCloseDate: d.closeIn !== undefined ? daysFromNow(d.closeIn, 18) : null,
        closedAt: d.status && d.status !== "OPEN" ? daysAgo(Math.max(1, d.createdAgo - 5)) : null,
        createdAt: daysAgo(d.createdAgo),
      },
    });

  const d1 = await mkDeal({ title: "Licencias CRM Acme — 50 usuarios", amount: 24000, stageId: sNegociacion.id, companyId: acme.id, contactId: ana.id, ownerId: carmen.id, closeIn: 12, createdAgo: 40, source: "Feria LogiTech" });
  const d2 = await mkDeal({ title: "Implantación BioDental — plan Growth", amount: 9600, stageId: sPropuesta.id, companyId: biodental.id, contactId: bruno.id, ownerId: javier.id, closeIn: 20, createdAgo: 25 });
  const d3 = await mkDeal({ title: "Consultoría Cava & Co — onboarding", amount: 4200, stageId: sReunion.id, companyId: cava.id, contactId: clara.id, ownerId: carmen.id, closeIn: 30, createdAgo: 15 });
  const d4 = await mkDeal({ title: "Delta — piloto automatización alarmas", amount: 7800, stageId: sContactado.id, companyId: delta.id, contactId: diego.id, ownerId: javier.id, closeIn: 45, createdAgo: 12 });
  const d5 = await mkDeal({ title: "Everia — renovación anual + módulo BI", amount: 18500, stageId: sPropuesta.id, companyId: everia.id, contactId: elena.id, ownerId: carmen.id, closeIn: 18, createdAgo: 60 });
  const d6 = await mkDeal({ title: "Acme — add-on soporte premium", amount: 3600, stageId: sNuevos.id, companyId: acme.id, contactId: felix.id, ownerId: carmen.id, closeIn: 60, createdAgo: 4 });
  const d7 = await mkDeal({ title: "Cava & Co — migración datos legacy", amount: 5400, stageId: sNuevos.id, companyId: cava.id, contactId: gloria.id, ownerId: carmen.id, closeIn: 55, createdAgo: 3 });
  await mkDeal({ title: "BioDental — expansión 3 clínicas", amount: 14200, stageId: sGanado.id, status: "WON", companyId: biodental.id, contactId: bruno.id, ownerId: javier.id, createdAgo: 35 });
  await mkDeal({ title: "Everia — campaña navideña (marketplace)", amount: 6800, stageId: sGanado.id, status: "WON", companyId: everia.id, contactId: elena.id, ownerId: carmen.id, createdAgo: 28 });
  await mkDeal({ title: "Delta — ERP completo", amount: 32000, stageId: sPerdido.id, status: "LOST", companyId: delta.id, contactId: diego.id, ownerId: javier.id, createdAgo: 70 });

  // Ganados recientes con fecha de cierre precisa (alimentan la alerta semanal)
  await db.deal.create({
    data: {
      title: "Cava & Co — licencias adicionales", amount: 5200, currency: "EUR",
      status: "WON", stageId: sGanado.id, companyId: cava.id, contactId: clara.id,
      ownerId: carmen.id, createdAt: daysAgo(20), closedAt: daysAgo(3, 17),
    },
  });
  await db.deal.create({
    data: {
      title: "BioDental — pack formación", amount: 4800, currency: "EUR",
      status: "WON", stageId: sGanado.id, companyId: biodental.id, contactId: bruno.id,
      ownerId: javier.id, createdAt: daysAgo(24), closedAt: daysAgo(10, 12),
    },
  });

  // ---------- Actividades (cronología omnicanal) ----------
  console.log("📞 Actividades...");
  const mkActivity = (a: { type: string; subject: string; description?: string; occurredAt: Date; contactId?: string; dealId?: string; userId?: string }) =>
    db.activity.create({
      data: {
        type: a.type, subject: a.subject, description: a.description ?? null,
        occurredAt: a.occurredAt, contactId: a.contactId ?? null, dealId: a.dealId ?? null, userId: a.userId ?? null,
      },
    });

  await mkActivity({ type: "SYSTEM", subject: "Contacto creado", description: "Ana Beltrán se incorporó al CRM", occurredAt: daysAgo(45), contactId: ana.id, userId: carmen.id });
  await mkActivity({ type: "EMAIL", subject: "Primera toma de contacto — feria LogiTech", description: "Email de presentación enviado tras escanear su badge en la feria.", occurredAt: daysAgo(40, 12), contactId: ana.id, dealId: d1.id, userId: carmen.id });
  await mkActivity({ type: "CALL", subject: "Llamada de descubrimiento (22 min)", description: "Dolor principal: gestionan 3.000 envíos/mes en hojas de cálculo. Presupuesto aprobado para Q3.", occurredAt: daysAgo(33, 11), contactId: ana.id, dealId: d1.id, userId: carmen.id });
  await mkActivity({ type: "MEETING", subject: "Demo técnica con equipo IT", description: "Asistieron Ana Beltrán y Félix Garrido. Muy interesados en la API de integración.", occurredAt: daysAgo(26, 16), contactId: ana.id, dealId: d1.id, userId: carmen.id });
  await mkActivity({ type: "NOTE", subject: "Compite contra SuiteX", description: "Nos comparan con SuiteX; nuestro punto fuerte: implantación en 2 semanas vs 3 meses.", occurredAt: daysAgo(25), contactId: ana.id, dealId: d1.id, userId: carmen.id });
  await mkActivity({ type: "SUPPORT", subject: "Incidencia: exportación de facturas", description: "Abrieron ticket preguntando por exportación a A3. Resuelto con tutorial.", occurredAt: daysAgo(18, 9), contactId: felix.id, userId: admin.id });

  await mkActivity({ type: "EMAIL", subject: "Propuesta plan Growth enviada", description: "Adjunta propuesta de 9.600€/año con 40 licencias.", occurredAt: daysAgo(24, 10), contactId: bruno.id, dealId: d2.id, userId: javier.id });
  await mkActivity({ type: "CALL", subject: "Seguimiento propuesta (8 min)", description: "Bruno pide desglosar coste de formación. Reunión la semana que viene.", occurredAt: daysAgo(20, 13), contactId: bruno.id, dealId: d2.id, userId: javier.id });
  await mkActivity({ type: "MEETING", subject: "Visita clínica Valencia", description: "Recorrido por 2 clínicas. El personal usa tablets: la app móvil es clave.", occurredAt: daysAgo(14, 11), contactId: bruno.id, dealId: d2.id, userId: javier.id });

  await mkActivity({ type: "CALL", subject: "Llamada entrante (12 min)", description: "Clara pide referencias de clientes del sector consultoría.", occurredAt: daysAgo(10, 17), contactId: clara.id, dealId: d3.id, userId: carmen.id });
  await mkActivity({ type: "EMAIL", subject: "Enviadas 3 referencias", occurredAt: daysAgo(9, 10), contactId: clara.id, dealId: d3.id, userId: carmen.id });
  await mkActivity({ type: "MEETING", subject: "Reunión de alcance del proyecto", description: "Definido alcance: migrar 12.000 registros y formar a 15 usuarios.", occurredAt: daysAgo(6, 12), contactId: clara.id, dealId: d3.id, userId: carmen.id });

  await mkActivity({ type: "SYSTEM", subject: "Negocio creado", description: "\"Delta — piloto automatización alarmas\" inició el embudo", occurredAt: daysAgo(12), contactId: diego.id, dealId: d4.id, userId: javier.id });
  await mkActivity({ type: "EMAIL", subject: "Email de bienvenida + calendario", occurredAt: daysAgo(11, 9), contactId: diego.id, dealId: d4.id, userId: javier.id });
  await mkActivity({ type: "CALL", subject: "Llamada (5 min)", description: "Diego confirma reunión técnica el próximo martes.", occurredAt: daysAgo(2, 18), contactId: diego.id, dealId: d4.id, userId: javier.id });

  await mkActivity({ type: "EMAIL", subject: "Propuesta renovación + BI", description: "Propuesta de 18.500€ con 12% de descuento por renovación anual.", occurredAt: daysAgo(7, 10), contactId: elena.id, dealId: d5.id, userId: carmen.id });
  await mkActivity({ type: "NOTE", subject: "Señales de compra", description: "Elena abrió la propuesta 4 veces y la reenvió a su CFO.", occurredAt: daysAgo(3), contactId: elena.id, dealId: d5.id, userId: carmen.id });

  // ---------- Tareas ----------
  console.log("✅ Tareas...");
  const mkTask = (t: { title: string; description?: string; dueDate: Date; priority: string; status?: string; assignedToId: string; contactId?: string; dealId?: string }) =>
    db.task.create({
      data: {
        title: t.title, description: t.description ?? null, dueDate: t.dueDate,
        priority: t.priority, status: t.status ?? "PENDING",
        assignedToId: t.assignedToId, contactId: t.contactId ?? null, dealId: t.dealId ?? null,
      },
    });

  await mkTask({ title: "Enviar contrato revisado a Acme", description: "Incluir cláusula de salida sin penalización que pidió Ana.", dueDate: daysFromNow(1), priority: "HIGH", assignedToId: carmen.id, contactId: ana.id, dealId: d1.id });
  await mkTask({ title: "Preparar desglose de formación para BioDental", dueDate: daysFromNow(2), priority: "MEDIUM", assignedToId: javier.id, contactId: bruno.id, dealId: d2.id });
  await mkTask({ title: "Llamar a Gloria Hurtado (lead recién entrado)", dueDate: daysAgo(1), priority: "HIGH", assignedToId: carmen.id, contactId: gloria.id, dealId: d7.id });
  await mkTask({ title: "Revisar propuesta Everia con el CFO", dueDate: daysFromNow(3), priority: "MEDIUM", assignedToId: carmen.id, contactId: elena.id, dealId: d5.id });
  await mkTask({ title: "Cargar demo con datos de Delta en el entorno de pruebas", dueDate: daysFromNow(4), priority: "MEDIUM", assignedToId: javier.id, contactId: diego.id, dealId: d4.id });
  await mkTask({ title: "Reunión semanal de pipeline", dueDate: daysFromNow(5), priority: "LOW", assignedToId: director.id });
  await mkTask({ title: "Actualizar precios en la plantilla de propuesta", dueDate: daysAgo(2), priority: "LOW", status: "DONE", assignedToId: carmen.id });

  // ---------- Reglas de automatización ----------
  console.log("⚙️ Reglas de automatización...");
  await db.automationRule.create({
    data: {
      name: "Deal Ganado → tarea de onboarding",
      trigger: "DEAL_WON",
      actionType: "CREATE_TASK",
      actionConfig: JSON.stringify({
        title: "Onboarding del cliente: {negocio} ({empresa})",
        days: 2,
        priority: "HIGH",
        assigneeMode: "DEAL_OWNER",
      }),
    },
  });
  await db.automationRule.create({
    data: {
      name: "Deal Ganado → email de bienvenida al cliente",
      trigger: "DEAL_WON",
      actionType: "SEND_EMAIL",
      actionConfig: JSON.stringify({
        emailSubject: "¡Bienvenido/a! Tu proyecto {negocio} ya está en marcha",
        emailBody: "Hola {contacto}: gracias por confiar en Nova Solutions. Hemos registrado tu proyecto {negocio} ({monto}) y el equipo técnico te contactará en 48h laborables.",
      }),
    },
  });
  await db.automationRule.create({
    data: {
      name: "Propuesta enviada → seguimiento en 3 días",
      trigger: "DEAL_STAGE_CHANGED",
      triggerStage: "Propuesta enviada",
      actionType: "CREATE_TASK",
      actionConfig: JSON.stringify({
        title: "Hacer seguimiento de la propuesta: {negocio}",
        days: 3,
        priority: "MEDIUM",
        assigneeMode: "DEAL_OWNER",
      }),
    },
  });
  await db.automationRule.create({
    data: {
      name: "Negociación → nota de auditoría",
      trigger: "DEAL_STAGE_CHANGED",
      triggerStage: "Negociación",
      actionType: "LOG_ACTIVITY",
      actionConfig: JSON.stringify({
        activityType: "SYSTEM",
        subject: "Negocio en fase crítica de negociación",
        description: "\"{negocio}\" ({monto}) entró en Negociación. Revisa descuentos con dirección si superan el 15%.",
      }),
    },
  });

  // ---------- Log de ejemplo ----------
  const firstRule = await db.automationRule.findFirst();
  if (firstRule) {
    await db.automationLog.create({
      data: {
        ruleId: firstRule.id,
        message: "Email simulado a bruno.cifuentes@biodental.es: \"¡Bienvenido/a! Tu proyecto BioDental — expansión 3 clínicas ya está en marcha\"",
      },
    });
  }

  // ---------- Alerta semanal de ejemplo (semana pasada) ----------
  console.log("🔔 Alerta semanal de ejemplo...");
  const mondayOf = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
    return d;
  };
  const thisMonday = mondayOf(new Date());
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setSeconds(-1);
  const daysInMonth = new Date(lastMonday.getFullYear(), lastMonday.getMonth() + 1, 0).getDate();
  const weeklyTarget = (quota: number | null) =>
    quota ? Math.round((quota * 7) / daysInMonth) : null;
  const fmtEUR = (n: number) =>
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

  const demoRanking = [
    { userId: javier.id, name: javier.name, role: javier.role, wonValue: 4800, wonCount: 1, lostCount: 0, activitiesCount: 6, weeklyTarget: weeklyTarget(12000), compliance: null },
    { userId: carmen.id, name: carmen.name, role: carmen.role, wonValue: 0, wonCount: 0, lostCount: 0, activitiesCount: 9, weeklyTarget: weeklyTarget(15000), compliance: null },
  ].map((r) => ({
    ...r,
    compliance: r.weeklyTarget ? Math.round((r.wonValue / r.weeklyTarget) * 100) : null,
  }));
  const demoPayload = {
    weekStart: lastMonday.toISOString(),
    weekEnd: thisMonday.toISOString(),
    ranking: demoRanking,
    teamWonValue: 4800,
  };
  const range = `${lastMonday.getDate()} ${lastMonday.toLocaleDateString("es-ES", { month: "short" })} – ${lastSunday.getDate()} ${lastSunday.toLocaleDateString("es-ES", { month: "short" })}`;
  const demoTitle = `Ranking semanal del equipo · ${range}`;
  const demoBody = `Resultado de la semana ${range}: ${fmtEUR(4800)} cerrados como ganados.\n1º Javier Mira (${fmtEUR(4800)})\nLidera Javier Mira — ${demoRanking[0].compliance}% de su objetivo semanal.`;

  const sentAt = new Date(thisMonday);
  sentAt.setHours(9, 0, 0, 0); // enviado el lunes a las 9:00

  await db.alertLog.create({
    data: { weekStart: lastMonday, kind: "WEEKLY_RANKING", payload: JSON.stringify(demoPayload), createdAt: sentAt },
  });
  for (const u of [admin, director, carmen, javier]) {
    await db.notification.create({
      data: {
        userId: u.id, type: "WEEKLY_RANKING", title: demoTitle, body: demoBody,
        payload: JSON.stringify(demoPayload), createdAt: sentAt,
      },
    });
  }

  const counts = {
    usuarios: await db.user.count(),
    empresas: await db.company.count(),
    contactos: await db.contact.count(),
    negocios: await db.deal.count(),
    actividades: await db.activity.count(),
    tareas: await db.task.count(),
    etapas: await db.stage.count(),
    reglas: await db.automationRule.count(),
    alertas: await db.alertLog.count(),
    notificaciones: await db.notification.count(),
  };
  console.log("✨ Datos semilla creados:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
