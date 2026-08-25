import "server-only";

import { z } from "zod";

const productionSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET debe tener al menos 32 caracteres"),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  TOTALUM_API_KEY: z.string().min(1),
  TOTALUM_API_URL: z.string().url().default("https://api.totalum.app/"),
});

const developmentSchema = productionSchema.partial().extend({
  TOTALUM_API_URL: z.string().url().default("https://api.totalum.app/"),
});

const raw = {
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  TOTALUM_API_KEY: process.env.TOTALUM_API_KEY,
  TOTALUM_API_URL: process.env.TOTALUM_API_URL,
};

const parsed = process.env.NODE_ENV === "production"
  ? productionSchema.safeParse(raw)
  : developmentSchema.safeParse(raw);

if (!parsed.success) {
  const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
  throw new Error(`Configuración de entorno inválida o incompleta: ${names}`);
}

export const serverEnv = {
  BETTER_AUTH_SECRET:
    parsed.data.BETTER_AUTH_SECRET || "fintra-development-only-secret-change-me",
  NEXT_PUBLIC_APP_URL: parsed.data.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  TOTALUM_API_KEY: parsed.data.TOTALUM_API_KEY || "missing-development-api-key",
  TOTALUM_API_URL: parsed.data.TOTALUM_API_URL,
};

export function configuredTrustedOrigins(): string[] {
  const configured = [
    serverEnv.NEXT_PUBLIC_APP_URL,
    ...(process.env.TRUSTED_APP_ORIGINS || "").split(","),
  ];

  return configured
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);
}
