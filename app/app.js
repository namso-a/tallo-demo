// Tallos app til kunden: computer og telefon. Skærmene er de godkendte fra mockuppen (system/design/platform);
// data kommer fra kunde_data(), og hver handling kalder en funktion i databasen, der selv tjekker adgang og regler.
import { DEMO, Fejl, LOKALT, logUd, rpc, sb, sendBilag, session, virksomheder } from "../felles/data.js?v=20261024005715";
import { SUPABASE_URL } from "../felles/config.js?v=20261024005715";

  let T, V, IDAG, VID, BRUGER, FIRMAER = [];
  const E = F.esc, IC = F.ICON;
  // Fem steder at gaa hen (Othman 19. okt: menuen maa samles). Ét navn for hver ting, ogsaa paa telefonen.
  const NAV = [["overblik", "Overblik"], ["transaktioner", "Betalinger"], ["salg", "Fakturaer"], ["moms", "Moms"], ["rapporter", "Tal"]];
  const UNDER = [["indstillinger", "Indstillinger"]];
  const TITEL = { godkend: "Godkend", overblik: "Overblik", transaktioner: "Betalinger", salg: "Fakturaer", rapporter: "Tal",
    moms: "Moms", integrationer: "Forbindelser", indstillinger: "Indstillinger", konto: "Dig" };
  const S = { route: "overblik", filter: "alle", q: "", sideN: 30, drawer: null, salgTab: "fakturaer", indTab: "firma", rapP: "ar", momsK: 0, bank: [], fejl: "", mere: false, scan: false, ed: null,
    egne: false, betalingslink: true, rykkerAuto: true };
  const TR = () => [...T.transaktioner].sort((a, b) => (a.dato < b.dato ? 1 : a.dato > b.dato ? -1 : b.id.localeCompare(a.id, "da", { numeric: true })));
  const ST = { bogfoert: ["groen", "Bogført"], mangler_kvittering: ["gul", "Mangler kvittering"], spoergsmal: ["accent", "Spørgsmål til dig"], behandles: ["graa", "Tallo behandler"] };
  const KILDE = { bank: ["bank", "DB", "Bank"], sumup: ["sumup", "SU", "SumUp"], stripe: ["stripe", "S", "Stripe"] };
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const pille = (c, t) => `<span class="pille ${c}">${t}</span>`;
  const kunde = (id) => T.kunder.find((k) => k.id === id);
  const total = () => sum(T.konti, (k) => k.saldo);
  const aabne = () => TR().filter((t) => t.status === "spoergsmal" || t.status === "mangler_kvittering");

  // ------------------------------------------------------------ fakturaer ----
  const FSTAT = { betalt: ["graa", "Betalt"], paamindet: ["accent", "Påmindet"], rykket: ["accent", "Rykket"], for_sent: ["roed", "For sent"],
    sendt: ["graa", "Sendt"], krediteret: ["graa", "Krediteret"] };
  const fstat = (f) => FSTAT[f.status] || ["graa", f.status];
  const TBST = { sendt: ["graa", "Sendt"], accepteret: ["accent", "Accepteret"], faktureret: ["groen", "Faktureret"], afvist: ["graa", "Afvist"], udloebet: ["graa", "Udløbet"] };
  const plusDage = (d, n) => new Date(new Date(d + "T00:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);
  const pct = (a, b) => (b ? Math.round((100 * (a - b)) / b) : 0);
  const fortegn = (n) => (n > 0 ? "+" : "") + n + " %";
  const ubetalte = () => T.fakturaer.filter((f) => f.rest > 0);
  // Moms, der endnu ikke er betalt: alle perioder, der ikke er indberettet, og som giver noget at betale.
  const momsSkyldig = () => sum(T.kvartaler.filter((q) => q.status !== "indberettet" && q.at_betale > 0), (q) => q.at_betale);
  const aktueltKvartal = () => T.kvartaler.find((q) => q.status === "afstemmes" && q.frist >= IDAG) || T.kvartaler.find((q) => q.status === "afstemmes") || T.kvartaler[T.kvartaler.length - 1] || { navn: "", at_betale: 0, frist: IDAG };
  const initialer = (n) => (n || "").split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

  function fakturaDok(f, titel = "FAKTURA") {
    const k = kunde(f.kunde), iban = (T.konti[0]?.iban || "").replace(/\s/g, ""), tb = titel === "TILBUD";
    const link = !tb && f.betalingslink ? `<div class="fbetal"><div><b>Betal med kort eller MobilePay</b><br>${E(f.betalingslink)}</div></div>` : "";
    return `<div class="fdok"><div class="fh"><div><span class="flogo" style="background:${E(V.farve)}">${initialer(V.kort)}</span><b>${E(V.navn)}</b><br>${E(V.adresse)}<br>CVR ${V.cvr}</div><div class="fn">${titel}<br><b>Nr. ${f.nr ?? "kladde"}</b><br>${f.dato ? F.datoLang(f.dato) : ""}</div></div>
      <div class="fk"><small>Til</small><br><b>${E(k.navn)}</b><br>${k.cvr ? "CVR " + k.cvr + "<br>" : ""}${E(k.by)}</div>
      <table><thead><tr><th>Beskrivelse</th><th>Antal</th><th>Pris</th><th>Beløb</th></tr></thead><tbody>${f.linjer.map((l) =>
        `<tr><td>${E(l.tekst)}</td><td>${l.antal}</td><td>${F.kr(l.pris)}</td><td>${F.kr(l.antal * l.pris)}</td></tr>`).join("")}</tbody></table>
      <div class="fs"><div><span>Beløb</span><span>${F.kr(f.netto)}</span></div><div><span>Moms (25 %)</span><span>${F.kr(f.moms)}</span></div><div class="t"><span>I alt DKK</span><span>${F.kr(f.total)}</span></div></div>
      ${tb ? `<div class="fb"><div>Tilbuddet gælder til ${f.gyldig ? F.datoLang(f.gyldig) : "…"}.<br>Svar på mailen for at sige ja.</div><div></div></div>`
        : `${link}<div class="fb"><div>Betaling til reg. ${iban.slice(4, 8)} konto ${iban.slice(8)}<br>Skriv fakturanummer ${f.nr ?? "…"} ved overførsel</div><div>Betalingsfrist ${f.forfald ? F.datoLang(f.forfald) : "…"}</div></div>`}
      <div class="ff">${E(V.navn)} · ${E(V.adresse)} · CVR ${V.cvr}</div></div>`;
  }

  // Pris i editoren: med moms, naar "Priserne er inkl. moms" er slaaet til (privatkunder), ellers uden.
  const medMoms = (vt, pris) => (S.ed?.inkl && vt?.moms !== false && pris != null ? Math.round(pris * 125) / 100 : pris);
  function regn(ed) {
    const linjer = ed.linjer.map((l) => { const vt = T.varetyper.find((v) => v.id === l.vt), m = vt.moms !== false;
      return { tekst: (l.tekst || "").trim() || vt.navn, antal: +l.antal || 0, pris: ed.inkl && m ? Math.round((+l.pris || 0) / 1.25 * 100) / 100 : +l.pris || 0, moms: m }; });
    const netto = Math.round(sum(linjer, (l) => l.antal * l.pris) * 100) / 100, moms = Math.round(sum(linjer.filter((l) => l.moms), (l) => l.antal * l.pris) * 25) / 100;
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
      g += `<rect x="${x - bw - 2}" y="${T0 + ih - ha}" width="${bw}" height="${Math.max(ha, 0)}" rx="3" fill="var(--accent)" opacity="${o}"><title>${F.maaned(d.m)}: ${F.kr0(d.a)}</title></rect>` +
        `<rect x="${x + 2}" y="${T0 + ih - hb}" width="${bw}" height="${Math.max(hb, 0)}" rx="3" fill="var(--accent-mid)" opacity="${o}"><title>${F.maaned(d.m)}: ${F.kr0(d.b)}</title></rect>` +
        `<text x="${x}" y="${H - 8}" text-anchor="middle">${F.maanedKort(d.m)}</text>`;
    });
    if (linje) {
      const pts = linje.map((v, i) => `${L + gw * i + gw / 2},${T0 + ih - (ih * v) / mx}`);
      g += `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--tekst)" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round"/>` +
        pts.map((p) => `<circle cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="3" fill="var(--kort)" stroke="var(--tekst)" stroke-width="1.5"/>`).join("");
    }
    return `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img" aria-label="Søjlediagram pr. måned">${g}</svg>`;
  }

  // ----------------------------------------------------------------- skaerme ----
  function overblik() {
    const mangler = T.transaktioner.filter((t) => t.status === "mangler_kvittering"), spm = T.transaktioner.filter((t) => t.status === "spoergsmal");
    const udl = T.udlaeg.filter((u) => u.status === "skylder"), ub = ubetalte(), forsent = ub.filter((f) => f.forfald < IDAG), kv = aktueltKvartal();
    const r = resultat("ar"), over = r.si - r.su, overLy = r.siLy - r.suLy;
    // Til dig: det, kunden skal gøre, i rækkefølge. Kun den første har en violet knap.
    const ting = [];
    if (selv() && V.aaben && (S.ind || []).length) ting.push(["accent", `${S.ind.length} venter på dig`, "", "Godkend", `href="#godkend"`, null]);
    if (!selv() && mangler.length) ting.push(["gul", `${mangler.length} betaling${mangler.length > 1 ? "er" : ""} mangler en kvittering`, E(mangler.slice(0, 3).map((t) => t.tekst.replace(/,.*$/, "")).join(", ")) + (mangler.length > 3 ? " m.fl." : ""), "Scan", `data-act="scan"`, "mangler_kvittering"]);
    if (spm.length) ting.push(["roed", `${spm.length} spørgsmål fra ${selv() ? "Tallo" : "Othman"}`, E(spm.slice(0, 2).map((t) => t.tekst.replace(/,.*$/, "")).join(", ")), "Svar", `data-act="aabn-t" data-id="${spm[0].id}"`, "spoergsmal"]);
    if (T.udlaeg_skyldig > 0) ting.push(["accent", `Firmaet skylder dig ${F.kr0(T.udlaeg_skyldig)} kr.`, "Du har lagt ud med egne penge", "Se hvordan", udl.length ? `data-act="aabn-u" data-id="${udl[0].id}"` : `href="#transaktioner"`, null]);
    // Skat undervejs (Othman 20. okt): kun en paamindelse, ingen skatteberegning. Kun personligt ejede virksomheder.
    const md = +IDAG.slice(5, 7);
    if (!erSelskab() && md >= 4 && !skjult(`forskud-${IDAG.slice(0, 4)}`) && over > 0) {
      const afv = overLy > 0 ? pct(over, overLy) : null;
      if (afv === null || Math.abs(afv) >= 25) ting.push(["accent", afv === null ? "Passer din forskudsopgørelse?" : `Dit overskud er ${Math.abs(afv)} % ${afv > 0 ? "højere" : "lavere"} end sidste år`,
        "Ret den på skat.dk, så du undgår restskat", "Til skat.dk", `href="https://skat.dk/borger/forskudsopgoerelse" target="_blank" rel="noopener" data-skjul="forskud-${IDAG.slice(0, 4)}"`, null]);
    }
    const linjer = ting.map(([farve, titel, under, knap, attr, filter], i) => `<div class="tl" ${filter ? `data-act="filter-gaa" data-f="${filter}" role="button" tabindex="0"` : ""}><div class="t"><b>${titel}</b>${under ? `<small>${under}</small>` : ""}</div>${attr.startsWith("href") ? `<a class="knap lille ${i ? "" : "p"}" ${attr}>${knap}</a>` : `<button class="knap lille ${i ? "" : "p"}" ${attr}>${knap}</button>`}</div>`).join("");
    let tilbud = "";
    if (S.nh?.status === "ikke_tilmeldt") {
      if (!S.nh.besked_vist) { S.nh.besked_vist = new Date().toISOString(); rpc("nemhandel_besked_vist", { p_virksomhed: VID }).catch(() => {}); }
      const dag = plusDage(S.nh.besked_vist.slice(0, 10), 28), varsel = IDAG >= "2027-03-01" ? ` Vi tilmelder dig ${F.datoLang(dag < "2027-03-01" ? "2027-03-01" : dag)}, hvis du ikke siger nej.` : "";
      tilbud = `<div class="tl"><div class="t"><b>Få regninger direkte ind</b><small>Gratis via Nemhandel.${varsel}</small></div>
        <span class="raekke"><button class="knap lille" data-act="nh-nej">Nej tak</button><button class="knap lille" data-act="nh-ja">Ja tak</button></span></div>`;
    }
    // Kom godt i gang (evidens: alle vaerktoejer starter med opsaetning, men ingen har en samlet tjekliste): de foerste 60 dage.
    const trin = [["Kobl banken til", (S.bank || []).some((b) => b.status === "aktiv") || T.transaktioner.length > 0, `data-act="bank"`],
      ["Send dit første bilag", T.transaktioner.some((t) => t.bilag) || T.udlaeg.length > 0, `data-act="scan"`],
      ["Lav din første faktura", T.fakturaer.length > 0, `data-act="ny-f"`],
      [`Moms ${MOMSPERIODE[V.momsperiode] || V.momsperiode}`, skjult("momsperiode"), `data-act="moms-passer"`]];
    const igang = plusDage(V.oprettet, 60) >= IDAG && !skjult("kom-i-gang") && trin.some(([, ok]) => !ok);
    const komIGang = igang ? `<div class="kom-i-gang"><div class="kh"><b>Kom godt i gang</b><span class="not">${trin.filter(([, ok]) => ok).length} af ${trin.length}</span>
        <button class="ikonknap" data-act="skjul" data-n="kom-i-gang" aria-label="Skjul">${IC.luk}</button></div>
      ${trin.map(([t, ok, attr]) => `<div class="trin ${ok ? "ok" : ""}"><span class="flueben">${ok ? IC.check : ""}</span><span class="t">${t}</span>${ok ? "" : attr.startsWith("href") ? `<a class="knap lille" ${attr}>Gør det</a>` : `<button class="knap lille" ${attr}>${attr.includes("moms-passer") ? "Det passer" : "Gør det"}</button>`}</div>`).join("")}</div>` : "";
    const tilDig = `<section class="kort tildig ${ting.length || igang ? "har" : ""}"><div class="kort-hoved"><h2>Til dig</h2></div>${komIGang}
      ${linjer || (igang ? "" : `<div class="altok"><span class="ok">${IC.check}</span><b>Alt er på plads</b></div>`)}${tilbud}</section>`;
    // Dine penge: hvert tal ét sted, med vej videre.
    const pl = (href, navn, bel, under) => `<a class="pl" href="#${href}"><div class="t"><b>${navn}</b><span class="bel">${bel}</span>${under ? `<small>${under}</small>` : ""}</div><span class="pil" aria-hidden="true">›</span></a>`;
    const penge = `<section class="kort penge"><div class="kort-hoved"><h2>Dine penge</h2></div>
      ${pl("rapporter", "På kontoen", F.kr0(total()) + " kr.", T.transaktioner.length ? "" : "Banken er ikke koblet til endnu")}
      ${pl("salg", "Kunder skylder dig", F.kr0(sum(ub, (f) => f.rest)) + " kr.", ub.length ? `${ub.length} faktura${ub.length > 1 ? "er" : ""}${forsent.length ? ` · <span class="roed-tekst">${forsent.length} for sent</span>` : ""}` : "")}
      ${pl("moms", `Moms for ${kv.navn.replace(/ \d{4}$/, "")}`, F.kr0(kv.at_betale) + " kr.", `Senest ${F.datoLang(kv.frist)}`)}
      ${pl("moms", "Kan hæves efter moms", F.kr0(Math.max(0, total() - momsSkyldig())) + " kr.", erSelskab() ? "Hæves som løn eller udbytte" : "Læg til side til B-skat")}</section>`;
    // Sådan går det: årets overskud og ændringen mod sidste år. Grafen bor under Tal.
    const delta = overLy ? `${fortegn(pct(over, overLy))} mod sidste år` : "Dit første år hos Tallo";
    const gaar = `<a class="kort gaar" href="#rapporter"><div class="kort-hoved"><h2>Overskud i år</h2><span class="pil" aria-hidden="true">›</span></div>
      <div class="tal-stort">${F.kr0(over)}<small>kr.</small></div><div class="not">${delta}</div></a>`;
    return `<div class="overblik">${tilDig}${penge}${gaar}</div>`;
  }

  // ------------------------------------------------------------ godkend (pakken 'selv') ----
  // AI'ens forslag pr. bilag og banklinje; kunden godkender med ét tryk eller vælger en anden kategori.
  const selv = () => V.pakke === "selv";
  const erSelskab = () => /\b(ApS|A\/S|IVS|P\/S)$/i.test(V.navn || "");
  const MOMSPERIODE = { halvaar: "hvert halve år", kvartal: "hvert kvartal", maaned: "hver måned" };
  const skjult = (n) => localStorage.getItem(`tallo-skjul-${VID}-${n}`) === "1";
  const KATNAVN = (nr) => (S.kat || []).find((k) => k.nummer === nr)?.kat || (S.kat || []).find((k) => k.nummer === nr)?.navn || nr;
  function katValg(id, nr) {
    const kat = new Map();
    for (const k of S.kat || []) if (k.kat && !kat.has(k.kat)) kat.set(k.kat, k.nummer);
    const kats = [...kat.entries()].filter(([, n]) => n !== nr).sort((a, b) => a[0].localeCompare(b[0], "da"));
    const forslag = nr ? `<option value="${E(nr)}" selected>${E(KATNAVN(nr))}</option>` : `<option value="">Vælg kategori</option>`;
    return `<select class="inp kat-valg" id="kat-${id}" data-kat="${id}" aria-label="Kategori">${forslag}${kats.map(([n, k]) => `<option value="${E(k)}">${E(n)}</option>`).join("")}</select>`;
  }
  function godkend() {
    if (!selv() || !V.aaben) return `<div class="kort tom">Intet at godkende.</div>`;
    const L = S.ind || [];
    if (!L.length) return `<div class="kort"><div class="altok"><span class="ok">${IC.check}</span><b>Alt er godkendt</b></div></div>`;
    const medForslag = L.filter((x) => x.forslag?.konto);
    // Én primaer knap: "Godkend alle", naar der er flere forslag; ellers kortets egen.
    const alle = medForslag.length > 1;
    return `${alle ? `<div class="raekke mellem godk-top"><span class="not">${L.length} venter</span><button class="knap p" data-act="godkend-alle">${IC.check} Godkend alle (${medForslag.length})</button></div>` : ""}
      <div class="gitter godk-liste">${L.map((x) => {
        const f = x.forslag || {}, id = x.id;
        return `<div class="kort godk">
          <div><div class="lille-tekst">${x.type === "bank" ? "Betaling" : "Bilag"} · ${x.dato ? F.dato(x.dato) : "uden dato"}</div><b class="godk-titel">${E(x.tekst)}</b></div>
          <div class="tal bel">${x.beloeb != null ? F.kr(x.type === "bank" ? x.beloeb : -x.beloeb) : ""}</div>
          <div class="valg">${katValg(id, f.konto)}
            <button class="knap ${alle || !f.konto ? "" : "p"}" data-act="godkend-selv" data-id="${id}" ${f.konto ? "" : "disabled"}>${IC.check} Godkend</button>
            ${x.type === "bilag" ? `<button class="knap" data-act="afvis-selv" data-id="${id}">Ikke et bilag</button>` : `<button class="knap" data-act="scan">${IC.scan} Send bilag</button>`}</div></div>`;
      }).join("")}</div>`;
  }

  // Betalinger: dato, hvad og kategori, status kun naar der mangler noget, beloeb. Kilden vises kun, naar der er flere.
  function trTabel(liste, fod = true) {
    const flereKilder = T.konti.length > 1 || T.transaktioner.some((t) => t.kilde && t.kilde !== "bank");
    const rk = liste.map((t) => {
      const k = KILDE[t.kilde] || KILDE.bank, [pc, pt] = ST[t.status], bogfoert = t.status === "bogfoert";
      const venter = t.status === "mangler_kvittering" || t.status === "spoergsmal" || (selv() && t.status === "behandles");
      const kilde = flereKilder ? ` · ${E(k[2])}${T.konti.length > 1 ? " " + E(T.konti.find((x) => x.id === t.konto)?.navn || "") : ""}` : "";
      return `<div class="r rk" role="button" tabindex="0" data-act="aabn-t" data-id="${t.id}"><div class="c-dato tal">${F.dato(t.dato)}</div>
        <div class="tekst c-tekst"><b>${E(t.tekst)}</b><small>${venter ? `<span class="kun-mobil st-tekst">${pt} · </span>` : ""}${E(bogfoert ? t.kat : t.kat === "Ukendt" || /ikke bogført/i.test(t.kat) ? "" : "Forslag: " + t.kat)}${kilde}<span class="kun-mobil">${bogfoert || !/ikke bogført|Ukendt/i.test(t.kat) ? " · " : ""}${F.datoKort(t.dato)}</span></small></div>
        <div class="c-st kun-pc">${venter ? pille(pc, pt) : ""}</div><div class="b c-bel tal ${t.beloeb > 0 ? "pos" : "neg"}">${t.beloeb > 0 ? "+" : ""}${F.kr(t.beloeb)}</div></div>`;
    }).join("");
    return `<div class="tabel"><div class="r rk h"><div class="c-dato">Dato</div><div class="c-tekst">Hvad</div><div class="c-st"></div><div class="b c-bel">Kr.</div></div>${rk || '<div class="tom">Ingen betalinger passer til søgningen.</div>'}</div>`;
  }

  function filtreret() {
    let l = TR();
    if (S.filter === "udgifter") l = l.filter((t) => t.beloeb < 0);
    else if (S.filter === "venter") l = l.filter((t) => t.status === "mangler_kvittering" || t.status === "spoergsmal" || (selv() && t.status === "behandles"));
    else if (S.filter !== "alle") l = l.filter((t) => t.status === S.filter);
    if (S.q) { const q = S.q.toLowerCase(); l = l.filter((t) => `${t.tekst} ${t.kat} ${Math.abs(t.beloeb)} ${t.bilag || ""}`.toLowerCase().includes(q)); }
    return l;
  }
  function trListe() {
    const l = filtreret(), vis = l.slice(0, S.sideN);
    return trTabel(vis) + `<div class="tabelfod"><span>${vis.length} af ${l.length}</span>${vis.length < l.length ? '<button class="knap lille" data-act="flere">Vis flere</button>' : ""}</div>`;
  }
  function transaktioner() {
    const al = T.transaktioner, n = (s) => al.filter((t) => t.status === s).length;
    return `<div class="kort tabeldel"><div class="tabel-top"><label class="soeg">${IC.soeg}<input id="q" placeholder="Søg" value="${E(S.q)}" autocomplete="off"></label>
      <div class="filtre" role="group" aria-label="Vis">${[["alle", "Alle"], ["venter", "Venter på dig", n("mangler_kvittering") + n("spoergsmal") + (selv() ? n("behandles") : 0)], ["udgifter", "Udgifter"]]
        .map(([k, t, c]) => `<button data-act="filter" data-f="${k}" aria-pressed="${S.filter === k}">${t}${c ? `<b>${c}</b>` : ""}</button>`).join("")}</div></div>
      <div id="trliste">${trListe()}</div></div>`;
  }

  // Fakturaer: én statuslinje i stedet for talkort; filtre i stedet for en fane med betalinger.
  function salg() {
    const fl = [...T.fakturaer].sort((a, b) => b.nr - a.nr), ub = ubetalte(), forsent = ub.filter((f) => f.forfald < IDAG), betalt = T.fakturaer.filter((f) => f.status === "betalt" && String(f.dato).startsWith(IDAG.slice(0, 4)));
    const tabs = `<div class="faner" role="tablist">${[["fakturaer", "Fakturaer"], ["tilbud", "Tilbud"], ["abonnementer", "Faste"], ["kunder", "Kunder"]].map(([k, t]) => `<button role="tab" aria-selected="${S.salgTab === k}" data-act="salgtab" data-t="${k}">${t}</button>`).join("")}</div>`;
    let ind = "";
    if (S.salgTab === "fakturaer" || S.salgTab === "betalinger") {
      const ff = S.fFilter || "alle";
      const vis = ff === "ubetalte" ? fl.filter((f) => f.rest > 0) : ff === "forsent" ? fl.filter((f) => f.rest > 0 && f.forfald < IDAG) : ff === "betalt" ? fl.filter((f) => f.status === "betalt") : fl;
      ind = `${udkastKort()}
        <div class="kort tabeldel mt-3"><div class="tabel-top"><div class="filtre" role="group" aria-label="Vis">${[["alle", "Alle"], ["ubetalte", "Ubetalte", ub.length], ["forsent", "For sent", forsent.length], ["betalt", "Betalt"]].map(([k, t, c]) => `<button data-act="ffilter" data-f="${k}" aria-pressed="${ff === k}">${t}${c ? `<b>${c}</b>` : ""}</button>`).join("")}</div></div>
        <div class="tabel"><div class="r rf h"><div>Nr.</div><div>Kunde</div><div class="c-dato">Dato</div><div class="c-dato">Forfald</div><div>Status</div><div class="b">Kr.</div></div>
        ${vis.length ? "" : `<div class="tom">${fl.length ? "Ingen her." : "Ingen fakturaer endnu."}</div>`}${vis.map((f) => `<div class="r rf" role="button" tabindex="0" data-act="aabn-f" data-nr="${f.nr}"><div class="tal">${f.nr}</div><div class="tekst">${E(kunde(f.kunde).navn)}<small>${E(f.linjer[0].tekst)}${f.linjer.length > 1 ? " m.m." : ""}</small></div><div class="c-dato tal">${F.dato(f.dato)}</div><div class="c-dato tal">${F.dato(f.forfald)}</div><div>${pille(...fstat(f))}</div><div class="b tal">${F.kr(f.total)}</div></div>`).join("")}</div></div>`;
    } else if (S.salgTab === "tilbud") {
      ind = `<div class="kort tabeldel mt-3"><div class="tabel"><div class="r rf h"><div>Nr.</div><div>Kunde</div><div class="c-dato">Dato</div><div class="c-dato">Gælder til</div><div>Status</div><div class="b">Kr.</div></div>
        ${T.tilbud.length ? "" : '<div class="tom">Ingen tilbud endnu.</div>'}${[...T.tilbud].sort((a, b) => (a.dato < b.dato ? 1 : -1)).map((t) => `<div class="r rf" role="button" tabindex="0" data-act="aabn-tb" data-nr="${t.nr}"><div class="tal">${t.nr}</div><div class="tekst">${E(kunde(t.kunde).navn)}<small>${E(t.linjer[0].tekst)}${t.linjer.length > 1 ? " m.m." : ""}</small></div><div class="c-dato tal">${F.dato(t.dato)}</div><div class="c-dato tal">${F.dato(t.gyldig)}</div><div>${pille(...TBST[t.status])}</div><div class="b tal">${F.kr(t.total)}</div></div>`).join("")}</div></div>`;
    } else if (S.salgTab === "abonnementer") {
      ind = `<div class="kort tabeldel mt-3"><div class="tabel"><div class="r ra h"><div>Kunde</div><div>Hvad</div><div>Hvor ofte</div><div class="c-dato">Næste</div><div class="b">Kr. pr. gang</div><div></div></div>
        ${T.abonnementer.map((a) => `<div class="r ra"><div class="tekst">${E(kunde(a.kunde).navn)}<small>${a.sendt} sendt</small></div><div class="tekst">${E(a.linjer[0].tekst)}</div><div>${E(a.hvor_ofte)}</div><div class="c-dato tal">${a.status === "stoppet" ? "Stoppet" : F.dato(a.naeste)}</div><div class="b tal">${F.kr(a.total)}</div><div class="b">${a.status === "stoppet" ? "" : `<button class="knap lille" data-act="stop-abon" data-id="${a.id}">Stop</button>`}</div></div>`).join("")}</div>
        ${T.abonnementer.length ? "" : '<div class="tom">Ingen faste fakturaer endnu.</div>'}</div>`;
    } else {
      ind = `<div class="kort tabeldel mt-3"><div class="tabel"><div class="r rk2 h"><div>Kunde</div><div class="c-kat">By</div><div class="b">Fakturaer</div><div class="b">Faktureret i år</div><div class="b">Ubetalt</div><div></div></div>
        ${T.kunder.length ? "" : '<div class="tom">Ingen kunder endnu.</div>'}${T.kunder.map((k) => { const fk = T.fakturaer.filter((f) => f.kunde === k.id), fkAar = fk.filter((f) => String(f.dato).startsWith(IDAG.slice(0, 4))); return `<div class="r rk2"><div class="tekst">${E(k.navn)}<small>${k.cvr ? "CVR " + k.cvr : "Privat"}${k.mail ? " · " + E(k.mail) : ""}</small></div><div class="c-kat">${E(k.by)}</div><div class="b tal">${fk.length}</div><div class="b tal">${F.kr0(sum(fkAar, (f) => f.total))}</div><div class="b tal">${F.kr0(sum(fk.filter((f) => f.rest > 0), (f) => f.rest))}</div><div class="b raekke slut"><button class="knap lille" data-act="kontoudtog" data-k="${k.id}">Kontoudtog</button><button class="knap lille" data-act="ny-f" data-k="${k.id}">Faktura</button></div></div>`; }).join("")}</div></div>`;
    }
    return `${tabs}${ind}`;
  }

  // Udkast, der venter: lavet af kundens egen AI (MCP) eller en faktura, der ikke blev sendt.
  function udkastKort() {
    const u = S.udkast || [];
    if (!u.length) return "";
    return `<div class="kort tabeldel mt-3"><div class="kort-hoved over-tabel"><h2>Udkast (${u.length})</h2></div><div class="tabel">
      ${u.map((x) => `<div class="r rf"><div></div><div class="tekst">${E(kunde(x.kunde).navn)}<small>${E(x.linjer?.[0]?.tekst || "")}${x.linjer?.length > 1 ? " m.m." : ""}${x.reference ? " · " + E(x.reference) : ""}</small></div><div class="c-dato tal">${F.dato(String(x.oprettet).slice(0, 10))}</div><div class="c-dato"></div><div class="raekke"><button class="knap lille" data-act="udkast-slet" data-id="${x.id}">Slet</button><button class="knap lille" data-act="udkast-send" data-id="${x.id}">Send</button></div><div class="b tal">${F.kr(x.total)}</div></div>`).join("")}</div></div>`;
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

  // Tal: hvordan det går (resultat), pengene over tid og alt, der kan hentes. Erstatter Rapporter, Likviditet og Data.
  function rapporter() {
    const r = resultat(S.rapP), res = r.si - r.su, ly = r.siLy || r.suLy;
    const rows = (o, oLy) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([n, v]) => `<tr><td>${E(n)}</td><td>${F.kr0(v)}</td>${ly ? `<td class="svag">${F.kr0(oLy[n] || 0)}</td>` : ""}</tr>`).join("");
    const hent = [["Resultat som PDF", "", "udskriv"], ["Alle betalinger i Excel", "Vi sender den på mail", "bestil"],
      [`Standardfilen for ${IDAG.slice(0, 4)}`, "Til din revisor", "udtraek", "saft"], ["Hele bogføringen med bilag", "", "udtraek", "udlevering"]];
    const klar = (S.udtraek || []).length ? `<div class="liste mt-1">${S.udtraek.map((u) => `<div class="li"><div class="t"><b>${u.type === "saft" ? "Standardfilen " + u.fra.slice(0, 4) : "Hele bogføringen"}</b><small>Bestilt ${F.dato(u.bestilt_tid.slice(0, 10))}</small></div>${u.status === "klar" ? `<button class="knap lille p" data-act="hent-udtraek" data-sti="${E(u.sti)}" data-navn="${u.type === "saft" ? `saft-${V.cvr}-${u.fra.slice(0, 4)}.xml` : `bogfoering-${V.cvr}.zip`}">${IC.hent} Hent</button>` : u.status === "fejl" ? pille("roed", "Fejl") : pille("graa", "Laves")}</div>`).join("")}</div>` : "";
    return `<div class="gitter g21"><div class="kort"><div class="kort-hoved"><h2>Resultat</h2><span class="not">Beløb uden moms</span></div>
        <div class="rul"><table class="vtabel"><thead><tr><th></th><th>${IDAG.slice(0, 4)}</th>${ly ? "<th>Sidste år</th>" : ""}</tr></thead><tbody>
        <tr class="sum"><td>Indtægter</td><td>${F.kr0(r.si)}</td>${ly ? `<td>${F.kr0(r.siLy)}</td>` : ""}</tr>${rows(r.inn, r.innLy)}
        <tr class="sum"><td>Udgifter</td><td>${F.kr0(-r.su)}</td>${ly ? `<td>${F.kr0(-r.suLy)}</td>` : ""}</tr>${rows(r.ud, r.udLy)}
        <tr class="sum"><td>Overskud</td><td>${F.kr0(res)}</td>${ly ? `<td>${F.kr0(r.siLy - r.suLy)}</td>` : ""}</tr></tbody></table></div></div>
      <div class="stak"><div class="kort"><div class="kort-hoved"><h2>Måned for måned</h2></div>
        ${T.maaneder.some((m) => m.ind || m.ud) ? bars(T.maaneder.map((m) => ({ m: m.maaned, a: m.ind, b: m.ud, delvis: m.maaned === +IDAG.slice(5, 7) })), null, 420, 220) : '<p class="not">Ingen tal endnu.</p>'}
        <div class="forkl"><span><i class="ind"></i>Ind</span><span><i class="ud"></i>Ud</span></div></div>
        <div class="kort"><div class="kort-hoved"><h2>Hent</h2></div><div class="liste">${hent.map(([n, t, h, ty]) => `<div class="li"><div class="t"><b>${n}</b>${t ? `<small>${t}</small>` : ""}</div><button class="knap lille" data-act="${h}" data-hvad="${n}" ${ty ? `data-type="${ty}"` : ""}>${IC.hent} Hent</button></div>`).join("")}</div>${klar}</div></div></div>`;
  }

  // Moms: perioderne til venstre, den valgte periode i ét kort med beløbet én gang og én status.
  function moms() {
    const K = T.kvartaler, k = K[S.momsK], ind = k.status === "indberettet";
    // Perioder fra før kunden kom til Tallo (ingen betalinger eller fakturaer) vises ikke.
    const start = [...T.transaktioner.map((t) => t.dato), ...T.fakturaer.map((f) => f.dato)].sort()[0] || IDAG;
    const vis = (q) => q.status === "indberettet" || q.til >= start;
    const stat = (q) => (q.status === "indberettet" ? ["graa", "Indberettet"] : q.status === "igang" ? ["graa", "I gang"] : selv() ? ["accent", "Til dig"] : ["graa", "Gøres klar"]);
    const mangler = T.transaktioner.filter((t) => t.status !== "bogfoert" && t.dato >= k.fra && t.dato <= k.til).length;
    // Én linje om, hvor perioden er; fristen staar i listen og beloebet én gang.
    const status = ind ? "Indberettet." : selv() ? "" : mangler
      ? `<div class="raekke mellem"><span>${mangler} betaling${mangler > 1 ? "er" : ""} mangler en kvittering</span><button class="knap lille p" data-act="filter-gaa" data-f="mangler_kvittering">Se dem</button></div>`
      : "Vi indberetter den.";
    return `<div class="gitter g12 moms-g"><div class="kort"><div class="kort-hoved"><h2>Perioder</h2><span class="not">${(MOMSPERIODE[V.momsperiode] || "").replace(/^./, (c) => c.toUpperCase())}</span></div><div class="liste perioder">${K.map((q, i) => !vis(q) ? "" : `<div class="li ${i === S.momsK ? "valgt" : ""}" role="button" tabindex="0" data-act="momsk" data-i="${i}"><div class="t"><b>${q.navn}</b><small>Frist ${F.datoLang(q.frist)}</small></div><div class="hojre"><div class="tal">${F.kr0(q.at_betale)} kr.</div>${pille(...stat(q))}</div></div>`).join("")}</div></div>
      <div class="stak"><div class="kort"><div class="kort-hoved"><h2>${k.navn}</h2></div>
        <div class="not">${k.at_betale >= 0 ? "Det skal du betale" : "Det får du tilbage"}</div><div class="stort tal">${F.kr0(Math.abs(k.at_betale))} <small>kr.</small></div>
        ${status ? `<div class="mt-2">${status}</div>` : ""}
        <details class="udregning"><summary>Sådan er tallet regnet</summary>${momsGrundlag(k)}</details></div>
        ${selv() && !ind && k.status !== "igang" ? tastSelv(k) : ""}</div></div>`;
  }

  // "Gør det selv": felterne til TastSelv, hvad der mangler, og registrering af indberetningen med kvitteringen.
  const RUBRIK = [["MomsAngivelseSalgsMomsBeloeb", "Salgsmoms"], ["MomsAngivelseKoebsMomsBeloeb", "Købsmoms"],
    ["MomsAngivelseMomsEUKoebBeloeb", "Moms af varekøb i udlandet"], ["MomsAngivelseMomsEUYdelserBeloeb", "Moms af ydelseskøb i udlandet"],
    ["MomsAngivelseOlieAfgiftBeloeb", "Olie- og flaskegasafgift"], ["MomsAngivelseElAfgiftBeloeb", "Elafgift"], ["MomsAngivelseVandAfgiftBeloeb", "Vandafgift"],
    ["MomsAngivelseEUKoebBeloeb", "Rubrik A, varer"], ["MomsAngivelseEUKoebYdelseBeloeb", "Rubrik A, ydelser"],
    ["MomsAngivelseEUSalgBeloebVarerBeloeb", "Rubrik B, varer"], ["MomsAngivelseEksportOmsaetningBeloeb", "Rubrik C"]];
  function tastSelv(k) {
    const n = k.fra + k.til, m = S.momsTal[n];
    if (!m) { rpc("klar_til_moms", { p_virksomhed: VID, p_fra: k.fra, p_til: k.til }).then((r) => { S.momsTal[n] = r; render(); }).catch(() => {}); return '<div class="kort"><p class="not">Henter tallene til TastSelv ...</p></div>'; }
    const a = m.momsangivelse || {}, mangler = [[m.bilag_uden_kontering, "bilag mangler at blive godkendt"], [m.bankposter_uden_match, "betalinger i banken mangler et bilag"], [m.ubogfoerte_kladder, "kladder er ikke bogført"]].filter(([x]) => x);
    return `<div class="kort"><div class="kort-hoved"><h2>Indberet i TastSelv</h2></div>
      ${mangler.length ? `<div class="raekke mellem"><span class="not">Først: ${mangler.map(([x, t]) => `${x} ${t}`).join(", ")}</span><a class="knap lille p" href="#godkend">Godkend</a></div>` : '<p class="not mt-0">Log ind på skat.dk, vælg Moms, og tast tallene.</p>'}
      <table class="vtabel"><tbody>${RUBRIK.filter(([f], i) => i < 2 || a[f]).map(([f, t]) => `<tr><td>${t}</td><td class="tal">${F.kr0(a[f] || 0)}</td></tr>`).join("")}
      <tr class="sum"><td>Afgiftstilsvar</td><td class="tal">${F.kr0(a.MomsAngivelseAfgiftTilsvarBeloeb || 0)}</td></tr></tbody></table>
      <div class="felt mt-3"><label for="kvit">Kvitteringsnummer</label><div class="raekke"><input class="inp fyld" id="kvit" autocomplete="off"><button class="knap ${mangler.length ? "" : "p"}" data-act="moms-indberettet" ${m.klar ? "" : "disabled"}>Jeg har indberettet</button></div></div></div>`;
  }

  function momsGrundlag(k) {
    const sal = {}, koeb = {};
    T.transaktioner.filter((t) => t.status === "bogfoert" && t.moms === "25" && t.dato >= k.fra && t.dato <= k.til).forEach((t) => {
      const o = t.beloeb > 0 ? sal : koeb; o[t.kat] = o[t.kat] || [0, 0]; o[t.kat][0] += Math.abs(t.beloeb) / 1.25; o[t.kat][1] += Math.abs(t.beloeb) * 0.2;
    });
    const fk = T.fakturaer.filter((f) => f.dato >= k.fra && f.dato <= k.til); if (fk.length) sal["Fakturaer til kunder"] = [sum(fk, (f) => f.netto), sum(fk, (f) => f.moms)];
    T.udlaeg.filter((u) => u.dato >= k.fra && u.dato <= k.til).forEach((u) => { koeb[u.kat] = koeb[u.kat] || [0, 0]; koeb[u.kat][0] += u.beloeb / 1.25; koeb[u.kat][1] += u.beloeb * 0.2; });
    const rk = (o, neg) => Object.entries(o).sort((a, b) => b[1][1] - a[1][1]).map(([n, [g, m]]) => `<tr><td>${E(n)}</td><td>${F.kr(g)}</td><td>${neg ? "-" : ""}${F.kr(m)}</td></tr>`).join("");
    return `<table class="vtabel mt-1"><thead><tr><th>Hvad</th><th>Beløb</th><th>Moms</th></tr></thead><tbody><tr class="sum"><td>Moms af salg</td><td></td><td>${F.kr(k.salgsmoms)}</td></tr>${rk(sal, false)}
      <tr class="sum"><td>Moms af dine køb</td><td></td><td>-${F.kr(k.koebsmoms)}</td></tr>${rk(koeb, true)}<tr class="sum"><td>${k.at_betale >= 0 ? "At betale" : "Til gode"}</td><td></td><td>${F.kr(Math.abs(k.at_betale))}</td></tr></tbody></table>`;
  }

  function integrationer() {
    const b = S.bank[0], aktiv = b?.status === "aktiv";
    const bank = b ? [aktiv ? (b.fornyes_snart ? pille("accent", "Fornyes snart") : "") : pille("accent", "Udløbet"), aktiv ? `Gælder til ${F.datoLang(String(b.gyldig_til).slice(0, 10))}` : "Kun læseadgang. Du logger ind med MitID.", aktiv && !b.fornyes_snart ? "" : "Forny"]
      : ["", "Kun læseadgang. Du logger ind med MitID.", "Kobl banken til"];
    const nh = { tilmeldt: "", accepteret: pille("graa", "På vej"), afvist: pille("roed", "Fejl"), fravalgt: pille("graa", "Fravalgt") }[S.nh?.status] ?? pille("graa", "Ikke tilmeldt");
    const kort = [[initialer(b?.bank || "Bank"), b?.bank || "Din bank", bank[0], bank[1], bank[2], "bank"],
      ["@", "Bilagsadresse", "", `<span class="mono">${E(V.bilagsadresse)}</span>`, "Kopiér", "kopier"],
      ["E", "E-faktura", nh, "Sendes af sig selv, når kunden har EAN", "", ""],
      ["SK", "Skattestyrelsen", selv() ? "" : pille("accent", "Kræver adgang"), selv() ? "Du indberetter selv i TastSelv" : "Giv os adgang i TastSelv", "", ""]];
    return `<div class="gitter g2">${kort.map(([i, n, st, t, knap, act]) => `<div class="kort forb-kort"><div class="raekke"><span class="monogram">${E(i)}</span><b class="fyld">${E(n)}</b>${st}</div>
      <div class="not">${t}</div>${knap ? `<div><button class="knap lille" data-act="${act}">${knap}</button></div>` : ""}</div>`).join("")}${aiKort()}</div>`;
  }

  function indstillinger() {
    const tabs = [["firma", "Firma"], ["fakturaer", "Fakturaer"], ["forbindelser", "Forbindelser"], ...(selv() ? [["konti", "Kategorier"]] : [])];
    const f = (l, v) => `<div class="felt"><label>${l}</label><div class="vaerdi">${E(v) || "–"}</div></div>`;
    const ind = {
      firma: `<div class="gitter g2"><div class="stak"><div class="kort"><div class="kort-hoved"><h2>Firmaoplysninger</h2></div><div class="gitter g2">${f("Navn", V.navn)}${f("CVR", V.cvr)}${f("Adresse", V.adresse)}${f("Bilagsadresse", V.bilagsadresse)}${f("Moms afregnes", (MOMSPERIODE[V.momsperiode] || "").replace(/^./, (c) => c.toUpperCase()))}</div>
        <button class="knap mt-3" data-act="skriv">Ret noget</button></div>${konto()}</div><div class="stak">${abonnement()}</div></div>`,
      fakturaer: `<div class="gitter g2"><div class="kort"><div class="kort-hoved"><h2>Udseende</h2></div><div class="raekke"><span class="flogo stor" style="background:${E(V.farve)}">${initialer(V.kort)}</span><b>Logo og farve på fakturaen</b></div>
          <div class="farver mt-2">${["#c98a3b", "#4b3aa6", "#1f7a4a", "#141414", "#2b55d6"].map((c, i) => `<button class="farve" data-act="farve" data-farve="${c}" style="background:${c}" aria-label="Farve ${i + 1}" aria-pressed="${V.farve === c}"></button>`).join("")}</div></div>
        <div class="kort"><div class="kort-hoved"><h2>Betaling og rykkere</h2></div><div class="liste">
          <div class="li"><div class="t"><b>Påmindelse af sig selv</b><small>2 dage efter forfald, uden gebyr</small></div><button class="sw" role="switch" aria-checked="${V.auto_paamindelse}" aria-label="Påmindelse" data-act="sw-rykker"></button></div>
          <div class="li"><div class="t"><b>Betalingsfrist</b></div><select class="inp auto" id="frist" aria-label="Betalingsfrist">${[8, 14, 30].map((d) => `<option value="${d}" ${V.betalingsfrist === d ? "selected" : ""}>${d} dage</option>`).join("")}</select></div>
          <div class="li"><div class="t"><b>Rykker med gebyr</b><small>Du sender dem fra fakturaen. 100 kr., højst tre, 10 dage imellem.</small></div></div>
          <div class="li"><div class="t"><b>Regninger direkte ind</b><small>${{ tilmeldt: "Tilmeldt Nemhandel", accepteret: "På vej", afvist: "Gik ikke igennem; vi kigger på det", fravalgt: "Du har sagt nej tak", ikke_tilmeldt: "Gratis via Nemhandel" }[S.nh?.status || "ikke_tilmeldt"]}</small></div>${["tilmeldt", "accepteret", "afvist"].includes(S.nh?.status) ? "" : `<button class="knap lille" data-act="nh-ja">Tilmeld</button>`}</div></div></div></div>
        <div class="kort tabeldel mt-3"><div class="kort-hoved over-tabel"><h2>Varer og ydelser</h2><button class="knap lille" data-act="ny-vare">${IC.plus} Ny vare</button></div><div class="tabel">${T.varetyper.map((v) => `<div class="r rv"><div class="tekst">${E(v.navn)}</div><div class="b">${F.kr(v.pris)} / ${E(v.enhed)}</div><div class="not">${v.moms === false ? "Uden moms" : "Moms 25 %"}</div></div>`).join("") || '<div class="tom">Ingen varer endnu.</div>'}</div></div>`,
      forbindelser: S.indTab === "forbindelser" ? integrationer() : "",
      konti: S.indTab === "konti" ? kontiFane() : "",
    };
    return `<div class="faner" role="tablist">${tabs.map(([k, t]) => `<button role="tab" aria-selected="${S.indTab === k}" data-act="indtab" data-t="${k}">${t}</button>`).join("")}</div><div class="mt-3">${ind[S.indTab] ?? ind.firma}</div>`;
  }

  // Abonnement og data: under Firma.
  function abonnement() {
    return `<div class="kort"><div class="kort-hoved"><h2>${V.pakke === "selv" ? "Gør det selv med AI" : "Med bogholder"}</h2></div><div class="stort tal">${V.pakke === "selv" ? "500" : "1.000"} <small>kr. om måneden, ekskl. moms</small></div>
          <p class="not">${V.pakke === "selv" ? "Du godkender selv. Vi står klar, hvis du er i tvivl." : "Vi bogfører, indberetter momsen og sender dig tallene."}<br>Fast pris, ingen binding.<br>Løn og årsregnskab kan købes til.</p>
          ${S.pakkeskift ? `<div class="kort tonet mt-2"><b>Du skifter til ${S.pakkeskift.ny_pakke === "selv" ? "Gør det selv med AI" : "Med bogholder"} fra ${F.datoLang(S.pakkeskift.fra)}.</b><div class="mt-2"><button class="knap lille" data-act="skift-pakke" data-p="${V.pakke}">Fortryd</button></div></div>`
            : `<div class="mt-2"><button class="knap" data-act="skift-pakke" data-p="${V.pakke === "selv" ? "fuld" : "selv"}">Skift til ${V.pakke === "selv" ? "Med bogholder" : "Gør det selv"}</button><div class="lille-tekst mt-1">Gælder fra næste måned.</div></div>`}</div>
        <div class="kort"><div class="kort-hoved"><h2>Dine data</h2></div><div class="liste"><div class="li"><div class="t"><b>Gemmes i 5 år</b><small>Også hvis du stopper</small></div></div><div class="li"><div class="t"><b>Ligger i EU</b><small>Krypteret, med daglig kopi</small></div></div></div></div>`;
  }

  // Konti med vejledning (BEK 97 bilag 2, pkt. 4 og 5 b-c): hvad hver konto bruges til.
  function kontiFane() {
    if (!S.kontoplan) {
      sb.from("konto").select("nummer, navn, vejledning").eq("virksomhed_id", VID).eq("spaerret", false).order("nummer")
        .then(({ data }) => { S.kontoplan = data || []; render(); });
      return '<div class="kort"><p class="not">Henter konti ...</p></div>';
    }
    return `<div class="kort tabeldel"><div class="kort-hoved over-tabel"><h2>Kategorier</h2><span class="not">${S.kontoplan.length}</span></div>
      <div class="tabel">${S.kontoplan.map((k) => `<div class="r rv"><div class="tal">${E(k.nummer)}</div><div class="tekst">${E(k.navn)}${k.vejledning ? `<small>${E(k.vejledning)}</small>` : ""}</div><div></div></div>`).join("")}</div></div>`;
  }

  // Kundens egen AI (Claude, ChatGPT) over MCP. Forbindelserne er OAuth-tilladelser i Supabase Auth.
  const MCP_URL = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/mcp";
  async function hentGrants() {
    if (S.grants) return;
    const { data } = await sb.auth.oauth.listGrants().catch(() => ({ data: [] }));
    S.grants = data || [];
  }
  function aiKort() {
    if (!S.grants) hentGrants().then(render);
    const g = S.grants || [];
    return `<div class="kort forb-kort"><div class="raekke"><span class="monogram">AI</span><b class="fyld">Din egen AI</b></div>
      <p class="not mt-0">Spørg Claude eller ChatGPT om dine tal. Den kan aldrig bogføre eller slette.</p>
      <div class="raekke"><input class="inp mono fyld" id="mcp-url" value="${E(MCP_URL)}" readonly aria-label="Adresse til din AI"><button class="knap" data-act="ai-kopier">Kopiér</button></div>
      <details class="fold"><summary>Sådan forbinder du</summary><div class="liste"><div class="li"><div class="t"><b>Claude</b><small>Indstillinger, Connectors, Tilføj custom connector. Indsæt adressen, og log ind.</small></div></div>
      <div class="li"><div class="t"><b>ChatGPT</b><small>Indstillinger, Apps og connectors, Avanceret: slå udviklertilstand til, opret en connector med adressen, og log ind.</small></div></div></div>
      <p class="lille-tekst">Det, du spørger om, sendes til din AI's udbyder, ikke til Tallo.</p></details>
      ${g.length ? `<div class="liste">${g.map((x) => `<div class="li"><div class="t"><b>${E(x.client?.client_name || x.client?.name || "AI")}</b><small>Forbundet ${F.dato(String(x.granted_at || x.created_at || "").slice(0, 10))}</small></div><button class="knap lille" data-act="ai-fjern" data-id="${E(x.client?.client_id || x.client?.id || x.client_id || "")}">Slå fra</button></div>`).join("")}</div>` : ""}</div>`;
  }

  function konto() {
    return `<div class="kort"><div class="kort-hoved"><h2>Dig</h2></div><div class="raekke"><span class="monogram stor">${initialer(BRUGER.navn || BRUGER.mail)}</span><div class="fyld"><b>${E(BRUGER.navn || "")}</b><div class="not">${E(BRUGER.mail)}</div></div></div>
      <div class="raekke mt-3"><button class="knap" data-act="log-ud">Log ud</button><button class="knap" data-act="log-ud-alle">Log ud alle steder</button></div></div>`;
  }

  // ---------------------------------------------------------------- skuffer ----
  function skuffeT(t) {
    const [pc, pt] = ST[t.status], k = KILDE[t.kilde] || KILDE.bank, moms = t.moms === "25" ? Math.abs(t.beloeb) * 0.2 : 0, bogfoert = t.status === "bogfoert";
    // Det, kunden skal goere, staar én gang, med én primaer knap; ellers er skuffen stille.
    const handl = t.status === "spoergsmal" ? `<div class="kort tonet mt-3"><b>${E(t.spm)}</b><div class="raekke mt-2"><button class="knap" data-act="svar" data-id="${t.id}" data-s="Til firmaet">Til firmaet</button><button class="knap" data-act="svar" data-id="${t.id}" data-s="Privat">Privat</button><button class="knap p" data-act="scan">Send kvittering</button></div></div>`
      : t.status === "mangler_kvittering" ? `<div class="kort tonet mt-3"><b>Mangler kvittering</b><div class="raekke mt-2"><button class="knap p" data-act="scan">Send kvittering</button><button class="knap" data-act="ingen" data-id="${t.id}">Har ikke nogen</button></div></div>` : "";
    return `<div class="sh"><h2>${E(t.tekst)}</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <div class="not">${F.datoLang(t.dato)} · ${k[2]}</div><div class="raekke mellem"><div class="stort-beloeb tal">${t.beloeb > 0 ? "+" : ""}${F.kr(t.beloeb)} kr.</div>${handl ? "" : pille(pc, pt)}</div>${handl}
      <div class="liste mt-3"><div class="li"><div class="t not">${bogfoert ? "Kategori" : "Forslag"}</div><span>${E(t.kat)}</span></div><div class="li"><div class="t not">Konto</div><span>${E(T.konti.find((x) => x.id === t.konto).navn)}</span></div>${bogfoert ? `<div class="li"><div class="t not">Moms</div><span class="tal">${moms ? F.kr(moms) + " kr." : "Ingen"}</span></div><div class="li"><div class="t not">Bogført af</div><span>${t.af === "ai_godkendt" ? "AI efter faste regler" : t.af === "regel" ? "En fast regel" : selv() ? "Dig" : "Tallo"}</span></div>` : ""}${t.bilag ? `<div class="li"><div class="t not">Bilag</div><span class="raekke">Nr. ${t.bilag}<button class="knap lille" data-act="se-bilag" data-nr="${t.bilag}">Se</button>${bogfoert && selv() ? `<button class="knap lille" data-act="ret-fejl" data-nr="${t.bilag}">Ret fejl</button>` : ""}</span></div>` : ""}${t.hvorfor && bogfoert ? `<div class="li"><div class="t"><span class="not">Hvorfor</span><small>${E(t.hvorfor)}</small></div></div>` : ""}</div>
      <div class="felt mt-3"><label for="besked">${t.status === "spoergsmal" ? "Dit svar" : "Skriv til os om den"}</label><textarea class="inp" id="besked"></textarea></div></div>
      <div class="sf"><span></span><button class="knap ${handl ? "" : "p"}" data-act="send-besked">Send</button></div>`;
  }
  function skuffeF(f) {
    const [pc, pt] = fstat(f), ry = f.rykker || [];
    let forloeb = "";
    if (!f.betalt) {
      const sidste = ry.length ? ry[ry.length - 1].dato : f.forfald, naeste = ry.length ? plusDage(sidste, 10) : plusDage(f.forfald, 2), kan = naeste <= IDAG;
      const nummer = ry.filter((x) => x.gebyr).length + 1, gebyr = ry.length > 0;
      const trin = [["ok", "Sendt", F.datoLang(f.dato)], [f.forfald < IDAG ? "ok" : "nu", "Forfald", F.datoLang(f.forfald)], ...ry.map((x) => ["ok", x.type + (x.gebyr ? ` (+${x.gebyr} kr.)` : ""), "Sendt " + F.datoLang(x.dato)])];
      if (f.forfald < IDAG) trin.push(["nu", gebyr ? `Rykker ${nummer}` : "Påmindelse", kan ? "Kan sendes nu" : `Fra ${F.datoLang(naeste)}`]);
      forloeb = `<div class="kort mb-3"><div class="kort-hoved"><h2>Betaling</h2>${pille(pc, pt)}</div><ul class="tidslinje">${trin.map(([c, t, u]) => `<li class="${c}">${t}<small>${u}</small></li>`).join("")}</ul>
        ${f.forfald < IDAG ? `<button class="knap ${kan ? "p" : ""}" data-act="rykker" ${kan ? "" : "disabled aria-disabled=\"true\""}>${gebyr ? `Send rykker (gebyr 100 kr.)` : "Send påmindelse"}</button>` : ""}</div>`;
    }
    return `<div class="sh"><h2>Faktura ${f.nr}</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk graa">${forloeb}${fakturaDok(f)}</div>
      <div class="sf"><div>${f.betalt ? pille(pc, pt) : ""}</div><div class="raekke"><button class="knap" data-act="udskriv">${IC.hent} Udskriv</button>${f.status === "krediteret" || f.status === "kreditnota" ? "" : `<button class="knap" data-act="krediter" data-nr="${f.nr}">Krediter</button>`}</div></div>`;
  }

  function skuffeTb(t) {
    const [pc, pt] = TBST[t.status], kan = t.status === "sendt" || t.status === "accepteret";
    return `<div class="sh"><h2>Tilbud ${t.nr}</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk graa">${fakturaDok(t, "TILBUD")}</div>
      <div class="sf"><div>${pille(pc, pt)}</div><div class="raekke"><button class="knap" data-act="udskriv">${IC.hent} Udskriv</button>${t.status === "sendt" ? `<button class="knap" data-act="tb-svar" data-svar="afvist" data-nr="${t.nr}">Sagde nej</button>` : ""}${kan ? `<button class="knap p" data-act="til-faktura" data-nr="${t.nr}">Lav faktura</button>` : `<button class="knap" data-act="ny-tb" data-k="${t.kunde}">Nyt tilbud</button>`}</div></div>`;
  }

  function skuffeU(u) {
    const skylder = u.status === "skylder";
    return `<div class="sh"><h2>${E(u.tekst)}</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <div class="not">${F.datoLang(u.dato)} · betalt med egne penge</div><div class="raekke mellem"><div class="stort-beloeb tal">${F.kr(u.beloeb)} kr.</div>${skylder ? pille("accent", "Firmaet skylder dig") : pille("graa", `Tilbagebetalt ${F.datoLang(u.betalt_tilbage)}`)}</div>
      ${skylder ? `<div class="kort tonet mt-3"><b>Sådan får du pengene tilbage</b><ol class="not trin-liste"><li>Overfør ${F.kr(u.beloeb)} kr. fra firmaets konto til din egen.</li><li>Skriv "Udlæg ${E(u.tekst.split(",")[0])}" i teksten.</li><li>Vi ser overførslen i banken.</li></ol></div>` : ""}
      <div class="liste mt-3"><div class="li"><div class="t not">Kategori</div><span>${E(u.kat)}</span></div><div class="li"><div class="t not">Heraf moms</div><span class="tal">${F.kr(u.beloeb * 0.2)} kr.</span></div></div>
      <div class="mt-3">${F.bon({ tekst: u.tekst, beloeb: -u.beloeb, moms: "25", dato: u.dato, bilag: "U" + u.id.slice(1) }, V)}</div></div>
      <div class="sf"><span></span><button class="knap" data-act="skriv">Skriv til os</button></div>`;
  }

  function skuffeVare() {
    return `<div class="sh"><h2>Ny vare eller ydelse</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <div class="felt"><label for="v-navn">Navn</label><input class="inp" id="v-navn" placeholder="Fx Konsulenttime eller Rugbrød"></div>
      <div class="gitter g2 mt-2"><div class="felt"><label for="v-pris">Pris uden moms</label><input class="inp tal" id="v-pris" inputmode="decimal" placeholder="0,00"></div>
      <div class="felt"><label for="v-enhed">Enhed</label><select class="inp" id="v-enhed">${[["stk", "Stk."], ["time", "Time"], ["md", "Måned"], ["kg", "Kg"], ["km", "Km"], ["m", "Meter"], ["m2", "m²"], ["l", "Liter"]].map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div></div>
      <label class="flueboks mt-3"><input type="checkbox" id="v-moms" checked> Med 25 % moms</label></div>
      <div class="sf"><span></span><button class="knap p" data-act="gem-vare">Opret vare</button></div>`;
  }

  function skuffeKunde() {
    const k = S.nyKunde || {};
    return `<div class="sh"><h2>Ny kunde</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <div class="felt"><label for="cvr">CVR-nummer</label><div class="raekke"><input class="inp fyld" id="cvr" inputmode="numeric" placeholder="8 cifre" value="${E(k.cvr || "")}"><button class="knap" data-act="cvr-op">Slå op</button></div><small class="lille-tekst">Privatkunde? Lad feltet stå tomt.</small></div>
      <div class="gitter g2 mt-3">${[["Navn", "navn"], ["Adresse", "adresse"], ["Postnr. og by", "by"], ["Mail til fakturaer", "mail"]].map(([l, f]) => `<div class="felt"><label>${l}</label><input class="inp" data-nk="${f}" value="${E(k[f] || "")}"></div>`).join("")}</div>
      <div class="felt mt-3"><label>EAN (kun offentlige kunder)</label><input class="inp" data-nk="ean" inputmode="numeric" placeholder="13 cifre" value="${E(k.ean || "")}"></div>
      ${k.fundet ? `<div class="not mt-3">Fundet i CVR</div>` : ""}</div>
      <div class="sf"><span></span><button class="knap p" data-act="gem-kunde">Opret kunde</button></div>`;
  }

  function editor() {
    const e = S.ed, tb = e.type === "tilbud", f = regn(e), k = kunde(e.kunde);
    const sendes = tb ? "Du sender PDF'en til kunden" : k.ean ? "Sendes som e-faktura" : "Sendes som PDF på mail";
    return `<div class="sh"><div class="faner" role="tablist">${[["faktura", "Faktura"], ["tilbud", "Tilbud"]].map(([t, n]) => `<button role="tab" aria-selected="${e.type === t}" data-act="ed-type" data-t="${t}">${n}</button>`).join("")}</div><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div>
      <div class="sk editor-grid"><div id="edform"><div class="felt"><label for="ek" class="raekke mellem">Kunde <a href="#" data-act="ny-kunde" class="link">Ny kunde</a></label><select class="inp" id="ek" data-ed="kunde">${T.kunder.map((x) => `<option value="${x.id}" ${x.id === e.kunde ? "selected" : ""}>${E(x.navn)}</option>`).join("")}</select></div>
        ${tb ? "" : `<div class="gitter g2 mt-2"><div class="felt"><label for="eref">Reference</label><input class="inp" id="eref" data-ed="reference" value="${E(e.reference || "")}" placeholder="Fx ordrenummer"></div>
          <div class="felt"><label for="elev">Leveringsdato</label><input class="inp" id="elev" type="date" data-ed="levering" value="${E(e.levering || "")}"></div></div>`}
        ${tb ? "" : `<div class="felt mt-2"><label for="eg">Gentag</label><select class="inp" id="eg" data-ed="gentag">${["Ikke gentaget", "Hver uge", "Hver måned", "Hvert kvartal"].map((g) => `<option ${e.gentag === g ? "selected" : ""}>${g}</option>`).join("")}</select></div>`}
        <label class="flueboks mt-3"><input type="checkbox" data-ed="inkl" ${e.inkl ? "checked" : ""}> Priserne er inkl. moms</label>
        <div class="not mt-2">Linjer</div>${e.linjer.map((l, i) => `<div class="ed-linje"><select class="inp" data-ed="vt" data-i="${i}" aria-label="Vare">${T.varetyper.map((v) => `<option value="${v.id}" ${v.id === l.vt ? "selected" : ""}>${E(v.navn)}</option>`).join("")}</select>
          <input class="inp tal" data-ed="antal" data-i="${i}" value="${l.antal}" inputmode="decimal" aria-label="Antal"><input class="inp tal" data-ed="pris" data-i="${i}" value="${l.pris}" inputmode="decimal" aria-label="Pris"><button class="ikonknap" data-act="fjern-l" data-i="${i}" aria-label="Fjern linje">${IC.luk}</button></div>
          <input data-ed="tekst" data-i="${i}" value="${E(l.tekst || "")}" placeholder="Tekst (valgfri)" aria-label="Tekst på linjen" class="inp mt-1">`).join("")}
        <button class="knap lille mt-2" data-act="ny-l">${IC.plus} Tilføj linje</button></div>
        <div><div id="prev">${fakturaDok(f, tb ? "TILBUD" : "FAKTURA")}</div></div></div>
      <div class="sf"><span></span><div class="raekke"><span class="not" id="sendt-som">${sendes}</span><button class="knap p" data-act="send-f">${IC.send} ${tb ? "Opret tilbud" : e.gentag && e.gentag !== "Ikke gentaget" ? "Send og gentag" : "Send faktura"}</button></div></div>`;
  }
  // ---------------------------------------------------------------- skal/rendering ----
  const n_aabne = () => aabne().length;
  const hilsen = () => (S.route === "overblik" && V.ejer ? `Hej ${V.ejer}` : TITEL[S.route]);
  function skal(indhold) {
    const akt = S.route === "overblik" || S.route === "transaktioner" ? `<button class="knap p kun-pc" data-act="scan">${IC.upload} Send bilag</button>`
      : S.route === "rapporter" ? `<select class="inp auto" id="rapp" aria-label="Periode">${Object.entries(perioder()).map(([k, p]) => `<option value="${k}" ${k === S.rapP ? "selected" : ""}>${p[0]}</option>`).join("")}</select>`
      : S.route === "salg" ? ({ tilbud: `<button class="knap p" data-act="ny-tb">${IC.plus} Nyt tilbud</button>`, abonnementer: `<button class="knap p" data-act="nyt-abon">${IC.plus} Ny fast faktura</button>`,
        kunder: `<button class="knap p" data-act="ny-kunde">${IC.plus} Ny kunde</button>` }[S.salgTab] || `<button class="knap p" data-act="ny-f">${IC.plus} Ny faktura</button>`) : "";
    const li = (r, n) => `<a href="#${r}" ${S.route === r ? 'aria-current="page"' : ""}>${IC[r === "konto" ? "konto" : r] || IC.check}<span>${n}</span>${r === "transaktioner" && !selv() && n_aabne() ? `<span class="tael">${n_aabne()}</span>` : ""}${r === "godkend" && (S.ind || []).length ? `<span class="tael">${S.ind.length}</span>` : ""}</a>`;
    const mere = MERE().map(([r]) => r);
    const logo = (stor) => `<span class="monogram ${stor ? "stor" : ""}">${initialer(V.kort)}</span>`;
    return `<div class="app"><aside class="side"><button class="firma" data-act="skift">${logo(true)}<span class="fyld"><b>${E(V.kort)}</b><small>CVR ${E(V.cvr)}</small></span>${FIRMAER.length > 1 ? IC.ned.replace("<svg", '<svg width="16" height="16"') : ""}</button>
      <nav aria-label="Hovedmenu">${(selv() ? [["godkend", "Godkend"], ...NAV] : NAV).map(([r, n]) => li(r, n)).join("")}</nav>
      <button class="bogholder-raekke" data-act="skriv"><span class="monogram">${selv() ? "T" : "OA"}</span><span>Skriv til ${selv() ? "Tallo" : "Othman"}</span></button>
      <div class="undermenu">${UNDER.map(([r, n]) => li(r, n)).join("")}</div></aside>
      <main class="main" id="main"><header class="top"><button class="mob-firma" data-act="skift" aria-label="Virksomhed">${logo(false)}</button><h1>${E(hilsen())}</h1><div class="hoejre-side">${akt}</div></header><div class="sider" id="sider">${V.aaben ? "" : `<p class="banner">Kontoen åbner, når programmet er registreret. Du betaler intet før.</p>`}${indhold}</div></main></div>
      <nav class="bundnav" aria-label="Menu"><a href="#overblik" ${S.route === "overblik" ? 'aria-current="page"' : ""}>${IC.overblik}<span>Overblik</span></a>${selv()
        ? `<a href="#godkend" ${S.route === "godkend" ? 'aria-current="page"' : ""}>${IC.check}<span>Godkend</span>${(S.ind || []).length ? `<i class="tael">${S.ind.length}</i>` : ""}</a>`
        : `<a href="#transaktioner" ${S.route === "transaktioner" ? 'aria-current="page"' : ""}>${IC.transaktioner}<span>Betalinger</span>${n_aabne() ? `<i class="tael">${n_aabne()}</i>` : ""}</a>`}
      <button class="fab" data-act="scan" aria-label="Send bilag">${IC.scan}</button><a href="#salg" ${S.route === "salg" ? 'aria-current="page"' : ""}>${IC.salg}<span>Fakturaer</span></a><button data-act="mere" class="${mere.includes(S.route) ? "aktiv" : ""}">${IC.mere}<span>Mere</span></button></nav>`;
  }
  // Mere-arket paa telefonen: det, der ikke er i bundmenuen, plus hjaelp.
  const MERE = () => [...(selv() ? [["transaktioner", "Betalinger"]] : []), ["moms", "Moms"], ["rapporter", "Tal"], ["indstillinger", "Indstillinger"]];
  const VIEWS = { godkend, overblik, transaktioner, salg, rapporter, moms, indstillinger };
  function render() {
    if (!T) return;
    document.getElementById("app").innerHTML = skal(VIEWS[S.route]());
    document.title = hilsen() + " · Tallo";
    let h = "";
    if (S.drawer) {
      const d = S.drawer, bred = d.type === "ed";
      const indh = d.type === "t" ? skuffeT(T.transaktioner.find((x) => x.id === d.id)) : d.type === "f" ? skuffeF(T.fakturaer.find((x) => x.nr === d.nr))
        : d.type === "tb" ? skuffeTb(T.tilbud.find((x) => x.nr === d.nr)) : d.type === "u" ? skuffeU(T.udlaeg.find((x) => x.id === d.id))
        : d.type === "kunde" ? skuffeKunde() : d.type === "vare" ? skuffeVare() : d.type === "ku" ? skuffeKontoudtog(d.ku) : d.type === "ed" ? editor() : skuffeBesked();
      h += `<div class="slor" data-act="luk"></div><aside class="skuffe ${bred ? "bred" : ""}" role="dialog" aria-modal="true" aria-label="Detaljer">${indh}</aside>`;
    }
    if (S.mere) {
      h += `<div class="slor" data-act="luk"></div><div class="ark" role="dialog" aria-label="Mere"><div class="greb"></div>${MERE().map(([r, n]) => `<a href="#${r}" data-act="luk">${IC[r] || IC.check}<span>${n}</span>${r === "transaktioner" && n_aabne() ? `<span class="tael">${n_aabne()}</span>` : ""}</a>`).join("")}
        <button class="li-knap" data-act="skriv">${IC.chat}<span>${selv() ? "Skriv til Tallo" : "Skriv til Othman"}</span></button></div>`;
    }
    if (S.scan) h += scanHtml();
    const lag = document.getElementById("lag");
    const noegle = S.scan ? "scan" : S.drawer ? `${S.drawer.type}:${S.drawer.id ?? S.drawer.nr ?? ""}` : S.mere ? "mere" : "";
    const samme = !!noegle && noegle === S.lagNoegle; S.lagNoegle = noegle;
    lag.innerHTML = h; lag.classList.toggle("stille", samme);
    (S.upload || []).forEach((u) => { u.vist = true; });
    document.body.classList.toggle("har-lag", !!(S.drawer || S.scan || S.mere));
    const sk = lag.querySelector(".skuffe"); if (sk && !samme) { const f = sk.querySelector("textarea, input, select, button"); if (f && !S.keepFocus) f.focus(); }
  }
  function skuffeBesked() {
    return `<div class="sh"><h2>Skriv til ${selv() ? "Tallo" : "Othman"}</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <p class="not mt-0">Vi svarer normalt samme dag.</p><textarea class="inp hoej" id="besked" aria-label="Din besked"></textarea></div>
      <div class="sf"><span></span><button class="knap p" data-act="send-besked">Send</button></div>`;
  }
  function skuffeKontoudtog(ku) {
    return `<div class="sh"><h2>Kontoudtog: ${E(ku.kunde)}</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <table class="vtabel"><thead><tr><th>Dato</th><th class="venstre">Hvad</th><th>Beløb</th></tr></thead><tbody>${ku.linjer.map((l) => `<tr><td>${F.dato(l.dato)}</td><td class="venstre">${E(l.tekst)}</td><td>${F.kr(l.beloeb)}</td></tr>`).join("")}
      <tr class="sum"><td></td><td class="venstre">${ku.saldo > 0 ? "Kunden skylder" : "Saldo"}</td><td>${F.kr(ku.saldo)}</td></tr></tbody></table></div>
      <div class="sf"><span></span><button class="knap" data-act="udskriv">${IC.hent} Udskriv</button></div>`;
  }
  function scanHtml() {
    const filer = S.upload || [];
    return `<div class="slor" data-act="luk"></div><aside class="skuffe" role="dialog" aria-modal="true" aria-label="Send bilag"><div class="sh"><h2>Send bilag</h2><button class="ikonknap" data-act="luk" aria-label="Luk">${IC.luk}</button></div><div class="sk">
      <div class="dropzone"><div class="dz-knapper"><label class="knap p">${IC.scan} Tag billede<input type="file" id="kamera" accept="image/*" capture="environment" class="sr"></label>
        <label class="knap">Vælg filer<input type="file" id="filer" accept="image/*,application/pdf" multiple class="sr"></label></div><p class="lille-tekst">Kvitteringer og fakturaer, som billede eller PDF</p></div>
      <div class="raekke mt-3"><div class="fyld"><b>Betalt med egne penge</b><div class="lille-tekst">Firmaet skylder dig så beløbet</div></div><button class="sw" role="switch" aria-checked="${!!S.egne}" aria-label="Betalt med egne penge" data-act="egne"></button></div>
      ${filer.length ? `<div class="bonner">${filer.map((u) => `<div class="bonkort ${u.fejl ? "fejl" : ""} ${u.vist ? "" : "ny"}"><span class="mini-bon"><i></i><i></i><i></i><i></i></span>
        <div class="t"><b>${E(u.lev || u.navn)}</b>${u.beloeb != null ? `<span class="tal"> · ${F.kr(u.beloeb)} kr.</span>` : ""}
          <div class="trinlinje" aria-hidden="true">${[0, 1, 2, 3].map((n) => `<i class="${u.trin > n || (u.trin === 3 && n === 3) ? "ok" : u.trin === n ? "nu" : ""}"></i>`).join("")}</div>
          <small>${u.forslag ? `Forslag: <b>${E(u.forslag)}</b>` : E(u.tekst)}</small></div>
        ${u.forslag && u.id ? `<button class="knap lille p" data-act="godkend-selv" data-id="${u.id}">${IC.check} Godkend</button>` : u.trin === 3 && !u.fejl ? `<span class="flueben ok">${IC.check}</span>` : ""}</div>`).join("")}</div>` : ""}
      ${S.seneste?.length && !filer.length ? `<p class="lille-titel">Seneste bilag</p><div class="liste">${S.seneste.map((b) => `<div class="li"><div class="t"><b>${E(b.udtrukket?.leverandoer || b.filnavn)}</b><small>Modtaget ${F.datoLang(String(b.modtaget).slice(0, 10))}${b.udtrukket?.total != null ? ` · ${F.kr(b.udtrukket.total)} kr.` : ""}</small></div><span class="flueben ok">${IC.check}</span></div>`).join("")}</div>` : ""}
      <p class="not mt-3">Regninger på mail kan sendes til <span class="mono">${E(V.bilagsadresse)}</span></p></div></aside>`;
  }

  // ------------------------------------------------------------- data og login ----
  async function hent() {
    T = await rpc("kunde_data", { p_virksomhed: VID });
    V = T.virksomhed; IDAG = T.idag;
    if (!V.ejer) V.ejer = BRUGER.navn || "";
    // Kaldene er uafhaengige af hinanden og koeres samtidig (foer: et ad gangen, og siden var hvid imens).
    const [bank, udkast, udtraek, nh, pk, skiftet, vtm] = await Promise.all([
      rpc("bankforbindelse_status", { p_virksomhed: VID }).catch(() => []),
      rpc("kunde_udkast", { p_virksomhed: VID }).catch(() => []),
      sb.from("udtraek_bestilling").select("id, type, fra, til, status, sti, bestilt_tid").eq("virksomhed_id", VID)
        .order("bestilt_tid", { ascending: false }).limit(4),
      sb.from("nemhandel_tilmelding").select("status, besked_vist").eq("virksomhed_id", VID).maybeSingle(),
      sb.from("virksomhed").select("pakke, aaben, momsperiode, oprettet").eq("id", VID).single(),
      sb.from("pakkeskift").select("ny_pakke, fra").eq("virksomhed_id", VID).maybeSingle(),
      sb.from("varetype").select("id, momskode").eq("virksomhed_id", VID)]);
    S.bank = bank; S.udkast = udkast; S.udtraek = udtraek.data || []; S.pakkeskift = skiftet.data || null;
    const mk = Object.fromEntries((vtm.data || []).map((x) => [x.id, x.momskode]));
    T.varetyper.forEach((v) => { v.moms = mk[v.id] !== "uden_moms"; });
    S.momsTal = {}; S.kontoplan = null;
    if (S.udtraek.some((u) => u.status === "venter") && !S.udtraekPoll) S.udtraekPoll = setTimeout(() => { S.udtraekPoll = null; opdater(); }, 8000);
    S.nh = nh.data || { status: "ikke_tilmeldt" };
    const px = pk.data;
    V.pakke = px?.pakke || "fuld"; V.aaben = px?.aaben !== false; V.momsperiode = px?.momsperiode || "kvartal"; V.oprettet = String(px?.oprettet || IDAG).slice(0, 10);
    ST.behandles = V.pakke === "selv" ? ["accent", "Venter på dig"] : ["graa", "Tallo behandler"];   // i Gør det selv venter den på kunden
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
      <p class="not">Vi sender et link til din mail.</p>
      <form id="login"><div class="felt"><label for="mail">Mail</label><input class="inp" id="mail" type="email" autocomplete="email" required></div>
      ${LOKALT || DEMO ? `<div class="felt mt-2"><label for="kode">${DEMO ? "Adgangskode (kun i demoen)" : "Adgangskode (kun lokalt, til test)"}</label><input class="inp" id="kode" type="password" autocomplete="current-password"></div>` : ""}
      ${DEMO ? `<p class="demo-note">Demo: <b>mette@bageriet-kornet.dk</b>, koden <b>demo-kode-1234</b>.</p>` : ""}
      <button class="knap p fuld-bredde mt-3" type="submit">${DEMO ? "Log ind" : "Send link"}</button></form>
      ${besked ? `<p class="not mt-3" role="status">${E(besked)}</p>` : ""}</div></main>`;
    document.getElementById("login").addEventListener("submit", async (e) => {
      e.preventDefault();
      const mail = document.getElementById("mail").value.trim(), kode = document.getElementById("kode")?.value;
      if (kode) {
        const { error } = await sb.auth.signInWithPassword({ email: mail, password: kode });
        return error ? loginSide("Forkert mail eller kode.") : start();
      }
      const { error } = await sb.auth.signInWithOtp({ email: mail, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } });
      loginSide(error ? "Vi kunne ikke sende linket. Prøv igen." : `Vi har sendt et link til ${mail}. Åbn det på denne enhed.`);
    });
  }
  // Versionerne, kunden accepterer; skal foelge dokumenterne paa tallo.dk (ret her, naar et af dem faar ny version).
  const VILKAAR = { handelsbetingelser: "1.1", databehandleraftale: "1.1", privatlivspolitik: "1.2" };
  // Opstart på 2 minutter: CVR, navn, pakke. Kontoen er lukket, til Tallo åbner den.
  function tilmeldSide(besked = "", t = {}) {
    document.getElementById("lag").innerHTML = "";
    const pk = (v, navn, pris, tekst) => `<label class="pakke-valg">
      <input type="radio" name="pakke" value="${v}" ${(t.pakke || "fuld") === v ? "checked" : ""}><div><b>${navn}, ${pris} kr. om måneden</b><div class="lille-tekst">${tekst}</div></div></label>`;
    document.getElementById("app").innerHTML = `<main class="login"><div class="kort bred"><div class="logo-ord">tallo</div><h1>Kom i gang</h1>
      <p class="not">Det tager 2 minutter. Du betaler intet, før vi åbner.</p>
      <form id="tilmeld"><div class="felt"><label for="t-cvr">CVR-nummer</label><div class="raekke"><input class="inp fyld" id="t-cvr" inputmode="numeric" autocomplete="off" value="${E(t.cvr || "")}" required><button class="knap" type="button" data-act="t-cvr-op">Slå op</button></div></div>
      <div class="felt mt-2"><label for="t-navn">Virksomhedens navn</label><input class="inp" id="t-navn" value="${E(t.navn || "")}" required></div>
      <input type="hidden" id="t-vej" value="${E(t.vej || "")}"><input type="hidden" id="t-husnr" value="${E(t.husnr || "")}"><input type="hidden" id="t-postnr" value="${E(t.postnr || "")}"><input type="hidden" id="t-by" value="${E(t.by || "")}">
      <fieldset class="rent mt-3"><legend class="not">Pakke (du kan skifte når som helst)</legend>
        ${pk("selv", "Gør det selv med AI", 500, "AI'en foreslår, du godkender.")}
        ${pk("fuld", "Med bogholder", "1.000", "Vi bogfører det hele og indberetter momsen.")}</fieldset>
      <label class="flueboks mt-3"><input type="checkbox" id="t-accept" required>
        <span class="not">Jeg accepterer <a class="link" href="https://tallo.dk/handelsbetingelser/" target="_blank" rel="noopener">handelsbetingelserne</a> og <a class="link" href="https://tallo.dk/databehandleraftale/" target="_blank" rel="noopener">databehandleraftalen</a> og har læst <a class="link" href="https://tallo.dk/privatliv/" target="_blank" rel="noopener">privatlivspolitikken</a>.</span></label>
      <button class="knap p fuld-bredde mt-3" type="submit">Opret konto</button></form>
      ${besked ? `<p class="not mt-3" role="status">${E(besked)}</p>` : ""}
      <p class="lille-tekst mt-3">Logget ind som ${E(BRUGER?.mail || "")}. <a href="#" data-act="logud" class="link">Log ud</a></p></div></main>`;
    document.getElementById("tilmeld").addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = (id) => (document.getElementById(id)?.value || "").trim();
      const navn = v("t-navn"), pakke = document.querySelector('input[name="pakke"]:checked')?.value || "fuld";
      try {
        const ny = await rpc("opret_egen_virksomhed", { p_cvr: v("t-cvr"), p_navn: navn, p_pakke: pakke, p_klasse: /\b(ApS|A\/S|IVS|P\/S)$/i.test(navn) ? "B" : "A",
          p_vej: v("t-vej") || null, p_husnr: v("t-husnr") || null, p_postnr: v("t-postnr") || null, p_by: v("t-by") || null });
        await rpc("accepter_vilkaar", { p_virksomhed: ny, p_dokumenter: VILKAAR });
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
      if (!T) document.getElementById("app").innerHTML = `<main class="login"><div class="kort" role="status"><div class="logo-ord">tallo</div><p class="not">Henter dine tal ...</p></div></main>`;
      await hent();
    } catch (err) {
      document.getElementById("app").innerHTML = `<main class="login"><div class="kort"><h1>Noget gik galt</h1><p class="not">${E(err.message)}</p><button class="knap" data-act="genindlaes">Prøv igen</button></div></main>`;
      return;
    }
    rute();
  }

  // ------------------------------------------------------------- haendelser ----
  function aabn(d) { S.drawer = d; S.mere = false; render(); }
  const STILLE = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  function luk() {
    const lag = document.getElementById("lag"), nu = () => { lag.classList.remove("lukker"); S.drawer = null; S.mere = false; S.scan = false; S.upload = []; render(); };
    if (lag.classList.contains("lukker")) return;
    if (!lag.children.length || STILLE()) return nu();
    lag.classList.add("lukker"); setTimeout(nu, 170);
  }
  const tekstfelt = () => (document.getElementById("besked")?.value || "").trim();
  const HVOR = { "Hver uge": ["uge", 7], "Hver måned": ["maaned", 30], "Hvert kvartal": ["kvartal", 91] };

  // Én post godkendt med en kategori (bruges af Godkend og Godkend alle).
  async function godkendEn(x, nr) {
    const f = x.forslag || {}, k = (S.kat || []).find((y) => y.nummer === nr), mk = nr === f.konto && f.momskode ? f.momskode : k?.momskode || null;
    if (x.type === "bank") return rpc("kunde_bogfoer_banklinje", { p_banktransaktion: x.id, p_konto: nr, p_momskode: mk });
    const lev = (S.kat || []).find((y) => y.type === "status" && /leverandører af varer.*kortfristet/i.test(y.navn))?.nummer;
    const ejer = (S.kat || []).find((y) => y.funktion === "ejer")?.nummer;
    return rpc("kunde_bogfoer_bilag", { p_bilag: x.id, p_konto: nr, p_momskode: mk, p_banktransaktion: f.banktransaktion_id || null,
      p_modkonto: f.banktransaktion_id ? null : f.udlaeg ? ejer : lev });
  }

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
    if (a === "godkend-alle") {
      const alle = (S.ind || []).filter((x) => x.forslag?.konto);
      if (!confirm(`Godkend ${alle.length} med de foreslåede kategorier?`)) return;
      let ok = 0;
      for (const x of alle) { try { await godkendEn(x, x.forslag.konto); ok++; } catch { /* den bliver staaende */ } }
      return opdater(ok === alle.length ? `${ok} godkendt` : `${ok} af ${alle.length} godkendt; resten står her stadig`);
    }
    if (a === "godkend-selv" || a === "afvis-selv") {
      const x = (S.ind || []).find((y) => y.id === id), f = x.forslag || {};
      if (a === "afvis-selv") {
        await rpc("kunde_afvis_bilag", { p_bilag: id, p_begrundelse: "Ikke et bilag (afvist af kunden)" });
        return opdater("Fjernet");
      }
      const nr = document.getElementById("kat-" + id)?.value || f.konto;
      if (!nr) return F.toast("Vælg en kategori først.");
      await godkendEn(x, nr);
      const bon = (S.upload || []).find((u) => u.id === id);   // godkendt direkte fra scanningen
      if (bon) Object.assign(bon, { forslag: null, tekst: `Bogført som ${KATNAVN(nr)}` });
      return opdater(`Godkendt: ${x.tekst} som ${KATNAVN(nr)}`);
    }
    if (a === "ny-vare") { S.drawer = { type: "vare" }; return render(); }
    if (a === "ffilter") { S.fFilter = el.dataset.f; return render(); }
    if (a === "skjul") { localStorage.setItem(`tallo-skjul-${VID}-${el.dataset.n}`, "1"); return render(); }
    if (a === "moms-passer") { localStorage.setItem(`tallo-skjul-${VID}-momsperiode`, "1"); F.toast("Tak. Er det forkert senere, så skriv til os"); return render(); }
    if (a === "gem-vare") {
      const v = (id) => (document.getElementById(id)?.value || "").trim();
      const pris = +v("v-pris").replace(/\./g, "").replace(",", ".");
      if (!v("v-navn") || !(pris >= 0) || v("v-pris") === "") return F.toast("Skriv navn og pris");
      await rpc("kunde_opret_vare", { p_virksomhed: VID, p_navn: v("v-navn"), p_pris: pris, p_enhed: v("v-enhed"), p_moms: document.getElementById("v-moms").checked });
      S.drawer = null; return opdater(`${v("v-navn")} er oprettet`);
    }
    if (a === "skift-pakke") {
      const p = el.dataset.p, navn = p === "selv" ? "Gør det selv med AI" : "Med bogholder";
      if (p !== V.pakke && !confirm(`Skift til ${navn} fra den 1. i næste måned?`)) return;
      const fra = await rpc("kunde_skift_pakke", { p_virksomhed: VID, p_pakke: p });
      return opdater(fra ? `Du skifter til ${navn} fra ${F.datoLang(fra)}` : "Skiftet er fortrudt");
    }
    if (a === "stop-abon") {
      if (!confirm("Stop den faste faktura? Der sendes ikke flere. Sendte fakturaer berøres ikke.")) return;
      await rpc("stop_abonnement", { p_abonnement: el.dataset.id });
      return opdater("Den faste faktura er stoppet");
    }
    if (a === "tb-svar") {
      const t = T.tilbud.find((x) => x.nr === el.dataset.nr);
      await rpc("tilbud_svar", { p_tilbud: t.id, p_svar: el.dataset.svar });
      S.drawer = null; return opdater(`Tilbud ${t.nr} er markeret som afvist`);
    }
    if (a === "se-bilag" || a === "ret-fejl") {
      e.preventDefault();
      const { data: p } = await sb.from("postering").select("id, bilag:bilag_id (sha256)").eq("virksomhed_id", VID).eq("nummer", +el.dataset.nr).maybeSingle();
      if (!p) return F.toast("Bogføringen findes ikke");
      if (a === "se-bilag") {
        if (!p.bilag) return F.toast("Der er ikke noget bilag på denne bogføring, fx fordi det er et bankgebyr eller en fast regel");
        const { data: u } = await sb.storage.from("bilag").createSignedUrl(`${VID}/${p.bilag.sha256}`, 600);
        if (!u?.signedUrl) return F.toast("Bilaget kunne ikke hentes");
        return window.open(u.signedUrl, "_blank", "noopener");
      }
      const grund = prompt("Hvad var forkert? (Det gemmes ved rettelsen.)");
      if (!grund || !grund.trim()) return;
      await rpc("kunde_tilbagefoer", { p_postering: p.id, p_begrundelse: grund.trim() });
      S.drawer = null; return opdater("Bogføringen er tilbageført. Posten ligger igen under Godkend");
    }
    if (a === "moms-indberettet") {
      const k = T.kvartaler[S.momsK], kvit = (document.getElementById("kvit")?.value || "").trim();
      if (!kvit) return F.toast("Skriv kvitteringsnummeret fra TastSelv");
      if (!confirm(`Registrér momsen for ${k.navn} som indberettet med kvittering ${kvit}? Perioden låses.`)) return;
      await rpc("kunde_registrer_indberetning", { p_virksomhed: VID, p_fra: k.fra, p_til: k.til, p_kvittering: kvit });
      return opdater(`Momsen for ${k.navn} er registreret som indberettet`);
    }
    if (a === "send-f") {
      const ed = S.ed, k = kunde(ed.kunde);
      const linjer = regn(ed).linjer.map((r2, i) => ({ varetype: ed.linjer[i].vt, antal: r2.antal || 1, enhedspris: r2.pris, ...((ed.linjer[i].tekst || "").trim() ? { beskrivelse: ed.linjer[i].tekst.trim() } : {}) }));
      if (ed.type === "tilbud") {
        const t = await rpc("opret_tilbud", { p_virksomhed: VID, p_debitor: ed.kunde, p_linjer: linjer });
        const r = await rpc("send_tilbud", { p_tilbud: t });
        S.drawer = null; S.salgTab = "tilbud"; location.hash = "salg";
        return opdater(`Tilbud T-${r.nummer} til ${k.navn} er oprettet. Udskriv det som PDF, og send det til kunden.`);
      }
      const f = await rpc("kunde_opret_faktura", { p_virksomhed: VID, p_debitor: ed.kunde, p_linjer: linjer, p_reference: (ed.reference || "").trim() || null, p_leveringsdato: ed.levering || null });
      const r = await rpc("kunde_send_faktura", { p_faktura: f });
      let tekst = `Faktura ${r.nummer} er udstedt og sendes ${r.sendt_som === "efaktura" ? "som e-faktura" : "som PDF på mail"}`;
      if (HVOR[ed.gentag]) {
        await rpc("opret_abonnement", { p_virksomhed: VID, p_debitor: ed.kunde, p_linjer: linjer, p_hvor_ofte: HVOR[ed.gentag][0], p_start: plusDage(IDAG, HVOR[ed.gentag][1]) });
        tekst += `, og den gentages ${ed.gentag.toLowerCase()}`; S.salgTab = "abonnementer";
      } else S.salgTab = "fakturaer";
      S.drawer = null; location.hash = "salg";
      return opdater(tekst);
    }
    if (a === "udtraek") {
      const saft = el.dataset.type === "saft";
      await rpc("bestil_udtraek", { p_virksomhed: VID, p_type: el.dataset.type, p_fra: saft ? IDAG.slice(0, 4) + "-01-01" : null, p_til: saft ? IDAG : null });
      return opdater(saft ? "Standardfilen dannes. Den står klar her om et øjeblik" : "Din bogføring pakkes. Den står klar her om et øjeblik");
    }
    if (a === "hent-udtraek") {
      const { data } = await sb.storage.from("udtraek").createSignedUrl(el.dataset.sti, 300, { download: el.dataset.navn || true });
      if (!data?.signedUrl) throw new Fejl("Filen kunne ikke hentes. Prøv igen.");
      location.assign(data.signedUrl); return;
    }
    if (a === "nh-ja") {
      await rpc("nemhandel_accepter", { p_virksomhed: VID });
      return opdater("Tak. Vi tilmelder dig Nemhandel og skriver, når det er sket");
    }
    if (a === "nh-nej") {
      await rpc("nemhandel_sig_nej", { p_virksomhed: VID });
      return opdater("Fint. Du kan altid ændre det under Indstillinger, Fakturaer");
    }
    if (a === "udkast-send") {
      const x = S.udkast.find((u) => u.id === el.dataset.id);
      if (!confirm(`Send fakturaen på ${F.kr(x.total)} kr. til ${kunde(x.kunde).navn}?`)) return;
      const r = await rpc("kunde_send_faktura", { p_faktura: x.id });
      return opdater(`Faktura ${r.nummer} er udstedt og sendes ${r.sendt_som === "efaktura" ? "som e-faktura" : "som PDF på mail"}`);
    }
    if (a === "udkast-slet") {
      if (!confirm("Slet udkastet?")) return;
      await rpc("kunde_slet_udkast", { p_faktura: el.dataset.id });
      return opdater("Udkastet er slettet");
    }
    if (a === "ai-kopier") { await navigator.clipboard.writeText(MCP_URL).catch(() => {}); return F.toast("Adressen er kopieret"); }
    if (a === "ai-fjern") {
      if (!confirm("Slå forbindelsen fra? Din AI kan så ikke længere se dine tal.")) return;
      const { error } = await sb.auth.oauth.revokeGrant({ clientId: el.dataset.id });
      if (error) throw new Fejl("Forbindelsen kunne ikke slås fra. Prøv igen.");
      S.grants = null; await hentGrants(); render(); return F.toast("Forbindelsen er slået fra");
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
      return F.toast(`Beskeden er sendt til ${selv() ? "Tallo" : "Othman"}`);
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
      const { data, error } = await sb.from("debitor").insert({ virksomhed_id: VID, navn: v("navn"), cvr: (document.getElementById("cvr")?.value || "").replace(/\D/g, "") || S.nyKunde?.cvr || null, adresse_vej: v("adresse") || null,
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
    const sk = e.target.closest("[data-skjul]"); if (sk && VID) { localStorage.setItem(`tallo-skjul-${VID}-${sk.dataset.skjul}`, "1"); setTimeout(render, 300); }
    const el = e.target.closest("[data-act]"); if (!el) return;
    const a = el.dataset.act, id = el.dataset.id;
    if (a === "genindlaes") return location.reload();
    if (a === "logud") { e.preventDefault(); return logUd(); }
    if (a === "t-cvr-op") return handling(a, el, e).catch((err) => F.toast(err.message));
    if (!T) return;
    maal(S.route, el.dataset.t ? `${a}-${el.dataset.t}` : a);
    if (a === "luk") { if (el.tagName === "A") { S.mere = false; S.drawer = null; render(); return; } return luk(); }
    if (a === "aabn-t") return aabn({ type: "t", id });
    if (a === "aabn-f") return aabn({ type: "f", nr: +el.dataset.nr });
    if (a === "skriv") return aabn({ type: "besked" });
    if (a === "ny-f" || a === "ny-tb" || a === "nyt-abon") {
      if (!T.varetyper.length) { S.drawer = { type: "vare" }; F.toast("Opret først en vare eller ydelse, du sælger"); return render(); }
      const vt = T.varetyper[0];
      const kid = el.dataset.k || T.kunder[0]?.id;
      S.ed = { type: a === "ny-tb" ? "tilbud" : "faktura", gentag: a === "nyt-abon" ? "Hver måned" : "Ikke gentaget", kunde: kid, inkl: !kunde(kid)?.cvr, linjer: [] };
      S.ed.linjer.push({ vt: vt.id, antal: 1, pris: medMoms(vt, vt.pris) });
      if (!S.ed.kunde) { S.nyKunde = {}; return aabn({ type: "kunde" }); }
      return aabn({ type: "ed" });
    }
    if (a === "ed-type") { S.ed.type = el.dataset.t; return render(); }
    if (a === "aabn-tb") return aabn({ type: "tb", nr: el.dataset.nr });
    if (a === "aabn-u") return aabn({ type: "u", id });
    if (a === "ny-kunde") { e.preventDefault(); S.nyKunde = {}; return aabn({ type: "kunde" }); }
    if (a === "egne") { S.egne = !S.egne; return render(); }
    if (a === "filter-gaa") { if (e.target.closest("button")) return; S.filter = el.dataset.f; S.sideN = 30; if (location.hash === "#transaktioner") return render(); location.hash = "transaktioner"; return; }
    if (a === "scan") {
      S.drawer = null; S.mere = false; S.scan = true; S.upload = []; render();
      // Kvittering for det, der er sendt: de seneste bilag (anmeldelserne: "Fik jeg nu indsendt det bilag?")
      const { data } = await sb.from("bilag").select("filnavn, modtaget, udtrukket").eq("virksomhed_id", VID).order("modtaget", { ascending: false }).limit(5);
      S.seneste = data || []; return render();
    }
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
    if (a === "ny-l") { const vt = T.varetyper[0]; S.ed.linjer.push({ vt: vt.id, antal: 1, pris: medMoms(vt, vt.pris) }); S.keepFocus = true; render(); S.keepFocus = false; return; }
    if (a === "fjern-l") { if (S.ed.linjer.length > 1) S.ed.linjer.splice(+el.dataset.i, 1); S.keepFocus = true; render(); S.keepFocus = false; return; }
    el.disabled = true;
    try { await handling(a, el, e); } catch (err) { F.toast(err instanceof Fejl ? err.message : "Det gik ikke. Prøv igen om lidt, eller skriv til os, hvis det bliver ved."); } finally { el.disabled = false; }
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
    else if (ed === "vt") { const vt = T.varetyper.find((v) => v.id === e.target.value); S.ed.linjer[i].vt = vt.id; S.ed.linjer[i].pris = medMoms(vt, vt.pris); const p = document.querySelector(`[data-ed="pris"][data-i="${i}"]`); if (p) p.value = S.ed.linjer[i].pris; }
    else if (ed === "inkl") {
      S.ed.inkl = e.target.checked;
      S.ed.linjer.forEach((l) => { const vt = T.varetyper.find((v) => v.id === l.vt); if (vt?.moms !== false) l.pris = Math.round((+l.pris || 0) * (S.ed.inkl ? 1.25 : 0.8) * 100) / 100; });
      S.keepFocus = true; render(); S.keepFocus = false; return;
    }
    else if (ed === "tekst") S.ed.linjer[i].tekst = e.target.value;
    else if (ed === "reference" || ed === "levering") S.ed[ed] = e.target.value;
    else S.ed.linjer[i][ed] = e.target.value.replace(",", ".");
    document.getElementById("prev").innerHTML = fakturaDok(regn(S.ed), S.ed.type === "tilbud" ? "TILBUD" : "FAKTURA");
    const k = kunde(S.ed.kunde); document.getElementById("sendt-som").textContent = S.ed.type !== "tilbud" && k.ean ? "Sendes som e-faktura" : "Sendes som PDF på mail";
  });
  document.addEventListener("change", async (e) => {
    if (e.target.dataset.kat) { const b = document.querySelector(`[data-act="godkend-selv"][data-id="${e.target.dataset.kat}"]`); if (b) b.disabled = !e.target.value; }
    if (e.target.id === "rapp") { S.rapP = e.target.value; return render(); }
    if (e.target.id === "frist") {
      try { await rpc("saet_indstillinger", { p_virksomhed: VID, p_betalingsfrist: +e.target.value }); await opdater("Betalingsfristen er gemt"); }
      catch (err) { F.toast(err.message); }
      return;
    }
    if (e.target.id === "filer" || e.target.id === "kamera") {
      // "Bilaget bogfører sig selv" (Othman 20. okt): hvert bilag lander som en bon og viser trin for trin, hvad der
      // faktisk sker: sendt, læses, læst (leverandør og beløb) og forslag eller "vi bogfører den". Aldrig mere end sket.
      const filer = [...e.target.files];
      const nye = filer.map((f) => ({ navn: f.name, trin: 0, tekst: "Sendes", id: null }));
      S.upload = [...nye, ...(S.upload || [])]; render();
      const opd = (u, ny) => { Object.assign(u, ny); render(); };
      const ventLaes = (p) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), 30000))]);
      let ok = 0;
      await Promise.all(nye.map(async (u, k) => {
        try {
          const r = await sendBilag(VID, filer[k], !!S.egne);
          if (r.dublet) return opd(u, { trin: 3, tekst: "Den har vi allerede fået", fejl: false });
          ok++; opd(u, { trin: 1, tekst: "Modtaget. Vi læser den nu.", id: r.bilag_id });
          const svar = await ventLaes(r.laes);
          if (!svar?.laest) return opd(u, { trin: 3, tekst: "Modtaget. Vi læser den om lidt." });
          const { data: b } = await sb.from("bilag").select("udtrukket").eq("id", r.bilag_id).maybeSingle();
          const ud = b?.udtrukket || {};
          opd(u, { trin: 2, lev: ud.leverandoer || "", beloeb: ud.total, tekst: "Læst" });
          if (selv()) {
            S.ind = await rpc("kunde_indbakke", { p_virksomhed: VID }).catch(() => S.ind);
            const x = (S.ind || []).find((y) => y.id === r.bilag_id);
            opd(u, x?.forslag?.konto ? { trin: 3, forslag: KATNAVN(x.forslag.konto), tekst: "Forslag klar" } : { trin: 3, tekst: "Vælg en kategori under Godkend" });
          } else opd(u, { trin: 3, tekst: "Vi bogfører den" });
        } catch (err) { opd(u, { trin: 3, fejl: true, tekst: err.message }); }
      }));
      if (ok) { await hent(); render(); }
    }
  });
  // Gamle adresser (menuen blev samlet 20. okt 2026) sender videre til det nye sted.
  const VIDERE = { likviditet: ["rapporter"], udgifter: ["transaktioner", () => { S.filter = "udgifter"; }], integrationer: ["indstillinger", () => { S.indTab = "forbindelser"; }],
    konto: ["indstillinger", () => { S.indTab = "firma"; }] };
  function rute() {
    let r = location.hash.slice(1); if (VIDERE[r]) { VIDERE[r][1]?.(); history.replaceState(null, "", "#" + VIDERE[r][0]); r = VIDERE[r][0]; }
    const skift = VIEWS[r] && r !== S.route && T;
    const tegn = () => { if (VIEWS[r]) { S.route = r; S.drawer = null; S.mere = false; window.scrollTo(0, 0); } render(); };
    if (skift && document.startViewTransition && !STILLE()) document.startViewTransition(tegn); else tegn();
    maal(S.route);
  }

  // Træk ned for at lukke (mobil): arket "Mere" og skufferne i fuld skærm, fra toppen.
  let traek = null;
  document.addEventListener("touchstart", (e) => {
    const greb = e.target.closest(".ark, .skuffe .sh"); if (!greb || !matchMedia("(max-width: 900px)").matches) return;
    traek = { panel: greb.closest(".ark, .skuffe"), y0: e.touches[0].clientY, dy: 0 };
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!traek) return; traek.dy = Math.max(0, e.touches[0].clientY - traek.y0);
    traek.panel.style.transition = "none"; traek.panel.style.transform = `translateY(${traek.dy}px)`;
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (!traek) return; const { panel, dy } = traek; traek = null;
    panel.style.transition = "transform var(--hurtig) var(--let)";
    if (dy < 90) { panel.style.transform = ""; return; }
    panel.style.transform = "translateY(100%)"; document.getElementById("lag").querySelector(".slor")?.classList.add("vaek");
    setTimeout(() => { S.drawer = null; S.mere = false; S.scan = false; S.upload = []; render(); }, 180);
  });

  // Maaling (Othman 20. okt 2026): hvilke skaerme og knapper der bruges, saa appens indhold bygger paa adfaerd og ikke
  // paa gaetteri. Kun skaerm, knappens navn, pakke og et tilfaeldigt sessions-id; sendes i portioner og stille, og en
  // fejl stopper aldrig appen. Tabellen er brug (kun indsaettelse for egen virksomhed; slettes efter 13 maaneder).
  const MAAL = { koe: [], session: crypto.randomUUID ? crypto.randomUUID() : null };
  const rens = (x) => (x ? String(x).toLowerCase().replace(/[^a-z_-]/g, "-").slice(0, 40) : null);
  function maal(skaerm, handling) {
    if (!VID || !V || !MAAL.session || !rens(skaerm)) return;
    MAAL.koe.push({ virksomhed_id: VID, pakke: V.pakke || null, skaerm: rens(skaerm), handling: rens(handling), session: MAAL.session });
    if (MAAL.koe.length >= 20) sendMaal();
  }
  function sendMaal() {
    if (!MAAL.koe.length) return;
    const rows = MAAL.koe.splice(0);
    try { sb.from("brug").insert(rows).then(() => {}, () => {}); } catch { /* maalingen maa aldrig stoppe appen */ }
  }
  setInterval(sendMaal, 15000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") sendMaal(); });
  window.addEventListener("hashchange", rute);
  window.addEventListener("scroll", () => document.body.classList.toggle("rullet", window.scrollY > 4), { passive: true });
  sb.auth.onAuthStateChange((hvad) => { if (hvad === "SIGNED_OUT") { T = null; loginSide(); } });

  const lag = document.createElement("div"); lag.id = "lag"; document.body.appendChild(lag);
  const app = document.createElement("div"); app.id = "app"; document.body.insertBefore(app, lag);
  start();
