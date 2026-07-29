import { promises as fs } from "node:fs";
import path from "node:path";

// Arquivos de partitura enviados ficam em disco sob storage/ (gitignored).
// Mantém os uploads binários fora do banco e fora de /public.

const STORAGE_ROOT = path.join(process.cwd(), "storage");

function resolveInStorage(relativePath: string): string {
  const full = path.resolve(STORAGE_ROOT, relativePath);
  // Impede que path traversal escape da raiz de storage.
  if (full !== STORAGE_ROOT && !full.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error("Invalid storage path");
  }
  return full;
}

export async function readRevisionFile(relativePath: string): Promise<Buffer> {
  return fs.readFile(resolveInStorage(relativePath));
}

/** Remove os arquivos em disco de uma música (revisões anteriores ao blob no banco). */
export async function deleteSongFiles(songId: string): Promise<void> {
  await fs.rm(resolveInStorage(songId), { recursive: true, force: true });
}
