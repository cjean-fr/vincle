import "./jsx-augment.js";
import { ERR_FLOW_RESPONSE, vincleError } from "./errors.js";

/**
 * Browser side of a response the page fetches and inserts into itself.
 *
 * The server answers with `serve(req, page, NativeAdapter, { mode: "partial", transport: "sse" })`:
 * one event for the content with its placeholders, then one per patch. Each event is a
 * piece of HTML framed as `data:` lines, so any content, a `</template>` or a blank line
 * included, crosses the wire intact. The page needs the `NativeAdapter` runtime (it has it
 * when it renders any `<Defer>`): it fills each placeholder as its patch is inserted.
 */

/**
 * Read `response` as it arrives and put it in the page: the first event next to `target`
 * (at `position`, `"beforeend"` by default), each later event, the patches, at the end
 * of the body, where the runtime applies and removes it.
 *
 * Rejects when the response is not ok or the stream breaks, so the caller can fall back to
 * following the link.
 */
export async function streamInto(
  target: Element,
  response: Response,
  position: InsertPosition = "beforeend",
): Promise<void> {
  const framed = response.headers.get("content-type")?.includes("text/event-stream");
  if (!response.ok || !response.body || !framed) {
    throw vincleError(
      `[vincle/flow] streamInto(): the response is not an event stream (HTTP ${response.status}). ` +
        'Ask for one with `Accept: text/event-stream` and serve it with negotiateFetch, or mode: "partial" and transport: "sse". ' +
        "Fall back to following the link.",
      ERR_FLOW_RESPONSE,
    );
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let first = true;
  const insert = (html: string) => {
    if (first) target.insertAdjacentHTML(position, html);
    else target.ownerDocument.body.insertAdjacentHTML("beforeend", html);
    first = false;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer = (buffer + value).replaceAll("\r\n", "\n");
    for (let end; (end = buffer.indexOf("\n\n")) >= 0;) {
      const lines = buffer.slice(0, end).split("\n");
      buffer = buffer.slice(end + 2);
      insert(
        lines
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(line.startsWith("data: ") ? 6 : 5))
          .join("\n"),
      );
    }
  }
}
