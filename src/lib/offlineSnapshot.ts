import type { ChangeRecord } from "./changeManagement";
import { restoreOrgDataset, type OrgDataset } from "./orgDataset";
import type { ExcelRow } from "./parseExcel";
import type { StoryDocument, PendingData } from "./story/types";
import type { DashboardData } from "./types";
import type { ColumnMapping } from "./fieldDictionary";
import type {
  SuccessionCandidateRecord,
  WorkCapabilityDataset,
} from "./workCapabilityDataset";

export const SNAPSHOT_FORMAT = "org-dashboard-snapshot";
export const SNAPSHOT_VERSION = 1;

const KDF_ITERATIONS = 120000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export type SnapshotTab =
  | "summary"
  | "tree"
  | "table"
  | "readiness"
  | "advanced"
  | "studio"
  | "comp"
  | "workforce-intelligence"
  | "story";
export type SnapshotStateSlice = "as-is" | "to-be";
export type SnapshotCompTarget = SnapshotStateSlice | "both";
export type SnapshotWorkforceSubTab = "activity-analysis" | "talent-mapping";

export interface OfflineSnapshotUiState {
  activeTab: SnapshotTab;
  workforceSubTab: SnapshotWorkforceSubTab;
  studioSlice: SnapshotStateSlice;
  tableSlice: SnapshotStateSlice;
  compTarget: SnapshotCompTarget;
}

export interface OfflineSnapshotFileMetadata {
  orgFileName?: string | null;
  toBeFileName?: string | null;
}

export interface OfflineSnapshotInput {
  dataset: OrgDataset | null;
  data: DashboardData | null;
  toBeData: DashboardData | null;
  columnMapping: ColumnMapping | null;
  excelRows: ExcelRow[] | null;
  excelHeaders: string[];
  asIsMutatedRows: ExcelRow[] | null;
  toBeMutatedRows: ExcelRow[] | null;
  changeLog: ChangeRecord[];
  workCapabilityDataset: WorkCapabilityDataset | null;
  successionCandidates: SuccessionCandidateRecord[];
  storyDoc: StoryDocument | null;
  activeSlideId: string | null;
  libraryItems: PendingData[];
  ui: OfflineSnapshotUiState;
  sourceFiles: OfflineSnapshotFileMetadata;
}

export interface OfflineSnapshotPayload extends OfflineSnapshotInput {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  createdAt: string;
}

export interface EncryptedSnapshotEnvelope {
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  createdAt: string;
  encryption: {
    algorithm: "AES-GCM";
    kdf: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
    iv: string;
    compression?: "deflate-raw";
  };
  ciphertext: string;
}

function clone<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not a valid object.`);
  }
  return value as Record<string, unknown>;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  const CHUNK = 0x8000; // 32 KB — avoids max-string-length error on large payloads
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function toBufferSource(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new ArrayBuffer(bytes.byteLength);
  const view = new Uint8Array(copy);
  view.set(bytes);
  return view;
}

async function compressBytes(input: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") return input;
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  await writer.write(toBufferSource(input));
  await writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

async function decompressBytes(input: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  await writer.write(toBufferSource(input));
  await writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!passphrase.trim()) throw new Error("Snapshot passphrase is required.");
  const encoded = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoded,
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toBufferSource(salt),
      iterations: KDF_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function defaultUi(): OfflineSnapshotUiState {
  return {
    activeTab: "summary",
    workforceSubTab: "activity-analysis",
    studioSlice: "as-is",
    tableSlice: "as-is",
    compTarget: "as-is",
  };
}

function sanitizeUi(value: unknown): OfflineSnapshotUiState {
  const raw = value && typeof value === "object" ? (value as Partial<OfflineSnapshotUiState>) : {};
  const fallback = defaultUi();
  return {
    activeTab: isSnapshotTab(raw.activeTab) ? raw.activeTab : fallback.activeTab,
    workforceSubTab:
      raw.workforceSubTab === "talent-mapping" ? "talent-mapping" : fallback.workforceSubTab,
    studioSlice: raw.studioSlice === "to-be" ? "to-be" : fallback.studioSlice,
    tableSlice: raw.tableSlice === "to-be" ? "to-be" : fallback.tableSlice,
    compTarget:
      raw.compTarget === "to-be" || raw.compTarget === "both"
        ? raw.compTarget
        : fallback.compTarget,
  };
}

function isSnapshotTab(value: unknown): value is SnapshotTab {
  return (
    value === "summary" ||
    value === "tree" ||
    value === "table" ||
    value === "readiness" ||
    value === "advanced" ||
    value === "studio" ||
    value === "comp" ||
    value === "workforce-intelligence" ||
    value === "story"
  );
}

function resolvedActiveSlideId(
  storyDoc: StoryDocument | null,
  activeSlideId: string | null,
): string | null {
  if (!storyDoc) return null;
  if (activeSlideId && storyDoc.slides.some((slide) => slide.id === activeSlideId)) {
    return activeSlideId;
  }
  return storyDoc.slides[0]?.id ?? null;
}

export function createSnapshotPayload(
  state: OfflineSnapshotInput,
  createdAt = new Date().toISOString(),
): OfflineSnapshotPayload {
  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    createdAt,
    dataset: clone(state.dataset),
    data: clone(state.data),
    toBeData: clone(state.toBeData),
    columnMapping: clone(state.columnMapping),
    excelRows: clone(state.excelRows),
    excelHeaders: clone(state.excelHeaders ?? []),
    asIsMutatedRows: clone(state.asIsMutatedRows),
    toBeMutatedRows: clone(state.toBeMutatedRows),
    changeLog: clone(state.changeLog ?? []),
    workCapabilityDataset: clone(state.workCapabilityDataset),
    successionCandidates: clone(state.successionCandidates ?? []),
    storyDoc: clone(state.storyDoc),
    activeSlideId: state.activeSlideId,
    libraryItems: clone(state.libraryItems ?? []),
    ui: sanitizeUi(state.ui),
    sourceFiles: clone(state.sourceFiles ?? {}),
  };
}

export async function encryptSnapshot(
  payload: OfflineSnapshotPayload,
  passphrase: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  const compressed = await compressBytes(jsonBytes);
  const didCompress = compressed !== jsonBytes;
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toBufferSource(iv) },
      key,
      toBufferSource(compressed),
    ),
  );
  const envelope: EncryptedSnapshotEnvelope = {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    createdAt: payload.createdAt,
    encryption: {
      algorithm: "AES-GCM",
      kdf: "PBKDF2",
      hash: "SHA-256",
      iterations: KDF_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ...(didCompress ? { compression: "deflate-raw" as const } : {}),
    },
    ciphertext: bytesToBase64(ciphertext),
  };
  return JSON.stringify(envelope);
}

export async function decryptSnapshot(
  fileText: string,
  passphrase: string,
): Promise<OfflineSnapshotPayload> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    throw new Error("Snapshot file is not valid JSON.");
  }
  const envelope = requireObject(parsed, "Snapshot envelope");
  if (envelope.format !== SNAPSHOT_FORMAT || envelope.version !== SNAPSHOT_VERSION) {
    throw new Error("Unsupported snapshot file.");
  }
  const encryption = requireObject(envelope.encryption, "Snapshot encryption metadata");
  if (
    encryption.algorithm !== "AES-GCM" ||
    encryption.kdf !== "PBKDF2" ||
    encryption.hash !== "SHA-256" ||
    typeof encryption.salt !== "string" ||
    typeof encryption.iv !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    throw new Error("Snapshot encryption metadata is invalid.");
  }

  let decrypted: ArrayBuffer;
  try {
    const salt = base64ToBytes(encryption.salt);
    const iv = base64ToBytes(encryption.iv);
    const ciphertext = base64ToBytes(envelope.ciphertext);
    const key = await deriveKey(passphrase, salt);
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toBufferSource(iv) },
      key,
      toBufferSource(ciphertext),
    );
  } catch {
    throw new Error("Could not decrypt snapshot. Check the file and passphrase.");
  }
  const decryptedBytes = new Uint8Array(decrypted);
  const plaintext =
    encryption.compression === "deflate-raw"
      ? await decompressBytes(decryptedBytes)
      : decryptedBytes;
  return restoreSnapshotPayload(JSON.parse(new TextDecoder().decode(plaintext)));
}

export function restoreSnapshotPayload(raw: unknown): OfflineSnapshotPayload {
  const value = requireObject(raw, "Snapshot payload");
  if (value.format !== SNAPSHOT_FORMAT || value.version !== SNAPSHOT_VERSION) {
    throw new Error("Unsupported snapshot payload.");
  }

  const restoredDataset = value.dataset ? restoreOrgDataset(value.dataset) : null;
  if (value.dataset && !restoredDataset) {
    throw new Error("Snapshot org dataset could not be restored.");
  }
  const storyDoc = (value.storyDoc ?? null) as StoryDocument | null;
  const activeSlideId = resolvedActiveSlideId(
    storyDoc,
    typeof value.activeSlideId === "string" ? value.activeSlideId : null,
  );

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    dataset: restoredDataset,
    data: clone((value.data ?? null) as DashboardData | null),
    toBeData: clone((value.toBeData ?? null) as DashboardData | null),
    columnMapping: clone((value.columnMapping ?? null) as ColumnMapping | null),
    excelRows: Array.isArray(value.excelRows) ? clone(value.excelRows as ExcelRow[]) : null,
    excelHeaders: Array.isArray(value.excelHeaders) ? clone(value.excelHeaders as string[]) : [],
    asIsMutatedRows: Array.isArray(value.asIsMutatedRows)
      ? clone(value.asIsMutatedRows as ExcelRow[])
      : null,
    toBeMutatedRows: Array.isArray(value.toBeMutatedRows)
      ? clone(value.toBeMutatedRows as ExcelRow[])
      : null,
    changeLog: Array.isArray(value.changeLog) ? clone(value.changeLog as ChangeRecord[]) : [],
    workCapabilityDataset: clone((value.workCapabilityDataset ?? null) as WorkCapabilityDataset | null),
    successionCandidates: Array.isArray(value.successionCandidates)
      ? clone(value.successionCandidates as SuccessionCandidateRecord[])
      : [],
    storyDoc: clone(storyDoc),
    activeSlideId,
    libraryItems: Array.isArray(value.libraryItems) ? clone(value.libraryItems as PendingData[]) : [],
    ui: sanitizeUi(value.ui),
    sourceFiles: clone((value.sourceFiles ?? {}) as OfflineSnapshotFileMetadata),
  };
}
