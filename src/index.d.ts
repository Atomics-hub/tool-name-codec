export type ToolNameProfileId =
  | "portable-v1"
  | "strict-portable-v1"
  | "openai-v1"
  | "anthropic-v1"
  | "gemini-api-2026-08"
  | "vertex-gemini-2026-08"
  | "mcp-2025-11-25"
  | "mcp-2026-07-28";

export type ToolNameAllocation = "readable-v1" | "stable-hash-v1";
export type ToolNameManifestAlgorithm =
  "readable-sha256-v1" | "stable-sha256-v1";
export type ToolNameEntryStatus = "active" | "retired";
export type ToolNameReason =
  | "sanitized"
  | "truncated"
  | "catalog-collision"
  | "reserved-or-historical-collision"
  | "namespaced"
  | "stateless-stability"
  | "legacy-import";

export interface ToolNameEntry {
  readonly id: string;
  readonly name: string;
  readonly namespace?: string;
}

export interface ToolNameManifestEntry {
  readonly id: string;
  readonly identity: string;
  readonly sourceName: string;
  readonly namespace?: string;
  readonly wireName: string;
  readonly status: ToolNameEntryStatus;
  readonly changed: boolean;
  readonly reasons: readonly ToolNameReason[];
}

export interface ToolNameManifest {
  readonly schema: "tool-name-codec/1";
  readonly profile: ToolNameProfileId;
  readonly algorithm: ToolNameManifestAlgorithm;
  readonly reservedNames: readonly string[];
  readonly entries: readonly ToolNameManifestEntry[];
}

export interface CompileToolNamesOptions {
  readonly profile?: ToolNameProfileId;
  readonly allocation?: ToolNameAllocation;
  readonly previousManifest?: ToolNameManifest;
  readonly reserved?: readonly string[];
}

export interface CompiledToolNames {
  readonly manifest: ToolNameManifest;
  readonly tools: readonly ToolNameManifestEntry[];
  toWire(id: string): string;
  fromWire(wireName: string): ToolNameManifestEntry | undefined;
  lookupWire(wireName: string): ToolNameManifestEntry | undefined;
}

export interface ToolNameProfile {
  readonly id: ToolNameProfileId;
  readonly maxLength: number;
  readonly pattern: string;
  readonly firstPattern: string;
}

export interface WireNameValidation {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly profile: ToolNameProfileId;
}

export interface LegacyToolNameEntry extends ToolNameEntry {
  readonly wireName: string;
  readonly status?: ToolNameEntryStatus;
}

export interface ToolNameMigrationConflict {
  readonly code: string;
  readonly message?: string;
  readonly id?: string;
  readonly wireName?: unknown;
  readonly [key: string]: unknown;
}

export interface ToolNameMigrationPlan {
  readonly preserved: readonly string[];
  readonly generated: readonly string[];
  readonly retired: readonly string[];
}

export type ToolNameMigrationResult =
  | {
      readonly ok: true;
      readonly catalog: CompiledToolNames;
      readonly plan: ToolNameMigrationPlan;
    }
  | {
      readonly ok: false;
      readonly conflicts: readonly ToolNameMigrationConflict[];
    };

export class ToolNameCodecError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>>;
  constructor(code: string, message: string, details?: Record<string, unknown>);
}

export function getProfile(id?: ToolNameProfileId): ToolNameProfile;
export function validateWireName(
  name: unknown,
  profileId?: ToolNameProfileId,
): WireNameValidation;
export function compileToolNames(
  entries: readonly ToolNameEntry[],
  options?: CompileToolNamesOptions,
): CompiledToolNames;
export function planToolNameMigration(
  entries: readonly ToolNameEntry[],
  legacyAliases: readonly LegacyToolNameEntry[],
  options?: Omit<CompileToolNamesOptions, "previousManifest">,
): ToolNameMigrationResult;
