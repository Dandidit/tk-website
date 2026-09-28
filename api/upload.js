import { handleUpload } from "@vercel/blob/client";
import { getAuthUser } from "./_auth.js";

const allowedTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png"
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN,

      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let token = null;

        try {
          const payload = clientPayload
            ? JSON.parse(clientPayload)
            : null;

          token = payload?.token || null;
        } catch {
          throw new Error("Invalid client payload.");
        }

        if (!token) {
          throw new Error("Unauthorized.");
        }

        // Reuse your existing JWT authentication logic.
        const authReq = {
          headers: {
            ...req.headers,
            authorization: `Bearer ${token}`
          }
        };

        const user = await getAuthUser(authReq);

        if (!user) {
          throw new Error("Unauthorized.");
        }

        const lower = pathname.toLowerCase();

        const allowed = allowedTypes.some(type => {
          if (type === "application/pdf") return lower.endsWith(".pdf");
          if (type === "image/jpeg") return lower.endsWith(".jpg") || lower.endsWith(".jpeg");
          if (type === "image/png") return lower.endsWith(".png");
          return false;
        });

        if (!allowed) {
          throw new Error("Only PDF, JPG and PNG files are allowed.");
        }

        return {
          allowedContentTypes: allowedTypes,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId: user.id
          })
        };
      },

      onUploadCompleted: async () => { }
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error(error);
    return res.status(400).json({
      error: error.message || "Upload failed"
    });
  }
}