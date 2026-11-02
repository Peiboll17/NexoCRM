// ============================================================
// Exportación del informe comercial a PDF (cliente)
// jsPDF + jspdf-autotable · A4 vertical · marca NexoCRM
// Incluye: KPIs, cuota y cumplimiento %, evolución mensual,
// embudo por etapa, negocios destacados y ranking del equipo.
// ============================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ROLE_LABELS, type ReportData, type SessionUser } from "@/lib/client";

const EUR = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const GREEN: [number, number, number] = [5, 150, 105];
const INK: [number, number, number] = [30, 41, 59];
const MUTED: [number, number, number] = [100, 116, 139];
const HEAD_FILL: [number, number, number] = [16, 185, 129];
const ZEBRA: [number, number, number] = [248, 250, 252];
const COMPLIANCE_COLOR = (pct: number): [number, number, number] =>
  pct >= 100 ? [21, 128, 61] : pct >= 70 ? [180, 83, 9] : [190, 18, 60];

const slug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type LastAutoTable = { finalY: number };

export function exportReportPdf(data: ReportData, viewer: SessionUser): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;

  const PERIOD_LABELS: Record<ReportData["period"], string> = {
    month: "Este mes",
    quarter: "Últimos 3 meses",
    year: "Este año",
    all: "Histórico completo",
  };
  const now = new Date();
  const generated = now.toLocaleString("es-ES", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  // ---------- Cabecera ----------
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, pageW, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("NexoCRM — Informe comercial", margin, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const who = data.subject.isTeam
    ? `Equipo completo (${data.teamSize ?? 0} comerciales)`
    : `${data.subject.name} · ${data.subject.role ? ROLE_LABELS[data.subject.role] : ""}`;
  doc.text(`${who}   ·   Periodo: ${PERIOD_LABELS[data.period]}`, margin, 20);
  doc.text(`Generado el ${generated} por ${viewer.name}`, margin, 25.5);

  let y = 40;

  const sectionTitle = (t: string) => {
    if (y > pageH - 60) {
      doc.addPage();
      y = 20;
    }
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(t, margin, y);
    y += 1.8;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.line(margin, y, pageW - margin, y);
    y += 4.5;
  };

  const runTable = (head: string[], body: (string | number)[][], opts?: Parameters<typeof autoTable>[1]) => {
    if (y > pageH - 50) {
      doc.addPage();
      y = 20;
    }
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 1.9, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.15 },
      headStyles: { fillColor: HEAD_FILL, textColor: 255, fontStyle: "bold", fontSize: 9 },
      alternateRowStyles: { fillColor: ZEBRA },
      margin: { left: margin, right: margin, top: 20 },
      ...opts,
    });
    y = (doc as unknown as { lastAutoTable: LastAutoTable }).lastAutoTable.finalY + 9;
  };

  const { kpis, quota } = data;

  // ---------- 1. Resumen del periodo ----------
  sectionTitle("1. Resumen del periodo");
  runTable(
    ["Métrica", "Valor"],
    [
      ["Ingresos ganados", EUR(kpis.wonValue)],
      ["Negocios ganados / perdidos", `${kpis.wonCount} / ${kpis.lostCount}`],
      ["Tasa de éxito", `${kpis.winRate}%`],
      ["Ticket medio", kpis.avgTicket ? EUR(kpis.avgTicket) : "—"],
      ["Pipeline abierto", `${EUR(kpis.openValue)} (${kpis.openCount} negocios)`],
      ["Previsión ponderada", `${EUR(kpis.weightedValue)} (suma de monto × probabilidad)`],
      ["Ciclo medio de cierre", kpis.avgCycleDays === null ? "—" : `${kpis.avgCycleDays} días`],
      ["Actividades registradas", `${kpis.activitiesCount}`],
      ["Tareas (hechas / abiertas / vencidas)", `${kpis.tasksDone} / ${kpis.tasksOpen} / ${kpis.tasksOverdue}`],
      ["Contactos nuevos", `${kpis.newContacts}`],
    ],
    { columnStyles: { 0: { cellWidth: 78, fontStyle: "bold" } } }
  );

  // ---------- 2. Cuota y cumplimiento ----------
  sectionTitle("2. Objetivo (cuota) y cumplimiento");
  if (quota.monthlyQuota !== null && quota.target !== null) {
    const pct = quota.compliance ?? 0;
    runTable(
      ["Concepto", "Importe"],
      [
        ["Cuota mensual asignada", EUR(quota.monthlyQuota)],
        [`Objetivo del periodo (${PERIOD_LABELS[data.period].toLowerCase()})`, EUR(quota.target)],
        ["Ganado en el periodo", EUR(quota.achieved)],
        ["Cumplimiento", `${pct}%`],
      ],
      {
        columnStyles: { 0: { cellWidth: 78, fontStyle: "bold" } },
        didParseCell: (h) => {
          if (h.section === "body" && h.row.index === 3 && h.column.index === 1) {
            h.cell.styles.textColor = COMPLIANCE_COLOR(pct);
            h.cell.styles.fontStyle = "bold";
            h.cell.styles.fontSize = 10.5;
          }
        },
      }
    );
    const remaining = Math.max(0, quota.target - quota.achieved);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text(
      pct >= 100
        ? `Objetivo superado: quedan ${EUR(quota.achieved - quota.target)} por encima de la meta.`
        : `Faltan ${EUR(remaining)} para alcanzar el objetivo del periodo.`,
      margin,
      y - 2
    );
    y += 4;
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text(
      quota.monthlyQuota === null
        ? "Sin cuota asignada: define un objetivo mensual en Usuarios para calcular el cumplimiento."
        : "En histórico completo no hay objetivo comparable; consulta un periodo concreto.",
      margin,
      y
    );
    y += 8;
  }

  // ---------- 3. Evolución mensual ----------
  sectionTitle("3. Evolución mensual (últimos 6 meses)");
  runTable(
    ["Mes", "Ganado (€)", "Neg. ganados", "Perdidos", "Nuevos negocios"],
    data.monthly.map((m) => [m.label, EUR(m.wonValue), m.wonCount, m.lostCount, m.createdCount]),
    { columnStyles: { 0: { cellWidth: 30, fontStyle: "bold" } } }
  );

  // ---------- 4. Embudo por etapa ----------
  sectionTitle("4. Embudo por etapa (pipeline abierto)");
  runTable(
    ["Etapa", "Prob.", "Nº negocios", "Total (€)", "Ponderado (€)"],
    data.stageStats.map((s) => [s.name, `${s.probability}%`, s.count, EUR(s.total), EUR(s.weighted)]),
    { columnStyles: { 0: { cellWidth: 52, fontStyle: "bold" } } }
  );

  // ---------- 5. Negocios destacados ----------
  sectionTitle("5. Negocios destacados");
  if (data.topOpenDeals.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text("En el embudo", margin, y);
    y += 3;
    runTable(
      ["Negocio", "Empresa", "Etapa", "Importe", "Ponderado"],
      data.topOpenDeals.map((d) => [
        d.title, d.companyName ?? "—", `${d.stageName} (${d.probability}%)`,
        EUR(d.amount), EUR(d.weighted),
      ]),
      { columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } } }
    );
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("Sin negocios abiertos.", margin, y);
    y += 8;
  }

  if (data.topWonDeals.length > 0) {
    if (y > pageH - 50) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(`Ganados (${PERIOD_LABELS[data.period].toLowerCase()})`, margin, y);
    y += 3;
    runTable(
      ["Negocio", "Empresa", "Cierre", "Importe"],
      data.topWonDeals.map((d) => [d.title, d.companyName ?? "—", fmtDateEs(d.closedAt), EUR(d.amount)]),
      { columnStyles: { 3: { halign: "right" } } }
    );
  }

  // ---------- 6. Ranking del equipo ----------
  if (data.ranking && data.ranking.length > 0) {
    sectionTitle("6. Ranking del equipo");
    runTable(
      ["#", "Comercial", "Cuota", "Ganado", "Cumpl.", "Deals (G/P)", "Tasa", "Pipeline", "Previsión", "Activ."],
      data.ranking.map((r, i) => [
        i + 1,
        r.name,
        r.quotaTarget !== null ? EUR(r.quotaTarget) : "—",
        EUR(r.wonValue),
        r.compliance !== null ? `${r.compliance}%` : "—",
        `${r.wonCount}/${r.lostCount}`,
        `${r.winRate}%`,
        EUR(r.openValue),
        EUR(r.weightedValue),
        r.activitiesCount,
      ]),
      {
        columnStyles: {
          0: { cellWidth: 8 }, 1: { cellWidth: 34 }, 3: { halign: "right" },
          4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
          7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right" },
        },
        didParseCell: (h) => {
          if (h.section === "body" && h.column.index === 4) {
            const raw = String(h.cell.raw);
            if (raw.endsWith("%")) {
              h.cell.styles.textColor = COMPLIANCE_COLOR(Number(raw.replace("%", "")));
              h.cell.styles.fontStyle = "bold";
            }
          }
        },
      }
    );
  }

  // ---------- Pie de página en todas las páginas ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`NexoCRM · Informe comercial · ${who}`, margin, pageH - 7);
    doc.text(`Página ${i} de ${pages}`, pageW - margin, pageH - 7, { align: "right" });
  }

  const fileName = `informe-nexocrm-${slug(data.subject.isTeam ? "equipo" : data.subject.name)}-${data.period}.pdf`;
  doc.save(fileName);
}

function fmtDateEs(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}
