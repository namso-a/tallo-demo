// Fælles hjælpere: tal og datoer på dansk, ikoner, udseendevælger, små tegnede bilag.
(function () {
  const MN = ["jan.", "feb.", "mar.", "apr.", "maj", "jun.", "jul.", "aug.", "sep.", "okt.", "nov.", "dec."];
  const MNL = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];
  const n2 = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const n0 = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });
  const d = (s) => new Date(s + "T00:00:00");

  const I = (p, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
  const ICON = {
    overblik: I('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
    transaktioner: I('<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
    salg: I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
    udgifter: I('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    likviditet: I('<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>'),
    rapporter: I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18"/>'),
    moms: I('<path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-6 10 6"/>'),
    integrationer: I('<path d="M9 7V3M15 7V3M7 7h10v5a5 5 0 0 1-10 0zM12 17v4"/>'),
    indstillinger: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    konto: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    soeg: I('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
    filter: I('<path d="M3 5h18l-7 8v6l-4 2v-8z"/>'),
    upload: I('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'),
    scan: I('<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.2"/>'),
    luk: I('<path d="M18 6 6 18M6 6l12 12"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'),
    send: I('<path d="m22 2-11 11M22 2l-7 20-4-9-9-4z"/>'),
    hent: I('<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>'),
    papir: I('<path d="m21 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.5-8.6a3.7 3.7 0 0 1 5.2 5.3l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/>'),
    bank: I('<path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-6 10 6"/>'),
    mere: I('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
    hjem: I('<path d="m3 11 9-8 9 8M5 10v10h14V10"/>'),
    ned: I('<path d="m6 9 6 6 6-6"/>'),
    check: I('<path d="m5 12 5 5 9-10"/>'),
    chat: I('<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-5.6A8 8 0 1 1 21 12z"/>'),
  };

  function skinvaelger(links) {
    const navne = { stempel: "Stempelblæk", dagslys: "Dagslys", natbord: "Natbord" };
    const el = document.createElement("div");
    el.className = "skinvaelger";
    el.innerHTML = '<span>Udseende</span>' + Object.entries(navne).map(([k, v]) => `<button data-skin-valg="${k}" aria-pressed="false">${v}</button>`).join("") + (links || "");
    document.body.appendChild(el);
    const sæt = (s) => {
      document.documentElement.dataset.skin = s;
      try { localStorage.setItem("tallo-skin", s); } catch (e) { /* intet */ }
      el.querySelectorAll("[data-skin-valg]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.skinValg === s)));
    };
    el.addEventListener("click", (e) => { const b = e.target.closest("[data-skin-valg]"); if (b) sæt(b.dataset.skinValg); });
    const url = new URLSearchParams(location.search).get("skin");
    let start = "stempel";
    try { start = localStorage.getItem("tallo-skin") || start; } catch (e) { /* intet */ }
    sæt(navne[url] ? url : start);
  }

  window.F = {
    ICON,
    kr: (n) => n2.format(n),
    kr0: (n) => n0.format(n),
    dkk: (n) => n2.format(n) + " DKK",
    dato: (s) => { const x = d(s); return x.getDate() + ". " + MN[x.getMonth()] + " " + x.getFullYear(); },
    datoKort: (s) => { const x = d(s); return x.getDate() + ". " + MN[x.getMonth()]; },
    datoLang: (s) => { const x = d(s); return x.getDate() + ". " + MNL[x.getMonth()] + " " + x.getFullYear(); },
    maaned: (m) => MNL[m - 1],
    maanedKort: (m) => MN[m - 1].replace(".", ""),
    esc: (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    skinvaelger,
    toast(tekst) {
      document.querySelectorAll(".toast").forEach((t) => t.remove());
      const t = document.createElement("div");
      t.className = "toast"; t.setAttribute("role", "status"); t.textContent = tekst;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 2800);
    },
    /** Et tegnet kassebon-/fakturabilag ud fra en transaktion. */
    bon(t, v) {
      const brutto = Math.abs(t.beloeb), moms = t.moms === "25" ? brutto * 0.2 : 0;
      const afs = t.tekst.replace(/,.*$/, "").replace(/ udbetaling.*/, "");
      const ADR = { Bagergrossisten: ["Industrivej 4, 2600 Glostrup", "10150817"], Storkøb: ["Hammerholmen 5, 2650 Hvidovre", "29403473"], Mejeriet: ["Mejerivej 2, 8362 Hørning", "35812964"],
        Ørsted: ["Kraftværksvej 53, 7000 Fredericia", "55133018"], Emballage: ["Havnegade 9, 7100 Vejle", "41208835"], Telenor: ["Frederikskaj 2, 1790 København V", "38201447"],
        Shopify: ["Dublin, Irland", ""], Google: ["Dublin, Irland", ""], Hornbach: ["Hovedvejen 5, 8260 Viby J", "27391155"], Bauhaus: ["Ringvejen 2, 8000 Aarhus C", "22950718"], Tryg: ["Klausdalsbrovej 601, 2750 Ballerup", "24260666"], "Circle K": ["Vejlevej 20, 7000 Fredericia", "26899190"] };
      const hit = Object.keys(ADR).find((k) => afs.startsWith(k)) || "";
      const [adr, cvr] = ADR[hit] || ["Danmark", ""];
      const linjer = brutto > 3000 ? [["Varer, ass.", brutto * 0.6], ["Varer, ass. 2", brutto * 0.25], ["Emballage", brutto * 0.15]] : [["Varer", brutto]];
      return `<div class="bon"><div class="m"><b>${F.esc(afs.toUpperCase())}</b><br>${F.esc(adr)}${cvr ? "<br>CVR " + cvr : ""}</div><hr>` +
        linjer.map(([a, b]) => `<div class="l"><span>${a}</span><span>${F.kr(b)}</span></div>`).join("") + `<hr>` +
        (moms ? `<div class="l"><span>Heraf moms 25 %</span><span>${F.kr(moms)}</span></div>` : "") +
        `<div class="l t"><span>I ALT</span><span>${F.kr(brutto)}</span></div><hr><div class="l"><span>Dankort</span><span>${F.kr(brutto)}</span></div>` +
        `<div class="m" style="margin-top:8px">Bon ${t.bilag || ""} · ${F.datoKort(t.dato)} 07.12</div></div>`;
    },
  };
})();
