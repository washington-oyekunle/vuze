import { createServer, type IncomingMessage } from "node:http";
import { loadConfig } from "./config.js";
import { SolanaChain } from "./solana.js";
import { TurnkeySignerService } from "./service.js";
import { createPool, PostgresSignerStore } from "./store.js";
import { TurnkeyTransactionSigner } from "./turnkey.js";

const MAX_BODY_BYTES = 8_192;
const config = loadConfig();
const pool = createPool(config.databaseUrl);
const service = new TurnkeySignerService({
  config,
  store: new PostgresSignerStore(pool),
  chain: new SolanaChain(config.rpcUrl),
  turnkey: new TurnkeyTransactionSigner(config),
});
const recoveryTimer = service.startRecoveryWorker();

const server = createServer(async (incoming, outgoing) => {
  try {
    const body = await readBody(incoming);
    if (body === null) {
      outgoing.writeHead(413, { "content-type": "application/json", "cache-control": "no-store" });
      outgoing.end('{"code":"REQUEST_TOO_LARGE"}');
      return;
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (typeof value === "string") headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(", "));
    }
    const method = incoming.method ?? "GET";
    const request = new Request(
      `https://${incoming.headers.host ?? "localhost"}${incoming.url ?? "/"}`,
      {
        method,
        headers,
        ...(body.length && method !== "GET" && method !== "HEAD"
          ? { body }
          : {}),
      },
    );
    const response = await service.handle(request);
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, name) => (responseHeaders[name] = value));
    outgoing.writeHead(response.status, responseHeaders);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    if (!outgoing.headersSent) {
      outgoing.writeHead(500, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      outgoing.end('{"code":"INTERNAL_ERROR"}');
    } else {
      outgoing.destroy();
    }
  }
});

server.headersTimeout = 10_000;
server.requestTimeout = 20_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 32;
server.listen(config.port, config.host);

async function shutdown(): Promise<void> {
  clearInterval(recoveryTimer);
  server.close(() => undefined);
  await pool.end();
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

async function readBody(request: IncomingMessage): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += part.length;
    if (bytes > MAX_BODY_BYTES) {
      request.resume();
      return null;
    }
    chunks.push(part);
  }
  return Buffer.concat(chunks);
}
