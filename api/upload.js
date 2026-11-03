import { handleUpload } from "@vercel/blob/client";
import { requireAuth } from "../lib/auth.js";
import { statementPrefix, onboardingPrefix, isOwnedBlob } from "../lib/blob-paths.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const allowedTypes = [
  "application/pdf",
  "image/jpeg",
  "image/png"
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireAuth(req, res);

  if (!user) return;

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      token: process.env.BLOB_READ_WRITE_TOKEN,

      onBeforeGenerateToken: async (pathname) => {
        if (
          !isOwnedBlob(pathname, statementPrefix(user.id)) &&
          !isOwnedBlob(pathname, onboardingPrefix(user.id))
        ) {
          throw new Error("Invalid upload location.");
        }

        const lower = pathname.toLowerCase();

        const allowed = allowedTypes.some(type => {
          if (type === "application/pdf") {
            return lower.endsWith(".pdf");
          }

          if (type === "image/jpeg") {
            return lower.endsWith(".jpg") || lower.endsWith(".jpeg");
          }

          if (type === "image/png") {
            return lower.endsWith(".png");
          }

          return false;
        });

        if (!allowed) {
          throw new Error("Only PDF, JPG and PNG files are allowed.");
        }

        return {
          allowedContentTypes: allowedTypes,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({
            userId: user.id
          })
        };
      }
    });

    return res.status(200).json(jsonResponse);

  } catch (error) {
    console.error(error);

    return res.status(400).json({
      error: error.message || "Upload failed"
    });
  }
}