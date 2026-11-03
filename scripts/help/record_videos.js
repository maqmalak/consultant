// Records the help centre's step videos (walk-throughs of the real screens with captions and a visible cursor) from the
// demo site, then turns each into an MP4 in public/downloads/videos (not in git; copy to each server like the guides' videos).
// They open, point, preview and fill forms, but never save: the demo data is left as it is. The two full-process videos
// (one return start to finish, the client's journey) are recorded by docs/video/record*.js.
//
//   cd apps/pakistan_tax_consultancy && DEMO_PWD=… node scripts/help/record_videos.js [number …]
const { chromium } = require("playwright-core");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://consultant.localhost:8010";
const PWD = process.env.DEMO_PWD;
const OUT = path.join(__dirname, "..", "..", "pakistan_tax_consultancy", "public", "downloads", "videos");
const TMP = path.join(require("os").tmpdir(), "vvs-help-frames");
const W = 1440, H = 900;
const STAFF = "admin@demo.taxportal.example", CLIENT = "salaried@demo.taxportal.example";
const R = { draft: "TAX-RET-2026-00003", review: "TAX-RET-2026-00022", filed: "TAX-RET-2026-00004" };
const FOLDER_CLIENT = "TAX-CLIENT-2026-00571";
if (!PWD) { console.error("Set DEMO_PWD"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a Python with imageio-ffmpeg (pip install imageio-ffmpeg) turns the frames into an MP4
const VIDEO_PY = process.env.VIDEO_PY || path.join(require("os").homedir(), ".cache/micromax-videos/venv/bin/python");

const OVERLAY = `
(() => {
  if (window.__ov) return; window.__ov = 1;
  const css = document.createElement('style');
  css.textContent = \`
  #vv-cap{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483646;max-width:1100px;min-width:520px;
    background:rgba(20,20,22,.94);color:#fff;border:1px solid rgba(212,175,55,.6);border-radius:16px;padding:14px 22px 14px 18px;
    font:500 19px/1.35 Calibri,Segoe UI,Arial,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35);pointer-events:none;display:flex;gap:14px;align-items:center}
  #vv-cap b{display:block;color:#f3d77a;font-size:13px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px}
  #vv-cap .n{flex:none;width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#f3d77a,#d4af37 55%,#9c7a22);color:#141416;
    display:grid;place-items:center;font:700 17px Calibri,Arial}
  #vv-cap:empty{display:none}
  #vv-cur{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;pointer-events:none;
    background:rgba(212,175,55,.35);border:2px solid #d4af37;transition:transform .12s}
  #vv-cur.dn{transform:scale(.65);background:rgba(212,175,55,.75)}\`;
  const mount = () => {
    if (!document.body) return setTimeout(mount, 30);
    document.head.appendChild(css);
    const cap = document.createElement('div'); cap.id = 'vv-cap'; document.body.appendChild(cap);
    const cur = document.createElement('div'); cur.id = 'vv-cur'; document.body.appendChild(cur);
    const c = sessionStorage.getItem('vv-cap'); if (c) cap.innerHTML = c;
    const p = sessionStorage.getItem('vv-xy'); if (p) { const [x, y] = p.split(','); cur.style.left = x + 'px'; cur.style.top = y + 'px'; }
    addEventListener('mousemove', (e) => { cur.style.left = e.clientX + 'px'; cur.style.top = e.clientY + 'px'; sessionStorage.setItem('vv-xy', e.clientX + ',' + e.clientY); }, true);
    addEventListener('mousedown', () => cur.classList.add('dn'), true);
    addEventListener('mouseup', () => cur.classList.remove('dn'), true);
  };
  mount();
})();`;

let page, ctx, n = 0;
async function caption(who, text) {
  n += 1;
  const html = `<span class="n">${n}</span><span><b>${who}</b>${text}</span>`;
  await page.evaluate((h) => { sessionStorage.setItem("vv-cap", h); const c = document.getElementById("vv-cap"); if (c) c.innerHTML = h; }, html).catch(() => {});
  await sleep(3900);
}
async function noCaption() {
  await page.evaluate(() => { sessionStorage.removeItem("vv-cap"); const c = document.getElementById("vv-cap"); if (c) c.innerHTML = ""; }).catch(() => {});
}
async function pointAt(loc) {
  loc = loc.first();
  await loc.waitFor({ state: "visible", timeout: 15000 });
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (b) await page.mouse.move(b.x + Math.min(b.width / 2, 160), b.y + b.height / 2, { steps: 20 });
  await sleep(500);
}
async function click(loc, after = 1200) { await pointAt(loc); await loc.first().click(); await sleep(after); }
async function type(loc, text) { await pointAt(loc); await loc.first().click(); await loc.first().fill(""); await loc.first().pressSequentially(String(text), { delay: 45 }); await sleep(300); }
async function go(url) { await noCaption(); await page.goto(`${BASE}/portal${url}`, { waitUntil: "networkidle" }); await sleep(1200); }
async function scroll(px) { await page.mouse.wheel(0, px); await sleep(1300); }
const btn = (name) => page.getByRole("button", { name, exact: false });
const link = (name) => page.getByRole("link", { name, exact: false });
const text = (t) => page.getByText(t, { exact: false });
const wiz = (label) => page.getByRole("navigation", { name: "Steps" }).getByRole("button", { name: label });
async function as(user) {
  await ctx.clearCookies();
  const r = await ctx.request.post(`${BASE}/api/method/login`, { data: { usr: user, pwd: PWD } });
  if (!r.ok()) throw new Error(`login ${user}`);
}
async function card(title, sub, ms = 3400) {
  await noCaption();
  await page.setContent(`<html><body style="margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(1200px 600px at 30% 20%,#2a2410,#141416 60%);
    font-family:Cambria,Georgia,serif;color:#fff"><div style="text-align:center;max-width:1000px;padding:40px">
    <div style="font:600 15px Calibri,Arial;letter-spacing:.3em;color:#d4af37;text-transform:uppercase">Vision Vault Solutions · Help centre</div>
    <h1 style="font-size:56px;margin:18px 0 14px;line-height:1.1">${title}</h1>
    <div style="height:3px;width:120px;margin:0 auto 22px;background:linear-gradient(90deg,#f3d77a,#d4af37,#9c7a22)"></div>
    <p style="font:400 24px/1.45 Calibri,Arial;color:#d6d3c8;margin:0">${sub}</p></div></body></html>`);
  await sleep(ms);
}
const end = (t) => card("That's it", `${t}<br><br><span style="font-size:18px;color:#a8a29e">Demo data · tax figures are estimates · more in Help centre → Guides</span>`, 4200);

const ADMIN = "Ayesha · Tax Admin", CONS = "Consultant", REV = "Reviewer", FILER = "Filing officer", CL = "Client";
const VIDEOS = {
  "01-Setup-team-roles-settings": async () => {
    await card("Setup", "Website & rules, settings, the team and their roles, and Ask VVS"); await as(STAFF);
    await go("/staff/content"); await caption(ADMIN, "Website & Rules: the firm's details, services and prices, FAQ and testimonials");
    await scroll(500); await go("/staff/settings"); await caption(ADMIN, "Settings: WhatsApp, email and the bank details clients pay to — secrets are stored encrypted");
    await scroll(600); await go("/staff/team"); await caption(ADMIN, "Team: every person, their role, and the Ask VVS switch");
    await go("/staff/roles"); await caption(ADMIN, "Roles & Permissions: what each role may read and change");
    await end("Setup is done once; the team then works from their queues.");
  },
  "02-Register-client-and-invite": async () => {
    await card("Register a client", "Identifiers, client code, consultant, and the portal invitation"); await as(STAFF);
    await go("/staff/clients"); await caption(CONS, "Clients: search by name, CNIC, NTN, mobile or client code");
    await click(link("New client").or(btn("New client"))); await caption(CONS, "The new client form: name and type first");
    await type(page.getByLabel("Full name / business name", { exact: false }), "Demo Walk-in Client");
    await type(page.getByLabel("Mobile", { exact: false }), "03001112233");
    await caption(CONS, "CNIC, NTN, mobile and email are checked against existing clients — nobody is registered twice");
    await caption(CONS, "Save creates the client with a permanent code (C-00…). This demo does not save.");
    await go(`/staff/clients/${FOLDER_CLIENT}`); await caption(CONS, "The client page: the code under the name, returns, documents, fees and messages");
    await pointAt(btn("Invite").or(text("Invite"))); await caption(CONS, "Invite to portal creates the login and a link to send on WhatsApp or email");
    await end("The client can now follow their return in the portal.");
  },
  "03-Import-from-Excel": async () => {
    await card("Import from Excel", "Clients and their past and current returns — preview first, then import"); await as(STAFF);
    await go("/staff/import"); await caption(ADMIN, "Download the template: Instructions, Clients and Returns sheets");
    await pointAt(text("VVS_data_import_template.xlsx"));
    await caption(ADMIN, "Returns: Filed = a past year with its IRIS number and date; In progress = this year");
    await page.locator("input[type=file]").setInputFiles(path.join(__dirname, "sample_import.xlsx")); await sleep(800);
    await click(btn("Preview"), 2500); await caption(ADMIN, "Preview: nothing is saved. Each row shows New, Fill empty fields, No change or Error");
    await scroll(450); await caption(ADMIN, "An existing client only gets its empty fields filled; differing values are kept and reported");
    await click(btn("Returns"), 1500); await caption(ADMIN, "The Returns sheet, row by row, with the reason for each error");
    await pointAt(btn("Import")); await caption(ADMIN, "Import saves the valid rows; fix the errors and import the same file again");
    await end("Clients and their history are in the portal.");
  },
  "04-Site-visit-to-client": async () => {
    await card("Site visits", "Record a visit, follow it up, convert it into a client"); await as(STAFF);
    await go("/staff/visits"); await caption("Field officer", "Site visits and their status: New, Contacted, Converted");
    await go("/staff/visits/new"); await caption("Field officer", "A new visit: the person, their business, what they need, and the location");
    await scroll(400); await caption("Field officer", "A follow-up date puts it on the dashboard and in the CRM");
    await go("/staff/visits"); await caption("Field officer", "When they agree: Convert to client — the consultant takes it from there");
    await end("Every visit also becomes a CRM lead.");
  },
  "06-Verify-documents-and-folders": async () => {
    await card("Documents", "The verify queue, and every file in the client's folders"); await as(STAFF);
    await go("/staff/queue/documents"); await caption(CONS, "Verify Documents: uploads waiting for a check — verify, or reject with a reason");
    await go(`/staff/vault?client=${FOLDER_CLIENT}`); await caption(CONS, "Document Vault → the client's folders: C-00571 · Hira Naveed");
    await click(btn("TY2026")); await caption(CONS, "One folder per tax year, then one per document type");
    await click(btn("CNIC Copy")); await caption(CONS, "The files, who uploaded them and their status");
    await click(page.getByRole("button", { name: /^Preview / })); await caption(CONS, "Preview a PDF or photo without downloading it");
    await page.keyboard.press("Escape"); await sleep(800);
    await pointAt(text("Download ZIP")); await caption(CONS, "Download ZIP keeps the same folder layout; Add files uploads several at once");
    await end("Every download is written to the audit log.");
  },
  "07-Prepare-the-return": async () => {
    await card("Prepare the return", "What the client told us, income, calculation, submit for review"); await as(STAFF);
    await go("/staff/queue/preparation"); await caption(CONS, "In Preparation: returns whose documents are complete");
    await go(`/staff/returns/${R.draft}`); await caption(CONS, "The return wizard: one step at a time");
    await click(wiz("Income")); await caption(CONS, "Income sources, deductions, withholding and advance tax");
    await scroll(500); await click(wiz("Calculation")); await caption(CONS, "The calculation — an estimate until the reviewer checks it");
    await scroll(400); await caption(CONS, "Submit for review when it is complete; the reviewer's queue picks it up");
    await end("Changes after review send the return back automatically.");
  },
  "08-Review-confirm-approve": async () => {
    await card("Review, confirm, approve", "The reviewer's checklist, the client's confirmation, the approver"); await as(STAFF);
    await go("/staff/queue/review"); await caption(REV, "Review Queue: returns waiting for review");
    await go(`/staff/returns/${R.review}`); await click(wiz("Review · approve")); await caption(REV, "The review checklist: Pass, Fail or N/A for each item");
    await scroll(400); await caption(REV, "Request changes with a comment, or mark reviewed and send to the client");
    await go("/staff/queue/confirmation"); await caption(CL, "The client confirms in the portal — or staff record it on their behalf, with proof");
    await go("/staff/queue/approval"); await caption("Approver", "Approval Queue: the approver approves — never the person who prepared it");
    await end("The approved figures are fingerprinted.");
  },
  "09-File-on-IRIS-and-acknowledge": async () => {
    await card("File on IRIS", "Mark submitted, then record the acknowledgment and receipt"); await as(STAFF);
    await go("/staff/queue/filing"); await caption(FILER, "Filing Queue: approved returns to file on FBR IRIS");
    await go("/staff/queue/submitted"); await caption(FILER, "Awaiting Acknowledgment: filed, waiting for IRIS");
    await go(`/staff/returns/${R.filed}`); await click(wiz("Review · approve")); await caption(FILER, "The IRIS acknowledgment number and the FBR receipt — only then is it shown as filed");
    await scroll(400); await go("/staff/queue/errors"); await caption(FILER, "Filing Errors: rejected by IRIS — report the error, fix it, retry");
    await end("The client sees the acknowledgment in their portal at once.");
  },
  "10-Payments-to-verify": async () => {
    await card("Payments", "The client's transfer proof, checked against the bank"); await as(CLIENT);
    await go("/payments"); await caption(CL, "The client sees the fee and the firm's bank details, and uploads the proof");
    await as(STAFF); await go("/staff/payments"); await caption(ADMIN, "Payments to Verify: match each proof with the bank statement");
    await caption(ADMIN, "Verify creates the invoice and payment; Reject needs a reason the client sees");
    await end("Verified payments show on the client's vault as invoices.");
  },
  "11-Vault-and-letters": async () => {
    await card("Document vault and letters", "Everything for a client in one place, letters on the firm letterhead"); await as(STAFF);
    await go(`/staff/vault?client=${FOLDER_CLIENT}`); await caption(CONS, "The vault: folders, letters, IRIS acknowledgments and invoices");
    await pointAt(text("Generate a document")); await caption(CONS, "Generate a letter as a PDF on the letterhead: engagement, authority, checklist, computation");
    await scroll(500); await caption(CONS, "Each one is kept with a version number — download it again any time");
    await as(CLIENT); await go("/vault"); await caption(CL, "The client's own vault shows the same documents and letters");
    await end("Clients and staff look at the same files.");
  },
  "12-Insights-and-reports": async () => {
    await card("Insights and reports", "The firm's work at a glance"); await as(STAFF);
    await go("/staff/dashboard"); await caption(ADMIN, "Dashboard: clients, returns, documents to verify, overdue, follow-ups");
    await go("/staff/insights"); await caption(ADMIN, "Insights: returns by status, aging, consultant workload, filings, fees");
    await scroll(600); await go("/staff/reports"); await caption(ADMIN, "Report Center: ten reports, each limited to what you may see; export to Excel");
    await end("Use the reports for the weekly team meeting.");
  },
};

async function record(name, fn) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  await page.setContent("<body style=\"margin:0;background:#141416\"></body>");  // not the previous video's last card
  const cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", (f) => {
    const file = path.join(dir, `${String(frames.length).padStart(6, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const tick = setInterval(() => page.evaluate(() => { const c = document.getElementById("vv-cur"); if (c) c.style.opacity = c.style.opacity === "0.99" ? "1" : "0.99"; }).catch(() => {}), 120);
  n = 0;
  try { await fn(); } finally {
    clearInterval(tick);
    await cdp.send("Page.stopScreencast").catch(() => {});
    await cdp.detach().catch(() => {});
  }
  fs.writeFileSync(path.join(dir, "frames.json"), JSON.stringify(frames));
  execFileSync(VIDEO_PY, [path.join(__dirname, "build_video.py"), dir, path.join(OUT, `${name}.mp4`)], { stdio: "inherit" });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const only = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--hide-scrollbars"] });
  ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: "light", locale: "en-GB" });
  await ctx.addInitScript(OVERLAY);
  page = await ctx.newPage();
  let failed = 0;
  for (const [name, fn] of Object.entries(VIDEOS)) {
    if (only.length && !only.some((o) => name.startsWith(o))) continue;
    try { await record(name, fn); console.log("✓", name); } catch (e) {
      failed += 1; console.error("✗", name, e.message.split("\n")[0]);
      await page.screenshot({ path: path.join(TMP, `${name}-fail.png`) }).catch(() => {});
    }
  }
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
