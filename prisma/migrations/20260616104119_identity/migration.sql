-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CellContribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cellId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL DEFAULT 'anon',
    "authorId" TEXT,
    "alphaTex" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CellContribution_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "Cell" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CellContribution_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CellContribution" ("alphaTex", "authorName", "cellId", "createdAt", "id", "message", "status") SELECT "alphaTex", "authorName", "cellId", "createdAt", "id", "message", "status" FROM "CellContribution";
DROP TABLE "CellContribution";
ALTER TABLE "new_CellContribution" RENAME TO "CellContribution";
CREATE INDEX "CellContribution_cellId_idx" ON "CellContribution"("cellId");
CREATE INDEX "CellContribution_authorId_idx" ON "CellContribution"("authorId");
CREATE TABLE "new_Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "headerFragment" TEXT,
    "tuning" TEXT,
    "instrument" INTEGER,
    "isPercussion" BOOLEAN NOT NULL DEFAULT false,
    "ownerName" TEXT,
    "ownerId" TEXT,
    CONSTRAINT "Track_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Track_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Track" ("headerFragment", "id", "instrument", "isPercussion", "name", "order", "ownerName", "songId", "tuning") SELECT "headerFragment", "id", "instrument", "isPercussion", "name", "order", "ownerName", "songId", "tuning" FROM "Track";
DROP TABLE "Track";
ALTER TABLE "new_Track" RENAME TO "Track";
CREATE INDEX "Track_songId_idx" ON "Track"("songId");
CREATE INDEX "Track_ownerId_idx" ON "Track"("ownerId");
CREATE UNIQUE INDEX "Track_songId_order_key" ON "Track"("songId", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
