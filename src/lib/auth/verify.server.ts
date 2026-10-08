import { getRequest } from "@tanstack/react-start/server";
import { auth } from "./server";

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function requireUserId(): Promise<string> {
  const request = getRequest();
  if (!request) throw new UnauthorizedError();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) throw new UnauthorizedError();
  return session.user.id;
}
