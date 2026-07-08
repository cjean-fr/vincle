export const NATIVE_POLYFILL = `(function(){
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

export async function nativePolyfillHash(): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(NATIVE_POLYFILL),
  );
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return `sha256-${b64}`;
}
