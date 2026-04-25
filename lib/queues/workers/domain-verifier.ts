import { Worker, type Job } from "bullmq";
import {
  redisConnection,
  QUEUE_NAMES,
  domainVerifierQueue,
  type DomainVerifierJobPayload,
} from "../index";
import { runDomainCheck } from "@/lib/domains/verifier";
import { logger } from "@/lib/observability/logger";

/**
 * Worker que consume de `fibraos:domain-verifier`. Cada job re-encola su
 * siguiente intento con delay calculado en `runDomainCheck` (backoff §12.3).
 */
export function startDomainVerifierWorker(): Worker {
  const worker = new Worker<DomainVerifierJobPayload>(
    QUEUE_NAMES.domainVerifier,
    async (job: Job<DomainVerifierJobPayload>) => {
      const { domainId } = job.data;
      const result = await runDomainCheck(domainId);
      logger.info({ domainId, ...result }, "domain_check");

      if (result.nextAttempt != null) {
        await domainVerifierQueue().add(
          `verify:${domainId}`,
          { domainId },
          { delay: result.nextAttempt * 1000 },
        );
      }
      return result;
    },
    {
      connection: redisConnection(),
      concurrency: 4,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ domainId: job?.data.domainId, err: err.message }, "domain_verifier_failed");
  });
  return worker;
}
