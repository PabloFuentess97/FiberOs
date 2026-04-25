import "dotenv/config";
import { startImportWorker } from "./workers/import-runner";
import { startOutboxWorker } from "./workers/outbox-dispatcher";
import { startDomainVerifierWorker } from "./workers/domain-verifier";
import { logger } from "@/lib/observability/logger";

/**
 * Entrypoint del contenedor `worker` en docker-compose.prod.yml.
 * Arranca todos los workers BullMQ en un único proceso Node.
 * Invocar con `node dist/worker.js` o `tsx lib/queues/worker-entrypoint.ts`.
 */
async function main() {
  logger.info("worker_entrypoint_starting");

  const workers = [
    startImportWorker(),
    startOutboxWorker(),
    startDomainVerifierWorker(),
  ];

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker_shutdown");
    await Promise.allSettled(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info({ count: workers.length }, "worker_entrypoint_ready");
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "worker_fatal");
  process.exit(1);
});
