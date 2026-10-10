(() => {
  "use strict";

  const svg = document.getElementById("canvas");
  const axes = document.getElementById("axes");
  const objLayer = document.getElementById("objects");
  const pointLayer = document.getElementById("points");
  const preview = document.getElementById("preview");
  const status = document.getElementById("statusText");
  const coordsText = document.getElementById("coordText");
  const props = document.getElementById("propertiesContent");
  const list = document.getElementById("objectList");
  const empty = document.getElementById("emptyHint");

  if (!svg || !axes || !objLayer || !pointLayer || !preview) {
    console.error("GéoJM : éléments SVG manquants dans geometrie.html.");
    return;
  }

  let points = [];
  let objects = [];
  let tool = "select";
  let pending = [];
  let selected = null;
  let drag = null;
  let dragChanged = false;
  let history = [];
  let pseq = 1;
  let oseq = 1;
  let W = 800;
  let H = 600;

  const toolInfo = {
    select: "Sélectionnez ou déplacez un point",
    point: "Cliquez pour créer un point",
    segment: "Cliquez deux fois pour créer un segment",
    line: "Cliquez deux fois pour tracer une droite",
    triangle: "Cliquez trois fois pour construire un triangle",
    circle: "Cliquez sur le centre puis sur un point du cercle",
    midpoint: "Cliquez sur deux points existants",
    perpendicular: "Choisissez deux points de la droite puis un point de passage",
    erase: "Cliquez sur un point ou un objet à supprimer"
  };

  const byId = id => document.getElementById(id);
  const fmt = n => Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "—";
  const say = message => { if (status) status.textContent = message; };
  const pointById = id => points.find(p => p.id === id);
  const objectById = id => objects.find(o => o.id === id);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const typeLabel = type => ({
    segment: "Segment", line: "Droite", triangle: "Triangle",
    circle: "Cercle", midpoint: "Milieu", perpendicular: "Perpendiculaire"
  })[type] || type;

  function svgEl(tag, attrs = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function dimensions() {
    const rect = svg.getBoundingClientRect();
    W = Math.max(rect.width, 1);
    H = Math.max(rect.height, 1);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  }

  function eventPosition(event) {
    const rect = svg.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function snapshot() {
    history.push(JSON.stringify({ points, objects, pseq, oseq }));
    if (history.length > 50) history.shift();
  }

  function restore(data) {
    points = Array.isArray(data.points) ? data.points : [];
    objects = Array.isArray(data.objects) ? data.objects : [];
    pseq = data.pseq || (points.length + 1);
    oseq = data.oseq || (objects.length + 1);
    pending = [];
    selected = null;
    drag = null;
    render();
  }

  function undo() {
    if (!history.length) {
      say("Aucune action à annuler");
      return;
    }
    restore(JSON.parse(history.pop()));
    say("Dernière action annulée");
  }

  function addPoint(x, y) {
    const n = pseq++;
    const label = String.fromCharCode(64 + ((n - 1) % 26) + 1) + (n > 26 ? Math.floor((n - 1) / 26) + 1 : "");
    const point = { id: `P${n}`, label, x, y };
    points.push(point);
    return point;
  }

  function addObject(type, selectedPoints) {
    const object = { id: `O${oseq++}`, type, refs: selectedPoints.map(p => p.id) };
    objects.push(object);
    return object;
  }

  function lineCoordinates(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.01) return null;
    const margin = Math.max(W, H) * 2;
    return {
      x1: a.x - dx / length * margin,
      y1: a.y - dy / length * margin,
      x2: b.x + dx / length * margin,
      y2: b.y + dy / length * margin
    };
  }

  function drawAxes() {
    axes.replaceChildren();
    const cx = W / 2;
    const cy = H / 2;

    axes.append(
      svgEl("line", { x1: 0, y1: cy, x2: W, y2: cy, class: "axis" }),
      svgEl("line", { x1: cx, y1: 0, x2: cx, y2: H, class: "axis" })
    );

    for (let x = cx + 25; x < W; x += 25) {
      axes.append(svgEl("line", { x1: x, y1: cy - 3, x2: x, y2: cy + 3, class: "axis" }));
    }
    for (let x = cx - 25; x > 0; x -= 25) {
      axes.append(svgEl("line", { x1: x, y1: cy - 3, x2: x, y2: cy + 3, class: "axis" }));
    }
    for (let y = cy + 25; y < H; y += 25) {
      axes.append(svgEl("line", { x1: cx - 3, y1: y, x2: cx + 3, y2: y, class: "axis" }));
    }
    for (let y = cy - 25; y > 0; y -= 25) {
      axes.append(svgEl("line", { x1: cx - 3, y1: y, x2: cx + 3, y2: y, class: "axis" }));
    }

    // Important : append() ne renvoie pas le nœud ajouté.
    const xLabel = svgEl("text", { x: W - 17, y: cy - 8, class: "axis-label" });
    xLabel.textContent = "x";
    axes.append(xLabel);

    const yLabel = svgEl("text", { x: cx + 8, y: 13, class: "axis-label" });
    yLabel.textContent = "y";
    axes.append(yLabel);
  }

  function renderObject(object) {
    const ps = object.refs.map(pointById);
    if (ps.some(p => !p)) return null;

    const attrs = {
      class: "geo-line" + (selected === object.id ? " selected" : ""),
      "data-oid": object.id
    };
    let node = null;
    const a = ps[0];
    const b = ps[1];

    if (object.type === "segment") {
      node = svgEl("line", { ...attrs, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    } else if (object.type === "line") {
      const line = lineCoordinates(a, b);
      if (line) node = svgEl("line", { ...attrs, ...line });
    } else if (object.type === "triangle") {
      node = svgEl("polygon", {
        ...attrs, points: ps.map(p => `${p.x},${p.y}`).join(" "),
        fill: "rgba(49,94,251,.05)"
      });
    } else if (object.type === "circle") {
      node = svgEl("circle", {
        ...attrs, cx: a.x, cy: a.y, r: distance(a, b),
        fill: "rgba(49,94,251,.03)"
      });
    } else if (object.type === "midpoint") {
      node = svgEl("circle", {
        ...attrs, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
        r: 5, fill: "#21a675"
      });
    } else if (object.type === "perpendicular" && ps.length === 3) {
      const c = ps[2];
      const line = lineCoordinates(c, { x: c.x - (b.y - a.y), y: c.y + (b.x - a.x) });
      if (line) node = svgEl("line", { ...attrs, ...line });
    }

    if (node) {
      node.addEventListener("pointerdown", event => {
        if (tool === "select") {
          event.stopPropagation();
          selected = object.id;
          render();
        }
      });
      node.addEventListener("click", event => {
        if (tool === "erase") {
          event.stopPropagation();
          removeObject(object.id);
        }
      });
    }
    return node;
  }

  function renderProperties() {
    if (!props) return;
    const point = pointById(selected);
    const object = objectById(selected);

    if (!point && !object) {
      props.className = "empty-props";
      props.textContent = "Sélectionnez un point ou un objet pour consulter ses propriétés.";
      return;
    }

    props.className = "";
    if (point) {
      props.innerHTML = "";
      const card = document.createElement("div");
      card.className = "prop-card";
      const title = document.createElement("b");
      title.textContent = `Point ${point.label}`;
      card.append(title);
      const rows = [
        ["Coordonnée x", fmt((point.x - W / 2) / 25)],
        ["Coordonnée y", fmt((H / 2 - point.y) / 25)],
        ["Position écran", `${fmt(point.x)} ; ${fmt(point.y)}`]
      ];
      rows.forEach(([label, value]) => {
        const row = document.createElement("div");
        row.className = "prop-row";
        const l = document.createElement("span");
        l.textContent = label;
        const v = document.createElement("strong");
        v.textContent = value;
        row.append(l, v);
        card.append(row);
      });
      props.append(card);
      return;
    }

    const ps = object.refs.map(pointById);
    let measure = "—";
    if (object.type === "segment") measure = fmt(distance(ps[0], ps[1]) / 25);
    if (object.type === "circle") measure = "Rayon : " + fmt(distance(ps[0], ps[1]) / 25);
    if (object.type === "triangle") {
      measure = ps.map((p, i) => fmt(distance(p, ps[(i + 1) % 3]) / 25)).join(" ; ");
    }
    props.innerHTML = "";
    const card = document.createElement("div");
    card.className = "prop-card";
    const title = document.createElement("b");
    title.textContent = typeLabel(object.type);
    card.append(title);
    [
      ["Défini par", ps.map(p => p.label).join(", ")],
      ["Mesure (unités de grille)", measure]
    ].forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "prop-row";
      const l = document.createElement("span");
      l.textContent = label;
      const v = document.createElement("strong");
      v.textContent = value;
      row.append(l, v);
      card.append(row);
    });
    props.append(card);
  }

  function renderList() {
    if (!list) return;
    list.replaceChildren();
    if (!points.length && !objects.length) {
      list.textContent = "Aucun objet pour le moment.";
      return;
    }

    const addItem = (id, name, icon) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "object-item" + (selected === id ? " active" : "");
      const iconSpan = document.createElement("span");
      iconSpan.textContent = icon;
      const nameSpan = document.createElement("span");
      nameSpan.textContent = name;
      const arrow = document.createElement("span");
      arrow.textContent = "›";
      button.append(iconSpan, nameSpan, arrow);
      button.addEventListener("click", () => { selected = id; render(); });
      list.append(button);
    };

    points.forEach(p => addItem(p.id, `Point ${p.label}`, "•"));
    objects.forEach(o => addItem(o.id, typeLabel(o.type), ({
      segment: "／", line: "↗", triangle: "△", circle: "◯",
      midpoint: "⊙", perpendicular: "⊥"
    })[o.type] || "◇"));
  }

  function render() {
    dimensions();
    const grid = byId("gridLayer");
    if (grid && byId("gridToggle")) grid.style.display = byId("gridToggle").checked ? "" : "none";
    drawAxes();
    objLayer.replaceChildren();
    pointLayer.replaceChildren();
    preview.replaceChildren();

    objects.forEach(object => {
      const node = renderObject(object);
      if (node) objLayer.append(node);
    });

    points.forEach(point => {
      const group = svgEl("g", { "data-pid": point.id });
      const circle = svgEl("circle", {
        cx: point.x, cy: point.y,
        r: selected === point.id ? 6 : 4.7,
        class: "geo-point" + (selected === point.id ? " selected" : "")
      });

      circle.addEventListener("pointerdown", event => {
        if (tool === "select") {
          event.stopPropagation();
          selected = point.id;
          drag = point.id;
          dragChanged = false;
          if (svg.setPointerCapture) svg.setPointerCapture(event.pointerId);
          render();
        } else if (tool === "erase") {
          event.stopPropagation();
          removePoint(point.id);
        }
      });

      circle.addEventListener("click", event => {
        event.stopPropagation();
        if (tool !== "select" && tool !== "erase") handlePointTool(point);
      });

      group.append(circle);
      if (byId("labelsToggle") && byId("labelsToggle").checked) {
        const label = svgEl("text", { x: point.x + 8, y: point.y - 8, class: "point-label" });
        label.textContent = point.label;
        group.append(label);
      }
      pointLayer.append(group);
    });

    if (pending.length) {
      const ps = pending.map(pointById).filter(Boolean);
      ps.forEach(p => preview.append(svgEl("circle", { cx: p.x, cy: p.y, r: 4.5, fill: "#8498ff" })));
      if (ps.length >= 2) {
        if (tool === "segment") preview.append(svgEl("line", {
          x1: ps[0].x, y1: ps[0].y, x2: ps[1].x, y2: ps[1].y, class: "preview"
        }));
        if (tool === "line") {
          const line = lineCoordinates(ps[0], ps[1]);
          if (line) preview.append(svgEl("line", { ...line, class: "preview" }));
        }
        if (tool === "triangle") preview.append(svgEl("polyline", {
          points: ps.map(p => `${p.x},${p.y}`).join(" "), class: "preview"
        }));
        if (tool === "circle") preview.append(svgEl("circle", {
          cx: ps[0].x, cy: ps[0].y, r: distance(ps[0], ps[1]), class: "preview"
        }));
      }
    }

    if (empty) empty.style.display = (points.length || objects.length) ? "none" : "block";
    renderProperties();
    renderList();
  }

  function removeObject(id) {
    snapshot();
    objects = objects.filter(o => o.id !== id);
    selected = null;
    render();
    say("Objet supprimé");
  }

  function removePoint(id) {
    snapshot();
    points = points.filter(p => p.id !== id);
    objects = objects.filter(o => !o.refs.includes(id));
    selected = null;
    render();
    say("Point et objets associés supprimés");
  }

  function finish(type, selectedPoints) {
    snapshot();
    const object = addObject(type, selectedPoints);
    pending = [];
    selected = object.id;
    render();
    say(typeLabel(type) + " créé");
  }

  function handlePointTool(point) {
    if (tool === "midpoint") {
      if (!pending.length) {
        pending = [point.id];
        say("Choisissez le deuxième point");
        render();
      } else if (point.id !== pending[0]) {
        finish("midpoint", [pointById(pending[0]), point]);
      }
      return;
    }

    if (tool === "perpendicular") {
      if (pending.includes(point.id)) return;
      pending.push(point.id);
      if (pending.length === 1) say("Choisissez le deuxième point de la droite");
      else if (pending.length === 2) say("Choisissez le point de passage");
      else finish("perpendicular", pending.map(pointById));
      render();
      return;
    }

    const required = { segment: 2, line: 2, triangle: 3, circle: 2 }[tool];
    if (!required || pending.includes(point.id)) return;
    pending.push(point.id);
    if (pending.length >= required) finish(tool, pending.map(pointById));
    else {
      say(`${pending.length}/${required} points sélectionnés`);
      render();
    }
  }

  function canvasClick(point) {
    if (tool === "point") {
      snapshot();
      const created = addPoint(point.x, point.y);
      selected = created.id;
      render();
      say(`Point ${created.label} créé`);
      return;
    }

    if (["segment", "line", "triangle", "circle"].includes(tool)) {
      snapshot();
      pending.push(addPoint(point.x, point.y).id);
      const required = { segment: 2, line: 2, triangle: 3, circle: 2 }[tool];
      if (pending.length >= required) finish(tool, pending.map(pointById));
      else {
        render();
        say(`${pending.length}/${required} points placés`);
      }
      return;
    }

    if (tool === "midpoint" || tool === "perpendicular") {
      say("Cliquez sur des points existants pour cette construction");
      return;
    }

    if (tool === "erase") {
      let nearest = null;
      let nearestDistance = 18;
      points.forEach(p => {
        const d = distance(point, p);
        if (d < nearestDistance) { nearestDistance = d; nearest = p.id; }
      });
      if (nearest) removePoint(nearest);
      return;
    }

    selected = null;
    render();
  }

  svg.addEventListener("pointerdown", event => {
    if (event.target.closest("[data-pid]") || event.target.closest("[data-oid]")) return;
    if (tool === "select") {
      selected = null;
      render();
      return;
    }
    canvasClick(eventPosition(event));
  });

  svg.addEventListener("pointermove", event => {
    const position = eventPosition(event);
    if (coordsText) coordsText.textContent =
      `x : ${fmt((position.x - W / 2) / 25)} · y : ${fmt((H / 2 - position.y) / 25)}`;

    if (drag) {
      const point = pointById(drag);
      if (point) {
        point.x = position.x;
        point.y = position.y;
        dragChanged = true;
        render();
      }
    }
  });

  svg.addEventListener("pointerup", () => {
    if (drag && dragChanged) {
      // Enregistrer l'état après déplacement pour permettre l'annulation.
      snapshot();
      say("Point déplacé");
    }
    drag = null;
    dragChanged = false;
  });
  svg.addEventListener("pointercancel", () => { drag = null; dragChanged = false; });

  document.querySelectorAll(".tool").forEach(button => {
    button.addEventListener("click", () => {
      tool = button.dataset.tool;
      pending = [];
      document.querySelectorAll(".tool").forEach(b => b.classList.toggle("active", b === button));
      say(toolInfo[tool] || "");
      render();
    });
  });

  if (byId("gridToggle")) byId("gridToggle").addEventListener("change", render);
  if (byId("labelsToggle")) byId("labelsToggle").addEventListener("change", render);
  if (byId("undoBtn")) byId("undoBtn").addEventListener("click", undo);

  if (byId("newBtn")) byId("newBtn").addEventListener("click", () => {
    if ((points.length || objects.length) && !confirm("Créer une nouvelle construction ? Exportez d'abord si nécessaire.")) return;
    snapshot(); points = []; objects = []; pending = []; selected = null; render(); say("Nouvelle construction");
  });

  if (byId("clearBtn")) byId("clearBtn").addEventListener("click", () => {
    if (!confirm("Effacer toute la construction ?")) return;
    snapshot(); points = []; objects = []; pending = []; selected = null; render(); say("Construction effacée");
  });

  function download(filename, content, mime) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (byId("saveBtn")) byId("saveBtn").addEventListener("click", () => {
    download("construction-geojm.json", JSON.stringify({
      format: "geojm-v1", points, objects, pseq, oseq
    }, null, 2), "application/json");
    say("Construction exportée en JSON");
  });

  if (byId("exportBtn")) byId("exportBtn").addEventListener("click", () => {
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const previewLayer = clone.querySelector("#preview");
    if (previewLayer) previewLayer.replaceChildren();
    download("construction-geojm.svg", new XMLSerializer().serializeToString(clone), "image/svg+xml");
    say("Dessin exporté en SVG");
  });

  if (byId("importBtn") && byId("importFile")) {
    byId("importBtn").addEventListener("click", () => byId("importFile").click());
    byId("importFile").addEventListener("change", async event => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.points) || !Array.isArray(data.objects)) throw new Error("Format invalide");
        snapshot();
        restore({
          points: data.points, objects: data.objects,
          pseq: data.pseq || Math.max(0, ...data.points.map(p => Number(String(p.id).slice(1)) || 0)) + 1,
          oseq: data.oseq || Math.max(0, ...data.objects.map(o => Number(String(o.id).slice(1)) || 0)) + 1
        });
        say("Construction importée");
      } catch (error) {
        alert("Fichier JSON invalide ou format non reconnu.");
      }
      event.target.value = "";
    });
  }

  document.addEventListener("keydown", event => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    const shortcuts = { v: "select", p: "point", s: "segment", d: "line", t: "triangle", c: "circle", e: "erase" };
    const key = event.key.toLowerCase();
    if (shortcuts[key]) {
      const button = document.querySelector(`.tool[data-tool="${shortcuts[key]}"]`);
      if (button) button.click();
    }
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      undo();
    }
    if (event.key === "Escape") {
      pending = [];
      render();
      say("Construction en cours annulée");
    }
  });

  window.addEventListener("resize", render);
  render();
  say(toolInfo.select);
})();
