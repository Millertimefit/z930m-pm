(() => {
  "use strict";
  const KEY = "hwa-estate-v1";
  const DUE_SOON = 10;
  const $app = document.getElementById("app");
  const $nav = document.getElementById("nav");
  const EVENT_TYPES = [
    { id: "inspection", label: "Inspection", hint: "Walkaround, daily checks, look-over" },
    { id: "repair", label: "Repair", hint: "Something failed — fix it" },
    { id: "unscheduled", label: "Unscheduled", hint: "Extra work, not on the chart" },
    { id: "interval", label: "Interval", hint: "Scheduled service from hours / miles" }
  ];
  let state = load();
  let view = "home";
  let completeId = null;
  let eventType = "";
  let siteFilter = "all";
  let catFilter = "all";
  let kindFilter = "all";
  let searchQuery = "";
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function addDays(iso, days) {
    const d = new Date((iso || todayISO()) + "T12:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && Array.isArray(raw.assets)) {
        raw.assets.forEach((a) => {
          if (a.owner == null) a.owner = "";
          if (a.notes == null) a.notes = "";
          if (a.nextStep == null) a.nextStep = "";
          if (a.nextStepBy == null) a.nextStepBy = "";
          if (!a.kind) a.kind = "asset";
          if (a.qty == null) a.qty = a.kind === "inventory" ? (a.meter || 0) : 0;
          if (!a.unit) a.unit = a.kind === "inventory" ? (a.meterLabel || "each") : "";
          if (a.reorder == null) a.reorder = 0;
        });
        if (!raw.history) raw.history = [];
        return raw;
      }
    } catch (e) {}
    return { assets: [], currentId: null, history: [] };
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(state)); }
  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&").replace(/</g, "<").replace(/"/g, """);
  }
  function siteLabel(id) { const s = ESTATE.sites.find((x) => x.id === id); return s ? s.label : id; }
  function catLabel(id) {
    const s = ESTATE.categories.find((x) => x.id === id) || (ESTATE.stock || []).find((x) => x.id === id);
    return s ? s.label : id;
  }
  function catMeter(id) { const s = ESTATE.categories.find((x) => x.id === id); return s ? s.meter : "hours"; }
  function isInv(a) { return a && a.kind === "inventory"; }
  function stockOf(id) { return (ESTATE.stock || []).find((x) => x.id === id) || null; }
  function current() { return state.assets.find((a) => a.id === state.currentId) || null; }
  function log(entry) {
    const a = current();
    state.history.unshift(Object.assign({ id: uid(), at: new Date().toISOString(), assetId: a && a.id, assetName: a && a.name }, entry));
  }
  function templatesForAsset(asset) {
    if (asset.scheduleKind === "z930m") {
      return DEERE_SCHEDULE.templates.filter((t) => !t.variants || t.variants.includes(asset.variant || "non-efi"));
    }
    const key = isInv(asset) ? "inventory" : asset.category;
    return (GENERIC_SCHEDULES[key] || []).map((t) => Object.assign({ parts: {}, note: "" }, t));
  }
  function intervalOf(t, asset) {
    if (t.intervalHoursByVariant) return t.intervalHoursByVariant[asset.variant || "non-efi"];
    return t.intervalHours || null;
  }
  function firstDueHours(hours, interval, firstAt) {
    if (!interval) return null;
    if (firstAt != null && hours <= firstAt) return firstAt;
    return (Math.floor(hours / interval) + 1) * interval;
  }
  function makeTask(t, asset, dueHours, dueDate) {
    const variant = asset.variant || "non-efi";
    return {
      id: uid(), templateId: t.id || null, title: t.title,
      intervalHours: intervalOf(t, asset), intervalDays: t.intervalDays || null,
      yearly: !!t.yearly, repeating: true, custom: false, dueHours, dueDate,
      parts: (t.parts && (t.parts[variant] || t.parts)) || "", note: t.note || "", status: "open"
    };
  }
  function seedTasks(asset) {
    const hours = asset.meter || 0;
    const start = asset.inService || todayISO();
    return templatesForAsset(asset).map((t) => {
      const interval = intervalOf(t, asset);
      const dueHours = interval ? firstDueHours(hours, interval, t.firstAtHours) : null;
      let dueDate = null;
      if (t.yearly) dueDate = addDays(start, 365);
      if (t.intervalDays) dueDate = addDays(start, t.intervalDays);
      return makeTask(t, asset, dueHours, dueDate);
    });
  }
  function taskStatus(task, hours, today) {
    if (task.status !== "open") return "done";
    if ((task.dueHours != null && hours >= task.dueHours) || (task.dueDate && today >= task.dueDate)) return "overdue";
    if (task.dueHours != null && task.dueHours - hours <= DUE_SOON) return "due";
    return "upcoming";
  }
  function openTasks(asset) { return (asset.tasks || []).filter((t) => t.status === "open"); }
  function overdueCount(asset) {
    const today = todayISO();
    return openTasks(asset).filter((t) => taskStatus(t, asset.meter, today) === "overdue").length;
  }
  function estateOverdue() { return state.assets.reduce((n, a) => n + overdueCount(a), 0); }
  function hoursAgo(iso) {
    if (!iso) return null;
    return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3600000));
  }
  function lastActivity(asset) { return state.history.find((h) => h.assetId === asset.id) || null; }
  function quietHours() {
    if (!state.history.length) return null;
    return hoursAgo(state.history[0].at);
  }
  function assetHealth(asset) {
    if (isInv(asset)) {
      const q = Number(asset.qty != null ? asset.qty : asset.meter) || 0;
      const r = Number(asset.reorder) || 0;
      if (q <= 0) return "override";
      if (r && q <= r) return "watch";
      return "steady";
    }
    const fail = state.history.find((h) => h.assetId === asset.id && h.eventType === "inspection" && /fail/i.test(h.text || ""));
    if (fail && hoursAgo(fail.at) < 24 * 21) return "override";
    if (overdueCount(asset)) return "watch";
    return "steady";
  }
  function healthLabel(h) { return h === "override" ? "Needs a look" : h === "watch" ? "In view" : "Settled"; }
  function related(asset) { return state.assets.filter((a) => a.site === asset.site && a.id !== asset.id); }
  function dueSoonOpen(asset) {
    const today = todayISO();
    return openTasks(asset).filter((t) => {
      const st = taskStatus(t, asset.meter, today);
      return st === "overdue" || st === "due";
    });
  }
  function focusItems() {
    const today = todayISO();
    const items = [];
    state.assets.forEach((a) => {
      if (assetHealth(a) === "override") {
        const blurb = isInv(a) ? a.name + " at " + siteLabel(a.site) + " is out. Restock when you can." : a.name + " had a failed inspection. It is waiting on your call, not the clock.";
        items.push({ asset: a, kind: "override", blurb });
      }
    });
    state.assets.forEach((a) => {
      if (items.some((x) => x.asset.id === a.id)) return;
      if (isInv(a) && assetHealth(a) === "watch") {
        items.push({ asset: a, kind: "watch", blurb: a.name + " at " + siteLabel(a.site) + " is below the mark — restock when convenient." });
        return;
      }
      if (dueSoonOpen(a).length) items.push({ asset: a, kind: "watch", blurb: a.name + " at " + siteLabel(a.site) + " has work inside the window — no rush." });
    });
    state.assets.forEach((a) => {
      if (items.some((x) => x.asset.id === a.id)) return;
      if (a.nextStep && a.nextStepBy && a.nextStepBy <= today) items.push({ asset: a, kind: "watch", blurb: a.name + ": " + a.nextStep });
    });
    return items.slice(0, 2);
  }
  function synthesis() {
    const n = state.assets.length;
    if (!n) return "Built For Life is ready. Add a unit when you are on site. Nothing needs you until then.";
    const od = estateOverdue();
    const recent = state.history.filter((h) => hoursAgo(h.at) != null && hoursAgo(h.at) <= 36);
    const s1 = od === 0 ? "The estate is settled." : od === 1 ? "The estate is quiet, with one item in view." : "The estate is holding, with a few items in view.";
    const s2 = recent.length ? recent.length + (recent.length === 1 ? " note closed while you were away." : " notes closed while you were away.") : "Nothing new closed since your last look.";
    const focus = focusItems();
    return s1 + " " + s2 + " " + (focus[0] ? focus[0].blurb : "Nothing needs you. The estate is executing.");
  }
  function matchesSearch(a) {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return [a.name, a.serial, a.owner, a.notes, a.nextStep, a.kind, siteLabel(a.site), catLabel(a.category)].join(" ").toLowerCase().indexOf(q) !== -1;
  }
  function updateMeter(asset, next, silent) {
    if (next < asset.meter) return "Meter cannot go backwards.";
    if (next === asset.meter) return null;
    const cur = asset.meter;
    asset.meter = next;
    if (!silent) log({ type: "hours", text: asset.name + " " + cur + " -> " + next, hours: next });
    save();
    return null;
  }
  function completeTask(asset, id, payload) {
    const task = asset.tasks.find((t) => t.id === id);
    if (!task) return;
    const hours = payload.hours;
    task.status = "done";
    task.completedAt = todayISO();
    task.completedHours = hours;
    log({ type: "complete", eventType: payload.eventType || "interval", text: asset.name + " - " + task.title + " at " + hours, hours });
    if (hours > asset.meter) asset.meter = hours;
    if (task.repeating && (task.intervalHours || task.intervalDays || task.yearly)) {
      const nextHours = task.intervalHours ? hours + task.intervalHours : null;
      let nextDate = null;
      if (task.yearly) nextDate = addDays(payload.date || todayISO(), 365);
      if (task.intervalDays) nextDate = addDays(payload.date || todayISO(), task.intervalDays);
      asset.tasks.push(Object.assign({}, task, { id: uid(), status: "open", dueHours: nextHours, dueDate: nextDate, completedAt: null, completedHours: null }));
    }
    save();
  }
  function addAsset(fd) {
    const kind = fd.get("kind") || "asset";
    const stockId = fd.get("stock") || "";
    const stock = stockOf(stockId);
    const category = kind === "inventory" ? (stockId || "other") : fd.get("category");
    const qty = Number(fd.get("qty") || 0);
    const unit = String(fd.get("unit") || (stock && stock.unit) || "each");
    const name = String(fd.get("name") || "").trim() || (stock ? stock.label : "Item");
    const asset = {
      id: uid(), kind, name, site: fd.get("site"), category,
      meter: kind === "inventory" ? qty : Number(fd.get("meter") || 0),
      meterLabel: kind === "inventory" ? unit : catMeter(category),
      qty, unit, reorder: Number(fd.get("reorder") || 0),
      serial: String(fd.get("serial") || "").trim(), inService: fd.get("inService") || todayISO(),
      scheduleKind: kind === "inventory" ? "generic" : (fd.get("scheduleKind") || "generic"),
      variant: fd.get("variant") || "non-efi",
      owner: String(fd.get("owner") || "").trim(), notes: String(fd.get("notes") || "").trim(),
      nextStep: String(fd.get("nextStep") || "").trim(), nextStepBy: fd.get("nextStepBy") || "", tasks: []
    };
    asset.tasks = seedTasks(asset);
    state.assets.push(asset);
    state.currentId = asset.id;
    log({ type: "setup", text: "Added " + asset.name + " at " + siteLabel(asset.site) });
    save();
  }
  function filteredAssets() {
    return state.assets.filter((a) => {
      const kind = a.kind || "asset";
      if (kindFilter === "asset" && kind !== "asset") return false;
      if (kindFilter === "inventory" && kind !== "inventory") return false;
      if (siteFilter !== "all" && a.site !== siteFilter) return false;
      if (catFilter !== "all" && a.category !== catFilter) return false;
      return true;
    });
  }
  function adjustStock(asset, delta, why) {
    const next = Math.max(0, (Number(asset.qty) || 0) + delta);
    asset.qty = next;
    asset.meter = next;
    log({ type: "event", eventType: "unscheduled", hours: next, text: asset.name + " " + why + " \u00b7 on hand " + next + " " + (asset.unit || "") });
    save();
  }
  function chips(list, cur, allLabel, key) {
    return `<button type="button" class="chip ${cur === "all" ? "on" : ""}" data-${key}="all">${allLabel}</button>` +
      list.map((s) => `<button type="button" class="chip ${cur === s.id ? "on" : ""}" data-${key}="${s.id}">${esc(s.label)}</button>`).join("");
  }
  function dueLine(t, asset) {
    const unit = (asset && asset.meterLabel) || "hr";
    const bits = [];
    if (t.dueHours != null) bits.push("due at " + t.dueHours + " " + unit);
    if (t.dueDate) bits.push("or by " + t.dueDate);
    if (t.intervalHours) bits.push("every " + t.intervalHours);
    return bits.join(" | ");
  }
  function renderHeader() {
    const a = current();
    const focus = focusItems();
    const chip = document.getElementById("hdr-chip");
    document.getElementById("hdr-kicker").textContent = ESTATE.client + " \u00b7 " + ESTATE.callsign;
    document.getElementById("hdr-name").textContent = (view === "record" && a) ? a.name : ESTATE.title;
    document.title = (view === "record" && a) ? a.name + " \u00b7 " + ESTATE.title : ESTATE.title;
    document.getElementById("hdr-hours").textContent = (view === "record" && a)
      ? siteLabel(a.site) + " \u00b7 " + catLabel(a.category) + " \u00b7 " + a.meter + " " + a.meterLabel
      : ESTATE.property;
    if (chip) {
      chip.textContent = focus.length ? "Needs a look" : "Settled";
      chip.classList.toggle("look", !!focus.length);
    }
    $nav.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view || (view === "complete" && b.dataset.view === "record") || (view === "history" && b.dataset.view === "more") || (view === "add" && b.dataset.view === "board") || (view === "tasks" && b.dataset.view === "record"));
    });
  }
  function render() {
    renderHeader();
    const map = { home, board, event: eventView, tasks, add, complete, more, history, record };
    (map[view] || home)();
  }
  function home() {
    const fleet = state.assets.filter((a) => !isInv(a));
    const n = fleet.length;
    const od = fleet.reduce((sum, a) => sum + overdueCount(a), 0);
    const inWindow = fleet.filter((a) => assetHealth(a) === "steady").length;
    const quiet = quietHours();
    const recent = state.history.filter((h) => hoursAgo(h.at) != null && hoursAgo(h.at) <= 72).slice(0, 8);
    const focus = focusItems();
    $app.innerHTML = `<div class="card"><h2>Today</h2><p class="hero-copy">${esc(synthesis())}</p></div>
      <div class="metrics">
        <div class="metric"><span>Service</span><strong>${n ? Math.round((inWindow / n) * 100) : 0}</strong><em>${od ? "One outside window" : "Within window"}</em></div>
        <div class="metric"><span>Sites</span><strong>${ESTATE.sites.length}</strong><em>All quiet</em></div>
        <div class="metric"><span>Fleet</span><strong>${n}</strong><em>${n ? "At rest" : "Ready"}</em></div>
        <div class="metric"><span>Quiet</span><strong>${quiet == null ? "\u2014" : quiet + "h"}</strong><em>Since last log</em></div>
      </div>
      <div class="card"><h2>Handled</h2>${recent.length ? `<ul class="ledger">${recent.map((h) => `<li><time>${esc(h.at.slice(0, 16).replace("T", " "))}</time>${esc(h.assetName || "")} \u00b7 ${esc(h.eventType || h.type)} \u00b7 ${esc(h.text)}</li>`).join("")}</ul>` : `<p class="muted">Nothing closed since your last visit. The estate was already still.</p>`}</div>
      <div class="card"><h2>For you</h2>${focus.length ? focus.map((f) => `<div class="decision ${f.kind}"><h3>${esc(f.asset.name)}</h3><p class="muted">${esc(f.blurb)}</p><div class="actions"><button class="primary" type="button" data-open="${f.asset.id}">Open record</button><button class="ghost" type="button" data-ack="${f.asset.id}">Acknowledge</button></div></div>`).join("") : `<p class="muted">Nothing needs you. The estate is executing.</p>`}</div>`;
    $app.querySelectorAll("[data-open]").forEach((b) => { b.onclick = () => { state.currentId = b.dataset.open; save(); view = "record"; render(); }; });
    $app.querySelectorAll("[data-ack]").forEach((b) => {
      b.onclick = () => {
        const a = state.assets.find((x) => x.id === b.dataset.ack);
        if (a) { a.nextStep = ""; a.nextStepBy = ""; log({ type: "event", eventType: "unscheduled", text: (a.name || "") + " acknowledged on the debrief" }); save(); }
        toast("Noted"); render();
      };
    });
  }
  function board() {
    const list = filteredAssets().filter(matchesSearch);
    const classList = kindFilter === "inventory" ? (ESTATE.stock || []) : ESTATE.categories;
    $app.innerHTML = `<input class="search" id="q" type="search" placeholder="Search name, site, stock, serial\u2026" value="${esc(searchQuery)}" />
      <div class="card"><h2>Kind</h2><div class="chips">${chips([{ id: "asset", label: "Equipment" }, { id: "inventory", label: "Inventory" }], kindFilter, "All", "kind")}</div>
      <h2 style="margin-top:12px">Site</h2><div class="chips">${chips(ESTATE.sites, siteFilter, "All", "site")}</div>
      <h2 style="margin-top:12px">${kindFilter === "inventory" ? "Stock" : "Class"}</h2><div class="chips">${chips(classList, catFilter, "All", "cat")}</div></div>
      <div class="card"><h2>Records</h2>${list.length ? list.map((a) => { const last = lastActivity(a); const h = assetHealth(a); const qtyLine = isInv(a) ? (a.qty + " " + (a.unit || "")) : (a.meter + " " + a.meterLabel); return `<div class="asset ${h} ${a.id === state.currentId ? "on" : ""}" data-id="${a.id}"><h3>${esc(a.name)}</h3><p class="meta">${isInv(a) ? "Inventory" : "Equipment"} \u00b7 ${esc(siteLabel(a.site))} \u00b7 ${esc(catLabel(a.category))} \u00b7 ${esc(qtyLine)} \u00b7 ${healthLabel(h)}${a.nextStep ? " \u00b7 Next: " + esc(a.nextStep) : ""}${last ? " \u00b7 " + esc(last.at.slice(0, 10)) : ""}</p></div>`; }).join("") : `<p class="muted">No records in this view.</p>`}<button class="secondary" type="button" id="go-add">Add record</button></div>`;
    const q = $app.querySelector("#q");
    q.oninput = () => { searchQuery = q.value; };
    q.onchange = () => { searchQuery = q.value; render(); };
    q.onkeydown = (e) => { if (e.key === "Enter") { searchQuery = q.value; render(); } };
    $app.querySelectorAll("[data-kind]").forEach((b) => { b.onclick = () => { kindFilter = b.dataset.kind; catFilter = "all"; render(); }; });
    $app.querySelectorAll("[data-site]").forEach((b) => { b.onclick = () => { siteFilter = b.dataset.site; render(); }; });
    $app.querySelectorAll("[data-cat]").forEach((b) => { b.onclick = () => { catFilter = b.dataset.cat; render(); }; });
    $app.querySelectorAll(".asset").forEach((el) => { el.onclick = () => { state.currentId = el.dataset.id; save(); view = "record"; render(); }; });
    $app.querySelector("#go-add").onclick = () => { view = "add"; render(); };
  }
  function record() {
    if (needAsset()) return;
    const asset = current();
    const h = assetHealth(asset);
    const last = lastActivity(asset);
    const rel = related(asset);
    const timeline = state.history.filter((x) => x.assetId === asset.id).slice(0, 12);
    const inv = isInv(asset);
    const onHand = inv ? (Number(asset.qty) || 0) : asset.meter;
    const unit = inv ? (asset.unit || "each") : asset.meterLabel;
    $app.innerHTML = `<div class="card"><h2>Record</h2><p class="hero-copy">${esc(asset.name)}</p><p class="muted">${inv ? "Inventory" : "Equipment"} \u00b7 ${esc(healthLabel(h))} \u00b7 ${esc(siteLabel(asset.site))} \u00b7 ${esc(catLabel(asset.category))}</p>
      <dl class="attrs"><div><dt>${inv ? "On hand" : "Meter"}</dt><dd>${onHand} ${esc(unit)}</dd></div><div><dt>${inv ? "Reorder at" : "Serial"}</dt><dd>${inv ? (asset.reorder || "\u2014") : esc(asset.serial || "\u2014")}</dd></div><div><dt>Steward</dt><dd>${esc(asset.owner || "\u2014")}</dd></div><div><dt>Last activity</dt><dd>${last ? esc(last.at.slice(0, 16).replace("T", " ")) : "\u2014"}</dd></div></dl>
      ${inv ? `<form id="f-stock" class="row2"><div><label>Receive</label><input name="in" type="number" min="0" step="0.1" value="0" /></div><div><label>Issue</label><input name="out" type="number" min="0" step="0.1" value="0" /></div><button class="secondary" type="submit">Update stock</button></form>` : ""}
      <form id="f-record">${inv ? `<label>On hand</label><input name="qty" type="number" min="0" step="0.1" value="${onHand}" /><label>Unit</label><input name="unit" value="${esc(unit)}" /><label>Reorder at</label><input name="reorder" type="number" min="0" step="0.1" value="${asset.reorder || 0}" />` : ""}<label>Next step</label><input name="nextStep" value="${esc(asset.nextStep || "")}" placeholder="What happens next" /><label>Due by</label><input name="nextStepBy" type="date" value="${esc(asset.nextStepBy || "")}" /><label>Steward</label><input name="owner" value="${esc(asset.owner || "")}" placeholder="Who looks after this" /><label>Standing notes</label><textarea name="notes">${esc(asset.notes || "")}</textarea><button class="secondary" type="submit">Save record</button></form>
      <div class="actions"><button class="primary" type="button" id="go-log">Log an event</button><button class="ghost" type="button" id="go-tasks">Open tasks</button></div></div>
      ${rel.length ? `<div class="card"><h2>Related at ${esc(siteLabel(asset.site))}</h2>${rel.map((a) => `<div class="asset ${assetHealth(a)}" data-id="${a.id}"><h3>${esc(a.name)}</h3><p class="meta">${esc(catLabel(a.category))} \u00b7 ${a.meter} ${esc(a.meterLabel)}</p></div>`).join("")}</div>` : ""}
      <div class="card"><h2>History</h2>${timeline.length ? `<ul class="ledger">${timeline.map((x) => `<li><time>${esc(x.at.slice(0, 16).replace("T", " "))}</time>${esc(x.eventType || x.type)} \u00b7 ${esc(x.text)}</li>`).join("")}</ul>` : `<p class="muted">No activity on this record yet.</p>`}</div>`;
    const stockForm = $app.querySelector("#f-stock");
    if (stockForm) {
      stockForm.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const inn = Number(fd.get("in") || 0);
        const out = Number(fd.get("out") || 0);
        if (inn) adjustStock(asset, inn, "received +" + inn);
        if (out) adjustStock(asset, -out, "issued -" + out);
        toast("Stock updated"); render();
      };
    }
    $app.querySelector("#f-record").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      asset.nextStep = String(fd.get("nextStep") || "").trim();
      asset.nextStepBy = fd.get("nextStepBy") || "";
      asset.owner = String(fd.get("owner") || "").trim();
      asset.notes = String(fd.get("notes") || "").trim();
      if (isInv(asset)) {
        asset.qty = Number(fd.get("qty") || 0);
        asset.unit = String(fd.get("unit") || "each");
        asset.reorder = Number(fd.get("reorder") || 0);
        asset.meter = asset.qty;
        asset.meterLabel = asset.unit;
      }
      save(); toast("Record saved"); render();
    };
    $app.querySelector("#go-log").onclick = () => { view = "event"; render(); };
    $app.querySelector("#go-tasks").onclick = () => { view = "tasks"; render(); };
    $app.querySelectorAll(".asset").forEach((el) => { el.onclick = () => { state.currentId = el.dataset.id; save(); render(); }; });
  }
  function needAsset() {
    if (current()) return false;
    $app.innerHTML = `<div class="card"><h2>No record selected</h2><p class="muted">Pick one on the board, or add a unit.</p><button class="primary" type="button" id="go-home">Board</button></div>`;
    $app.querySelector("#go-home").onclick = () => { view = "board"; render(); };
    return true;
  }
  function eventView() {
    if (needAsset()) return;
    const asset = current();
    const hoursNow = asset.meter;
    const today = todayISO();
    const open = openTasks(asset).sort((a, b) => (a.dueHours || 0) - (b.dueHours || 0));
    const daily = DAILY_BY_CATEGORY[isInv(asset) ? "inventory" : asset.category] || ["Walkaround", "Fluids", "Leaks"];
    $app.innerHTML = `<div class="card"><h2>Log an event</h2><p class="muted">${esc(asset.name)} | ${esc(siteLabel(asset.site))} | ${esc(catLabel(asset.category))}</p>
      <form id="f-event"><label>Event type</label><div class="event-types" id="type-list">${EVENT_TYPES.map((t) => `<label class="${eventType === t.id ? "picked" : ""}"><input type="radio" name="eventType" value="${t.id}" ${eventType === t.id ? "checked" : ""} required /><span>${esc(t.label)}<small>${esc(t.hint)}</small></span></label>`).join("")}</div>
      <label>Date</label><input name="date" type="date" required value="${today}" />
      <label>${esc(asset.meterLabel)}</label><input name="hours" type="number" min="${hoursNow}" step="0.1" required value="${hoursNow}" />
      <div id="extra"></div><label>Notes</label><textarea name="notes"></textarea><button class="primary" type="submit">Save event</button></form></div>`;
    const extra = $app.querySelector("#extra");
    function paintExtra() {
      if (eventType === "inspection") {
        extra.innerHTML = `<label>Inspection checks</label><div class="checklist">${daily.map((c, i) => `<label><input type="checkbox" name="check" value="${i}" /> ${esc(c)}</label>`).join("")}</div><label>Result</label><select name="result"><option value="pass">Pass</option><option value="watch">Watch</option><option value="fail">Fail</option></select>`;
      } else if (eventType === "repair") {
        extra.innerHTML = `<label>What failed</label><input name="failure" required /><label>What you did</label><input name="fix" /><label>Parts used</label><input name="parts" />`;
      } else if (eventType === "unscheduled") {
        extra.innerHTML = `<label>Why unscheduled</label><input name="reason" required /><label>Work done</label><input name="fix" /><label>Parts used</label><input name="parts" />`;
      } else if (eventType === "interval") {
        extra.innerHTML = `<label>Interval jobs this visit</label>${open.length ? `<div class="checklist">${open.map((t) => { const st = taskStatus(t, hoursNow, today); return `<label><input type="checkbox" name="task" value="${t.id}" ${st === "overdue" || st === "due" ? "checked" : ""} /> ${esc(t.title)}</label>`; }).join("")}</div>` : `<p class="muted">No open interval tasks.</p>`}<label>Parts used</label><input name="parts" />`;
      } else extra.innerHTML = `<p class="muted">Pick an event type above.</p>`;
    }
    paintExtra();
    $app.querySelectorAll("#type-list input").forEach((r) => { r.onchange = () => { eventType = r.value; $app.querySelectorAll("#type-list label").forEach((l) => l.classList.toggle("picked", l.querySelector("input").checked)); paintExtra(); }; });
    $app.querySelector("#f-event").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const type = fd.get("eventType");
      if (!type) { toast("Pick an event type"); return; }
      const nextHours = Number(fd.get("hours"));
      const err = updateMeter(asset, nextHours, true);
      if (err) { toast(err); return; }
      eventType = type;
      const notes = String(fd.get("notes") || "");
      const parts = String(fd.get("parts") || "");
      const date = fd.get("date") || todayISO();
      if (type === "interval") {
        fd.getAll("task").forEach((id) => completeTask(asset, id, { date, hours: nextHours, parts, notes, eventType: "interval" }));
        log({ type: "event", eventType: "interval", hours: nextHours, text: asset.name + " interval at " + nextHours });
      } else if (type === "inspection") {
        log({ type: "event", eventType: "inspection", hours: nextHours, text: asset.name + " inspection " + (fd.get("result") || "logged") + (notes ? " - " + notes : "") });
      } else if (type === "repair") {
        log({ type: "event", eventType: "repair", hours: nextHours, text: asset.name + " repair: " + (fd.get("failure") || "") });
      } else if (type === "unscheduled") {
        log({ type: "event", eventType: "unscheduled", hours: nextHours, text: asset.name + " unscheduled: " + (fd.get("reason") || "service") });
      }
      save(); toast("Event saved"); eventType = ""; view = "home"; render();
    };
  }
  function tasks() {
    if (needAsset()) return;
    const asset = current();
    const today = todayISO();
    const groups = [["overdue", "Overdue"], ["due", "Due soon"], ["upcoming", "Upcoming"]];
    const by = { overdue: [], due: [], upcoming: [] };
    openTasks(asset).forEach((t) => by[taskStatus(t, asset.meter, today)].push(t));
    Object.keys(by).forEach((k) => by[k].sort((a, b) => (a.dueHours || 0) - (b.dueHours || 0)));
    $app.innerHTML = groups.map(([key, label]) => { const list = by[key]; if (!list.length) return ""; return `<div class="card"><h2>${label}</h2>${list.map((t) => `<div class="task ${key}"><h3>${esc(t.title)}</h3><p class="meta"><span class="badge ${key}">${key}</span>${esc(dueLine(t, asset))}</p>${t.parts ? `<p class="meta">${esc(t.parts)}</p>` : ""}<button class="ghost" type="button" data-complete="${t.id}">Complete</button></div>`).join("")}</div>`; }).join("") || `<div class="card"><p class="muted">Nothing open on ${esc(asset.name)}.</p></div>`;
    $app.querySelectorAll("[data-complete]").forEach((b) => { b.onclick = () => { completeId = b.dataset.complete; view = "complete"; render(); }; });
  }
  function complete() {
    const asset = current();
    const task = asset && asset.tasks.find((t) => t.id === completeId);
    if (!task) { view = "tasks"; render(); return; }
    $app.innerHTML = `<div class="card"><h2>Complete: ${esc(task.title)}</h2><form id="f-complete"><label>Date</label><input name="date" type="date" required value="${todayISO()}" /><label>${esc(asset.meterLabel)}</label><input name="hours" type="number" min="0" step="0.1" required value="${asset.meter}" /><label>Parts</label><input name="parts" value="${esc(task.parts || "")}" /><label>Notes</label><textarea name="notes"></textarea><button class="primary" type="submit">Save and schedule next</button></form></div>`;
    $app.querySelector("#f-complete").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      completeTask(asset, task.id, { date: fd.get("date"), hours: Number(fd.get("hours")), parts: String(fd.get("parts") || ""), notes: String(fd.get("notes") || ""), eventType: "interval" });
      toast("Logged"); view = "tasks"; render();
    };
  }
  function add() {
    $app.innerHTML = `<div class="card"><h2>Add record</h2><p class="muted">${esc(ESTATE.client)} \u00b7 ${esc(ESTATE.property)}</p><form id="f-add">
      <label>Kind</label>
      <div class="event-types" id="kind-list">
        <label class="picked"><input type="radio" name="kind" value="asset" checked /> <span>Equipment<small>Mower, truck, gate, plane, tool</small></span></label>
        <label><input type="radio" name="kind" value="inventory" /> <span>Inventory<small>Filters, oil, fuel, grease, stock</small></span></label>
      </div>
      <div id="add-extra"></div>
      <label>Steward</label><input name="owner" placeholder="Who looks after this" />
      <label>Notes</label><textarea name="notes"></textarea>
      <button class="primary" type="submit">Add to estate</button></form></div>`;
    const extra = $app.querySelector("#add-extra");
    function paintKind() {
      const kind = ($app.querySelector("input[name=kind]:checked") || {}).value || "asset";
      if (kind === "inventory") {
        extra.innerHTML = `<label>Stock item</label><select name="stock">${(ESTATE.stock || []).map((s) => `<option value="${s.id}" data-unit="${esc(s.unit)}">${esc(s.label)}</option>`).join("")}</select>
          <label>Name</label><input name="name" placeholder="Leave blank to use the stock name" />
          <label>Stored at</label><select name="site">${ESTATE.sites.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join("")}</select>
          <div class="row2"><div><label>On hand</label><input name="qty" type="number" min="0" step="0.1" value="0" /></div><div><label>Unit</label><input name="unit" value="each" /></div></div>
          <label>Reorder at</label><input name="reorder" type="number" min="0" step="0.1" value="0" />`;
        const stock = extra.querySelector("[name=stock]");
        const unit = extra.querySelector("[name=unit]");
        const name = extra.querySelector("[name=name]");
        function syncStock() {
          const opt = stock.options[stock.selectedIndex];
          if (unit) unit.value = opt.getAttribute("data-unit") || "each";
          if (name && !name.value) name.placeholder = opt.text + " (or type a specific name)";
        }
        stock.onchange = syncStock;
        syncStock();
      } else {
        extra.innerHTML = `<label>Name</label><input name="name" required placeholder="Gator, gate 3, pump, mower" />
          <label>Site</label><select name="site">${ESTATE.sites.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join("")}</select>
          <label>Class</label><select name="category">${ESTATE.categories.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join("")}</select>
          <div class="row2"><div><label>Meter now</label><input name="meter" type="number" min="0" step="0.1" value="0" /></div><div><label>Serial / VIN / N-number</label><input name="serial" /></div></div>
          <label>In service</label><input name="inService" type="date" value="${todayISO()}" />
          <details><summary class="muted">Optional service chart</summary>
            <label>Chart</label><select name="scheduleKind"><option value="generic">Generic for that class</option><option value="z930m">John Deere Z930M</option></select>
            <label>Z930M engine</label><select name="variant"><option value="non-efi">Non-EFI</option><option value="efi">EFI</option></select>
          </details>`;
      }
    }
    paintKind();
    $app.querySelectorAll("#kind-list input").forEach((r) => {
      r.onchange = () => {
        $app.querySelectorAll("#kind-list label").forEach((l) => l.classList.toggle("picked", l.querySelector("input").checked));
        paintKind();
      };
    });
    $app.querySelector("#f-add").onsubmit = (e) => { e.preventDefault(); addAsset(new FormData(e.target)); toast("On the board"); view = "record"; render(); };
  }
  function more() {
    $app.innerHTML = `<div class="card"><h2>${esc(ESTATE.title)}</h2><p class="muted">${esc(ESTATE.client)} | ${esc(ESTATE.property)} | callsign ${esc(ESTATE.callsign)}</p><p class="muted" style="margin-top:8px">Sites: ${ESTATE.sites.map((s) => s.label).join(" | ")}</p><p class="muted">Classes: ${ESTATE.categories.map((s) => s.label).join(" | ")}</p><p class="muted">Stock: ${(ESTATE.stock || []).map((s) => s.label).join(" | ")}</p></div>
      <div class="card"><h2>Data</h2><button class="secondary" type="button" data-go="history">History</button><button class="ghost" type="button" id="export-json">Export JSON</button><button class="ghost" type="button" id="export-csv">Export CSV</button><label class="muted">Import JSON<input type="file" id="import-json" accept="application/json" /></label></div>
      <div class="card sources"><h2>Deere sources (Z930M)</h2>${DEERE_SCHEDULE.sources.map((s) => `<p><a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a></p>`).join("")}<p class="muted" style="margin-top:8px">Not affiliated with Deere & Company.</p></div>`;
    $app.querySelector("[data-go]").onclick = () => { view = "history"; render(); };
    $app.querySelector("#export-json").onclick = () => download("3hwa-estate.json", JSON.stringify(state, null, 2), "application/json");
    $app.querySelector("#export-csv").onclick = exportCsv;
    $app.querySelector("#import-json").onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const next = JSON.parse(reader.result);
          if (!Array.isArray(next.assets)) throw new Error("bad");
          state = next; if (!state.history) state.history = []; save(); toast("Imported"); view = "home"; render();
        } catch (err) { toast("Could not import"); }
      };
      reader.readAsText(file);
    };
  }
  function history() {
    $app.innerHTML = `<div class="card"><h2>History</h2><ul class="log">${state.history.length ? state.history.map((h) => `<li><strong>${esc(h.at.slice(0, 16).replace("T", " "))}</strong>${h.eventType ? ` <span class="badge">${esc(h.eventType)}</span>` : ""}<br/>${esc(h.text)}</li>`).join("") : "<li class='muted'>Nothing logged yet.</li>"}</ul></div>`;
  }
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  function exportCsv() {
    const rows = [["when", "asset", "eventType", "type", "text", "meter"]];
    state.history.forEach((h) => rows.push([h.at, h.assetName || "", h.eventType || "", h.type, '"' + String(h.text).replace(/"/g, '""') + '"', h.hours || ""]));
    download("3hwa-estate.csv", rows.map((r) => r.join(",")).join("\n"), "text/csv");
  }
  $nav.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-view]");
    if (!b) return;
    view = b.dataset.view;
    render();
  });
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  render();
})();
