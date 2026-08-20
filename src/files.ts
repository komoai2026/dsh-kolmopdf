import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, rename, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { PDFDocument } from "pdf-lib";
import { open as openZip, type Entry, type ZipFile } from "yauzl";
import { KolmoPdfError } from "./errors.js";

export const MAX_FILE_BYTES = 300 * 1024 * 1024;
export const MAX_PAGES = 800;
/** Hard caps on ZIP extraction: entry count and total uncompressed bytes. */
export const MAX_ZIP_ENTRIES = 10_000;
export const MAX_ZIP_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;

export async function readFileSize(filePath: string): Promise<number> {
  return (await stat(filePath)).size;
}

export async function readPageCount(data: Buffer): Promise<number> {
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(data, { ignoreEncryption: true });
  } catch (error) {
    throw new KolmoPdfError("parse_file_not_pdf", { message: error instanceof Error ? error.message : String(error) });
  }
  return document.getPageCount();
}

export type SniffKind = "zip" | "pdf" | "markdown" | "docx" | "html" | "latex" | "binary";

const KIND_EXT: Record<SniffKind, string> = {
  zip: ".zip",
  pdf: ".pdf",
  markdown: ".md",
  docx: ".docx",
  html: ".html",
  latex: ".tex",
  binary: ".bin",
};

export function extensionForKind(kind: SniffKind): string {
  return KIND_EXT[kind];
}

export function sniffBytes(buf: Uint8Array): SniffKind {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && [0x03, 0x05, 0x07].includes(buf[2] ?? -1)) {
    const hay = Buffer.from(buf.subarray(0, Math.min(buf.length, 65536))).toString("latin1");
    if (
      hay.includes("word/document.xml") ||
      hay.includes("wordprocessingml.document") ||
      (hay.includes("[Content_Types].xml") && hay.toLowerCase().includes("word/"))
    ) {
      return "docx";
    }
    return "zip";
  }
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf";
  const head = Buffer.from(buf.subarray(0, Math.min(buf.length, 800))).toString("utf8");
  const trimmed = head.trimStart().toLowerCase();
  if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) return "html";
  if (trimmed.startsWith("\\documentclass") || trimmed.startsWith("\\begin{document}")) return "latex";
  if (head.trimStart().startsWith("#") || head.includes("\n# ") || head.includes("\n```")) return "markdown";
  return "binary";
}

export async function sniffFile(filePath: string): Promise<SniffKind> {
  const handle = await open(filePath, "r");
  try {
    const bytes = Buffer.alloc(65536);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    return sniffBytes(bytes.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

export async function isZipFile(filePath: string): Promise<boolean> {
  return (await sniffFile(filePath)) === "zip";
}

function openArchive(path: string): Promise<ZipFile> {
  return new Promise((accept, reject) => {
    openZip(path, { lazyEntries: true }, (error, archive) => {
      if (error !== null || archive === undefined) reject(error ?? new Error("Failed to open ZIP"));
      else accept(archive);
    });
  });
}

function openEntry(archive: ZipFile, entry: Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((accept, reject) => {
    archive.openReadStream(entry, (error, stream) => {
      if (error !== null || stream === undefined) reject(error ?? new Error("Failed to open ZIP entry"));
      else accept(stream);
    });
  });
}

async function* entries(archive: ZipFile): AsyncGenerator<Entry> {
  const queue: Array<Entry | null | Error> = [];
  let wake: (() => void) | undefined;
  const push = (value: Entry | null | Error) => {
    queue.push(value);
    wake?.();
    wake = undefined;
  };
  archive.on("entry", (entry) => push(entry));
  archive.on("end", () => push(null));
  archive.on("error", (error) => push(error));
  archive.readEntry();
  while (true) {
    if (queue.length === 0) await new Promise<void>((accept) => { wake = accept; });
    const value = queue.shift();
    if (value === null) return;
    if (value instanceof Error) throw value;
    if (value === undefined) continue;
    yield value;
    archive.readEntry();
  }
}

function safeEntryPath(root: string, name: string): string {
  const normalized = name.replace(/\\/gu, "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//u.test(normalized)) throw new Error(`Unsafe absolute ZIP entry: ${name}`);
  const target = resolve(root, normalized);
  const rel = relative(resolve(root), target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || resolve(rel) === resolve("..")) throw new Error(`Unsafe parent ZIP entry: ${name}`);
  return target;
}

export interface ExtractResult {
  markdownPath: string | null;
  imagesDir: string | null;
  files: string[];
}

export async function extractZip(zipPath: string, outputRoot: string, signal?: AbortSignal): Promise<ExtractResult> {
  await mkdir(outputRoot, { recursive: true });
  const archive = await openArchive(zipPath);
  const files: string[] = [];
  const markdown: Array<{ path: string; name: string; size: number }> = [];
  let imagesDir: string | null = null;
  let totalUncompressed = 0;
  let entryCount = 0;
  try {
    for await (const entry of entries(archive)) {
      if (signal?.aborted === true) throw new KolmoPdfError("client_aborted");
      entryCount += 1;
      if (entryCount > MAX_ZIP_ENTRIES) throw new KolmoPdfError("client_extract_failed", { message: `ZIP contains more than ${MAX_ZIP_ENTRIES} entries.` });
      if (!entry.fileName.endsWith("/")) {
        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > MAX_ZIP_TOTAL_BYTES) throw new KolmoPdfError("client_extract_failed", { message: "ZIP total uncompressed size exceeds the plugin limit." });
      }
      const target = safeEntryPath(outputRoot, entry.fileName);
      if (entry.fileName.endsWith("/")) {
        await mkdir(target, { recursive: true });
        if (/(^|\/)images\/$/iu.test(entry.fileName)) imagesDir = target;
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await pipeline(await openEntry(archive, entry), createWriteStream(target));
      files.push(target);
      if (/\.md$/iu.test(entry.fileName)) markdown.push({ path: target, name: entry.fileName, size: entry.uncompressedSize });
      if (imagesDir === null && /(^|\/)images\//iu.test(entry.fileName)) imagesDir = join(outputRoot, entry.fileName.slice(0, entry.fileName.toLowerCase().indexOf("images/") + 6));
    }
  } catch (error) {
    archive.close();
    throw new KolmoPdfError("client_extract_failed", { message: error instanceof Error ? error.message : String(error), cause: error });
  }
  const sidecar = /(^|\/)(outline|summary|verification_report|enrichment_meta|tables_changelog|tables_normalized)(\.|$)/iu;
  markdown.sort((a, b) => {
    const score = (item: typeof a) => item.size - (sidecar.test(item.name) ? 1e12 : 0) - (/readme\.md$/iu.test(item.name) ? 1e9 : 0);
    return score(b) - score(a);
  });
  return { markdownPath: markdown[0]?.path ?? null, imagesDir, files };
}

export async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
}

