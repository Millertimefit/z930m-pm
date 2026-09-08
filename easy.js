(() => {
  function pickKind(kind) {
    const form = document.getElementById("f-add");
    if (!form) return;
    form.noValidate = true;
    form.querySelectorAll("[required]").forEach((el) => el.removeAttribute("required"));
    if (kind) {
      const radio = form.querySelector('input[name="kind"][value="' + kind + '"]');
      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    const name = form.querySelector("[name=name]");
    if (name && !String(name.value || "").trim()) name.placeholder = name.placeholder || "Name";
  }

  function openAdd(kind) {
    const go = document.getElementById("go-add");
    const tab = document.querySelector('#nav [data-view="add"]');
    if (go) go.click();
    else if (tab) tab.click();
    setTimeout(() => pickKind(kind || "asset"), 0);
    setTimeout(() => pickKind(kind || "asset"), 50);
  }

  function startCard() {
    if (document.getElementById("easy-start")) return null;
    const wrap = document.createElement("div");
    wrap.className = "card start-card";
    wrap.id = "easy-start";
    wrap.innerHTML =
      "<h2>Start here</h2>" +
      '<p class="hero-copy">Add a machine, or add stock. Then tap it to log work.</p>' +
      '<button class="primary block" type="button" id="go-add-eq">Add equipment</button>' +
      '<button class="secondary block" type="button" id="go-add-inv">Add stock</button>' +
      '<p class="muted" style="margin-top:14px">Equipment = mower, truck, gate, plane. Stock = filters, oil, gas, grease.</p>';
    return wrap;
  }

  function hint() {
    const hours = document.getElementById("hdr-hours");
    const app = document.getElementById("app");
    if (!hours || !app) return;
    if (app.querySelector("#f-add, #f-event, #go-log")) return;
    hours.textContent = app.querySelector(".asset") ? "Tap a thing. Or tap Add." : "Tap Add to start.";
  }

  function simplify() {
    const app = document.getElementById("app");
    if (!app) return;

    if (app.querySelector("#f-add")) {
      pickKind();
      return;
    }

    const today = [...app.querySelectorAll("h2")].find((h) => h.textContent === "Today");
    if (today) {
      const boardBtn = document.querySelector('#nav [data-view="board"]');
      if (boardBtn) boardBtn.click();
      return;
    }

    const records = [...app.querySelectorAll("h2")].find((h) => h.textContent === "Records");
    if (records && /No records/.test(records.parentElement.textContent || "") && !document.getElementById("easy-start")) {
      const filterCard = app.querySelector(".card");
      if (filterCard && filterCard.querySelector(".chips")) filterCard.style.display = "none";
      const card = startCard();
      if (card) app.insertBefore(card, app.firstChild);
      const addBtn = document.getElementById("go-add");
      if (addBtn) addBtn.textContent = "Add something";
    }

    const logBtn = [...app.querySelectorAll("button")].find((b) => b.textContent === "Log an event");
    if (logBtn && !logBtn.classList.contains("block")) {
      logBtn.textContent = "Log work";
      logBtn.classList.add("primary", "block");
      const hero = logBtn.closest(".card") && logBtn.closest(".card").querySelector(".hero-copy");
      if (hero) hero.insertAdjacentElement("afterend", logBtn);
    }

    hint();
  }

  document.addEventListener(
    "click",
    (e) => {
      if (e.target.closest("#go-add-eq")) {
        e.preventDefault();
        e.stopPropagation();
        openAdd("asset");
        return;
      }
      if (e.target.closest("#go-add-inv")) {
        e.preventDefault();
        e.stopPropagation();
        openAdd("inventory");
        return;
      }
      if (e.target.closest('#nav [data-view="add"]')) {
        setTimeout(() => pickKind("asset"), 0);
        return;
      }
      const save = e.target.closest("#f-add button[type=submit], #f-add button.primary");
      if (save) {
        const form = document.getElementById("f-add");
        if (!form) return;
        form.noValidate = true;
        form.querySelectorAll("[required]").forEach((el) => el.removeAttribute("required"));
        const name = form.querySelector("[name=name]");
        if (name && !String(name.value || "").trim()) name.value = "New item";
      }
    },
    true
  );

  const app = document.getElementById("app");
  if (app && window.MutationObserver) {
    new MutationObserver(simplify).observe(app, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", simplify);
  else simplify();
})();
