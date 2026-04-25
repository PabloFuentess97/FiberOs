import { z } from "zod";
import { boxType, boxStatus, cableType, fiberStandard } from "@/lib/db/schema/network";
import { clientStatus } from "@/lib/db/schema/clients";

export const boxRowSchema = z.object({
  code: z.string().min(2).max(40),
  type: z.enum(boxType.enumValues),
  status: z.enum(boxStatus.enumValues).optional(),
  manufacturer: z.string().max(80).nullish(),
  model: z.string().max(80).nullish(),
  positions_per_tray: z.number().int().positive().max(144).nullish(),
  address: z.string().max(200).nullish(),
  notes: z.string().max(2000).nullish(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  installed_at: z.string().nullish(),
});

export const cableRowSchema = z.object({
  code: z.string().min(2).max(40),
  type: z.enum(cableType.enumValues),
  standard: z.enum(fiberStandard.enumValues).optional(),
  fiber_count: z.number().int().positive().max(288),
  length_m: z.number().nonnegative().nullish(),
  source_box_code: z.string().nullish(),
  target_box_code: z.string().nullish(),
  installed_at: z.string().nullish(),
  notes: z.string().nullish(),
});

export const clientRowSchema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().min(2).max(200),
  external_code: z.string().nullish(),
  document_id: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().email().nullish().or(z.literal("")),
  ont_serial: z.string().nullish(),
  ont_model: z.string().nullish(),
  drop_cable_code: z.string().nullish(),
  drop_fiber_number: z.number().int().positive().nullish(),
  status: z.enum(clientStatus.enumValues).optional(),
  installed_at: z.string().nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  notes: z.string().nullish(),
});

export const rowSchemas = {
  boxes: boxRowSchema,
  cables: cableRowSchema,
  clients: clientRowSchema,
} as const;

export type EntityType = keyof typeof rowSchemas;
