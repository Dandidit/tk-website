// Adds a Show/Hide button to every password field wrapped in .pw-wrap.
document.querySelectorAll(".pw-wrap").forEach((wrap) => {
  const input = wrap.querySelector("input");
  const btn = wrap.querySelector(".pw-toggle");
  if (!input || !btn) return;
  btn.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
    btn.setAttribute("aria-pressed", String(show));
    input.focus();
  });
});
