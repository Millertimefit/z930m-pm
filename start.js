(() => {
  function goAdd(kind) {
    const boardBtn = document.querySelector('#nav [data-view="board"]');
    if (boardBtn) boardBtn.click();
    setTimeout(() => {
      const add = document.getElementById("go-add");
      if (add) add.click();
      setTimeout(() => {
        const radio = document.querySelector('input[name="kind"][value="' + kind + '"]');
        if (radio && !radio.checked) {
          radio.checked = true;
          radio.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, 0);
    }, 0);
  }

  function addButtons(card) {
    if (!card || card.querySelector("#go-add-eq")) return;
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.innerHTML =
      '<button class="primary" type="button" id="go-add-eq">Add equipment</button>' +
      '<button class="ghost" type="button" id="go-add-inv">Add inventory</button>';
    card.appendChild(actions);
    card.querySelector("#go-add-eq").onclick = () => goAdd("asset");
    card.querySelector("#go-add-inv").onclick = () => goAdd("inventory");
  }

  function inject() {
    const app = document.getElementById("app");
    if (!app) return;
    app.querySelectorAll(".card").forEach((card) => {
      const title = card.querySelector("h2");
      if (!title) return;
      if (title.textContent === "For you" || title.textContent === "No record selected") addButtons(card);
    });
  }

  const app = document.getElementById("app");
  if (app && window.MutationObserver) {
    new MutationObserver(inject).observe(app, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inject);
  else inject();
})();
