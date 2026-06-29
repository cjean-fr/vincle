import { injectIntoHead } from "../utils.js";
import { createAdapter, type Adapter } from "./shared.js";
import { raw, type VincleNode } from "@vincle/core";
import { escapeAttr } from "@vincle/core/html";

const POLYFILL = `(function(){
var ADJ={append:"beforeend",prepend:"afterbegin",before:"beforebegin",after:"afterend"};
function fill(name,frag){
var it=document.createNodeIterator(document.body||document.documentElement,128),nd,s=null,e=null;
while((nd=it.nextNode())){if(!s&&nd.nodeValue==='?start name="'+name+'"'){s=nd;continue;}if(s&&nd.nodeValue==='?end'){e=nd;break;}}
if(!s)return;var c=s.nextSibling;while(c&&c!==e){var x=c.nextSibling;c.remove();c=x;}s.after(frag);
}
function run(t){
var name=t.getAttribute("for");if(!name)return;
var src=t.getAttribute("data-src");
if(src!=null){fetch(src).then(function(r){return r.text();}).then(function(h){var x=document.createElement("template");x.innerHTML=h;fill(name,x.content);});t.remove();return;}
var merge=t.getAttribute("data-merge");
if(merge&&merge!=="replace"){var el=document.getElementById(name);if(el)el.insertAdjacentHTML(ADJ[merge],t.innerHTML);t.remove();return;}
fill(name,t.content.cloneNode(true));t.remove();
}
function scan(r){var ts=r.querySelectorAll?r.querySelectorAll("template[for]"):[];for(var i=0;i<ts.length;i++)run(ts[i]);}
scan(document);
new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeName==='TEMPLATE'&&n.getAttribute&&n.getAttribute('for'))run(n);});});}).observe(document.documentElement,{childList:true,subtree:true});
})()`;

export const NATIVE_POLYFILL: string = POLYFILL;

export async function nativePolyfillHash(): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(POLYFILL),
  );
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return `sha256-${b64}`;
}

/** WICG Declarative Partial Updates wire format — no polyfill, zero JS. */
export const WebPlatformAdapter = createAdapter({
  Placeholder: function ({ id, src, children }) {
    const safeId = escapeAttr(id);
    const open: VincleNode = raw(`<?start name="${safeId}">`);
    const close: VincleNode = raw(`<?end>`);
    if (src) {
      return [open, children, close, <template htmlFor={id} data-src={src} />];
    }
    return [open, children, close];
  },

  Patch: ({ id, children, merge }) => {
    if (merge === "replace") {
      return <template htmlFor={id}>{children}</template>;
    }
    return (
      <template htmlFor={id} data-merge={merge}>
        {children}
      </template>
    );
  },

  Frame: ({ id, children }) => <template htmlFor={id}>{children}</template>,
});

/**
 * Decorate any adapter with the ~550 B inline polyfill for the WICG
 * Declarative Partial Updates API. The polyfill is injected into `<head>`
 * only when fragments are present (`ctx.pendingStore.size > 0`).
 *
 * Useful when you want to use `WebPlatformAdapter` in browsers that do
 * not yet support `<template for>` natively.
 */
export function withPolyfill<T extends Adapter>(adapter: T): T {
  return {
    ...adapter,
    transformShell: (shell, ctx) => {
      const transformed = adapter.transformShell
        ? adapter.transformShell(shell, ctx)
        : shell;
      return ctx.pendingStore.size > 0
        ? injectIntoHead(transformed, `<script>${POLYFILL}</script>`)
        : transformed;
    },
  } as T;
}

/** Default Native adapter — WICG format + inline polyfill (~550 B). */
export const NativeAdapter = withPolyfill(WebPlatformAdapter);
