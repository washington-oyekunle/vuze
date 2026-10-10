import { put } from "@vercel/blob";
import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth/server";

const MAX_BYTES = 100 * 1024 * 1024;
const allowedTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export const Route = createFileRoute("/api/uploads/analytics")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) return Response.json({ error: "Sign in required" }, { status: 401 });

        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) return Response.json({ error: "Choose a video file" }, { status: 400 });
        if (!allowedTypes.has(file.type)) return Response.json({ error: "Use an MP4, WebM, or MOV screen recording" }, { status: 400 });
        if (file.size > MAX_BYTES) return Response.json({ error: "Screen recordings must be 100 MB or smaller" }, { status: 400 });

        try {
          const blob = await put(`analytics/${session.user.id}/${crypto.randomUUID()}-${file.name}`, file, {
            access: "public",
            addRandomSuffix: false,
            contentType: file.type,
          });
          return Response.json({ url: blob.url });
        } catch (error) {
          console.error("analytics upload failed", error);
          return Response.json({ error: "Upload storage is not configured" }, { status: 503 });
        }
      },
    },
  },
});
