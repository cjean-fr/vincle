/** Shared runtime for native-format includes and streamed patches. */
export const NATIVE_POLYFILL = `(function(){
var ADJ={append:"beforeend",prepend:"afterbegin",before:"beforebegin",after:"afterend"};
var states=new WeakMap(),pending=new Set(),complete=new WeakSet();
var ready=document.readyState!=="loading";
function marker(node){
  return node.nodeType===7?"?"+node.target+(node.data?" "+node.data:""):node.nodeValue;
}
function fill(name,frag){
  var it=document.createNodeIterator(document.documentElement,192),nd,start=null,end=null,depth=0;
  while((nd=it.nextNode())){
    if(marker(nd)==='?marker name="'+name+'"'){nd.before(frag);return true;}
    if(marker(nd)==='?start name="'+name+'"'){start=nd;break;}
  }
  if(!start)return false;
  for(nd=start.nextSibling;nd;nd=nd.nextSibling){
    if(nd.nodeType!==8&&nd.nodeType!==7)continue;
    if(marker(nd)==='?end'){if(!depth){end=nd;break;}depth--;}
    else if(marker(nd).indexOf('?start ')===0)depth++;
  }
  if(!end)return false;
  while(start.nextSibling!==end)start.nextSibling.remove();
  end.before(frag);return true;
}
function apply(t,s){
  if(!t.isConnected){if(s.controller)s.controller.abort();pending.delete(t);states.delete(t);return;}
  if(s.wait||(!ready&&!complete.has(t)&&!t.nextSibling))return;
  var name=(t.getAttribute("data-for")??t.getAttribute("for")),frag=s.fragment||t.content.cloneNode(true),merge=t.getAttribute("data-merge");
  if(name){
    if(merge&&merge!=="replace"){
      var el=document.getElementById(name),position=ADJ[merge];
      if(!el||!position)return;
      if(position==="beforeend")el.append(frag);
      else if(position==="afterbegin")el.prepend(frag);
      else if(position==="beforebegin")el.before(frag);
      else el.after(frag);
    }else if(!fill(name,frag))return;
  }else t.before(frag);
  s.done=true;pending.delete(t);t.remove();
}
function flush(){pending.forEach(function(t){apply(t,states.get(t));});}
function fail(t,s){s.failed=true;if(states.get(t)===s)pending.delete(t);}
function run(t){
  if(!t.isConnected)return;
  var s=states.get(t);
  if(s){if(!s.done&&!s.failed)apply(t,s);return;}
  s={};states.set(t,s);pending.add(t);
  var src=t.getAttribute("src");
  if(src!==null){
    try{var url=new URL(src,document.baseURI);if(src==="#blocked"||(url.protocol!=="http:"&&url.protocol!=="https:")){fail(t,s);return;}}
    catch(e){fail(t,s);return;}
    s.wait=true;s.controller=new AbortController();
    var opts={signal:s.controller.signal},cross=t.getAttribute("crossorigin"),policy=t.getAttribute("referrerpolicy");
    if(cross!==null){opts.mode="cors";opts.credentials=cross==="use-credentials"?"include":"same-origin";}
    if(policy!==null)opts.referrerPolicy=policy;
    fetch(src,opts).then(function(r){if(!r.ok){fail(t,s);return null;}return r.text();}).then(function(h){
      if(h===null||states.get(t)!==s)return;
      if(!t.isConnected){s.controller.abort();pending.delete(t);states.delete(t);return;}
      var x=document.createElement("template");x.innerHTML=h;
      x.content.querySelectorAll("template[for],template[data-for],template[src]").forEach(function(n){
        if(n.hasAttribute("for")){n.setAttribute("data-for",n.getAttribute("for"));n.removeAttribute("for");}
        complete.add(n);
      });
      s.fragment=x.content;s.wait=false;apply(t,s);
    }).catch(function(){fail(t,s);});
  }else apply(t,s);
}
function scan(root){
  if(root.nodeName==="TEMPLATE"&&(root.hasAttribute("for")||root.hasAttribute("data-for")||root.hasAttribute("src")))run(root);
  if(root.querySelectorAll)root.querySelectorAll("template[for],template[data-for],template[src]").forEach(run);
}
new MutationObserver(function(ms){
  ms.forEach(function(m){m.addedNodes.forEach(scan);});flush();
}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener("DOMContentLoaded",function(){ready=true;scan(document);flush();},{once:true});
scan(document);
})()`;

export async function nativePolyfillHash(): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(NATIVE_POLYFILL));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return `sha256-${b64}`;
}
