document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".category-tab");
  const items = document.querySelectorAll(".faq-item");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const category = tab.dataset.category;

      tabs.forEach(item => item.classList.remove("active"));
      tab.classList.add("active");

      items.forEach(item => {
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