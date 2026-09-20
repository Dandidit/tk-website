import { handleUpload } from "@vercel/blob/client";
import { requireAuth } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const body = req.body;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.toLowerCase().endsWith(".pdf")) {
          throw new Error("Only PDF files are allowed.");
        }

        return {
          allowedContentTypes: ["application/pdf"],
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId: user.id
          })
        };
      },
      onUploadCompleted: async () => {}
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: error.message || "Upload failed" });
  }
}
