import { Queue } from "bullmq";
import IORedis from "ioredis";

let _connection: IORedis | null = null;
export function redisConnection(): IORedis {
  if (_connection) return _connection;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL no configurado");
  _connection = new IORedis(url, {
    maxRetriesPerRequest: null, // recomendado por BullMQ
    enableReadyCheck: false,
  });
  return _connection;
}

// ============ Queues ============
export const QUEUE_NAMES = {
  imports: "fibraos:imports",
  outbox: "fibraos:outbox",
  domainVerifier: "fibraos:domain-verifier",
} as const;

let _imports: Queue | null = null;
export function importsQueue(): Queue {
  if (_imports) return _imports;
  _imports = new Queue(QUEUE_NAMES.imports, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  });
  return _imports;
}

let _outbox: Queue | null = null;
export function outboxQueue(): Queue {
  if (_outbox) return _outbox;
  _outbox = new Queue(QUEUE_NAMES.outbox, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 10,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 3 * 24 * 3600, count: 5000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  });
  return _outbox;
}

let _domainVerifier: Queue | null = null;
export function domainVerifierQueue(): Queue {
  if (_domainVerifier) return _domainVerifier;
  _domainVerifier = new Queue(QUEUE_NAMES.domainVerifier, {
    connection: redisConnection(),
    defaultJobOptions: {
      attempts: 1, // el backoff lo gestiona el propio runner re-encolando
      removeOnComplete: { age: 7 * 24 * 3600 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  });
  return _domainVerifier;
}

export interface ImportJobPayload {
  jobId: string; // id de import_jobs
  organizationId: string;
  userId: string;
  entityType: "boxes" | "cables" | "clients";
  mapping: Record<string, { column: string; transforms: string[] }>;
  dryRun: boolean;
  storageKey: string; // key S3 del fichero subido
  filename: string;
}

export interface OutboxJobPayload {
  eventId: string; // id de outbox_events
}

export interface DomainVerifierJobPayload {
  domainId: string;
}
