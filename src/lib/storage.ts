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

/**
 * Grava os bytes de uma revisão e devolve o caminho relativo a storage/.
 * Layout: storage/<songId>/<revisionId>.<extensão>
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

/** Remove os arquivos em disco de uma música (revisões anteriores ao blob no banco). */
export async function deleteSongFiles(songId: string): Promise<void> {
  await fs.rm(resolveInStorage(songId), { recursive: true, force: true });
}
