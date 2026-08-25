export const SCHEMA_VERSIONS = {
  arena: 2,
  robot: 1,
  competitionRuleset: 1,
  simulationProfile: 1,
} as const;

export type SchemaKind = keyof typeof SCHEMA_VERSIONS;

export function checkSchemaVersion(kind: SchemaKind, data: unknown): { ok: boolean; found?: number } {
  const expected = SCHEMA_VERSIONS[kind];
  const v = (data as { schemaVersion?: number } | null)?.schemaVersion;
  if (v === undefined) return { ok: true };
  if (typeof v !== "number") return { ok: false, found: v as number };
  if (v > expected) return { ok: false, found: v };
  if (v < expected) return { ok: true, found: v };
  return { ok: true, found: v };
}
