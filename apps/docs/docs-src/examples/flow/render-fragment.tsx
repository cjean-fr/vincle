import { renderFragment } from "@vincle/flow";
import { NativeAdapter } from "@vincle/flow/adapters";

declare function fetchPrice(symbol: string): Promise<{ value: number }>;

// A Netlify/Vercel Edge Function — both run standard Request → Response
// handlers, so this needs no platform SDK import.
export default async function handler(req: Request): Promise<Response> {
  const symbol = new URL(req.url).searchParams.get("symbol");
  if (!symbol) return new Response("Missing symbol", { status: 400 });

  const price = await fetchPrice(symbol);
  const { url, html } = await renderFragment(
    `price-${symbol}`,
    <span>{price.value.toFixed(2)}</span>,
    { adapter: NativeAdapter },
  );

  // `url` matches the path the full build already wrote this fragment to —
  // upload `html` there (blob store, on-demand revalidation, CDN purge +
  // PUT…). The shell page that includes it never needs rebuilding.
  return Response.json({ url, html });
}
