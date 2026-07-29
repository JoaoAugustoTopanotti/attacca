-- Revision ganha a identidade real do autor (authorId); authorName vira cache
-- de exibição, reescrito no rename como já acontece em CellContribution/Track.
-- Sem a coluna, renomear deixava o nome antigo congelado no Histórico e uma
-- pessoa lia como duas. Linhas antigas ficam com authorId NULL (legado/anon).

-- AlterTable
ALTER TABLE "Revision" ADD COLUMN "authorId" TEXT;

-- CreateIndex
CREATE INDEX "Revision_authorId_idx" ON "Revision"("authorId");

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
