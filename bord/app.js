// Bogholderens arbejdsbord paa rigtige data. Én indbakke paa tvaers af kunder, tre tilstande (Liste, Bunke, Ark),
// tastaturet foerst. Al logik ligger i databasen; her vises, vaelges og kaldes kun. Login kraever 2-trins (aal2).
import { DEMO, Fejl, LOKALT, logUd, rpc, sb, session } from "../felles/data.js";

const E = F.esc, IC = F.ICON, kr = F.kr;
const pille = (c, t) => `<span class="pille ${c}">${t}</span>`;
const dk = (s) => (s ? F.dato(String(s).slice(0, 10)) : "");
const S = { route: "indbakke", tab: "alt", mode: "liste", sel: 0, rows: [], firmaer: [], konti: {}, det: {}, valgte: {},
            svar: null, rettet: {}, kunde: null, kundeTab: "overblik", momsKey: null, rap: { v: null, type: "resultat", periode: "aar" }, logV: null, travl: false };
let BRUGER = null;

const NAV = [["indbakke", "Indbakke", "overblik"], ["ai", "Bogført af AI", "check"], ["kunder", "Kunder", "salg"], ["regler", "Regler", "integrationer"], ["moms", "Moms", "moms"],
             ["rapporter", "Rapporter", "rapporter"], ["log", "Hændelseslog", "likviditet"], ["indstillinger", "Indstillinger", "indstillinger"]];
const TITEL = { ai: "Bogført af AI", indbakke: "Indbakke", kunder: "Kunder", kunde: "Kunde", regler: "Regler", moms: "Momslukning", rapporter: "Rapporter", log: "Hændelseslog", indstillinger: "Indstillinger" };
const MOMSKODER = [["koeb_25", "Køb 25 %"], ["koeb_delvis", "Køb, delvis fradrag"], ["salg_25", "Salg 25 %"], ["eu_varer", "EU-varer"], ["eu_ydelser", "EU-ydelser"],
                   ["omvendt", "Omvendt betalingspligt"], ["uden_moms", "Uden moms"], ["", "Ingen moms"]];
const MOMSFELT = [["MomsAngivelseSalgsMomsBeloeb", "Salgsmoms"], ["MomsAngivelseKoebsMomsBeloeb", "Købsmoms"], ["MomsAngivelseMomsEUKoebBeloeb", "Moms af varekøb i udlandet"],
  ["MomsAngivelseMomsEUYdelserBeloeb", "Moms af ydelseskøb i udlandet"], ["MomsAngivelseEUKoebBeloeb", "Rubrik A, varer"], ["MomsAngivelseEUKoebYdelseBeloeb", "Rubrik A, ydelser"],
  ["MomsAngivelseEUSalgBeloebVarerBeloeb", "Rubrik B, varer (EU-salgsangivelse)"], ["MomsAngivelseIkkeEUSalgBeloebVarerBeloeb", "Rubrik B, varer (ikke EU-salgsangivelse)"],
  ["MomsAngivelseEUSalgYdelseBeloeb", "Rubrik B, ydelser"], ["MomsAngivelseEksportOmsaetningBeloeb", "Rubrik C"], ["MomsAngivelseElAfgiftBeloeb", "Elafgift"],
  ["MomsAngivelseOlieAfgiftBeloeb", "Olie- og flaskegasafgift"], ["MomsAngivelseGasAfgiftBeloeb", "Gasafgift"], ["MomsAngivelseKulAfgiftBeloeb", "Kulafgift"],
  ["MomsAngivelseCO2AfgiftBeloeb", "CO2-afgift"], ["MomsAngivelseVandAfgiftBeloeb", "Vandafgift"], ["MomsAngivelseAfgiftTilsvarBeloeb", "Momstilsvar (at betale)"]];

// ------------------------------------------------------------------ data ----
const GRUNDE = { ny_afsender: "første gang fra denne afsender", stort_beloeb: "beløbet er over grænsen", usikker: "AI'en var ikke sikker nok",
  advarsel: "bilaget har advarsler", ulaest: "bilaget kunne ikke læses helt", moms: "momsen passer ikke med beløbet",
  beloeb_passer_ikke: "banklinjen passer ikke med beløbet", ingen_betaling: "der mangler en betaling", laast_periode: "perioden er låst",
  ingen_konto: "AI'en fandt ingen konto", selvbogfoerer: "kunden bogfører selv", ai_undtagelse: "AI'en bad om et menneske", mangler_bilag: "der mangler et bilag til udgiften", ai_spoerg: "AI'en har spurgt kunden" };
const noegle = (r) => r.type + ":" + (r.id || r.virksomhed_id + r.dato);
const firma = (v) => S.firmaer.find((x) => x.id === v) || {};
async function hent() {
  const [rows, firmaer] = await Promise.all([rpc("indbakke"), sb.from("virksomhed").select("id, navn, cvr, momsperiode, oprettet, adresse_vej, adresse_husnr, adresse_postnr, adresse_by, email, indbakke").is("ophoert", null).order("navn")]);
  if (firmaer.error) throw new Fejl(firmaer.error.message);
  S.rows = rows.map((r) => ({ ...r, key: noegle(r), beloeb: r.beloeb == null ? null : +r.beloeb, sikkerhed: r.sikkerhed == null ? null : +r.sikkerhed }));
  S.firmaer = firmaer.data;
}
async function konti(v) {
  if (!S.konti[v]) {
    const { data, error } = await sb.from("konto").select("nummer, navn, type, momskode, funktion").eq("virksomhed_id", v).neq("type", "moms").order("nummer").limit(2000);
    if (error) throw new Fejl(error.message);
    S.konti[v] = data;
  }
  return S.konti[v];
}
const kontonavn = (v, n) => (S.konti[v] || []).find((k) => k.nummer === n)?.navn || "";
const leverandoergaeld = (v) => (S.konti[v] || []).find((k) => k.type === "status" && /leverandører af varer.*kortfristet/i.test(k.navn))?.nummer || null;
const ejerkonto = (v) => (S.konti[v] || []).find((k) => k.funktion === "ejer")?.nummer || null;

// Det, der vises om et bilag: udtraekket, filen og banklinjen, hentet naar posten vaelges.
async function detalje(r) {
  if (!r || S.det[r.key]) return;
  const d = {};
  S.det[r.key] = d;
  await konti(r.virksomhed_id);
  const btId = r.type === "bilag" ? r.forslag?.banktransaktion_id : r.forslag?.banktransaktion_id || (r.type === "bank" ? r.id : null);
  const bilagId = r.type === "bilag" ? r.id : r.forslag?.svar_bilag_id || r.forslag?.bilag_id;
  if (bilagId) {
    const { data } = await sb.from("bilag").select("id, filnavn, sha256, mime, kilde, udtrukket, udlaeg, modtaget").eq("id", bilagId).maybeSingle();
    d.bilag = data;
    if (data) {
      const s = await sb.storage.from("bilag").createSignedUrl(`${r.virksomhed_id}/${data.sha256}`, 900);
      d.url = s.data?.signedUrl || null;
    }
  }
  if (r.type === "bilag" || r.type === "bank") {
    const ai = await rpc("ai_seneste", { p_bilag: r.type === "bilag" ? [r.id] : [], p_bank: r.type === "bank" ? [r.id] : [] }).catch(() => []);
    d.ai = ai[0] || null;
  }
  if (btId) {
    d.bt = (await sb.from("banktransaktion").select("id, dato, tekst, beloeb").eq("id", btId).maybeSingle()).data;
    d.match = (await sb.from("bankmatch").select("postering:postering_id (nummer)").eq("banktransaktion_id", btId).maybeSingle()).data;
  }
  if (r.type === "bank" || r.type === "besked" || r.type === "spoergsmaal") {
    const id = r.type === "bank" ? r.id : btId;
    if (id) d.beskeder = (await sb.from("besked").select("tekst, oprettet").eq("banktransaktion_id", id).order("oprettet")).data || [];
  }
  render();
}

// ------------------------------------------------------------- indbakken ----
const FANER = [["bilag", "Bilag", ["bilag"]], ["bank", "Bank", ["bank"]], ["spoergsmaal", "Spørgsmål", ["spoergsmaal", "besked"]], ["moms", "Moms", ["moms"]], ["alt", "Alt", null]];
function liste() {
  const typer = FANER.find((f) => f[0] === S.tab)?.[2];
  let l = S.rows.filter((r) => !typer || typer.includes(r.type));
  const q = (S.soeg || "").toLowerCase();
  if (q) l = l.filter((r) => [r.virksomhed, r.tekst, r.beloeb != null ? kr(Math.abs(r.beloeb)) : ""].join(" ").toLowerCase().includes(q));
  return l;
}
const tael = (typer) => S.rows.filter((r) => typer.includes(r.type)).length;
const sikH = (s) => (s == null ? `<span class="pille roed">intet forslag</span>` : `<span class="sik ${s < 0.7 ? "lav" : s < 0.95 ? "mid" : ""}"><i style="--s:${Math.round(s * 100)}%"></i>${Math.round(s * 100)} %</span>`);
const TYPENAVN = { bilag: "Bilag", bank: "Bank", spoergsmaal: "Svar", besked: "Besked", moms: "Moms" };
const KILDE = { mail: "modtaget på mail", scan: "scannet af kunden", efaktura: "e-faktura", upload: "lagt op", bank: "fra banken" };

function postRaekke(r, i) {
  const bel = r.beloeb == null ? "" : r.type === "bilag" ? kr(r.beloeb) : (r.beloeb > 0 ? "+" : "") + kr(r.beloeb);
  const hoejre = r.type === "bilag" ? sikH(r.sikkerhed) : r.type === "moms" ? pille(r.forslag?.klar ? "groen" : "gul", r.forslag?.klar ? "Klar" : "Ikke klar") : "";
  return `<div class="post ${i === S.sel ? "valgt" : ""}" data-act="vaelg" data-i="${i}" role="button" tabindex="0"><span class="kunde">${E(r.virksomhed)}</span><span class="bel">${bel}</span>
    <span class="hvad">${E(r.tekst)}</span><span>${hoejre}</span><div class="fs"><span><span class="type">${TYPENAVN[r.type]}</span> · ${r.dato ? F.datoKort(r.dato) : "ingen dato"}</span><span>${r.frist ? "frist " + F.datoKort(r.frist) : ""}</span></div></div>`;
}

const kontoListe = (v) => `<datalist id="kl-${v}">${(S.konti[v] || []).map((k) => `<option value="${k.nummer} ${E(k.navn)}">`).join("")}</datalist>`;
const kontoFelt = (v, n, id = "f-konto") => `<input class="inp" id="${id}" list="kl-${v}" value="${n ? E(n + " " + kontonavn(v, n)) : ""}" placeholder="Søg nummer eller navn" autocomplete="off">${kontoListe(v)}`;
const momsFelt = (mk, id = "f-moms") => `<select class="inp" id="${id}" aria-label="Momskode">${MOMSKODER.map(([k, t]) => `<option value="${k}" ${k === (mk || "") ? "selected" : ""}>${t}</option>`).join("")}</select>`;
const vaerdi = (id) => (document.getElementById(id)?.value || "").trim();
const valgtKonto = (id = "f-konto") => (vaerdi(id).match(/^\d{3,6}/) || [null])[0];
const genv = `<div class="genveje"><span><kbd>J</kbd> <kbd>K</kbd> op og ned</span><span><kbd>↵</kbd> godkend</span><span><kbd>E</kbd> ret</span><span><kbd>S</kbd> spørg</span><span><kbd>A</kbd> afvis</span></div>`;

function svarFelt(r) {
  if (!S.svar || S.svar.key !== r.key) return "";
  const tekst = S.svar.hvad === "spoerg" ? "Spørgsmålet til kunden (kunden får det i appen mandag kl. 7, eller med det samme hvis det haster)" : S.svar.hvad === "afvis" ? "Hvorfor afvises bilaget? (fx reklame, privat, dublet)" : "Svar til kunden";
  return `<div class="svarfelt"><label class="not" for="f-svar" style="font-size:12.5px">${tekst}</label><textarea class="inp" id="f-svar" maxlength="2000"></textarea>
    ${S.svar.hvad === "spoerg" ? `<label class="not" style="font-size:12.5px;display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" id="f-haster"> Haster (vis med det samme)</label>` : ""}
    <div class="handl"><button class="knap p" data-act="svar-send">${S.svar.hvad === "afvis" ? "Afvis bilaget" : "Send"}</button><button class="knap" data-act="svar-luk">Fortryd</button></div></div>`;
}

function aiBlok(d) {
  const a = d.ai;
  if (!a) return `<div class="aiblok tom"><b>AI'en har ikke set posten endnu</b><small>Den kommer med i næste kørsel.</small></div>`;
  const hvorfor = (a.grunde || []).map((g) => GRUNDE[g] || g).join(", ");
  return `<div class="aiblok"><div class="k"><span>AI'en foreslår ${a.konto ? E(a.konto) : "intet"} ${a.konto ? E(kontonavn(d.ai_v, a.konto)) : ""}</span>${sikH(+a.sikkerhed)}</div>
    <div class="hvorfor">${E(a.begrundelse)}</div>${hvorfor ? `<div class="grund">Bogførte ikke selv, fordi ${E(hvorfor)}.</div>` : ""}</div>`;
}
function bilagPanel(r) {
  const d = S.det[r.key] || {}, u = d.bilag?.udtrukket || {}, f = { ...(r.forslag || {}) }, v = r.virksomhed_id;
  d.ai_v = v;
  if (d.ai?.konto && !f.konto) { f.konto = d.ai.konto; f.momskode = d.ai.momskode; }
  const kontrol = (r.kontrol || []).map((k) => `<div class="advarsel">${E(k.besked)}</div>`).join("");
  const kandidater = S.rows.filter((x) => x.type === "bank" && x.virksomhed_id === v && r.beloeb != null && Math.abs(Math.abs(x.beloeb) - r.beloeb) < 0.005);
  const valgt = S.rettet[r.key]?.["f-betalt"] ?? (f.banktransaktion_id ? "bt:" + f.banktransaktion_id : f.udlaeg ? "konto:" + (f.modkonto || ejerkonto(v)) : "konto:" + (leverandoergaeld(v) || ""));
  const betalt = [...(f.banktransaktion_id ? [["bt:" + f.banktransaktion_id, d.bt ? `Banklinje ${F.datoKort(d.bt.dato)} ${d.bt.tekst} ${kr(d.bt.beloeb)}` : "Banklinjen fra forslaget"]] : []),
    ...kandidater.filter((x) => x.id !== f.banktransaktion_id).map((x) => ["bt:" + x.id, `Banklinje ${F.datoKort(x.dato)} ${x.tekst} ${kr(x.beloeb)}`]),
    ["konto:" + (leverandoergaeld(v) || ""), "Ikke betalt endnu (leverandørgæld)"], ["konto:" + (ejerkonto(v) || ""), "Udlæg: betalt med egne penge"]];
  return `<div class="hoejre-panel"><div><h3>${E(r.tekst)}</h3><div class="sub">${E(r.virksomhed)} · ${KILDE[d.bilag?.kilde] || "bilag"}${d.bilag?.udlaeg ? " · udlæg" : ""}</div></div>
    <div><div class="felt3"><label>Dato</label><span class="inp">${u.dato ? dk(u.dato) : "-"}</span></div><div class="felt3"><label>CVR</label><span class="inp">${E(u.cvr || "-")}</span></div>
      <div class="felt3"><label>Fakturanr.</label><span class="inp">${E(u.fakturanummer || "-")}</span></div><div class="felt3"><label>Total</label><span class="inp">${u.total != null ? kr(u.total) : "-"}</span></div>
      <div class="felt3"><label>Moms</label><span class="inp">${u.moms != null ? kr(u.moms) : "-"}</span></div></div>${kontrol}${aiBlok(d)}
    <div class="forslag ${f.konto ? "" : "tomt"}"><div class="k"><span>${f.konto ? `${E(f.konto)} ${E(kontonavn(v, f.konto))}` : "Intet forslag"}</span>${f.konto ? sikH(r.sikkerhed) : ""}</div>
      <div class="hvorfor">${f.begrundelse ? E(f.begrundelse) : r.tekst && r.beloeb == null ? "Bilaget kunne ikke læses. Spørg kunden efter et nyt, eller afvis det." : "Ingen tidligere bilag fra denne afsender. Vælg konto selv."}</div></div>
    <div><div class="felt3"><label>Konto</label>${kontoFelt(v, f.konto)}</div><div class="felt3"><label>Moms</label>${momsFelt(f.momskode || (f.konto ? "" : "koeb_25"))}</div>
      <div class="felt3"><label>Betalt</label><select class="inp" id="f-betalt">${betalt.map(([k, t]) => `<option value="${E(k)}" ${k === valgt ? "selected" : ""}>${E(t)}</option>`).join("")}</select></div></div>
    <div class="handl"><button class="knap p" data-act="godkend">Godkend <kbd>↵</kbd></button><button class="knap" data-act="ret">Ret <kbd>E</kbd></button><button class="knap" data-act="spoerg">Spørg kunden <kbd>S</kbd></button><button class="knap" data-act="afvis">Afvis <kbd>A</kbd></button></div>
    ${svarFelt(r)}${genv}</div>`;
}

function bankPanel(r) {
  const d = S.det[r.key] || {}, f = r.forslag || {}, v = r.virksomhed_id;
  d.ai_v = v;
  const bilag = S.rows.filter((x) => x.type === "bilag" && x.virksomhed_id === v && x.beloeb != null && Math.abs(x.beloeb - Math.abs(r.beloeb)) < 0.005);
  const beskeder = (d.beskeder || []).map((b) => `<div class="forslag"><div class="k"><span>Kunden skrev: "${E(b.tekst)}"</span></div><div class="hvorfor">${dk(b.oprettet)}</div></div>`).join("");
  return `<div class="hoejre-panel"><div><h3>${E(r.tekst)}</h3><div class="sub">${E(r.virksomhed)} · banklinje ${dk(r.dato)}</div></div><div class="felt3"><label>Beløb</label><span class="inp">${r.beloeb > 0 ? "+" : ""}${kr(r.beloeb)}</span></div>${aiBlok(d)}${beskeder}
    ${f.faktura_id ? `<div class="forslag"><div class="k"><span>Faktura ${E(f.nummer)}</span>${pille("groen", "Passer")}</div><div class="hvorfor">${E(f.begrundelse)}</div></div>
      <div class="handl"><button class="knap p" data-act="godkend">Bogfør som betaling af faktura ${E(f.nummer)} <kbd>↵</kbd></button></div>` : ""}
    ${bilag.length ? `<div class="not" style="font-size:12.5px;color:var(--daempet)">Bilag i indbakken med samme beløb</div><div class="liste">${bilag.map((b) => `<div class="li" style="display:flex;gap:10px;padding:8px 0;align-items:center"><div class="t" style="flex:1"><b>${E(b.tekst)}</b><small>${kr(b.beloeb)} · ${b.dato ? F.datoKort(b.dato) : ""}</small></div><button class="knap lille" data-act="match" data-bilag="${b.key}">Brug bilaget</button></div>`).join("")}</div>` : ""}
    <div><div class="not" style="font-size:12.5px;color:var(--daempet);margin-bottom:4px">Bogfør uden bilag</div><div class="felt3"><label>Konto</label>${kontoFelt(v, d.ai?.konto || null)}</div><div class="felt3"><label>Moms</label>${momsFelt(d.ai?.momskode || (r.beloeb > 0 ? "salg_25" : "koeb_25"))}</div></div>
    <div class="handl">${f.faktura_id ? "" : `<button class="knap p" data-act="godkend">Bogfør <kbd>↵</kbd></button>`}${f.faktura_id ? `<button class="knap" data-act="uden-bilag">Bogfør på kontoen</button>` : ""}<button class="knap" data-act="spoerg">Spørg kunden <kbd>S</kbd></button></div>
    ${svarFelt(r)}${genv}</div>`;
}

function spmPanel(r) {
  const f = r.forslag || {}, v = r.virksomhed_id, d = S.det[r.key] || {};
  const besked = r.type === "besked", bogfoert = d.match?.postering?.nummer;
  const bt = bogfoert ? null : d.bt;
  const hoved = besked ? `<div><h3>Besked fra kunden</h3><div class="sub">${E(r.virksomhed)} · ${dk(r.modtaget || r.dato)}</div></div><div class="forslag"><div class="k"><span>"${E(r.tekst)}"</span></div>${f.betaling ? `<div class="hvorfor">Om betalingen ${E(f.betaling)} ${f.betalingsdato ? F.datoKort(f.betalingsdato) : ""} ${r.beloeb != null ? kr(r.beloeb) : ""}</div>` : ""}</div>`
    : `<div><h3>Svar fra kunden</h3><div class="sub">${E(r.virksomhed)} · ${dk(r.modtaget || r.dato)}</div></div><div class="forslag"><div class="k"><span>"${E(f.svar || (f.svar_bilag_id ? "Bilag vedhæftet" : "Ubesvaret"))}"</span></div><div class="hvorfor">Du spurgte: ${E(f.spoergsmaal)}</div></div>`;
  const bogfoer = bt ? `<div><div class="not" style="font-size:12.5px;color:var(--daempet);margin-bottom:4px">Banklinje ${dk(bt.dato)} ${E(bt.tekst)} ${kr(bt.beloeb)}</div><div class="felt3"><label>Konto</label>${kontoFelt(v, null)}</div><div class="felt3"><label>Moms</label>${momsFelt(bt.beloeb > 0 ? "salg_25" : "koeb_25")}</div></div>` : "";
  const knapper = besked
    ? `${bt ? `<button class="knap p" data-act="godkend">Bogfør betalingen uden bilag <kbd>↵</kbd></button>` : `<button class="knap p" data-act="godkend">Markér som læst <kbd>↵</kbd></button>`}<button class="knap" data-act="spoerg">Svar kunden <kbd>S</kbd></button>${bt ? `<button class="knap" data-act="laest">Markér som læst</button>` : ""}`
    : `${bt && !f.svar_bilag_id ? `<button class="knap p" data-act="godkend">Brug svaret og bogfør <kbd>↵</kbd></button>` : `<button class="knap p" data-act="godkend">Luk spørgsmålet <kbd>↵</kbd></button>`}<button class="knap" data-act="spoerg">Spørg igen <kbd>S</kbd></button>${bt ? `<button class="knap" data-act="luk-spm">Luk uden at bogføre</button>` : ""}`;
  const allerede = bogfoert ? `<div class="forslag"><div class="k"><span>Betalingen er bogført</span>${pille("groen", "Postering " + bogfoert)}</div><div class="hvorfor">${E(d.bt?.tekst || "")} ${d.bt ? dk(d.bt.dato) + " " + kr(d.bt.beloeb) : ""}. Ret den under Kunder, Posteringer, hvis den er forkert.</div></div>` : "";
  return `<div class="hoejre-panel">${hoved}${allerede}${f.svar_bilag_id ? `<div class="not" style="font-size:12.5px">Kunden har sendt et bilag. Det ligger under Bilag, når det er læst.</div>` : ""}${bogfoer}
    <div class="not" style="font-size:12px;color:var(--daempet)">Svaret gemmes ved bogføringen og kan ikke ændres bagefter.</div><div class="handl">${knapper}</div>${svarFelt(r)}${genv}</div>`;
}

function momsTjek(f) {
  const p = [["Alle banklinjer afstemt", !f.bankposter_uden_match, `${f.bankposter_uden_match} banklinjer uden match`],
             ["Ingen bilag uden kontering", !f.bilag_uden_kontering, `${f.bilag_uden_kontering} bilag venter`],
             ["Ingen ubogførte kladder", !f.ubogfoerte_kladder, `${f.ubogfoerte_kladder} kladder`]];
  return p.map(([t, ok, n]) => `<div class="check"><span class="ik ${ok ? "ok" : "nej"}">${ok ? "✓" : "!"}</span><div><b>${t}</b>${ok ? "" : `<small>${n}</small>`}</div></div>`).join("");
}
function momsPanel(r) {
  const f = r.forslag || {};
  return `<div class="hoejre-panel"><div><h3>${E(r.virksomhed)}</h3><div class="sub">${E(r.tekst)} · frist ${dk(r.frist)}</div></div><div class="liste">${momsTjek(f)}</div>
    <div class="handl"><button class="knap p" data-act="godkend">Åbn momslukning <kbd>↵</kbd></button></div>${genv}</div>`;
}
function panel(r) {
  if (!r) {
    const m = S.rows.filter((x) => x.type === "moms").map((x) => x.frist).sort()[0];
    return `<div class="hoejre-panel"><div class="tom">Intet venter.${m ? ` Næste momsfrist: ${F.datoLang(m)}.` : ""}</div></div>`;
  }
  return { bilag: bilagPanel, bank: bankPanel, spoergsmaal: spmPanel, besked: spmPanel, moms: momsPanel }[r.type](r);
}

function midt(r) {
  if (!r) return `<div class="midt-fladen"><div class="tom">Ingenting at vise.</div></div>`;
  const d = S.det[r.key] || {};
  if (r.type === "bilag" || d.url) {
    if (!d.bilag) return `<div class="midt-fladen"><div class="tom">Henter bilaget ...</div></div>`;
    if (!d.url) return `<div class="midt-fladen"><div class="tom">Filen kunne ikke hentes fra arkivet.</div></div>`;
    return /^image\//.test(d.bilag.mime) ? `<div class="midt-fladen fil"><img src="${E(d.url)}" alt="${E(d.bilag.filnavn)}"></div>`
      : `<div class="midt-fladen fil"><iframe src="${E(d.url)}" title="${E(d.bilag.filnavn)}"></iframe></div>`;
  }
  if (r.type === "bank") return `<div class="midt-fladen"><div class="kort" style="width:min(520px,100%)"><h2>Banklinje</h2><div class="stort tal">${r.beloeb > 0 ? "+" : ""}${kr(r.beloeb)} <small>DKK</small></div><div class="not">${E(r.tekst)} · ${dk(r.dato)} · ${E(r.virksomhed)}</div></div></div>`;
  if (r.type === "moms") {
    const a = r.forslag?.momsangivelse || {};
    return `<div class="midt-fladen"><div class="kort" style="width:min(520px,100%)"><h2>${E(r.tekst)}</h2><div class="stort tal">${kr(a.MomsAngivelseAfgiftTilsvarBeloeb || 0)} <small>momstilsvar</small></div><div class="not">Salgsmoms ${kr(a.MomsAngivelseSalgsMomsBeloeb || 0)} · købsmoms ${kr(a.MomsAngivelseKoebsMomsBeloeb || 0)}</div></div></div>`;
  }
  const f = r.forslag || {};
  const linjer = r.type === "besked" ? [["K", `Kunden skrev: ${r.tekst}`, dk(r.modtaget)]] : [["OA", `Du spurgte: ${f.spoergsmaal}`, dk(r.dato)], ["K", `Kunden svarede: ${f.svar || "(bilag)"}`, dk(r.modtaget)]];
  return `<div class="midt-fladen"><div class="kort" style="width:min(520px,100%)"><h2>Samtalen</h2><div class="liste">${linjer.map(([a, t, d2]) => `<div class="li"><span class="ava-lille" ${a === "OA" ? 'style="background:var(--accent);color:#fff"' : ""}>${a}</span><div class="t"><b>${E(t)}</b><small>${d2}</small></div></div>`).join("")}</div></div></div>`;
}

function indbakke() {
  const l = liste();
  if (S.sel >= l.length) S.sel = Math.max(0, l.length - 1);
  const r = l[S.sel];
  detalje(r);
  const faner = FANER.map(([k, t, typer]) => `<button data-act="tab" data-t="${k}" aria-pressed="${S.tab === k}">${t}${typer ? `<b>${tael(typer)}</b>` : ""}</button>`).join("");
  const modes = `<div class="faner" role="tablist">${[["liste", "Liste"], ["bunke", "Bunke"], ["ark", "Ark"]].map(([k, t]) => `<button role="tab" aria-selected="${S.mode === k}" data-act="mode" data-m="${k}">${t}</button>`).join("")}</div>`;
  let krop;
  if (S.mode === "liste") {
    krop = `<div class="ib ${S.travl ? "travl" : ""}"><div class="liste-sp">${l.map(postRaekke).join("") || '<div class="tom">Intet venter.</div>'}</div>${midt(r)}${panel(r)}</div>`;
  } else if (S.mode === "bunke") {
    const bl = S.rows.filter((x) => x.type === "bilag"), nu = bl[S.sel] || bl[0];
    if (nu) detalje(nu);
    krop = nu ? `<div class="frem"><span class="mono" style="font-size:12.5px">${Math.min(S.sel + 1, bl.length)} af ${bl.length}</span><div class="bar"><i style="width:${(100 * S.sel) / Math.max(1, bl.length)}%"></i></div><span class="mono" style="font-size:12.5px;color:var(--daempet)">ca. ${Math.ceil(bl.length * 0.35)} min.</span></div>
      <div class="bunke ${S.travl ? "travl" : ""}"><div class="stak" style="min-height:520px">${midt(nu).replace("midt-fladen", "midt-fladen bunkefil")}</div><div class="beslut">${bilagPanel(nu).replace('<div class="hoejre-panel">', '<div class="hoejre-panel" style="border:0;padding:0">')}</div></div>
      <div class="koe">${bl.slice(0, 12).map((y, i) => `<div class="t ${y === nu ? "nu" : ""}" data-act="vaelg-b" data-i="${i}" role="button" tabindex="0"><b>${E(y.tekst)}</b><span>${y.beloeb != null ? kr(y.beloeb) : "ulæselig"}</span></div>`).join("")}</div>`
      : '<div class="kort"><div class="tom">Bunken er tom. Godt gået.</div></div>';
  } else {
    const bl = S.rows.filter((x) => x.type === "bilag");
    const sikker = (y) => y.sikkerhed === 1 && y.forslag?.konto && y.forslag?.banktransaktion_id && !(y.kontrol || []).length;
    const gr = [["Sikre (100 %, banklinje og ingen advarsler)", bl.filter(sikker)], ["Næsten sikre", bl.filter((y) => !sikker(y) && y.sikkerhed >= 0.7)], ["Kræver et blik", bl.filter((y) => !sikker(y) && !(y.sikkerhed >= 0.7))]];
    const valgte = bl.filter((y) => S.valgte[y.key] && sikker(y));
    krop = `<div class="kort tabeldel ark-tabel"><div class="tabel"><div class="r h"><div></div><div>Kunde</div><div>Dato</div><div>Afsender</div><div class="b">Beløb</div><div>Konto</div><div>Moms</div><div>Sikkerhed</div></div>
      ${gr.map(([n, g], gi) => (g.length ? `<div class="r gr" style="grid-template-columns:1fr auto"><span>${n} · ${g.length}</span>${gi === 0 ? `<button class="knap lille p" data-act="godkend-alle">Godkend alle ${g.length}</button>` : ""}</div>` +
        g.map((y) => `<div class="r"><div>${gi === 0 ? `<button class="cb" role="checkbox" aria-checked="${!!S.valgte[y.key]}" aria-label="Vælg" data-act="vaelg-r" data-key="${y.key}"></button>` : ""}</div><div class="tekst">${E(y.virksomhed)}</div><div class="tal">${y.dato ? F.datoKort(y.dato) : ""}</div><div class="tekst"><a href="#" data-act="aabn-post" data-key="${y.key}" style="color:inherit">${E(y.tekst)}</a></div><div class="b">${y.beloeb != null ? kr(y.beloeb) : ""}</div><div class="tekst">${y.forslag?.konto ? `<span class="pille kat">${E(y.forslag.konto)}</span>` : '<span class="pille roed">?</span>'}</div><div>${E(y.forslag?.momskode || "?")}</div><div>${sikH(y.sikkerhed)}</div></div>`).join("") : "")).join("") || '<div class="tom">Ingen bilag venter.</div>'}</div></div>
      ${valgte.length ? `<div class="handlinje">${valgte.length} valgt · ${kr(valgte.reduce((s, y) => s + y.beloeb, 0))} kr. <button class="knap p" data-act="godkend-valgte">Godkend</button><button class="knap" data-act="fravaelg">Fravælg</button></div>` : ""}`;
  }
  return `<div class="modeskift">${modes}<div class="filtre" role="group">${faner}</div><div class="hoejre-side"><a class="pille accent" href="#regler" style="text-decoration:none">Bogført af regler: gennemgå</a></div></div>${krop}`;
}

// ------------------------------------------------------------------ kunder ----
function kundeTal(v) {
  const r = S.rows.filter((x) => x.virksomhed_id === v), n = (t) => r.filter((x) => t.includes(x.type)).length;
  const m = r.filter((x) => x.type === "moms").sort((a, b) => (a.frist < b.frist ? -1 : 1))[0];
  return { bilag: n(["bilag"]), bank: n(["bank"]), spm: n(["spoergsmaal", "besked"]), moms: m ? (m.forslag?.klar ? `Klar, frist ${F.datoKort(m.frist)}` : `Ikke klar, frist ${F.datoKort(m.frist)}`) : "Indberettet", mk: m ? (m.forslag?.klar ? "accent" : "gul") : "groen" };
}
function kunder() {
  return `<div class="kort tabeldel"><div class="tabel"><div class="r rkd h"><div>Kunde</div><div>CVR</div><div class="b">Bilag</div><div class="b">Bank</div><div class="b">Spørgsmål</div><div>Moms</div><div>Periode</div><div></div></div>
    ${S.firmaer.map((k) => { const t = kundeTal(k.id); return `<div class="r rkd" role="button" tabindex="0" data-act="kunde" data-v="${k.id}"><div class="tekst"><b style="font-weight:550">${E(k.navn)}</b></div><div class="mono" style="font-size:13px">${E(k.cvr)}</div><div class="b">${t.bilag || "-"}</div><div class="b">${t.bank || "-"}</div><div class="b">${t.spm ? pille("roed", t.spm) : "-"}</div><div>${pille(t.mk, E(t.moms))}</div><div style="color:var(--daempet)">${E(k.momsperiode)}</div><div class="b"><span class="knap lille">Åbn</span></div></div>`; }).join("")}</div>
    <div class="tabelfod"><span>${S.firmaer.length} ${S.firmaer.length === 1 ? "kunde" : "kunder"}</span><span>Nye kunder oprettes med scriptet (flow_arbejdsbord.md)</span></div></div>`;
}
async function hentKunde(v) {
  const [bk, pst, regler, bankst] = await Promise.all([
    sb.from("bankkonto").select("id, navn, konto").eq("virksomhed_id", v),
    sb.from("postering").select("id, nummer, dato, tekst, beslutter, regel_id, korrigerer, posteringslinje(konto, beloeb)").eq("virksomhed_id", v).order("nummer", { ascending: false }).limit(150),
    sb.from("konteringsregel").select("id, beskrivelse, tekst_moenster, konto, momskode, aktiv").eq("virksomhed_id", v).order("id"),
    rpc("bankforbindelse_status", { p_virksomhed: v }).catch(() => []),
  ]);
  const idag = new Date().toISOString().slice(0, 10);
  const afst = await Promise.all((bk.data || []).map(async (b) => ({ ...b, a: await rpc("afstemning", { p_bankkonto: b.id, p_til: idag }) })));
  await konti(v);
  const korr = new Set((pst.data || []).filter((p) => p.korrigerer).map((p) => p.korrigerer));
  S.kunde = { v, afst, poster: (pst.data || []).map((p) => ({ ...p, tilbagefoert: korr.has(p.id) })), regler: regler.data || [], bankst };
}
function kunde() {
  const K = S.kunde, k = firma(K?.v);
  if (!K) return `<div class="tom">Henter ...</div>`;
  const t = kundeTal(K.v);
  const tabs = [["overblik", "Overblik"], ["posteringer", "Posteringer"], ["regler", "Regler"], ["stamdata", "Stamdata"]];
  const posthoved = "grid-template-columns:70px 110px minmax(0,1.6fr) minmax(0,1fr) 120px 110px 110px";
  const ind = {
    overblik: `<div class="gitter g3">${K.afst.map((b) => `<div class="kort"><h2>Afstemning · ${E(b.navn)}</h2><div class="stort tal">${kr(b.a.difference)} <small>difference</small></div><div class="not">Bank ${kr(b.a.bank_saldo)} · bogført ${kr(b.a.bogfoert_saldo)}</div><div style="margin-top:8px">${b.a.afstemt ? pille("groen", "Afstemt") : pille("gul", `${b.a.uafstemte_banklinjer} banklinjer venter`)}${b.a.import_hul ? " " + pille("roed", "Hul i bankimporten") : ""}</div></div>`).join("") || `<div class="kort"><h2>Afstemning</h2><p class="not">Ingen bankkonto endnu.</p></div>`}
      <div class="kort"><h2>Åbne ting</h2><div class="liste" style="margin-top:6px"><div class="li"><div class="t">Bilag i indbakken</div>${pille(t.bilag ? "gul" : "groen", t.bilag)}</div><div class="li"><div class="t">Banklinjer uden match</div>${pille(t.bank ? "gul" : "groen", t.bank)}</div><div class="li"><div class="t">Spørgsmål og beskeder</div>${pille(t.spm ? "roed" : "groen", t.spm)}</div></div></div>
      <div class="kort"><h2>Bank og moms</h2><div class="liste" style="margin-top:6px">${(K.bankst || []).map((b) => `<div class="li"><div class="t">${E(b.bank)}</div><span>${b.gyldig_til ? "samtykke til " + dk(b.gyldig_til) : E(b.status)}</span></div>`).join("") || `<div class="li"><div class="t">Bankforbindelse</div><span>Ikke koblet til</span></div>`}<div class="li"><div class="t">Moms</div>${pille(t.mk, E(t.moms))}</div></div></div></div>`,
    posteringer: `<div class="kort tabeldel"><div class="tabel"><div class="r h" style="${posthoved}"><div>Nr.</div><div>Dato</div><div>Tekst</div><div>Konto</div><div class="b">Beløb</div><div>Beslutter</div><div></div></div>
      ${K.poster.map((p) => { const l = (p.posteringslinje || []).filter((x) => x.beloeb > 0)[0] || p.posteringslinje?.[0] || {}; return `<div class="r" style="${posthoved}"><div class="mono tal">${p.nummer}</div><div class="tal">${dk(p.dato)}</div><div class="tekst">${E(p.tekst)}${p.korrigerer ? " " + pille("graa", "Korrektion") : ""}${p.tilbagefoert ? " " + pille("graa", "Tilbageført") : ""}</div><div class="tekst">${E(l.konto || "")} ${E(kontonavn(K.v, l.konto))}</div><div class="b">${l.beloeb != null ? kr(l.beloeb) : ""}</div><div>${pille(p.beslutter === "regel" ? "accent" : "graa", p.beslutter === "regel" ? "Regel" : p.beslutter === "menneske" ? "Menneske" : p.beslutter === "import" ? "Import" : "AI")}</div><div class="b">${p.korrigerer || p.tilbagefoert ? "" : `<button class="knap lille" data-act="tilbagefoer" data-id="${p.id}">Tilbagefør</button>`}</div></div>${S.tilbage === p.id ? `<div class="r" style="grid-template-columns:minmax(0,1fr) auto auto;gap:8px;background:var(--accent-svag)"><input class="inp" id="f-grund" placeholder="Hvorfor tilbageføres postering ${p.nummer}? (gemmes i loggen)" autocomplete="off"><button class="knap lille p" data-act="tilbagefoer-ok" data-id="${p.id}" data-nr="${p.nummer}">Tilbagefør</button><button class="knap lille" data-act="tilbagefoer-fortryd">Fortryd</button></div>` : ""}`; }).join("") || '<div class="tom">Ingen posteringer endnu.</div>'}</div>
      <div class="tabelfod"><span>De seneste ${K.poster.length} posteringer</span><span>Tilbageføring kræver en begrundelse og logges</span></div></div>`,
    regler: regelTabel(K.regler.map((r) => ({ ...r, virksomhed_id: K.v }))),
    stamdata: `<div class="kort"><div class="gitter g2">${[["Navn", k.navn], ["CVR", k.cvr], ["Adresse", [k.adresse_vej, k.adresse_husnr].filter(Boolean).join(" ") + ", " + [k.adresse_postnr, k.adresse_by].filter(Boolean).join(" ")], ["Mail", k.email], ["Momsperiode", k.momsperiode], ["Bilagsadresse", k.indbakke ? k.indbakke + "@bilag.tallo.dk" : "Ikke sat op"], ["Kunde siden", dk(k.oprettet)], ["Bankkonti", K.afst.map((b) => b.navn).join(", ") || "Ingen"]].map(([l, v]) => `<div class="felt"><label>${l}</label><input class="inp" value="${E(v || "")}" readonly></div>`).join("")}</div><p class="not" style="margin:14px 0 0;font-size:13px">Stamdata rettes med scriptet; CVR-oplysninger hentes fra CVR-registeret.</p></div>`,
  };
  return `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px"><a href="#kunder" class="knap lille">‹ Alle kunder</a><b style="font-size:17px">${E(k.navn)}</b><div class="faner" role="tablist" style="margin-left:auto">${tabs.map(([tb, n]) => `<button role="tab" aria-selected="${S.kundeTab === tb}" data-act="ktab" data-t="${tb}">${n}</button>`).join("")}</div></div>${ind[S.kundeTab]}`;
}

// -------------------------------------------------------------- bogført af AI ----
async function hentAI() {
  const rows = await rpc("bogfoert_af_ai");
  await Promise.all([...new Set(rows.map((x) => x.virksomhed_id))].map(konti));
  S.ai = rows;
}
function aiSide() {
  const L = S.ai;
  if (!L) return `<div class="tom">Henter ...</div>`;
  const stik = L.filter((x) => x.stikproeve), resten = L.filter((x) => !x.stikproeve);
  const raekke = (x) => `<div class="r rai"><div>${x.stikproeve ? pille("accent", "Stikprøve") : ""}</div><div class="tekst"><b style="font-weight:550">${E(x.tekst)}</b><small class="not" style="display:block">${E(x.virksomhed)} · ${dk(x.dato)}</small></div>
    <div class="tekst">${E(x.konto)} ${E(kontonavn(x.virksomhed_id, x.konto))}<small class="not" style="display:block">${E(x.begrundelse)}</small></div><div class="b mono">${kr(x.beloeb)}</div><div>${sikH(+x.sikkerhed)}</div>
    <div class="b" style="display:flex;gap:6px;justify-content:flex-end"><button class="knap lille p" data-act="ai-ok" data-id="${x.vurdering_id}">Godkend</button><button class="knap lille" data-act="ai-tilbage" data-id="${x.postering_id}">Tilbagefør</button></div></div>
    ${S.aiTilbage === x.postering_id ? `<div class="r" style="grid-template-columns:minmax(0,1fr) auto auto;gap:8px;background:var(--accent-svag)"><input class="inp" id="f-grund" placeholder="Hvorfor er det forkert? (gemmes i loggen)" autocomplete="off"><button class="knap lille p" data-act="ai-tilbage-ok" data-id="${x.postering_id}">Tilbagefør</button><button class="knap lille" data-act="tilbagefoer-fortryd">Fortryd</button></div>` : ""}`;
  const hoved = `<div class="r rai h"><div></div><div>Post</div><div>Konto og begrundelse</div><div class="b">Beløb</div><div>Sikkerhed</div><div></div></div>`;
  return `<div class="gitter g3" style="margin-bottom:16px"><div class="kort"><h2>Til gennemsyn</h2><div class="stort tal">${L.length}</div><div class="not">bogført af AI, ikke set af et menneske</div></div>
      <div class="kort"><h2>Stikprøver</h2><div class="stort tal">${stik.length}</div><div class="not">udtaget tilfældigt; se dem først</div></div>
      <div class="kort"><h2>I indbakken</h2><div class="stort tal">${S.rows.filter((x) => x.type === "bilag" || x.type === "bank").length}</div><div class="not">undtagelser, AI'en ikke bogførte selv</div></div></div>
    ${stik.length ? `<div class="kort tabeldel" style="margin-bottom:16px"><div class="kort-hoved" style="padding:18px 20px 0"><h2>Stikprøver</h2>${stik.length > 1 ? `<button class="knap lille" data-act="ai-alle" data-hvilke="stik">Godkend alle ${stik.length}</button>` : ""}</div><div class="tabel">${hoved}${stik.map(raekke).join("")}</div></div>` : ""}
    <div class="kort tabeldel"><div class="kort-hoved" style="padding:18px 20px 0"><h2>Resten</h2>${resten.length ? `<button class="knap lille" data-act="ai-alle" data-hvilke="resten">Godkend alle ${resten.length}</button>` : ""}</div><div class="tabel">${hoved}${resten.map(raekke).join("") || '<div class="tom">Intet at se igennem.</div>'}</div></div>`;
}

// ------------------------------------------------------------------ regler ----
function regelTabel(regler) {
  return `<div class="kort tabeldel"><div class="kort-hoved" style="padding:18px 20px 0"><h2>Regler</h2><span class="not">En regel kan kun slås fra; en ny regel får et nyt id</span></div><div class="tabel"><div class="r rre h"><div>Mønster</div><div>Konto</div><div>Kunde</div><div>Id</div><div>Moms</div><div>Aktiv</div></div>
    ${regler.map((r) => `<div class="r rre"><div class="tekst mono" style="font-size:13px">${E(r.tekst_moenster)}</div><div class="tekst">${E(r.konto)} ${E(kontonavn(r.virksomhed_id, r.konto))}</div><div class="tekst">${E(firma(r.virksomhed_id).navn)}</div><div class="mono tekst" style="font-size:12.5px">${E(r.id)}</div><div>${E(r.momskode || "-")}</div><div><button class="sw" role="switch" aria-checked="${r.aktiv}" aria-label="Aktiv" ${r.aktiv ? `data-act="regel-fra" data-v="${r.virksomhed_id}" data-id="${E(r.id)}"` : "disabled"}></button></div></div>`).join("") || '<div class="tom">Ingen regler.</div>'}</div></div>`;
}
async function hentRegler() {
  const [regler, forslag, afRegler] = await Promise.all([
    sb.from("konteringsregel").select("virksomhed_id, id, beskrivelse, tekst_moenster, konto, momskode, aktiv").order("virksomhed_id").order("id"),
    rpc("regelforslag"), rpc("bogfoert_af_regler"),
  ]);
  await Promise.all([...new Set((regler.data || []).map((r) => r.virksomhed_id))].map(konti));
  S.regler = { liste: regler.data || [], forslag, afRegler };
}
function regler() {
  const R = S.regler;
  if (!R) return `<div class="tom">Henter ...</div>`;
  return `${regelTabel(R.liste)}
    <div class="gitter g2" style="margin-top:16px;align-items:start"><div class="kort"><div class="kort-hoved"><h2>Forslag til nye regler</h2></div><p class="not" style="margin-top:0">Efter 3 ens godkendelser af samme leverandør foreslår programmet en regel. Du klikker.</p>
      ${R.forslag.map((f, i) => `<div class="li" style="display:flex;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--lineal2)"><div class="t" style="flex:1"><b>${E(f.leverandoer)} → ${E(f.konto)} ${E(f.kontonavn)}</b><small style="color:var(--daempet)">${E(f.virksomhed)} · ${f.antal} ens godkendelser · ${E(f.momskode || "ingen moms")}</small></div><button class="knap lille p" data-act="opret-regel" data-i="${i}">Opret</button></div>`).join("") || '<p class="not">Ingen forslag lige nu.</p>'}</div>
      <div class="kort"><div class="kort-hoved"><h2>Bogført af regler</h2>${pille("accent", R.afRegler.length + " til gennemgang")}</div><p class="not" style="margin-top:0">Regler med 100 % sikkerhed bogfører selv. Her gennemgår du dem bagefter og kvitterer.</p>
        <div class="liste">${R.afRegler.slice(0, 12).map((p) => `<div class="li"><div class="t"><b>${E(p.tekst)}</b><small>${E(p.virksomhed)} · ${dk(p.dato)} · regel ${E(p.regel_id)}</small></div><span class="mono">${kr(p.beloeb)}</span></div>`).join("")}</div>
        ${R.afRegler.length ? `<div class="handl" style="margin-top:10px"><button class="knap" data-act="gennemgaa">Markér alle ${R.afRegler.length} som gennemgået</button></div>` : ""}</div></div>`;
}

// -------------------------------------------------------------------- moms ----
function forrige(fra, periode) {
  const md = { maaned: 1, kvartal: 3, halvaar: 6 }[periode] || 3, d = new Date(fra + "T00:00:00");
  const f = new Date(d.getFullYear(), d.getMonth() - md, 1), t = new Date(d.getFullYear(), d.getMonth(), 0);
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return [iso(f), iso(t)];
}
async function hentMoms(r) {
  if (!r || S.momsForrige?.key === r.key) return;
  const [fra, til] = forrige(r.forslag.fra, firma(r.virksomhed_id).momsperiode);
  S.momsForrige = { key: r.key, a: await rpc("momsangivelse", { p_virksomhed: r.virksomhed_id, p_fra: fra, p_til: til }).catch(() => null) };
  render();
}
function moms() {
  const ms = S.rows.filter((x) => x.type === "moms");
  if (!ms.length) return `<div class="kort"><div class="tom">Ingen perioder venter. Alle momsperioder er indberettet.</div></div>`;
  const r = ms.find((x) => x.key === S.momsKey) || ms[0], f = r.forslag || {}, a = f.momsangivelse || {};
  hentMoms(r);
  const fa = S.momsForrige?.key === r.key ? S.momsForrige.a || {} : {};
  return `<div class="gitter g12"><div class="kort"><div class="kort-hoved"><h2>Perioder, der venter</h2></div><div class="liste">${ms.map((q) => `<div class="li" role="button" tabindex="0" data-act="momsk" data-key="${q.key}" style="cursor:pointer;${q === r ? "background:var(--accent-svag);margin:0 -12px;padding:12px;border-radius:var(--radius-lille);border-top:0" : ""}"><div class="t"><b>${E(q.virksomhed)}</b><small>${E(q.tekst)} · frist ${dk(q.frist)}</small></div>${pille(q.forslag?.klar ? "accent" : "gul", q.forslag?.klar ? "Klar" : "Ikke klar")}</div>`).join("")}</div></div>
    <div style="display:grid;gap:16px;align-content:start"><div class="kort"><div class="kort-hoved"><h2>${E(r.virksomhed)} · ${E(r.tekst)}</h2>${pille(f.klar ? "accent" : "gul", f.klar ? "Klar til lukning" : "Ikke klar")}</div>${momsTjek(f)}</div>
      <div class="kort tabeldel"><div class="kort-hoved" style="padding:18px 20px 0"><h2>De felter, der indberettes</h2><span class="not">Mod forrige periode</span></div><table class="vtabel" style="margin-top:6px"><thead><tr><th>Felt</th><th>Denne periode</th><th>Forrige</th></tr></thead><tbody>${MOMSFELT.filter(([k]) => a[k] || fa[k] || /SalgsMoms|KoebsMoms|Tilsvar/.test(k)).map(([k, n]) => `<tr ${/Tilsvar/.test(k) ? 'class="sum"' : ""}><td>${n}</td><td>${kr(a[k] || 0)}</td><td style="color:var(--svag)">${fa[k] != null ? kr(fa[k]) : "-"}</td></tr>`).join("")}</tbody></table></div>
      <div class="kort"><div class="handl"><button class="knap p" data-act="udkast" ${f.klar ? "" : "disabled"}>Opret udkast hos Skattestyrelsen</button></div>
        <div class="felt" style="margin-top:14px;max-width:360px"><label for="f-kvit">Kvitteringsnummer fra TastSelv</label><div style="display:flex;gap:8px"><input class="inp" id="f-kvit" autocomplete="off"><button class="knap" data-act="registrer" ${f.klar ? "" : "disabled"}>Registrér som indberettet</button></div></div>
        <p class="not" style="margin:12px 0 0;color:var(--daempet);font-size:13px">Programmet laver kun et udkast. Du godkender selv i TastSelv, og perioden låses først, når du har registreret kvitteringen. Der er aldrig en knap, der sender momsen.${f.klar ? "" : " Perioden kan ikke lukkes, før tjeklisten er grøn."}</p></div></div></div>`;
}

// --------------------------------------------------------------- rapporter ----
function perioder() {
  const n = new Date(), y = n.getFullYear(), iso = (x) => x.toISOString().slice(0, 10);
  return { aar: ["År til dato", `${y}-01-01`, iso(n)], sidste_aar: [`Hele ${y - 1}`, `${y - 1}-01-01`, `${y - 1}-12-31`] };
}
async function hentRapport() {
  const R = S.rap, v = R.v || S.firmaer[0]?.id;
  if (!v) return;
  R.v = v;
  const [, fra, til] = perioder()[R.periode];
  R.data = R.type === "saldo" ? await rpc("saldobalance", { p_virksomhed: v, p_fra: fra, p_til: til })
    : R.type === "balance" ? await rpc("balance", { p_virksomhed: v, p_pr: til }) : await rpc("resultatopgoerelse", { p_virksomhed: v, p_fra: fra, p_til: til });
  R.hentet = v + R.type + R.periode;
  render();
}
function rapporter() {
  const R = S.rap, P = perioder();
  if (R.hentet !== (R.v || S.firmaer[0]?.id) + R.type + R.periode) hentRapport().catch((e) => F.toast(e.message));
  const linjer = R.type === "saldo" ? R.data || [] : R.data?.linjer || [];
  const sum = linjer.reduce((s, l) => s + +l.saldo, 0);
  const titel = { resultat: "Resultatopgørelse", balance: "Balance", saldo: "Saldobalance" }[R.type];
  return `<div class="gitter g12"><div class="kort"><div class="kort-hoved"><h2>Rapport</h2></div>
      <div class="felt"><label for="r-v">Kunde</label><select class="inp" id="r-v" data-rap="v">${S.firmaer.map((k) => `<option value="${k.id}" ${k.id === R.v ? "selected" : ""}>${E(k.navn)}</option>`).join("")}</select></div>
      <div class="felt" style="margin-top:10px"><label for="r-t">Rapport</label><select class="inp" id="r-t" data-rap="type">${[["resultat", "Resultatopgørelse"], ["balance", "Balance"], ["saldo", "Saldobalance"]].map(([k, t]) => `<option value="${k}" ${k === R.type ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div class="felt" style="margin-top:10px"><label for="r-p">Periode</label><select class="inp" id="r-p" data-rap="periode">${Object.entries(P).map(([k, [t]]) => `<option value="${k}" ${k === R.periode ? "selected" : ""}>${t}</option>`).join("")}</select></div>
      <div style="margin-top:16px" class="not">Eksport</div><div class="handl" style="margin-top:6px"><button class="knap" data-act="csv">${IC.hent} Regnskab Basis (CSV)</button><button class="knap" data-act="print">${IC.hent} PDF</button></div>
      <p class="not" style="font-size:12.5px;margin:10px 0 0">SAF-T laves på driftsserveren (eksport/saft.py), indtil den får en knap.</p></div>
    <div class="kort tabeldel"><div class="kort-hoved" style="padding:18px 20px 0"><h2>${titel}</h2><span class="not">${E(firma(R.v).navn)} · ${P[R.periode][0].toLowerCase()}</span></div>
      ${R.data ? `<table class="vtabel" style="margin-top:6px"><thead><tr><th>Konto</th><th style="text-align:left">Navn</th><th>Saldo</th></tr></thead><tbody>${linjer.map((l) => `<tr><td>${E(l.konto)}</td><td style="text-align:left">${E(l.navn)}</td><td>${kr(l.saldo)}</td></tr>`).join("")}
        <tr class="sum"><td></td><td style="text-align:left">${R.type === "resultat" ? "Resultat (negativ er overskud)" : R.type === "balance" ? (R.data.balancerer ? "Balancerer" : "Balancerer ikke") : "I alt"}</td><td>${kr(R.type === "balance" ? R.data.resultat_til_dato ?? sum : sum)}</td></tr></tbody></table>` : `<div class="tom">Henter ...</div>`}</div></div>`;
}

// --------------------------------------------------------------------- log ----
async function hentLog() {
  const v = S.logV || S.firmaer[0]?.id;
  if (!v) return;
  S.logV = v;
  const [h, hel] = await Promise.all([
    sb.from("haendelse").select("id, tidspunkt, handling, beslutter, regel_id, ai_begrundelse, bruger_id, data").eq("virksomhed_id", v).order("id", { ascending: false }).limit(150),
    rpc("verificer_kaede", { v }),
  ]);
  S.log = { v, rows: h.data || [], hel };
  render();
}
const HANDLING = { bogfoert: "Bogført", kladde: "Kladde", korrektion: "Korrektion", afvist: "Afvist", indberettet: "Moms indberettet", periode_laast: "Periode låst",
  bank_import: "Bankimport", bank_match: "Bank afstemt", bank_match_fjernet: "Afstemning fjernet", bilag_modtaget: "Bilag modtaget", bilag_laest: "Bilag læst",
  faktura_udstedt: "Faktura udstedt" };
function detaljer(h) {
  const d = h.data || {};
  if (h.handling === "bogfoert") return `Postering ${d.nummer ?? ""} ${d.dato ? dk(d.dato) : ""} · ${(d.linjer || []).map((l) => `${l.konto} ${kr(l.beloeb)}`).join(", ")}`;
  if (h.handling === "kladde") return d.navn || "";
  if (h.handling === "korrektion") return `Postering ${d.nummer ?? ""}: ${d.begrundelse || ""}`;
  if (h.handling === "indberettet") return `${dk(d.fra)} til ${dk(d.til)} · kvittering ${d.kvittering || ""}`;
  if (h.handling === "periode_laast") return `${dk(d.fra)} til ${dk(d.til)}`;
  if (h.handling === "bank_import") return `${d.filnavn || ""} · ${d.nye ?? 0} nye af ${d.linjer ?? 0} linjer`;
  if (h.handling === "bank_match") return `${d.dato ? dk(d.dato) : ""} ${d.beloeb != null ? kr(d.beloeb) : ""}`;
  if (h.handling === "bilag_modtaget") return `${d.filnavn || ""} · ${KILDE[d.kilde] || d.kilde || ""}`;
  if (h.handling === "bilag_laest") return d.forslag?.konto ? `Forslag ${d.forslag.konto} (${Math.round((d.forslag.sikkerhed || 0) * 100)} %)` : "Intet forslag";
  if (h.handling === "faktura_udstedt") return `Faktura ${d.nummer ?? ""} til ${d.debitor || ""} · ${d.total != null ? kr(d.total) : ""}`;
  return d.begrundelse || d.tekst || h.ai_begrundelse || "";
}
function log() {
  const L = S.log;
  if (!L || L.v !== (S.logV || S.firmaer[0]?.id)) { hentLog().catch((e) => F.toast(e.message)); return `<div class="tom">Henter ...</div>`; }
  const hvem = (h) => (h.bruger_id === BRUGER?.id ? "Dig" : h.beslutter === "regel" ? "Regel" : h.bruger_id ? "Bruger" : "System");
  const farve = (x) => (x === "bogfoert" ? "groen" : x === "afvist" || x === "korrektion" ? "roed" : "graa");
  return `<div class="kort" style="margin-bottom:16px"><div class="kaede"><span class="ikon" ${L.hel ? "" : 'style="background:var(--roed-svag);color:var(--roed)"'}>${L.hel ? IC.check : "!"}</span><div><b style="font-size:16px">${L.hel ? "Loggen er hel" : "Loggen er ændret"}</b><div class="not" style="color:var(--daempet)">${L.hel ? "Hver hændelse er låst til den forrige. Ingen hændelser er ændret." : "Kæden er brudt. Stop og undersøg, før der bogføres mere."}</div></div>
      <select class="inp" style="margin-left:auto;max-width:280px" data-log="v">${S.firmaer.map((k) => `<option value="${k.id}" ${k.id === L.v ? "selected" : ""}>${E(k.navn)}</option>`).join("")}</select></div></div>
    <div class="kort tabeldel"><div class="tabel"><div class="r rlo h"><div>Tid</div><div>Hvem</div><div>Hvad</div><div>Detaljer</div><div>Nr.</div></div>${L.rows.map((h) => `<div class="r rlo"><div class="tal" style="white-space:nowrap">${F.datoKort(String(h.tidspunkt).slice(0, 10))} ${new Date(h.tidspunkt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}</div><div>${hvem(h)}${h.regel_id ? ` · ${E(h.regel_id)}` : ""}</div><div>${pille(farve(h.handling), E(HANDLING[h.handling] || h.handling))}</div><div class="tekst">${E(detaljer(h))}</div><div class="mono" style="font-size:12.5px">${h.id}</div></div>`).join("") || '<div class="tom">Ingen hændelser.</div>'}</div></div>`;
}

// ------------------------------------------------------------ indstillinger ----
function indstillinger() {
  const fa = S.faktorer || [];
  return `<div class="gitter g2"><div class="kort"><div class="kort-hoved"><h2>Login og sikkerhed</h2></div><div class="liste"><div class="li"><div class="t"><b>Ekstra sikkerhed (2-trins)</b><small>Kræves altid. Uden den kan du ikke se eller bogføre noget.</small></div>${pille("groen", "Til")}</div>
      ${fa.map((f) => `<div class="li"><div class="t"><b>${E(f.friendly_name || "Godkenderapp")}</b><small>Oprettet ${dk(f.created_at)}</small></div>${pille("graa", "App-kode")}</div>`).join("")}
      <div class="li"><div class="t"><b>Logget ind som</b><small>${E(BRUGER?.mail)}</small></div></div><div class="li"><div class="t"><b>Login udløber efter</b><small>12 timer</small></div></div></div>
      <div class="handl" style="margin-top:12px"><button class="knap" data-act="logud">Log ud</button></div></div>
    <div class="kort"><div class="kort-hoved"><h2>Tastaturgenveje</h2></div><div class="genveje" style="display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:14px;color:var(--tekst)"><span><kbd>J</kbd> <kbd>K</kbd></span><span>Op og ned i listen</span><span><kbd>↵</kbd></span><span>Godkend</span><span><kbd>E</kbd></span><span>Ret konto eller moms</span><span><kbd>S</kbd></span><span>Spørg kunden</span><span><kbd>A</kbd></span><span>Afvis med begrundelse</span><span><kbd>/</kbd></span><span>Søg</span><span><kbd>G</kbd> <kbd>K</kbd></span><span>Gå til kunder</span></div></div></div>`;
}
const VIEWS = { ai: aiSide, indbakke, kunder, kunde, regler, moms, rapporter, log, indstillinger };

// ------------------------------------------------------------ skal og login ----
function skal(indhold) {
  const n = S.rows.length;
  const ini = (BRUGER?.mail || "?").slice(0, 2).toUpperCase();
  return `<div class="app"><aside class="side"><div class="brand">tallo <small>bord</small></div><nav aria-label="Hovedmenu">${NAV.map(([r, t, ic]) => `<a href="#${r}" ${S.route === r || (r === "kunder" && S.route === "kunde") ? 'aria-current="page"' : ""}>${IC[ic]}<span>${t}</span>${r === "indbakke" && n ? `<span class="tael">${n}</span>` : ""}</a>`).join("")}</nav>
    <div class="bruger-kort"><span class="ava">${E(ini)}</span><div><b style="font-size:13.5px">${E(BRUGER?.mail)}</b><small>Bogholder · 2-trins er til</small></div></div></aside>
    <main class="main"><header class="top bord"><h1>${TITEL[S.route]}</h1><label class="soeg">${IC.soeg}<input id="soeg" placeholder="Søg kunde, tekst eller beløb" autocomplete="off" value="${E(S.soeg || "")}"><kbd>/</kbd></label><div class="hoejre-side">${S.log?.hel === false ? pille("roed", "Loggen er ændret") : ""}</div></header><div class="sider bord" id="sider">${indhold}</div></main></div>`;
}
function render() {
  const app = document.getElementById("app");
  if (!BRUGER) return;
  const fokus = document.activeElement?.id, pos = document.activeElement?.selectionStart;
  const svar = document.getElementById("f-svar")?.value;

  const rul = document.querySelector(".liste-sp")?.scrollTop;
  app.innerHTML = skal(VIEWS[S.route]());
  document.title = TITEL[S.route] + " · Tallo bord";
  if (svar != null && document.getElementById("f-svar")) document.getElementById("f-svar").value = svar;
  const rettet = S.route === "indbakke" ? S.rettet[nu()?.key] : null;           // kun brugerens egne aendringer
  if (rettet) for (const [id, v] of Object.entries(rettet)) { const el = document.getElementById(id); if (el) el.value = v; }
  if (rul != null && document.querySelector(".liste-sp")) document.querySelector(".liste-sp").scrollTop = rul;
  if (fokus && /^(soeg|f-svar|f-kvit|f-grund)$/.test(fokus)) { const el = document.getElementById(fokus); el?.focus(); if (pos != null && el?.setSelectionRange) try { el.setSelectionRange(pos, pos); } catch { /* intet */ } }
  document.querySelector(".post.valgt")?.scrollIntoView({ block: "nearest" });
}
function side(html) {
  BRUGER = null;
  document.getElementById("app").innerHTML = `<main class="login"><div class="kort"><div class="logo-ord">tallo<small>bord</small></div>${html}</div></main>`;
}
function loginSide(besked = "") {
  side(`<h1>Log ind</h1><p class="not">Kun for bogholdere. Du skal bruge din kode og din godkenderapp.</p>
    <form id="login"><div class="felt"><label for="mail">Mail</label><input class="inp" id="mail" type="email" autocomplete="username" required></div>
    <div class="felt" style="margin-top:12px"><label for="kode">Adgangskode</label><input class="inp" id="kode" type="password" autocomplete="current-password" required></div>
    <button class="knap p" style="margin-top:16px;width:100%;justify-content:center" type="submit">Fortsæt</button></form>
    ${besked ? `<p class="not" role="status" style="margin-top:14px">${E(besked)}</p>` : ""}${LOKALT && !DEMO ? `<p class="not" style="font-size:12px;margin-top:14px">Lokalt: othman@tallo.dk / demo-kode-1234</p>` : ""}`);
  document.getElementById("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: vaerdi("mail"), password: document.getElementById("kode").value });
    return error ? loginSide("Forkert mail eller kode.") : start();
  });
}
function kodeForm(titel, tekst, ekstra, onKode) {
  side(`<h1>${titel}</h1><p class="not">${tekst}</p>${ekstra}<form id="mfa"><div class="felt"><label for="kode6">Kode fra appen</label><input class="inp kode" id="kode6" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></div>
    <button class="knap p" style="margin-top:16px;width:100%;justify-content:center" type="submit">Bekræft</button></form><p class="not" role="status" id="mfa-status" style="margin-top:12px"></p>
    <button class="knap lille" style="margin-top:6px" data-act="logud">Log ud</button>`);
  document.getElementById("kode6").focus();
  document.getElementById("mfa").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fejl = await onKode(vaerdi("kode6"));
    if (fejl) { document.getElementById("mfa-status").textContent = fejl; document.getElementById("kode6").select(); } else start();
  });
}
async function tofaktor() {
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") return true;
  const { data: f } = await sb.auth.mfa.listFactors();
  const totp = (f?.totp || []).find((x) => x.status === "verified");
  if (totp) {
    kodeForm("Bekræft med din app", "Skriv koden fra din godkenderapp.", "", async (code) => {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: totp.id, code });
      return error ? "Koden passer ikke. Prøv den næste." : null;
    });
    return false;
  }
  for (const x of f?.all || []) if (x.status !== "verified") await sb.auth.mfa.unenroll({ factorId: x.id });
  const { data: ny, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Tallo bord " + new Date().toISOString().slice(0, 16) });
  if (error) { side(`<h1>2-trins kunne ikke sættes op</h1><p class="not">${E(error.message)}</p><button class="knap" data-act="logud">Log ud</button>`); return false; }
  kodeForm("Sæt 2-trins op", "Arbejdsbordet kræver altid en godkenderapp (fx Google Authenticator, 1Password eller Microsoft Authenticator). Scan koden, og skriv de seks cifre.",
    `<div class="qr"><img src="${E(ny.totp.qr_code)}" alt="QR-kode til godkenderappen"></div><p class="hemmelig">Kan du ikke scanne? Skriv nøglen: ${E(ny.totp.secret)}</p>`,
    async (code) => {
      const { error: e2 } = await sb.auth.mfa.challengeAndVerify({ factorId: ny.id, code });
      return e2 ? "Koden passer ikke. Vent på den næste og prøv igen." : null;
    });
  return false;
}
async function start() {
  const ses = await session();
  if (!ses) return loginSide();
  if (!(await tofaktor())) return;
  BRUGER = { id: ses.user.id, mail: ses.user.email };
  try {
    await hent();
    S.faktorer = (await sb.auth.mfa.listFactors()).data?.totp || [];
  } catch (err) {
    const ikke = /adgang/i.test(err.message);
    BRUGER = null;
    side(`<h1>${ikke ? "Ingen adgang" : "Noget gik galt"}</h1><p class="not">${ikke ? "Din bruger er ikke bogholder." : E(err.message)}</p><button class="knap" data-act="logud">Log ud</button>`);
    return;
  }
  rute();
}

// --------------------------------------------------------------- handlinger ----
const nu = () => (S.mode === "bunke" && S.route === "indbakke" ? S.rows.filter((x) => x.type === "bilag")[S.sel] : liste()[S.sel]);
async function efter(tekst) {
  S.svar = null; S.det = {}; S.rettet = {};
  await hent();
  render();
  if (tekst) F.toast(tekst);
}
async function travlt(fn) {
  if (S.travl) return;
  S.travl = true;
  document.getElementById("sider")?.classList.add("travl");          // ikke render(): formularen skal laeses foerst
  try { await fn(); } catch (err) { F.toast(err.message); } finally { S.travl = false; render(); }
}
function betaling(r) {
  const b = document.getElementById("f-betalt")?.value || "";
  return b.startsWith("bt:") ? { p_banktransaktion: b.slice(3), p_modkonto: null } : { p_banktransaktion: null, p_modkonto: b.slice(6) || null };
}
async function godkend(r) {
  if (!r) return;
  const v = r.virksomhed_id, konto = valgtKonto(), mk = vaerdi("f-moms") || null;
  if (r.type === "moms") { S.momsKey = r.key; location.hash = "moms"; return; }
  if (r.type === "bilag") {
    if (!konto) throw new Fejl("Vælg en konto (skriv nummer eller navn).");
    const b = betaling(r);
    if (!b.p_banktransaktion && !b.p_modkonto) throw new Fejl("Vælg, hvordan bilaget er betalt.");
    await rpc("bogfoer_bilag", { p_bilag: r.id, p_konto: konto, p_momskode: mk, ...b });
    return efter(`Bogført: ${r.tekst} ${r.beloeb != null ? kr(r.beloeb) : ""} på ${konto}`);
  }
  if (r.type === "bank") {
    if (r.forslag?.faktura_id && !S.udenBilag) {
      await rpc("bogfoer_fakturabetaling", { p_banktransaktion: r.id, p_faktura: r.forslag.faktura_id });
      return efter(`Betaling af faktura ${r.forslag.nummer} bogført`);
    }
    S.udenBilag = false;
    if (!konto) throw new Fejl("Vælg en konto (skriv nummer eller navn).");
    await rpc("bogfoer_banklinje", { p_banktransaktion: r.id, p_konto: konto, p_momskode: mk });
    return efter(`Bogført uden bilag: ${r.tekst} på ${konto}`);
  }
  const bt = S.det[r.key]?.match ? null : S.det[r.key]?.bt;            // allerede afstemt: intet at bogfoere
  if (r.type === "spoergsmaal") {
    if (bt && !r.forslag?.svar_bilag_id) {
      if (!konto) throw new Fejl("Vælg en konto (skriv nummer eller navn).");
      await rpc("bogfoer_banklinje", { p_banktransaktion: bt.id, p_konto: konto, p_momskode: mk, p_tekst: `${bt.tekst}. Kundens svar: ${r.forslag.svar}`.slice(0, 200) });
    }
    await rpc("luk_spoergsmaal", { p_spoergsmaal: r.id });
    return efter(bt && !r.forslag?.svar_bilag_id ? `Bogført på ${konto}, og spørgsmålet er lukket` : "Spørgsmålet er lukket");
  }
  if (r.type === "besked") {
    if (bt) {
      if (!konto) throw new Fejl("Vælg en konto (skriv nummer eller navn).");
      await rpc("bogfoer_banklinje", { p_banktransaktion: bt.id, p_konto: konto, p_momskode: mk, p_tekst: `${bt.tekst}. Kunden: ${r.tekst}`.slice(0, 200) });
    }
    await rpc("marker_besked_laest", { p_besked: r.id });
    return efter(bt ? `Bogført på ${konto}` : "Markeret som læst");
  }
}
async function sendSvar(r) {
  const tekst = vaerdi("f-svar");
  if (!tekst) throw new Fejl("Skriv en tekst først.");
  if (S.svar.hvad === "afvis") { await rpc("afvis_bilag", { p_bilag: r.id, p_begrundelse: tekst }); return efter(`Afvist: ${r.tekst}`); }
  const bt = r.type === "bank" ? r.id : S.det[r.key]?.bt?.id || r.forslag?.banktransaktion_id || null;
  const bilag = r.type === "bilag" ? r.id : r.forslag?.bilag_id || null;
  await rpc("stil_spoergsmaal", { p_virksomhed: r.virksomhed_id, p_tekst: tekst, p_bilag: bilag, p_banktransaktion: bt, p_haster: !!document.getElementById("f-haster")?.checked });
  if (r.type === "spoergsmaal") await rpc("luk_spoergsmaal", { p_spoergsmaal: r.id });
  if (r.type === "besked") await rpc("marker_besked_laest", { p_besked: r.id });
  return efter(`Spørgsmål sendt til ${r.virksomhed}`);
}
function download(navn, tekst, type = "text/csv") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([tekst], { type: type + ";charset=utf-8" }));
  a.download = navn; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function handling(a, el, e) {
  const r = nu();
  if (a === "logud") return logUd();
  if (a === "vaelg") { S.sel = +el.dataset.i; S.svar = null; return render(); }
  if (a === "vaelg-b") { S.sel = +el.dataset.i; S.svar = null; return render(); }
  if (a === "aabn-post") { e.preventDefault(); S.mode = "liste"; S.tab = "bilag"; S.sel = Math.max(0, liste().findIndex((x) => x.key === el.dataset.key)); return render(); }
  if (a === "tab") { S.tab = el.dataset.t; S.sel = 0; S.svar = null; return render(); }
  if (a === "mode") { S.mode = el.dataset.m; S.sel = 0; S.svar = null; return render(); }
  if (a === "godkend") return travlt(() => godkend(r));
  if (a === "uden-bilag") { S.udenBilag = true; return travlt(() => godkend(r)); }
  if (a === "ret") { const k = document.getElementById("f-konto"); k?.focus(); k?.select(); return; }
  if (a === "spoerg" || a === "afvis") { if (a === "afvis" && r?.type !== "bilag") return; S.svar = { key: r.key, hvad: a }; render(); return document.getElementById("f-svar")?.focus(); }
  if (a === "svar-luk") { S.svar = null; return render(); }
  if (a === "svar-send") return travlt(() => sendSvar(r));
  if (a === "laest") return travlt(async () => { await rpc("marker_besked_laest", { p_besked: r.id }); await efter("Markeret som læst"); });
  if (a === "luk-spm") return travlt(async () => { await rpc("luk_spoergsmaal", { p_spoergsmaal: r.id }); await efter("Spørgsmålet er lukket"); });
  if (a === "match") {
    const b = S.rows.find((x) => x.key === el.dataset.bilag);
    (S.rettet[b.key] ||= {})["f-betalt"] = "bt:" + r.id; S.tab = "bilag"; S.sel = Math.max(0, liste().findIndex((x) => x.key === b.key));
    return render();
  }
  if (a === "vaelg-r") { S.valgte[el.dataset.key] = !S.valgte[el.dataset.key]; return render(); }
  if (a === "fravaelg") { S.valgte = {}; return render(); }
  if (a === "godkend-alle" || a === "godkend-valgte") {
    const sikre = S.rows.filter((y) => y.type === "bilag" && y.sikkerhed === 1 && y.forslag?.konto && y.forslag?.banktransaktion_id && !(y.kontrol || []).length && (a === "godkend-alle" || S.valgte[y.key]));
    return travlt(async () => {
      let ok = 0; const fejl = [];
      for (const y of sikre) {
        try { await rpc("bogfoer_bilag", { p_bilag: y.id, p_konto: y.forslag.konto, p_momskode: y.forslag.momskode, p_banktransaktion: y.forslag.banktransaktion_id }); ok++; }
        catch (err) { fejl.push(`${y.tekst}: ${err.message}`); }
      }
      S.valgte = {};
      await efter(`${ok} bilag bogført${fejl.length ? `. ${fejl.length} sprunget over: ${fejl[0]}` : ""}`);
    });
  }
  if (a === "kunde") return travlt(async () => { await hentKunde(el.dataset.v); S.kundeTab = "overblik"; S.route = "kunde"; if (location.hash !== "#kunde") history.pushState(null, "", "#kunde"); });
  if (a === "ktab") { S.kundeTab = el.dataset.t; return render(); }
  if (a === "tilbagefoer") { S.tilbage = el.dataset.id; render(); return document.getElementById("f-grund")?.focus(); }
  if (a === "tilbagefoer-fortryd") { S.tilbage = null; S.aiTilbage = null; return render(); }
  if (a === "tilbagefoer-ok") {
    const grund = vaerdi("f-grund");
    if (!grund) return F.toast("Skriv en begrundelse. Den gemmes i loggen.");
    return travlt(async () => { await rpc("tilbagefoer", { p_postering: el.dataset.id, p_begrundelse: grund }); S.tilbage = null; await hentKunde(S.kunde.v); await efter(`Postering ${el.dataset.nr} er tilbageført`); });
  }
  if (a === "ai-ok") return travlt(async () => { await rpc("marker_ai_gennemgaaet", { p_vurderinger: [el.dataset.id] }); await hentAI(); F.toast("Godkendt"); });
  if (a === "ai-alle") {
    const ids = (S.ai || []).filter((x) => (el.dataset.hvilke === "stik") === !!x.stikproeve).map((x) => x.vurdering_id);
    return travlt(async () => { const n = await rpc("marker_ai_gennemgaaet", { p_vurderinger: ids }); await hentAI(); F.toast(`${n} godkendt`); });
  }
  if (a === "ai-tilbage") { S.aiTilbage = el.dataset.id; render(); return document.getElementById("f-grund")?.focus(); }
  if (a === "ai-tilbage-ok") {
    const grund = vaerdi("f-grund");
    if (!grund) return F.toast("Skriv hvorfor. Det gemmes i loggen.");
    return travlt(async () => { await rpc("tilbagefoer", { p_postering: el.dataset.id, p_begrundelse: "AI-fejl: " + grund }); S.aiTilbage = null; await hentAI(); await efter("Tilbageført. Posten ligger nu i indbakken igen."); });
  }
  if (a === "regel-fra") {
    if (!confirm(`Slå reglen ${el.dataset.id} fra? En regel kan ikke slås til igen; du opretter i så fald en ny.`)) return;
    return travlt(async () => {
      const { error } = await sb.from("konteringsregel").update({ aktiv: false }).eq("virksomhed_id", el.dataset.v).eq("id", el.dataset.id);
      if (error) throw new Fejl(error.message);
      if (S.route === "kunde") await hentKunde(S.kunde.v); else await hentRegler();
      F.toast("Reglen er slået fra");
    });
  }
  if (a === "opret-regel") {
    const f = S.regler.forslag[+el.dataset.i];
    const id = (f.leverandoer.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "regel") + "-" + Date.now().toString(36).slice(-4);
    return travlt(async () => {
      const { error } = await sb.from("konteringsregel").insert({ virksomhed_id: f.virksomhed_id, id, beskrivelse: `${f.leverandoer} på ${f.konto}`, tekst_moenster: f.moenster, konto: f.konto, momskode: f.momskode });
      if (error) throw new Fejl(error.message);
      await hentRegler();
      F.toast(`Regel oprettet: ${f.leverandoer} bogføres på ${f.konto}`);
    });
  }
  if (a === "gennemgaa") return travlt(async () => { const n = await rpc("marker_gennemgaaet", { p_posteringer: S.regler.afRegler.map((p) => p.postering_id) }); await hentRegler(); F.toast(`${n} poster markeret som gennemgået`); });
  if (a === "momsk") { S.momsKey = el.dataset.key; return render(); }
  if (a === "udkast" || a === "registrer") {
    const m = S.rows.find((x) => x.key === S.momsKey) || S.rows.find((x) => x.type === "moms"), f = m.forslag;
    if (a === "udkast") return travlt(async () => { await rpc("opret_momsudkast", { p_virksomhed: m.virksomhed_id, p_fra: f.fra, p_til: f.til }); F.toast("Udkastet er oprettet. Godkend det selv i TastSelv."); });
    const kvit = vaerdi("f-kvit");
    if (!kvit) return F.toast("Skriv kvitteringsnummeret fra TastSelv.");
    if (!confirm(`Registrér ${m.virksomhed}, ${m.tekst}, som indberettet med kvittering ${kvit}? Perioden låses.`)) return;
    return travlt(async () => { await rpc("registrer_indberetning", { p_virksomhed: m.virksomhed_id, p_fra: f.fra, p_til: f.til, p_indberettet: f.momsangivelse, p_kvittering: kvit }); S.momsKey = null; await efter("Perioden er registreret som indberettet og låst"); });
  }
  if (a === "csv") return travlt(async () => { const [, fra, til] = perioder()[S.rap.periode]; download(`regnskab-basis-${firma(S.rap.v).cvr}-${til}.csv`, await rpc("regnskab_basis_csv", { p_virksomhed: S.rap.v, p_fra: fra, p_til: til })); });
  if (a === "print") return window.print();
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  handling(el.dataset.act, el, e).catch((err) => F.toast(err.message));
});
document.addEventListener("change", (e) => {
  const el = e.target;
  husk(el);
  if (el.dataset.rap) { S.rap[el.dataset.rap] = el.value; S.rap.data = null; return render(); }
  if (el.dataset.log) { S.logV = el.value; S.log = null; return render(); }
  if (el.id === "f-konto") {                                                        // kontoens egen momskode som standard
    const v = nu()?.virksomhed_id, k = (S.konti[v] || []).find((x) => x.nummer === valgtKonto());
    if (k && document.getElementById("f-moms")) { document.getElementById("f-moms").value = k.momskode || ""; husk(document.getElementById("f-moms")); }
  }
});
function husk(el) {                                                                  // brugerens valg i beslutningen
  if (!/^f-(konto|moms|betalt)$/.test(el.id) || S.route !== "indbakke") return;
  const k = nu()?.key;
  if (k) (S.rettet[k] ||= {})[el.id] = el.value;
}
document.addEventListener("input", (e) => {
  husk(e.target);
  if (e.target.id === "soeg") { S.soeg = e.target.value; S.sel = 0; if (S.route !== "indbakke") location.hash = "indbakke"; else render(); }
});
let g = 0;
document.addEventListener("keydown", (e) => {
  if (!BRUGER) return;
  if (e.target.matches("input, textarea, select")) {
    if (e.key === "Escape") e.target.blur();
    if (e.key === "Enter" && e.target.id === "f-konto") { e.preventDefault(); document.querySelector('[data-act="godkend"]')?.click(); }
    return;
  }
  const m = e.key.toLowerCase();
  if (m === "g") { g = Date.now(); return; }
  if (m === "k" && Date.now() - g < 900) { g = 0; location.hash = "kunder"; return; }
  if (e.key === "/") { e.preventDefault(); document.getElementById("soeg")?.focus(); return; }
  if (S.route !== "indbakke") return;
  const l = S.mode === "bunke" ? S.rows.filter((x) => x.type === "bilag") : liste();
  if (m === "j" || e.key === "ArrowDown") { S.sel = Math.min(S.sel + 1, l.length - 1); S.svar = null; render(); }
  else if (m === "k" || e.key === "ArrowUp") { S.sel = Math.max(S.sel - 1, 0); S.svar = null; render(); }
  else if (e.key === "Enter") { e.preventDefault(); document.querySelector('[data-act="godkend"]')?.click(); }
  else if (m === "e") { e.preventDefault(); document.querySelector('[data-act="ret"]')?.click(); }
  else if (m === "s") { e.preventDefault(); document.querySelector('[data-act="spoerg"]')?.click(); }
  else if (m === "a") { e.preventDefault(); document.querySelector('[data-act="afvis"]')?.click(); }
  else if (e.key === "ArrowRight" && S.mode === "bunke") { S.sel = (S.sel + 1) % Math.max(1, l.length); render(); }
});
async function rute() {
  const r = location.hash.slice(1) || "indbakke";
  S.route = VIEWS[r] ? r : "indbakke";
  if (S.route === "kunde" && !S.kunde) S.route = "kunder";
  render();
  window.scrollTo(0, 0);
  try {
    if (S.route === "regler") { await hentRegler(); render(); }
    if (S.route === "ai") { await hentAI(); render(); }
    if (S.route === "kunder" || S.route === "indbakke" || S.route === "moms") { await hent(); render(); }
  } catch (err) { F.toast(err.message); }
}
window.addEventListener("hashchange", rute);
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") loginSide(); });
start();
