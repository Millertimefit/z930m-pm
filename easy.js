(() => {
  const KEY = "hwa-estate-v1";
  let page = sessionStorage.getItem("hwa-page") === "list" ? "app" : "form";
  sessionStorage.removeItem("hwa-page");
  let pendingPhoto = "";

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
  function readState() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "");
      if (raw && Array.isArray(raw.assets)) return raw;
    } catch (e) {}
    return { assets: [], currentId: null, history: [] };
  }
  function writeState(state) {
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  function compressFile(file, done) {
    if (!file || !file.type || file.type.indexOf("image") !== 0) {
      done("");
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 320;
      let w = img.width;
      let h = img.height;
      if (w > h && w > max) {
        h = Math.round((h * max) / w);
        w = max;
      } else if (h >= w && h > max) {
        w = Math.round((w * max) / h);
        h = max;
      }
      const c = document.createElement("canvas");
      c.width = Math.max(1, w);
      c.height = Math.max(1, h);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      try {
        done(c.toDataURL("image/jpeg", 0.72));
      } catch (err) {
        done("");
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      done("");
    };
    img.src = url;
  }
  function showPreview(el, data) {
    if (!el) return;
    if (data) {
      el.style.backgroundImage = "url(" + data + ")";
      el.classList.add("on");
      el.textContent = "";
    } else {
      el.style.backgroundImage = "";
      el.classList.remove("on");
      el.textContent = "+";
    }
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
    pendingPhoto = "";
    const E = estate();
    app.innerHTML =
      '<div class="card start-card">' +
      "<h2>New record</h2>" +
      '<p class="hero-copy">Generic template. Fill it, save, use it again.</p>' +
      '<form id="tmpl-form" novalidate>' +
      "<label>Photo</label>" +
      '<button type="button" class="pic-pick" id="tmpl-pic">' +
      '<span class="pic-preview" id="tmpl-preview">+</span>' +
      "<span>Tap to take or pick a photo. This becomes the icon on Home.</span>" +
      "</button>" +
      '<input id="tmpl-file" type="file" accept="image/*" hidden />' +
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
    const file = app.querySelector("#tmpl-file");
    const preview = app.querySelector("#tmpl-preview");
    const pick = app.querySelector("#tmpl-pic");
    if (pick && file) {
      pick.onclick = () => file.click();
      file.onchange = () => {
        const f = file.files && file.files[0];
        if (!f) return;
        preview.textContent = "…";
        compressFile(f, (data) => {
          pendingPhoto = data;
          showPreview(preview, data);
        });
      };
    }
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
    if (again) again.onclick = () => saveForm(new FormData(form), true);
    markAdd();
  }

  function saveForm(fd, addAnother) {
    const state = readState();
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
      photo: pendingPhoto || "",
    };
    state.assets.push(asset);
    state.currentId = id;
    if (!state.history) state.history = [];
    state.history.unshift({
      id: uid(),
      at: new Date().toISOString(),
      assetId: id,
      assetName: name,
      type: "setup",
      text: "Added " + name,
    });
    writeState(state);
    sessionStorage.setItem("hwa-page", addAnother ? "form" : "list");
    location.reload();
  }

  function injectPics() {
    const app = document.getElementById("app");
    if (!app) return;
    const state = readState();
    const byId = {};
    state.assets.forEach((a) => {
      byId[a.id] = a;
    });
    app.querySelectorAll(".asset[data-id]").forEach((el) => {
      if (el.querySelector(".asset-pic")) return;
      const a = byId[el.dataset.id] || {};
      const pic = document.createElement("div");
      pic.className = "asset-pic";
      if (a.photo) {
        pic.style.backgroundImage = "url(" + a.photo + ")";
      } else {
        pic.classList.add("letter");
        pic.textContent = String(a.name || (el.querySelector("h3") && el.querySelector("h3").textContent) || "?").slice(0, 1).toUpperCase();
      }
      el.insertBefore(pic, el.firstChild);
      el.classList.add("has-pic");
    });
    const hero = app.querySelector(".hero-copy");
    const recCard = hero && hero.closest(".card");
    if (recCard && !recCard.querySelector(".record-pic") && !app.querySelector("#tmpl-form")) {
      const a = state.assets.find((x) => x.id === state.currentId);
      if (a) {
        const wrap = document.createElement("div");
        wrap.className = "record-pic-wrap";
        const pic = document.createElement("div");
        pic.className = "record-pic" + (a.photo ? "" : " letter");
        if (a.photo) pic.style.backgroundImage = "url(" + a.photo + ")";
        else pic.textContent = String(a.name || "?").slice(0, 1).toUpperCase();
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ghost";
        btn.id = "chg-pic";
        btn.textContent = a.photo ? "Change photo" : "Add photo";
        const file = document.createElement("input");
        file.type = "file";
        file.accept = "image/*";
        file.hidden = true;
        btn.onclick = () => file.click();
        file.onchange = () => {
          const f = file.files && file.files[0];
          if (!f) return;
          compressFile(f, (data) => {
            if (!data) return;
            const next = readState();
            const hit = next.assets.find((x) => x.id === a.id);
            if (hit) {
              hit.photo = data;
              writeState(next);
            }
            pic.style.backgroundImage = "url(" + data + ")";
            pic.classList.remove("letter");
            pic.textContent = "";
            btn.textContent = "Change photo";
          });
        };
        wrap.appendChild(pic);
        wrap.appendChild(btn);
        wrap.appendChild(file);
        recCard.insertBefore(wrap, hero);
      }
    }
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
      return;
    }
    injectPics();
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
