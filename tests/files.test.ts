import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { isZipFile, readFileSize, sniffBytes } from "../src/files.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("file helpers", () => {
  it("sniffs ZIP signatures without trusting extensions", async () => {
    const root = await mkdtemp(join(tmpdir(), "kolmopdf-"));
    roots.push(root);
    const zip = join(root, "download.bin");
    const text = join(root, "plain.bin");
    await writeFile(zip, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]));
    await writeFile(text, "markdown");
    await expect(isZipFile(zip)).resolves.toBe(true);
    await expect(isZipFile(text)).resolves.toBe(false);
    await expect(readFileSize(text)).resolves.toBe(8);
  });

  it("sniffs pdf vs zip vs markdown from magic bytes", () => {
    expect(sniffBytes(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe("zip");
    expect(sniffBytes(Buffer.from("%PDF-1.7\n"))).toBe("pdf");
    expect(sniffBytes(Buffer.from("# Title\n\nHi"))).toBe("markdown");
    expect(sniffBytes(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("word/document.xml")]))).toBe("docx");
    expect(
      sniffBytes(
        Buffer.concat([
          Buffer.from([0x50, 0x4b, 0x03, 0x04]),
          Buffer.from("[Content_Types].xml application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ]),
      ),
    ).toBe("docx");
  });
});
