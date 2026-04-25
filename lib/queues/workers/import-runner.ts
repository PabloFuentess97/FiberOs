import { Worker, type Job } from "bullmq";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { redisConnection, QUEUE_NAMES, type ImportJobPayload } from "../index";
import { runImport } from "@/lib/importer/runner";
import { logger } from "@/lib/observability/logger";

function s3(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT!,
    region: process.env.S3_REGION ?? "auto",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: true,
  });
}

async function fetchFile(key: string): Promise<Buffer> {
  const cmd = new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key });
  const res = await s3().send(cmd);
  const body = res.Body;
  if (!body) throw new Error("empty_body");
  const chunks: Buffer[] = [];
  // ReadableStream (web) o Readable (node). Handling ambos por seguridad
  if ("transformToByteArray" in body) {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }
  // Fallback Node stream
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function startImportWorker(): Worker {
  const worker = new Worker<ImportJobPayload>(
    QUEUE_NAMES.imports,
    async (job: Job<ImportJobPayload>) => {
      logger.info({ jobId: job.data.jobId }, "import_worker_start");
      const buffer = await fetchFile(job.data.storageKey);
      const result = await runImport({
        jobId: job.data.jobId,
        organizationId: job.data.organizationId,
        userId: job.data.userId,
        entityType: job.data.entityType,
        mapping: job.data.mapping as never,
        dryRun: job.data.dryRun,
        fileBuffer: buffer,
        filename: job.data.filename,
      });
      logger.info(
        { jobId: job.data.jobId, processed: result.processedRows, errors: result.errorRows },
        "import_worker_done",
      );
      return result;
    },
    {
      connection: redisConnection(),
      concurrency: 2,
      lockDuration: 5 * 60_000, // imports grandes pueden tardar minutos
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.data.jobId, err: err.message }, "import_worker_failed");
  });

  return worker;
}
