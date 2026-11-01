// Envoie les URLs du sitemap à l'API IndexNow.
// Usage : bun run indexnow  (ou INDEXNOW_KEY=... bun run indexnow)
const HOST = "vincle.cjean.fr";

export type KeyCheck =
  | { status: "verified" }
  | { status: "skipped"; warning: string }
  | { status: "error"; error: string };

// Vérifie que la clé utilisée pour la soumission correspond au contenu
// réellement servi à son emplacement public (Bing valide keyLocation).
// Fichier absent (404) : soumission sautée sans erreur — rien à valider,
// et un fichier clé qui vient de changer peut ne pas être encore déployé.
// Les messages ne contiennent jamais la valeur de la clé : elle n'est pas
// secrète par conception, mais le secret CI pourrait contenir autre chose.
export async function checkServedKey(
  keyLocation: string,
  expectedKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<KeyCheck> {
  let res: Response;
  try {
    res = await fetchFn(keyLocation);
  } catch (err) {
    return {
      status: "error",
      error: `Cannot verify INDEXNOW_KEY: fetching the key file failed (${(err as Error).message}). Check connectivity from the runner; submission skipped.`,
    };
  }
  if (res.status === 404) {
    return {
      status: "skipped",
      warning:
        "No key file is served at the public location derived from INDEXNOW_KEY (HTTP 404). " +
        "Skipping the IndexNow submission. If the key file changed in this push, " +
        "the site may not have deployed yet; the next run will retry.",
    };
  }
  if (!res.ok) {
    return {
      status: "error",
      error:
        `The key file could not be verified (HTTP ${res.status} ${res.statusText}). ` +
        "The submission would be rejected: check that the GitHub secret matches the committed key file in apps/docs/public/.",
    };
  }
  // Normalisation prudente : un fichier texte peut finir par une newline.
  const served = (await res.text()).trim();
  if (served !== expectedKey.trim()) {
    return {
      status: "error",
      error:
        "INDEXNOW_KEY does not match the key file served at its public location. " +
        "Update the GitHub secret to the value of the committed key file in apps/docs/public/.",
    };
  }
  return { status: "verified" };
}

async function main(): Promise<void> {
  const KEY = (process.env["INDEXNOW_KEY"] ?? "").trim();
  if (!KEY) {
    console.error("INDEXNOW_KEY environment variable is required.");
    process.exit(1);
  }
  const SITEMAP_URL = process.env["INDEXNOW_SITEMAP"] ?? "https://vincle.cjean.fr/sitemap.xml";
  const ENDPOINT = process.env["INDEXNOW_ENDPOINT"] ?? "https://api.indexnow.org/indexnow";

  const keyCheck = await checkServedKey(`https://${HOST}/${KEY}.txt`, KEY);
  if (keyCheck.status === "error") {
    console.error(keyCheck.error);
    process.exit(1);
  }
  if (keyCheck.status === "skipped") {
    console.warn(keyCheck.warning);
    process.exit(0);
  }

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
}

if (import.meta.main) {
  await main();
}
