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
      if (raw && Array.isArray(raw.assets)) return raw;
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
  function catLabel(id) { const s = ESTATE.categories.find((x) => x.id === id); return s ? s.label : id; }
  function catMeter(id) { const s = ESTATE.categories.find((x) => x.id === id); return s ? s.meter : "hours"; }
  function current() { return state.assets.find((a) => a.id === state.currentId) || null; }
  function log(entry) {
    const a = current();
    state.history.unshift(Object.assign({ id: uid(), at: new Date().toISOString(), assetId: a && a.id, assetName: a && a.name }, entry));
  }
  function templatesForAsset(asset) {
    if (asset.scheduleKind === "z930m") {
      return DEERE_SCHEDULE.templates.filter((t) => !t.variants || t.variants.includes(asset.variant || "non-efi"));
    }
    return (GENERIC_SCHEDULES[asset.category] || []).map((t) => Object.assign({ parts: {}, note: "" }, t));
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
    const category = fd.get("category");
    const asset = {
      id: uid(), name: String(fd.get("name") || "").trim(), site: fd.get("site"), category,
      meter: Number(fd.get("meter") || 0), meterLabel: catMeter(category),
      serial: String(fd.get("serial") || "").trim(), inService: fd.get("inService") || todayISO(),
      scheduleKind: fd.get("scheduleKind") || "generic", variant: fd.get("variant") || "non-efi", tasks: []
    };
    asset.tasks = seedTasks(asset);
    state.assets.push(asset);
    state.currentId = asset.id;
    log({ type: "setup", text: "Added " + asset.name + " at " + siteLabel(asset.site) });
    save();
  }
  function filteredAssets() {
    return state.assets.filter((a) => {
      if (siteFilter !== "all" && a.site !== siteFilter) return false;
      if (catFilter !== "all" && a.category !== catFilter) return false;
      return true;
    });
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
    document.getElementById("hdr-kicker").textContent = ESTATE.client;
    document.getElementById("hdr-name").textContent = a ? a.name : ESTATE.title;
    document.title = a ? a.name + " \u00b7 " + ESTATE.title : ESTATE.title;
    document.getElementById("hdr-hours").textContent = a
      ? siteLabel(a.site) + " | " + catLabel(a.category) + " | " + a.meter + " " + a.meterLabel + " | " + overdueCount(a) + " overdue"
      : ESTATE.property + " | " + state.assets.length + " assets | " + estateOverdue() + " overdue";
    $nav.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view || (view === "complete" && b.dataset.view === "tasks") || (view === "history" && b.dataset.view === "more"));
    });
  }
  function render() {
    renderHeader();
    const map = { home, event: eventView, tasks, add, complete, more, history };
    (map[view] || home)();
  }
  function home() {
    const list = filteredAssets();
    $app.innerHTML = `<div class="hero"><div class="stat"><span>Assets</span><strong>${state.assets.length}</strong></div><div class="stat ${estateOverdue() ? "alert" : ""}"><span>Overdue</span><strong>${estateOverdue()}</strong></div></div>
      <div class="card" style="margin-top:12px"><h2>Site</h2><div class="chips">${chips(ESTATE.sites, siteFilter, "All", "site")}</div>
      <h2 style="margin-top:12px">Class</h2><div class="chips">${chips(ESTATE.categories, catFilter, "All", "cat")}</div></div>
      <div class="card"><h2>Assets</h2>${list.length ? list.map((a) => `<div class="asset ${a.id === state.currentId ? "on" : ""}" data-id="${a.id}"><h3>${esc(a.name)}</h3><p class="meta">${esc(siteLabel(a.site))} | ${esc(catLabel(a.category))} | ${a.meter} ${esc(a.meterLabel)}${overdueCount(a) ? " | " + overdueCount(a) + " overdue" : ""}</p></div>`).join("") : `<p class="muted">No assets in this filter. Use Asset to add one.</p>`}</div>
      ${current() ? `<div class="card"><h2>What kind of event?</h2><p class="muted">${esc(current().name)}</p><div class="event-grid">${EVENT_TYPES.map((t) => `<button type="button" data-type="${t.id}">${esc(t.label)}<small>${esc(t.hint)}</small></button>`).join("")}</div></div>` : `<div class="warn">Select an asset, or add one.</div>`}`;
    $app.querySelectorAll("[data-site]").forEach((b) => { b.onclick = () => { siteFilter = b.dataset.site; render(); }; });
    $app.querySelectorAll("[data-cat]").forEach((b) => { b.onclick = () => { catFilter = b.dataset.cat; render(); }; });
    $app.querySelectorAll(".asset").forEach((el) => { el.onclick = () => { state.currentId = el.dataset.id; save(); render(); }; });
    $app.querySelectorAll(".event-grid button").forEach((b) => { b.onclick = () => { eventType = b.dataset.type; view = "event"; render(); }; });
  }
  function needAsset() {
    if (current()) return false;
    $app.innerHTML = `<div class="card"><h2>No asset selected</h2><p class="muted">Pick one on Estate, or add a unit.</p><button class="primary" type="button" id="go-home">Estate</button></div>`;
    $app.querySelector("#go-home").onclick = () => { view = "home"; render(); };
    return true;
  }
  function eventView() {
    if (needAsset()) return;
    const asset = current();
    const hoursNow = asset.meter;
    const today = todayISO();
    const open = openTasks(asset).sort((a, b) => (a.dueHours || 0) - (b.dueHours || 0));
    const daily = DAILY_BY_CATEGORY[asset.category] || ["Walkaround", "Fluids", "Leaks"];
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
    $app.innerHTML = `<div class="card"><h2>Add asset</h2><p class="muted">${esc(ESTATE.client)} | ${esc(ESTATE.property)}</p><form id="f-add">
      <label>Name</label><input name="name" required placeholder="JD Z930M, Gator, gate 3, Baron" />
      <label>Site</label><select name="site">${ESTATE.sites.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join("")}</select>
      <label>Class</label><select name="category">${ESTATE.categories.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join("")}</select>
      <label>Schedule</label><select name="scheduleKind"><option value="generic">Generic for that class</option><option value="z930m">John Deere Z930M chart</option></select>
      <label>Z930M engine (if Deere chart)</label><select name="variant"><option value="non-efi">Z930M non-EFI</option><option value="efi">Z930M EFI</option></select>
      <div class="row2"><div><label>Meter now</label><input name="meter" type="number" min="0" step="0.1" value="0" /></div><div><label>Serial / N-number / VIN</label><input name="serial" /></div></div>
      <label>In service</label><input name="inService" type="date" value="${todayISO()}" /><button class="primary" type="submit">Add to estate</button></form></div>`;
    $app.querySelector("#f-add").onsubmit = (e) => { e.preventDefault(); addAsset(new FormData(e.target)); toast("Asset on the board"); view = "home"; render(); };
  }
  function more() {
    $app.innerHTML = `<div class="card"><h2>${esc(ESTATE.title)}</h2><p class="muted">${esc(ESTATE.client)} | ${esc(ESTATE.property)} | callsign ${esc(ESTATE.callsign)}</p><p class="muted" style="margin-top:8px">Sites: ${ESTATE.sites.map((s) => s.label).join(" | ")}</p><p class="muted">Classes: ${ESTATE.categories.map((s) => s.label).join(" | ")}</p></div>
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
