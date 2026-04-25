"use client";

import imageCompression from "browser-image-compression";

/**
 * Comprime una imagen a WebP 1600×1600 máx, quality 0.85.
 * Una foto típica de móvil 12 MP (~4 MB JPEG) baja a 250-400 KB WebP.
 */
export async function compressPhoto(file: File): Promise<File> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: "image/webp",
    initialQuality: 0.85,
  });
  // `imageCompression` devuelve Blob; lo envolvemos en File para preservar nombre
  if (!(compressed instanceof File)) {
    return new File([compressed], file.name.replace(/\.[^.]+$/, ".webp"), {
      type: "image/webp",
      lastModified: Date.now(),
    });
  }
  return compressed;
}

/**
 * Flujo completo: comprime + pide URL firmada + sube.
 * Devuelve el fileId del servidor para asociarlo a la mutación de fusión.
 */
export async function uploadCompressedPhoto(
  file: File,
  related?: { table: "fusions" | "boxes" | "clients"; id: string },
): Promise<{ fileId: string; publicUrl: string }> {
  const compressed = await compressPhoto(file);
  const dims = await readImageDimensions(compressed).catch(() => ({ width: undefined, height: undefined }));

  const res = await fetch("/api/field/upload-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mime: "image/webp",
      sizeBytes: compressed.size,
      width: dims.width,
      height: dims.height,
      relatedTable: related?.table,
      relatedId: related?.id,
    }),
  });
  const json = (await res.json()) as {
    ok: boolean;
    data?: { fileId: string; uploadUrl: string; publicUrl: string };
    error?: string;
  };
  if (!json.ok || !json.data) throw new Error(json.error ?? "upload_sign_failed");

  const put = await fetch(json.data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/webp" },
    body: compressed,
  });
  if (!put.ok) throw new Error(`upload_put_failed:${put.status}`);

  return { fileId: json.data.fileId, publicUrl: json.data.publicUrl };
}

function readImageDimensions(file: File | Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_dim_read_failed"));
    };
    img.src = url;
  });
}
