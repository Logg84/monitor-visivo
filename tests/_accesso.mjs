// Login Cloudflare Access simulato per i test del Worker: chiavi RSA di prova, JWT firmati e risposta ai certificati.
// Importando questo modulo, ogni fetch globale assegnato dopo risponde da solo alle richieste dei certificati (/cdn-cgi/access/certs).
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const b64url = (b) => Buffer.from(b).toString("base64url");
export const DOM = "team.cloudflareaccess.com", AUD = "aud-test";
export const ADMIN = "admin@x.it";
/** Variabili del Worker che attivano la modalità Access (l'amministratore è ADMIN). */
export const ENV_ACCESSO = { ACCESS_TEAM_DOMAIN: DOM, ACCESS_AUD: AUD, ADMIN_EMAILS: ADMIN };
export async function jwt(email = ADMIN) {
  const h = b64url(JSON.stringify({ alg: "RS256", kid: "k1" })), p = b64url(JSON.stringify({ iss: `https://${DOM}`, aud: [AUD], exp: Math.floor(Date.now() / 1000) + 600, email }));
  const s = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(s)}`;
}
/** Intestazioni di una richiesta fatta da `email` (assente → richiesta senza login). */
export async function accesso(email = ADMIN) { return email ? { "cf-access-jwt-assertion": await jwt(email) } : {}; }
const certs = () => new Response(JSON.stringify({ keys: [jwk] }));
let reale = globalThis.fetch;
const avvolgi = (f) => (url, init) => (String(url).includes("/cdn-cgi/access/certs") ? certs() : f(url, init));
Object.defineProperty(globalThis, "fetch", { configurable: true, get: () => avvolgi(reale), set: (f) => { reale = f; } });
