(() => {
  "use strict";

  const KEY = "z930m-pm-v1";
  const DUE_SOON = 10;
  const $app = document.getElementById("app");
  const $nav = document.getElementById("nav");

  let state = load();
  let view = state.machine ? "home" : "setup";
  let completeId = null;
  let eventType = "";

  const EVENT_TYPES = [
    { id: "inspection", label: "Inspection", hint: "Walkaround, daily checks, look-over" },
    { id: "repair", label: "Repair", hint: "Something failed — fix it" },
    { id: "unscheduled", label: "Unscheduled", hint: "Extra work, not on the Deere chart" },
    { id: "interval", label: "Interval", hint: "Scheduled PM from the factory hours" },
  ];

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(iso, days) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || { machine: null, tasks: [], history: [], daily: {} };
    } catch (e) {
      return { machine: null, tasks: [], history: [], daily: {} };
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function templatesFor(variant) {
    return DEERE_SCHEDULE.templates.filter((t) => !t.variants || t.variants.includes(variant));
  }

  function intervalOf(t, variant) {
    if (t.intervalHoursByVariant) return t.intervalHoursByVariant[variant];
    return t.intervalHours;
  }

  function firstDueHours(hours, interval, firstAt) {
    if (firstAt != null && hours <= firstAt) return firstAt;
    return (Math.floor(hours / interval) + 1) * interval;
  }

  function seedTasks(machine) {
    const hours = machine.hours;
    const start = machine.inService || todayISO();
    return templatesFor(machine.variant).map((t) => {
      const interval = intervalOf(t, machine.variant);
      const dueHours = firstDueHours(hours, interval, t.firstAtHours);
      const dueDate = t.yearly ? addDays(start, 365) : null;
      return makeTask(t, machine.variant, dueHours, dueDate);
    });
  }

  function makeTask(t, variant, dueHours, dueDate, extra) {
    return Object.assign(
      {
        id: uid(),
        templateId: t.id || null,
        title: t.title,
        intervalHours: intervalOf(t, variant) || t.intervalHours || null,
        yearly: !!t.yearly,
        repeating: true,
        custom: false,
        dueHours,
        dueDate,
        parts: (t.parts && t.parts[variant]) || t.parts || "",
        note: t.note || "",
        status: "open",
        firstAtHours: t.firstAtHours || null,
      },
      extra || {}
    );
  }

  function taskStatus(task, hours, today) {
    if (task.status !== "open") return "done";
    const hoursDue = task.dueHours != null && hours >= task.dueHours;
    const dateDue = task.dueDate && today >= task.dueDate;
    if (hoursDue || dateDue) return "overdue";
    if (task.dueHours != null && task.dueHours - hours <= DUE_SOON) return "due";
    return "upcoming";
  }

  function openTasks() {
    return state.tasks.filter((t) => t.status === "open");
  }

  function nextDue() {
    const hours = state.machine.hours;
    const ranked = openTasks()
      .map((t) => ({ t, s: taskStatus(t, hours, todayISO()), h: t.dueHours == null ? Infinity : t.dueHours }))
      .sort((a, b) => a.h - b.h);
    return ranked[0] ? ranked[0].t : null;
  }

  function overdueCount() {
    const hours = state.machine.hours;
    const today = todayISO();
    return openTasks().filter((t) => taskStatus(t, hours, today) === "overdue").length;
  }

  function log(entry) {
    state.history.unshift(Object.assign({ id: uid(), at: new Date().toISOString() }, entry));
  }

  function setMachineFromForm(fd) {
    const hours = Number(fd.get("hours"));
    const variant = fd.get("variant");
    const machine = {
      name: "JD Z930M",
      variant,
      serial: String(fd.get("serial") || "").trim(),
      deck: String(fd.get("deck") || "").trim(),
      inService: fd.get("inService") || todayISO(),
      hours,
    };
    state.machine = machine;
    state.tasks = seedTasks(machine);
    state.daily = {};
    log({ type: "setup", text: "Machine set up at " + hours + " hours (" + variant + ")" });
    save();
  }

  function updateHours(next, silent) {
    const cur = state.machine.hours;
    if (next < cur) return "Hours cannot go backwards. Hour meter only counts engine-running time.";
    if (next === cur) return null;
    state.machine.hours = next;
    if (!silent) log({ type: "hours", text: "Hour meter " + cur + " → " + next, hours: next });
    save();
    return null;
  }

  function completeTask(id, payload) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    const hours = payload.hours;
    task.status = "done";
    task.completedAt = todayISO();
    task.completedHours = hours;
    task.completeNote = payload.notes;
    task.completeParts = payload.parts;
    log({
      type: "complete",
      eventType: payload.eventType || "interval",
      text: task.title + " at " + hours + " hr",
      hours,
      taskId: task.id,
    });
    if (hours > state.machine.hours) state.machine.hours = hours;

    if (task.repeating && (task.intervalHours || task.intervalDays)) {
      const nextHours = task.intervalHours ? hours + task.intervalHours : null;
      let nextDate = null;
      if (task.yearly) nextDate = addDays(payload.date || todayISO(), 365);
      if (task.intervalDays) nextDate = addDays(payload.date || todayISO(), task.intervalDays);
      const clone = Object.assign({}, task, {
        id: uid(),
        status: "open",
        dueHours: nextHours,
        dueDate: nextDate,
        completedAt: null,
        completedHours: null,
        completeNote: "",
        completeParts: "",
      });
      state.tasks.push(clone);
    }
    save();
  }

  function addCustom(payload) {
    const intervalHours = payload.intervalHours ? Number(payload.intervalHours) : null;
    const intervalDays = payload.intervalDays ? Number(payload.intervalDays) : null;
    const repeating = !!(intervalHours || intervalDays || payload.yearly);
    const hours = state.machine.hours;
    const dueHours = intervalHours ? hours + intervalHours : payload.oneShotHours ? Number(payload.oneShotHours) : null;
    const dueDate = intervalDays
      ? addDays(todayISO(), intervalDays)
      : payload.yearly
        ? addDays(todayISO(), 365)
        : payload.oneShotDate || null;
    state.tasks.push({
      id: uid(),
      templateId: null,
      title: payload.title,
      intervalHours,
      intervalDays,
      yearly: !!payload.yearly,
      repeating,
      custom: true,
      dueHours,
      dueDate,
      parts: payload.parts || "",
      note: payload.note || "",
      status: "open",
    });
    log({ type: "add", text: "Added task: " + payload.title });
    save();
  }

  function rebuildSchedule() {
    if (!state.machine) return;
    const keepCustom = state.tasks.filter((t) => t.custom && t.status === "open");
    const done = state.tasks.filter((t) => t.status === "done");
    state.tasks = seedTasks(state.machine).concat(keepCustom, done);
    log({ type: "rebuild", text: "Deere schedule rebuilt from current hours" });
    save();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function renderHeader() {
    const m = state.machine;
    document.getElementById("hdr-name").textContent = m ? m.name + (m.variant === "efi" ? " EFI" : "") : "Z930M Service";
    document.getElementById("hdr-hours").textContent = m
      ? m.hours.toFixed(1) + " hours · " + overdueCount() + " overdue"
      : "Set up the machine to start";
    $nav.classList.toggle("hidden", !m);
    $nav.querySelectorAll("button").forEach((b) => {
      const logViews = view === "event" || view === "hours";
      b.classList.toggle(
        "active",
        b.dataset.view === view ||
          (logViews && b.dataset.view === "event") ||
          (view === "complete" && b.dataset.view === "tasks") ||
          (view === "history" && b.dataset.view === "more") ||
          (view === "machine" && b.dataset.view === "more") ||
          (view === "setup" && b.dataset.view === "more")
      );
    });
  }

  function render() {
    renderHeader();
    if (!state.machine && view !== "setup") view = "setup";
    const map = { setup, home, hours: eventView, event: eventView, tasks, add, complete, more, history, machine };
    (map[view] || home)();
  }

  function setup() {
    const m = state.machine || {};
    $app.innerHTML = `
      <div class="warn">Intervals come from John Deere Z930M / Z930M EFI parts guides on deere.com and the Z900 service chart. Confirm against the operator’s manual and the label inside the right-hand console.</div>
      <div class="card">
        <h2>Set up this mower</h2>
        <p class="muted">Enter the hour meter as it reads now. The Deere schedule will place the next oil, filters, grease, and the rest from that number.</p>
        <form id="f-setup">
          <label>Engine</label>
          <select name="variant">
            <option value="non-efi" ${m.variant === "efi" ? "" : "selected"}>Z930M (non-EFI) — filter AM107423</option>
            <option value="efi" ${m.variant === "efi" ? "selected" : ""}>Z930M EFI — filter AM125424</option>
          </select>
          <label>Hour meter right now</label>
          <input name="hours" type="number" min="0" step="0.1" required value="${esc(m.hours || 0)}" />
          <div class="row2">
            <div>
              <label>Serial / PIN</label>
              <input name="serial" value="${esc(m.serial || "")}" />
            </div>
            <div>
              <label>Deck (in)</label>
              <select name="deck">
                ${["", "54", "60", "72"].map((d) => `<option ${m.deck === d ? "selected" : ""}>${d}</option>`).join("")}
              </select>
            </div>
          </div>
          <label>In service date</label>
          <input name="inService" type="date" value="${esc(m.inService || todayISO())}" />
          <button class="primary" type="submit">Build Deere schedule</button>
        </form>
      </div>`;
    $app.querySelector("#f-setup").onsubmit = (e) => {
      e.preventDefault();
      setMachineFromForm(new FormData(e.target));
      view = "home";
      toast("Schedule built from Deere intervals");
      render();
    };
  }

  function home() {
    const m = state.machine;
    const n = nextDue();
    const over = overdueCount();
    const hours = m.hours;
    const today = todayISO();
    $app.innerHTML = `
      <div class="hero">
        <div class="stat"><span>Hour meter</span><strong>${hours.toFixed(1)}</strong></div>
        <div class="stat ${over ? "alert" : ""}"><span>Overdue</span><strong>${over}</strong></div>
      </div>
      <div class="card" style="margin-top:12px">
        <h2>What kind of event?</h2>
        <p class="muted">Start here every time you walk up to the machine.</p>
        <div class="event-grid">
          ${EVENT_TYPES.map(
            (t) =>
              `<button type="button" data-type="${t.id}">${esc(t.label)}<small>${esc(t.hint)}</small></button>`
          ).join("")}
        </div>
      </div>
      <div class="card">
        <h2>Next on the Deere chart</h2>
        ${
          n
            ? `<div class="task ${taskStatus(n, hours, today)}"><h3>${esc(n.title)}</h3>
               <p class="meta">${dueLine(n)}</p></div>`
            : `<p class="muted">No open interval tasks.</p>`
        }
      </div>`;
    $app.querySelectorAll(".event-grid button").forEach((b) => {
      b.onclick = () => {
        eventType = b.dataset.type;
        view = "event";
        render();
      };
    });
  }

  function eventView() {
    const hoursNow = state.machine.hours;
    const today = todayISO();
    const open = openTasks().sort((a, b) => (a.dueHours || 0) - (b.dueHours || 0));
    $app.innerHTML = `
      <div class="card">
        <h2>Log an event</h2>
        <form id="f-event">
          <label>Event type</label>
          <div class="event-types" id="type-list">
            ${EVENT_TYPES.map(
              (t) => `<label class="${eventType === t.id ? "picked" : ""}">
                <input type="radio" name="eventType" value="${t.id}" ${eventType === t.id ? "checked" : ""} required />
                <span>${esc(t.label)}<small>${esc(t.hint)}</small></span>
              </label>`
            ).join("")}
          </div>
          <label>Date</label>
          <input name="date" type="date" required value="${today}" />
          <label>Hour meter</label>
          <input name="hours" type="number" min="${hoursNow}" step="0.1" required value="${hoursNow}" />
          <div id="extra"></div>
          <label>Notes</label>
          <textarea name="notes" placeholder="What you saw, what you did"></textarea>
          <button class="primary" type="submit">Save event</button>
        </form>
      </div>`;

    const extra = $app.querySelector("#extra");
    function paintExtra() {
      if (eventType === "inspection") {
        extra.innerHTML = `
          <label>Inspection checks</label>
          <div class="checklist">
            ${DEERE_SCHEDULE.daily
              .map((c) => `<label><input type="checkbox" name="check" value="${c.id}" /> ${esc(c.label)}</label>`)
              .join("")}
            <label><input type="checkbox" name="check" value="blades" /> Blades / cut quality</label>
            <label><input type="checkbox" name="check" value="tires" /> Tire pressure / damage</label>
            <label><input type="checkbox" name="check" value="belts" /> Belts / debris</label>
          </div>
          <label>Result</label>
          <select name="result">
            <option value="pass">Pass — no follow-up</option>
            <option value="watch">Watch — note it</option>
            <option value="fail">Fail — needs repair</option>
          </select>`;
      } else if (eventType === "repair") {
        extra.innerHTML = `
          <label>What failed</label>
          <input name="failure" required placeholder="Belt, spindle, leak…" />
          <label>What you did</label>
          <input name="fix" placeholder="Replaced, adjusted, ordered parts…" />
          <label>Parts used</label>
          <input name="parts" />`;
      } else if (eventType === "unscheduled") {
        extra.innerHTML = `
          <label>Why unscheduled</label>
          <input name="reason" required placeholder="Found during mow, operator report…" />
          <label>Work done</label>
          <input name="fix" />
          <label>Parts used</label>
          <input name="parts" />
          <label><input type="checkbox" name="followUp" /> Add a follow-up task</label>`;
      } else if (eventType === "interval") {
        extra.innerHTML = `
          <label>Deere interval jobs done this visit</label>
          ${
            open.length
              ? `<div class="checklist">${open
                  .map((t) => {
                    const st = taskStatus(t, hoursNow, today);
                    return `<label><input type="checkbox" name="task" value="${t.id}" ${st === "overdue" || st === "due" ? "checked" : ""} /> ${esc(t.title)} <span class="muted">(${esc(dueLine(t))})</span></label>`;
                  })
                  .join("")}</div>`
              : `<p class="muted">No open interval tasks. Hours still save.</p>`
          }
          <label>Parts used</label>
          <input name="parts" />`;
      } else {
        extra.innerHTML = `<p class="muted">Pick an event type above.</p>`;
      }
    }
    paintExtra();

    $app.querySelectorAll("#type-list input").forEach((r) => {
      r.onchange = () => {
        eventType = r.value;
        $app.querySelectorAll("#type-list label").forEach((l) => l.classList.toggle("picked", l.querySelector("input").checked));
        paintExtra();
      };
    });

    $app.querySelector("#f-event").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const type = fd.get("eventType");
      if (!type) {
        toast("Pick an event type");
        return;
      }
      const nextHours = Number(fd.get("hours"));
      const err = updateHours(nextHours, true);
      if (err) {
        toast(err);
        return;
      }
      eventType = type;
      const notes = String(fd.get("notes") || "");
      const parts = String(fd.get("parts") || "");
      const date = fd.get("date") || todayISO();

      if (type === "interval") {
        const ids = fd.getAll("task");
        ids.forEach((id) =>
          completeTask(id, { date, hours: nextHours, parts, notes, eventType: "interval" })
        );
        log({
          type: "event",
          eventType: "interval",
          hours: nextHours,
          text: "Interval service at " + nextHours + " hr" + (ids.length ? " · " + ids.length + " job(s)" : ""),
        });
      } else if (type === "inspection") {
        const checks = fd.getAll("check");
        state.daily = { date: todayISO() };
        checks.forEach((id) => {
          state.daily[id] = true;
        });
        log({
          type: "event",
          eventType: "inspection",
          hours: nextHours,
          text: "Inspection · " + (fd.get("result") || "logged") + (notes ? " — " + notes : ""),
        });
        if (fd.get("result") === "fail") {
          addCustom({
            title: "Repair from inspection",
            oneShotHours: nextHours,
            parts: notes,
          });
        }
      } else if (type === "repair") {
        const failure = String(fd.get("failure") || "Repair");
        log({
          type: "event",
          eventType: "repair",
          hours: nextHours,
          text: "Repair: " + failure + (fd.get("fix") ? " → " + fd.get("fix") : "") + (parts ? " · " + parts : ""),
        });
      } else if (type === "unscheduled") {
        log({
          type: "event",
          eventType: "unscheduled",
          hours: nextHours,
          text: "Unscheduled: " + (fd.get("reason") || "service") + (fd.get("fix") ? " — " + fd.get("fix") : ""),
        });
        if (fd.get("followUp") === "on") {
          addCustom({
            title: String(fd.get("reason") || "Follow-up"),
            oneShotHours: nextHours,
            parts,
          });
        }
      }
      save();
      toast("Event saved");
      eventType = "";
      view = "home";
      render();
    };
  }

  function dueLine(t) {
    const bits = [];
    if (t.dueHours != null) bits.push("due at " + t.dueHours + " hr");
    if (t.dueDate) bits.push("or by " + t.dueDate);
    if (t.intervalHours) bits.push("every " + t.intervalHours + " hr");
    if (t.custom) bits.push("custom");
    return bits.join(" · ");
  }

  function tasks() {
    const hoursNow = state.machine.hours;
    const today = todayISO();
    const groups = [
      ["overdue", "Overdue"],
      ["due", "Due within " + DUE_SOON + " hours"],
      ["upcoming", "Upcoming"],
    ];
    const by = { overdue: [], due: [], upcoming: [] };
    openTasks().forEach((t) => by[taskStatus(t, hoursNow, today)].push(t));
    Object.keys(by).forEach((k) => by[k].sort((a, b) => (a.dueHours || 0) - (b.dueHours || 0)));

    $app.innerHTML = groups
      .map(([key, label]) => {
        const list = by[key];
        if (!list.length) return "";
        return `<div class="card"><h2>${label}</h2>${list
          .map(
            (t) => `<div class="task ${key}">
              <h3>${esc(t.title)}</h3>
              <p class="meta"><span class="badge ${key}">${key}</span>${esc(dueLine(t))}</p>
              ${t.parts ? `<p class="meta">${esc(t.parts)}</p>` : ""}
              <button class="ghost" type="button" data-complete="${t.id}">Complete</button>
            </div>`
          )
          .join("")}</div>`;
      })
      .join("") || `<div class="card"><p class="muted">Nothing open. Add a task if something comes up.</p></div>`;

    $app.querySelectorAll("[data-complete]").forEach((b) => {
      b.onclick = () => {
        completeId = b.dataset.complete;
        view = "complete";
        render();
      };
    });
  }

  function complete() {
    const task = state.tasks.find((t) => t.id === completeId);
    if (!task) {
      view = "tasks";
      render();
      return;
    }
    $app.innerHTML = `
      <div class="card">
        <h2>Complete: ${esc(task.title)}</h2>
        <p class="muted">${esc(task.note || dueLine(task))}</p>
        ${task.parts ? `<p class="muted">Parts: ${esc(task.parts)}</p>` : ""}
        <form id="f-complete">
          <label>Date</label>
          <input name="date" type="date" required value="${todayISO()}" />
          <label>Hour meter at completion</label>
          <input name="hours" type="number" min="0" step="0.1" required value="${state.machine.hours}" />
          <label>Parts used</label>
          <input name="parts" value="${esc(task.parts || "")}" />
          <label>Notes</label>
          <textarea name="notes" placeholder="Oil brand, blade set, leak, etc."></textarea>
          <button class="primary" type="submit">Save &amp; schedule next</button>
          <button class="ghost" type="button" id="cancel">Cancel</button>
        </form>
      </div>`;
    $app.querySelector("#cancel").onclick = () => {
      view = "tasks";
      render();
    };
    $app.querySelector("#f-complete").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      completeTask(task.id, {
        date: fd.get("date"),
        hours: Number(fd.get("hours")),
        parts: String(fd.get("parts") || ""),
        notes: String(fd.get("notes") || ""),
        eventType: "interval",
      });
      toast("Logged · next interval set");
      view = "tasks";
      render();
    };
  }

  function add() {
    $app.innerHTML = `
      <div class="card">
        <h2>Add a task</h2>
        <p class="muted">For work that is not on the Deere chart — blades, a leak, a spindle, whatever comes up. Leave repeat blank for a one-shot.</p>
        <form id="f-add">
          <label>Title</label>
          <input name="title" required placeholder="Sharpen blades" />
          <div class="row2">
            <div>
              <label>Repeat every (hours)</label>
              <input name="intervalHours" type="number" min="1" step="1" placeholder="e.g. 50" />
            </div>
            <div>
              <label>Repeat every (days)</label>
              <input name="intervalDays" type="number" min="1" step="1" placeholder="e.g. 30" />
            </div>
          </div>
          <label>Or due at hour meter</label>
          <input name="oneShotHours" type="number" min="0" step="0.1" placeholder="optional" />
          <label>Parts / notes</label>
          <input name="parts" />
          <label><input type="checkbox" name="yearly" style="width:auto"/> Also yearly</label>
          <button class="primary" type="submit">Add to schedule</button>
        </form>
      </div>`;
    $app.querySelector("#f-add").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      addCustom({
        title: String(fd.get("title")).trim(),
        intervalHours: fd.get("intervalHours"),
        intervalDays: fd.get("intervalDays"),
        oneShotHours: fd.get("oneShotHours"),
        parts: String(fd.get("parts") || ""),
        yearly: fd.get("yearly") === "on",
      });
      toast("Task added");
      view = "tasks";
      render();
    };
  }

  function more() {
    $app.innerHTML = `
      <div class="card">
        <h2>Machine &amp; data</h2>
        <button class="secondary" type="button" data-go="machine">Machine settings</button>
        <button class="secondary" type="button" data-go="history">History</button>
        <button class="ghost" type="button" id="export-json">Export JSON</button>
        <button class="ghost" type="button" id="export-csv">Export log CSV</button>
        <label class="muted">Import JSON backup<input type="file" id="import-json" accept="application/json" /></label>
        <button class="ghost" type="button" id="rebuild">Rebuild Deere tasks from current hours</button>
      </div>
      <div class="card sources">
        <h2>Deere sources</h2>
        ${DEERE_SCHEDULE.sources.map((s) => `<p><a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a></p>`).join("")}
        <p class="muted" style="margin-top:8px">Not affiliated with Deere &amp; Company. For NFC: encode an on-metal NTAG215 with this page’s URL after you host or install the app.</p>
      </div>`;
    $app.querySelectorAll("[data-go]").forEach((b) => {
      b.onclick = () => {
        view = b.dataset.go;
        render();
      };
    });
    $app.querySelector("#export-json").onclick = () => download("z930m-log.json", JSON.stringify(state, null, 2), "application/json");
    $app.querySelector("#export-csv").onclick = exportCsv;
    $app.querySelector("#import-json").onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const next = JSON.parse(reader.result);
          if (!next.machine || !Array.isArray(next.tasks)) throw new Error("bad file");
          state = next;
          if (!state.history) state.history = [];
          if (!state.daily) state.daily = {};
          save();
          toast("Imported");
          view = "home";
          render();
        } catch (err) {
          toast("Could not import that file");
        }
      };
      reader.readAsText(file);
    };
    $app.querySelector("#rebuild").onclick = () => {
      if (confirm("Open Deere tasks will be reset from current hours. Custom open tasks stay. Continue?")) {
        rebuildSchedule();
        toast("Schedule rebuilt");
        view = "tasks";
        render();
      }
    };
  }

  function history() {
    $app.innerHTML = `<div class="card"><h2>History</h2>
      <ul class="log">${
        state.history.length
          ? state.history
              .map((h) => `<li><strong>${esc(h.at.slice(0, 16).replace("T", " "))}</strong>${h.eventType ? ` <span class="badge">${esc(h.eventType)}</span>` : ""}<br/>${esc(h.text)}</li>`)
              .join("")
          : "<li class='muted'>Nothing logged yet.</li>"
      }</ul></div>`;
  }

  function machine() {
    const m = state.machine;
    $app.innerHTML = `
      <div class="card">
        <h2>Machine</h2>
        <form id="f-machine">
          <label>Engine</label>
          <select name="variant">
            <option value="non-efi" ${m.variant !== "efi" ? "selected" : ""}>Z930M non-EFI</option>
            <option value="efi" ${m.variant === "efi" ? "selected" : ""}>Z930M EFI</option>
          </select>
          <label>Serial / PIN</label>
          <input name="serial" value="${esc(m.serial)}" />
          <label>Deck</label>
          <input name="deck" value="${esc(m.deck)}" />
          <label>In service</label>
          <input name="inService" type="date" value="${esc(m.inService)}" />
          <p class="muted">Changing EFI vs non-EFI does not wipe hours. Rebuild the Deere task list from More if filters should change.</p>
          <button class="primary" type="submit">Save</button>
        </form>
      </div>`;
    $app.querySelector("#f-machine").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.machine.variant = fd.get("variant");
      state.machine.serial = String(fd.get("serial") || "");
      state.machine.deck = String(fd.get("deck") || "");
      state.machine.inService = fd.get("inService");
      save();
      toast("Saved");
      view = "home";
      render();
    };
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCsv() {
    const rows = [["when", "eventType", "type", "text", "hours"]];
    state.history.forEach((h) =>
      rows.push([h.at, h.eventType || "", h.type, '"' + String(h.text).replace(/"/g, '""') + '"', h.hours || ""])
    );
    download("z930m-log.csv", rows.map((r) => r.join(",")).join("\n"), "text/csv");
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
