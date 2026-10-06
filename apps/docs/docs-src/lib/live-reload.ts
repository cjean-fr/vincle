export const LIVE_RELOAD_PATH = "/__live-reload.js";

const source = `(function(){
var protocol=location.protocol==="https:"?"wss:":"ws:";
var ws=new WebSocket(protocol+"//"+location.host+"/__hmr");
ws.onmessage=function(e){if(e.data==="reload")location.reload()};
ws.onclose=function(){setTimeout(function(){location.reload()},1000)};
})();`;

export function liveReloadResponse(): Response {
  return new Response(source, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function injectLiveReload(html: string): string {
  const idx = html.lastIndexOf("</body>");
  if (idx === -1) return html;
  // A same-origin script is allowed by the docs' script-src 'self' policy.
  const script = `<script src="${LIVE_RELOAD_PATH}"></script>`;
  return html.slice(0, idx) + script + "\n" + html.slice(idx);
}
