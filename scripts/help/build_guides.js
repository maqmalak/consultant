// Builds the A4 help guides (public/help/<slug>.pdf) from live screenshots of the demo site.
// It only opens pages, folders and previews; it never saves anything.
//
//   cd apps/pakistan_tax_consultancy && DEMO_PWD=… node scripts/help/build_guides.js [slug …]
//
// Staff screens are taken as the demo Tax Admin, client screens as the demo salaried client.
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://consultant.localhost:8010";
const PWD = process.env.DEMO_PWD;
const OUT = path.join(__dirname, "..", "..", "pakistan_tax_consultancy", "public", "help");
const SAMPLE = path.join(__dirname, "sample_import.xlsx");
const FILLED = path.join(__dirname, "sample_filled.xlsx");
const { sheetHtml } = require("./excel_view");
const STAFF = "admin@demo.taxportal.example";
const CLIENT = "salaried@demo.taxportal.example";
const R = { draft: "TAX-RET-2026-00003", review: "TAX-RET-2026-00022", awaiting: "TAX-RET-2026-00001", filed: "TAX-RET-2026-00004",
  approved: "TAX-RET-2026-00012" };
const FOLDER_CLIENT = "TAX-CLIENT-2026-00571";
// DEMO_SIDS (JSON {email: sid}) signs in with existing sessions instead of the password
const SIDS = JSON.parse(process.env.DEMO_SIDS || "{}");
if (!PWD && !Object.keys(SIDS).length) { console.error("Set DEMO_PWD or DEMO_SIDS"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const step = (label) => async (p) => {
  await p.getByRole("navigation", { name: "Steps" }).getByRole("button", { name: label }).first().click();
  await sleep(1200);
};
const clickText = (text) => async (p) => { await p.getByText(text, { exact: false }).first().click(); await sleep(1200); };
const both = (...fns) => async (p) => { for (const f of fns) await f(p); };

// shot: [who, url, caption, action?]
const GUIDES = {
  "process-overview": {
    title: "How a return moves<br>through VVS", kicker: "Start here",
    intro: "Every income tax return follows the same steps, and every step belongs to one role. The portal sends each return to the right queue and keeps a record of who did what.",
    chips: [["Register", "Client, code, invite"], ["Documents", "Upload, verify"], ["Prepare", "Income, calculate"], ["Review & confirm", "Checklist, client OK, approve"], ["File", "IRIS, acknowledgment"]],
    who: "<b>Consultant</b> · <b>Data entry</b> · <b>Reviewer</b> · <b>Approver</b> · <b>Filing officer</b> · the <b>client</b> in the portal",
    sections: [
      { h: "The steps and who does them", table: [["Documents Pending", "Consultant", "The checklist is collected; the return moves on when the last required document is verified."],
        ["Draft", "Consultant, data entry", "Income, deductions and withholding entered; tax calculated."], ["Pending / Under Review", "Reviewer", "Review checklist; changes or reviewed."],
        ["Awaiting Client Confirmation", "Client", "The client confirms the figures in the portal (or staff record it on their behalf)."],
        ["Approved", "Approver", "Never the person who prepared it. The figures are fingerprinted."], ["Submitted to FBR → Acknowledged", "Filing officer", "Filed on IRIS; acknowledgment number and receipt recorded."]] },
      { h: "Where you see your work", items: ["The <b>Dashboard</b> counts your clients, returns, documents to verify, overdue returns and follow-ups.", "Each step has a <b>queue</b> in the left menu; open a return from there.", "A return's page shows its step chain at the top and its history."],
        shots: [["staff", "/staff/dashboard", "Dashboard: your clients, returns and queues."], ["staff", `/staff/returns/${R.draft}`, "A return: the steps of the wizard, and the actions allowed now."]] },
      { h: "Rules that protect everyone", items: ["A figure changed after review or approval sends the return back to review and cancels the approval.", "The preparer can never approve the same return.", "A return is shown as filed only with an IRIS acknowledgment number.", "Downloads and status changes are written to the audit log."] },
    ] },
  setup: {
    title: "Setup — firm, team,<br>roles and Ask VVS", kicker: "Tax admin guide",
    intro: "What the Tax Admin sets once: the firm's details and website, the connections (WhatsApp, email, payments), the team and their roles.",
    chips: [["Website", "Firm, services, FAQ"], ["Settings", "WhatsApp, email, pay"], ["Team", "Logins, roles"], ["Roles", "Who may do what"], ["Ask VVS", "Per person"]],
    who: "<b>Tax Admin</b>",
    sections: [
      { h: "Website & rules", items: ["<b>Website & Rules</b>: firm name, contact details, services and prices, FAQ, tax updates and testimonials (only with the client's consent)."],
        shots: [["staff", "/staff/content", "Website & Rules."]] },
      { h: "Settings", items: ["<b>WhatsApp</b>: click-to-chat works now; the Cloud API sends automatic updates once Meta approves the templates.", "<b>Email</b>: the outgoing account for invitations and notices.", "<b>Payments</b>: the bank and wallet details clients pay to.", "Secrets are stored encrypted and never shown again."],
        shots: [["staff", "/staff/settings", "Settings: firm, WhatsApp, email, payments."]] },
      { h: "Team, roles and Ask VVS", items: ["<b>Team</b>: add a person, give the role they work in, and switch <b>Ask VVS</b> on for them.", "<b>Roles & Permissions</b>: what each role may read and change."],
        shots: [["staff", "/staff/team", "Team: roles and the Ask VVS switch."], ["staff", "/staff/roles", "Roles & Permissions."]] },
    ] },
  "new-client": {
    title: "Register a client<br>and invite them", kicker: "Consultant guide",
    intro: "A client who comes to the office or calls: register them once, give them a permanent client code, and invite them to the portal.",
    chips: [["New client", "Name, type"], ["Identifiers", "CNIC, NTN, mobile"], ["Code", "C-00456"], ["Invite", "WhatsApp or email"], ["Return", "Open the year"]],
    who: "<b>Tax Consultant</b> · <b>Tax Admin</b> · <b>Field Officer</b> (from a visit)",
    sections: [
      { h: "New client", items: ["<b>Clients → New client</b>. Enter the name and client type; the rest can follow.", "CNIC, NTN, mobile and email are checked against existing clients, so nobody is registered twice.", "Choose the consultant who will handle the client."],
        shots: [["staff", "/staff/clients/new", "New client form."]] },
      { h: "The client page", items: ["The client gets a permanent <b>client code</b> (C-00456), shown under the name and searchable everywhere.", "<b>Invite to portal</b> creates the login and gives a link to send on WhatsApp or by email.", "<b>Open return</b> starts the tax year's return with its document checklist."],
        shots: [["staff", `/staff/clients/${FOLDER_CLIENT}`, "Client page: code, returns, documents, fees and messages."]] },
    ] },
  "excel-import": {
    title: "Import clients and<br>past returns from Excel", kicker: "Admin guide",
    intro: "Bring the firm's existing clients and their tax-return history into the portal in one go: download the template, fill it in Excel, upload it, check the preview, then import.",
    chips: [["Download", "The .xlsx template"], ["Clients", "One row each"], ["Returns", "Filed / In progress"], ["Preview", "Nothing saved"], ["Import", "Valid rows"]],
    who: "<b>Tax Admin</b> · <b>Tax Consultant</b> · a filled example is on the import page",
    sections: [
      { h: "Download the template", items: ["Open <b>Workspace → Import from Excel</b>.", "Click <b>VVS_data_import_template.xlsx</b> to download the blank template.", "<b>Filled example</b> downloads the same template with 7 sample clients and 13 returns: open it to see how a finished file looks.", "The template has three sheets: <b>Instructions</b>, <b>Clients</b> and <b>Returns</b>. Keep the header rows as they are."],
        shots: [["staff", "/staff/import", "Import from Excel: download the template, fill it, upload it."]] },
      { h: "Fill the Clients sheet", items: ["One row per client. Only <b>Client name</b> and <b>Client type</b> (gold headers with *) are required; leave a cell empty when you don't know it.", "Give each client at least one identifier: <b>CNIC</b> for individuals, <b>NTN</b> for an AOP or company, and the <b>mobile</b> number. The portal uses them to recognise a client and to link their returns.", "Client type, province and FBR status have drop-down lists. Hover over a header in Excel to read its note."],
        head: ["Column", "Write it like", "Notes"],
        table: [["Client name *", "Usman Tariq", "Person or business name"], ["Client type *", "Individual-Salaried", "Individual-Salaried, Individual-Business, AOP, Company, Other"],
          ["CNIC", "35202-4410023-5", "With or without dashes"], ["NTN", "7612345-1", "For businesses, AOPs and companies"], ["Mobile", "03004410023", "Also +92 300 4410023"],
          ["Province · FBR status", "Punjab · Filer (Active Taxpayer)", "Pick from the list"], ["Consultant email", "consultant@…", "Optional: assigns the client to a team member"]],
        shots: [[null, null, "A filled Clients sheet: identifiers highlighted.", async (p) => { await p.setContent(sheetHtml(FILLED, "Clients", { mark: [2, 3, 4], small: 1 })); }]] },
      { h: "Fill the Returns sheet", items: ["One row per client <b>per tax year</b>. Tax year 2025 = 1 July 2024 to 30 June 2025.", "Say which client the row is for with <b>one</b> of: client CNIC, NTN, mobile or client code (C-00456). It can be a client in the Clients sheet or one already in the portal.", "<b>Filed</b> = a past return already filed on IRIS. Write the <b>IRIS acknowledgment number</b> and <b>filing date</b> (dd-mm-yyyy); without them the row is refused, because the portal never shows a return as filed without IRIS proof.", "<b>In progress</b> = this year's return the team is working on. It starts in the portal with its document checklist; leave the figures empty.", "Income and tax figures are optional, in rupees, numbers only (no Rs, no commas needed)."],
        shots: [[null, null, "A filled Returns sheet: past years Filed with IRIS proof, this year In progress.", async (p) => { await p.setContent(sheetHtml(FILLED, "Returns", { mark: [6, 7], small: 1, note: "<b>Filed</b> rows need the IRIS acknowledgment number and the filing date. <b>In progress</b> rows only need the client and year." })); }]] },
      { h: "Upload and preview", items: ["Back on <b>Import from Excel</b>, choose the filled file and press <b>Preview</b>. Nothing is saved yet.", "Every row shows what will happen: <i>New</i>, <i>Fill empty fields</i>, <i>No change</i> or <i>Error</i>, with the reason. Switch between the <b>Clients</b> and <b>Returns</b> tabs.", "A client already in the portal (same CNIC, NTN, mobile or email) only gets its empty fields filled. A value that differs is reported and kept as it is."],
        shots: [["staff", "/staff/import", "Preview of the filled example: 7 new clients, 13 new returns.", async (p) => {
          await p.locator("input[type=file]").setInputFiles(FILLED); await p.getByRole("button", { name: "Preview" }).click(); await sleep(2500); await p.mouse.wheel(0, 420); await sleep(600);
        }]] },
      { h: "Fix the rows in error", items: ["Rows in error are shown in red with the Excel row number and the reason, for example a missing client type, a Filed return without its IRIS number, or a client that can't be found.", "Correct those rows in the same Excel file, save it, and preview again.", "You can also import the valid rows now and fix the rest later: re-importing the same file is safe, rows already in show <i>No change</i>."],
        shots: [["staff", "/staff/import", "A file with mistakes: each error says what to fix.", async (p) => {
          await p.locator("input[type=file]").setInputFiles(SAMPLE); await p.getByRole("button", { name: "Preview" }).click(); await sleep(2500);
          await p.getByRole("button", { name: /^returns ·/i }).first().click(); await sleep(900); await p.mouse.wheel(0, 420); await sleep(600);
        }]] },
      { h: "Import and check", items: ["Press <b>Import N rows</b>. Each valid row is saved on its own; up to 5,000 rows per file.", "Open <b>Clients</b>: every imported client has a permanent client code (C-00…) and their returns. Filed years show the IRIS acknowledgment as history; this year's return is in the queue with its document checklist.", "Next: invite the clients to the portal from their client page so they can upload this year's documents."] },
    ] },
  "site-visits": {
    title: "Site visits<br>and leads", kicker: "Field officer guide",
    intro: "The field officer meets people at their shop or office, records the visit with its location, follows up, and converts the visit into a client.",
    chips: [["Visit", "Person, need"], ["Location", "From the phone"], ["Follow up", "Date, reminder"], ["CRM lead", "Created for you"], ["Client", "Convert"]],
    who: "<b>Field Officer</b> · <b>Tax Consultant</b>",
    sections: [
      { h: "Record a visit", items: ["<b>Site Visits → New visit</b>: name, business, mobile, what they need, and the location.", "Set a follow-up date; it shows on the dashboard and in the CRM."],
        shots: [["staff", "/staff/visits/new", "New site visit."]] },
      { h: "Follow up and convert", items: ["The list shows each visit's status: New, Contacted, Converted.", "<b>Convert to client</b> when the person agrees; the consultant takes it from there."],
        shots: [["staff", "/staff/visits", "Site visits and their status."]] },
    ] },
  "client-portal": {
    title: "The client portal", kicker: "Client guide",
    intro: "What clients see: their return as a chain of steps, the documents to upload, messages, payments and their vault.",
    chips: [["Account", "Sign up / invite"], ["Questions", "Yes / no"], ["Upload", "PDF or photo"], ["Confirm", "Check figures"], ["Filed", "Acknowledgment"]],
    who: "The <b>client</b>",
    sections: [
      { h: "Home", items: ["The home page shows the return's steps and what is needed from the client now.", "Messages from the consultant appear here and on WhatsApp."],
        shots: [["client", "/", "Client home."]] },
      { h: "Documents", items: ["Each document on the list can be uploaded as a PDF or a clear photo.", "<i>Upload again</i> shows the reason a document was not accepted."],
        shots: [["client", "/documents", "Documents to upload."]] },
      { h: "Confirm the return", items: ["When the return is ready the client checks income, tax and refund or payable, then <b>Confirms</b> or asks a question."],
        shots: [["client", `/returns/${R.awaiting}`, "The return waiting for the client's confirmation."]] },
      { h: "Payments and vault", items: ["<b>Payments</b>: the fee and the firm's bank details; upload the transfer proof.", "<b>Vault</b>: documents, letters, IRIS acknowledgments and invoices."],
        shots: [["client", "/payments", "Payments."], ["client", "/vault", "The client's vault."]] },
    ] },
  documents: {
    title: "Verify documents<br>and client folders", kicker: "Consultant guide",
    intro: "Check what clients upload or send on WhatsApp, and keep every file in the client's folders.",
    chips: [["Queue", "Uploads to check"], ["Verify", "Or reject + reason"], ["WhatsApp", "Attach a file"], ["Folders", "C-00456 / TY / type"], ["ZIP", "Download a folder"]],
    who: "<b>Tax Consultant</b> · <b>Data Entry</b> (attach only) · <b>Tax Admin</b>",
    sections: [
      { h: "The verify queue", items: ["<b>Verify Documents</b> lists uploads waiting for a check.", "<b>Verify</b>, or <b>Reject</b> with a reason the client reads.", "When the last required document is verified, the return moves to <i>Draft</i> by itself."],
        shots: [["staff", "/staff/queue/documents", "Documents waiting for verification."]] },
      { h: "Client folders", items: ["<b>Document Vault</b> → choose the client. <b>Client folders</b> shows <code>C-00456 · Name / TY2026 / type</code>.", "Preview PDFs and photos, see older versions, and <b>Download ZIP</b> of a folder.", "<b>Add files</b> uploads several at once; each one waits for verification."],
        shots: [["staff", `/staff/vault?client=${FOLDER_CLIENT}`, "A client's folders: one per tax year.", clickText("TY2026")]] },
    ] },
  preparation: {
    title: "Prepare<br>the return", kicker: "Consultant guide",
    intro: "Enter what the client told us and their income, calculate the tax, and send the return for review.",
    chips: [["Told us", "Client's information"], ["Questions", "On their behalf"], ["Income", "Sources, WHT"], ["Calculate", "Estimate"], ["Submit", "For review"]],
    who: "<b>Tax Consultant</b> · <b>Data Entry</b>",
    sections: [
      { h: "Client & year, questionnaire", items: ["<b>What the client told us</b>: notes from the meeting, call or WhatsApp.", "Answer the questionnaire for the client if they have not."],
        shots: [["staff", `/staff/returns/${R.draft}`, "The return in Draft: the wizard steps."]] },
      { h: "Income and calculation", items: ["Add each income source, deductions, withholding tax and advance tax.", "<b>Calculate tax</b>: the computation is an estimate until the reviewer checks it.", "<b>Submit for review</b> when it is complete."],
        shots: [["staff", `/staff/returns/${R.draft}`, "Income.", step("Income")], ["staff", `/staff/returns/${R.draft}`, "Calculation.", step("Calculation")]] },
    ] },
  "review-approval": {
    title: "Review, confirmation<br>and approval", kicker: "Reviewer & approver guide",
    intro: "Two people check every return before it is filed: the reviewer goes through the checklist, the client confirms, the approver approves.",
    chips: [["Review", "Checklist"], ["Changes", "Back with a comment"], ["Send", "To the client"], ["Confirm", "Portal or on behalf"], ["Approve", "Not the preparer"]],
    who: "<b>Tax Reviewer</b> · <b>Tax Approver</b> · the <b>client</b>",
    sections: [
      { h: "Review", items: ["<b>Review Queue</b> → <b>Start review</b> → the checklist: Pass, Fail or N/A for each item.", "<b>Request changes</b> with a comment, or <b>Mark reviewed</b>, then <b>Send to client</b>."],
        shots: [["staff", `/staff/returns/${R.review}`, "A return under review.", step("Review · approve")]] },
      { h: "Client confirmation and approval", items: ["The client confirms in the portal; or staff <b>Record client approval</b> with the method and proof (four-eyes).", "<b>Approval Queue</b> → <b>Approve</b>. The preparer can never approve."],
        shots: [["staff", "/staff/queue/confirmation", "Returns waiting for the client."], ["staff", "/staff/queue/approval", "Approval queue."]] },
    ] },
  filing: {
    title: "File on IRIS and record<br>the acknowledgment", kicker: "Filing officer guide",
    intro: "File approved returns on FBR IRIS, then record the acknowledgment number and receipt so the client sees it is filed.",
    chips: [["Queue", "Approved returns"], ["IRIS", "File the figures"], ["Submitted", "Mark it"], ["Acknowledged", "Number + receipt"], ["Errors", "Report, retry"]],
    who: "<b>Filing Officer</b>",
    sections: [
      { h: "File and mark submitted", items: ["<b>Filing Queue</b> lists approved returns. File on IRIS with the approved figures.", "<b>Mark submitted on IRIS</b>: the portal checks the figures did not change since approval."],
        shots: [["staff", "/staff/queue/filing", "Filing queue."]] },
      { h: "Acknowledgment", items: ["<b>Awaiting Acknowledgment</b> → the return → enter the <b>IRIS acknowledgment number</b>, attach the <b>FBR receipt</b> → <b>Record acknowledgment</b>.", "If IRIS rejects it: <b>Report filing error</b> with the text, then <b>Retry filing</b>."],
        shots: [["staff", `/staff/returns/${R.filed}`, "An acknowledged return.", step("Review · approve")]] },
    ] },
  payments: {
    title: "Fees and<br>payments", kicker: "Admin guide",
    intro: "Clients pay by bank transfer or wallet and upload the proof; the admin checks it against the bank and the invoice is created.",
    chips: [["Service", "Package, fee"], ["Pay", "Transfer / wallet"], ["Proof", "Client uploads"], ["Verify", "Against the bank"], ["Invoice", "Created"]],
    who: "<b>Tax Admin</b> · the <b>client</b>",
    sections: [
      { h: "Verify a payment", items: ["<b>Payments to Verify</b>: match each proof with the bank or wallet statement.", "<b>Verify</b> creates the invoice and payment; <b>Reject</b> needs a reason the client sees."],
        shots: [["staff", "/staff/payments", "Payments to verify."]] },
      { h: "What the client sees", items: ["The fee, the firm's bank details, and the upload for the proof."], shots: [["client", "/payments", "The client's payments page."]] },
    ] },
  "vault-letters": {
    title: "Document vault<br>and letters", kicker: "Guide",
    intro: "Everything a client has with the firm in one place, and letters on the firm's letterhead, generated as PDFs.",
    chips: [["Folders", "By year, type"], ["Letters", "Letterhead PDF"], ["Versions", "Kept"], ["IRIS", "Receipts"], ["Invoices", "Paid / due"]],
    who: "<b>Team</b> · the <b>client</b> (their own vault)",
    sections: [
      { h: "Generate a letter", items: ["Authority letter, engagement letter, document checklist, tax computation, wealth statement, withholding certificate request.", "Each one is saved with a version number; download it again any time."],
        shots: [["staff", `/staff/vault?client=${FOLDER_CLIENT}`, "The vault: generate documents.", async (p) => { await p.getByText("Generate a document").first().scrollIntoViewIfNeeded(); await sleep(800); }]] },
    ] },
  "ask-vvs": {
    title: "Ask VVS —<br>the AI assistant", kicker: "Guide",
    intro: "Ask questions about your clients and returns in plain language. Ask VVS reads only what you may see.",
    chips: [["Open", "Ctrl J"], ["Ask", "Plain language"], ["Charts", "In the answer"], ["Agent", "Proposes changes"], ["Approve", "You decide"]],
    who: "Team members it is switched on for (<b>Team</b> page)",
    sections: [
      { h: "Ask a question", items: ["Press <b>Ask VVS</b> in the header (or <code>Ctrl J</code>).", "Examples: <i>How many returns are pending review?</i> <i>Show this client's status.</i>", "<b>Agent</b> mode can prepare a change; nothing is saved until you press <b>Approve</b>."],
        shots: [["staff", "/staff/dashboard", "The Ask VVS panel.", async (p) => { await p.getByRole("button", { name: /Ask VVS/ }).first().click(); await sleep(1200);
          await p.getByRole("button", { name: "New chat" }).click(); await sleep(1500); }]] },
    ] },
  reports: {
    title: "Insights<br>and reports", kicker: "Admin guide",
    intro: "See the firm's work at a glance and export reports.",
    chips: [["Dashboard", "Counts"], ["Insights", "Charts"], ["Workload", "By consultant"], ["Reports", "10 reports"], ["Export", "Excel"]],
    who: "<b>Tax Admin</b> · <b>Tax Consultant</b> (own clients)",
    sections: [
      { h: "Insights", items: ["Returns by status, aging, consultant workload, filings and fees."], shots: [["staff", "/staff/insights", "Insights."]] },
      { h: "Report center", items: ["Client master, missing documents, review aging, filing status, fees and collections.", "Export to Excel is for the Tax Admin."], shots: [["staff", "/staff/reports", "Report center."]] },
    ] },
};

const esc = (s) => String(s);
function html(slug, g, shots) {
  const chips = g.chips.map(([t, d], i) => `<div class="chip"><b>${i + 1} · ${t}</b><span>${d}</span></div>`).join("");
  let n = 0;
  const sections = g.sections.map((s, si) => {
    const items = (s.items || []).map((t) => `<li>${t}</li>`).join("");
    const head = s.head || ["Step", "Who", "What happens"];
    const table = s.table ? `<table><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${s.table.map((r) => `<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join("")}</table>` : "";
    const imgs = (s.shots || []).map(() => { const sh = shots[n++]; return `<figure><img src="data:image/jpeg;base64,${sh.data}"><figcaption>${sh.caption}</figcaption></figure>`; }).join("");
    return `<section><h2><span class="n">${si + 1}</span>${s.h}</h2>${table}${items ? `<ol>${items}</ol>` : ""}${imgs}</section>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${g.title.replace(/<br>/g, " ")}</title><style>
  @page{size:A4;margin:14mm 14mm 16mm}
  body{font:10.5pt/1.5 Calibri,Carlito,Arial,sans-serif;color:#1c1c1e;margin:0}
  .cover{background:#141416;color:#fff;border-radius:14px;padding:26px 26px 20px;position:relative;overflow:hidden}
  .cover:after{content:"";position:absolute;right:-60px;top:-60px;width:240px;height:240px;border-radius:50%;background:radial-gradient(circle,rgba(212,175,55,.35),transparent 70%)}
  .kick{font:700 8.5pt Calibri,Arial;letter-spacing:.22em;text-transform:uppercase;color:#d4af37}
  h1{font:600 27pt/1.08 Cambria,Georgia,serif;margin:10px 0 10px}
  .intro{color:#d6d3c8;font-size:11pt;margin:0 0 14px;max-width:88%}
  .chips{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
  .chip{background:#fff;color:#1c1c1e;border-radius:9px;padding:8px 9px;font-size:8.5pt;line-height:1.35}
  .chip b{display:block;font-size:9pt;margin-bottom:2px;color:#141416}
  .who{margin-top:12px;font-size:9pt;color:#cfcac0}.who b{color:#f3d77a}
  h2{font:600 14pt Cambria,Georgia,serif;margin:22px 0 8px;padding-bottom:6px;border-bottom:2px solid #d4af37;display:flex;align-items:center;gap:10px;break-after:avoid}
  .n{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,#f3d77a,#d4af37 55%,#9c7a22);color:#141416;font:700 11pt Calibri,Arial}
  ol{margin:6px 0 10px;padding-left:22px}li{margin:3px 0}li::marker{color:#9c7a22;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:9.5pt;margin:6px 0}th{background:#f4f1e8;text-align:left;padding:6px 8px}td{border-top:1px solid #e5e1d6;padding:6px 8px;vertical-align:top}
  figure{margin:10px 0 14px;break-inside:avoid}img{width:100%;border:1px solid #d9d4c6;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
  figcaption{font-size:8.5pt;color:#6b6b6b;margin-top:4px}
  section{break-inside:auto}
  .foot{margin-top:18px;font-size:8pt;color:#8a8a8a;border-top:1px solid #e5e1d6;padding-top:6px}
  </style></head><body>
  <div class="cover"><div class="kick">Vision Vault Solutions · ${g.kicker}</div><h1>${g.title}</h1><p class="intro">${g.intro}</p>
  <div class="chips">${chips}</div><div class="who">Who: ${g.who}</div></div>
  ${sections}
  <div class="foot">Screens in this guide are from the VVS tax portal with demo data (${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })}). Tax figures shown are estimates from demo slab rates.</div>
  </body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--hide-scrollbars"] });
  const ctxs = {};
  for (const [who, user] of [["staff", STAFF], ["client", CLIENT]]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", locale: "en-GB", deviceScaleFactor: 1 });
    if (SIDS[user]) await ctx.addCookies([{ name: "sid", value: SIDS[user], url: BASE }]);
    else {
      const r = await ctx.request.post(`${BASE}/api/method/login`, { data: { usr: user, pwd: PWD } });
      if (!r.ok()) throw new Error(`login ${user}: ${r.status()}`);
    }
    ctxs[who] = await ctx.newPage();
  }
  const printer = await browser.newPage();
  let failed = 0;
  for (const [slug, g] of Object.entries(GUIDES)) {
    if (only.length && !only.includes(slug)) continue;
    const shots = [];
    try {
      for (const s of g.sections) for (const [who, url, caption, action] of s.shots || []) {
        const p = ctxs[who || "staff"];
        if (url) await p.goto(`${BASE}/portal${url}`, { waitUntil: "networkidle" });
        await sleep(900);
        if (action) await action(p);
        await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
        shots.push({ caption, data: (await p.screenshot({ type: "jpeg", quality: 82 })).toString("base64") });
        if (action) await p.keyboard.press("Escape").catch(() => {});
      }
      await printer.setContent(html(slug, g, shots), { waitUntil: "load" });
      await printer.pdf({ path: path.join(OUT, `${slug}.pdf`), format: "A4", printBackground: true, margin: { top: "14mm", bottom: "16mm", left: "14mm", right: "14mm" } });
      console.log("✓", slug, `${shots.length} screens`);
    } catch (e) {
      failed += 1;
      console.error("✗", slug, e.message.split("\n")[0]);
    }
  }
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
