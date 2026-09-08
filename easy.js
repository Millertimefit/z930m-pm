(() => {
  function tapAdd(kind) {
    const addTab = document.querySelector('#nav [data-view="add"]');
    if (addTab) addTab.click();
    setTimeout(() => {
      const radio = document.querySelector('input[name="kind"][value="' + kind + '"]');
      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }, 0);
  }

  function startCard() {
    const wrap = document.createElement("div");
    wrap.className = "card start-card";
    wrap.id = "easy-start";
    wrap.innerHTML =
      "<h2>Start here</h2>" +
      '<p class="hero-copy">Add a machine, or add stock. Then tap it to log work.</p>' +
      '<button class="primary block" type="button" id="go-add-eq">Add equipment</button>' +
      '<button class="secondary block" type="button" id="go-add-inv">Add stock</button>' +
      '<p class="muted" style="margin-top:14px">Equipment = mower, truck, gate, plane. Stock = filters, oil, gas, grease.</p>';
    wrap.querySelector("#go-add-eq").onclick = () => tapAdd("asset");
    wrap.querySelector("#go-add-inv").onclick = () => tapAdd("inventory");
    return wrap;
  }

  function hint() {
    const hours = document.getElementById("hdr-hours");
    if (!hours) return;
    const app = document.getElementById("app");
    if (!app) return;
    if (app.querySelector("#go-log, #f-event, #f-add")) return;
    hours.textContent = app.querySelector(".asset") ? "Tap a thing. Or tap Add." : "Tap Add to start.";
  }

  function simplify() {
    const app = document.getElementById("app");
    if (!app || app.querySelector(".start-card")) return;

    const records = [...app.querySelectorAll("h2")].find((h) => h.textContent === "Records");
    if (records && /No records/.test(records.parentElement.textContent || "")) {
      const filterCard = app.querySelector(".card");
      if (filterCard && filterCard.querySelector(".chips")) filterCard.style.display = "none";
      app.insertBefore(startCard(), app.firstChild);
      const addBtn = document.getElementById("go-add");
      if (addBtn) addBtn.textContent = "Add something";
    }

    const logBtn = [...app.querySelectorAll("button")].find((b) => b.textContent === "Log an event");
    if (logBtn && !logBtn.classList.contains("block")) {
      logBtn.textContent = "Log work";
      logBtn.classList.add("primary", "block");
      const card = logBtn.closest(".card");
      if (card && card.querySelector(".hero-copy")) {
        const hero = card.querySelector(".hero-copy");
        hero.insertAdjacentElement("afterend", logBtn);
      }
    }

    hint();
  }

  const app = document.getElementById("app");
  if (app && window.MutationObserver) {
    new MutationObserver(simplify).observe(app, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", simplify);
  else simplify();
})();
