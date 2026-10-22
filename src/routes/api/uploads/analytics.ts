import { createFileRoute } from "@tanstack/react-router";

/** Old public/large multipart upload route is intentionally retired. */
export const Route = createFileRoute("/api/uploads/analytics")({
  server: {
    handlers: {
      POST: async () =>
        Response.json(
          {
            error:
              "Use /api/analytics-proof for private, upfront analytics uploads.",
          },
          { status: 410 },
        ),
    },
  },
});
