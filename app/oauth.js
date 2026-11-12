// Samtykke, naar kundens egen AI (Claude, ChatGPT ...) vil forbindes til Tallo over MCP.
// Supabase Auth sender kunden hertil med ?authorization_id=...; kunden logger ind med sit
// almindelige Tallo-login og siger ja eller nej. Hvad AI'en maa, afgoeres i databasen (oauth_vagt).
import { DEMO, LOKALT, sb } from "../felles/data.js?v=20261112195147";

const app = document.getElementById("app");
const id = new URLSearchParams(location.search).get("authorization_id") || "";
// Maa ikke kunne lukkes ind i en ramme paa en anden side (ellers kan man narre brugeren til at trykke Tillad).
if (window.top !== window.self) {
  document.documentElement.hidden = true;
  throw new Error("Samtykket kan ikke vises i en ramme");
}
// Kun https, eller http til brugerens egen maskine (lokale AI-programmer). Aldrig javascript: eller lignende.
const sikkerAdresse = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || (u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname));
  } catch { return false; }
};
const gaaTil = (url) => {
  if (sikkerAdresse(url)) return location.assign(url);
  side(`<h1>Adressen ser forkert ud</h1><p class="not">Tallo sender dig ikke videre. Start forbindelsen igen fra din AI.</p>`);
};
const E = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function side(indhold) {
  app.innerHTML = `<main class="login"><div class="kort samtykke"><div class="logo-ord">tallo</div>${indhold}</div></main>`;
}

function loginSide(besked = "") {
  side(`<h1>Log ind</h1><p class="not">Log ind med din Tallo-konto for at forbinde din AI.</p>
    <form id="login"><div class="felt"><label for="mail">Mail</label><input class="inp" id="mail" type="email" autocomplete="email" required></div>
    ${LOKALT || DEMO ? `<div class="felt" style="margin-top:12px"><label for="kode">Adgangskode (${DEMO ? "kun i demoen" : "kun lokalt"})</label><input class="inp" id="kode" type="password" autocomplete="current-password"></div>` : ""}
    <button class="knap p" style="margin-top:16px;width:100%;justify-content:center" type="submit">${LOKALT || DEMO ? "Log ind" : "Send link"}</button></form>
    ${besked ? `<p class="not" role="status" style="margin-top:14px">${E(besked)}</p>` : ""}`);
  document.getElementById("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const mail = document.getElementById("mail").value.trim(), kode = document.getElementById("kode")?.value;
    if (kode) {
      const { error } = await sb.auth.signInWithPassword({ email: mail, password: kode });
      return error ? loginSide("Forkert mail eller kode.") : start();
    }
    const { error } = await sb.auth.signInWithOtp({ email: mail, options: { emailRedirectTo: location.href, shouldCreateUser: false } });
    loginSide(error ? "Vi kunne ikke sende linket. Er det den mail, du er kunde med?" : `Vi har sendt et link til ${mail}. Åbn det på denne enhed.`);
  });
}

async function svar(ja) {
  for (const k of app.querySelectorAll("button")) k.disabled = true;
  const { data, error } = ja ? await sb.auth.oauth.approveAuthorization(id) : await sb.auth.oauth.denyAuthorization(id);
  if (error) return side(`<h1>Det gik ikke</h1><p class="not">${E(error.message)}</p><p class="not">Prøv at forbinde igen fra din AI.</p>`);
  if (data?.redirect_url) gaaTil(data.redirect_url);
}

async function start() {
  if (!/^[\w-]{8,}$/.test(id)) return side(`<h1>Linket mangler noget</h1><p class="not">Start forbindelsen igen fra din AI, fx under Connectors i Claude eller ChatGPT.</p>`);
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return loginSide();
  const { data: d, error } = await sb.auth.oauth.getAuthorizationDetails(id);
  if (error) return side(`<h1>Forbindelsen er udløbet</h1><p class="not">${E(error.message)}</p><p class="not">Start den igen fra din AI.</p>`);
  if (d?.redirect_url && !d.client) return gaaTil(d.redirect_url);    // allerede godkendt tidligere
  const navn = d?.client?.name || d?.client?.client_name || "Din AI";
  if (d?.redirect_uri && !sikkerAdresse(d.redirect_uri)) return gaaTil(d.redirect_uri);
  let vaert = "";
  try { vaert = new URL(d?.redirect_uri).host; } catch { /* vises ikke */ }
  side(`<h1>${E(navn)} vil forbindes til Tallo</h1>
    <p class="not">Du er logget ind som ${E(s.session.user.email)}. ${E(navn)} får adgang til de virksomheder, du selv har adgang til.</p>
    <h2>Den må</h2><ul><li>læse dine tal: overblik, resultat, poster, moms og fakturaer</li><li>lave udkast til fakturaer, som du selv sender i appen</li></ul>
    <h2>Den må aldrig</h2><ul><li>bogføre, sende fakturaer eller indberette moms</li><li>slette noget eller lægge bilag ind</li></ul>
    <p class="not" style="margin-top:16px;font-size:13px">Det, du spørger om, sendes til ${E(navn)}s udbyder, ikke til Tallo. Du kan altid slå forbindelsen fra igen.</p>
    ${vaert ? `<p class="not" style="margin-top:8px;font-size:13px">Navnet er oplyst af tjenesten selv. Efter dit svar sendes du til <b>${E(vaert)}</b>. Kender du ikke adressen, så tryk Afvis.</p>` : ""}
    <div class="knapper"><button class="knap" data-svar="nej">Afvis</button><button class="knap p" data-svar="ja">Tillad</button></div>`);
  for (const k of app.querySelectorAll("[data-svar]")) k.addEventListener("click", () => svar(k.dataset.svar === "ja"));
}

start();
