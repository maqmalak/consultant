// VVS Pakistan Tax Consultancy Portal — Functional Specification Document (structured pptxgenjs deck, live data from site "consultant")
//   SKILL=<pptx skill dir> NODE_PATH=<node_modules with pptxgenjs, react, react-dom, react-icons, sharp> node build_fsd_deck.js out.pptx
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa6");
const { applyTheme } = require(process.env.SKILL + "/scripts/apply_theme.js");

const D = JSON.parse(fs.readFileSync(path.join(__dirname, "fsd_data.json"), "utf8"));
const IMG = path.join(__dirname, "..", "..", "pakistan_tax_consultancy", "public", "images");
const OUT = process.argv[2] || path.join(__dirname, "VVS_Tax_Portal_FSD.pptx");

const THEME = {
  name: "VVS Tax Portal FSD",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1B1B21", lt1: "FFFFFF", dk2: "141416", lt2: "F3F1EA",
    accent1: "A8811F", accent2: "D4AF37", accent3: "2A78D6", accent4: "1BAF7A", accent5: "EB6834", accent6: "DC2626",
    hlink: "A8811F", folHlink: "6B5214",
  },
};
const HEX = THEME.colors;
const MUTED = "5F6470";
const LINE = "E2DED2";
const SOFT = "B9B4A6";

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.author = "MicroMax Erp Pvt Ltd";
pres.company = "MicroMax Erp Pvt Ltd";
pres.title = "VVS Tax Consultancy Portal — Functional Specification Document";
const C = pres.SchemeColor;
const W = 13.333, H = 7.5, M = 0.55;
const today = "18 Oct 2026";

const money = (v, d = 0) => "Rs " + Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const num = (v) => Number(v || 0).toLocaleString("en-US");

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + color, size: String(size) }));
  return "image/png;base64," + (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64");
}
async function svgPng(file, width) {
  return "image/png;base64," + (await sharp(fs.readFileSync(path.join(IMG, file)), { density: 300 }).resize({ width }).png().toBuffer()).toString("base64");
}

(async () => {
  const MARK = await svgPng("vvs-mark.svg", 256);
  const footer = "VVS Tax Consultancy Portal  ·  Functional Specification Document v1.0";

  // ------------------------------------------------------------------ layouts
  pres.defineSlideMaster({ title: "VVS_COVER", background: { color: HEX.dk2 }, objects: [] });
  pres.defineSlideMaster({
    title: "VVS_SECTION",
    background: { color: HEX.dk2 },
    objects: [
      { image: { data: MARK, x: W - M - 0.5, y: 0.35, w: 0.5, h: 0.5 } },
      { placeholder: { options: { name: "kicker", type: "body", x: M, y: 2.35, w: 9, h: 0.35, fontSize: 13, bold: true, color: C.accent2, charSpacing: 3, margin: 0 }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: M, y: 2.75, w: 11, h: 1.0, fontSize: 40, bold: true, color: C.background1, align: "left", valign: "top", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "sub", type: "body", x: M, y: 3.85, w: 9.5, h: 1.1, fontSize: 16, color: "C9C3B3", align: "left", valign: "top", margin: 0 }, text: "" } },
      { text: { text: footer, options: { x: M, y: H - 0.42, w: 8, h: 0.25, fontSize: 9, color: "8C8677", margin: 0 } } },
    ],
    slideNumber: { x: W - M - 0.6, y: H - 0.42, w: 0.6, h: 0.25, fontSize: 9, color: "8C8677", align: "right" },
  });
  pres.defineSlideMaster({
    title: "VVS_CONTENT",
    background: { color: HEX.lt1 },
    objects: [
      { image: { data: MARK, x: W - M - 0.42, y: 0.38, w: 0.42, h: 0.42 } },
      { placeholder: { options: { name: "kicker", type: "body", x: M, y: 0.36, w: 9, h: 0.3, fontSize: 11, bold: true, color: C.accent1, charSpacing: 2, margin: 0 }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: M, y: 0.66, w: 11.2, h: 0.62, fontSize: 28, bold: true, color: C.text2, align: "left", valign: "middle", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "sub", type: "body", x: M, y: 1.3, w: W - 2 * M, h: 0.45, fontSize: 13, color: MUTED, align: "left", valign: "top", margin: 0 }, text: "" } },
      { text: { text: footer, options: { x: M, y: H - 0.42, w: 8, h: 0.25, fontSize: 9, color: "9C988C", margin: 0 } } },
    ],
    slideNumber: { x: W - M - 0.6, y: H - 0.42, w: 0.6, h: 0.25, fontSize: 9, color: "9C988C", align: "right" },
  });

  function content(section, kicker, title, sub, notes) {
    const s = pres.addSlide({ masterName: "VVS_CONTENT", sectionTitle: section });
    s.addText(kicker, { placeholder: "kicker" });
    s.addText(title, { placeholder: "title" });
    if (sub) s.addText(sub, { placeholder: "sub" });
    if (notes) s.addNotes(notes);
    return s;
  }
  function sectionSlide(section, kicker, title, sub, notes) {
    const s = pres.addSlide({ masterName: "VVS_SECTION", sectionTitle: section });
    s.addText(kicker, { placeholder: "kicker" });
    s.addText(title, { placeholder: "title" });
    if (sub) s.addText(sub, { placeholder: "sub" });
    if (notes) s.addNotes(notes);
    return s;
  }
  const shadow = () => ({ type: "outer", color: "141416", opacity: 0.1, blur: 6, offset: 2, angle: 90 });
  function card(s, x, y, w, h, opts = {}) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.08, fill: { color: opts.fill || C.background1 },
      line: { color: opts.line || LINE, width: 0.75 }, shadow: opts.shadow === false ? undefined : shadow(), objectName: opts.name });
  }
  function txt(s, text, o) { s.addText(text, { isTextBox: true, margin: 0, valign: "top", ...o }); }
  function chip(s, text, x, y, w, color, textColor = C.background1, fontSize = 10) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h: 0.28, rectRadius: 0.14, fill: { color }, line: { color, width: 0 } });
    txt(s, text, { x, y, w, h: 0.28, fontSize, bold: true, color: textColor, align: "center", valign: "middle" });
  }
  async function iconCircle(s, Comp, x, y, d, bg, fg = HEX.lt1) {
    s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg, width: 0 } });
    s.addImage({ data: await icon(Comp, fg), x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52 });
  }
  const TH = (t, o = {}) => ({ text: t, options: { bold: true, color: HEX.accent2, fill: { color: HEX.dk2 }, ...o } });
  function table(s, rows, o) {
    s.addTable(rows, { fontSize: 11, color: C.text1, border: { type: "solid", pt: 0.75, color: LINE }, valign: "middle",
      margin: [0.04, 0.08, 0.04, 0.08], autoPage: false, ...o });
  }

  // ---- DFD primitives (Gane–Sarson): processes, external entities, data stores, flows
  function proc(s, x, y, w, h, id, label, o = {}) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: o.fill || C.background1 },
      line: { color: HEX.accent1, width: o.big ? 2 : 1.5 }, shadow: shadow(), objectName: `Process ${id}` });
    s.addShape(pres.shapes.LINE, { x: x + 0.08, y: y + (o.big ? 0.42 : 0.3), w: w - 0.16, h: 0, line: { color: HEX.accent2, width: 0.75 } });
    txt(s, id, { x, y: y + 0.04, w, h: o.big ? 0.36 : 0.26, fontSize: o.big ? 14 : 11, bold: true, color: HEX.accent1, align: "center", valign: "middle" });
    txt(s, label, { x: x + 0.06, y: y + (o.big ? 0.48 : 0.34), w: w - 0.12, h: h - (o.big ? 0.52 : 0.38), fontSize: o.big ? 16 : 11, bold: true,
      color: C.text2, align: "center", valign: "middle", fontFace: o.big ? "Cambria" : undefined });
  }
  function entity(s, x, y, w, h, label, sub) {
    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: HEX.dk2 }, line: { color: HEX.dk2, width: 0 }, objectName: `Entity ${label}` });
    txt(s, label, { x: x + 0.08, y: y + (sub ? 0.06 : 0), w: w - 0.16, h: sub ? 0.3 : h, fontSize: 12, bold: true, color: HEX.lt1, align: "center", valign: "middle" });
    if (sub) txt(s, sub, { x: x + 0.08, y: y + 0.36, w: w - 0.16, h: h - 0.42, fontSize: 10, color: "C9C3B3", align: "center", valign: "top" });
  }
  function store(s, x, y, w, h, id, label) {
    s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: HEX.lt2 }, line: { color: HEX.lt2, width: 0 }, objectName: `Store ${id}` });
    for (const [lx, ly, lw, lh] of [[x, y, w, 0], [x, y + h, w, 0], [x, y, 0, h], [x + 0.42, y, 0, h]])
      s.addShape(pres.shapes.LINE, { x: lx, y: ly, w: lw, h: lh, line: { color: "6B6455", width: 1 } });
    txt(s, id, { x, y, w: 0.42, h, fontSize: 10, bold: true, color: HEX.accent1, align: "center", valign: "middle" });
    txt(s, label, { x: x + 0.48, y, w: w - 0.52, h, fontSize: 10, bold: true, color: C.text1, valign: "middle" });
  }
  function arrow(s, x1, y1, x2, y2, o = {}) {
    s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
      flipH: x2 < x1, flipV: y2 < y1, line: { color: o.color || "6B6455", width: o.width || 1.25, endArrowType: o.noEnd ? undefined : "triangle",
        beginArrowType: o.both ? "triangle" : undefined, dashType: o.dash ? "dash" : "solid" } });
  }
  function flowLabel(s, text, x, y, w, h = 0.36, o = {}) {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.05, fill: { color: C.background1 }, line: { color: o.line || LINE, width: 0.5 } });
    txt(s, text, { x: x + 0.05, y, w: w - 0.1, h, fontSize: 10, color: C.text1, align: o.align || "center", valign: "middle" });
  }

  const k = D.counts, ins = D.insights, kp = ins.kpis, ex = D.example;

  // ================================================================== 1 cover
  pres.addSection({ title: "Introduction" });
  {
    const s = pres.addSlide({ masterName: "VVS_COVER", sectionTitle: "Introduction" });
    s.addImage({ data: MARK, x: M, y: 0.55, w: 0.62, h: 0.62 });
    txt(s, D.firm.firm_name, { x: M + 0.78, y: 0.6, w: 5, h: 0.3, fontSize: 14, bold: true, color: HEX.lt1, fontFace: "Cambria" });
    txt(s, D.firm.tagline, { x: M + 0.78, y: 0.9, w: 5, h: 0.25, fontSize: 10, color: "C9C3B3" });
    txt(s, "FUNCTIONAL SPECIFICATION DOCUMENT  ·  VERSION 1.0", { x: M, y: 1.75, w: 7.2, h: 0.3, fontSize: 12, bold: true, color: HEX.accent2, charSpacing: 2 });
    txt(s, "Tax Consultancy Portal", { x: M, y: 2.1, w: 7.4, h: 0.85, fontSize: 40, bold: true, color: HEX.lt1, fontFace: "Cambria" });
    txt(s, "Client portal, staff workspace and CRM for income tax returns on FBR IRIS — functional design, data flow diagrams (level 0 and 1), workflow, controls and live data, on ERPNext v16 with a React front end.",
      { x: M, y: 3.0, w: 6.8, h: 1.1, fontSize: 15, color: "D8D2C2" });
    [["FIRM", "Vision Vault Solutions, Faisalabad"], ["SITE", "consultant  ·  ERPNext v16 + React"], ["PARTNER", D.firm.partner_name + " — Audit & Taxation"], ["DATA AS OF", today + "  ·  demo season, live entries"]]
      .forEach(([kk, v], i) => {
        const x = M + (i % 2) * 3.45, y = 4.45 + Math.floor(i / 2) * 0.85;
        txt(s, kk, { x, y, w: 3.3, h: 0.25, fontSize: 10, bold: true, color: "8C8677", charSpacing: 1 });
        txt(s, v, { x, y: y + 0.27, w: 3.3, h: 0.45, fontSize: 13, color: HEX.lt1 });
      });
    const mods = [["01", "Client portal", "Sign-up · OTP · documents · confirm", fa.FaUserCheck], ["02", "Return workflow", "12 states · four-eyes · IRIS evidence", fa.FaFileSignature],
      ["03", "Tax engine & simulator", "Slabs from rules · what-if scenarios", fa.FaCalculator], ["04", "CRM & outreach", "Leads · pipeline · WhatsApp · Lead Finder", fa.FaHandshake],
      ["05", "Billing & accounts", "Packages · proofs → invoice + payment", fa.FaWallet], ["06", "Insights & control", "Dashboards · reports · roles · audit", fa.FaChartLine]];
    for (const [i, [n, t, d, Ic]] of mods.entries()) {
      const y = 0.75 + i * 0.97, x = 8.25;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 4.5, h: 0.82, rectRadius: 0.08, fill: { color: "1F1E22" }, line: { color: "3A352A", width: 0.75 } });
      await iconCircle(s, Ic, x + 0.17, y + 0.14, 0.54, i === 0 ? HEX.accent2 : HEX.accent1, i === 0 ? HEX.dk2 : HEX.lt1);
      txt(s, n, { x: x + 0.85, y: y + 0.12, w: 0.4, h: 0.25, fontSize: 10, bold: true, color: HEX.accent2 });
      txt(s, t, { x: x + 1.2, y: y + 0.1, w: 3.2, h: 0.3, fontSize: 14, bold: true, color: HEX.lt1 });
      txt(s, d, { x: x + 0.85, y: y + 0.44, w: 3.55, h: 0.27, fontSize: 11, color: "C9C3B3" });
    }
    txt(s, "Prepared by MicroMax Erp Pvt Ltd  ·  " + D.firm.address, { x: M, y: H - 0.5, w: 11, h: 0.25, fontSize: 9, color: "8C8677" });
    s.addNotes("Cover. This FSD documents the VVS Tax Consultancy Portal as built and running on the demo site 'consultant'. Figures come from live records on " + today + ".");
  }

  // ================================================================== 2 document control
  {
    const s = content("Introduction", "DOCUMENT CONTROL", "About this document", "Scope, audience and how the specification is organised");
    card(s, M, 1.9, 6.0, 2.6);
    txt(s, "Document information", { x: M + 0.2, y: 2.03, w: 5.6, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    table(s, [[TH("Item"), TH("Detail")], ["Document", "Functional Specification — VVS Tax Portal"], ["Version / date", "1.0  ·  " + today],
      ["System", "ERPNext v16 · Frappe CRM · WhatsApp · React"], ["Audience", "Partner, admin, consultants, implementers"],
      ["Data source", "Live records, site 'consultant' (fake clients)"]], { x: M + 0.2, y: 2.4, w: 5.6, colW: [1.45, 4.15], fontSize: 11 });
    card(s, M, 4.7, 6.0, 2.2);
    txt(s, "Contents", { x: M + 0.2, y: 4.82, w: 5.6, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    const toc = ["System at a glance", "Actors & roles", "DFD level 0 — context", "DFD level 1 — processes", "Client journey & workflow", "Onboarding & verification codes",
      "CRM & lead generation", "Documents · tax · simulator", "Controls · billing · insights", "Security · next steps"];
    toc.forEach((t, i) => {
      const x = M + 0.2 + (i % 2) * 2.85, y = 5.2 + Math.floor(i / 2) * 0.33;
      s.addShape(pres.shapes.OVAL, { x, y: y + 0.02, w: 0.24, h: 0.24, fill: { color: HEX.accent1 }, line: { color: HEX.accent1, width: 0 } });
      txt(s, String(i + 1), { x, y: y + 0.02, w: 0.24, h: 0.24, fontSize: 9, bold: true, color: HEX.lt1, align: "center", valign: "middle" });
      txt(s, t, { x: x + 0.32, y, w: 2.5, h: 0.28, fontSize: 11, color: C.text1, valign: "middle" });
    });
    card(s, 6.85, 1.9, 5.93, 2.6);
    txt(s, "Notation used in the diagrams", { x: 7.05, y: 2.03, w: 5.5, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    proc(s, 7.05, 2.45, 1.6, 0.85, "3.0", "Process");
    entity(s, 8.9, 2.55, 1.55, 0.6, "External entity");
    store(s, 10.7, 2.65, 1.85, 0.42, "D4", "Data store");
    arrow(s, 7.1, 3.85, 8.6, 3.85);
    txt(s, "Data flow (labelled with what moves)", { x: 8.75, y: 3.7, w: 3.9, h: 0.3, fontSize: 11, color: MUTED, valign: "middle" });
    card(s, 6.85, 4.7, 5.93, 2.2);
    txt(s, "Principles the design follows", { x: 7.05, y: 4.82, w: 5.5, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    txt(s, [
      { text: "Rates never live in code — slabs, credits and final-tax rates come from rule records", options: { bullet: true, breakLine: true } },
      { text: "Nothing is shown as filed without an IRIS acknowledgment and receipt", options: { bullet: true, breakLine: true } },
      { text: "Four-eyes: whoever prepares a return cannot approve it", options: { bullet: true, breakLine: true } },
      { text: "Calculators and simulators are labelled as estimates", options: { bullet: true } },
    ], { x: 7.05, y: 5.2, w: 5.55, h: 1.6, fontSize: 12, color: C.text1, paraSpaceAfter: 4 });
  }

  // ================================================================== 3 at a glance
  {
    const s = content("Introduction", "SYSTEM AT A GLANCE", "Live volumes on site 'consultant'", `Record counts on ${today}: a demo filing season (TY2026) walked through the real workflow by the team and the clients`);
    const big = [["Clients", "Taxpayers with masked identifiers", HEX.accent1], ["Tax Returns", `${kp.filed} filed · ${kp.in_progress} in progress`, HEX.accent1],
      ["Tax Documents", "Checklist items, private files", HEX.accent1], ["Audit Events", "Every create / move / approve", HEX.accent1],
      ["Engagements", "Packages sold this season", HEX.accent3], ["Sales Invoices", "Posted from verified proofs", HEX.accent3], ["Site Visits", "Field prospects", HEX.accent3], ["CRM Leads", "Website, WhatsApp, visits, finder", HEX.accent3]];
    big.forEach(([kk, l, col], i) => {
      const x = M + (i % 4) * 3.07, y = 1.9 + Math.floor(i / 4) * 1.42;
      card(s, x, y, 2.87, 1.25);
      txt(s, num(k[kk]), { x: x + 0.2, y: y + 0.12, w: 2.5, h: 0.6, fontSize: 36, bold: true, color: col, fontFace: "Cambria" });
      txt(s, kk, { x: x + 0.2, y: y + 0.72, w: 2.5, h: 0.24, fontSize: 12, bold: true, color: C.text2 });
      txt(s, l, { x: x + 0.2, y: y + 0.96, w: 2.6, h: 0.24, fontSize: 10, color: MUTED });
    });
    const keys = ["Generated PDFs", "Tax Calculations", "Scenarios", "Payment Proofs", "Payment Entries", "Consultations", "CRM Deals", "Lead Prospects",
      "WhatsApp Messages", "WhatsApp Templates", "Services", "Packages", "Document Types", "Tax Years", "Slab Settings", "Staff users"];
    const rows = [[TH("Record"), TH("Count", { align: "right" }), TH("Record"), TH("Count", { align: "right" }), TH("Record"), TH("Count", { align: "right" }), TH("Record"), TH("Count", { align: "right" })]];
    for (let r = 0; r < 4; r++) rows.push([0, 1, 2, 3].flatMap((c) => { const kk = keys[c * 4 + r]; return [kk, { text: num(k[kk]), options: { align: "right", bold: true } }]; }));
    table(s, rows, { x: M, y: 4.85, w: W - 2 * M, colW: [1.86, 0.7, 1.86, 0.7, 1.86, 0.7, 1.86, 0.69], fontSize: 11 });
  }

  // ================================================================== 4 actors & roles
  {
    const s = content("Introduction", "ACTORS & ROLES", "Who uses the system — and whose records they see", "Role decides what kind of access; scope decides which records (enforced on the server for every list and document)");
    const icons = { "System Manager": fa.FaWrench, "Tax Admin": fa.FaUserShield, "Tax Consultant": fa.FaBriefcase, "Tax Reviewer": fa.FaClipboardCheck,
      "Tax Approver": fa.FaCircleCheck, "Filing Officer": fa.FaPaperPlane, "Field Officer": fa.FaLocationDot, Client: fa.FaUser };
    const scopeCol = { all: HEX.accent4, consultant: HEX.accent3, field: HEX.accent5, client: HEX.accent6 };
    const roles = D.roles.filter((r) => r.role !== "System Manager");
    for (const [i, r] of roles.entries()) {
      const x = M + (i % 4) * 3.07, y = 1.9 + Math.floor(i / 4) * 2.5;
      card(s, x, y, 2.87, 2.3);
      await iconCircle(s, icons[r.role] || fa.FaUser, x + 0.2, y + 0.2, 0.6, r.role === "Tax Admin" ? HEX.accent2 : HEX.dk2, r.role === "Tax Admin" ? HEX.dk2 : HEX.accent2);
      txt(s, r.role, { x: x + 0.95, y: y + 0.22, w: 1.85, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
      txt(s, r.role === "Client" ? `${num(r.count)} portal logins` : `${r.count} user${r.count === 1 ? "" : "s"}`, { x: x + 0.95, y: y + 0.52, w: 1.85, h: 0.25, fontSize: 10, color: MUTED });
      txt(s, r.description, { x: x + 0.2, y: y + 0.95, w: 2.5, h: 0.8, fontSize: 11, color: C.text1 });
      const scope = { all: "All clients", consultant: "Assigned clients", field: "Own registrations", client: "Own records only" }[r.scope];
      chip(s, scope, x + 0.2, y + 1.85, 1.75, scopeCol[r.scope] || MUTED, HEX.lt1, 10);
    }
  }

  // ================================================================== 5 DFD level 0
  pres.addSection({ title: "Data flow" });
  {
    const s = content("Data flow", "DFD LEVEL 0  ·  CONTEXT DIAGRAM", "The portal and everything it exchanges data with",
      "One process (the whole system), eight external entities and the data flowing between them",
      "Level 0 treats the portal as a single process. Clients and prospects feed it data; staff act on it; FBR IRIS is reached manually by the filing officer; WhatsApp, SMS and email carry messages and verification codes; Apify supplies business prospects.");
    const P = { x: 5.2, y: 3.6, w: 2.93, h: 1.45 };
    const cx = P.x + P.w / 2, cy = P.y + P.h / 2;
    proc(s, P.x, P.y, P.w, P.h, "0", "VVS Tax Consultancy Portal", { big: true });
    const EW = 2.3, EH = 0.78;
    const ents = [
      { x: M, y: 1.95, label: "Client (taxpayer)", sub: "portal · WhatsApp", to: [P.x, P.y + 0.25], lab: [2.15, 2.85, 2.8], text: "▸ sign-up, answers, documents, fee proof, confirmation\n◂ codes, checklist, return summary, IRIS receipt, letters" },
      { x: M, y: 3.94, label: "Prospect / visitor", sub: "website · walk-in", to: [P.x, cy], lab: [2.95, 3.98, 2.15], text: "▸ enquiry, booking, calculator\n◂ estimate, follow-up" },
      { x: M, y: 5.9, label: "Apify (Google Maps)", sub: "external service", to: [P.x, P.y + P.h - 0.25], lab: [2.2, 5.3, 2.2], text: "▸ business listings\n◂ search (type + city)" },
      { x: W - M - EW, y: 1.95, label: "Firm staff", sub: "consultant · reviewer · approver · filing · admin", to: [P.x + P.w, P.y + 0.25], lab: [8.62, 2.85, 2.65], text: "▸ preparation, reviews, approvals, filing\n◂ queues, inbox, dashboards, reports" },
      { x: W - M - EW, y: 3.94, label: "FBR IRIS", sub: "filed manually by the filing officer", to: [P.x + P.w, cy], lab: [8.3, 3.98, 2.15], text: "◂ approved return figures\n▸ acknowledgment no. + receipt" },
      { x: W - M - EW, y: 5.9, label: "Email server", sub: "outgoing SMTP", to: [P.x + P.w, P.y + P.h - 0.25], lab: [8.75, 5.3, 2.35], text: "◂ notices, portal invites, reports" },
      { x: cx - EW / 2, y: 1.95, label: "WhatsApp Cloud API", sub: "Meta", to: [cx, P.y], lab: [cx + 0.12, 2.82, 1.8], text: "◂ messages, templates, codes\n▸ replies, delivery status" },
      { x: cx - EW / 2, y: 5.9, label: "SMS gateway", sub: "Twilio / bulk SMS", to: [cx, P.y + P.h], lab: [cx + 0.12, 5.2, 1.8], text: "◂ verification codes (backup)" },
    ];
    for (const e of ents) {
      const ex2 = e.x + EW / 2, ey2 = e.y + EH / 2;
      const fromX = e.x + EW < P.x ? e.x + EW : e.x > P.x + P.w ? e.x : ex2;
      const fromY = e.x + EW < P.x || e.x > P.x + P.w ? ey2 : e.y < P.y ? e.y + EH : e.y;
      arrow(s, fromX, fromY, e.to[0], e.to[1], { both: true, color: HEX.accent1 });
    }
    for (const e of ents) {
      entity(s, e.x, e.y, EW, EH, e.label, e.sub);
      const lines = e.text.split("\n").length;
      flowLabel(s, e.text, e.lab[0], e.lab[1], e.lab[2], 0.24 + lines * 0.2, { align: "left" });
    }
    txt(s, "▸ into the portal   ◂ out of the portal", { x: M, y: H - 0.72, w: 5, h: 0.25, fontSize: 10, color: MUTED });
  }

  // ================================================================== 6 DFD level 1
  {
    const s = content("Data flow", "DFD LEVEL 1  ·  PROCESSES & DATA STORES", "Inside the portal: nine processes, eight data stores",
      null,
      "Level 1 opens process 0. The main line runs left to right: a lead becomes a client, buys a package, uploads documents, the return is prepared and calculated, reviewed, confirmed and approved, then filed. Communication (8.0) and reporting (9.0) serve every step; the audit trail records every move.");
    const PW = 1.55, PH = 0.95, GAP = (W - 2 * M - 7 * PW) / 6, PY = 2.55;
    const px = (i) => M + i * (PW + GAP);
    const procs = [["1.0", "Capture & convert leads"], ["2.0", "Onboard & verify client"], ["3.0", "Engage & bill"], ["4.0", "Collect & verify documents"],
      ["5.0", "Prepare return & calculate tax"], ["6.0", "Review, confirm & approve"], ["7.0", "File & acknowledge"]];
    // entities (top)
    const EY = 1.4, EH = 0.5;
    entity(s, px(0), EY, PW, EH, "Prospect · Apify");
    entity(s, px(1), EY, px(3) + PW - px(1), EH, "Client (taxpayer)");
    entity(s, px(4), EY, px(5) + PW - px(4), EH, "Firm staff");
    entity(s, px(6), EY, PW, EH, "FBR IRIS");
    const down = [[0, "enquiry · listings"], [1, "sign-up · code"], [2, "package · fee proof"], [3, "answers · uploads"], [4, "line entries"], [5, "review · approve"], [6, "ack no. · receipt"]];
    for (const [i, lab] of down) {
      const x = px(i) + PW / 2;
      arrow(s, x, EY + EH, x, PY, { both: i === 5 || i === 6, color: HEX.accent1 });
      txt(s, lab, { x: x + 0.06, y: EY + EH + 0.07, w: PW / 2 + GAP - 0.04, h: 0.5, fontSize: 9, color: MUTED });
    }
    // main line
    for (const [i, [id, label]] of procs.entries()) proc(s, px(i), PY, PW, PH, id, label);
    const mainFlows = ["qualified lead", "verified client", "engagement", "documents verified", "calculated return", "approved return"];
    for (let i = 0; i < 6; i++) arrow(s, px(i) + PW, PY + PH / 2, px(i + 1), PY + PH / 2, { color: HEX.dk2, width: 1.75 });
    // data stores under the processes
    const SY = 4.15, SH = 0.42;
    const stores = [[0, "D2", "Leads, deals"], [1, "D1", "Tax clients"], [2, "D3", "Fees, payments"], [3, "D4", "Documents"],
      [4, "D6", "Tax rules"], [5, "D5", "Returns, calcs"], [6, "D7", "Filing records"]];
    for (const [i, id, label] of stores) {
      store(s, px(i), SY, PW, SH, id, label);
      arrow(s, px(i) + PW / 2, PY + PH, px(i) + PW / 2, SY, { both: i !== 4, color: "8C8677", width: 1 });
    }
    arrow(s, px(4) + PW - 0.1, PY + PH, px(5) + 0.2, SY, { color: "8C8677", width: 1 }); // 5.0 writes D5
    // bottom: communication, audit, reporting
    const BY = 4.95, BH = 0.9;
    proc(s, M, BY, 2.3, BH, "8.0", "Communicate & notify");
    entity(s, M + 2.6, BY + 0.12, 2.0, 0.7, "WhatsApp · SMS · Email");
    arrow(s, M + 2.3, BY + BH / 2, M + 2.6, BY + BH / 2, { both: true, color: HEX.accent1 });
    store(s, M, BY + BH + 0.25, 2.3, 0.4, "D8", "Messages & conversations");
    arrow(s, M + 1.15, BY + BH, M + 1.15, BY + BH + 0.25, { both: true, color: "8C8677", width: 1 });
    store(s, 5.5, BY + 0.27, 3.3, 0.42, "D9", "Audit trail — every create, move, approval");
    proc(s, W - M - 2.3, BY, 2.3, BH, "9.0", "Analyse & report");
    arrow(s, 8.8, BY + BH / 2, W - M - 2.3, BY + BH / 2, { color: "8C8677", width: 1 });
    arrow(s, px(5) + PW / 2, SY + SH, W - M - 1.6, BY, { color: "8C8677", width: 1, dash: true });
    arrow(s, px(3) + PW / 2, SY + SH, 7.15, BY + 0.27, { color: "8C8677", width: 1, dash: true });
    arrow(s, px(1) + PW / 2, SY + SH, M + 1.6, BY, { color: "8C8677", width: 1, dash: true });
    txt(s, "every step → D9", { x: 5.5, y: BY - 0.27, w: 3.3, h: 0.25, fontSize: 10, color: MUTED, align: "center" });
    txt(s, "dashboards · insights · reports → staff", { x: W - M - 2.9, y: BY + BH + 0.08, w: 2.9, h: 0.3, fontSize: 10, color: MUTED, align: "right" });
    // flow legend along the main line
    txt(s, "Main line:  " + mainFlows.join("  →  "), { x: 5.0, y: 6.45, w: 5.3, h: 0.45, fontSize: 10, color: MUTED });
  }

  // ================================================================== 7 section: functional modules
  pres.addSection({ title: "Functional modules" });
  sectionSlide("Functional modules", "SECTION 2", "Functional modules", "From first contact to the IRIS acknowledgment: the client journey, the 12-state return workflow and each module that supports it.");

  // ================================================================== 8 client journey
  {
    const s = content("Functional modules", "CLIENT JOURNEY", "Seven steps the client sees in the portal",
      "Every step is dated from the audit trail and shown as a progress tracker to the client and to staff");
    const steps = [["Account", "Sign up, verify mobile with a 6-digit code (WhatsApp first, SMS backup)", fa.FaUserPlus],
      ["Documents", "Answer 10 questions → personalised checklist; upload from the phone", fa.FaFileArrowUp],
      ["In preparation", "Consultant verifies documents, enters lines, calculates tax", fa.FaPenToSquare],
      ["In review", "A second person reviews against a checklist", fa.FaClipboardCheck],
      ["Confirmation", "Client checks the summary and confirms (or asks a question)", fa.FaCircleCheck],
      ["Filed", "Approver signs off; filing officer files on FBR IRIS", fa.FaPaperPlane],
      ["Acknowledged", "IRIS acknowledgment no. + receipt in the client's vault", fa.FaAward]];
    const sw = (W - 2 * M) / 7;
    s.addShape(pres.shapes.LINE, { x: M + sw / 2, y: 2.62, w: W - 2 * M - sw, h: 0, line: { color: HEX.accent2, width: 2 } });
    for (const [i, [t, d, Ic]] of steps.entries()) {
      const x = M + i * sw;
      await iconCircle(s, Ic, x + sw / 2 - 0.36, 2.26, 0.72, i < 4 ? HEX.accent1 : HEX.dk2, i < 4 ? HEX.lt1 : HEX.accent2);
      txt(s, String(i + 1), { x: x + sw / 2 + 0.2, y: 2.12, w: 0.3, h: 0.3, fontSize: 11, bold: true, color: HEX.accent1 });
      txt(s, t, { x: x + 0.08, y: 3.12, w: sw - 0.16, h: 0.32, fontSize: 13, bold: true, color: C.text2, align: "center" });
      txt(s, d, { x: x + 0.08, y: 3.46, w: sw - 0.16, h: 1.1, fontSize: 11, color: MUTED, align: "center" });
    }
    card(s, M, 4.85, W - 2 * M, 1.95, { fill: C.background2, shadow: false, line: C.background2 });
    txt(s, "Where the TY2026 demo season stands", { x: M + 0.25, y: 4.98, w: 6, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    const f = ins.funnel;
    f.forEach((st, i) => {
      const x = M + 0.25 + i * 1.34;
      txt(s, num(st.count), { x, y: 5.35, w: 1.25, h: 0.6, fontSize: 28, bold: true, color: i === f.length - 1 ? HEX.accent4 : HEX.accent1, fontFace: "Cambria" });
      txt(s, st.state.replace("Awaiting Client Confirmation", "Client confirm").replace("Submitted to FBR", "Submitted"), { x, y: 5.98, w: 1.3, h: 0.5, fontSize: 10, color: MUTED });
    });
    txt(s, "Returns that have reached each step (cumulative)", { x: M + 0.25, y: 6.45, w: 8, h: 0.25, fontSize: 10, italic: true, color: MUTED });
  }

  // ================================================================== 9 workflow
  {
    const s = content("Functional modules", "RETURN WORKFLOW", "12 states, 17 moves — a rule checked on each",
      "Frappe Workflow checks the role; the portal's rules check the business conditions before any state change");
    const rows = [[TH("From"), TH("Action"), TH("To"), TH("Who may act"), TH("Rule checked")]];
    const rule = {
      "Documents Complete": "All required documents verified; fee policy", "Submit for Review": "Income lines, final-tax rates, current calculation",
      "Mark Reviewed": "Tax Review saved with checklist", "Request Changes": "Comment required", Approve: "Client confirmed; four-eyes (not the preparer)",
      "Mark Submitted on IRIS": "Approved and unchanged since approval", "Record Acknowledgment": "IRIS ack no. + FBR receipt attached",
      "Report Filing Error": "Error notes required", "Reopen for Review": "Reason required; approval cancelled",
    };
    const short = (st) => st.replace("Awaiting Client Confirmation", "Awaiting Client").replace("Submitted to FBR", "Submitted");
    for (const t of D.transitions.filter((t) => t.action !== "Reopen for Review" || t.from === "Reviewed")) {
      rows.push([short(t.from), { text: t.action, options: { bold: true } }, short(t.to),
        t.roles.join(", ").replace(/Tax /g, ""), { text: rule[t.action] || "—", options: { color: MUTED } }]);
    }
    table(s, rows, { x: M, y: 1.85, w: W - 2 * M, colW: [1.75, 2.15, 1.75, 2.75, 3.83], fontSize: 10, rowH: 0.27 });
    txt(s, "Reopen for Review is also allowed from Awaiting Client and Approved. Any change to signed-off figures cancels the approval automatically; a filed return can only be revised, never edited.",
      { x: M, y: H - 0.85, w: W - 2 * M, h: 0.35, fontSize: 10, italic: true, color: MUTED });
  }

  // ================================================================== 10 onboarding & codes
  {
    const s = content("Functional modules", "MODULE 01  ·  ONBOARDING & VERIFICATION", "A 6-digit code: WhatsApp first, SMS as backup",
      "The code is generated, stored only as a hash, and delivered by the channel order set in Settings → Verification codes");
    const flow = [["Client enters mobile", fa.FaMobileScreen, HEX.dk2], ["Code generated · hashed", fa.FaKey, HEX.accent1], ["WhatsApp authentication template", fa.FaWhatsapp, HEX.accent4],
      ["If it fails: same code by SMS", fa.FaCommentSms, HEX.accent3], ["Client types code · verified", fa.FaCircleCheck, HEX.accent1], ["Account + client record created", fa.FaUserCheck, HEX.dk2]];
    const fw = (W - 2 * M) / 6;
    for (const [i, [t, Ic, col]] of flow.entries()) {
      const x = M + i * fw;
      await iconCircle(s, Ic, x + fw / 2 - 0.34, 1.95, 0.68, col, col === HEX.dk2 ? HEX.accent2 : HEX.lt1);
      if (i < 5) arrow(s, x + fw / 2 + 0.42, 2.29, x + fw * 1.5 - 0.42, 2.29, { color: HEX.accent1 });
      txt(s, t, { x: x + 0.1, y: 2.75, w: fw - 0.2, h: 0.55, fontSize: 12, bold: true, color: C.text2, align: "center" });
    }
    card(s, M, 3.65, 6.0, 3.15);
    txt(s, "Rules", { x: M + 0.2, y: 3.78, w: 5, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    txt(s, [
      { text: "Code expires after 10 minutes; 5 attempts; 5 codes per number per hour", options: { bullet: true, breakLine: true } },
      { text: "Only a hash is stored — never the code; WhatsApp codes bypass the team inbox and API log", options: { bullet: true, breakLine: true } },
      { text: "Channel recorded on each request: WhatsApp, SMS or Failed", options: { bullet: true, breakLine: true } },
      { text: "\"No WhatsApp? Send the code by SMS instead\" on the code screen", options: { bullet: true, breakLine: true } },
      { text: "A mobile that already has an account is sent to sign in", options: { bullet: true } },
    ], { x: M + 0.2, y: 4.15, w: 5.6, h: 2.5, fontSize: 12, color: C.text1, paraSpaceAfter: 5 });
    card(s, 6.85, 3.65, 5.93, 3.15);
    txt(s, "Settings → Verification codes", { x: 7.05, y: 3.78, w: 5.5, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    table(s, [[TH("Setting"), TH("Options")], ["Send codes by", "WhatsApp, then SMS (default) · SMS only · WhatsApp only"],
      ["WhatsApp template", "Meta Authentication template, e.g. vvs_verification_code"], ["SMS provider", "Console (development) · Twilio · HTTP gateway (PK bulk SMS)"],
      ["Secrets", "Auth token / API key stored encrypted, write-only"], ["Test", "Send 000000 to own mobile, WhatsApp-first or SMS only"]],
      { x: 7.05, y: 4.15, w: 5.55, colW: [1.6, 3.95], fontSize: 11 });
  }

  // ================================================================== 11 CRM
  {
    const s = content("Functional modules", "MODULE 02  ·  CRM & LEAD GENERATION", "From enquiry to engaged client in one pipeline",
      "Frappe CRM inside the portal: leads, a tax pipeline, activities, Lead Finder and WhatsApp broadcasts");
    const stages = [["Enquiry", HEX.dk2], ["Consultation", HEX.accent3], ["Proposal Sent", HEX.accent5], ["Documents Pending", HEX.accent1], ["Engaged", HEX.accent4], ["Lost", HEX.accent6]];
    stages.forEach(([t, col], i) => {
      const x = M + i * 2.04;
      s.addShape(pres.shapes.CHEVRON, { x, y: 1.9, w: 1.98, h: 0.55, fill: { color: col }, line: { color: col, width: 0 } });
      txt(s, t, { x: x + 0.22, y: 1.9, w: 1.55, h: 0.55, fontSize: 11, bold: true, color: HEX.lt1, align: "center", valign: "middle" });
    });
    txt(s, "Moving a deal to Engaged creates the Tax Client (with its site-visit details) — no re-typing", { x: M, y: 2.55, w: 9, h: 0.3, fontSize: 11, italic: true, color: MUTED });
    const cards = [
      [fa.FaInbox, "Lead capture", `${num(k["CRM Leads"])} leads`, "Website contact & booking, WhatsApp first message, site visits, walk-ins, Lead Finder — one lead per person (duplicate check on mobile / email)."],
      [fa.FaListCheck, "Activities", "Notes · tasks · calendar", "Lead page: rich notes, follow-up tasks, calendar meetings, WhatsApp (free text or approved template), email from templates."],
      [fa.FaMagnifyingGlassLocation, "Lead Finder", `${num(k["Lead Prospects"])} prospects`, "Google Maps by business type + city through Apify, or public websites; every result reviewed before it becomes a lead."],
      [fa.FaBullhorn, "WhatsApp broadcast", `${num(k["WhatsApp Templates"])} templates`, "One approved template to clients or leads; consent and STOP opt-outs respected; insights per campaign."],
    ];
    for (const [i, [Ic, t, stat, d]] of cards.entries()) {
      const x = M + (i % 2) * 6.17, y = 3.05 + Math.floor(i / 2) * 1.92;
      card(s, x, y, 6.0, 1.75);
      await iconCircle(s, Ic, x + 0.22, y + 0.25, 0.62, HEX.dk2, HEX.accent2);
      txt(s, t, { x: x + 1.05, y: y + 0.2, w: 3, h: 0.32, fontSize: 15, bold: true, color: C.text2 });
      txt(s, stat, { x: x + 3.9, y: y + 0.22, w: 1.9, h: 0.3, fontSize: 11, bold: true, color: HEX.accent1, align: "right" });
      txt(s, d, { x: x + 1.05, y: y + 0.6, w: 4.75, h: 1.05, fontSize: 11, color: C.text1 });
    }
  }

  // ================================================================== 12 documents
  {
    const s = content("Functional modules", "MODULE 03  ·  DOCUMENTS & VAULT", "The right documents, checked once, kept private",
      "Questionnaire answers and the chosen service build each return's checklist; generated letters land in the same vault");
    card(s, M, 1.9, 4.0, 4.9);
    txt(s, "Checklist rules", { x: M + 0.2, y: 2.03, w: 3.6, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    txt(s, [
      { text: "10 yes/no questions (salary, business, rent, capital gains, bank profit, property, vehicle …)", options: { bullet: true, breakLine: true } },
      { text: `${k["Document Types"]} document types, each with a client hint`, options: { bullet: true, breakLine: true } },
      { text: "Requirement rules by client type, taxpayer type, service, year, answer", options: { bullet: true, breakLine: true } },
      { text: "A planning scenario can add evidence (e.g. Zakat certificate) with the reason shown to the client", options: { bullet: true } },
    ], { x: M + 0.2, y: 2.4, w: 3.6, h: 2.7, fontSize: 12, color: C.text1, paraSpaceAfter: 5 });
    txt(s, "Statuses", { x: M + 0.2, y: 5.2, w: 3.6, h: 0.3, fontSize: 12, bold: true, color: C.text2 });
    [["Requested", HEX.accent5], ["Pending", HEX.accent3], ["Verified", HEX.accent4], ["Rejected", HEX.accent6]].forEach(([t, c], i) =>
      chip(s, t, M + 0.2 + (i % 2) * 1.8, 5.55 + Math.floor(i / 2) * 0.38, 1.65, c));
    txt(s, "Upload → staff verify / reject (with reason) → all required verified → return moves to Draft", { x: M + 0.2, y: 6.35, w: 3.6, h: 0.4, fontSize: 10, color: MUTED });
    card(s, 4.8, 1.9, 7.98, 4.9);
    txt(s, `Generated documents  ·  ${num(k["Generated PDFs"])} issued`, { x: 5.0, y: 2.03, w: 7.5, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    const docs = [["Authority Letter", "Client", "Lets the firm file on IRIS for the client"], ["Engagement Letter", "Engagement", "Scope, fee and what is needed"],
      ["Document Checklist", "Return", "Every document, with what is missing"], ["Tax Computation Summary", "Return", "Income, tax, refund or payable on one page"],
      ["Wealth Statement Summary", "Return", "Assets, liabilities and net wealth"], ["Withholding Certificate Request", "Return", "Ready letter to employer or bank"],
      ["Filing Confirmation", "Return", "Only after the IRIS acknowledgment"], ["Tax Planning Report", "Scenario", "What-if vs this year and last year"]];
    table(s, [[TH("Document"), TH("From"), TH("Purpose")], ...docs.map(([a, b, c]) => [{ text: a, options: { bold: true } }, b, c])],
      { x: 5.0, y: 2.42, w: 7.58, colW: [2.5, 1.3, 3.78], fontSize: 11 });
    txt(s, "Jinja print formats on the firm letterhead, rendered to PDF, versioned (v1, v2 …) and stored privately; clients download them from their vault.",
      { x: 5.0, y: 6.05, w: 7.5, h: 0.6, fontSize: 11, italic: true, color: MUTED });
  }

  // ================================================================== 13 tax engine
  {
    const r = ex.result;
    const s = content("Functional modules", "MODULE 04  ·  TAX ENGINE", "How a return's tax is calculated",
      `Worked example: ${ex.name} · ${ex.client} · TY${ex.tax_year} · ${ex.taxpayer_type} · demo rates`);
    const steps = [["Total income", r.gross_income, "+"], ["Deductible allowances", r.total_deductions, "−"], ["Taxable income (normal)", r.taxable_income, "="],
      ["Tax on taxable income (slab)", r.normal_tax, "+"], ["Final / separate-block tax", r.separate_tax, "+"], ["Tax credits", r.total_tax_credits, "−"],
      ["Tax liability", r.tax_liability, "="], ["Tax withheld / advance tax", r.tax_paid, "−"], [r.refund_due ? "Refund due" : "Payable", r.refund_due || r.net_payable, "="]];
    card(s, M, 1.9, 6.4, 4.9);
    steps.forEach(([l, v, sign], i) => {
      const y = 2.08 + i * 0.5, strong = sign === "=";
      if (strong) s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M + 0.15, y: y - 0.04, w: 6.1, h: 0.44, rectRadius: 0.06, fill: { color: i === 8 ? HEX.dk2 : HEX.lt2 }, line: { color: HEX.lt2, width: 0 } });
      s.addShape(pres.shapes.OVAL, { x: M + 0.3, y: y + 0.05, w: 0.28, h: 0.28, fill: { color: sign === "−" ? HEX.accent4 : sign === "=" ? HEX.accent1 : HEX.accent2 }, line: { width: 0, color: HEX.accent2 } });
      txt(s, sign, { x: M + 0.3, y: y + 0.05, w: 0.28, h: 0.28, fontSize: 12, bold: true, color: HEX.lt1, align: "center", valign: "middle" });
      txt(s, l, { x: M + 0.75, y, w: 3.6, h: 0.38, fontSize: 13, bold: strong, color: i === 8 ? HEX.lt1 : C.text1, valign: "middle" });
      txt(s, money(v, v % 1 ? 1 : 0), { x: M + 4.2, y, w: 1.9, h: 0.38, fontSize: 13, bold: strong, color: i === 8 ? HEX.accent2 : C.text1, align: "right", valign: "middle" });
    });
    card(s, 7.15, 1.9, 5.63, 4.9);
    txt(s, `Slab table · ${ex.taxpayer_type} · TY${ex.tax_year}`, { x: 7.35, y: 2.03, w: 5.2, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    const slabRows = [[TH("Taxable income from"), TH("to"), TH("Fixed", { align: "right" }), TH("Rate", { align: "right" })]];
    for (const sl of ex.slabs) {
      const on = sl.from_amount === ex.slab.from_amount;
      const o = on ? { bold: true, fill: { color: "F6EBC8" } } : {};
      slabRows.push([{ text: money(sl.from_amount), options: o }, { text: sl.to_amount ? money(sl.to_amount) : "and above", options: o },
        { text: money(sl.fixed_tax), options: { align: "right", ...o } }, { text: sl.rate_percent + "%", options: { align: "right", ...o } }]);
    }
    table(s, slabRows, { x: 7.35, y: 2.42, w: 5.23, colW: [1.55, 1.5, 1.23, 0.95], fontSize: 11 });
    txt(s, `Highlighted slab applies: ${money(ex.slab.fixed_tax)} + ${ex.slab.rate_percent}% of the amount above ${money(ex.slab.from_amount)}. Separate-block income (bank profit) is taxed at the rate entered on its line; credits reduce normal tax only.`,
      { x: 7.35, y: 4.75, w: 5.23, h: 0.9, fontSize: 11, color: C.text1 });
    txt(s, "Slabs, credit rules and tax years are records — the firm updates them each Finance Act, no code change. Demo rates must be validated before live use.",
      { x: 7.35, y: 5.75, w: 5.23, h: 0.8, fontSize: 11, italic: true, color: MUTED });
  }

  // ================================================================== 14 simulator
  {
    const s = content("Functional modules", "MODULE 05  ·  TAX SIMULATOR & SCENARIOS", "Plan first, then apply the final scenario",
      "Same engine and rates as the return; nothing changes the return until a consultant applies a scenario");
    const steps = [["Move levers", "Income per group, add-backs, allowances, credits, tax paid — sliders and amounts", fa.FaSliders],
      ["Compare", "Last year's filed return · this year's actual · simulated — table and chart", fa.FaScaleBalanced],
      ["Save scenarios", "Name + client notes; compare up to 3; lowest tax marked", fa.FaFloppyDisk],
      ["PDF report", "Tax Planning Report PDF into the client's vault", fa.FaFilePdf],
      ["Apply", "Preview line changes → write lines → recalculate → request evidence", fa.FaFileImport]];
    const sw = (W - 2 * M) / 5;
    for (const [i, [t, d, Ic]] of steps.entries()) {
      const x = M + i * sw;
      card(s, x + 0.08, 1.9, sw - 0.16, 2.55, { fill: i === 4 ? HEX.dk2 : C.background1, line: i === 4 ? HEX.dk2 : LINE });
      await iconCircle(s, Ic, x + 0.28, 2.1, 0.6, i === 4 ? HEX.accent2 : HEX.dk2, i === 4 ? HEX.dk2 : HEX.accent2);
      txt(s, `${i + 1}  ${t}`, { x: x + 0.28, y: 2.82, w: sw - 0.45, h: 0.3, fontSize: 13, bold: true, color: i === 4 ? HEX.lt1 : C.text2 });
      txt(s, d, { x: x + 0.28, y: 3.2, w: sw - 0.5, h: 1.15, fontSize: 11, color: i === 4 ? "D8D2C2" : C.text1 });
      if (i < 4) arrow(s, x + sw - 0.12, 3.17, x + sw + 0.12, 3.17, { color: HEX.accent1 });
    }
    card(s, M, 4.7, W - 2 * M, 2.1, { fill: C.background2, shadow: false, line: C.background2 });
    txt(s, "Safeguards when a scenario is applied", { x: M + 0.25, y: 4.83, w: 6, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    const g = [["Only while preparing", "Documents Pending, Draft or Changes Required"], ["One at a time", "Undo the applied scenario before another"],
      ["Evidence required", "New deductions / credits add required documents — Submit for Review blocked until verified"], ["Undo", "Restores every line exactly and recalculates"]];
    g.forEach(([a, b], i) => {
      const x = M + 0.25 + i * 3.05;
      txt(s, a, { x, y: 5.25, w: 2.85, h: 0.3, fontSize: 12, bold: true, color: HEX.accent1 });
      txt(s, b, { x, y: 5.57, w: 2.85, h: 1.0, fontSize: 11, color: C.text1 });
    });
  }

  // ================================================================== 15 controls
  pres.addSection({ title: "Controls & operations" });
  {
    const s = content("Controls & operations", "REVIEW, APPROVAL & FILING CONTROLS", "Built-in controls that protect client and firm",
      "Each control is enforced on the server when the state changes — not only hidden in the screen");
    const ctrls = [[fa.FaUsers, "Four-eyes approval", "The preparer can never approve; approval needs the client's confirmation first."],
      [fa.FaFingerprint, "Content hash", "Approval stores a hash of the figures; any change cancels it and reopens review."],
      [fa.FaClipboardList, "Review checklist", "Mark Reviewed needs a saved Tax Review with every checklist item answered."],
      [fa.FaReceipt, "IRIS evidence", "Acknowledged only with the IRIS number and the FBR receipt attached."],
      [fa.FaLock, "Filed is final", "A filed return cannot change — a revised return is created instead."],
      [fa.FaClockRotateLeft, "Audit trail", `${num(k["Audit Events"])} events: who moved what, from which state, when.`]];
    for (const [i, [Ic, t, d]] of ctrls.entries()) {
      const x = M + (i % 3) * 4.11, y = 1.9 + Math.floor(i / 3) * 2.2;
      card(s, x, y, 3.95, 2.0);
      await iconCircle(s, Ic, x + 0.22, y + 0.22, 0.62, HEX.dk2, HEX.accent2);
      txt(s, t, { x: x + 1.0, y: y + 0.3, w: 2.8, h: 0.4, fontSize: 15, bold: true, color: C.text2 });
      txt(s, d, { x: x + 0.22, y: y + 0.98, w: 3.5, h: 0.95, fontSize: 12, color: C.text1 });
    }
  }

  // ================================================================== 16 billing
  {
    const s = content("Controls & operations", "BILLING & ACCOUNTING", "Packages, fee proofs and the ERPNext postings",
      `This season: ${money(kp.billed)} billed · ${money(kp.collected)} collected · ${money(kp.outstanding)} outstanding`);
    const chain = [["Package chosen", "Client orders in the portal (promo codes optional)", fa.FaCartShopping], ["Engagement", "Fee, discount, payment status", fa.FaFileContract],
      ["Payment proof", "Raast / bank / JazzCash / Easypaisa reference", fa.FaMoneyCheckDollar], ["Verified by admin", "Approve or reject with reason", fa.FaUserCheck],
      ["Posted to accounts", "Sales Invoice + Payment Entry in ERPNext", fa.FaBuildingColumns]];
    const cw = (W - 2 * M) / 5;
    for (const [i, [t, d, Ic]] of chain.entries()) {
      const x = M + i * cw;
      await iconCircle(s, Ic, x + cw / 2 - 0.34, 1.9, 0.68, i === 4 ? HEX.accent1 : HEX.dk2, i === 4 ? HEX.lt1 : HEX.accent2);
      if (i < 4) arrow(s, x + cw / 2 + 0.42, 2.24, x + cw * 1.5 - 0.42, 2.24, { color: HEX.accent1 });
      txt(s, t, { x: x + 0.1, y: 2.7, w: cw - 0.2, h: 0.32, fontSize: 13, bold: true, color: C.text2, align: "center" });
      txt(s, d, { x: x + 0.1, y: 3.03, w: cw - 0.2, h: 0.6, fontSize: 11, color: MUTED, align: "center" });
    }
    card(s, M, 3.95, 6.0, 2.85);
    txt(s, "Packages on the website", { x: M + 0.2, y: 4.08, w: 5.6, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    table(s, [[TH("Package"), TH("Service"), TH("Turnaround"), TH("Price", { align: "right" })],
      ...D.packages.map((p) => [{ text: p.package_name, options: { bold: true } }, p.service, p.turnaround || "—", { text: money(p.price), options: { align: "right" } }])],
      { x: M + 0.2, y: 4.45, w: 5.6, colW: [1.55, 1.75, 1.3, 1.0], fontSize: 11 });
    card(s, 6.85, 3.95, 5.93, 2.85);
    txt(s, "Packages sold · TY2026", { x: 7.05, y: 4.08, w: 5.5, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    s.addChart(pres.charts.BAR, [{ name: "Fees", labels: ins.mix.packages.map((p) => p.name), values: ins.mix.packages.map((p) => p.fees) }], {
      x: 7.05, y: 4.4, w: 5.55, h: 2.3, barDir: "bar", chartColors: [HEX.accent1], showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '"Rs "#,##0',
      dataLabelFontSize: 10, dataLabelColor: "1B1B21", dataLabelFontFace: "+mn-lt", catAxisLabelColor: MUTED, catAxisLabelFontSize: 10, catAxisLabelFontFace: "+mn-lt",
      valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" }, showLegend: false, barGapWidthPct: 60 });
  }

  // ================================================================== 17 insights & reports
  {
    const s = content("Controls & operations", "INSIGHTS & REPORT CENTER", "The season at a glance, and every report",
      "Insights and reports are scoped like everything else: a consultant sees only their own clients");
    const kpis = [[`${kp.filed} / ${kp.returns}`, "returns filed"], [`${kp.avg_days_to_file} d`, "order → IRIS ack (avg)"], [`${kp.visit_conversion}%`, "field visits → clients"], [money(kp.outstanding), "fees outstanding"]];
    kpis.forEach(([v, l], i) => {
      const x = M + i * 3.07;
      card(s, x, 1.9, 2.87, 1.05);
      txt(s, v, { x: x + 0.2, y: 1.98, w: 2.5, h: 0.55, fontSize: 26, bold: true, color: HEX.accent1, fontFace: "Cambria" });
      txt(s, l, { x: x + 0.2, y: 2.55, w: 2.5, h: 0.3, fontSize: 11, color: MUTED });
    });
    card(s, M, 3.15, 7.6, 3.65);
    s.addChart(pres.charts.LINE, [
      { name: "Returns started", labels: ins.trend.map((t) => t.label), values: ins.trend.map((t) => t.returns_started) },
      { name: "Returns filed", labels: ins.trend.map((t) => t.label), values: ins.trend.map((t) => t.returns_filed) },
      { name: "New clients", labels: ins.trend.map((t) => t.label), values: ins.trend.map((t) => t.new_clients) },
    ], { x: M + 0.15, y: 3.25, w: 7.3, h: 3.45, chartColors: ["2A78D6", "EB6834", "1BAF7A"], lineSize: 2, lineDataSymbolSize: 7,
      showTitle: true, title: "Season trend (per month)", titleFontSize: 13, titleColor: "1B1B21", titleFontFace: "+mn-lt",
      showLegend: true, legendPos: "b", legendFontSize: 10, legendFontFace: "+mn-lt", legendColor: MUTED,
      catAxisLabelColor: MUTED, catAxisLabelFontSize: 10, catAxisLabelFontFace: "+mn-lt", valAxisLabelColor: MUTED, valAxisLabelFontSize: 10, valAxisLabelFontFace: "+mn-lt",
      valGridLine: { color: "E2DED2", size: 0.5 }, catGridLine: { style: "none" } });
    card(s, 8.35, 3.15, 4.43, 3.65);
    txt(s, `Report center  ·  ${D.reports.length} reports`, { x: 8.55, y: 3.28, w: 4, h: 0.3, fontSize: 14, bold: true, color: C.text2 });
    txt(s, D.reports.map((r, i) => ({ text: r, options: { bullet: true, breakLine: i < D.reports.length - 1 } })),
      { x: 8.55, y: 3.65, w: 4.05, h: 2.6, fontSize: 11, color: C.text1, paraSpaceAfter: 2 });
    txt(s, "Run in the portal · filter · sort · search · CSV · open in desk", { x: 8.55, y: 6.35, w: 4.05, h: 0.3, fontSize: 10, italic: true, color: MUTED });
  }

  // ================================================================== 18 roles matrix
  {
    const s = content("Controls & operations", "ROLES & PERMISSIONS", "What each role may do on the key records",
      "R read · E edit · C create · D delete. Editable per role in Setup → Roles & Permissions (Tax Admin, System Manager and Client are fixed)");
    const roles = ["Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver", "Filing Officer", "Field Officer", "Client"];
    const keyDocs = ["Tax Client", "Tax Return", "Tax Document", "Tax Calculation", "Tax Review", "Tax Approval", "Filing Record", "Payment Proof", "Site Visit", "Tax Scenario", "Tax Slab Setting", "Generated Document"];
    const letter = { read: "R", write: "E", create: "C", delete: "D" };
    const rows = [[TH("Record"), ...roles.map((r) => TH(r.replace("Tax ", ""), { align: "center" }))]];
    for (const d of D.matrix.filter((x) => keyDocs.includes(x.doctype))) {
      rows.push([{ text: d.doctype, options: { bold: true } }, ...roles.map((r) => {
        const p = d.rules[r] || [];
        return { text: p.length ? p.map((x) => letter[x]).join(" ") : "·", options: { align: "center", color: p.length ? (p.length > 1 ? HEX.accent1 : C.text1) : SOFT, bold: p.length > 1 } };
      })]);
    }
    table(s, rows, { x: M, y: 1.95, w: W - 2 * M, colW: [2.35, ...roles.map(() => 1.41)], fontSize: 11, rowH: 0.32 });
  }

  // ================================================================== 19 security
  {
    const s = content("Controls & operations", "SECURITY, PRIVACY & COMPLIANCE", "Client data stays private by design", null);
    const items = [[fa.FaIdCard, "Identifiers masked", "CNIC shown as *****-*******-1; NTN and bank details never sent by WhatsApp or in templates."],
      [fa.FaFolderClosed, "Private files", "Documents and generated PDFs are private files, streamed only after a permission check."],
      [fa.FaUserLock, "Record-level isolation", "Every list and document is filtered by scope: all / assigned / own registrations / own portal."],
      [fa.FaKey, "Secrets write-only", "Tokens and API keys stored encrypted; the browser only learns whether one is set."],
      [fa.FaShieldHalved, "Codes hashed", "Verification codes stored as hashes, rate-limited, never logged in readable form."],
      [fa.FaHandshakeAngle, "Consent", "Privacy consent at sign-up; WhatsApp only with opt-in; STOP honoured in broadcasts."]];
    for (const [i, [Ic, t, d]] of items.entries()) {
      const x = M + (i % 2) * 6.17, y = 1.55 + Math.floor(i / 2) * 1.75;
      card(s, x, y, 6.0, 1.55);
      await iconCircle(s, Ic, x + 0.22, y + 0.3, 0.62, HEX.accent1);
      txt(s, t, { x: x + 1.05, y: y + 0.22, w: 4.8, h: 0.35, fontSize: 15, bold: true, color: C.text2 });
      txt(s, d, { x: x + 1.05, y: y + 0.62, w: 4.8, h: 0.85, fontSize: 12, color: C.text1 });
    }
  }

  // ================================================================== 20 integrations
  {
    const s = content("Controls & operations", "INTEGRATIONS & SETTINGS", "External services: live today, and what waits",
      "Configured in Setup → Settings by the Tax Admin; secrets are stored encrypted");
    const rows = [[TH("Integration"), TH("Used for"), TH("Status on this site"), TH("Needed to go live")],
      ["WhatsApp Cloud API (Meta)", "Inbox, templates, broadcasts, codes", { text: "Test mode — nothing leaves the server", options: { color: HEX.accent5, bold: true } }, "Meta app, phone ID, token, approved templates"],
      ["SMS gateway", "Verification-code backup", { text: "Console (development)", options: { color: HEX.accent5, bold: true } }, "Twilio or PK bulk-SMS link + PTA sender ID"],
      ["Outgoing email", "Notices, invites, direct email", { text: "Not set up", options: { color: HEX.accent6, bold: true } }, "SMTP account (Settings → Email)"],
      ["Apify (Google Maps)", "Lead Finder searches", { text: "Live — token saved", options: { color: HEX.accent4, bold: true } }, "—"],
      ["Payment gateway", "Online fee payment", { text: "Manual proofs only", options: { color: HEX.accent5, bold: true } }, "Choose JazzCash / Easypaisa / Safepay"],
      ["FBR IRIS", "Return filing", { text: "Manual by filing officer", options: { color: HEX.accent3, bold: true } }, "No official API — evidence attached by hand"],
      ["ERPNext Accounts", "Invoices and payment entries", { text: "Live", options: { color: HEX.accent4, bold: true } }, "—"]];
    table(s, rows, { x: M, y: 1.95, w: W - 2 * M, colW: [2.6, 3.0, 3.1, 3.53], fontSize: 12, rowH: 0.48 });
  }

  // ================================================================== 21 next steps
  pres.addSection({ title: "Next steps" });
  {
    const s = pres.addSlide({ masterName: "VVS_SECTION", sectionTitle: "Next steps" });
    s.addText("NEXT STEPS", { placeholder: "kicker" });
    s.addText("Decisions needed to go live", { placeholder: "title" });
    const items = [["Validate tax rates", "Slabs and credit rules are demo values — confirm against the Finance Act"], ["Connect messaging", "Meta WhatsApp account + authentication template; SMS provider"],
      ["Set up email", "Outgoing SMTP for notices and invites"], ["Confirm prices", "Express Filing Rs 10,000 shown vs Rs 12,000 discussed"],
      ["Firm payment details", "Bank / Raast / wallet titles for the How to pay box"], ["Targets (SLAs)", "Days allowed per step for the late flags"]];
    items.forEach(([t, d], i) => {
      const x = M + (i % 3) * 4.11, y = 4.2 + Math.floor(i / 3) * 1.3;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 3.95, h: 1.1, rectRadius: 0.08, fill: { color: "1F1E22" }, line: { color: "3A352A", width: 0.75 } });
      txt(s, `${i + 1}`, { x: x + 0.2, y: y + 0.15, w: 0.4, h: 0.4, fontSize: 20, bold: true, color: HEX.accent2, fontFace: "Cambria" });
      txt(s, t, { x: x + 0.65, y: y + 0.15, w: 3.15, h: 0.32, fontSize: 14, bold: true, color: HEX.lt1 });
      txt(s, d, { x: x + 0.65, y: y + 0.5, w: 3.15, h: 0.55, fontSize: 11, color: "C9C3B3" });
    });
    s.addNotes("Close on the owner decisions that block go-live. Everything else in this document is built and running on the demo site.");
  }

  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("Wrote", OUT);
})();
