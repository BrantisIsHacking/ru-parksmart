// Only known browser push services may receive notification requests from the server,
// so a client cannot aim our outgoing requests at an arbitrary or internal host (SSRF).
const EXACT_HOSTS = ["fcm.googleapis.com", "web.push.apple.com"];
const SUFFIX_HOSTS = [".push.services.mozilla.com", ".notify.windows.com"];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return EXACT_HOSTS.includes(host) || SUFFIX_HOSTS.some((s) => host.endsWith(s));
}
