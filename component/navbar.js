document.addEventListener("DOMContentLoaded", () => {

    const toggle = document.querySelector(".site-menu-toggle");
    const menu = document.querySelector(".site-nav-links");

    toggle.addEventListener("click", () => {
        menu.classList.toggle("active");
    });

});