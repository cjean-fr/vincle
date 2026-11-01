// Envoie les URLs du sitemap à l'API IndexNow.
// Usage : bun run indexnow
//
// La clé est lue depuis le fichier du dépôt (apps/docs/public/<clé>.txt,
// dont le contenu est la clé elle-même) puis vérifiée contre le fichier
// réellement servi : aucune variable d'environnement à synchroniser.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const HOST = "vincle.cjean.fr";
const PUBLIC_DIR = join(import.meta.dir, "..", "public");

export type KeySource =
  | { status: "found"; key: string }
  | { status: "absent" }
  | { status: "error"; error: string };

// Contrat IndexNow : le fichier <clé>.txt contient la clé elle-même, et la
// clé fait 8 à 128 caractères parmi lettres, chiffres et tirets. Ce contrat
// auto-décrit le fichier : robots.txt ou tout autre .txt est exclu sans
// deviner de valeur.
export function pickKeyFile(files: { name: string; content: string }[]): KeySource {
  const candidates = files.filter((f) => {
    if (!f.name.endsWith(".txt")) return false;
    const base = f.name.slice(0, -".txt".length);
    return /^[A-Za-z0-9-]{8,128}$/.test(base) && f.content.trim() === base;
  });
  const [first, second] = candidates;
  if (second) {
    return {
      status: "error",
      error: `Several IndexNow key files in apps/docs/public/ (${candidates.map((c) => c.name).join(", ")}); keep exactly one.`,
    };
  }
  if (!first) return { status: "absent" };
  return { status: "found", key: first.name.slice(0, -".txt".length) };
}

export async function readKeyFile(publicDir: string): Promise<KeySource> {
  let names: string[];
  try {
    names = (await readdir(publicDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith(".txt"))
      .map((e) => e.name);
  } catch (err) {
    return { status: "error", error: `Cannot list ${publicDir}: ${(err as Error).message}` };
  }
  const files = await Promise.all(
    names.map(async (name) => ({ name, content: await readFile(join(publicDir, name), "utf8") })),
  );
  return pickKeyFile(files);
}

export type KeyCheck =
  | { status: "verified" }
  | { status: "skipped"; warning: string }
  | { status: "error"; error: string };

// Vérifie que le fichier réellement servi à l'emplacement public de la clé
// correspond au fichier du dépôt (Bing valide keyLocation).
// Fichier absent en ligne (404) : soumission sautée sans erreur — un fichier
// clé qui vient de changer peut ne pas être encore déployé.
// Les messages ne contiennent jamais le contenu servi.
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
      error: `Cannot verify the deployed key file: fetching it failed (${(err as Error).message}). Check connectivity from the runner; submission skipped.`,
    };
  }
  if (res.status === 404) {
    return {
      status: "skipped",
      warning:
        "No key file is served yet at the public location of the committed key (HTTP 404). " +
        "Skipping the IndexNow submission. If the key file changed in this push, " +
        "the site may not have deployed yet; the next run will retry.",
    };
  }
  if (!res.ok) {
    return {
      status: "error",
      error:
        `The deployed key file could not be verified (HTTP ${res.status} ${res.statusText}). ` +
        "Check that the site serves the committed file from apps/docs/public/.",
    };
  }
  // Normalisation prudente : un fichier texte peut finir par une newline.
  const served = (await res.text()).trim();
  if (served !== expectedKey.trim()) {
    return {
      status: "error",
      error:
        "The key file served at its public location does not match the committed file in apps/docs/public/. " +
        "The site may serve a stale deployment; check the deployed file.",
    };
  }
  return { status: "verified" };
}

async function main(): Promise<void> {
  const SITEMAP_URL = process.env["INDEXNOW_SITEMAP"] ?? "https://vincle.cjean.fr/sitemap.xml";
  const ENDPOINT = process.env["INDEXNOW_ENDPOINT"] ?? "https://api.indexnow.org/indexnow";

  const source = await readKeyFile(PUBLIC_DIR);
  if (source.status === "error") {
    console.error(source.error);
    process.exit(1);
  }
  if (source.status === "absent") {
    console.warn(
      "No IndexNow key file in apps/docs/public/ (a <key>.txt whose content is the key). " +
        "Skipping the IndexNow submission.",
    );
    process.exit(0);
  }
  const KEY = source.key;

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
