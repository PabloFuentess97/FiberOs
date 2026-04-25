"use client";

import { useEffect, useState } from "react";
import { Check, ChevronRight, Upload, Wand2, Play, FileCheck, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TMDIGITAL_PRESETS } from "@/lib/importer/presets";
import { TARGET_FIELDS, type EntityType } from "@/lib/importer/mapping";

type Step = 1 | 2 | 3 | 4;
type Mapping = Record<string, { column: string; transforms: string[] }>;

interface PreviewData {
  headers: string[];
  totalRows: number;
  preview: Array<{ rowNumber: number; values: Record<string, unknown> }>;
  proposedMapping: Mapping;
}

interface JobStatus {
  id: string;
  status: "pending" | "running" | "ok" | "failed" | "partial";
  totalRows: number | null;
  processedRows: number | null;
  createdRows: number | null;
  updatedRows: number | null;
  errorRows: number | null;
  errors: Array<{ row: number; reason: string; values: Record<string, unknown> }> | null;
  dryRun: boolean;
}

export function ImportWizardClient() {
  const [step, setStep] = useState<Step>(1);
  const [entityType, setEntityType] = useState<EntityType>("boxes");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============ Step 1: preview y mapeo propuesto ============
  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch(`/api/import?entityType=${entityType}`, { method: "PUT", body: fd });
      const json = (await res.json()) as { ok: boolean; data?: PreviewData; error?: string };
      if (!json.ok || !json.data) throw new Error(json.error ?? "preview_failed");
      setPreview(json.data);
      setMapping(json.data.proposedMapping);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al leer fichero");
    } finally {
      setBusy(false);
    }
  }

  function applyPreset(id: string) {
    const p = TMDIGITAL_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setEntityType(p.entityType);
    setMapping(p.mapping);
  }

  // ============ Step 3: dry-run ============
  async function runJob(dry: boolean) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      // Paso A: solicitar URL firmada
      const q = new URLSearchParams({
        filename: file.name,
        mime: file.type || "application/octet-stream",
        sizeBytes: String(file.size),
      });
      const uRes = await fetch(`/api/import?${q}`);
      const uJson = (await uRes.json()) as {
        ok: boolean;
        data?: { fileId: string; uploadUrl: string; storageKey: string };
      };
      if (!uJson.ok || !uJson.data) throw new Error("upload_url_failed");
      setFileId(uJson.data.fileId);
      setStorageKey(uJson.data.storageKey);

      // Paso B: PUT a MinIO/R2
      const put = await fetch(uJson.data.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(`upload_failed:${put.status}`);

      // Paso C: encolar job
      const jres = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          filename: file.name,
          storageKey: uJson.data.storageKey,
          sourceFileId: uJson.data.fileId,
          mapping,
          dryRun: dry,
        }),
      });
      const jjson = (await jres.json()) as { ok: boolean; data?: { jobId: string }; error?: string };
      if (!jjson.ok || !jjson.data) throw new Error(jjson.error ?? "enqueue_failed");
      setJobId(jjson.data.jobId);
      setStep(dry ? 3 : 4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al iniciar");
    } finally {
      setBusy(false);
    }
  }

  // ============ Polling del job ============
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const j = (await res.json()) as { ok: boolean; data?: JobStatus };
        if (!j.ok || !j.data) return;
        if (!cancelled) {
          setJob(j.data);
          if (j.data.status === "ok" || j.data.status === "failed" || j.data.status === "partial") {
            return; // stop
          }
          setTimeout(poll, 2000);
        }
      } catch {
        setTimeout(poll, 4000);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  return (
    <div>
      <Steps current={step} />

      {error ? <div className="mb-4 rounded-md bg-red-100 p-3 text-sm text-red-900">{error}</div> : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>1. Elige entidad y fichero</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="entityType">Tipo de entidad</Label>
              <Select
                id="entityType"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as EntityType)}
              >
                <option value="boxes">Cajas (boxes)</option>
                <option value="cables">Cables</option>
                <option value="clients">Clientes</option>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label>Plantillas TMDigital</Label>
              <div className="flex flex-wrap gap-2">
                {TMDIGITAL_PRESETS.map((p) => (
                  <Button key={p.id} variant="outline" size="sm" onClick={() => applyPreset(p.id)}>
                    {p.name}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-[var(--color-muted)]">
                Aplica un preset antes de subir para saltarte el paso de mapeo si tu Excel viene con columnas estándar.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="file">Fichero XLSX o CSV</Label>
              <Input id="file" type="file" accept=".xlsx,.csv" onChange={onFileChange} disabled={busy} />
              <p className="text-xs text-[var(--color-muted)]">
                Máx 50 MB. La cabecera (fila 1) es obligatoria y define los nombres de columna.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 && preview ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Mapeo de columnas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[var(--color-muted)]">
              {preview.totalRows.toLocaleString("es-ES")} filas detectadas · headers:{" "}
              {preview.headers.join(", ")}
            </p>

            <MappingEditor
              entityType={entityType}
              headers={preview.headers}
              mapping={mapping}
              onChange={setMapping}
            />

            <details className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Vista previa ({preview.preview.length} primeras filas)
              </summary>
              <div className="mt-2 max-h-64 overflow-auto">
                <Table>
                  <THead>
                    <TR>
                      {preview.headers.map((h) => (
                        <TH key={h}>{h}</TH>
                      ))}
                    </TR>
                  </THead>
                  <TBody>
                    {preview.preview.map((r) => (
                      <TR key={r.rowNumber}>
                        {preview.headers.map((h) => (
                          <TD key={h} className="text-xs">
                            {String(r.values[h] ?? "")}
                          </TD>
                        ))}
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </details>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Volver
              </Button>
              <Button onClick={() => runJob(true)} disabled={busy}>
                {busy ? "Ejecutando…" : <><Wand2 size={14} /> Validar (dry-run)</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {(step === 3 || step === 4) && job ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {step === 3 ? "3. Dry-run · resultados" : "4. Ejecución · resultados"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <JobSummary job={job} />

            {job.status === "ok" || job.status === "partial" ? (
              step === 3 ? (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Ajustar mapeo
                  </Button>
                  <Button onClick={() => runJob(false)} disabled={busy}>
                    <Play size={14} /> Ejecutar import real
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-green-700">
                  Import completado. Revisa en{" "}
                  <a href="/boxes" className="underline">
                    /boxes
                  </a>
                  ,{" "}
                  <a href="/cables" className="underline">
                    /cables
                  </a>{" "}
                  o{" "}
                  <a href="/clients" className="underline">
                    /clients
                  </a>
                  .
                </p>
              )
            ) : null}

            {job.errors && job.errors.length > 0 ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-medium">Filas con error ({job.errors.length})</h4>
                  <Button size="sm" variant="outline" onClick={() => downloadErrorsCsv(job.errors!)}>
                    <Download size={12} /> Descargar CSV
                  </Button>
                </div>
                <div className="max-h-64 overflow-auto rounded-md border border-[var(--color-border)]">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Fila</TH>
                        <TH>Motivo</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {job.errors.slice(0, 50).map((e, i) => (
                        <TR key={i}>
                          <TD className="font-mono text-xs">{e.row}</TD>
                          <TD className="text-xs text-[var(--color-destructive)]">{e.reason}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                  {job.errors.length > 50 ? (
                    <p className="p-2 text-xs text-[var(--color-muted)]">
                      Mostrando 50 de {job.errors.length}. Descarga el CSV para verlos todos.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Voiding unused imports for cleanliness */}
      {void [Upload, Check, FileCheck, ChevronRight] && null}
    </div>
  );
}

function Steps({ current }: { current: Step }) {
  const steps: Array<{ n: Step; label: string }> = [
    { n: 1, label: "Elegir fichero" },
    { n: 2, label: "Mapeo" },
    { n: 3, label: "Dry-run" },
    { n: 4, label: "Ejecutar" },
  ];
  return (
    <ol className="mb-6 flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.n} className="flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full border ${
              current >= s.n
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                : "border-[var(--color-border)] bg-white text-[var(--color-muted)]"
            }`}
          >
            {s.n}
          </span>
          <span className={current === s.n ? "font-medium" : "text-[var(--color-muted)]"}>
            {s.label}
          </span>
          {i < steps.length - 1 ? <span className="text-[var(--color-muted)]">→</span> : null}
        </li>
      ))}
    </ol>
  );
}

function MappingEditor({
  entityType,
  headers,
  mapping,
  onChange,
}: {
  entityType: EntityType;
  headers: string[];
  mapping: Mapping;
  onChange: (m: Mapping) => void;
}) {
  const required = TARGET_FIELDS[entityType].required;
  const optional = TARGET_FIELDS[entityType].optional;
  const all = [...required, ...optional];

  function updateField(field: string, patch: Partial<Mapping[string]>) {
    const prev = mapping[field] ?? { column: "", transforms: [] };
    onChange({ ...mapping, [field]: { ...prev, ...patch } });
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Campo destino</TH>
          <TH>Columna origen</TH>
          <TH>Transforms</TH>
        </TR>
      </THead>
      <TBody>
        {all.map((f) => {
          const isReq = (required as readonly string[]).includes(f);
          const row = mapping[f] ?? { column: "", transforms: [] };
          return (
            <TR key={f}>
              <TD>
                <span className="font-mono text-xs">{f}</span>
                {isReq ? (
                  <Badge tone="warning" className="ml-2">
                    req
                  </Badge>
                ) : null}
              </TD>
              <TD>
                <Select
                  value={row.column}
                  onChange={(e) => updateField(f, { column: e.target.value })}
                >
                  <option value="">—</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </TD>
              <TD>
                <Input
                  className="font-mono text-xs"
                  value={row.transforms.join(",")}
                  onChange={(e) =>
                    updateField(f, {
                      transforms: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="trim,upper,null_if_empty"
                />
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

function JobSummary({ job }: { job: JobStatus }) {
  const tone =
    job.status === "ok"
      ? "success"
      : job.status === "partial"
        ? "warning"
        : job.status === "failed"
          ? "destructive"
          : "info";
  return (
    <div className="flex items-center gap-4">
      <Badge tone={tone}>{job.status}</Badge>
      <span className="text-xs text-[var(--color-muted)]">
        {job.processedRows ?? 0} / {job.totalRows ?? "?"} filas ·{" "}
        {job.createdRows ?? 0} creadas · {job.updatedRows ?? 0} actualizadas ·{" "}
        {job.errorRows ?? 0} errores
      </span>
    </div>
  );
}

function downloadErrorsCsv(errors: Array<{ row: number; reason: string; values: Record<string, unknown> }>) {
  const header = ["row", "reason", "values_json"].join(",");
  const lines = errors.map((e) => {
    const json = JSON.stringify(e.values).replace(/"/g, '""');
    const reason = e.reason.replace(/"/g, '""');
    return `${e.row},"${reason}","${json}"`;
  });
  const blob = new Blob([`${header}\n${lines.join("\n")}`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `errores-import-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
