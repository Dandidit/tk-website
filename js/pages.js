// document.querySelectorAll(".faq-item").forEach(item => {
//     const summary = item.querySelector("summary");
//     const answer = item.querySelector(".faq-answer");

//     summary.addEventListener("click", event => {
//         event.preventDefault();

//         if (item.open) {
//         answer.style.gridTemplateRows = "0fr";
//         answer.style.opacity = "0";

//         setTimeout(() => {
//             item.open = false;
//         }, 300);
//         } else {
//         item.open = true;

//         requestAnimationFrame(() => {
//             answer.style.gridTemplateRows = "1fr";
//             answer.style.opacity = "1";
//         });
//         }
//     });
// });

document.querySelectorAll(".faq-item").forEach(item => {
    const summary = item.querySelector("summary");
    const answer = item.querySelector(".faq-answer");

    summary.addEventListener("click", event => {
      event.preventDefault();

      if (item.open) {
        answer.style.height = `${answer.scrollHeight}px`;

        requestAnimationFrame(() => {
          answer.style.height = "0px";
          answer.style.opacity = "0";
        });

        answer.addEventListener("transitionend", function closeItem(event) {
          if (event.propertyName !== "height") return;

          item.open = false;
          answer.removeEventListener("transitionend", closeItem);
        });
      } else {
        item.open = true;
        answer.style.height = "0px";
        answer.style.opacity = "0";

        requestAnimationFrame(() => {
          answer.style.height = `${answer.scrollHeight}px`;
          answer.style.opacity = "1";
        });

        answer.addEventListener("transitionend", function openItem(event) {
          if (event.propertyName !== "height") return;

          answer.style.height = "auto";
          answer.removeEventListener("transitionend", openItem);
        });
      }
    });
  });

// Javascript for navbar
fetch("component/navbar.html")
  .then(response => {
    if (!response.ok) throw new Error("Navbar could not be loaded.");
    return response.text();
  })
  .then(html => {
    document.getElementById("navbar").innerHTML = html;
    const script = document.createElement("script");
    script.src = "component/navbar.js";
    document.body.appendChild(script);
  })
  .catch(error => console.error(error));

// Javascript for consultation form
fetch("component/consultation-form.html")
  .then(response => {
    if (!response.ok) {
      throw new Error("Unable to load consultation form.");
    }

    return response.text();
  })
  .then(html => {
    document.getElementById("consultation-form").innerHTML = html;
  })
  .catch(error => {
    console.error(error);
  });

// Javascript for footer
fetch("component/footer.html")
  .then(response => {
    if (!response.ok) {
      throw new Error("Unable to load footer.");
    }

    return response.text();
  })
  .then(html => {
    document.getElementById("footer").innerHTML = html;
  })
  .catch(error => {
    console.error(error);
  });