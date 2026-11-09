import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";
function publicAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  return !/^(::|::1|::ffff:|fc|fd|fe8|fe9|fea|feb)/i.test(ip);
}
export async function fetchPublic(
  address,
  { limit = 2000000, redirects = 0 } = {},
) {
  const url = new URL(address);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw Error("Use a public HTTPS URL");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error("Web access cannot reach local or private addresses");
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: { "User-Agent": "CMRX-Project-Agent/0.1" },
        lookup: (_host, options, cb) =>
          cb(
            null,
            ...(options?.all ? [[chosen]] : [chosen.address, chosen.family]),
          ),
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          if (redirects >= 5) return reject(Error("Too many redirects"));
          fetchPublic(new URL(res.headers.location, url).href, {
            limit,
            redirects: redirects + 1,
          }).then(resolve, reject);
          return;
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > limit) res.destroy(Error("Download is too large"));
          else chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            url: url.href,
            status: res.statusCode,
            type: String(res.headers["content-type"] || "").split(";")[0],
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.setTimeout(20000, () =>
      request.destroy(Error("Web request timed out")),
    );
    request.on("error", reject);
  });
}
export async function readWeb(address) {
  const r = await fetchPublic(address);
  if (!/text\/|json/.test(r.type)) throw Error("This URL is not a text page");
  const body = r.body.toString("utf8");
  const title =
    body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    new URL(r.url).hostname;
  const text = /html/.test(r.type)
    ? body
        .replace(/<(script|style|nav|footer)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
    : body;
  return {
    url: r.url,
    status: r.status,
    title: title.slice(0, 300),
    text: text.slice(0, 40000),
    untrusted: true,
  };
}
