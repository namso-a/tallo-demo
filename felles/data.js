// Forbindelsen til Tallos database. Al logik ligger i databasen (RLS og funktioner); appen kalder kun.
import { createClient } from "../vendor/supabase-2.117.2.js";
import { DEMO, LOKALT, SUPABASE_ANON, SUPABASE_URL } from "./config.js";

// Kundens app og arbejdsbordet ligger paa samme adresse; hver sit login, saa de ikke overskriver hinanden.
const APP = location.pathname.includes("/bord") ? "bord" : "app";
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true, detectSessionInUrl: true, storageKey: `tallo-${APP}` } });
export { DEMO, LOKALT };

let fejltekster = null;

/** Fejl fra databasen som klar tekst: TA-koderne har en forklaring i tabellen fejlkode. */
export async function fejltekst(err) {
  if (!err) return "";
  const kode = err.code || "";
  if (kode === "42501") return "Det har du ikke adgang til.";
  if (/^TA\d{3}$/.test(kode)) {
    if (!fejltekster) {
      const { data } = await sb.from("fejlkode").select("kode, tekst");
      fejltekster = Object.fromEntries((data || []).map((r) => [r.kode, r.tekst]));
    }
    const detalje = (err.message || "").replace(/^[A-Z_]+:\s*/, "");
    return detalje && !/^[a-z_]+$/i.test(detalje) ? detalje.charAt(0).toUpperCase() + detalje.slice(1) : fejltekster[kode] || err.message;
  }
  return err.message || String(err);
}

export class Fejl extends Error {}

/** Kald en databasefunktion. Kaster Fejl med en tekst, kunden kan forstå. */
export async function rpc(navn, args = {}) {
  const { data, error } = await sb.rpc(navn, args);
  if (error) throw new Fejl(await fejltekst(error));
  return data;
}

export async function session() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function logUd() {
  await sb.auth.signOut();
  location.reload();
}

/** Virksomhederne, brugeren har adgang til (kunde), med navn. */
export async function virksomheder() {
  const { data, error } = await sb.from("kunde_adgang").select("virksomhed_id, rolle, virksomhed:virksomhed_id (navn, cvr)");
  if (error) throw new Fejl(await fejltekst(error));
  return data || [];
}

export async function sha256hex(buf) {
  const h = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Et bilag fra kundens telefon eller computer: arkiv, registrering og læsning. */
export async function sendBilag(virksomhed, fil, udlaeg = false) {
  const data = await fil.arrayBuffer();
  const sha = await sha256hex(data);
  const sti = `${virksomhed}/${sha}`;
  const { error: upErr } = await sb.storage.from("bilag").upload(sti, data, { contentType: fil.type || "application/pdf", upsert: false });
  if (upErr && !/exists|duplicate/i.test(upErr.message)) throw new Fejl("Filen kunne ikke gemmes: " + upErr.message);
  const r = await rpc("modtag_bilag", { p_virksomhed: virksomhed, p_filnavn: fil.name.slice(0, 200), p_sha256: sha, p_kilde: "scan",
                                         p_mime: fil.type || "application/pdf", p_stoerrelse: fil.size });
  if (udlaeg && !r.dublet) await rpc("marker_udlaeg", { p_bilag: r.bilag_id });
  if (!r.dublet) sb.functions.invoke("scan", { body: { bilag_id: r.bilag_id } }).catch(() => {});   // læses i baggrunden
  return r;
}
