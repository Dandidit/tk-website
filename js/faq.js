document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".faq-category");
  const items = document.querySelectorAll(".faq-item");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const category = tab.dataset.category;

      tabs.forEach(item => {
        const isActive = item === tab;

        item.classList.toggle("active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });

      items.forEach(item => {
        item.open = false;
        item.hidden = item.dataset.category !== category;
      });
    });
  });

  document.querySelectorAll(".faq-question").forEach(button => {
    button.addEventListener("click", () => {
      const answer = button.nextElementSibling;
      const icon = button.querySelector(".faq-icon");
      const isOpen = button.getAttribute("aria-expanded") === "true";

      button.setAttribute("aria-expanded", String(!isOpen));
      answer.hidden = isOpen;
      icon.textContent = isOpen ? "+" : "×";
    });
  });
});
