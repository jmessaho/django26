/* GéoJM — outils de géométrie avancée
   Ce module s'ajoute au prototype SVG existant. Voir README pour les intégrations HTML requises. */
(() => {
  "use strict";
  const svg = document.getElementById("canvas");
  const axes = document.getElementById("axes");
  const objectsLayer = document.getElementById("objects");
  const pointsLayer = document.getElementById("points");
  const previewLayer = document.getElementById("preview");
  const empty = document.getElementById("emptyHint");
  if (!svg || !objectsLayer || !pointsLayer) {
    console.error("GéoJM : canvas SVG introuvable. Vérifiez les identifiants de geometrie.html.");
    return;
  }

  let points = [];
  let objects = [];
  let tool = "select";
  let pending = [];
  let selected = null;
  let dragging = null;
  let dragStartSnapshot = null;
  let history = [];
  let pointSeq = 1;
  let objectSeq = 1;
  let W = 800, H = 600;
  const byId = id => document.getElementById(id);
  const fmt = n => Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—";
  const labelType = t => ({
    segment:"Segment", line:"Droite", triangle:"Triangle", circle:"Cercle",
    midpoint:"Milieu", perpendicular:"Perpendiculaire", parallel:"Parallèle",
    bisector:"Bissectrice", perpendicularBisector:"Médiatrice", intersection:"Intersection",
    centralSymmetry:"Symétrie centrale", axialSymmetry:"Symétrie axiale"
  })[t] || t;
  const say = text => { const el = byId("statusText"); if (el) el.textContent = text; };
  const pById = id => points.find(p => p.id === id);
  const oById = id => objects.find(o => o.id === id);
  const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const sub = (a,b) => ({x:a.x-b.x,y:a.y-b.y});
  const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y});
  const mul = (a,k) => ({x:a.x*k,y:a.y*k});
  const cross = (a,b) => a.x*b.y-a.y*b.x;

  function svgEl(tag, attrs={}) {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,String(v)));
    return n;
  }
  function dimensions() {
    const r=svg.getBoundingClientRect(); W=Math.max(1,r.width); H=Math.max(1,r.height);
    svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  }
  function pos(ev) { const r=svg.getBoundingClientRect(); return {x:ev.clientX-r.left,y:ev.clientY-r.top}; }
  function snapshot() { history.push(JSON.stringify({points,objects,pointSeq,objectSeq})); if(history.length>80)history.shift(); }
  function restore(d) { points=d.points||[]; objects=d.objects||[]; pointSeq=d.pointSeq||points.length+1; objectSeq=d.objectSeq||objects.length+1; pending=[]; selected=null; render(); }
  function undo() { if(!history.length){say("Aucune action à annuler");return;} restore(JSON.parse(history.pop()));say("Action annulée"); }
  function createPoint(x,y,label) {
    const n=pointSeq++;
    const p={id:`P${n}`,label:label||String.fromCharCode(65+((n-1)%26))+(n>26?Math.floor((n-1)/26)+1:""),x,y};
    points.push(p); return p;
  }
  function createObject(type, refs, extra={}) {
    const o={id:`O${objectSeq++}`,type,refs:refs.map(p=>typeof p==="string"?p:p.id),...extra};
    objects.push(o);return o;
  }

  // Resolves derived points/objects every render, so dependent constructions follow moved points.
  function resolvePoint(p, depth=0) {
    if (!p || depth>20) return null;
    if (p.kind==="free") return p;
    const a=pById(p.parents?.[0]), b=pById(p.parents?.[1]);
    if(p.kind==="midpoint"&&a&&b) return {...p,x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    if(p.kind==="centralSymmetry"&&a&&b) return {...p,x:2*b.x-a.x,y:2*b.y-a.y};
    if(p.kind==="axialSymmetry"&&a&&b) {
      const c=pById(p.parents?.[2]);
      if(c) {
        const vx=c.x-b.x, vy=c.y-b.y, den=vx*vx+vy*vy;
        if(den>1e-9) {
          const t=((a.x-b.x)*vx+(a.y-b.y)*vy)/den;
          const px=b.x+t*vx, py=b.y+t*vy;
          return {...p,x:2*px-a.x,y:2*py-a.y};
        }
      }
    }
    if(p.kind==="intersection"&&a&&b) {
      const oa=oById(p.objectParents?.[0]), ob=oById(p.objectParents?.[1]);
      const l1=oa&&lineForObject(oa), l2=ob&&lineForObject(ob);
      if(l1&&l2){const q=intersection(l1,l2);if(q)return {...p,...q};}
    }
    return p;
  }
  function point(p) { return resolvePoint(p); }
  function pointXY(id) { const p=point(pById(id)); return p?{x:p.x,y:p.y}:null; }
  function lineForObject(o) {
    const ps=o.refs.map(pointXY); if(ps.some(p=>!p))return null;
    if(["line","segment","parallel","perpendicular","perpendicularBisector","bisector"].includes(o.type)) {
      if(o.type==="perpendicular"||o.type==="parallel") {
        const base=ps[0],through=ps[2]||ps[1],dir=sub(ps[1],ps[0]);
        return o.type==="parallel"?{p:through,d:dir,segment:false}:{p:through,d:{x:-dir.y,y:dir.x},segment:false};
      }
      if(o.type==="perpendicularBisector") return {p:mul(add(ps[0],ps[1]),.5),d:{x:-(ps[1].y-ps[0].y),y:ps[1].x-ps[0].x},segment:false};
      if(o.type==="bisector"&&ps.length>=3) {
        const v1=sub(ps[0],ps[1]),v2=sub(ps[2],ps[1]),l1=Math.hypot(v1.x,v1.y),l2=Math.hypot(v2.x,v2.y);
        if(!l1||!l2)return null;
        return {p:ps[1],d:add(mul(v1,1/l1),mul(v2,1/l2)),segment:false};
      }
      return {p:ps[0],d:sub(ps[1],ps[0]),segment:o.type==="segment"};
    }
    return null;
  }
  function intersection(l1,l2) {
    const den=cross(l1.d,l2.d); if(Math.abs(den)<1e-8)return null;
    const t=cross(sub(l2.p,l1.p),l2.d)/den;
    return add(l1.p,mul(l1.d,t));
  }
  function lineEnds(l) {
    const len=Math.max(W,H)*2;
    const n=Math.hypot(l.d.x,l.d.y); if(n<1e-8)return null;
    const u=mul(l.d,1/n);
    return {x1:l.p.x-u.x*len,y1:l.p.y-u.y*len,x2:l.p.x+u.x*len,y2:l.p.y+u.y*len};
  }

  function drawAxes() {
    if(!axes)return;
    axes.replaceChildren();
    const cx=W/2,cy=H/2;
    axes.append(svgEl("line",{x1:0,y1:cy,x2:W,y2:cy,class:"axis"}),svgEl("line",{x1:cx,y1:0,x2:cx,y2:H,class:"axis"}));
    for(let x=cx+25;x<W;x+=25)axes.append(svgEl("line",{x1:x,y1:cy-3,x2:x,y2:cy+3,class:"axis"}));
    for(let x=cx-25;x>0;x-=25)axes.append(svgEl("line",{x1:x,y1:cy-3,x2:x,y2:cy+3,class:"axis"}));
    for(let y=cy+25;y<H;y+=25)axes.append(svgEl("line",{x1:cx-3,y1:y,x2:cx+3,y2:y,class:"axis"}));
    for(let y=cy-25;y>0;y-=25)axes.append(svgEl("line",{x1:cx-3,y1:y,x2:cx+3,y2:y,class:"axis"}));
    const xl=svgEl("text",{x:W-17,y:cy-8,class:"axis-label"});xl.textContent="x";axes.append(xl);
    const yl=svgEl("text",{x:cx+8,y:13,class:"axis-label"});yl.textContent="y";axes.append(yl);
  }
  function renderObject(o) {
    const ps=o.refs.map(pointXY); if(ps.some(p=>!p))return null;
    const attrs={class:"geo-line"+(selected===o.id?" selected":""),"data-oid":o.id};
    let el=null;
    if(o.type==="segment")el=svgEl("line",{...attrs,x1:ps[0].x,y1:ps[0].y,x2:ps[1].x,y2:ps[1].y});
    else if(["line","parallel","perpendicular","perpendicularBisector","bisector"].includes(o.type)){
      const l=lineForObject(o),ends=l&&lineEnds(l);if(ends)el=svgEl("line",{...attrs,...ends});
    } else if(o.type==="triangle")el=svgEl("polygon",{...attrs,points:ps.map(p=>`${p.x},${p.y}`).join(" "),fill:"rgba(49,94,251,.05)"});
    else if(o.type==="circle")el=svgEl("circle",{...attrs,cx:ps[0].x,cy:ps[0].y,r:dist(ps[0],ps[1]),fill:"rgba(49,94,251,.03)"});
    else if(o.type==="midpoint"){const p=mul(add(ps[0],ps[1]),.5);el=svgEl("circle",{...attrs,cx:p.x,cy:p.y,r:5,fill:"#21a675"});}
    else if(o.type==="intersection"){
      const p=resolvePoint(o);if(p)el=svgEl("circle",{...attrs,cx:p.x,cy:p.y,r:5,fill:"#21a675"});
    }
    if(el){
      el.addEventListener("pointerdown",ev=>{if(tool==="select"){ev.stopPropagation();selected=o.id;render();}});
      el.addEventListener("click",ev=>{if(tool==="erase"){ev.stopPropagation();removeObject(o.id);}});
    }
    return el;
  }
  function renderProps() {
    const panel=byId("propertiesContent");if(!panel)return;
    const p=point(pById(selected)),o=oById(selected);
    if(!p&&!o){panel.className="empty-props";panel.textContent="Sélectionnez un point ou un objet pour consulter ses propriétés.";return;}
    panel.className="";panel.replaceChildren();
    const card=document.createElement("div");card.className="prop-card";
    const title=document.createElement("b");title.textContent=p?`Point ${p.label}`:labelType(o.type);card.append(title);
    const rows=p?[["x",fmt((p.x-W/2)/25)],["y",fmt((H/2-p.y)/25)]]:[["Défini par",o.refs.map(id=>pById(id)?.label||id).join(", ")],["Type",labelType(o.type)]];
    rows.forEach(([k,v])=>{const row=document.createElement("div");row.className="prop-row";const a=document.createElement("span"),b=document.createElement("strong");a.textContent=k;b.textContent=v;row.append(a,b);card.append(row);});
    panel.append(card);
  }
  function renderList() {
    const panel=byId("objectList");if(!panel)return;panel.replaceChildren();
    if(!points.length&&!objects.length){panel.textContent="Aucun objet pour le moment.";return;}
    const addItem=(id,name,icon)=>{const b=document.createElement("button");b.type="button";b.className="object-item"+(selected===id?" active":"");const i=document.createElement("span"),n=document.createElement("span"),a=document.createElement("span");i.textContent=icon;n.textContent=name;a.textContent="›";b.append(i,n,a);b.onclick=()=>{selected=id;render();};panel.append(b);};
    points.forEach(p=>addItem(p.id,`Point ${p.label}`,"•"));
    objects.forEach(o=>addItem(o.id,labelType(o.type),"◇"));
  }
  function render() {
    dimensions();
    const grid=byId("gridLayer");if(grid&&byId("gridToggle"))grid.style.display=byId("gridToggle").checked?"":"none";
    drawAxes();objectsLayer.replaceChildren();pointsLayer.replaceChildren();if(previewLayer)previewLayer.replaceChildren();
    objects.forEach(o=>{const n=renderObject(o);if(n)objectsLayer.append(n);});
    points.forEach(raw=>{
      const p=point(raw);if(!p)return;
      const g=svgEl("g",{"data-pid":raw.id});
      const c=svgEl("circle",{cx:p.x,cy:p.y,r:selected===raw.id?6:4.7,class:"geo-point"+(selected===raw.id?" selected":"")});
      c.addEventListener("pointerdown",ev=>{
        if(tool==="select"&&! ["midpoint","intersection","centralSymmetry","axialSymmetry"].includes(raw.kind)){ev.stopPropagation();selected=raw.id;dragging=raw.id;dragStartSnapshot=JSON.stringify({points,objects,pointSeq,objectSeq});if(svg.setPointerCapture)svg.setPointerCapture(ev.pointerId);render();}
        else if(tool==="erase"){ev.stopPropagation();removePoint(raw.id);}
      });
      c.addEventListener("click",ev=>{ev.stopPropagation();if(!["select","erase"].includes(tool))handlePoint(raw);});
      g.append(c);
      if(byId("labelsToggle")&&byId("labelsToggle").checked){const t=svgEl("text",{x:p.x+8,y:p.y-8,class:"point-label"});t.textContent=raw.label;g.append(t);}
      pointsLayer.append(g);
    });
    if(empty)empty.style.display=points.length||objects.length?"none":"block";
    renderProps();renderList();
  }
  function removeObject(id){snapshot();objects=objects.filter(o=>o.id!==id);selected=null;render();say("Objet supprimé");}
  function removePoint(id){snapshot();points=points.filter(p=>p.id!==id);objects=objects.filter(o=>!o.refs.includes(id));selected=null;render();say("Point et objets associés supprimés");}
  function finish(type,ps){snapshot();const o=createObject(type,ps);pending=[];selected=o.id;render();say(labelType(type)+" créé");}
  function handlePoint(p) {
    if(tool==="centralSymmetry") {
      if(!pending.length) { pending=[p.id]; say("Point à transformer sélectionné : choisissez le centre de symétrie"); return; }
      if(pending.length===1) {
        if(p.id===pending[0]) return;
        snapshot();
        const original=pById(pending[0]);
        const q=createPoint(2*p.x-original.x,2*p.y-original.y);
        q.kind="centralSymmetry"; q.parents=[original.id,p.id]; q.label=original.label+"′";
        selected=q.id; pending=[]; render(); say("Symétrique central créé"); return;
      }
    }
    if(tool==="axialSymmetry") {
      if(pending.includes(p.id)) return;
      pending.push(p.id);
      if(pending.length===1) { say("Choisissez le premier point de l'axe de symétrie"); return; }
      if(pending.length===2) { say("Choisissez le deuxième point de l'axe de symétrie"); return; }
      if(pending.length===3) {
        const original=pById(pending[0]), a=pById(pending[1]), b=pById(pending[2]);
        if(!original||!a||!b||dist(a,b)<1e-6) { pending=[]; say("Axe invalide : choisissez deux points distincts"); render(); return; }
        snapshot();
        const vx=b.x-a.x, vy=b.y-a.y, den=vx*vx+vy*vy;
        const t=((original.x-a.x)*vx+(original.y-a.y)*vy)/den;
        const px=a.x+t*vx, py=a.y+t*vy;
        const q=createPoint(2*px-original.x,2*py-original.y);
        q.kind="axialSymmetry"; q.parents=[original.id,a.id,b.id]; q.label=original.label+"′";
        selected=q.id; pending=[]; render(); say("Symétrique axial créé"); return;
      }
    }
    if(tool==="midpoint"){
      if(!pending.length){pending=[p.id];say("Choisissez le deuxième point");return;}
      if(p.id!==pending[0])finish("midpoint",pending.map(pById).concat(p));return;
    }
    if(tool==="perpendicular"||tool==="parallel"){
      if(pending.includes(p.id))return;pending.push(p.id);
      if(pending.length===1)say("Choisissez le deuxième point de la droite");
      else if(pending.length===2)say("Choisissez le point de passage");
      else finish(tool,pending.map(pById));render();return;
    }
    if(tool==="perpendicularBisector"){
      if(!pending.length){pending=[p.id];say("Choisissez le deuxième point du segment");return;}
      if(p.id!==pending[0])finish("perpendicularBisector",pending.map(pById).concat(p));return;
    }
    if(tool==="bisector"){
      if(pending.includes(p.id))return;pending.push(p.id);
      if(pending.length<3)say(`Choisissez le point ${pending.length===1?"du sommet":pending.length===2?"du deuxième côté":"suivant"}`);
      if(pending.length===3)finish("bisector",pending.map(pById));render();return;
    }
    const required={segment:2,line:2,triangle:3,circle:2}[tool];
    if(!required||pending.includes(p.id))return;pending.push(p.id);
    if(pending.length>=required)finish(tool,pending.map(pById));else{say(`${pending.length}/${required} points sélectionnés`);render();}
  }
  function canvasClick(p) {
    if(tool==="point"){snapshot();const q=createPoint(p.x,p.y);selected=q.id;render();say(`Point ${q.label} créé`);return;}
    if(["segment","line","triangle","circle"].includes(tool)){
      snapshot();pending.push(createPoint(p.x,p.y).id);const n={segment:2,line:2,triangle:3,circle:2}[tool];
      if(pending.length>=n)finish(tool,pending.map(pById));else{render();say(`${pending.length}/${n} points placés`);}return;
    }
    if(tool==="select"){selected=null;render();}
    else if(tool==="erase"){let near=null,d=18;points.forEach(q=>{const dd=dist(p,q);if(dd<d){d=dd;near=q.id;}});if(near)removePoint(near);}
    else say("Sélectionnez des points existants pour cette construction");
  }
  svg.addEventListener("pointerdown",ev=>{if(ev.target.closest("[data-pid]")||ev.target.closest("[data-oid]"))return;if(tool!=="select")canvasClick(pos(ev));else{selected=null;render();}});
  svg.addEventListener("pointermove",ev=>{
    const p=pos(ev),c=byId("coordText");if(c)c.textContent=`x : ${fmt((p.x-W/2)/25)} · y : ${fmt((H/2-p.y)/25)}`;
    if(dragging){const q=pById(dragging);if(q){q.x=p.x;q.y=p.y;render();}}
  });
  svg.addEventListener("pointerup",()=>{if(dragging&&dragStartSnapshot){history.push(dragStartSnapshot);if(history.length>80)history.shift();}dragging=null;dragStartSnapshot=null;});
  svg.addEventListener("pointercancel",()=>{dragging=null;dragStartSnapshot=null;});

  document.querySelectorAll(".tool").forEach(button=>button.addEventListener("click",()=>{
    tool=button.dataset.tool;pending=[];document.querySelectorAll(".tool").forEach(b=>b.classList.toggle("active",b===button));
    say(toolInfoFor(tool));render();
  }));
  function toolInfoFor(t){return({
    select:"Sélectionnez ou déplacez un point",point:"Cliquez pour créer un point",
    segment:"Cliquez deux fois ou sélectionnez deux points",line:"Cliquez deux fois ou sélectionnez deux points",
    triangle:"Cliquez trois fois pour construire un triangle",circle:"Cliquez sur le centre puis sur le rayon",
    midpoint:"Sélectionnez deux points existants",
    centralSymmetry:"Sélectionnez le point à transformer puis le centre de symétrie",
    axialSymmetry:"Sélectionnez le point à transformer puis les deux points de l'axe",
    perpendicular:"Sélectionnez deux points de la droite puis le point de passage",
    parallel:"Sélectionnez deux points de la droite puis le point de passage",
    perpendicularBisector:"Sélectionnez les deux extrémités du segment",bisector:"Sélectionnez trois points : côté, sommet, côté",
    erase:"Cliquez sur un objet à supprimer"
  })[t]||"Choisissez un outil";}

  if(byId("gridToggle"))byId("gridToggle").addEventListener("change",render);
  if(byId("labelsToggle"))byId("labelsToggle").addEventListener("change",render);
  if(byId("undoBtn"))byId("undoBtn").addEventListener("click",undo);
  if(byId("newBtn"))byId("newBtn").addEventListener("click",()=>{if((points.length||objects.length)&&!confirm("Créer une nouvelle construction ?"))return;snapshot();points=[];objects=[];pending=[];selected=null;render();say("Nouvelle construction");});
  if(byId("clearBtn"))byId("clearBtn").addEventListener("click",()=>{if(!confirm("Effacer toute la construction ?"))return;snapshot();points=[];objects=[];pending=[];selected=null;render();say("Construction effacée");});

  function download(name,content,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(byId("saveBtn"))byId("saveBtn").addEventListener("click",()=>download("construction-geojm.json",JSON.stringify({format:"geojm-v2",points,objects,pointSeq,objectSeq},null,2),"application/json"));
  if(byId("exportBtn"))byId("exportBtn").addEventListener("click",()=>{const clone=svg.cloneNode(true);clone.setAttribute("xmlns","http://www.w3.org/2000/svg");download("construction-geojm.svg",new XMLSerializer().serializeToString(clone),"image/svg+xml");});
  if(byId("importBtn")&&byId("importFile")){byId("importBtn").addEventListener("click",()=>byId("importFile").click());byId("importFile").addEventListener("change",async ev=>{const f=ev.target.files?.[0];if(!f)return;try{const d=JSON.parse(await f.text());if(!Array.isArray(d.points)||!Array.isArray(d.objects))throw new Error("JSON invalide");snapshot();restore({points:d.points,objects:d.objects,pointSeq:d.pointSeq||d.pseq,objectSeq:d.objectSeq||d.oseq});say("Construction importée");}catch(e){alert("Fichier JSON invalide ou non reconnu.");}ev.target.value="";});}
  document.addEventListener("keydown",ev=>{if(["INPUT","TEXTAREA"].includes(document.activeElement.tagName))return;const map={v:"select",p:"point",s:"segment",d:"line",t:"triangle",c:"circle",e:"erase"};if(map[ev.key.toLowerCase()])document.querySelector(`.tool[data-tool="${map[ev.key.toLowerCase()]}"]`)?.click();if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==="z"){ev.preventDefault();undo();}if(ev.key==="Escape"){pending=[];render();say("Construction annulée");}});
  window.addEventListener("resize",render);
  dimensions();render();say(toolInfoFor("select"));
})();