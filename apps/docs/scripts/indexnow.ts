// Envoie les URLs du sitemap à l'API IndexNow.
// Usage : bun run indexnow  (ou INDEXNOW_KEY=... bun run indexnow)
const HOST = "vincle.cjean.fr";
const KEY = process.env["INDEXNOW_KEY"];
if (!KEY) {
  console.error("INDEXNOW_KEY environment variable is required.");
  process.exit(1);
}
const SITEMAP_URL = process.env["INDEXNOW_SITEMAP"] ?? "https://vincle.cjean.fr/sitemap.xml";
const ENDPOINT = process.env["INDEXNOW_ENDPOINT"] ?? "https://api.indexnow.org/indexnow";

const res = await fetch(SITEMAP_URL);
if (!res.ok) {
  console.error(`Failed to fetch sitemap: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const xml = await res.text();
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

if (urls.length === 0) {
  console.error("No URLs found in sitemap.");
  process.exit(1);
}

console.log(`Submitting ${urls.length} URLs to IndexNow...`);

const body = {
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList: urls,
};

const submit = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

console.log(`IndexNow response: ${submit.status} ${submit.statusText}`);
if (!submit.ok) {
  const text = await submit.text();
  console.error(text);
  process.exit(1);
}
