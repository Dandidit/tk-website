import appointmentsHandler from "../lib/routes/appointments.js";
import onboardingHandler from "../lib/routes/onboarding.js";
import onboardingFileHandler from "../lib/routes/onboarding-file.js";
import { POST as consultationPost, GET as consultationGet } from "../lib/routes/consultation.js";

async function runConsultation(req, res) {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers || {})) {
      if (Array.isArray(value)) headers.set(key, value.join(", "));
      else if (value != null) headers.set(key, String(value));
    }

    const url = new URL(req.url || "/api/client?action=consultation", `https://${req.headers.host || "localhost"}`);
    let request;
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
      request = new Request(url, { method: "POST", headers, body });
    } else {
      request = new Request(url, { method: req.method, headers });
    }

    const response = req.method === "POST"
      ? await consultationPost(request)
      : await consultationGet(request);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    return res.send(await response.text());
  } catch (error) {
    console.error("Consultation route failed:", error);
    return res.status(500).json({ message: "Unable to submit the form. Please try again." });
  }
}

export default async function handler(req, res) {
  const action = String(req.query?.action || "");
  if (action === "appointments") return appointmentsHandler(req, res);
  if (action === "onboarding") return onboardingHandler(req, res);
  if (action === "onboarding-file") return onboardingFileHandler(req, res);
  if (action === "consultation") return runConsultation(req, res);
  return res.status(404).json({ error: "Unknown client action." });
}
