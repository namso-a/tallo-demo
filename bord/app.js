// Bogholderens arbejdsbord paa rigtige data. Én indbakke paa tvaers af kunder, tastaturet foerst. Stille som standard
// (Othman 22. okt 2026): det, der er i orden, har ingen farve; violet er det, der venter, og roed er fejl. Al logik ligger i databasen; her vises, vaelges og kaldes kun. Login kraever 2-trins (aal2).
import { DEMO, Fejl, LOKALT, logUd, rpc, sb, session } from "../felles/data.js?v=20261028204504";

const E = F.esc, IC = F.ICON, kr = F.kr;
const pille = (c, t) => `<span class="pille ${c}">${t}</span>`;
const dk = (s) => (s ? F.dato(String(s).slice(0, 10)) : "");
const S = { route: "indbakke", tab: "alt", sel: 0, rows: [], firmaer: [], konti: {}, det: {}, valgte: {},
            svar: null, rettet: {}, kunde: null, kundeTab: "overblik", momsKey: null, rap: { v: null, type: "resultat", periode: "aar" }, logV: null, travl: false };
let BRUGER = null;

const SIDE = "tallo-bord-side-smal";
const NAV = [["indbakke", "Indbakke", "overblik"], ["efterkontrol", "Efterkontrol", "check"], ["kunder", "Kunder", "salg"], ["regler", "Regler", "integrationer"], ["moms", "Moms", "moms"],
             ["rapporter", "Rapporter", "rapporter"], ["log", "Hændelseslog", "likviditet"], ["indstillinger", "Indstillinger", "indstillinger"]];
const TITEL = { efterkontrol: "Efterkontrol", indbakke: "Indbakke", kunder: "Kunder", kunde: "Kunde", regler: "Regler", moms: "Momslukning", rapporter: "Rapporter", log: "Hændelseslog", indstillinger: "Indstillinger" };
const momsNavn = (k) => (MOMSKODER.find((x) => x[0] === (k || "")) || [null, k])[1];
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
  const [rows, firmaer, nhKlar] = await Promise.all([rpc("indbakke"), sb.from("virksomhed").select("id, navn, cvr, momsperiode, oprettet, adresse_vej, adresse_husnr, adresse_postnr, adresse_by, email, indbakke").is("ophoert", null).order("navn"), rpc("nemhandel_klar").catch(() => [])]);
  if (firmaer.error) throw new Fejl(firmaer.error.message);
  S.nhKlar = nhKlar;
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
  try { await hentDetalje(r, d); } catch (e) { d.fejl = "Bilaget kunne ikke hentes: " + (e.message || e); }
  d.faerdig = true;
  render();
}

async function hentDetalje(r, d) {
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
}

// ------------------------------------------------------------- indbakken ----
const FANER = [["alt", "Alle", null], ["bilag", "Bilag", ["bilag"]], ["bank", "Bank", ["bank"]], ["spoergsmaal", "Spørgsmål", ["spoergsmaal", "besked"]], ["moms", "Moms", ["moms"]]];
function liste() {
  const typer = FANER.find((f) => f[0] === S.tab)?.[2];
  let l = S.rows.filter((r) => !typer || typer.includes(r.type));
  const q = (S.soeg || "").toLowerCase();
  if (q) l = l.filter((r) => [r.virksomhed, r.tekst, r.beloeb != null ? kr(Math.abs(r.beloeb)) : ""].join(" ").toLowerCase().includes(q));
  return l;
}
const tael = (typer) => S.rows.filter((r) => typer.includes(r.type)).length;
// Sikkerheden vises kun, naar den er under 95 %; er den hoej, er der stille.
const sikH = (s) => (s == null ? `<span class="stille">intet forslag</span>` : s >= 0.95 ? "" : `<span class="sik ${s < 0.7 ? "lav" : "mid"}"><i style="--s:${Math.round(s * 100)}%"></i>${Math.round(s * 100)} %</span>`);
const snart = (d) => d && new Date(d + "T00:00:00") - Date.now() < 14 * 864e5;
const sikre = () => S.rows.filter((y) => y.type === "bilag" && y.sikkerhed === 1 && y.forslag?.konto && y.forslag?.banktransaktion_id && !(y.kontrol || []).length);
const TYPENAVN = { bilag: "Bilag", bank: "Bank", spoergsmaal: "Svar", besked: "Besked", moms: "Moms" };
const KILDE = { mail: "modtaget på mail", scan: "scannet af kunden", efaktura: "e-faktura", upload: "lagt op", bank: "fra banken" };

function postRaekke(r, i) {
  const bel = r.beloeb == null ? "" : r.type === "bilag" ? kr(r.beloeb) : (r.beloeb > 0 ? "+" : "") + kr(r.beloeb);
  const under = [S.firmaer.length > 1 ? E(r.virksomhed) : "", S.tab === "alt" ? TYPENAVN[r.type] : "", r.dato ? F.datoKort(r.dato) : "", snart(r.frist) ? "frist " + F.datoKort(r.frist) : ""].filter(Boolean).join(" · ");
  const hoejre = r.type === "bilag" && r.sikkerhed == null ? sikH(null) : r.type === "moms" && r.forslag?.klar ? pille("accent", "Klar") : "";
  return `<div class="post ${i === S.sel ? "valgt" : ""}" data-act="vaelg" data-i="${i}" role="button" tabindex="0"><span class="hvad">${E(r.tekst)}</span><span class="bel">${bel}</span>
    <div class="fs"><span>${under}</span>${hoejre}</div></div>`;
}

const kontoListe = (v) => `<datalist id="kl-${v}">${(S.konti[v] || []).map((k) => `<option value="${k.nummer} ${E(k.navn)}">`).join("")}</datalist>`;
const kontoFelt = (v, n, id = "f-konto") => `<input class="inp" id="${id}" list="kl-${v}" value="${n ? E(n + " " + kontonavn(v, n)) : ""}" placeholder="Søg nummer eller navn" autocomplete="off">${kontoListe(v)}`;
const momsFelt = (mk, id = "f-moms") => `<select class="inp" id="${id}" aria-label="Momskode">${MOMSKODER.map(([k, t]) => `<option value="${k}" ${k === (mk || "") ? "selected" : ""}>${t}</option>`).join("")}</select>`;
const vaerdi = (id) => (document.getElementById(id)?.value || "").trim();
const valgtKonto = (id = "f-konto") => (vaerdi(id).match(/^\d{3,6}/) || [null])[0];

function svarFelt(r) {
  if (!S.svar || S.svar.key !== r.key) return "";
  const tekst = S.svar.hvad === "spoerg" ? "Spørgsmål til kunden" : S.svar.hvad === "afvis" ? "Hvorfor afvises det?" : "Svar til kunden";
  return `<div class="svarfelt"><label class="lille-tekst" for="f-svar">${tekst}</label><textarea class="inp" id="f-svar" maxlength="2000"></textarea>
    ${S.svar.hvad === "spoerg" ? `<label class="flueboks lille-tekst mt-1"><input type="checkbox" id="f-haster"> Haster (ellers mandag kl. 7)</label>` : ""}
    <div class="handl"><button class="knap p" data-act="svar-send">${S.svar.hvad === "afvis" ? "Afvis bilaget" : "Send"}</button><button class="knap" data-act="svar-luk">Fortryd</button></div></div>`;
}

// Forslaget i én blok: konto, sikkerhed (kun under 95 %), begrundelse og hvorfor AI'en ikke bogførte selv.
function forslagBlok(v, konto, sik, begrundelse, grunde) {
  const g = (grunde || []).map((x) => GRUNDE[x] || x).join(", ");
  return `<div class="forslag ${konto ? "" : "tomt"}"><div class="k"><span>${konto ? `${E(konto)} ${E(kontonavn(v, konto))}` : "Intet forslag"}</span>${konto ? sikH(sik) : ""}</div>
    ${begrundelse ? `<div class="hvorfor">${E(begrundelse)}</div>` : konto ? "" : `<div class="hvorfor">Vælg konto selv.</div>`}${g ? `<div class="hvorfor">Ikke bogført selv: ${E(g)}.</div>` : ""}</div>`;
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
      <div class="felt3"><label>Moms</label><span class="inp">${u.moms != null ? kr(u.moms) : "-"}</span></div></div>${kontrol}
    ${forslagBlok(v, f.konto, r.sikkerhed ?? (d.ai ? +d.ai.sikkerhed : null), f.begrundelse || d.ai?.begrundelse || (r.beloeb == null ? "Bilaget kunne ikke læses. Spørg kunden efter et nyt, eller afvis det." : ""), d.ai?.grunde)}
    <div><div class="felt3"><label>Konto</label>${kontoFelt(v, f.konto)}</div><div class="felt3"><label>Moms</label>${momsFelt(f.momskode || (f.konto ? "" : "koeb_25"))}</div>
      <div class="felt3"><label>Betalt</label><select class="inp" id="f-betalt">${betalt.map(([k, t]) => `<option value="${E(k)}" ${k === valgt ? "selected" : ""}>${E(t)}</option>`).join("")}</select></div></div>
    <div class="handl"><button class="knap p" data-act="godkend">Godkend</button><button class="knap" data-act="spoerg">Spørg kunden</button><button class="knap" data-act="afvis">Afvis</button></div>
    ${svarFelt(r)}</div>`;
}

function bankPanel(r) {
  const d = S.det[r.key] || {}, f = r.forslag || {}, v = r.virksomhed_id;
  d.ai_v = v;
  const bilag = S.rows.filter((x) => x.type === "bilag" && x.virksomhed_id === v && x.beloeb != null && Math.abs(x.beloeb - Math.abs(r.beloeb)) < 0.005);
  const beskeder = (d.beskeder || []).map((b) => `<div class="forslag"><div class="k"><span>Kunden skrev: "${E(b.tekst)}"</span></div><div class="hvorfor">${dk(b.oprettet)}</div></div>`).join("");
  return `<div class="hoejre-panel"><div><h3>${E(r.tekst)}</h3><div class="sub">${E(r.virksomhed)} · banklinje ${dk(r.dato)}</div></div><div class="felt3"><label>Beløb</label><span class="inp">${r.beloeb > 0 ? "+" : ""}${kr(r.beloeb)}</span></div>${d.ai && !f.faktura_id ? forslagBlok(v, d.ai.konto, +d.ai.sikkerhed, d.ai.begrundelse, d.ai.grunde) : ""}${beskeder}
    ${f.faktura_id ? `<div class="forslag"><div class="k"><span>Betaling af faktura ${E(f.nummer)}</span></div><div class="hvorfor">${E(f.begrundelse)}</div></div>
      <div class="handl"><button class="knap p" data-act="godkend">Bogfør som betaling</button></div>` : ""}
    ${bilag.length ? `<div class="lille-tekst">Bilag med samme beløb</div><div class="liste">${bilag.map((b) => `<div class="li taet"><div class="t"><b>${E(b.tekst)}</b><small>${kr(b.beloeb)} · ${b.dato ? F.datoKort(b.dato) : ""}</small></div><button class="knap lille" data-act="match" data-bilag="${b.key}">Brug bilaget</button></div>`).join("")}</div>` : ""}
    <div><div class="lille-tekst">Bogfør uden bilag</div><div class="felt3"><label>Konto</label>${kontoFelt(v, d.ai?.konto || null)}</div><div class="felt3"><label>Moms</label>${momsFelt(d.ai?.momskode || (r.beloeb > 0 ? "salg_25" : "koeb_25"))}</div></div>
    <div class="handl">${f.faktura_id ? `<button class="knap" data-act="uden-bilag">Bogfør på kontoen</button>` : `<button class="knap p" data-act="godkend">Bogfør</button>`}<button class="knap" data-act="spoerg">Spørg kunden</button></div>
    ${svarFelt(r)}</div>`;
}

function spmPanel(r) {
  const f = r.forslag || {}, v = r.virksomhed_id, d = S.det[r.key] || {};
  const besked = r.type === "besked", bogfoert = d.match?.postering?.nummer;
  const bt = bogfoert ? null : d.bt;
  const hoved = besked ? `<div><h3>Besked fra kunden</h3><div class="sub">${E(r.virksomhed)} · ${dk(r.modtaget || r.dato)}</div></div><div class="forslag"><div class="k"><span>"${E(r.tekst)}"</span></div>${f.betaling ? `<div class="hvorfor">Om betalingen ${E(f.betaling)} ${f.betalingsdato ? F.datoKort(f.betalingsdato) : ""} ${r.beloeb != null ? kr(r.beloeb) : ""}</div>` : ""}</div>`
    : `<div><h3>Svar fra kunden</h3><div class="sub">${E(r.virksomhed)} · ${dk(r.modtaget || r.dato)}</div></div><div class="forslag"><div class="k"><span>"${E(f.svar || (f.svar_bilag_id ? "Bilag vedhæftet" : "Ubesvaret"))}"</span></div><div class="hvorfor">Du spurgte: ${E(f.spoergsmaal)}</div></div>`;
  const bogfoer = bt ? `<div><div class="lille-tekst">Banklinje ${dk(bt.dato)} ${E(bt.tekst)} ${kr(bt.beloeb)}</div><div class="felt3"><label>Konto</label>${kontoFelt(v, null)}</div><div class="felt3"><label>Moms</label>${momsFelt(bt.beloeb > 0 ? "salg_25" : "koeb_25")}</div></div>` : "";
  const knapper = besked
    ? `${bt ? `<button class="knap p" data-act="godkend">Bogfør uden bilag</button>` : `<button class="knap p" data-act="godkend">Markér som læst</button>`}<button class="knap" data-act="spoerg">Svar kunden</button>${bt ? `<button class="knap" data-act="laest">Markér som læst</button>` : ""}`
    : `${bt && !f.svar_bilag_id ? `<button class="knap p" data-act="godkend">Brug svaret og bogfør</button>` : `<button class="knap p" data-act="godkend">Luk spørgsmålet</button>`}<button class="knap" data-act="spoerg">Spørg igen</button>${bt ? `<button class="knap" data-act="luk-spm">Luk uden at bogføre</button>` : ""}`;
  const allerede = bogfoert ? `<div class="not">Bogført som postering ${bogfoert}.</div>` : "";
  return `<div class="hoejre-panel">${hoved}${allerede}${f.svar_bilag_id ? `<div class="lille-tekst">Kunden har sendt et bilag; det kommer under Bilag.</div>` : ""}${bogfoer}
    <div class="handl">${knapper}</div>${svarFelt(r)}</div>`;
}

function momsTjek(f) {
  const p = [["Alle banklinjer afstemt", !f.bankposter_uden_match, `${f.bankposter_uden_match} banklinjer uden match`],
             ["Ingen bilag uden kontering", !f.bilag_uden_kontering, `${f.bilag_uden_kontering} bilag venter`],
             ["Ingen ubogførte kladder", !f.ubogfoerte_kladder, `${f.ubogfoerte_kladder} kladder`]];
  // Kun det, der mangler, vises; er alt i orden, siges det én gang.
  const mangler = p.filter(([, ok]) => !ok);
  return mangler.length ? mangler.map(([, , n]) => `<div class="check"><span class="ik nej">!</span><div>${n}</div></div>`).join("") : `<p class="not">Alt er klar.</p>`;
}
function momsPanel(r) {
  const f = r.forslag || {};
  return `<div class="hoejre-panel"><div><h3>${E(r.virksomhed)}</h3><div class="sub">${E(r.tekst)} · frist ${dk(r.frist)}</div></div><div class="liste">${momsTjek(f)}</div>
    <div class="handl"><button class="knap p" data-act="godkend">Åbn momslukning</button></div></div>`;
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
    if (d.fejl) return `<div class="midt-fladen"><div class="tom">${E(d.fejl)}</div></div>`;
    if (!d.bilag) return `<div class="midt-fladen"><div class="tom">${d.faerdig ? "Bilaget findes ikke længere." : "Henter bilaget ..."}</div></div>`;
    if (!d.url) return `<div class="midt-fladen"><div class="tom">Filen kunne ikke hentes fra arkivet.</div></div>`;
    return /^image\//.test(d.bilag.mime) ? `<div class="midt-fladen fil"><img src="${E(d.url)}" alt="${E(d.bilag.filnavn)}"></div>`
      : `<div class="midt-fladen fil"><iframe src="${E(d.url)}" title="${E(d.bilag.filnavn)}"></iframe></div>`;
  }
  if (r.type === "bank") return `<div class="midt-fladen"><div class="kort midt-kort"><h2>Banklinje</h2><div class="stort tal">${r.beloeb > 0 ? "+" : ""}${kr(r.beloeb)} <small>kr.</small></div><div class="not">${E(r.tekst)} · ${dk(r.dato)} · ${E(r.virksomhed)}</div></div></div>`;
  if (r.type === "moms") {
    const a = r.forslag?.momsangivelse || {};
    return `<div class="midt-fladen"><div class="kort midt-kort"><h2>${E(r.tekst)}</h2><div class="stort tal">${kr(a.MomsAngivelseAfgiftTilsvarBeloeb || 0)} <small>momstilsvar</small></div><div class="not">Salgsmoms ${kr(a.MomsAngivelseSalgsMomsBeloeb || 0)} · købsmoms ${kr(a.MomsAngivelseKoebsMomsBeloeb || 0)}</div></div></div>`;
  }
  const f = r.forslag || {};
  const linjer = r.type === "besked" ? [["K", `Kunden skrev: ${r.tekst}`, dk(r.modtaget)]] : [["OA", `Du spurgte: ${f.spoergsmaal}`, dk(r.dato)], ["K", `Kunden svarede: ${f.svar || "(bilag)"}`, dk(r.modtaget)]];
  return `<div class="midt-fladen"><div class="kort midt-kort"><h2>Samtalen</h2><div class="liste">${linjer.map(([a, t, d2]) => `<div class="li"><span class="monogram">${a}</span><div class="t"><b>${E(t)}</b><small>${d2}</small></div></div>`).join("")}</div></div></div>`;
}

function indbakke() {
  const l = liste();
  if (S.sel >= l.length) S.sel = Math.max(0, l.length - 1);
  const r = l[S.sel];
  detalje(r);
  const faner = FANER.map(([k, t, typer]) => { const n = typer ? tael(typer) : 0; return `<button data-act="tab" data-t="${k}" aria-pressed="${S.tab === k}">${t}${n ? `<b>${n}</b>` : ""}</button>`; }).join("");
  const n = sikre().length;
  return `<div class="modeskift"><label class="soeg">${IC.soeg}<input id="soeg" placeholder="Søg kunde, tekst eller beløb" autocomplete="off" value="${E(S.soeg || "")}"></label><div class="filtre" role="group">${faner}</div>
      ${n ? `<div class="hoejre-side"><button class="knap lille" data-act="godkend-alle">Godkend alle sikre (${n})</button></div>` : ""}</div>
    <div class="ib ${S.travl ? "travl" : ""}"><div class="liste-sp">${l.map(postRaekke).join("") || '<div class="tom">Intet venter.</div>'}</div>${midt(r)}${panel(r)}</div>`;
}

// ------------------------------------------------------------------ kunder ----
function kundeTal(v) {
  const r = S.rows.filter((x) => x.virksomhed_id === v), n = (t) => r.filter((x) => t.includes(x.type)).length;
  const m = r.filter((x) => x.type === "moms").sort((a, b) => (a.frist < b.frist ? -1 : 1))[0];
  return { bilag: n(["bilag"]), bank: n(["bank"]), spm: n(["spoergsmaal", "besked"]), moms: m ? (m.forslag?.klar ? `Klar, frist ${F.datoKort(m.frist)}` : `Frist ${F.datoKort(m.frist)}`) : "", mk: m?.forslag?.klar ? "accent" : "graa" };
}
function kunder() {
  const tal = (n) => (n ? pille("accent", n) : "");
  return `<div class="kort tabeldel"><div class="tabel"><div class="r rkd h"><div>Kunde</div><div>CVR</div><div class="b">Bilag</div><div class="b">Bank</div><div class="b">Spørgsmål</div><div>Moms</div><div>Periode</div></div>
    ${S.firmaer.map((k) => { const t = kundeTal(k.id); return `<div class="r rkd" role="button" tabindex="0" data-act="kunde" data-v="${k.id}"><div class="tekst"><b>${E(k.navn)}</b></div><div class="mono">${E(k.cvr)}</div><div class="b">${tal(t.bilag)}</div><div class="b">${tal(t.bank)}</div><div class="b">${tal(t.spm)}</div><div>${t.moms ? pille(t.mk, E(t.moms)) : ""}</div><div class="not">${E(k.momsperiode)}</div></div>`; }).join("")}</div>
    <div class="tabelfod"><span>${S.firmaer.length} ${S.firmaer.length === 1 ? "kunde" : "kunder"}</span></div></div>
    ${(S.nhKlar || []).length ? `<div class="kort tabeldel mt-3"><div class="kort-hoved over-tabel"><h2>Nemhandel: klar til tilmelding</h2></div><div class="tabel">${S.nhKlar.map((x) => `<div class="r rnh"><div class="tekst">${E(x.navn)}</div><div class="mono">${E(x.cvr)}</div><div class="not">${E(x.grund === "accept" ? "Kunden har sagt ja" : "Varslet er udløbet")}</div><div class="b"><button class="knap lille" data-act="nh-reg" data-v="${x.virksomhed_id}" data-cvr="${E(x.cvr)}">Registrér</button></div></div>`).join("")}</div></div>` : ""}`;
}
async function hentKunde(v) {
  const [bk, pst, regler, bankst, vk, acc, kk, skift] = await Promise.all([
    sb.from("bankkonto").select("id, navn, konto").eq("virksomhed_id", v),
    sb.from("postering").select("id, nummer, dato, tekst, beslutter, regel_id, korrigerer, bogfoert_af, bilag:bilag_id (sha256), posteringslinje(konto, beloeb)").eq("virksomhed_id", v).order("nummer", { ascending: false }).limit(150),
    sb.from("konteringsregel").select("id, beskrivelse, tekst_moenster, konto, momskode, aktiv").eq("virksomhed_id", v).order("id"),
    rpc("bankforbindelse_status", { p_virksomhed: v }).catch(() => []),
    sb.from("virksomhed").select("pakke, aaben").eq("id", v).single(),
    sb.from("vilkaar_accept").select("tid, dokumenter").eq("virksomhed_id", v).order("tid", { ascending: false }).limit(1),
    sb.from("ejerforhold").select("ejere, tegningsret, kilde, tid").eq("virksomhed_id", v).maybeSingle(),
    sb.from("pakkeskift").select("ny_pakke, fra").eq("virksomhed_id", v).maybeSingle(),
  ]);
  const ids = [...new Set((pst.data || []).map((p) => p.bogfoert_af).filter(Boolean))];
  const navne = ids.length ? Object.fromEntries((await rpc("bruger_navne", { p_ids: ids }).catch(() => [])).map((x) => [x.id, x.mail])) : {};
  const idag = new Date().toISOString().slice(0, 10);
  const afst = await Promise.all((bk.data || []).map(async (b) => ({ ...b, a: await rpc("afstemning", { p_bankkonto: b.id, p_til: idag }) })));
  await konti(v);
  const korr = new Set((pst.data || []).filter((p) => p.korrigerer).map((p) => p.korrigerer));
  S.kunde = { v, afst, poster: (pst.data || []).map((p) => ({ ...p, tilbagefoert: korr.has(p.id), af: navne[p.bogfoert_af] || null })), regler: regler.data || [], bankst,
    konto: { ...(vk.data || {}), accept: (acc.data || [])[0] || null, kk: kk.data || null, skift: skift.data || null }, kontoplan: null };
}
// Konti med konteringsvejledning (BEK 97 bilag 2, pkt. 5 b-c); bogholderen retter vejledningen her, og det logges.
function kontiFane(K) {
  if (!K.kontoplan) {
    sb.from("konto").select("nummer, navn, vejledning").eq("virksomhed_id", K.v).eq("spaerret", false).order("nummer")
      .then(({ data }) => { K.kontoplan = data || []; render(); });
    return `<div class="tom">Henter konti ...</div>`;
  }
  // "Gem" vises foerst, naar vejledningen er aendret.
  return `<div class="kort tabeldel"><div class="tabel"><div class="r rkv h"><div>Konto</div><div>Navn</div><div>Konteringsvejledning</div><div></div></div>
    ${K.kontoplan.map((k) => `<div class="r rkv"><div class="mono tal">${E(k.nummer)}</div><div class="tekst">${E(k.navn)}</div><input class="inp" data-vejl="${E(k.nummer)}" value="${E(k.vejledning || "")}" placeholder="Hvad bogføres her?"><button class="knap lille skjul" data-act="gem-vejl" data-nr="${E(k.nummer)}">Gem</button></div>`).join("")}</div>
    <div class="tabelfod"><span>${K.kontoplan.length} konti</span></div></div>`;
}

function kunde() {
  const K = S.kunde, k = firma(K?.v);
  if (!K) return `<div class="tom">Henter ...</div>`;
  const t = kundeTal(K.v);
  const tabs = [["overblik", "Overblik"], ["konto", "Konto"], ["posteringer", "Posteringer"], ["konti", "Konti"], ["regler", "Regler"], ["stamdata", "Stamdata"]];
  const ko = K.konto, pnavn = (p) => (p === "selv" ? "Gør det selv med AI" : "Med bogholder");
  const ind = {
    overblik: `<div class="gitter g3">${K.afst.map((b) => `<div class="kort"><h2>Afstemning · ${E(b.navn)}</h2><div class="stort tal">${kr(b.a.difference)} <small>difference</small></div><div class="not">Bank ${kr(b.a.bank_saldo)} · bogført ${kr(b.a.bogfoert_saldo)}</div><div class="mt-1">${b.a.afstemt ? "" : pille("accent", `${b.a.uafstemte_banklinjer} ikke afstemt`)}${b.a.import_hul ? " " + pille("roed", "Hul i bankimporten") : ""}</div></div>`).join("") || `<div class="kort"><h2>Afstemning</h2><p class="not">Ingen bankkonto endnu.</p></div>`}
      <div class="kort"><h2>I indbakken</h2><div class="liste mt-1"><div class="li"><div class="t">Bilag</div>${t.bilag ? pille("accent", t.bilag) : "–"}</div><div class="li"><div class="t">Banklinjer</div>${t.bank ? pille("accent", t.bank) : "–"}</div><div class="li"><div class="t">Spørgsmål og beskeder</div>${t.spm ? pille("accent", t.spm) : "–"}</div></div></div>
      <div class="kort"><h2>Bank og moms</h2><div class="liste mt-1">${(K.bankst || []).map((b) => `<div class="li"><div class="t">${E(b.bank)}</div><span>${b.gyldig_til ? "samtykke til " + dk(b.gyldig_til) : E(b.status)}</span></div>`).join("") || `<div class="li"><div class="t">Bankforbindelse</div><span>Ikke koblet til</span></div>`}<div class="li"><div class="t">Moms</div>${t.moms ? pille(t.mk, E(t.moms)) : "Intet at indberette"}</div></div></div></div>`,
    posteringer: `<div class="kort tabeldel"><div class="tabel"><div class="r rpo h"><div>Nr.</div><div>Dato</div><div>Tekst</div><div>Konto</div><div class="b">Beløb</div><div>Bogført af</div><div></div></div>
      ${K.poster.map((p) => { const l = (p.posteringslinje || []).filter((x) => x.beloeb > 0)[0] || p.posteringslinje?.[0] || {}; return `<div class="r rpo"><div class="mono tal">${p.nummer}</div><div class="tal">${dk(p.dato)}</div><div class="tekst">${E(p.tekst)}${p.korrigerer ? " " + pille("graa", "Korrektion") : ""}${p.tilbagefoert ? " " + pille("graa", "Tilbageført") : ""}</div><div class="tekst">${E(l.konto || "")} ${E(kontonavn(K.v, l.konto))}</div><div class="b">${l.beloeb != null ? kr(l.beloeb) : ""}</div><div class="tekst not" title="${E(p.af || "")}">${p.beslutter === "regel" ? "Regel" : p.beslutter === "menneske" ? E(p.af || "Menneske") : p.beslutter === "import" ? "Import" : "AI"}</div><div class="b raekke slut">${p.bilag ? `<button class="knap lille" data-act="post-bilag" data-sha="${p.bilag.sha256}">Bilag</button>` : ""}${p.korrigerer || p.tilbagefoert ? "" : `<button class="knap lille" data-act="tilbagefoer" data-id="${p.id}">Tilbagefør</button>`}</div></div>${S.tilbage === p.id ? `<div class="r r-form"><input class="inp" id="f-grund" placeholder="Begrundelse (gemmes i loggen)" autocomplete="off"><button class="knap lille p" data-act="tilbagefoer-ok" data-id="${p.id}" data-nr="${p.nummer}">Tilbagefør</button><button class="knap lille" data-act="tilbagefoer-fortryd">Fortryd</button></div>` : ""}`; }).join("") || '<div class="tom">Ingen posteringer endnu.</div>'}</div>
      <div class="tabelfod"><span>De seneste ${K.poster.length} posteringer</span></div></div>`,
    regler: regelTabel(K.regler.map((r) => ({ ...r, virksomhed_id: K.v })), false),
    konto: (() => {
      // Er kontoen aaben, er der stille; ellers staar det, der mangler, og én primaer knap.
      const klar = ko.accept && ko.kk;
      const mangler = (ok, tekst) => (ok ? tekst : ko.aaben ? "Ikke registreret" : pille("accent", "Mangler"));
      return `<div class="gitter g2"><div class="kort"><h2>Konto og pakke</h2><div class="liste mt-1">
        <div class="li"><div class="t">Status</div>${ko.aaben ? "Åben" : pille("accent", "Venter på åbning")}</div>
        <div class="li"><div class="t">Pakke</div><span>${pnavn(ko.pakke)}</span></div>
        <div class="li"><div class="t">Moms afregnes</div><select class="inp auto" id="ko-moms">${[["halvaar", "Halvårligt"], ["kvartal", "Kvartalsvis"], ["maaned", "Månedligt"]].map(([v2, t2]) => `<option value="${v2}" ${k.momsperiode === v2 ? "selected" : ""}>${t2}</option>`).join("")}</select><button class="knap lille" data-act="gem-momsperiode">Gem</button></div>
        ${ko.skift ? `<div class="li"><div class="t">Bestilt skift</div><span>${pnavn(ko.skift.ny_pakke)} fra ${dk(ko.skift.fra)}</span></div>` : ""}
        <div class="li"><div class="t">Vilkår accepteret</div>${mangler(ko.accept, ko.accept ? `${dk(String(ko.accept.tid).slice(0, 10))} (handelsbet. ${E(ko.accept.dokumenter.handelsbetingelser)}, DPA ${E(ko.accept.dokumenter.databehandleraftale)})` : "")}</div>
        <div class="li"><div class="t">Ejere og tegningsret</div>${mangler(ko.kk, ko.kk ? `Registreret ${dk(String(ko.kk.tid).slice(0, 10))}` : "")}</div></div>
        <div class="raekke mt-3">${ko.aaben ? "" : `<button class="knap ${klar ? "p" : ""}" data-act="aabn-konto" ${klar ? "" : "disabled"}>Åbn kontoen</button>`}<button class="knap" data-act="saet-pakke" data-p="${ko.pakke === "selv" ? "fuld" : "selv"}">Skift til ${pnavn(ko.pakke === "selv" ? "fuld" : "selv")} nu</button></div>
        ${ko.aaben ? "" : `<p class="lille-tekst mt-2">Kontoen åbnes, når vilkår og ejere er på plads.</p>`}</div>
      <div class="kort"><h2>Ejere og tegningsret</h2>
        <div class="felt mt-2"><label for="ef-ejere">Ejere</label><input class="inp" id="ef-ejere" value="${E(ko.kk?.ejere || "")}" placeholder="Fx Mette Kornet (100 %)"></div>
        <div class="felt mt-2"><label for="ef-teg">Tegningsret</label><input class="inp" id="ef-teg" value="${E(ko.kk?.tegningsret || "")}" placeholder="Fx direktøren alene"></div>
        <div class="felt mt-2"><label for="ef-kilde">Hvordan er det set</label><input class="inp" id="ef-kilde" value="${E(ko.kk?.kilde || "")}" placeholder="Fx CVR-registret og MitID"></div>
        <div class="raekke mellem mt-3"><span class="lille-tekst">Gemmes til 12 måneder efter ophør</span><button class="knap ${ko.kk ? "" : "p"}" data-act="gem-kk">${ko.kk ? "Opdatér" : "Registrér"}</button></div></div></div>`;
    })(),
    konti: kontiFane(K),
    stamdata: `<div class="kort"><div class="gitter g2">${[["Navn", k.navn], ["CVR", k.cvr], ["Adresse", [k.adresse_vej, k.adresse_husnr].filter(Boolean).join(" ") + ", " + [k.adresse_postnr, k.adresse_by].filter(Boolean).join(" ")], ["Mail", k.email], ["Momsperiode", k.momsperiode], ["Bilagsadresse", k.indbakke ? k.indbakke + "@bilag.tallo.dk" : "Ikke sat op"], ["Kunde siden", dk(k.oprettet)], ["Bankkonti", K.afst.map((b) => b.navn).join(", ") || "Ingen"]].map(([l, v]) => `<div class="felt"><label>${l}</label><div class="vaerdi">${E(v || "–")}</div></div>`).join("")}</div></div>`,
  };
  return `<div class="kunde-top"><a href="#kunder" class="knap lille">‹ Kunder</a><div class="faner" role="tablist">${tabs.map(([tb, n]) => `<button role="tab" aria-selected="${S.kundeTab === tb}" data-act="ktab" data-t="${tb}">${n}</button>`).join("")}</div></div>${ind[S.kundeTab]}`;
}

// ----------------------------------------------------------- efterkontrol ----
// Alt, der er bogfoert uden et menneske (af AI eller faste regler), i én koe. Stikproeverne ses én ad gangen; resten
// kvitteres samlet med den ene primaere knap.
async function hentEk() {
  const [ai, regl] = await Promise.all([rpc("bogfoert_af_ai"), rpc("bogfoert_af_regler")]);
  await Promise.all([...new Set([...ai, ...regl].map((x) => x.virksomhed_id))].map(konti));
  S.ek = { ai, regler: regl };
}
function efterkontrol() {
  const K = S.ek;
  if (!K) return `<div class="tom">Henter ...</div>`;
  const stik = K.ai.filter((x) => x.stikproeve), resten = K.ai.filter((x) => !x.stikproeve), n = resten.length + K.regler.length;
  const ai = (x) => `<div class="r rai"><div class="tekst"><b>${E(x.tekst)}</b><small>${E(x.virksomhed)} · ${dk(x.dato)}</small></div>
    <div class="tekst">${E(x.konto)} ${E(kontonavn(x.virksomhed_id, x.konto))}<small>${E(x.begrundelse)}</small></div><div class="b mono">${kr(x.beloeb)}</div><div>${sikH(+x.sikkerhed)}</div>
    <div class="b raekke slut"><button class="knap lille" data-act="ai-ok" data-id="${x.vurdering_id}">OK</button><button class="knap lille" data-act="ai-tilbage" data-id="${x.postering_id}">Tilbagefør</button></div></div>
    ${S.aiTilbage === x.postering_id ? `<div class="r r-form"><input class="inp" id="f-grund" placeholder="Hvad er forkert? (gemmes i loggen)" autocomplete="off"><button class="knap lille p" data-act="ai-tilbage-ok" data-id="${x.postering_id}">Tilbagefør</button><button class="knap lille" data-act="tilbagefoer-fortryd">Fortryd</button></div>` : ""}`;
  const regel = (p) => `<div class="r rai"><div class="tekst"><b>${E(p.tekst)}</b><small>${E(p.virksomhed)} · ${dk(p.dato)}</small></div><div class="tekst not">Regel ${E(p.regel_id)}</div><div class="b mono">${kr(p.beloeb)}</div><div></div><div></div></div>`;
  const del = (titel, raekker) => (raekker ? `<div class="kort tabeldel mt-3"><div class="kort-hoved over-tabel"><h2>${titel}</h2></div><div class="tabel">${raekker}</div></div>` : "");
  return `<div class="raekke mellem"><span class="not">${stik.length ? `${stik.length} stikprøve${stik.length > 1 ? "r" : ""} først · ` : ""}${n} at kvittere</span>${n ? `<button class="knap p" data-act="kvitter-resten">Kvittér alle (${n})</button>` : ""}</div>
    ${del("Stikprøver", stik.map(ai).join(""))}${del("Bogført af AI", resten.map(ai).join(""))}${del("Bogført af regler", K.regler.slice(0, 30).map(regel).join("") + (K.regler.length > 30 ? `<div class="tabelfod"><span>og ${K.regler.length - 30} mere; de kvitteres også</span></div>` : ""))}
    ${stik.length + n ? "" : '<div class="kort mt-3"><div class="tom">Intet at se igennem.</div></div>'}`;
}

// ------------------------------------------------------------------ regler ----
function regelTabel(regler, medKunde = true) {
  return `<div class="kort tabeldel"><div class="tabel"><div class="r rre ${medKunde ? "" : "uden-kunde"} h"><div>Mønster</div><div>Konto</div>${medKunde ? "<div>Kunde</div>" : ""}<div>Moms</div><div></div></div>
    ${regler.map((r) => `<div class="r rre ${medKunde ? "" : "uden-kunde"}" title="${E(r.id)}"><div class="tekst mono">${E(r.tekst_moenster)}</div><div class="tekst">${E(r.konto)} ${E(kontonavn(r.virksomhed_id, r.konto))}</div>${medKunde ? `<div class="tekst">${E(firma(r.virksomhed_id).navn)}</div>` : ""}<div>${E(momsNavn(r.momskode))}</div><div class="b">${r.aktiv ? `<button class="knap lille" data-act="regel-fra" data-v="${r.virksomhed_id}" data-id="${E(r.id)}">Slå fra</button>` : '<span class="stille">Slået fra</span>'}</div></div>`).join("") || '<div class="tom">Ingen regler.</div>'}</div></div>`;
}
async function hentRegler() {
  const [regler, forslag] = await Promise.all([
    sb.from("konteringsregel").select("virksomhed_id, id, beskrivelse, tekst_moenster, konto, momskode, aktiv").order("virksomhed_id").order("id"),
    rpc("regelforslag"),
  ]);
  await Promise.all([...new Set((regler.data || []).map((r) => r.virksomhed_id))].map(konti));
  S.regler = { liste: regler.data || [], forslag };
}
function regler() {
  const R = S.regler;
  if (!R) return `<div class="tom">Henter ...</div>`;
  return `${R.forslag.length ? `<div class="kort mb-3"><div class="kort-hoved"><h2>Forslag til nye regler</h2><span class="not">Efter 3 ens godkendelser</span></div>
      ${R.forslag.map((f, i) => `<div class="li raekke"><div class="t fyld"><b>${E(f.leverandoer)} → ${E(f.konto)} ${E(f.kontonavn)}</b><small>${E(f.virksomhed)} · ${f.antal} ens · ${E(f.momskode || "ingen moms")}</small></div><button class="knap lille" data-act="opret-regel" data-i="${i}">Opret</button></div>`).join("")}</div>` : ""}
    ${regelTabel(R.liste)}`;
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
  if (!ms.length) return `<div class="kort"><div class="tom">Ingen perioder venter.</div></div>`;
  const r = ms.find((x) => x.key === S.momsKey) || ms[0], f = r.forslag || {}, a = f.momsangivelse || {};
  hentMoms(r);
  const fa = S.momsForrige?.key === r.key ? S.momsForrige.a || {} : {};
  return `<div class="gitter g12"><div class="kort"><div class="kort-hoved"><h2>Perioder, der venter</h2></div><div class="liste">${ms.map((q) => `<div class="li vaelgbar ${q === r ? "valgt" : ""}" role="button" tabindex="0" data-act="momsk" data-key="${q.key}"><div class="t"><b>${E(q.virksomhed)}</b><small>${E(q.tekst)} · frist ${dk(q.frist)}</small></div>${q.forslag?.klar ? pille("accent", "Klar") : ""}</div>`).join("")}</div></div>
    <div class="stak"><div class="kort"><div class="kort-hoved"><h2>${E(r.virksomhed)} · ${E(r.tekst)}</h2></div>${momsTjek(f)}</div>
      <div class="kort tabeldel"><div class="kort-hoved over-tabel"><h2>Felterne</h2></div><table class="vtabel mt-1"><thead><tr><th>Felt</th><th>Denne periode</th><th>Forrige</th></tr></thead><tbody>${MOMSFELT.filter(([k]) => a[k] || fa[k] || /SalgsMoms|KoebsMoms|Tilsvar/.test(k)).map(([k, n]) => `<tr ${/Tilsvar/.test(k) ? 'class="sum"' : ""}><td>${n}</td><td>${kr(a[k] || 0)}</td><td class="svag">${fa[k] != null ? kr(fa[k]) : "-"}</td></tr>`).join("")}</tbody></table></div>
      <div class="kort"><div class="handl"><button class="knap p" data-act="udkast" ${f.klar ? "" : "disabled"}>Opret udkast hos Skattestyrelsen</button></div>
        <div class="felt mt-3 smal"><label for="f-kvit">Kvitteringsnummer fra TastSelv</label><div class="raekke"><input class="inp fyld" id="f-kvit" autocomplete="off"><button class="knap" data-act="registrer" ${f.klar ? "" : "disabled"}>Registrér</button></div></div>
        <p class="lille-tekst mt-2">Kun et udkast. Du godkender selv i TastSelv.</p></div></div></div>`;
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
  R.udtraek = (await sb.from("udtraek_bestilling").select("id, type, fra, til, status, sti, fejl, bestilt_tid").eq("virksomhed_id", v)
    .order("bestilt_tid", { ascending: false }).limit(5)).data || [];
  R.hentet = v + R.type + R.periode;
  render();
  // En bestilling, der venter, bliver klar af sig selv (driftsserveren koerer hvert minut)
  if (R.udtraek.some((u) => u.status === "venter") && !R.poll) R.poll = setTimeout(() => { R.poll = null; R.hentet = null; if (S.route === "rapporter") render(); }, 8000);
}
const UDTRAEK = { saft: "SAF-T", udlevering: "Hele bogføringen" };
function udtraekListe(l) {
  if (!l?.length) return "";
  return `<div class="lille-tekst">Bestilte udtræk</div>${l.map((u) => `<div class="raekke mellem udtraek-r"><span>${UDTRAEK[u.type]}${u.fra ? ` ${F.dato(u.fra)}-${F.dato(u.til)}` : ""}</span>${u.status === "klar" ? `<button class="knap lille" data-act="hent-udtraek" data-sti="${E(u.sti)}" data-navn="${u.type === "saft" ? `saft-${firma(S.rap.v).cvr}-${u.fra}-${u.til}.xml` : `bogfoering-${firma(S.rap.v).cvr}.zip`}">${IC.hent} Hent</button>` : u.status === "fejl" ? `<span class="pille roed" title="${E(u.fejl || "")}">Fejl</span>` : `<span class="stille">Laves</span>`}</div>`).join("")}`;
}
function rapporter() {
  const R = S.rap, P = perioder();
  if (R.hentet !== (R.v || S.firmaer[0]?.id) + R.type + R.periode) hentRapport().catch((e) => F.toast(e.message));
  const linjer = R.type === "saldo" ? R.data || [] : R.data?.linjer || [];
  const sum = linjer.reduce((s, l) => s + +l.saldo, 0);
  const valg = (id, rap, liste, nu) => `<select class="inp auto" id="${id}" data-rap="${rap}" aria-label="${rap}">${liste.map(([k, t]) => `<option value="${k}" ${k === nu ? "selected" : ""}>${E(t)}</option>`).join("")}</select>`;
  return `<div class="raekke mellem mb-3"><div class="raekke">${valg("r-v", "v", S.firmaer.map((k) => [k.id, k.navn]), R.v)}${valg("r-t", "type", [["resultat", "Resultatopgørelse"], ["balance", "Balance"], ["saldo", "Saldobalance"]], R.type)}${valg("r-p", "periode", Object.entries(P).map(([k, [t]]) => [k, t]), R.periode)}</div>
      <div class="raekke"><button class="knap lille" data-act="csv">${IC.hent} Regnskab Basis</button><button class="knap lille" data-act="saft">${IC.hent} SAF-T</button><button class="knap lille" data-act="print">${IC.hent} PDF</button></div></div>
    ${R.udtraek?.length ? `<div class="kort mb-3">${udtraekListe(R.udtraek)}</div>` : ""}
    <div class="kort tabeldel">
      ${R.data ? `<table class="vtabel mt-1"><thead><tr><th>Konto</th><th class="venstre">Navn</th><th>Saldo</th></tr></thead><tbody>${linjer.map((l) => `<tr><td>${E(l.konto)}</td><td class="venstre">${E(l.navn)}</td><td>${kr(l.saldo)}</td></tr>`).join("")}
        <tr class="sum"><td></td><td class="venstre">${R.type === "resultat" ? "Resultat (negativ er overskud)" : R.type === "balance" ? (R.data.balancerer ? "Balancerer" : '<span class="roed-tekst">Balancerer ikke</span>') : "I alt"}</td><td>${kr(R.type === "balance" ? R.data.resultat_til_dato ?? sum : sum)}</td></tr></tbody></table>` : `<div class="tom">Henter ...</div>`}</div>`;
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
  // Er kaeden hel, siges det én gang og stille; er den brudt, er det roedt.
  return `<div class="raekke mellem mb-3"><span class="${L.hel ? "not" : "pille roed"}">${L.hel ? "Loggen er hel." : "Loggen er ændret. Stop og undersøg, før der bogføres mere."}</span>
      <select class="inp auto" data-log="v">${S.firmaer.map((k) => `<option value="${k.id}" ${k.id === L.v ? "selected" : ""}>${E(k.navn)}</option>`).join("")}</select></div>
    <div class="kort tabeldel"><div class="tabel"><div class="r rlo h"><div>Tid</div><div>Hvem</div><div>Hvad</div><div>Detaljer</div><div>Nr.</div></div>${L.rows.map((h) => `<div class="r rlo"><div class="tal nowrap">${F.datoKort(String(h.tidspunkt).slice(0, 10))} ${new Date(h.tidspunkt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}</div><div title="${E(h.regel_id || "")}">${hvem(h)}</div><div>${E(HANDLING[h.handling] || h.handling)}</div><div class="tekst not">${E(detaljer(h))}</div><div class="mono lille-tekst">${h.id}</div></div>`).join("") || '<div class="tom">Ingen hændelser.</div>'}</div></div>`;
}

// ------------------------------------------------------------ indstillinger ----
function indstillinger() {
  const fa = S.faktorer || [], tab = S.indTab || "konto";
  const faner = `<div class="faner mb-3" role="tablist">${[["konto", "Konto"], ["brug", "Brug af appen"]].map(([k, t]) => `<button role="tab" aria-selected="${tab === k}" data-act="indtab" data-t="${k}">${t}</button>`).join("")}</div>`;
  if (tab === "brug") return faner + brug();
  return `${faner}<div class="gitter g2"><div class="kort"><div class="kort-hoved"><h2>Login</h2></div><div class="liste"><div class="li"><div class="t"><b>${E(BRUGER?.mail)}</b><small>2-trins kræves altid. Login udløber efter 12 timer.</small></div></div>
      ${fa.map((f) => `<div class="li"><div class="t"><b>${E(f.friendly_name || "Godkenderapp")}</b><small>Oprettet ${dk(f.created_at)}</small></div></div>`).join("")}</div>
      <div class="handl mt-2"><button class="knap" data-act="logud">Log ud</button></div></div>
    <div class="kort"><div class="kort-hoved"><h2>Tastaturgenveje</h2><span class="not">Tryk ? for at komme hertil</span></div><div class="genveje-liste"><span><kbd>J</kbd> <kbd>K</kbd></span><span>Op og ned i indbakken</span><span><kbd>↵</kbd></span><span>Godkend</span><span><kbd>E</kbd></span><span>Ret konto</span><span><kbd>S</kbd></span><span>Spørg kunden</span><span><kbd>A</kbd></span><span>Afvis</span><span><kbd>/</kbd></span><span>Søg</span><span><kbd>G</kbd> <kbd>K</kbd></span><span>Gå til kunder</span><span><kbd>[</kbd></span><span>Fold menuen sammen og ud</span></div></div></div>`;
}
// Brug af appen (maaling fra 20. okt 2026): hvilke skaerme og knapper kunderne bruger, og hvilke de aldrig bruger,
// pr. pakke. Kun samlede tal (brug_oversigt); ingen enkelt kunde kan ses.
const APP_SKAERME = ["overblik", "godkend", "transaktioner", "salg", "moms", "rapporter", "indstillinger"];
function brug() {
  if (!S.brug || S.brug.dage !== (S.brugDage || 30)) {
    const dage = S.brugDage || 30;
    rpc("brug_oversigt", { p_dage: dage }).then((r) => { S.brug = { dage, r }; render(); }).catch((e) => F.toast(e.message));
    return `<div class="tom">Henter ...</div>`;
  }
  const r = S.brug.r, pakker = [["selv", "Gør det selv"], ["fuld", "Med bogholder"]];
  const kort = pakker.map(([p, navn]) => {
    const rk = r.filter((x) => x.pakke === p), skaerm = rk.filter((x) => !x.handling), handl = rk.filter((x) => x.handling).slice(0, 15);
    const sess = Math.max(0, ...skaerm.map((x) => +x.sessioner)), aldrig = APP_SKAERME.filter((n) => (p === "selv" || n !== "godkend") && !skaerm.some((x) => x.skaerm === n));
    return `<div class="kort"><div class="kort-hoved"><h2>${navn}</h2><span class="not">${rk.length ? `op til ${sess} besøg` : "ingen data endnu"}</span></div>
      <div class="liste">${skaerm.map((x) => `<div class="li"><div class="t"><b>${E(x.skaerm)}</b><small>${x.sessioner} besøg · ${x.virksomheder} virksomheder</small></div><span class="tal">${x.antal}</span></div>`).join("") || '<p class="not">Ingen skærmvisninger i perioden.</p>'}</div>
      ${handl.length ? `<div class="lille-tekst mt-3">Mest brugte knapper</div><div class="liste">${handl.map((x) => `<div class="li"><div class="t">${E(x.skaerm)} › ${E(x.handling)}</div><span class="tal">${x.antal}</span></div>`).join("")}</div>` : ""}
      ${rk.length && aldrig.length ? `<p class="not mt-3">Aldrig åbnet: ${aldrig.map(E).join(", ")}</p>` : ""}</div>`;
  }).join("");
  return `<div class="raekke mb-3"><select class="inp auto" data-brug="dage" aria-label="Periode">${[7, 30, 90, 365].map((d) => `<option value="${d}" ${(S.brugDage || 30) === d ? "selected" : ""}>Seneste ${d} dage</option>`).join("")}</select>
    <span class="lille-tekst">Kun samlede tal; slettes efter 13 måneder.</span></div><div class="gitter g2">${kort}</div>`;
}
const VIEWS = { efterkontrol, indbakke, kunder, kunde, regler, moms, rapporter, log, indstillinger };

// ------------------------------------------------------------ skal og login ----
function skal(indhold) {
  const n = S.rows.length;
  const ini = (BRUGER?.mail || "?").slice(0, 2).toUpperCase();
  return `<div class="app ${F.sidebar.smal(SIDE) ? "smal" : ""}"><aside class="side"><div class="side-top"><div class="brand side-tekst">tallo <small>bord</small></div>${F.sidebar.knap(SIDE)}</div><nav aria-label="Hovedmenu">${NAV.map(([r, t, ic]) => `<a href="#${r}" title="${t}" ${S.route === r || (r === "kunder" && S.route === "kunde") ? 'aria-current="page"' : ""}>${IC[ic]}<span>${t}</span>${r === "indbakke" && n ? `<span class="tael">${n}</span>` : ""}</a>`).join("")}</nav>
    <div class="bruger-kort" title="${E(BRUGER?.mail)}"><span class="monogram">${E(ini)}</span><div class="side-tekst"><b>${E(BRUGER?.mail)}</b><small>Bogholder</small></div></div></aside>
    <main class="main"><header class="top bord"><h1>${S.route === "kunde" ? E(firma(S.kunde?.v).navn || "Kunde") : TITEL[S.route]}</h1><div class="hoejre-side">${S.log?.hel === false ? pille("roed", "Loggen er ændret") : ""}</div></header><div class="sider bord" id="sider">${indhold}</div></main></div>`;
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
  side(`<h1>Log ind</h1><p class="not">Kun for bogholdere.</p>
    <form id="login"><div class="felt"><label for="mail">Mail</label><input class="inp" id="mail" type="email" autocomplete="username" required></div>
    <div class="felt mt-2"><label for="kode">Adgangskode</label><input class="inp" id="kode" type="password" autocomplete="current-password" required></div>
    <button class="knap p fuld-bredde mt-3" type="submit">Fortsæt</button></form>
    ${besked ? `<p class="not mt-3" role="status">${E(besked)}</p>` : ""}${LOKALT && !DEMO ? `<p class="lille-tekst mt-3">Lokalt: othman@tallo.dk / demo-kode-1234</p>` : ""}`);
  document.getElementById("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: vaerdi("mail"), password: document.getElementById("kode").value });
    if (!error) localStorage.setItem("tallo-bord-login", String(Date.now()));
    return error ? loginSide("Forkert mail eller kode.") : start();
  });
}
function kodeForm(titel, tekst, ekstra, onKode) {
  side(`<h1>${titel}</h1>${tekst ? `<p class="not">${tekst}</p>` : ""}${ekstra}<form id="mfa"><div class="felt"><label for="kode6">Kode fra appen</label><input class="inp kode" id="kode6" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></div>
    <button class="knap p fuld-bredde mt-3" type="submit">Bekræft</button></form><p class="not mt-2" role="status" id="mfa-status"></p>
    <button class="knap lille mt-1" data-act="logud">Log ud</button>`);
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
    kodeForm("Bekræft med din app", "", "", async (code) => {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: totp.id, code });
      return error ? "Koden passer ikke. Prøv den næste." : null;
    });
    return false;
  }
  for (const x of f?.all || []) if (x.status !== "verified") await sb.auth.mfa.unenroll({ factorId: x.id });
  const { data: ny, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Tallo bord " + new Date().toISOString().slice(0, 16) });
  if (error) { side(`<h1>2-trins kunne ikke sættes op</h1><p class="not">${E(error.message)}</p><button class="knap" data-act="logud">Log ud</button>`); return false; }
  kodeForm("Sæt 2-trins op", "Scan koden med en godkenderapp (fx Google Authenticator eller 1Password), og skriv de seks cifre.",
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
  // Bogholderen logges ud efter 12 timer (flow_arbejdsbord.md); databasen afviser det ogsaa (er_bogholder).
  const login = +localStorage.getItem("tallo-bord-login") || 0;
  if (!login) localStorage.setItem("tallo-bord-login", String(Date.now()));
  else if (Date.now() - login > 12 * 3600e3) { localStorage.removeItem("tallo-bord-login"); await sb.auth.signOut(); return loginSide(); }
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
const nu = () => liste()[S.sel];
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
  if (a === "side-smal") return F.sidebar.skift(SIDE);
  if (a === "vaelg") { S.sel = +el.dataset.i; S.svar = null; return render(); }
  if (a === "tab") { S.tab = el.dataset.t; S.sel = 0; S.svar = null; return render(); }
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
  if (a === "godkend-alle") {
    const liste_ = sikre();
    if (!confirm(`Bogfør ${liste_.length} sikre bilag (100 %, med banklinje og uden advarsler)?`)) return;
    return travlt(async () => {
      let ok = 0; const fejl = [];
      for (const y of liste_) {
        try { await rpc("bogfoer_bilag", { p_bilag: y.id, p_konto: y.forslag.konto, p_momskode: y.forslag.momskode, p_banktransaktion: y.forslag.banktransaktion_id }); ok++; }
        catch (err) { fejl.push(`${y.tekst}: ${err.message}`); }
      }
      await efter(`${ok} bilag bogført${fejl.length ? `. ${fejl.length} sprunget over: ${fejl[0]}` : ""}`);
    });
  }
  if (a === "gem-momsperiode") return travlt(async () => {
    const { error } = await sb.from("virksomhed").update({ momsperiode: document.getElementById("ko-moms").value }).eq("id", S.kunde.v);
    if (error) throw new Fejl(error.message);
    await hent(); await hentKunde(S.kunde.v); await efter("Momsperioden er gemt");
  });
  if (a === "indtab") { S.indTab = el.dataset.t; return render(); }
  if (a === "aabn-konto") return travlt(async () => { await rpc("aabn_konto", { p_virksomhed: S.kunde.v }); await hentKunde(S.kunde.v); await efter("Kontoen er åbnet"); });
  if (a === "saet-pakke") {
    if (!confirm(`Skift pakken med det samme? Kunden betaler den nye pris fra i dag.`)) return;
    return travlt(async () => { await rpc("saet_pakke", { p_virksomhed: S.kunde.v, p_pakke: el.dataset.p }); await hentKunde(S.kunde.v); await efter("Pakken er skiftet"); });
  }
  if (a === "gem-kk") return travlt(async () => {
    await rpc("registrer_ejerforhold", { p_virksomhed: S.kunde.v, p_ejere: document.getElementById("ef-ejere").value, p_tegningsret: document.getElementById("ef-teg").value, p_kilde: document.getElementById("ef-kilde").value });
    await hentKunde(S.kunde.v); await efter("Ejere og tegningsret er registreret");
  });
  if (a === "gem-vejl") return travlt(async () => {
    const nr = el.dataset.nr, tekst = document.querySelector(`[data-vejl="${nr}"]`).value.trim();
    await rpc("saet_kontovejledning", { p_virksomhed: S.kunde.v, p_konto: nr, p_vejledning: tekst || null });
    const k = S.kunde.kontoplan.find((x) => x.nummer === nr); if (k) k.vejledning = tekst; el.classList.add("skjul"); F.toast(`Vejledningen til konto ${nr} er gemt`);
  });
  if (a === "post-bilag") return travlt(async () => {
    const { data } = await sb.storage.from("bilag").createSignedUrl(`${S.kunde.v}/${el.dataset.sha}`, 600);
    if (!data?.signedUrl) throw new Fejl("Bilaget kunne ikke hentes fra arkivet");
    window.open(data.signedUrl, "_blank", "noopener");
  });
  if (a === "nh-reg") {
    const ep = prompt(`Tilmeldt hos adgangsudbyderen? Skriv endpoint-id (fx 0184:DK${el.dataset.cvr}). Lad feltet stå tomt og skriv en fejl i stedet ved at starte med "fejl:".`, `0184:DK${el.dataset.cvr}`);
    if (ep == null) return;
    const fejlTekst = /^fejl:/i.test(ep.trim()) ? ep.trim().slice(5).trim() : null;
    return travlt(async () => {
      await rpc("nemhandel_registreret", { p_virksomhed: el.dataset.v, p_endpoint: fejlTekst ? null : ep.trim(), p_fejl: fejlTekst });
      S.nhKlar = await rpc("nemhandel_klar").catch(() => []); render(); F.toast(fejlTekst ? "Fejlen er registreret" : "Tilmeldingen er registreret");
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
  if (a === "ai-ok") return travlt(async () => { await rpc("marker_ai_gennemgaaet", { p_vurderinger: [el.dataset.id] }); await hentEk(); F.toast("Kvitteret"); });
  if (a === "kvitter-resten") {
    const ids = S.ek.ai.filter((x) => !x.stikproeve).map((x) => x.vurdering_id), poster = S.ek.regler.map((p) => p.postering_id);
    return travlt(async () => {
      const n1 = ids.length ? await rpc("marker_ai_gennemgaaet", { p_vurderinger: ids }) : 0;
      const n2 = poster.length ? await rpc("marker_gennemgaaet", { p_posteringer: poster }) : 0;
      await hentEk(); F.toast(`${n1 + n2} kvitteret`);
    });
  }
  if (a === "ai-tilbage") { S.aiTilbage = el.dataset.id; render(); return document.getElementById("f-grund")?.focus(); }
  if (a === "ai-tilbage-ok") {
    const grund = vaerdi("f-grund");
    if (!grund) return F.toast("Skriv hvorfor. Det gemmes i loggen.");
    return travlt(async () => { await rpc("tilbagefoer", { p_postering: el.dataset.id, p_begrundelse: "AI-fejl: " + grund }); S.aiTilbage = null; await hentEk(); await efter("Tilbageført. Posten ligger i indbakken igen."); });
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
  if (a === "saft") return travlt(async () => {
    const [, fra, til] = perioder()[S.rap.periode];
    await rpc("bestil_udtraek", { p_virksomhed: S.rap.v, p_type: "saft", p_fra: fra, p_til: til });
    S.rap.hentet = null; render(); F.toast("SAF-T-filen laves og står her om et øjeblik.");
  });
  if (a === "hent-udtraek") {
    const { data } = await sb.storage.from("udtraek").createSignedUrl(el.dataset.sti, 300, { download: el.dataset.navn || true });
    if (data?.signedUrl) location.assign(data.signedUrl); else F.toast("Filen kunne ikke hentes. Prøv igen.");
    return;
  }
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
  if (el.dataset.brug) { S.brugDage = +el.value; S.brug = null; return render(); }
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
  if (e.target.dataset.vejl != null) e.target.nextElementSibling?.classList.remove("skjul");
  if (e.target.id === "soeg") { S.soeg = e.target.value; S.sel = 0; render(); }
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
  if (e.key === "/") { e.preventDefault(); if (S.route !== "indbakke") location.hash = "indbakke"; setTimeout(() => document.getElementById("soeg")?.focus(), 0); return; }
  if (e.key === "[") { e.preventDefault(); F.sidebar.skift(SIDE); return; }
  if (e.key === "?") { S.indTab = "konto"; location.hash = "indstillinger"; return; }
  if (S.route !== "indbakke") return;
  const l = liste();
  if (m === "j" || e.key === "ArrowDown") { S.sel = Math.min(S.sel + 1, l.length - 1); S.svar = null; render(); }
  else if (m === "k" || e.key === "ArrowUp") { S.sel = Math.max(S.sel - 1, 0); S.svar = null; render(); }
  else if (e.key === "Enter") { e.preventDefault(); document.querySelector('[data-act="godkend"]')?.click(); }
  else if (m === "e") { e.preventDefault(); document.querySelector('[data-act="ret"]')?.click(); }
  else if (m === "s") { e.preventDefault(); document.querySelector('[data-act="spoerg"]')?.click(); }
  else if (m === "a") { e.preventDefault(); document.querySelector('[data-act="afvis"]')?.click(); }
});
async function rute() {
  let r = location.hash.slice(1) || "indbakke";
  if (r === "ai") r = "efterkontrol";                                      // gamle adresser (22. okt 2026)
  if (r === "brug") { S.indTab = "brug"; r = "indstillinger"; }
  S.route = VIEWS[r] ? r : "indbakke";
  if (S.route === "kunde" && !S.kunde) S.route = "kunder";
  render();
  window.scrollTo(0, 0);
  try {
    if (S.route === "regler") { await hentRegler(); render(); }
    if (S.route === "efterkontrol") { await hentEk(); render(); }
    if (S.route === "kunder" || S.route === "indbakke" || S.route === "moms") { await hent(); render(); }
  } catch (err) { F.toast(err.message); }
}
window.addEventListener("hashchange", rute);
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") loginSide(); });
start();
