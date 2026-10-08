import { createMiddleware } from "@tanstack/react-start";

export const authMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { requireUserId } = await import("./verify.server");
  const userId = await requireUserId();
  return next({ context: { userId } });
});
