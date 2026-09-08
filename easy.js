(() => {
  const KEY = "hwa-estate-v1";
  let page = sessionStorage.getItem("hwa-page") === "list" ? "app" : "form";
  sessionStorage.removeItem("hwa-page");

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }
  function opts(list) {
    return (list || []).map((s) => '<option value="' + esc(s.id) + '">' + esc(s.label) + "</option>").join("");
  }
  function estate() {
    return window.ESTATE || { sites: [], categories: [], stock: [] };
  }
  function meterFor(id) {
    const c = (estate().categories || []).find((x) => x.id === id);
    return c ? c.meter : "hours";
  }
  function unitFor(id) {
    const s = (estate().stock || []).find((x) => x.id === id);
    return s ? s.unit : "each";
  }
  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }
  function markAdd() {
    document.querySelectorAll("#nav button").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-view") === "add");
    });
    const hours = document.getElementById("hdr-hours");
    if (hours) hours.textContent = "New record — same form every time";
  }

  function extraFields(kind) {
    const E = estate();
    if (kind === "inventory") {
      return (
        '<label>Stock item</label><select name="stock">' +
        opts(E.stock) +
        "</select>" +
        '<label>On hand</label><div class="row2"><div><input name="qty" type="number" min="0" step="0.1" value="0" /></div>' +
        '<div><label>Unit</label><input name="unit" value="each" /></div></div>'
      );
    }
    return (
      '<label>Class</label><select name="category">' +
      opts(E.categories) +
      "</select>" +
      '<div class="row2"><div><label>Reading now</label><input name="meter" type="number" min="0" step="0.1" value="0" /></div>' +
      '<div><label>Serial / VIN</label><input name="serial" placeholder="Optional" /></div></div>'
    );
  }

  function paintForm() {
    const app = document.getElementById("app");
    if (!app) return;
    const E = estate();
    app.innerHTML =
      '<div class="card start-card">' +
      "<h2>New record</h2>" +
      '<p class="hero-copy">Generic template. Fill it, save, use it again.</p>' +
      '<form id="tmpl-form" novalidate>' +
      '<label>Name</label><input name="name" placeholder="Gator, gate 3, oil, filters…" />' +
      "<label>What is it</label>" +
      '<div class="event-types" id="tmpl-kind">' +
      '<label class="picked"><input type="radio" name="kind" value="asset" checked /> <span>Equipment<small>Mower, truck, gate, plane, tool</small></span></label>' +
      '<label><input type="radio" name="kind" value="inventory" /> <span>Stock<small>Filters, oil, fuel, grease</small></span></label>' +
      "</div>" +
      '<label>Where</label><select name="site">' +
      opts(E.sites) +
      "</select>" +
      '<div id="tmpl-extra"></div>' +
      '<label>Notes</label><textarea name="notes" placeholder="Optional"></textarea>' +
      '<button class="primary block" type="submit">Save</button>' +
      '<button class="secondary block" type="button" id="tmpl-again">Save and add another</button>' +
      "</form></div>";
    const extra = app.querySelector("#tmpl-extra");
    function paintKind() {
      const kind = (app.querySelector("input[name=kind]:checked") || {}).value || "asset";
      extra.innerHTML = extraFields(kind);
      const stock = extra.querySelector("[name=stock]");
      const unit = extra.querySelector("[name=unit]");
      if (stock && unit) {
        const sync = () => {
          unit.value = unitFor(stock.value);
        };
        stock.onchange = sync;
        sync();
      }
      const cat = extra.querySelector("[name=category]");
      const meter = extra.querySelector("[name=meter]");
      if (cat && meter) {
        const lab = meter.previousElementSibling;
        const sync = () => {
          if (lab) lab.textContent = "Reading now (" + meterFor(cat.value) + ")";
        };
        cat.onchange = sync;
        sync();
      }
    }
    paintKind();
    app.querySelectorAll("#tmpl-kind input").forEach((r) => {
      r.onchange = () => {
        app.querySelectorAll("#tmpl-kind label").forEach((l) => l.classList.toggle("picked", l.querySelector("input").checked));
        paintKind();
      };
    });
    const form = app.querySelector("#tmpl-form");
    form.onsubmit = (e) => {
      e.preventDefault();
      saveForm(new FormData(form), false);
    };
    const again = app.querySelector("#tmpl-again");
    if (again) {
      again.onclick = () => saveForm(new FormData(form), true);
    }
    markAdd();
  }

  function saveForm(fd, addAnother) {
    let state;
    try {
      state = JSON.parse(localStorage.getItem(KEY) || "");
    } catch (e) {
      state = null;
    }
    if (!state || !Array.isArray(state.assets)) state = { assets: [], currentId: null, history: [] };
    if (!state.history) state.history = [];
    const kind = fd.get("kind") || "asset";
    const stockId = fd.get("stock") || "other";
    const category = kind === "inventory" ? stockId : fd.get("category") || "equipment";
    const qty = Number(fd.get("qty") || fd.get("meter") || 0);
    const stock = (estate().stock || []).find((x) => x.id === stockId);
    const name =
      String(fd.get("name") || "").trim() ||
      (kind === "inventory" && stock ? stock.label : "New item");
    const unit = kind === "inventory" ? String(fd.get("unit") || unitFor(stockId) || "each") : meterFor(category);
    const id = uid();
    const asset = {
      id: id,
      kind: kind,
      name: name,
      site: fd.get("site") || "main-house",
      category: category,
      meter: qty,
      meterLabel: unit,
      qty: kind === "inventory" ? qty : 0,
      unit: kind === "inventory" ? unit : "",
      reorder: 0,
      serial: String(fd.get("serial") || "").trim(),
      inService: todayISO(),
      scheduleKind: "generic",
      variant: "non-efi",
      owner: "",
      notes: String(fd.get("notes") || "").trim(),
      nextStep: "",
      nextStepBy: "",
      tasks: [],
    };
    state.assets.push(asset);
    state.currentId = id;
    state.history.unshift({
      id: uid(),
      at: new Date().toISOString(),
      assetId: id,
      assetName: name,
      type: "setup",
      text: "Added " + name,
    });
    localStorage.setItem(KEY, JSON.stringify(state));
    sessionStorage.setItem("hwa-page", addAnother ? "form" : "list");
    location.reload();
  }

  function polishApp() {
    const app = document.getElementById("app");
    if (!app) return;
    const logBtn = [...app.querySelectorAll("button")].find((b) => b.textContent === "Log an event");
    if (logBtn && !logBtn.classList.contains("block")) {
      logBtn.textContent = "Log work";
      logBtn.classList.add("primary", "block");
      const hero = logBtn.closest(".card") && logBtn.closest(".card").querySelector(".hero-copy");
      if (hero) hero.insertAdjacentElement("afterend", logBtn);
    }
    const today = [...app.querySelectorAll("h2")].find((h) => h.textContent === "Today");
    if (today) {
      const boardBtn = document.querySelector('#nav [data-view="board"]');
      if (boardBtn) boardBtn.click();
    }
  }

  function tick() {
    if (page === "form") {
      if (!document.getElementById("tmpl-form")) paintForm();
      return;
    }
    polishApp();
  }

  document.addEventListener(
    "click",
    (e) => {
      const addTab = e.target.closest('#nav [data-view="add"]');
      if (addTab) {
        e.preventDefault();
        e.stopPropagation();
        page = "form";
        paintForm();
        return;
      }
      const homeTab = e.target.closest('#nav [data-view="board"], #nav [data-view="home"]');
      const moreTab = e.target.closest('#nav [data-view="more"]');
      if (homeTab || moreTab) page = "app";
    },
    true
  );

  const app = document.getElementById("app");
  if (app && window.MutationObserver) {
    new MutationObserver(tick).observe(app, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tick);
  else tick();
})();
