let consultationTurnstileWidgetId = null;

function loadTurnstileScript() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }

    const existingScript = document.querySelector(
      'script[src*="challenges.cloudflare.com/turnstile"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.turnstile), {
        once: true
      });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => reject(new Error("Unable to load security verification."));
    document.head.appendChild(script);
  });
}

function showConsultationMessage(messageElement, text, type) {
  messageElement.textContent = text;
  messageElement.hidden = false;
  messageElement.classList.remove("is-success", "is-error");
  messageElement.classList.add(type === "success" ? "is-success" : "is-error");
  messageElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function initializeConsultationForm() {
  const form = document.querySelector(".consultation-form");
  if (!form || form.dataset.initialized === "true") return;

  form.dataset.initialized = "true";

  const submitButton = form.querySelector(".consultation-form__submit");
  const messageElement = form.querySelector(".consultation-form__message");
  const turnstileContainer = form.querySelector("#consultation-turnstile");

  try {
    const turnstile = await loadTurnstileScript();
    const siteKey = turnstileContainer?.dataset.sitekey;

    if (!siteKey || siteKey === "0x4AAAAAAEDA1vBB-_ldZnOy") {
      throw new Error("Cloudflare Turnstile site key has not been configured.");
    }

    consultationTurnstileWidgetId = turnstile.render(turnstileContainer, {
      sitekey: siteKey,
      theme: "auto"
    });
  } catch (error) {
    console.error(error);
    showConsultationMessage(
      messageElement,
      "Security verification could not load. Please refresh the page.",
      "error"
    );
    submitButton.disabled = true;
    return;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    messageElement.hidden = true;
    messageElement.classList.remove("is-success", "is-error");

    if (!form.reportValidity()) return;

    const turnstileToken = window.turnstile.getResponse(
      consultationTurnstileWidgetId
    );

    if (!turnstileToken) {
      showConsultationMessage(
        messageElement,
        "Please complete the security verification.",
        "error"
      );
      return;
    }

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    payload.consent = formData.get("consent") === "on";
    payload.turnstileToken = turnstileToken;

    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
      const response = await fetch("/api/consultation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || "Unable to submit the form.");
      }

      form.reset();
      window.turnstile.reset(consultationTurnstileWidgetId);

      showConsultationMessage(
        messageElement,
        result.message || "Your consultation request was submitted successfully.",
        "success"
      );
    } catch (error) {
      console.error(error);
      window.turnstile.reset(consultationTurnstileWidgetId);

      showConsultationMessage(
        messageElement,
        error.message || "Something went wrong. Please try again.",
        "error"
      );
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  });
}

window.initializeConsultationForm = initializeConsultationForm;
