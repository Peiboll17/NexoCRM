// 1) Copia las capturas a docs/screenshots/ optimizadas a 1200px de ancho (PNG)
// 2) Genera THIRDPARTY-NOTICES.md escaneando node_modules/**/package.json
const sharp = require("/home/z/my-project/node_modules/sharp");
const fs = require("fs");
const path = require("path");

const ROOT = "/home/z/my-project";
const SHOTS = "/tmp/shots";
const OUT = path.join(ROOT, "docs", "screenshots");

const RENAME = {
  "00-login.png": "login.png",
  "01-dashboard.png": "dashboard.png",
  "02-reportes.png": "reports-team.png",
  "03-reporte-comercial.png": "report-comercial.png",
  "04-pipeline.png": "pipeline.png",
  "05-contactos.png": "contacts.png",
  "06-tareas.png": "tasks.png",
  "07-automatizaciones.png": "automations.png",
  "08-usuarios.png": "users.png",
};

async function optimizeShots() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [src, dst] of Object.entries(RENAME)) {
    const p = path.join(SHOTS, src);
    if (!fs.existsSync(p)) { console.log("⚠ falta", src); continue; }
    await sharp(p)
      .resize({ width: 1200, withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true, quality: 92 })
      .toFile(path.join(OUT, dst));
    console.log(`✓ ${dst} (${Math.round(fs.statSync(path.join(OUT, dst)).size / 1024)} KB)`);
  }
}

// ---------- Licencias de terceros ----------
function collectPackages(dir, found) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.name === "node_modules") { collectPackages(full, found); continue; }
    const pkgPath = path.join(full, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const p = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        if (p.name && p.version) found.set(`${p.name}@${p.version}`, p);
      } catch { /* paquete corrupto: omitir */ }
    }
    // paquetes anidados (versiones duplicadas)
    const nested = path.join(full, "node_modules");
    if (fs.existsSync(nested)) collectPackages(nested, found);
  }
}

function authorText(p) {
  if (typeof p.author === "string") return p.author;
  if (p.author?.name) return p.author.name;
  if (typeof p.publisher === "string") return p.publisher;
  if (Array.isArray(p.contributors) && p.contributors[0]) return (p.contributors[0].name ?? p.contributors[0]);
  if (p.maintainers?.[0]) return (p.maintainers[0].name ?? p.maintainers[0]);
  return "—";
}

function repoUrl(p) {
  const r = p.repository;
  const url = typeof r === "string" ? r : r?.url;
  if (!url) return p.homepage ?? "—";
  return url.replace(/^git\+/, "").replace(/\.git$/, "").replace(/^git:\/\//, "https://").replace(/^ssh:\/\/git@/, "https://");
}

async function genNotices() {
  const found = new Map();
  collectPackages(path.join(ROOT, "node_modules"), found);
  const pkgs = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));

  const byLicense = {};
  for (const p of pkgs) {
    const lic = (typeof p.license === "string" ? p.license : p.license?.type) ?? "SEE LICENSE IN PACKAGE";
    byLicense[lic] = (byLicense[lic] ?? 0) + 1;
  }
  const licSummary = Object.entries(byLicense).sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `| ${l} | ${n} |`).join("\n");

  const rows = pkgs.map((p) => {
    const lic = (typeof p.license === "string" ? p.license : p.license?.type) ?? "SEE LICENSE IN PACKAGE";
    const home = repoUrl(p);
    const link = home !== "—" ? `[${p.name}](${home})` : p.name;
    return `| ${link} | \`${p.version}\` | ${lic} | ${authorText(p)} |`;
  }).join("\n");

  const md = `# Avisos de licencias de terceros (THIRD-PARTY NOTICES)

Este documento lista las dependencias de software de terceros incluidas en NexoCRM
y sus respectivas licencias, conforme a los requisitos de redistribución de las
licencias aplicables (MIT, ISC, BSD, Apache-2.0, etc.).

- Generado automáticamente a partir de \`node_modules/**/package.json\`
  el ${new Date().toISOString().slice(0, 10)} · **${pkgs.length} paquetes**.
- El texto completo de cada licencia está disponible en el repositorio de cada
  paquete (columna «Paquete») y en el archivo \`LICENSE\`/\`LICENSE.md\` dentro
  de su carpeta en \`node_modules\`.
- Este aviso se proporciona «tal cual», sin garantía de exactitud: revisa la
  licencia de cada paquete antes de cualquier redistribución comercial.

## Resumen por tipo de licencia

| Licencia | Paquetes |
|---|---|
${licSummary}

## Listado completo

| Paquete | Versión | Licencia | Autoría |
|---|---|---|---|
${rows}
`;
  fs.writeFileSync(path.join(ROOT, "THIRDPARTY-NOTICES.md"), md);
  console.log(`✓ THIRDPARTY-NOTICES.md (${pkgs.length} paquetes)`);
}

(async () => {
  await optimizeShots();
  await genNotices();
})();
