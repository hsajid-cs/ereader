const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

export interface PdfTheme {
  background: string;
  text: string;
}

/** Self-contained page that renders a base64 PDF with pdf.js and reports the visible page. */
export function pdfHtml(base64: string, startPage: number, theme: PdfTheme): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;background:${theme.background};color:${theme.text};font-family:sans-serif}
  .page{display:block;margin:8px auto;box-shadow:0 0 4px #0006;background:#fff}
  #status{padding:24px;text-align:center}
</style></head><body><div id="status">Loading…</div><div id="pages"></div>
<script src="${PDFJS}/pdf.min.js"></script>
<script>
(function(){
  var post=function(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))};
  pdfjsLib.GlobalWorkerOptions.workerSrc="${PDFJS}/pdf.worker.min.js";
  var raw=atob("${base64}"),data=new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
  pdfjsLib.getDocument({data:data}).promise.then(function(pdf){
    document.getElementById("status").remove();
    var total=pdf.numPages,holder=document.getElementById("pages"),els=[],current=0;
    post({type:"loaded",total:total});
    var obs=new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting)return;
        var el=en.target,n=+el.dataset.n;
        if(el.dataset.done)return;el.dataset.done=1;
        pdf.getPage(n).then(function(page){
          var scale=(window.innerWidth-16)/page.getViewport({scale:1}).width;
          var vp=page.getViewport({scale:scale*(window.devicePixelRatio||1)});
          el.width=vp.width;el.height=vp.height;
          el.style.width=(vp.width/(window.devicePixelRatio||1))+"px";
          el.style.height=(vp.height/(window.devicePixelRatio||1))+"px";
          page.render({canvasContext:el.getContext("2d"),viewport:vp});
        });
      });
    },{rootMargin:"600px"});
    for(var n=1;n<=total;n++){
      var c=document.createElement("canvas");c.className="page";c.dataset.n=n;
      c.style.width="calc(100% - 16px)";c.style.height="140vw";
      holder.appendChild(c);els.push(c);obs.observe(c);
    }
    function visible(){
      var mid=window.innerHeight/2,best=1;
      for(var i=0;i<els.length;i++){var r=els[i].getBoundingClientRect();if(r.top<=mid)best=i+1;else break}
      return best;
    }
    var t;window.addEventListener("scroll",function(){clearTimeout(t);t=setTimeout(function(){
      var p=visible();if(p!==current){current=p;post({type:"page",page:p,total:total})}},150)});
    window.__goto=function(p){var el=els[p-1];if(el)el.scrollIntoView()};
    setTimeout(function(){window.__goto(${Math.max(1, Math.floor(startPage))})},300);
  }).catch(function(e){post({type:"error",message:String(e&&e.message||e)})});
})();
</script></body></html>`;
}
