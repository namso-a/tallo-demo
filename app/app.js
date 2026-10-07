// Tallos app til kunden: computer og telefon. Skærmene er de godkendte fra mockuppen (system/design/platform);
// data kommer fra kunde_data(), og hver handling kalder en funktion i databasen, der selv tjekker adgang og regler.
import { DEMO, Fejl, LOKALT, logUd, rpc, sb, sendBilag, session, virksomheder } from "../felles/data.js";

  let T, V, IDAG, VID, BRUGER, FIRMAER = [];
  const E = F.esc, IC = F.ICON;
  const NAV = [["overblik", "Overblik"], ["transaktioner", "Transaktioner"], ["salg", "Salg"], ["udgifter", "Udgifter"], ["likviditet", "Likviditet"],
    ["rapporter", "Rapporter"], ["moms", "Moms og skat"], ["integrationer", "Integrationer"]];
  const UNDER = [["indstillinger", "Indstillinger"], ["konto", "Min konto"]];
  const TITEL = { godkend: "Godkend", overblik: "Overblik", transaktioner: "Transaktioner", salg: "Salg", udgifter: "Udgifter", likviditet: "Likviditet", rapporter: "Rapporter",
    moms: "Moms og skat", integrationer: "Integrationer", indstillinger: "Indstillinger", konto: "Min konto" };
  const S = { route: "overblik", filter: "alle", q: "", sideN: 30, drawer: null, salgTab: "fakturaer", indTab: "firma", rapP: "ar", momsK: 0, bank: [], fejl: "", mere: false, scan: false, ed: null,
    egne: false, betalingslink: true, rykkerAuto: true };
  const TR = () => [...T.transaktioner].sort((a, b) => (a.dato < b.dato ? 1 : a.dato > b.dato ? -1 : b.id.localeCompare(a.id, "da", { numeric: true })));
  const ST = { bogfoert: ["groen", "Bogført"], mangler_kvittering: ["gul", "Mangler kvittering"], spoergsmal: ["roed", "Spørgsmål til dig"], behandles: ["graa", "Tallo behandler"] };
  const KILDE = { bank: ["bank", "DB", "Bank"], sumup: ["sumup", "SU", "SumUp"], stripe: ["stripe", "S", "Stripe"] };
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const pille = (c, t) => `<span class="pille ${c}">${t}</span>`;
  const kunde = (id) => T.kunder.find((k) => k.id === id);
  const total = () => sum(T.konti, (k) => k.saldo);
  const aabne = () => TR().filter((t) => t.status === "spoergsmal" || t.status === "mangler_kvittering");

  // ------------------------------------------------------------ fakturaer ----
  const FSTAT = { betalt: ["groen", "Betalt"], paamindet: ["roed", "Påmindet"], rykket: ["roed", "Rykket"], for_sent: ["roed", "For sent"],
    sendt: ["accent", "Sendt"], krediteret: ["graa", "Krediteret"] };
  const fstat = (f) => FSTAT[f.status] || ["graa", f.status];
  const TBST = { sendt: ["accent", "Sendt"], accepteret: ["groen", "Accepteret"], afvist: ["graa", "Afvist"], udloebet: ["graa", "Udløbet"] };
  const plusDage = (d, n) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
  const pct = (a, b) => (b ? Math.round((100 * (a - b)) / b) : 0);
  const fortegn = (n) => (n > 0 ? "+" : "") + n + " %";
  const ubetalte = () => T.fakturaer.filter((f) => f.rest > 0);
  const aktueltKvartal = () => T.kvartaler.find((q) => q.status === "afstemmes" && q.frist >= IDAG) || T.kvartaler.find((q) => q.status === "afstemmes") || T.kvartaler[T.kvartaler.length - 1] || { navn: "", at_betale: 0, frist: IDAG };
  const initialer = (n) => (n || "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

  function fakturaDok(f, titel = "FAKTURA") {
    const k = kunde(f.kunde), iban = (T.konti[0]?.iban || "").replace(/\s/g, ""), tb = titel === "TILBUD";
    const link = !tb && f.betalingslink ? `<div class="fbetal"><span class="qr" aria-hidden="true"></span><div><b>Betal med kort eller MobilePay</b><br>${E(f.betalingslink)}</div></div>` : "";
    return `<div class="fdok"><div class="fh"><div><span class="flogo" style="background:${E(V.farve)}">${initialer(V.kort)}</span><b>${E(V.navn)}</b><br>${E(V.adresse)}<br>CVR ${V.cvr}</div><div class="fn">${titel}<br><b>Nr. ${f.nr ?? "kladde"}</b><br>${f.dato ? F.datoLang(f.dato) : ""}</div></div>
      <div class="fk"><small>Til</small><br><b>${E(k.navn)}</b><br>${k.cvr ? "CVR " + k.cvr + "<br>" : ""}${E(k.by)}</div>
      <table><thead><tr><th>Beskrivelse</th><th>Antal</th><th>Pris</th><th>Beløb</th></tr></thead><tbody>${f.linjer.map((l) =>
        `<tr><td>${E(l.tekst)}</td><td>${l.antal}</td><td>${F.kr(l.pris)}</td><td>${F.kr(l.antal * l.pris)}</td></tr>`).join("")}</tbody></table>
      <div class="fs"><div><span>Beløb</span><span>${F.kr(f.netto)}</span></div><div><span>Moms (25 %)</span><span>${F.kr(f.moms)}</span></div><div class="t"><span>I alt DKK</span><span>${F.kr(f.total)}</span></div></div>
      ${tb ? `<div class="fb"><div>Tilbuddet gælder til ${f.gyldig ? F.datoLang(f.gyldig) : "…"}.<br>Svar på mailen for at sige ja.</div><div></div></div>`
        : `${link}<div class="fb"><div>Betaling til reg. ${iban.slice(4, 8)} konto ${iban.slice(8)}<br>Skriv fakturanummer ${f.nr ?? "…"} ved overførsel</div><div>Betalingsfrist ${f.forfald ? F.datoLang(f.forfald) : "…"}</div></div>`}
      <div class="ff">${E(V.navn)} · ${E(V.adresse)} · CVR ${V.cvr}</div></div>`;
  }

  function regn(ed) {
    const linjer = ed.linjer.map((l) => { const vt = T.varetyper.find((v) => v.id === l.vt); return { tekst: vt.navn, antal: +l.antal || 0, pris: +l.pris || 0 }; });
    const netto = Math.round(sum(linjer, (l) => l.antal * l.pris) * 100) / 100, moms = Math.round(netto * 25) / 100;
    const nr = ed.type === "tilbud" ? "T-" + (T.tilbud.length + 1) : Math.max(0, ...T.fakturaer.map((f) => f.nr)) + 1;
    return { nr, dato: IDAG, forfald: plusDage(IDAG, V.betalingsfrist), gyldig: plusDage(IDAG, 30), kunde: ed.kunde, linjer, netto, moms, total: netto + moms };
  }

  // ---------------------------------------------------------------- grafer ----
  function nice(x) { const p = 10 ** Math.floor(Math.log10(x || 1)), n = x / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : n <= 7.5 ? 7.5 : 10) * p; }
  function bars(data, linje, W = 700, H = 240) {
    const L = 62, B = 26, T0 = 10, iw = W - L - 6, ih = H - B - T0, gw = iw / data.length, bw = Math.min(24, gw * 0.3);
    const mx = nice(Math.max(...data.flatMap((d) => [d.a, d.b]), ...(linje || [0])));
    let g = "";
    for (let i = 0; i <= 4; i++) { const y = T0 + ih - (ih * i) / 4; g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--lineal)" ${i ? 'stroke-dasharray="3 4"' : ""}/><text x="${L - 8}" y="${y + 4}" text-anchor="end">${F.kr0((mx * i) / 4)}</text>`; }
    data.forEach((d, i) => {
      const x = L + gw * i + gw / 2, ha = (ih * d.a) / mx, hb = (ih * d.b) / mx, o = d.delvis ? 0.5 : 1;
      g += `<rect x="${x - bw - 2}" y="${T0 + ih - ha}" width="${bw}" height="${Math.max(ha, 0)}" rx="3" fill="var(--graf-ind)" opacity="${o}"><title>${F.maaned(d.m)}: ${F.kr0(d.a)}</title></rect>` +
        `<rect x="${x + 2}" y="${T0 + ih - hb}" width="${bw}" height="${Math.max(hb, 0)}" rx="3" fill="var(--graf-ud)" opacity="${o}"><title>${F.maaned(d.m)}: ${F.kr0(d.b)}</title></rect>` +
        `<text x="${x}" y="${H - 8}" text-anchor="middle">${F.maanedKort(d.m)}</text>`;
    });
    if (linje) {
      const pts = linje.map((v, i) => `${L + gw * i + gw / 2},${T0 + ih - (ih * v) / mx}`);
      g += `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--graf-linje)" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round"/>` +
        pts.map((p) => `<circle cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="3" fill="var(--kort)" stroke="var(--graf-linje)" stroke-width="1.5"/>`).join("");
    }
    return `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Søjlediagram pr. måned">${g}</svg>`;
  }

  // ----------------------------------------------------------------- skaerme ----
  function overblik() {
    const mangler = T.transaktioner.filter((t) => t.status === "mangler_kvittering"), spm = T.transaktioner.filter((t) => t.status === "spoergsmal");
    const udl = T.udlaeg.filter((u) => u.status === "skylder"), ub = ubetalte(), forsent = ub.filter((f) => f.forfald < IDAG), kv = aktueltKvartal();
    const r = resultat("ar"), over = r.si - r.su, overLy = r.siLy - r.suLy;
    const linje = (farve, titel, under, knap, filter) => `<div class="tl" ${filter ? `data-act="filter-gaa" data-f="${filter}" role="button" tabindex="0"` : ""}><span class="statusprik ${farve}"></span><div class="t"><b>${titel}</b><small>${under}</small></div>${knap}</div>`;
    const til = [];
    if (selv() && V.aaben && (S.ind || []).length) til.push(linje("accent", `${S.ind.length} ${S.ind.length > 1 ? "ting venter" : "ting venter"} på din godkendelse`, "AI'en har et forslag til hver; det tager et øjeblik", `<a class="knap lille p" href="#godkend">${IC.check} Godkend</a>`, null));
    if (mangler.length) til.push(linje("gul", `${mangler.length} betaling${mangler.length > 1 ? "er" : ""} mangler en kvittering`, E(mangler.map((t) => t.tekst).join(", ")), `<button class="knap lille p" data-act="scan">${IC.scan} Scan</button>`, "mangler_kvittering"));
    if (spm.length) til.push(linje("roed", `${spm.length} spørgsmål fra Othman`, E(spm.map((t) => t.tekst).join(", ")), `<button class="knap lille p" data-act="aabn-t" data-id="${spm[0].id}">Svar</button>`, "spoergsmal"));
    if (T.udlaeg_skyldig > 0) til.push(linje("accent", `Firmaet skylder dig ${F.kr(T.udlaeg_skyldig)} kr. for udlæg`, "Overfør dem fra firmaets konto til din egen", udl.length ? `<button class="knap lille" data-act="aabn-u" data-id="${udl[0].id}">Se hvordan</button>` : "", null));
    const kpi = [["rapporter", "Overskud i år", F.kr0(over), overLy ? `${pille(over >= overLy ? "groen" : "roed", fortegn(pct(over, overLy)))} mod sidste år` : "Første år hos Tallo"],
      ["likviditet", "På kontoen", F.kr0(total()), T.transaktioner.length ? `Seneste betaling ${F.datoLang(T.transaktioner[T.transaktioner.length - 1].dato)}` : "Banken er ikke koblet til endnu"],
      ["salg", "Kunder skylder dig", F.kr0(sum(ub, (f) => f.total)), `${ub.length} fakturaer${forsent.length ? ` · <span style="color:var(--roed)">${forsent.length} for sent</span>` : ""}`],
      ["moms", `Moms ${kv.navn.replace(/ \d{4}$/, "")}`, F.kr0(kv.at_betale), `Senest ${F.datoLang(kv.frist)}`]];
    return `<div class="gitter g4 kpier">${kpi.map(([r2, n, v, u]) => `<a class="kort kpi" href="#${r2}"><h2>${n}</h2><div class="stort tal">${v} <small>DKK</small></div><div class="not">${u}</div></a>`).join("")}</div>
      <div class="kort tildig" style="margin-top:16px"><div class="kort-hoved"><h2>Til dig</h2></div>
      ${til.join("") || `<div class="altok"><span class="ok">${IC.check}</span><div><b>Alt er på plads.</b><br>Du skal ikke gøre noget. Vi skriver, hvis vi mangler noget.</div></div>`}</div>
      <div class="kort" style="margin-top:16px"><div class="kort-hoved"><h2>Sådan går det</h2><span class="not">Indtægter og udgifter pr. måned, 2026</span></div>
        ${T.maaneder.some((m) => m.ind || m.ud) ? bars(T.maaneder.map((m) => ({ m: m.maaned, a: m.ind, b: m.ud, delvis: m.maaned === +IDAG.slice(5, 7) })), null, 1100, 260)
          : `<p class="not" style="padding:24px 0">Her ser du dine indtægter og udgifter måned for måned, når banken er koblet til.</p>`}
        <div class="forkl"><span><i style="background:var(--graf-ind)"></i>Indtægter</span><span><i style="background:var(--graf-ud)"></i>Udgifter</span><a href="#rapporter" style="margin-left:auto;color:var(--accent)">Se hele regnskabet</a></div></div>`;
  }

  // ------------------------------------------------------------ godkend (pakken 'selv') ----
  // AI'ens forslag pr. bilag og banklinje; kunden godkender med ét tryk eller vælger en anden kategori.
  const selv = () => V.pakke === "selv";
  const KATNAVN = (nr) => (S.kat || []).find((k) => k.nummer === nr)?.kat || (S.kat || []).find((k) => k.nummer === nr)?.navn || nr;
  function katValg(id, nr) {
    const kat = new Map();
    for (const k of S.kat || []) if (k.kat && !kat.has(k.kat)) kat.set(k.kat, k.nummer);
    const kats = [...kat.entries()].filter(([, n]) => n !== nr).sort((a, b) => a[0].localeCompare(b[0], "da"));
    const forslag = nr ? `<option value="${E(nr)}" selected>${E(KATNAVN(nr))} (foreslået)</option>` : `<option value="">Vælg kategori</option>`;
    return `<select class="inp" id="kat-${id}" aria-label="Kategori" style="max-width:260px">${forslag}${kats.map(([n, k]) => `<option value="${E(k)}">${E(n)}</option>`).join("")}
      <optgroup label="Alle konti">${(S.kat || []).map((k) => `<option value="${E(k.nummer)}">${E(k.nummer + " " + k.navn)}</option>`).join("")}</optgroup></select>`;
  }
  function godkend() {
    if (!selv()) return `<div class="kort"><p class="not">Din bogholder bogfører for dig. Her er intet at godkende.</p></div>`;
    if (!V.aaben) return `<div class="kort"><p class="not">Når din konto er åbnet, godkender du her dine bilag og betalinger med ét tryk.</p></div>`;
    const L = S.ind || [];
    if (!L.length) return `<div class="kort tildig"><div class="altok"><span class="ok">${IC.check}</span><div><b>Alt er godkendt.</b><br>Nye bilag og betalinger kommer her, når de dukker op.</div></div></div>`;
    return `<p class="not" style="margin:0 0 14px">AI'en har læst dine bilag og betalinger og foreslår, hvor de skal hen. Godkend, eller vælg en anden kategori.</p>
      <div class="gitter" style="gap:12px">${L.map((x) => {
        const f = x.forslag || {}, id = x.id;
        const hvorfor = { regel: "Sådan bliver bilag fra afsenderen altid bogført", historik: "Som de tidligere bilag fra afsenderen" }[f.grundlag] || "";
        const forslag = f.konto ? `<b>${E(KATNAVN(f.konto))}</b>${hvorfor ? `<small class="not">${hvorfor}</small>` : ""}` : `<b>Hvad var det?</b><small class="not">${x.type === "bank" ? "Der er intet bilag til betalingen. Vælg, hvad den var til, eller send et bilag." : "AI'en har intet forslag. Vælg en kategori."}</small>`;
        return `<div class="kort godk">
          <div><div class="not" style="font-size:12.5px">${x.type === "bank" ? "Betaling" : "Bilag"} · ${x.dato ? F.dato(x.dato) : "uden dato"}</div><div style="font-weight:600;font-size:16px">${E(x.tekst)}</div></div>
          <div class="tal bel">${x.beloeb != null ? F.kr(x.type === "bank" ? x.beloeb : -x.beloeb) : ""}</div>
          <div style="display:grid;gap:2px">${forslag}</div>
          <div class="valg">${katValg(id, f.konto)}
            <button class="knap p" data-act="godkend-selv" data-id="${id}">${IC.check} Godkend</button>
            ${x.type === "bilag" ? `<button class="knap" data-act="afvis-selv" data-id="${id}">Ikke et bilag</button>` : `<button class="knap" data-act="scan">${IC.scan} Send bilag</button>`}</div></div>`;
      }).join("")}</div>`;
  }

  function trTabel(liste, fod = true) {
    const rk = liste.map((t) => {
      const k = KILDE[t.kilde] || KILDE.bank, [pc, pt] = ST[t.status];
      const bil = t.bilag ? `<span class="bilag-nr">${IC.papir}${t.bilag}</span>` : t.status === "mangler_kvittering" ? pille("gul", "+ Kvittering") : t.status === "spoergsmal" ? pille("roed", "Svar") : t.status === "behandles" ? `<span class="not">Læses</span>` : `<span class="not">Intet bilag</span>`;
      return `<div class="r rk" role="button" tabindex="0" data-act="aabn-t" data-id="${t.id}"><div class="c-st">${pille(pc, pt)}</div><div class="c-dato tal">${F.dato(t.dato)}</div>
        <div class="tekst c-tekst"><span class="tk"><span class="chip-kilde ${k[0]}">${k[1]}</span><span class="tt"><b style="font-weight:500">${E(t.tekst)}</b><small>${E(k[2])} · ${E(T.konti.find((x) => x.id === t.konto).navn)}</small></span></span></div>
        <div class="c-kat">${pille("kat", E(t.kat))}</div><div class="c-bilag">${bil}</div><div class="b c-bel ${t.beloeb > 0 ? "pos" : "neg"}">${t.beloeb > 0 ? "+" : ""}${F.kr(t.beloeb)} DKK</div></div>`;
    }).join("");
    return `<div class="tabel"><div class="r rk h"><div class="c-st">Status</div><div class="c-dato">Dato</div><div class="c-tekst">Beskrivelse</div><div class="c-kat">Kategori</div><div class="c-bilag">Bilag</div><div class="b c-bel">Beløb</div></div>${rk || '<div class="tom">Ingen transaktioner passer til søgningen.</div>'}</div>`;
  }

  function filtreret() {
    let l = TR();
    if (S.filter !== "alle") l = l.filter((t) => t.status === S.filter);
    if (S.q) { const q = S.q.toLowerCase(); l = l.filter((t) => `${t.tekst} ${t.kat} ${Math.abs(t.beloeb)} ${t.bilag || ""}`.toLowerCase().includes(q)); }
    return l;
  }
  function trListe() {
    const l = filtreret(), vis = l.slice(0, S.sideN);
    return trTabel(vis) + `<div class="tabelfod"><span>Viser ${vis.length} af ${l.length}</span>${vis.length < l.length ? '<button class="knap lille" data-act="flere">Vis flere</button>' : ""}</div>`;
  }
  function transaktioner() {
    const al = T.transaktioner, n = (s) => al.filter((t) => t.status === s).length;
    return `<div class="kort tabeldel"><div style="display:flex;gap:10px;padding:16px;align-items:center;flex-wrap:wrap"><select class="inp aar" style="width:auto" aria-label="År"><option>2026</option><option>2025</option></select>
      <label class="soeg">${IC.soeg}<input id="q" placeholder="Søg i beskrivelse, kategori, beløb eller bilagsnummer" value="${E(S.q)}" autocomplete="off"></label>
      <button class="ikonknap" aria-label="Flere filtre" style="box-shadow:inset 0 0 0 1px var(--lineal)">${IC.filter}</button></div>
      <div style="padding:0 16px 14px" class="filtre" role="group" aria-label="Vis">${[["alle", "Alle", al.length], ["bogfoert", "Bogført", n("bogfoert")], ["mangler_kvittering", "Mangler kvittering", n("mangler_kvittering")], ["spoergsmal", "Spørgsmål", n("spoergsmal")], ["behandles", "Tallo behandler", n("behandles")]]
        .map(([k, t, c]) => `<button data-act="filter" data-f="${k}" aria-pressed="${S.filter === k}">${t}<b>${c}</b></button>`).join("")}</div>
      <div id="trliste">${trListe()}</div></div>`;
  }

  function salg() {
    const fl = [...T.fakturaer].sort((a, b) => b.nr - a.nr), ub = ubetalte(), forsent = ub.filter((f) => f.forfald < IDAG), betalt = T.fakturaer.filter((f) => f.status === "betalt");
    const tabs = `<div class="faner" role="tablist">${[["fakturaer", "Fakturaer"], ["tilbud", "Tilbud"], ["abonnementer", "Abonnementer"], ["kunder", "Kunder"], ["betalinger", "Betalinger"]].map(([k, t]) => `<button role="tab" aria-selected="${S.salgTab === k}" data-act="salgtab" data-t="${k}">${t}</button>`).join("")}</div>`;
    let ind = "";
    if (S.salgTab === "fakturaer") {
      ind = `<div class="gitter g3" style="margin:16px 0"><div class="kort"><h2>Ubetalt</h2><div class="stort tal">${F.kr(sum(ub, (f) => f.total))} <small>DKK</small></div><div class="not">${ub.length} fakturaer</div></div>
        <div class="kort"><h2>Heraf for sent</h2><div class="stort tal" style="color:${forsent.length ? "var(--roed)" : "inherit"}">${F.kr(sum(forsent, (f) => f.total))} <small>DKK</small></div><div class="not">${forsent.length} faktura${forsent.length === 1 ? "" : "er"} · ${V.auto_paamindelse ? "påmindelser sendes af sig selv" : "påmindelser er slået fra"}</div></div>
        <div class="kort"><h2>Betalt i år</h2><div class="stort tal">${F.kr0(sum(betalt, (f) => f.total))} <small>DKK</small></div><div class="not">${betalt.length} fakturaer</div></div></div>
        <div class="kort tabeldel"><div class="tabel"><div class="r rf h"><div>Nr.</div><div>Kunde</div><div class="c-dato">Dato</div><div class="c-dato">Forfald</div><div>Status</div><div class="b">Beløb</div></div>
        ${fl.map((f) => `<div class="r rf" role="button" tabindex="0" data-act="aabn-f" data-nr="${f.nr}"><div class="tal">${f.nr}</div><div class="tekst">${E(kunde(f.kunde).navn)}<small>${E(f.linjer[0].tekst)}${f.linjer.length > 1 ? " m.m." : ""}</small></div><div class="c-dato tal">${F.dato(f.dato)}</div><div class="c-dato tal">${F.dato(f.forfald)}</div><div>${pille(...fstat(f))}</div><div class="b">${F.kr(f.total)}</div></div>`).join("")}</div></div>`;
    } else if (S.salgTab === "tilbud") {
      const aabent = T.tilbud.filter((t) => t.status === "sendt");
      ind = `<div class="gitter g3" style="margin:16px 0"><div class="kort"><h2>Venter på svar</h2><div class="stort tal">${F.kr(sum(aabent, (t) => t.total))} <small>DKK</small></div><div class="not">${aabent.length} tilbud</div></div>
        <div class="kort"><h2>Sagt ja i år</h2><div class="stort tal">${T.tilbud.filter((t) => t.status === "accepteret").length} <small>af ${T.tilbud.length}</small></div><div class="not">Et ja bliver til en faktura med ét tryk</div></div><div class="kort"><h2>Gyldighed</h2><div class="stort tal">30 <small>dage</small></div><div class="not">Fra den dag, tilbuddet sendes</div></div></div>
        <div class="kort tabeldel"><div class="tabel"><div class="r rf h"><div>Nr.</div><div>Kunde</div><div class="c-dato">Dato</div><div class="c-dato">Gælder til</div><div>Status</div><div class="b">Beløb</div></div>
        ${[...T.tilbud].sort((a, b) => (a.dato < b.dato ? 1 : -1)).map((t) => `<div class="r rf" role="button" tabindex="0" data-act="aabn-tb" data-nr="${t.nr}"><div class="tal">${t.nr}</div><div class="tekst">${E(kunde(t.kunde).navn)}<small>${E(t.linjer[0].tekst)}${t.linjer.length > 1 ? " m.m." : ""}</small></div><div class="c-dato tal">${F.dato(t.dato)}</div><div class="c-dato tal">${F.dato(t.gyldig)}</div><div>${pille(...TBST[t.status])}</div><div class="b">${F.kr(t.total)}</div></div>`).join("")}</div></div>`;
    } else if (S.salgTab === "abonnementer") {
      ind = `<div class="kort tabeldel" style="margin-top:16px"><div class="tabel"><div class="r ra h"><div>Kunde</div><div>Hvad</div><div>Hvor ofte</div><div class="c-dato">Næste faktura</div><div class="b">Beløb pr. gang</div><div>Status</div></div>
        ${T.abonnementer.map((a) => `<div class="r ra"><div class="tekst">${E(kunde(a.kunde).navn)}<small>${a.sendt} fakturaer sendt</small></div><div class="tekst">${E(a.linjer[0].tekst)}</div><div>${E(a.hvor_ofte)}</div><div class="c-dato tal">${F.dato(a.naeste)}</div><div class="b">${F.kr(a.total)}</div><div>${pille("groen", "Aktiv")}</div></div>`).join("")}</div>
        ${T.abonnementer.length ? "" : '<div class="tom">Ingen abonnementer endnu. Lav en faktura og vælg "Gentag".</div>'}<div class="tabelfod"><span>Fakturaerne sendes af sig selv på datoen og bogføres som alle andre.</span><button class="knap lille" data-act="nyt-abon">${IC.plus} Nyt abonnement</button></div></div>`;
    } else if (S.salgTab === "kunder") {
      ind = `<div class="kort tabeldel" style="margin-top:16px"><div class="tabel"><div class="r rk2 h"><div>Kunde</div><div class="c-kat">By</div><div class="b">Fakturaer</div><div class="b">Faktureret i år</div><div class="b">Ubetalt</div><div></div></div>
        ${T.kunder.map((k) => { const fk = T.fakturaer.filter((f) => f.kunde === k.id); return `<div class="r rk2"><div class="tekst">${E(k.navn)}<small>${k.cvr ? "CVR " + k.cvr : "Privat"} · ${E(k.mail)}</small></div><div class="c-kat">${E(k.by)}</div><div class="b">${fk.length}</div><div class="b">${F.kr(sum(fk, (f) => f.total))}</div><div class="b">${F.kr(sum(fk.filter((f) => !f.betalt), (f) => f.total))}</div><div class="b" style="display:flex;gap:6px;justify-content:flex-end"><button class="knap lille" data-act="kontoudtog" data-k="${k.id}">Kontoudtog</button><button class="knap lille" data-act="ny-f" data-k="${k.id}">Faktura</button></div></div>`; }).join("")}</div></div>`;
    } else {
      const bet = TR().filter((t) => t.faktura);
      ind = `<div class="kort tabeldel" style="margin-top:16px"><div class="tabel"><div class="r rb h"><div class="c-dato">Dato</div><div>Fra</div><div>Faktura</div><div>Afstemning</div><div class="b">Beløb</div></div>
        ${bet.map((t) => `<div class="r rb"><div class="c-dato tal">${F.dato(t.dato)}</div><div class="tekst">${E(kunde(t.kunde).navn)}</div><div>Nr. ${t.faktura}</div><div>${pille("groen", "Afstemt automatisk")}</div><div class="b pos">+${F.kr(t.beloeb)} DKK</div></div>`).join("")}</div>
        <div class="tabelfod"><span>Når pengene kommer ind på kontoen, finder Tallo fakturaen og markerer den som betalt.</span></div></div>`;
    }
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">${tabs}</div>${ind}`;
  }

  function udgifter() {
    const l = TR().filter((t) => t.beloeb < 0 && !["Overførsel", "Moms og skat", "Bankgebyrer", "Løn og pension", "Udlæg"].includes(t.kat)).slice(0, 40);
    const ul = [...T.udlaeg].reverse().map((u) => `<div class="r ru" role="button" tabindex="0" data-act="aabn-u" data-id="${u.id}"><div><span class="mini-bon"><i></i><i></i><i></i><i></i></span></div><div class="tekst">${E(u.tekst)}<small>Betalt med egne penge</small></div><div class="c-dato tal">${F.dato(u.dato)}</div><div class="c-kat">${pille("kat", E(u.kat))}</div><div>${u.status === "skylder" ? pille("accent", "Firmaet skylder dig") : pille("groen", "Tilbagebetalt")}</div><div class="b">${F.kr(u.beloeb)} DKK</div></div>`).join("");
    return `<div class="dropzone"><div class="ikon">${IC.upload}</div><div style="flex:1"><b>Træk dine bilag hertil</b><p>Eller send dem på mail til <b class="mono" style="font-size:13px">${V.bilagsadresse}</b>. Har du betalt med egne penge, så sig det, når du scanner.</p></div>
      <button class="knap p" data-act="scan">${IC.scan} Scan med telefonen</button><button class="knap">Vælg filer</button></div>
      <div class="kort tabeldel" style="margin-top:16px"><div class="tabel"><div class="r ru h"><div></div><div>Leverandør</div><div class="c-dato">Dato</div><div class="c-kat">Kategori</div><div>Status</div><div class="b">Beløb</div></div>${ul}
      ${l.map((t) => { const [pc, pt] = ST[t.status]; return `<div class="r ru" role="button" tabindex="0" data-act="aabn-t" data-id="${t.id}"><div><span class="mini-bon"><i></i><i></i><i></i><i></i></span></div><div class="tekst">${E(t.tekst)}<small>${t.bilag ? "Bilag " + t.bilag : "Intet bilag endnu"}</small></div><div class="c-dato tal">${F.dato(t.dato)}</div><div class="c-kat">${pille("kat", E(t.kat))}</div><div>${pille(pc, pt)}</div><div class="b">${F.kr(-t.beloeb)} DKK</div></div>`; }).join("")}</div>
      <div class="tabelfod"><span>Viser de seneste ${l.length + T.udlaeg.length} udgifter</span></div></div>`;
  }

  function likviditet() {
    const L = T.likviditet, M = Array.from({ length: +IDAG.slice(5, 7) }, (_, i) => i + 1), ind = M.map((m, i) => sum(Object.values(L.ind), (a) => a[i])), ud = M.map((m, i) => -sum(Object.values(L.ud), (a) => a[i]));
    let s = sum(T.konti, (k) => k.primo); const saldo = M.map((m, i) => (s += ind[i] - ud[i]));
    const rk = (navn, a, neg) => `<tr><td>${E(navn)}</td>${a.map((v) => `<td class="${v ? (neg ? "neg" : "pos") : ""}">${v ? F.kr0(neg ? -Math.abs(v) : v) : "0"}</td>`).join("")}<td><b>${F.kr0(neg ? -Math.abs(sum(a, (x) => x)) : sum(a, (x) => x))}</b></td></tr>`;
    return `<div class="kort"><h2>Din banksaldo</h2><div style="display:flex;gap:40px;flex-wrap:wrap;margin-top:12px;align-items:center">${T.konti.map((k) => `<div style="display:flex;gap:12px;align-items:center"><span class="chip-kilde bank" style="width:38px;height:38px;font-size:12px">${initialer(k.navn)}</span><div><div class="not">${k.navn} <span class="statusprik groen"></span></div><div class="tal" style="font-size:22px;font-weight:600;color:var(--groen)">${F.kr(k.saldo)} DKK</div></div></div>`).join("")}
      <div style="margin-left:auto;text-align:right"><div class="not">Total</div><div class="tal" style="font-size:26px;font-weight:600">${F.kr(total())} DKK</div></div></div></div>
      <div class="kort" style="margin-top:16px"><div class="kort-hoved"><h2>Pengestrøm</h2><select class="inp" style="width:auto" aria-label="År"><option>2026</option></select></div>
      ${bars(M.map((m, i) => ({ m, a: ind[i], b: ud[i], delvis: m === M.length })), saldo, 1100, 300)}
      <div class="forkl"><span><i style="background:var(--graf-ind)"></i>Indbetalinger</span><span><i style="background:var(--graf-ud)"></i>Udbetalinger</span><span>Prikket linje: saldo ved månedens slutning</span></div></div>
      <div class="kort tabeldel rul" style="margin-top:16px"><table class="vtabel"><thead><tr><th>Måned</th>${M.map((m) => `<th>${F.maanedKort(m)}</th>`).join("")}<th>Total</th></tr></thead><tbody>
      <tr class="sum"><td>Total indbetalinger</td>${ind.map((v) => `<td class="pos">${F.kr0(v)}</td>`).join("")}<td>${F.kr0(sum(ind, (x) => x))}</td></tr>${Object.entries(L.ind).map(([n, a]) => rk(n, a, false)).join("")}
      <tr class="sum"><td>Total udbetalinger</td>${ud.map((v) => `<td class="neg">${F.kr0(-v)}</td>`).join("")}<td>${F.kr0(-sum(ud, (x) => x))}</td></tr>${Object.entries(L.ud).map(([n, a]) => rk(n, a, true)).join("")}
      <tr class="sum"><td>Saldo ved månedens slutning</td>${saldo.map((v) => `<td>${F.kr0(v)}</td>`).join("")}<td>${F.kr0(saldo[saldo.length - 1])}</td></tr></tbody></table></div>`;
  }

  function perioder() {
    const y = IDAG.slice(0, 4), m = +IDAG.slice(5, 7), q = Math.ceil(m / 3), stor = (x) => x.charAt(0).toUpperCase() + x.slice(1);
    const o = { ar: [`Hele ${y} til i dag`, 1, m] };
    for (let i = q; i >= 1; i--) o["q" + i] = [`${i}. kvartal ${y}`, 3 * i - 2, Math.min(3 * i, m)];
    o.md = [`${stor(F.maaned(m))} ${y}`, m, m];
    return o;
  }
  function resultat(p) {
    const [, m1, m2] = perioder()[p], y = +IDAG.slice(0, 4);
    const saml = (aar) => { const o = {}; T.drift.filter((d) => d.aar === aar && d.maaned >= m1 && d.maaned <= m2).forEach((d) => { o[d.navn] = (o[d.navn] || 0) + d.beloeb; }); return o; };
    const del = (o) => { const ind = {}, ud = {}; for (const [n, v] of Object.entries(o)) { if (v < 0) ind[n] = -v; else if (v > 0) ud[n] = v; } return [ind, ud]; };
    const [inn, ud] = del(saml(y)), [innLy, udLy] = del(saml(y - 1)), s2 = (o) => sum(Object.values(o), (x) => x);
    return { inn, ud, innLy, udLy, si: s2(inn), su: s2(ud), siLy: s2(innLy), suLy: s2(udLy) };
  }

  function rapporter() {
    const r = resultat(S.rapP), kv3 = aktueltKvartal(), deb = sum(ubetalte(), (f) => f.rest), akt = total() + deb, gaeld = kv3.at_betale + T.udlaeg_skyldig;
    const res = r.si - r.su, resLy = r.siLy - r.suLy, grad = r.si ? Math.round((100 * res) / r.si) : 0, gradLy = r.siLy ? Math.round((100 * resLy) / r.siLy) : 0;
    const rows = (o, oLy) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([n, v]) => { const l = oLy[n] || 0; return `<tr><td>${E(n)}</td><td>${F.kr(v)}</td><td style="color:var(--svag)">${F.kr(l)}</td><td>${fortegn(pct(v, l))}</td></tr>`; }).join("");
    const noegle = [["Omsætning", F.kr0(r.si), pct(r.si, r.siLy), true], ["Overskudsgrad", grad + " %", grad - gradLy, true, " point"], ["Udgifter", F.kr0(r.su), pct(r.su, r.suLy), false]];
    return `<div class="gitter g3" style="margin-bottom:16px">${noegle.map(([n, v, d, godt, enh]) => `<div class="kort"><h2>${n}</h2><div class="stort tal">${v}</div><div class="not">${pille((d >= 0) === godt ? "groen" : "roed", (d > 0 ? "+" : "") + d + (enh || " %"))} mod samme periode sidste år</div></div>`).join("")}</div>
      <div class="gitter g21"><div class="kort"><div class="kort-hoved"><h2>Resultat</h2><select class="inp" style="width:auto" id="rapp" aria-label="Periode">${Object.entries(perioder()).map(([k, p]) => `<option value="${k}" ${k === S.rapP ? "selected" : ""}>${p[0]}</option>`).join("")}</select></div>
      <div class="rul"><table class="vtabel" style="margin-top:6px"><thead><tr><th></th><th>${IDAG.slice(0, 4)}</th><th>Sidste år</th><th>Ændring</th></tr></thead><tbody><tr class="sum"><td>Indtægter</td><td>${F.kr(r.si)}</td><td>${F.kr(r.siLy)}</td><td>${fortegn(pct(r.si, r.siLy))}</td></tr>${rows(r.inn, r.innLy)}
      <tr class="sum"><td>Udgifter</td><td>${F.kr(-r.su)}</td><td>${F.kr(-r.suLy)}</td><td>${fortegn(pct(r.su, r.suLy))}</td></tr>${rows(r.ud, r.udLy)}
      <tr class="sum" style="font-size:16px"><td>Resultat</td><td style="color:${res >= 0 ? "var(--groen)" : "var(--roed)"}">${F.kr(res)}</td><td>${F.kr(resLy)}</td><td>${fortegn(pct(res, resLy))}</td></tr></tbody></table></div><p class="not" style="margin:12px 0 0">Beløb uden moms. Sidste år er samme periode i ${+IDAG.slice(0, 4) - 1}.</p></div>
      <div style="display:grid;gap:16px;align-content:start"><div class="kort"><div class="kort-hoved"><h2>Hent</h2></div><div class="liste">
        ${[["Resultat og balance", "Udskriv eller gem som PDF", "PDF", "udskriv"], ["Alle betalinger", "Excel · hvert bilag og hver betaling", "XLSX", "bestil"], ["Hele din bogføring", "Standardfil (SAF-T) · til din revisor, eller hvis du skifter bogholder", "SAF-T", "bestil"], ["Alle bilag", "ZIP · billeder og PDF'er", "ZIP", "bestil"]]
          .map(([n, t, f, h]) => `<div class="li"><span class="pille graa mono" style="min-width:52px;justify-content:center">${f}</span><div class="t"><b>${n}</b><small>${t}</small></div><button class="knap lille" data-act="${h}" data-hvad="${n}">${IC.hent} ${h === "udskriv" ? "Udskriv" : "Bestil"}</button></div>`).join("")}</div>
        <p class="not" style="margin:10px 0 0;font-size:12.5px">Excel, standardfilen og bilagene sender vi på mail samme dag.</p></div>
        <div class="kort"><div class="kort-hoved"><h2>Balance</h2><span class="not">${F.datoLang(IDAG)}</span></div><table class="vtabel"><tbody>
        <tr><td>Bankkonti</td><td>${F.kr(total())}</td></tr><tr><td>Penge hos kunder (ubetalte fakturaer)</td><td>${F.kr(deb)}</td></tr><tr class="sum"><td>Du ejer</td><td>${F.kr(akt)}</td></tr>
        <tr><td>Moms, der skal betales</td><td>${F.kr(kv3.at_betale)}</td></tr>${T.udlaeg_skyldig ? `<tr><td>Udlæg, firmaet skylder dig</td><td>${F.kr(T.udlaeg_skyldig)}</td></tr>` : ""}<tr class="sum"><td>Du skylder</td><td>${F.kr(gaeld)}</td></tr>
        <tr class="sum" style="font-size:16px"><td>Egenkapital</td><td>${F.kr(akt - gaeld)}</td></tr></tbody></table></div></div></div>`;
  }

  function moms() {
    const K = T.kvartaler, k = K[S.momsK], ind = k.status === "indberettet";
    const trin = ind ? [["Bilag og bank på plads", "Alle betalinger har en kvittering"], ["Afstemt af Tallo", "Tallene er kontrolleret mod banken"], ["Indberettet af Tallo", "Godkendt af en bogholder i TastSelv"], ["Betalt", "Betalingen ses i banken"]]
      : [["Bilag og bank på plads", `${T.transaktioner.filter((t) => t.status !== "bogfoert" && t.dato >= k.fra && t.dato <= k.til).length || "Ingen"} betalinger mangler`], ["Afstemt af Tallo", "Starter, når alle bilag er på plads"], ["Indberettet af Tallo", `Senest ${F.datoLang(k.frist)}`], ["Betalt", "Du betaler via Skattestyrelsen"]];
    const cls = (i) => (ind ? "ok" : i === 0 ? "nu" : "");
    return `<div class="gitter g12"><div class="kort"><div class="kort-hoved"><h2>Perioder</h2></div><div class="liste">${K.map((q, i) => `<div class="li" role="button" tabindex="0" data-act="momsk" data-i="${i}" style="cursor:pointer;${i === S.momsK ? "background:var(--accent-svag);margin:0 -12px;padding:12px;border-radius:var(--radius-lille);border-top:0" : ""}"><div class="t"><b>${q.navn}</b><small>Frist ${F.datoLang(q.frist)}</small></div><div style="text-align:right"><div class="tal">${F.kr0(q.at_betale)}</div>${pille(q.status === "indberettet" ? "groen" : "accent", q.status === "indberettet" ? "Indberettet" : "Afstemmes")}</div></div>`).join("")}</div>
      <p class="not" style="margin-bottom:0">Momsen indberettes af os, og en person godkender hver gang. Det sker aldrig automatisk.</p></div>
      <div style="display:grid;gap:16px;align-content:start"><div class="kort"><div class="kort-hoved"><h2>${k.navn}</h2>${pille(ind ? "groen" : "accent", ind ? "Indberettet" : "Afstemmes af Tallo")}</div>
        <div class="gitter g3"><div><div class="not">Moms af salg</div><div class="stort tal" style="font-size:24px">${F.kr(k.salgsmoms)}</div></div><div><div class="not">Moms af dine køb</div><div class="stort tal" style="font-size:24px">${F.kr(k.koebsmoms)}</div></div>
        <div><div class="not">${k.at_betale >= 0 ? "At betale" : "Til gode"}</div><div class="stort tal" style="font-size:24px">${F.kr(Math.abs(k.at_betale))}</div></div></div><ul class="tidslinje" style="margin-top:22px">${trin.map(([t, u], i) => `<li class="${cls(i)}">${t}<small>${u}</small></li>`).join("")}</ul></div>
        <div class="kort tabeldel"><div class="kort-hoved" style="padding:18px 20px 0"><h2>Sådan er tallet regnet</h2><span class="not">Beløb uden moms</span></div>${momsGrundlag(k)}</div>
        <div class="kort"><div class="kort-hoved"><h2>Kommende frister</h2></div><div class="liste">${T.kvartaler.filter((q) => q.status !== "indberettet")
          .map((q) => `<div class="li"><div class="t"><b>Moms ${q.navn}</b><small>${F.datoLang(q.frist)}</small></div><span class="tal">${F.kr(q.at_betale)}</span></div>`).join("") || '<div class="tom">Ingen frister lige nu.</div>'}</div></div>
        <div class="kort"><div class="kort-hoved"><h2>Årsregnskab ${IDAG.slice(0, 4)}</h2>${pille("graa", "Starter i januar")}</div><p class="not" style="margin:0">Når året er slut, laver vi årsregnskabet og selvangivelsen. Du skal ikke gøre noget før da, og vi skriver, hvis vi mangler noget.</p></div></div></div>`;
  }

  function momsGrundlag(k) {
    const sal = {}, koeb = {};
    T.transaktioner.filter((t) => t.status === "bogfoert" && t.moms === "25" && t.dato >= k.fra && t.dato <= k.til).forEach((t) => {
      const o = t.beloeb > 0 ? sal : koeb; o[t.kat] = o[t.kat] || [0, 0]; o[t.kat][0] += Math.abs(t.beloeb) / 1.25; o[t.kat][1] += Math.abs(t.beloeb) * 0.2;
    });
    const fk = T.fakturaer.filter((f) => f.dato >= k.fra && f.dato <= k.til); if (fk.length) sal["Fakturaer til kunder"] = [sum(fk, (f) => f.netto), sum(fk, (f) => f.moms)];
    T.udlaeg.filter((u) => u.dato >= k.fra && u.dato <= k.til).forEach((u) => { koeb[u.kat] = koeb[u.kat] || [0, 0]; koeb[u.kat][0] += u.beloeb / 1.25; koeb[u.kat][1] += u.beloeb * 0.2; });
    const rk = (o, neg) => Object.entries(o).sort((a, b) => b[1][1] - a[1][1]).map(([n, [g, m]]) => `<tr><td>${E(n)}</td><td>${F.kr(g)}</td><td>${neg ? "-" : ""}${F.kr(m)}</td></tr>`).join("");
    return `<table class="vtabel" style="margin-top:8px"><thead><tr><th>Hvad</th><th>Beløb</th><th>Moms</th></tr></thead><tbody><tr class="sum"><td>Moms af salg</td><td></td><td>${F.kr(k.salgsmoms)}</td></tr>${rk(sal, false)}
      <tr class="sum"><td>Moms af dine køb</td><td></td><td>-${F.kr(k.koebsmoms)}</td></tr>${rk(koeb, true)}<tr class="sum"><td>${k.at_betale >= 0 ? "At betale" : "Til gode"}</td><td></td><td>${F.kr(Math.abs(k.at_betale))}</td></tr></tbody></table>`;
  }

  function integrationer() {
    const b = S.bank[0], bank = b ? [b.status === "aktiv" ? (b.fornyes_snart ? "Fornyes snart" : "Forbundet") : "Udløbet", b.status === "aktiv" && !b.fornyes_snart ? "groen" : "gul",
      `Samtykket gælder til ${F.datoLang(String(b.gyldig_til).slice(0, 10))}`, "Forny"] : ["Ikke forbundet", "graa", "Du logger ind med dit eget MitID hos banken", "Kobl banken til"];
    const kort = [["bank", initialer(b?.bank || "Bank"), b?.bank || "Din bank", "Vi kan kun se dine betalinger, ikke flytte penge.", bank[0], bank[1], bank[2], bank[3], "bank"],
      ["mail", "@", "Din bilagsadresse", V.bilagsadresse, "Aktiv", "groen", "Mails med fakturaer læses automatisk", "Kopiér", "kopier"],
      ["faktura", "E", "E-faktura (Nemhandel)", "Kunder i det offentlige modtager dine fakturaer elektronisk.", "Aktiv", "groen", "Sendes af sig selv, når kunden har et EAN-nummer", "", ""],
      ["bank", "SK", "Skattestyrelsen", "Moms og skat. Vi har rådgiveradgang og godkender selv, aldrig automatisk.", "Aktiv", "groen", "Du giver adgangen i TastSelv", "", ""],
      ["sumup", "SU", "SumUp, Stripe og MobilePay", "Kassesalg og webshop bogføres af sig selv.", "Kommer", "graa", "Fortæl os, hvad du bruger", "Skriv til os", "skriv"],
      ["gron", "L", "Løn (Salary)", "Lønkørslen bogføres af sig selv hver måned.", "Kommer", "graa", "Fortæl os, hvis du har ansatte", "Skriv til os", "skriv"]];
    return `<div class="gitter g3">${kort.map(([c, i, n, t, s2, sc, f, knap, act]) => `<div class="kort" style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;align-items:center;gap:12px"><span class="chip-kilde ${c}" style="width:40px;height:40px;font-size:13px;border-radius:11px">${E(i)}</span><b style="font-size:16px">${E(n)}</b><span style="margin-left:auto">${pille(sc, s2)}</span></div>
      <div class="not" style="flex:1">${E(t)}</div><div class="not" style="color:var(--svag)">${f}</div>${knap ? `<div><button class="knap lille" data-act="${act}">${knap}</button></div>` : ""}</div>`).join("")}</div>`;
  }

  function indstillinger() {
    const tabs = [["firma", "Firma"], ["fakturaer", "Fakturaer"], ["brugere", "Brugere"], ["sikkerhed", "Sikkerhed"], ["abonnement", "Abonnement"], ["data", "Data"]];
    const f = (l, v) => `<div class="felt"><label>${l}</label><input class="inp" value="${E(v)}" readonly></div>`;
    const ind = {
      firma: `<div class="kort"><div class="kort-hoved"><h2>Firmaoplysninger</h2></div><div class="gitter g2">${f("Navn", V.navn)}${f("CVR", V.cvr)}${f("Adresse", V.adresse)}${f("Bilagsadresse", V.bilagsadresse)}</div>
        <p class="not" style="margin:14px 0 0">Er noget forkert, så skriv til os. Navn, CVR og adresse står på dine fakturaer og i bogføringen, så vi retter dem.</p><div style="margin-top:12px"><button class="knap" data-act="skriv">Skriv til Othman</button></div></div>`,
      fakturaer: `<div class="gitter g2" style="margin-bottom:16px"><div class="kort"><div class="kort-hoved"><h2>Udseende</h2></div><div style="display:flex;gap:16px;align-items:center"><span class="flogo stor" style="background:${E(V.farve)}">${initialer(V.kort)}</span><div><b>Dit logo</b><div class="not">Upload af logo kommer snart. Indtil da står dine forbogstaver.</div></div></div>
          <div class="not" style="margin-top:16px">Farve på fakturaen</div><div class="farver">${["#c98a3b", "#4b3aa6", "#1f7a4a", "#141414", "#2b55d6"].map((c, i) => `<button class="farve" data-act="farve" data-farve="${c}" style="background:${c}" aria-label="Farve ${i + 1}" aria-pressed="${V.farve === c}"></button>`).join("")}</div></div>
        <div class="kort"><div class="kort-hoved"><h2>Betaling og rykkere</h2></div><div class="liste">
          <div class="li"><div class="t"><b>Venlig påmindelse af sig selv</b><small>2 dage efter forfald, uden gebyr</small></div><button class="sw" role="switch" aria-checked="${V.auto_paamindelse}" aria-label="Påmindelse" data-act="sw-rykker"></button></div>
          <div class="li"><div class="t"><b>Betalingsfrist</b><small>Gælder nye fakturaer</small></div><select class="inp" style="width:auto" id="frist" aria-label="Betalingsfrist">${[8, 14, 30].map((d) => `<option value="${d}" ${V.betalingsfrist === d ? "selected" : ""}>${d} dage</option>`).join("")}</select></div>
          <div class="li"><div class="t"><b>Rykker med gebyr</b><small>Du trykker selv. 100 kr. pr. rykker, højst tre, og mindst 10 dage imellem (renteloven)</small></div>${pille("accent", "Manuelt")}</div>
          <div class="li"><div class="t"><b>Betalingslink (kort og MobilePay)</b><small>Kommer, når betalingsudbyderen er på plads</small></div>${pille("graa", "Kommer")}</div></div></div></div>
        <div class="kort tabeldel"><div class="kort-hoved" style="padding:20px 20px 0"><h2>Dine varer og ydelser</h2><button class="knap lille" data-act="skriv">Ny vare: skriv til os</button></div><div class="tabel">${T.varetyper.map((v) => `<div class="r rv"><div class="tekst">${E(v.navn)}</div><div class="b">${F.kr(v.pris)} / ${E(v.enhed)}</div><div class="not">Moms 25 %</div></div>`).join("") || '<div class="tom">Ingen varer endnu.</div>'}</div><div class="tabelfod"><span>Tallo har sat bogføringen op for hver. Du vælger bare varen.</span></div></div>`,
      brugere: `<div class="kort tabeldel"><div class="kort-hoved" style="padding:20px 20px 0"><h2>Brugere</h2>${pille("graa", "Invitationer kommer")}</div><div class="tabel">${[[BRUGER.navn || BRUGER.mail, BRUGER.mail, "Dig"], ["Othman (Tallo)", "Din bogholder", "Bogholder"]].map(([n, m, r2]) => `<div class="r rv"><div class="tekst">${E(n)}<small>${E(m)}</small></div><div>${pille("accent", r2)}</div><div></div></div>`).join("")}</div>
        <div class="tabelfod"><span>Skal din revisor eller en medarbejder have adgang, så skriv til os. En revisor kan kun læse.</span></div></div>`,
      sikkerhed: `<div class="gitter g2"><div class="kort"><div class="kort-hoved"><h2>Login</h2></div><div class="liste"><div class="li"><div class="t"><b>Login med link på mail</b><small>Ingen adgangskode at huske</small></div>${pille("groen", "Til")}</div></div></div>
        <div class="kort"><div class="kort-hoved"><h2>Log ud</h2></div><p class="not" style="margin-top:0">Har du mistet en telefon eller lånt en computer, så log ud alle steder.</p><button class="knap" data-act="log-ud-alle">Log ud alle steder</button></div></div>`,
      abonnement: `<div class="gitter g2"><div class="kort"><div class="kort-hoved"><h2>Dit abonnement</h2>${pille("groen", "Aktivt")}</div><div class="stort tal">1.000 <small>kr. om måneden, ekskl. moms</small></div><p class="not">Fast pris. Ubegrænset antal bilag og fakturaer. Ingen binding. Regnskabsprogrammet er med.</p></div>
        <div class="kort"><div class="kort-hoved"><h2>Tallo</h2></div><div class="li" style="border:0;padding:6px 0"><div class="t"><b>Registreringsnummer hos Erhvervsstyrelsen</b><small>Kommer, når registreringen er på plads</small></div>${pille("graa", "Afventer")}</div></div></div>`,
      data: `<div class="gitter g2"><div class="kort"><div class="kort-hoved"><h2>Dine data</h2></div><p class="not" style="margin-top:0">Alt, hvad du har bogført, tilhører dig. Vi sender det på mail samme dag.</p><button class="knap" data-act="bestil" data-hvad="Hele din bogføring">${IC.hent} Bestil hele din bogføring</button></div>
        <div class="kort"><div class="kort-hoved"><h2>Opbevaring</h2></div><div class="liste"><div class="li"><div class="t"><b>5 år</b><small>Bogføringen gemmes i 5 år efter regnskabsåret, som loven kræver, også hvis du stopper</small></div></div><div class="li"><div class="t"><b>Dine data ligger i EU</b><small>Krypteret, med daglig sikkerhedskopi hos en anden leverandør</small></div></div></div></div></div>`,
    };
    return `<div class="faner" role="tablist">${tabs.map(([k, t]) => `<button role="tab" aria-selected="${S.indTab === k}" data-act="indtab" data-t="${k}">${t}</button>`).join("")}</div><div style="margin-top:16px">${ind[S.indTab]}</div>`;
  }

  function konto() {
    return `<div class="gitter g2"><div class="kort"><div style="display:flex;gap:14px;align-items:center;margin-bottom:18px"><span class="logo-firma" style="width:56px;height:56px;border-radius:50%;font-size:18px;background:var(--accent)">${initialer(BRUGER.navn || BRUGER.mail)}</span><div><b style="font-size:18px">${E(BRUGER.navn || "")}</b><div class="not">${E(BRUGER.mail)}</div></div></div>
      <p class="not">Du er logget ind som ejer af ${E(V.navn)}.</p><div style="margin-top:16px;display:flex;gap:10px"><button class="knap" data-act="log-ud">Log ud</button></div></div>
      <div class="kort"><div class="kort-hoved"><h2>Brug for hjælp?</h2></div><div class="liste"><div class="li"><span class="ava-lille">OA</span><div class="t"><b>Skriv til Othman</b><small>Din bogholder. Svarer normalt samme dag.</small></div><button class="knap lille p" data-act="skriv">Skriv</button></div></div></div></div>`;
  }

  // ---------------------------------------------------------------- skuffer ----
  function skuffeT(t) {
    const [pc, pt] = ST[t.status], k = KILDE[t.kilde] || KILDE.bank, moms = t.moms === "25" ? Math.abs(t.beloeb) * 0.2 : 0;
    const handl = t.status === "spoergsmal" ? `<div class="kort" style="background:var(--roed-svag);box-shadow:none;margin:16px 0"><b>${E(t.spm)}</b><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="knap" data-act="svar" data-id="${t.id}" data-s="Til firmaet">Til firmaet</button><button class="knap" data-act="svar" data-id="${t.id}" data-s="Privat">Privat</button><button class="knap p" data-act="scan">Send kvittering</button></div></div>`
      : t.status === "mangler_kvittering" ? `<div class="dropzone" style="margin:16px 0"><div class="ikon">${IC.upload}</div><div style="flex:1"><b>Vi mangler kvitteringen</b><p>Træk den hertil, eller scan den med telefonen.</p></div><button class="knap p" data-act="scan">Scan den</button><button class="knap" data-act="ingen" data-id="${t.id}">Har ikke nogen</button></div>` : "";
    return `<div class="sh"><h2>${E(t.tekst)}</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <div style="display:flex;justify-content:space-between;align-items:flex-end"><div><div class="not">${F.datoLang(t.dato)} · ${k[2]}</div><div class="tal" style="font-size:30px;font-weight:600;letter-spacing:-.03em;color:${t.beloeb > 0 ? "var(--groen)" : "inherit"}">${t.beloeb > 0 ? "+" : ""}${F.kr(t.beloeb)} DKK</div></div>${pille(pc, pt)}</div>${handl}
      <div class="liste" style="margin:10px 0 18px"><div class="li"><div class="t not">Kategori</div>${pille("kat", E(t.kat))}</div><div class="li"><div class="t not">Konto</div><span>${E(T.konti.find((x) => x.id === t.konto).navn)}</span></div><div class="li"><div class="t not">Moms</div><span class="tal">${moms ? F.kr(moms) + " DKK (25 %)" : "Ingen moms"}</span></div>${t.bilag ? `<div class="li"><div class="t not">Bilag</div><span>Nr. ${t.bilag}</span></div>` : ""}</div>
      ${t.hvorfor && t.status === "bogfoert" ? `<div class="kort" style="background:var(--accent-svag);box-shadow:none;margin-bottom:18px"><b style="font-size:13.5px">Hvorfor er den bogført sådan?</b><div class="not" style="margin-top:4px">${E(t.hvorfor)}</div></div>` : ""}
      <div class="felt" style="margin-top:14px"><label for="besked">${t.status === "spoergsmal" ? "Skriv dit svar" : "Skriv til Tallo om denne betaling"}</label><textarea class="inp" id="besked" placeholder="Fx: Det her var til julegaver til personalet."></textarea></div></div>
      <div class="sf"><button class="knap" data-act="luk">Luk</button><div style="display:flex;gap:8px"><button class="knap" data-act="scan">${IC.papir} Vedhæft bilag</button><button class="knap p" data-act="send-besked">Send</button></div></div>`;
  }
  function skuffeF(f) {
    const [pc, pt] = fstat(f), ry = f.rykker || [];
    let forloeb = "";
    if (!f.betalt) {
      const sidste = ry.length ? ry[ry.length - 1].dato : f.forfald, naeste = ry.length ? plusDage(sidste, 10) : plusDage(f.forfald, 2), kan = naeste <= IDAG;
      const nummer = ry.filter((x) => x.gebyr).length + 1, gebyr = ry.length > 0;
      const trin = [["ok", "Sendt", F.datoLang(f.dato)], [f.forfald < IDAG ? "ok" : "nu", "Forfald", F.datoLang(f.forfald)], ...ry.map((x) => ["ok", x.type + (x.gebyr ? ` (+${x.gebyr} kr.)` : ""), "Sendt " + F.datoLang(x.dato)])];
      if (f.forfald < IDAG) trin.push(["nu", gebyr ? `Rykker ${nummer} med gebyr på 100 kr.` : "Venlig påmindelse", kan ? "Kan sendes nu" : `Kan sendes fra ${F.datoLang(naeste)}`]);
      forloeb = `<div class="kort" style="margin-top:16px"><div class="kort-hoved"><h2>Betaling</h2>${pille(pc, pt)}</div><ul class="tidslinje">${trin.map(([c, t, u]) => `<li class="${c}">${t}<small>${u}</small></li>`).join("")}</ul>
        ${f.forfald < IDAG ? `<button class="knap ${kan ? "p" : ""}" data-act="rykker" ${kan ? "" : "disabled aria-disabled=\"true\""}>${gebyr ? `Send rykker ${nummer} (+100 kr.)` : "Send venlig påmindelse"}</button><p class="not" style="font-size:12.5px;margin:8px 0 0">Renteloven: højst 100 kr. pr. rykker, højst tre rykkere, og mindst 10 dage imellem. Gebyret bogføres af sig selv.</p>` : ""}</div>`;
    }
    return `<div class="sh"><h2>Faktura ${f.nr}</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk" style="background:var(--lineal2)">${forloeb.replace('style="margin-top:16px"', 'style="margin-bottom:16px"')}${fakturaDok(f)}</div>
      <div class="sf"><div>${pille(pc, pt)}</div><div style="display:flex;gap:8px"><button class="knap" data-act="udskriv">${IC.hent} Udskriv</button><button class="knap" data-act="krediter" data-nr="${f.nr}">Krediter</button></div></div>`;
  }

  function skuffeTb(t) {
    const [pc, pt] = TBST[t.status], kan = t.status === "sendt" || t.status === "accepteret";
    return `<div class="sh"><h2>Tilbud ${t.nr}</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk" style="background:var(--lineal2)">${fakturaDok(t, "TILBUD")}</div>
      <div class="sf"><div>${pille(pc, pt)} <span class="not" style="margin-left:8px">${E(kunde(t.kunde).navn)}</span></div><div style="display:flex;gap:8px"><button class="knap" data-act="udskriv">${IC.hent} Udskriv</button>${kan ? `<button class="knap p" data-act="til-faktura" data-nr="${t.nr}">Gør til faktura</button>` : `<button class="knap" data-act="ny-f" data-k="${t.kunde}">Nyt tilbud</button>`}</div></div>`;
  }

  function skuffeU(u) {
    const skylder = u.status === "skylder";
    return `<div class="sh"><h2>${E(u.tekst)}</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <div style="display:flex;justify-content:space-between;align-items:flex-end"><div><div class="not">${F.datoLang(u.dato)} · betalt med egne penge</div><div class="tal" style="font-size:30px;font-weight:600;letter-spacing:-.03em">${F.kr(u.beloeb)} DKK</div></div>${skylder ? pille("accent", "Firmaet skylder dig") : pille("groen", "Tilbagebetalt")}</div>
      <div class="kort" style="background:var(--accent-svag);box-shadow:none;margin:16px 0">${skylder ? `<b>Sådan får du pengene tilbage</b><ol class="not" style="margin:8px 0 0;padding-left:18px"><li>Overfør ${F.kr(u.beloeb)} kr. fra firmaets driftskonto til din egen konto.</li><li>Skriv "Udlæg ${E(u.tekst.split(",")[0])}" i teksten.</li><li>Vi ser overførslen i banken og afstemmer den. Du skal ikke gøre mere.</li></ol>`
        : `<b>Tilbagebetalt ${F.datoLang(u.betalt_tilbage)}</b><div class="not" style="margin-top:4px">Overførslen fra firmaets konto er set i banken og afstemt.</div>`}</div>
      <div class="liste" style="margin-bottom:18px"><div class="li"><div class="t not">Kategori</div>${pille("kat", E(u.kat))}</div><div class="li"><div class="t not">Heraf moms</div><span class="tal">${F.kr(u.beloeb * 0.2)} DKK (fradrag til firmaet)</span></div></div>
      ${F.bon({ tekst: u.tekst, beloeb: -u.beloeb, moms: "25", dato: u.dato, bilag: "U" + u.id.slice(1) }, V)}</div>
      <div class="sf"><button class="knap" data-act="luk">Luk</button><button class="knap p" data-act="skriv">Skriv til Othman</button></div>`;
  }

  function skuffeKunde() {
    const k = S.nyKunde || {};
    return `<div class="sh"><h2>Ny kunde</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <div class="felt"><label for="cvr">CVR-nummer</label><div style="display:flex;gap:8px"><input class="inp" id="cvr" inputmode="numeric" placeholder="8 cifre" value="${E(k.cvr || "")}"><button class="knap p" data-act="cvr-op">Slå op</button></div><small class="not" style="font-size:12.5px">Navn og adresse hentes fra CVR-registeret. Privatkunder: lad feltet stå tomt.</small></div>
      <div class="gitter g2" style="margin-top:14px">${[["Navn", "navn"], ["Adresse", "adresse"], ["Postnr. og by", "by"], ["Mail til fakturaer", "mail"]].map(([l, f]) => `<div class="felt"><label>${l}</label><input class="inp" data-nk="${f}" value="${E(k[f] || "")}"></div>`).join("")}</div>
      <div class="felt" style="margin-top:14px"><label>EAN (kun offentlige kunder)</label><input class="inp" data-nk="ean" inputmode="numeric" placeholder="13 cifre"></div>
      ${k.fundet ? `<div class="not" style="margin-top:14px">${pille("groen", "Fundet i CVR")} Kan modtage e-faktura via Nemhandel.</div>` : ""}</div>
      <div class="sf"><button class="knap" data-act="luk">Annullér</button><button class="knap p" data-act="gem-kunde">Opret kunde</button></div>`;
  }

  function editor() {
    const e = S.ed, tb = e.type === "tilbud", f = regn(e), k = kunde(e.kunde);
    const sendes = tb ? "Sendes som PDF på mail" : k.ean ? "Sendes som e-faktura" : "Sendes som PDF på mail";
    return `<div class="sh"><div class="faner" role="tablist">${[["faktura", "Faktura"], ["tilbud", "Tilbud"]].map(([t, n]) => `<button role="tab" aria-selected="${e.type === t}" data-act="ed-type" data-t="${t}">${n}</button>`).join("")}</div><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div>
      <div class="sk" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:24px"><div id="edform"><div class="felt"><label for="ek" style="display:flex;justify-content:space-between">Kunde <a href="#" data-act="ny-kunde" style="color:var(--accent)">+ Ny kunde</a></label><select class="inp" id="ek" data-ed="kunde">${T.kunder.map((x) => `<option value="${x.id}" ${x.id === e.kunde ? "selected" : ""}>${E(x.navn)}</option>`).join("")}</select></div>
        <div class="gitter g2" style="margin-top:12px"><div class="felt"><label>Dato</label><input class="inp" value="${F.dato(IDAG)}" readonly></div><div class="felt"><label>${tb ? "Gælder i" : "Betalingsfrist"}</label><input class="inp" value="${tb ? 30 : V.betalingsfrist} dage" readonly></div></div>
        ${tb ? "" : `<div class="felt" style="margin-top:12px"><label for="eg">Gentag</label><select class="inp" id="eg" data-ed="gentag">${["Ikke gentaget", "Hver uge", "Hver måned", "Hvert kvartal"].map((g) => `<option ${e.gentag === g ? "selected" : ""}>${g}</option>`).join("")}</select></div>`}
        <div style="margin-top:16px" class="not">Linjer</div>${e.linjer.map((l, i) => `<div style="display:grid;grid-template-columns:minmax(0,1fr) 62px 90px 30px;gap:8px;margin-top:8px;align-items:center"><select class="inp" data-ed="vt" data-i="${i}" aria-label="Vare">${T.varetyper.map((v) => `<option value="${v.id}" ${v.id === l.vt ? "selected" : ""}>${E(v.navn)}</option>`).join("")}</select>
          <input class="inp tal" data-ed="antal" data-i="${i}" value="${l.antal}" inputmode="decimal" aria-label="Antal"><input class="inp tal" data-ed="pris" data-i="${i}" value="${l.pris}" inputmode="decimal" aria-label="Pris"><button class="ikonknap" data-act="fjern-l" data-i="${i}" aria-label="Fjern linje">${IC.luk}</button></div>`).join("")}
        <button class="knap lille" style="margin-top:10px" data-act="ny-l">${IC.plus} Tilføj linje</button>
        <div class="not" style="margin-top:20px;font-size:13px">${tb ? "Et tilbud bogføres ikke. Siger kunden ja, gør du det til en faktura med ét tryk." : "Moms og bogføring sættes op af sig selv. Når du sender, bogfører Tallo fakturaen."}</div></div>
        <div><div id="prev">${fakturaDok(f, tb ? "TILBUD" : "FAKTURA")}</div></div></div>
      <div class="sf"><button class="knap" data-act="luk">Annullér</button><div style="display:flex;align-items:center;gap:12px"><span class="not" id="sendt-som">${sendes}</span><button class="knap sort" data-act="send-f">${IC.send} ${tb ? "Send tilbud" : e.gentag && e.gentag !== "Ikke gentaget" ? "Send og gentag" : "Send faktura"}</button></div></div>`;
  }
  // ---------------------------------------------------------------- skal/rendering ----
  const n_aabne = () => aabne().length;
  const hilsen = () => (S.route === "overblik" && V.ejer ? `Hej ${V.ejer}` : TITEL[S.route]);
  function skal(indhold) {
    const akt = S.route === "overblik" || S.route === "transaktioner" || S.route === "udgifter" ? `<button class="knap p" data-act="scan">${IC.upload} Send bilag</button>`
      : S.route === "salg" ? ({ tilbud: `<button class="knap p" data-act="ny-tb">${IC.plus} Nyt tilbud</button>`, abonnementer: `<button class="knap p" data-act="nyt-abon">${IC.plus} Nyt abonnement</button>`,
        kunder: `<button class="knap p" data-act="ny-kunde">${IC.plus} Ny kunde</button>` }[S.salgTab] || `<button class="knap p" data-act="ny-f">${IC.plus} Ny faktura</button>`) : "";
    const li = (r, n) => `<a href="#${r}" ${S.route === r ? 'aria-current="page"' : ""}>${IC[r === "konto" ? "konto" : r] || IC.check}<span>${n}</span>${r === "transaktioner" && n_aabne() ? `<span class="tael">${n_aabne()}</span>` : ""}${r === "godkend" && (S.ind || []).length ? `<span class="tael">${S.ind.length}</span>` : ""}</a>`;
    const mere = ["udgifter", "likviditet", "rapporter", "moms", "integrationer", "indstillinger", "konto"];
    const logo = `<span class="logo-firma" style="background:${E(V.farve)}">${initialer(V.kort)}</span>`;
    return `<div class="app"><aside class="side"><button class="firma" data-act="skift">${logo}<span style="flex:1;min-width:0"><b>${E(V.kort)}</b><small>CVR ${E(V.cvr)}</small></span>${FIRMAER.length > 1 ? IC.ned.replace("<svg", '<svg width="16" height="16"') : ""}</button>
      <nav aria-label="Hovedmenu">${(selv() ? [["godkend", "Godkend"], ...NAV] : NAV).map(([r, n]) => li(r, n)).join("")}</nav>
      <div class="bogholder-kort"><div class="hoved"><span class="ava">OA</span><div><b>Din bogholder: Othman</b><small>${E(T.bogholder.tekst)}</small></div></div><button class="skriv" data-act="skriv">${IC.chat.replace("<svg", '<svg width="14" height="14" style="vertical-align:-2px;margin-right:6px"')}Skriv til Othman</button></div>
      <div class="undermenu">${UNDER.map(([r, n]) => li(r, n)).join("")}</div></aside>
      <main class="main" id="main"><header class="top"><button class="mob-firma" data-act="skift" aria-label="Virksomhed">${logo.replace('class="logo-firma"', 'class="logo-firma" style="width:32px;height:32px;font-size:12px"')}</button><h1>${E(hilsen())}</h1><div class="hoejre-side">${akt}</div></header><div class="sider" id="sider">${V.aaben ? "" : `<div class="kort" style="margin-bottom:16px;background:var(--accent-svag);box-shadow:none"><b>Din konto er oprettet.</b> Vi åbner den, når vores program er registreret hos Erhvervsstyrelsen, og skriver til dig samme dag. Du betaler intet, før vi åbner.</div>`}${indhold}</div></main></div>
      <nav class="bundnav" aria-label="Menu"><a href="#overblik" ${S.route === "overblik" ? 'aria-current="page"' : ""}>${IC.overblik}<span>Overblik</span></a><a href="#transaktioner" ${S.route === "transaktioner" ? 'aria-current="page"' : ""}>${IC.transaktioner}<span>Betalinger</span>${n_aabne() ? `<i class="tael">${n_aabne()}</i>` : ""}</a>
      <button class="fab" data-act="scan" aria-label="Send bilag">${IC.scan}</button><a href="#salg" ${S.route === "salg" ? 'aria-current="page"' : ""}>${IC.salg}<span>Fakturaer</span></a><button data-act="mere" class="${mere.includes(S.route) ? "aktiv" : ""}">${IC.mere}<span>Mere</span></button></nav>`;
  }
  const VIEWS = { godkend, overblik, transaktioner, salg, udgifter, likviditet, rapporter, moms, integrationer, indstillinger, konto };
  function render() {
    if (!T) return;
    document.getElementById("app").innerHTML = skal(VIEWS[S.route]());
    document.title = hilsen() + " · Tallo";
    let h = "";
    if (S.drawer) {
      const d = S.drawer, bred = d.type === "ed";
      const indh = d.type === "t" ? skuffeT(T.transaktioner.find((x) => x.id === d.id)) : d.type === "f" ? skuffeF(T.fakturaer.find((x) => x.nr === d.nr))
        : d.type === "tb" ? skuffeTb(T.tilbud.find((x) => x.nr === d.nr)) : d.type === "u" ? skuffeU(T.udlaeg.find((x) => x.id === d.id))
        : d.type === "kunde" ? skuffeKunde() : d.type === "ku" ? skuffeKontoudtog(d.ku) : d.type === "ed" ? editor() : skuffeBesked();
      h += `<div class="slor" data-act="luk"></div><aside class="skuffe ${bred ? "bred" : ""}" role="dialog" aria-modal="true" aria-label="Detaljer">${indh}</aside>`;
    }
    if (S.mere) {
      const m = [...(selv() ? [["godkend", "Godkend"]] : []), ["udgifter", "Udgifter"], ["likviditet", "Likviditet"], ["rapporter", "Rapporter"], ["moms", "Moms og skat"], ["integrationer", "Integrationer"], ["indstillinger", "Indstillinger"], ["konto", "Min konto"]];
      h += `<div class="slor" data-act="luk"></div><div class="ark" role="dialog" aria-label="Mere"><div class="greb"></div>${m.map(([r, n]) => `<a href="#${r}" data-act="luk">${IC[r] || IC.check}<span>${n}</span></a>`).join("")}</div>`;
    }
    if (S.scan) h += scanHtml();
    const lag = document.getElementById("lag");
    lag.innerHTML = h;
    document.body.classList.toggle("har-lag", !!(S.drawer || S.scan || S.mere));
    const sk = lag.querySelector(".skuffe"); if (sk) { const f = sk.querySelector("textarea, input, select, button"); if (f && !S.keepFocus) f.focus(); }
  }
  function skuffeBesked() {
    return `<div class="sh"><h2>Skriv til Othman</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk"><div class="li" style="display:flex;gap:12px;align-items:center"><span class="ava-lille" style="width:44px;height:44px">OA</span><div><b>Othman, din bogholder</b><div class="not">Svarer normalt samme dag.</div></div></div>
      <div class="felt" style="margin-top:18px"><label for="besked">Din besked</label><textarea class="inp" id="besked" style="min-height:140px" placeholder="Skriv her."></textarea></div></div>
      <div class="sf"><button class="knap" data-act="luk">Annullér</button><button class="knap p" data-act="send-besked">Send</button></div>`;
  }
  function skuffeKontoudtog(ku) {
    return `<div class="sh"><h2>Kontoudtog: ${E(ku.kunde)}</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <table class="vtabel"><thead><tr><th>Dato</th><th style="text-align:left">Hvad</th><th>Beløb</th></tr></thead><tbody>${ku.linjer.map((l) => `<tr><td>${F.dato(l.dato)}</td><td style="text-align:left">${E(l.tekst)}</td><td>${F.kr(l.beloeb)}</td></tr>`).join("")}
      <tr class="sum"><td></td><td style="text-align:left">${ku.saldo > 0 ? "Kunden skylder" : "Saldo"}</td><td>${F.kr(ku.saldo)}</td></tr></tbody></table></div>
      <div class="sf"><button class="knap" data-act="luk">Luk</button><button class="knap p" data-act="udskriv">${IC.hent} Udskriv</button></div>`;
  }
  function scanHtml() {
    const filer = S.upload || [];
    return `<div class="slor" data-act="luk"></div><aside class="skuffe" role="dialog" aria-modal="true" aria-label="Send bilag"><div class="sh"><h2>Send bilag</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <label class="dropzone" style="cursor:pointer"><div class="ikon">${IC.scan}</div><div style="flex:1"><b>Tag billede eller vælg filer</b><p>Kvitteringer og fakturaer som billede eller PDF. Vi læser dem og bogfører dem.</p></div>
        <input type="file" id="filer" accept="image/*,application/pdf" capture="environment" multiple class="sr"></label>
      <div class="li" style="display:flex;gap:12px;align-items:center;margin-top:16px"><div class="t" style="flex:1"><b>Betalt med egne penge</b><small class="not" style="display:block">Så skylder firmaet dig beløbet, og vi skriver det på forsiden</small></div><button class="sw" role="switch" aria-checked="${!!S.egne}" aria-label="Betalt med egne penge" data-act="egne"></button></div>
      ${filer.length ? `<div class="liste" style="margin-top:12px">${filer.map((u) => `<div class="li"><div class="t"><b>${E(u.navn)}</b><small>${E(u.tekst)}</small></div>${pille(u.farve, u.status)}</div>`).join("")}</div>` : ""}
      <p class="not" style="margin-top:16px;font-size:13px">Regninger, du får på mail, kan du sende videre til <b class="mono">${E(V.bilagsadresse)}</b>.</p></div>
      <div class="sf"><button class="knap" data-act="luk">Færdig</button></div></aside>`;
  }

  // ------------------------------------------------------------- data og login ----
  async function hent() {
    T = await rpc("kunde_data", { p_virksomhed: VID });
    V = T.virksomhed; IDAG = T.idag;
    if (!V.ejer) V.ejer = BRUGER.navn || "";
    S.bank = await rpc("bankforbindelse_status", { p_virksomhed: VID }).catch(() => []);
    const { data: px } = await sb.from("virksomhed").select("pakke, aaben").eq("id", VID).single();
    V.pakke = px?.pakke || "fuld"; V.aaben = px?.aaben !== false;
    if (V.pakke === "selv") {
      S.ind = V.aaben ? await rpc("kunde_indbakke", { p_virksomhed: VID }) : [];
      if (!S.kat) {
        const [{ data: ko }, { data: kk }] = await Promise.all([
          sb.from("konto").select("nummer, navn, type, momskode, standardkonto, funktion").eq("virksomhed_id", VID).order("nummer").limit(2000),
          sb.from("kundekategori").select("standardkonto, navn")]);
        const kat = new Map((kk || []).map((k) => [k.standardkonto, k.navn]));
        S.kat = (ko || []).map((k) => ({ ...k, kat: kat.get(k.standardkonto) || null }));
      }
    }
    const ki = T.kvartaler.indexOf(aktueltKvartal()); S.momsK = ki < 0 ? 0 : ki;
  }
  async function opdater(tekst) {
    await hent(); render();
    if (tekst) F.toast(tekst);
  }
  function loginSide(besked = "") {
    document.getElementById("lag").innerHTML = "";
    document.getElementById("app").innerHTML = `<main class="login"><div class="kort"><div class="logo-ord">tallo</div><h1>Log ind</h1>
      <p class="not">Skriv din mail, så sender vi et link. Du skal ikke huske en adgangskode. Ny hos Tallo? Så opretter du dig bagefter på 2 minutter.</p>
      <form id="login"><div class="felt"><label for="mail">Mail</label><input class="inp" id="mail" type="email" autocomplete="email" required></div>
      ${LOKALT || DEMO ? `<div class="felt" style="margin-top:12px"><label for="kode">${DEMO ? "Adgangskode (kun i demoen)" : "Adgangskode (kun lokalt, til test)"}</label><input class="inp" id="kode" type="password" autocomplete="current-password"></div>` : ""}
      ${DEMO ? `<p class="not" style="font-size:13px;margin-top:10px;background:var(--accent-svag);padding:10px 12px;border-radius:10px">Demo med et opdigtet bageri. Log ind med <b>mette@bageriet-kornet.dk</b> og koden <b>demo-kode-1234</b>.</p>` : ""}
      <button class="knap p" style="margin-top:16px;width:100%;justify-content:center" type="submit">${DEMO ? "Log ind" : "Send link"}</button></form>
      ${besked ? `<p class="not" role="status" style="margin-top:14px">${E(besked)}</p>` : ""}</div></main>`;
    document.getElementById("login").addEventListener("submit", async (e) => {
      e.preventDefault();
      const mail = document.getElementById("mail").value.trim(), kode = document.getElementById("kode")?.value;
      if (kode) {
        const { error } = await sb.auth.signInWithPassword({ email: mail, password: kode });
        return error ? loginSide("Forkert mail eller kode.") : start();
      }
      const { error } = await sb.auth.signInWithOtp({ email: mail, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
      loginSide(error ? "Vi kunne ikke sende linket. Er det den mail, du er kunde med?" : `Vi har sendt et link til ${mail}. Åbn det på denne enhed.`);
    });
  }
  // Opstart på 2 minutter: CVR, navn, pakke. Kontoen er lukket, til Tallo åbner den.
  function tilmeldSide(besked = "", t = {}) {
    document.getElementById("lag").innerHTML = "";
    const pk = (v, navn, pris, tekst) => `<label class="li" style="display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid var(--lineal);border-radius:12px;margin-top:8px;cursor:pointer">
      <input type="radio" name="pakke" value="${v}" ${(t.pakke || "fuld") === v ? "checked" : ""} style="margin-top:4px"><div><b>${navn}, ${pris} kr. om måneden</b><br><small class="not">${tekst}</small></div></label>`;
    document.getElementById("app").innerHTML = `<main class="login"><div class="kort" style="width:min(480px,100%)"><div class="logo-ord">tallo</div><h1>Kom i gang</h1>
      <p class="not">Det tager 2 minutter. Vi åbner, når vores program er registreret hos Erhvervsstyrelsen, og du betaler intet før.</p>
      <form id="tilmeld"><div class="felt"><label for="t-cvr">CVR-nummer</label><div style="display:flex;gap:8px"><input class="inp" id="t-cvr" inputmode="numeric" autocomplete="off" value="${E(t.cvr || "")}" required><button class="knap" type="button" data-act="t-cvr-op">Slå op</button></div></div>
      <div class="felt" style="margin-top:12px"><label for="t-navn">Virksomhedens navn</label><input class="inp" id="t-navn" value="${E(t.navn || "")}" required></div>
      <input type="hidden" id="t-vej" value="${E(t.vej || "")}"><input type="hidden" id="t-husnr" value="${E(t.husnr || "")}"><input type="hidden" id="t-postnr" value="${E(t.postnr || "")}"><input type="hidden" id="t-by" value="${E(t.by || "")}">
      <fieldset style="border:0;padding:0;margin:16px 0 0"><legend class="not" style="font-size:13px">Vælg pakke. Du kan skifte, når du vil.</legend>
        ${pk("selv", "Med AI", 349, "Du godkender med ét tryk; AI'en foreslår, hvor dine bilag skal hen.")}
        ${pk("fuld", "Med bogholder", 799, "Vi bogfører det hele og indberetter momsen.")}</fieldset>
      <button class="knap p" style="margin-top:16px;width:100%;justify-content:center" type="submit">Opret din konto</button></form>
      ${besked ? `<p class="not" role="status" style="margin-top:14px">${E(besked)}</p>` : ""}
      <p class="not" style="font-size:12.5px;margin-top:14px">Logget ind som ${E(BRUGER?.mail || "")}. <a href="#" data-act="logud" style="color:var(--accent)">Log ud</a></p></div></main>`;
    document.getElementById("tilmeld").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = (id) => (document.getElementById(id)?.value || "").trim();
      const navn = v("t-navn"), pakke = document.querySelector('input[name="pakke"]:checked')?.value || "fuld";
      try {
        await rpc("opret_egen_virksomhed", { p_cvr: v("t-cvr"), p_navn: navn, p_pakke: pakke, p_klasse: /\b(ApS|A\/S|IVS|P\/S)$/i.test(navn) ? "B" : "A",
          p_vej: v("t-vej") || null, p_husnr: v("t-husnr") || null, p_postnr: v("t-postnr") || null, p_by: v("t-by") || null });
        start();
      } catch (err) { tilmeldSide(err.message, { cvr: v("t-cvr"), navn, pakke }); }
    });
  }

  async function start() {
    const ses = await session();
    if (!ses) return loginSide();
    const u = ses.user;
    BRUGER = { mail: u.email, navn: u.user_metadata?.fornavn || "" };
    try {
      FIRMAER = await virksomheder();
      if (!FIRMAER.length) return tilmeldSide();
      VID = localStorage.getItem("tallo-virksomhed");
      if (!FIRMAER.some((x) => x.virksomhed_id === VID)) VID = FIRMAER[0].virksomhed_id;
      await hent();
    } catch (err) {
      document.getElementById("app").innerHTML = `<main class="login"><div class="kort"><h1>Noget gik galt</h1><p class="not">${E(err.message)}</p><button class="knap" data-act="genindlaes">Prøv igen</button></div></main>`;
      return;
    }
    rute();
  }

  // ------------------------------------------------------------- haendelser ----
  function aabn(d) { S.drawer = d; S.mere = false; render(); }
  function luk() { S.drawer = null; S.mere = false; S.scan = false; S.upload = []; render(); }
  const tekstfelt = () => (document.getElementById("besked")?.value || "").trim();
  const HVOR = { "Hver uge": ["uge", 7], "Hver måned": ["maaned", 30], "Hvert kvartal": ["kvartal", 91] };

  async function handling(a, el, e) {
    const id = el.dataset.id;
    if (a === "t-cvr-op") {
      const cvr = (document.getElementById("t-cvr").value || "").replace(/\D/g, "");
      const { data, error } = await sb.functions.invoke("cvr", { body: { cvr } });
      const navn = document.getElementById("t-navn").value;
      if (error || !data?.navn) {
        let msg = "Vi kunne ikke slå CVR-nummeret op. Skriv navnet selv.";
        try { msg = (await error.context.json()).fejl || msg; } catch { /* ingen detalje */ }
        return F.toast(msg);
      }
      return tilmeldSide("Fundet i CVR-registeret.", { cvr, navn: data.navn, vej: data.adresse_vej, husnr: data.adresse_husnr, postnr: data.adresse_postnr, by: data.adresse_by,
        pakke: document.querySelector('input[name="pakke"]:checked')?.value || "fuld" });
    }
    if (a === "godkend-selv" || a === "afvis-selv") {
      const x = (S.ind || []).find((y) => y.id === id), f = x.forslag || {};
      if (a === "afvis-selv") {
        await rpc("kunde_afvis_bilag", { p_bilag: id, p_begrundelse: "Ikke et bilag (afvist af kunden)" });
        return opdater("Fjernet");
      }
      const nr = document.getElementById("kat-" + id)?.value || f.konto;
      if (!nr) return F.toast("Vælg en kategori først.");
      const k = (S.kat || []).find((y) => y.nummer === nr), mk = nr === f.konto && f.momskode ? f.momskode : k?.momskode || null;
      if (x.type === "bank") {
        await rpc("kunde_bogfoer_banklinje", { p_banktransaktion: id, p_konto: nr, p_momskode: mk });
      } else {
        const lev = (S.kat || []).find((y) => y.type === "status" && /leverandører af varer.*kortfristet/i.test(y.navn))?.nummer;
        const ejer = (S.kat || []).find((y) => y.funktion === "ejer")?.nummer;
        await rpc("kunde_bogfoer_bilag", { p_bilag: id, p_konto: nr, p_momskode: mk, p_banktransaktion: f.banktransaktion_id || null,
          p_modkonto: f.banktransaktion_id ? null : f.udlaeg ? ejer : lev });
      }
      return opdater(`Godkendt: ${x.tekst} som ${KATNAVN(nr)}`);
    }
    if (a === "send-f") {
      const ed = S.ed, k = kunde(ed.kunde);
      const linjer = ed.linjer.map((l) => ({ varetype: l.vt, antal: +l.antal || 1, enhedspris: +l.pris || 0 }));
      if (ed.type === "tilbud") {
        const t = await rpc("opret_tilbud", { p_virksomhed: VID, p_debitor: ed.kunde, p_linjer: linjer });
        const r = await rpc("send_tilbud", { p_tilbud: t });
        S.drawer = null; S.salgTab = "tilbud"; location.hash = "salg";
        return opdater(`Tilbud T-${r.nummer} er lagt klar til ${k.navn}`);
      }
      const f = await rpc("kunde_opret_faktura", { p_virksomhed: VID, p_debitor: ed.kunde, p_linjer: linjer });
      const r = await rpc("kunde_send_faktura", { p_faktura: f });
      let tekst = `Faktura ${r.nummer} er udstedt og sendes ${r.sendt_som === "efaktura" ? "som e-faktura" : "som PDF på mail"}`;
      if (HVOR[ed.gentag]) {
        await rpc("opret_abonnement", { p_virksomhed: VID, p_debitor: ed.kunde, p_linjer: linjer, p_hvor_ofte: HVOR[ed.gentag][0], p_start: plusDage(IDAG, HVOR[ed.gentag][1]) });
        tekst += `, og den gentages ${ed.gentag.toLowerCase()}`; S.salgTab = "abonnementer";
      } else S.salgTab = "fakturaer";
      S.drawer = null; location.hash = "salg";
      return opdater(tekst);
    }
    if (a === "til-faktura") {
      const t = T.tilbud.find((x) => x.nr === el.dataset.nr);
      if (!confirm(`Lav en faktura på ${F.kr(t.total)} kr. til ${kunde(t.kunde).navn} og send den?`)) return;
      const f = await rpc("tilbud_til_faktura", { p_tilbud: t.id });
      const r = await rpc("kunde_send_faktura", { p_faktura: f });
      S.drawer = null; S.salgTab = "fakturaer";
      return opdater(`Faktura ${r.nummer} er lavet ud fra tilbud ${t.nr} og sendt`);
    }
    if (a === "rykker") {
      const f = T.fakturaer.find((x) => x.nr === S.drawer.nr), gebyr = (f.rykker || []).length > 0;
      await rpc("send_rykker", { p_faktura: f.id, p_gebyr: gebyr });
      return opdater(gebyr ? "Rykkeren er sendt med et gebyr på 100 kr." : "Påmindelsen er sendt");
    }
    if (a === "krediter") {
      const f = T.fakturaer.find((x) => x.nr === +el.dataset.nr);
      if (!confirm(`Lav en kreditnota på hele faktura ${f.nr} og send den til ${kunde(f.kunde).navn}? En sendt faktura kan ikke ændres.`)) return;
      const k = await rpc("kunde_krediter", { p_faktura: f.id });
      const r = await rpc("kunde_send_faktura", { p_faktura: k });
      S.drawer = null;
      return opdater(`Kreditnota ${r.nummer} er sendt`);
    }
    if (a === "svar") {
      const { data } = await sb.from("spoergsmaal").select("id").eq("banktransaktion_id", id).eq("status", "aaben").limit(1);
      if (!data?.length) return F.toast("Spørgsmålet er allerede besvaret");
      await rpc("besvar_spoergsmaal", { p_spoergsmaal: data[0].id, p_svar: el.dataset.s });
      S.drawer = null;
      return opdater("Tak. Vi bogfører den ud fra dit svar.");
    }
    if (a === "ingen") {
      await rpc("send_besked", { p_virksomhed: VID, p_tekst: "Har ikke nogen kvittering", p_banktransaktion: id });
      S.drawer = null;
      return opdater("Tak. Vi har noteret, at der ikke er en kvittering.");
    }
    if (a === "send-besked") {
      const tekst = tekstfelt(); if (!tekst) return F.toast("Skriv en besked først");
      const t = S.drawer?.type === "t" ? T.transaktioner.find((x) => x.id === S.drawer.id) : null;
      if (t?.status === "spoergsmal") {
        const { data } = await sb.from("spoergsmaal").select("id").eq("banktransaktion_id", t.id).eq("status", "aaben").limit(1);
        if (data?.length) { await rpc("besvar_spoergsmaal", { p_spoergsmaal: data[0].id, p_svar: tekst }); S.drawer = null; return opdater("Tak for svaret."); }
      }
      await rpc("send_besked", { p_virksomhed: VID, p_tekst: tekst, p_banktransaktion: t?.id || null });
      S.drawer = null; render();
      return F.toast("Beskeden er sendt til Othman");
    }
    if (a === "cvr-op") {
      const cvr = (document.getElementById("cvr").value || "").replace(/\D/g, "");
      const { data, error } = await sb.functions.invoke("cvr", { body: { cvr } });
      if (error || !data?.navn) {
        let msg = "CVR-nummeret blev ikke fundet. Udfyld selv.";
        try { msg = (await error.context.json()).fejl || msg; } catch { /* ingen detalje */ }
        S.nyKunde = { cvr }; render(); return F.toast(msg);
      }
      S.nyKunde = { cvr, navn: data.navn, adresse: [data.adresse_vej, data.adresse_husnr].filter(Boolean).join(" "), by: [data.adresse_postnr, data.adresse_by].filter(Boolean).join(" "), fundet: true };
      render(); return F.toast("Fundet i CVR-registeret");
    }
    if (a === "gem-kunde") {
      const v = (f) => (document.querySelector(`[data-nk="${f}"]`)?.value || "").trim();
      if (!v("navn")) return F.toast("Skriv et navn, eller slå CVR-nummeret op");
      const [postnr, ...by] = v("by").split(" ");
      const { data, error } = await sb.from("debitor").insert({ virksomhed_id: VID, navn: v("navn"), cvr: S.nyKunde?.cvr || null, adresse_vej: v("adresse") || null,
        adresse_postnr: /^\d{4}$/.test(postnr) ? postnr : null, adresse_by: by.join(" ") || (/^\d{4}$/.test(postnr) ? null : v("by")) || null, email: v("mail") || null, ean: v("ean").replace(/\D/g, "") || null }).select("id").single();
      if (error) throw new Fejl(error.code === "23514" ? (/ean/.test(error.message) ? "EAN skal være 13 cifre." : "CVR-nummeret er ikke gyldigt.") : error.message);
      if (S.ed) { S.ed.kunde = data.id; S.drawer = { type: "ed" }; } else { S.drawer = null; S.salgTab = "kunder"; }
      return opdater(`${v("navn")} er oprettet`);
    }
    if (a === "kontoudtog") { const ku = await rpc("kontoudtog", { p_debitor: el.dataset.k }); return aabn({ type: "ku", ku }); }
    if (a === "farve") { await rpc("saet_fakturadesign", { p_virksomhed: VID, p_farve: el.dataset.farve }); return opdater("Farven er gemt"); }
    if (a === "sw-rykker") { await rpc("saet_indstillinger", { p_virksomhed: VID, p_auto_paamindelse: !V.auto_paamindelse }); return opdater(V.auto_paamindelse ? "Påmindelser er slået fra" : "Påmindelser er slået til"); }
    if (a === "bestil") {
      await rpc("send_besked", { p_virksomhed: VID, p_tekst: `Send mig venligst: ${el.dataset.hvad}` });
      return F.toast("Tak. Vi sender den på mail i dag.");
    }
    if (a === "bank") {
      await rpc("send_besked", { p_virksomhed: VID, p_tekst: "Jeg vil gerne koble banken til (eller forny samtykket)." });
      return F.toast("Tak. Vi sender dig et link til banken.");
    }
  }

  document.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    const a = el.dataset.act, id = el.dataset.id;
    if (a === "genindlaes") return location.reload();
    if (a === "logud") { e.preventDefault(); return logUd(); }
    if (a === "t-cvr-op") return handling(a, el, e).catch((err) => F.toast(err.message));
    if (!T) return;
    if (a === "luk") { if (el.tagName === "A") { S.mere = false; S.drawer = null; render(); return; } return luk(); }
    if (a === "aabn-t") return aabn({ type: "t", id });
    if (a === "aabn-f") return aabn({ type: "f", nr: +el.dataset.nr });
    if (a === "skriv") return aabn({ type: "besked" });
    if (a === "ny-f" || a === "ny-tb" || a === "nyt-abon") {
      if (!T.varetyper.length) return F.toast("Du har ingen varer endnu. Skriv til os, så sætter vi dem op.");
      const vt = T.varetyper[0];
      S.ed = { type: a === "ny-tb" ? "tilbud" : "faktura", gentag: a === "nyt-abon" ? "Hver måned" : "Ikke gentaget", kunde: el.dataset.k || T.kunder[0]?.id, linjer: [{ vt: vt.id, antal: 1, pris: vt.pris }] };
      if (!S.ed.kunde) { S.nyKunde = {}; return aabn({ type: "kunde" }); }
      return aabn({ type: "ed" });
    }
    if (a === "ed-type") { S.ed.type = el.dataset.t; return render(); }
    if (a === "aabn-tb") return aabn({ type: "tb", nr: el.dataset.nr });
    if (a === "aabn-u") return aabn({ type: "u", id });
    if (a === "ny-kunde") { e.preventDefault(); S.nyKunde = {}; return aabn({ type: "kunde" }); }
    if (a === "egne") { S.egne = !S.egne; return render(); }
    if (a === "filter-gaa") { if (e.target.closest("button")) return; S.filter = el.dataset.f; S.sideN = 30; if (location.hash === "#transaktioner") return render(); location.hash = "transaktioner"; return; }
    if (a === "scan") { S.drawer = null; S.mere = false; S.scan = true; S.upload = []; return render(); }
    if (a === "mere") { S.mere = !S.mere; return render(); }
    if (a === "filter") { S.filter = el.dataset.f; S.sideN = 30; return render(); }
    if (a === "flere") { S.sideN += 30; return render(); }
    if (a === "salgtab") { S.salgTab = el.dataset.t; return render(); }
    if (a === "indtab") { S.indTab = el.dataset.t; return render(); }
    if (a === "momsk") { S.momsK = +el.dataset.i; return render(); }
    if (a === "udskriv") return window.print();
    if (a === "kopier") { await navigator.clipboard?.writeText(V.bilagsadresse); return F.toast("Bilagsadressen er kopieret"); }
    if (a === "log-ud") return logUd();
    if (a === "log-ud-alle") { await sb.auth.signOut({ scope: "global" }); return location.reload(); }
    if (a === "skift") {
      if (FIRMAER.length < 2) return F.toast("Du har én virksomhed hos Tallo");
      const i = FIRMAER.findIndex((x) => x.virksomhed_id === VID); VID = FIRMAER[(i + 1) % FIRMAER.length].virksomhed_id;
      localStorage.setItem("tallo-virksomhed", VID); return opdater(`Skiftet til ${FIRMAER.find((x) => x.virksomhed_id === VID).virksomhed.navn}`);
    }
    if (a === "ny-l") { const vt = T.varetyper[0]; S.ed.linjer.push({ vt: vt.id, antal: 1, pris: vt.pris }); S.keepFocus = true; render(); S.keepFocus = false; return; }
    if (a === "fjern-l") { if (S.ed.linjer.length > 1) S.ed.linjer.splice(+el.dataset.i, 1); S.keepFocus = true; render(); S.keepFocus = false; return; }
    el.disabled = true;
    try { await handling(a, el, e); } catch (err) { F.toast(err instanceof Fejl ? err.message : "Noget gik galt: " + err.message); } finally { el.disabled = false; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (S.drawer || S.mere || S.scan)) return luk();
    if ((e.key === "Enter" || e.key === " ") && e.target.matches('[data-act="filter-gaa"]')) { e.preventDefault(); e.target.click(); return; }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"][tabindex]')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener("input", (e) => {
    if (e.target.id === "q") { S.q = e.target.value; S.sideN = 30; document.getElementById("trliste").innerHTML = trListe(); return; }
    const ed = e.target.dataset.ed; if (!ed || !S.ed) return;
    const i = +e.target.dataset.i;
    if (ed === "gentag") { S.ed.gentag = e.target.value; S.keepFocus = true; render(); S.keepFocus = false; return; }
    if (ed === "kunde") S.ed.kunde = e.target.value;
    else if (ed === "vt") { S.ed.linjer[i].vt = e.target.value; S.ed.linjer[i].pris = T.varetyper.find((v) => v.id === e.target.value).pris; const p = document.querySelector(`[data-ed="pris"][data-i="${i}"]`); if (p) p.value = S.ed.linjer[i].pris; }
    else S.ed.linjer[i][ed] = e.target.value.replace(",", ".");
    document.getElementById("prev").innerHTML = fakturaDok(regn(S.ed), S.ed.type === "tilbud" ? "TILBUD" : "FAKTURA");
    const k = kunde(S.ed.kunde); document.getElementById("sendt-som").textContent = S.ed.type !== "tilbud" && k.ean ? "Sendes som e-faktura" : "Sendes som PDF på mail";
  });
  document.addEventListener("change", async (e) => {
    if (e.target.id === "rapp") { S.rapP = e.target.value; return render(); }
    if (e.target.id === "frist") {
      try { await rpc("saet_indstillinger", { p_virksomhed: VID, p_betalingsfrist: +e.target.value }); await opdater("Betalingsfristen er gemt"); }
      catch (err) { F.toast(err.message); }
      return;
    }
    if (e.target.id === "filer") {
      const filer = [...e.target.files]; S.upload = filer.map((f) => ({ navn: f.name, tekst: "Sendes", status: "Sendes", farve: "graa" })); render();
      let ok = 0;
      for (const [i, fil] of filer.entries()) {
        try {
          const r = await sendBilag(VID, fil, !!S.egne);
          S.upload[i] = { navn: fil.name, tekst: r.dublet ? "Den har vi allerede fået" : "Modtaget. Vi læser den nu.", status: r.dublet ? "Allerede modtaget" : "Modtaget", farve: "groen" };
          ok += r.dublet ? 0 : 1;
        } catch (err) {
          S.upload[i] = { navn: fil.name, tekst: err.message, status: "Fejl", farve: "roed" };
        }
        render();
      }
      if (ok) { await hent(); render(); F.toast(`Tak. Vi har fået ${ok} bilag.`); }
    }
  });
  function rute() { const r = location.hash.slice(1); if (VIEWS[r]) { S.route = r; S.drawer = null; S.mere = false; window.scrollTo(0, 0); } render(); }
  window.addEventListener("hashchange", rute);
  sb.auth.onAuthStateChange((hvad) => { if (hvad === "SIGNED_OUT") { T = null; loginSide(); } });

  const lag = document.createElement("div"); lag.id = "lag"; document.body.appendChild(lag);
  const app = document.createElement("div"); app.id = "app"; document.body.insertBefore(app, lag);
  start();
