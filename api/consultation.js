import { neon } from "@neondatabase/serverless";
import { Resend } from "resend";

const sql = neon(process.env.terakira_db_DATABASE_URL);
const resend = new Resend(process.env.RESEND_API_KEY);

const allowedValues = {
  monthlyRevenue: ["below-10k", "10k-50k", "50k-100k", "above-100k"],
  currentBookkeeping: ["myself", "employee", "accountant", "software", "none"],
  bookkeepingMethod: ["cash", "accrual", "unsure"],
  closingFrequency: ["weekly", "monthly", "quarterly"],
  contactReason: ["new-business", "catch-up", "tax", "replace-provider", "other"],
  supportTimeline: ["now", "exploring"]
};

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return request.headers.get("x-real-ip")?.trim() || null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function verifyTurnstile(token, ipAddress) {
  const formData = new FormData();
  formData.append("secret", process.env.TURNSTILE_SECRET_KEY);
  formData.append("response", token);

  if (ipAddress) formData.append("remoteip", ipAddress);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: formData
    }
  );

  if (!response.ok) return false;

  const result = await response.json();
  return result.success === true;
}

export async function POST(request) {
  try {
    if (!process.env.terakira_db_DATABASE_URL || !process.env.TURNSTILE_SECRET_KEY) {
      console.error("Missing DATABASE_URL or TURNSTILE_SECRET_KEY.");
      return json({ message: "Server configuration error." }, 500);
    }

    const body = await request.json();

    // Honeypot: real visitors should never fill this field.
    if (cleanText(body.website, 200)) {
      return json({ message: "Submission received." });
    }

    const firstName = cleanText(body.firstName, 100);
    const lastName = cleanText(body.lastName, 100);
    const businessName = cleanText(body.businessName, 200) || null;
    const email = cleanText(body.email, 254).toLowerCase();
    const phone = cleanText(body.phone, 50);
    const monthlyRevenue = cleanText(body.monthlyRevenue, 30);
    const currentBookkeeping = cleanText(body.currentBookkeeping, 30);
    const bookkeepingMethod = cleanText(body.bookkeepingMethod, 20);
    const closingFrequency = cleanText(body.closingFrequency, 20);
    const contactReason = cleanText(body.contactReason, 30);
    const supportTimeline = cleanText(body.supportTimeline, 20);
    const consent = body.consent === true;
    const turnstileToken = cleanText(body.turnstileToken, 2048);

    if (
      !firstName ||
      !lastName ||
      !isValidEmail(email) ||
      !phone ||
      !allowedValues.monthlyRevenue.includes(monthlyRevenue) ||
      !allowedValues.currentBookkeeping.includes(currentBookkeeping) ||
      !allowedValues.bookkeepingMethod.includes(bookkeepingMethod) ||
      !allowedValues.closingFrequency.includes(closingFrequency) ||
      !allowedValues.contactReason.includes(contactReason) ||
      !allowedValues.supportTimeline.includes(supportTimeline) ||
      !consent ||
      !turnstileToken
    ) {
      return json({ message: "Please check all required fields." }, 400);
    }

    const ipAddress = getClientIp(request);
    const userAgent = cleanText(request.headers.get("user-agent"), 1000) || null;

    const turnstilePassed = await verifyTurnstile(turnstileToken, ipAddress);
    if (!turnstilePassed) {
      return json({ message: "Security verification failed. Please try again." }, 400);
    }
    
    // to convert from 1 minute to 1 hour
    if (ipAddress) {
      const rateLimitResult = await sql`
        SELECT COUNT(*)::int AS count
        FROM consultation_submissions
        WHERE ip_address = ${ipAddress}::inet
          AND submitted_at >= NOW() - INTERVAL '1 hour'
      `;

      if (rateLimitResult[0].count >= 3) {
        return json(
          { message: "Too many submissions. Please try again later." },
          429
        );
      }
    }

    const inserted = await sql`
      INSERT INTO consultation_submissions (
        first_name,
        last_name,
        business_name,
        email,
        phone,
        monthly_revenue,
        current_bookkeeping,
        bookkeeping_method,
        closing_frequency,
        contact_reason,
        support_timeline,
        consent,
        ip_address,
        user_agent
      )
      VALUES (
        ${firstName},
        ${lastName},
        ${businessName},
        ${email},
        ${phone},
        ${monthlyRevenue},
        ${currentBookkeeping},
        ${bookkeepingMethod},
        ${closingFrequency},
        ${contactReason},
        ${supportTimeline},
        ${consent},
        ${ipAddress}::inet,
        ${userAgent}
      )
      RETURNING id, submitted_at
    `;

    // Saving to Neon determines success. Email failure does not fail the form.
    if (process.env.RESEND_API_KEY && process.env.ADMIN_NOTIFICATION_EMAIL) {
      const submission = inserted[0];

      const { error } = await resend.emails.send({
        from:  process.env.RESEND_FROM_EMAIL || "TeraKira <onboarding@resend.dev>",
        to: [process.env.ADMIN_NOTIFICATION_EMAIL],
        replyTo: email,
        subject: `New TeraKira consultation: ${firstName} ${lastName}`,
        html: `
          <h2>New consultation submission</h2>
          <p><strong>Reference:</strong> ${escapeHtml(submission.id)}</p>
          <p><strong>Name:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
          <p><strong>Business:</strong> ${escapeHtml(businessName || "Not provided")}</p>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
          <p><strong>Monthly revenue:</strong> ${escapeHtml(monthlyRevenue)}</p>
          <p><strong>Current bookkeeping:</strong> ${escapeHtml(currentBookkeeping)}</p>
          <p><strong>Preferred method:</strong> ${escapeHtml(bookkeepingMethod)}</p>
          <p><strong>Closing frequency:</strong> ${escapeHtml(closingFrequency)}</p>
          <p><strong>Contact reason:</strong> ${escapeHtml(contactReason)}</p>
          <p><strong>Support timeline:</strong> ${escapeHtml(supportTimeline)}</p>
          <p><strong>Submitted:</strong> ${escapeHtml(submission.submitted_at)}</p>
        `
      });

      if (error) console.error("Resend notification failed:", error);
    }

    return json({
      message: "Thank you. Your consultation request has been submitted."
    });
  } catch (error) {
    console.error("Consultation submission failed:", error);
    return json({ message: "Unable to submit the form. Please try again." }, 500);
  }
}

export function GET() {
  return json({ message: "Method not allowed." }, 405);
}
