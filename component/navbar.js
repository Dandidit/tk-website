(() => {
  const toggle = document.querySelector(".site-menu-toggle");
  const menu = document.querySelector(".site-nav-links");
  const dropdowns = document.querySelectorAll(".nav-dropdown");

  if (!toggle || !menu) return;

  const closeDropdowns = (except = null) => {
    dropdowns.forEach(dropdown => {
      if (dropdown === except) return;

      dropdown.classList.remove("open");

      dropdown
        .querySelector(".nav-dropdown-toggle")
        ?.setAttribute("aria-expanded", "false");
    });
  };

  const closeMobileMenu = () => {
    menu.classList.remove("active");
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = "☰";

    closeDropdowns();
  };

  toggle.setAttribute("aria-expanded", "false");

  toggle.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("active");

    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.textContent = isOpen ? "×" : "☰";

    if (!isOpen) {
      closeDropdowns();
    }
  });

  dropdowns.forEach(dropdown => {
    const dropdownToggle = dropdown.querySelector(
      ".nav-dropdown-toggle"
    );

    dropdownToggle?.addEventListener("click", event => {
      event.stopPropagation();

      const willOpen = !dropdown.classList.contains("open");

      closeDropdowns(dropdown);

      dropdown.classList.toggle("open", willOpen);
      dropdownToggle.setAttribute(
        "aria-expanded",
        String(willOpen)
      );
    });
  });

  menu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMobileMenu);
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".nav-dropdown")) {
      closeDropdowns();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    closeDropdowns();

    if (menu.classList.contains("active")) {
      closeMobileMenu();
      toggle.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (
      window.innerWidth > 768 &&
      menu.classList.contains("active")
    ) {
      closeMobileMenu();
    }
  });
})();