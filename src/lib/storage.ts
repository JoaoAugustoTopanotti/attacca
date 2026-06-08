import { promises as fs } from "node:fs";
import path from "node:path";

// Uploaded score files live on disk under storage/ (gitignored) during dev.
// This keeps binary uploads out of the database and out of /public.

const STORAGE_ROOT = path.join(process.cwd(), "storage");

function resolveInStorage(relativePath: string): string {
  const full = path.resolve(STORAGE_ROOT, relativePath);
  // Guard against path traversal escaping the storage root.
  if (full !== STORAGE_ROOT && !full.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error("Invalid storage path");
  }
  return full;
}

/**
 * Save bytes for a revision and return the path relative to storage/.
 * Layout: storage/<songId>/<revisionId>.<extension>
 */
export async function saveRevisionFile(
  songId: string,
  revisionId: string,
  extension: string,
  data: Uint8Array,
): Promise<string> {
  const relativePath = path.join(songId, `${revisionId}.${extension}`);
  const full = resolveInStorage(relativePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  return relativePath.split(path.sep).join("/");
}

export async function readRevisionFile(relativePath: string): Promise<Buffer> {
  return fs.readFile(resolveInStorage(relativePath));
}
