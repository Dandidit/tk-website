fetch("component/consultation-form.html")
  .then(response => {
    if (!response.ok) {
      throw new Error("Unable to load consultation form.");
    }

    return response.text();
  })
  .then(html => {
    document.getElementById("consultation-form").innerHTML = html;

    if (typeof window.initializeConsultationForm === "function") {
      window.initializeConsultationForm();
    }
  })
  .catch(error => {
    console.error(error);
  });
