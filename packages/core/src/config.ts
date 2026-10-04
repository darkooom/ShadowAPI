import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { createJiti } from "jiti";
import { z } from "zod";
import type { ShadowConfig } from "@shadowapi/shared";

const ConfigSchema = z.object({
  target: z.url().optional(),
  dataDirectory: z.string().min(1).optional(),
  proxy: z
    .object({ port: z.number().int().min(0).max(65535).optional(), host: z.string().optional() })
    .optional(),
  mock: z
    .object({ port: z.number().int().min(0).max(65535).optional(), host: z.string().optional() })
    .optional(),
  recording: z
    .object({
      ignorePaths: z.array(z.string()).optional(),
      redactHeaders: z.array(z.string()).optional(),
      redactFields: z.array(z.string()).optional(),
      bodySizeLimit: z.number().int().positive().optional(),
    })
    .optional(),
  inference: z
    .object({
      enum: z
        .object({
          minimumObservations: z.number().int().positive().optional(),
          maximumUniqueValues: z.number().int().min(2).optional(),
          maximumUniqueRatio: z.number().positive().max(1).optional(),
        })
        .optional(),
    })
    .optional(),
});

export function defineConfig(config: ShadowConfig): ShadowConfig {
  return ConfigSchema.parse(config) as ShadowConfig;
}

export async function loadConfig(cwd: string, explicitPath?: string): Promise<ShadowConfig> {
  const candidates = explicitPath
    ? [isAbsolute(explicitPath) ? explicitPath : resolve(cwd, explicitPath)]
    : [
        "shadowapi.config.ts",
        "shadowapi.config.mts",
        "shadowapi.config.js",
        "shadowapi.config.mjs",
        "shadowapi.config.json",
      ].map((name) => join(cwd, name));
  const filename = candidates.find(existsSync);
  if (!filename) return {};
  let value: unknown;
  if (filename.endsWith(".json")) value = JSON.parse(readFileSync(filename, "utf8"));
  else {
    const jiti = createJiti(import.meta.url);
    value = await jiti.import(filename, { default: true });
  }
  return ConfigSchema.parse(value) as ShadowConfig;
}
