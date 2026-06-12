-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "headerFragment" TEXT,
    "tuning" TEXT,
    "instrument" INTEGER,
    "isPercussion" BOOLEAN NOT NULL DEFAULT false,
    "ownerName" TEXT,
    CONSTRAINT "Track_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Measure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "tsNumerator" INTEGER NOT NULL DEFAULT 4,
    "tsDenominator" INTEGER NOT NULL DEFAULT 4,
    "tempo" INTEGER,
    "structPrefix" TEXT,
    CONSTRAINT "Measure_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cell" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "measureId" TEXT NOT NULL,
    "acceptedContributionId" TEXT,
    CONSTRAINT "Cell_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Cell_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Cell_measureId_fkey" FOREIGN KEY ("measureId") REFERENCES "Measure" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Cell_acceptedContributionId_fkey" FOREIGN KEY ("acceptedContributionId") REFERENCES "CellContribution" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "CellContribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cellId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL DEFAULT 'anon',
    "alphaTex" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CellContribution_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "Cell" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "songId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "authorName" TEXT NOT NULL DEFAULT 'anon',
    "message" TEXT,
    "source" TEXT NOT NULL,
    "originalName" TEXT,
    "storedPath" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "alphaTex" TEXT,
    "format" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'import',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Revision_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Revision" ("alphaTex", "authorName", "createdAt", "format", "id", "message", "number", "originalName", "sizeBytes", "songId", "source", "storedPath") SELECT "alphaTex", "authorName", "createdAt", "format", "id", "message", "number", "originalName", "sizeBytes", "songId", "source", "storedPath" FROM "Revision";
DROP TABLE "Revision";
ALTER TABLE "new_Revision" RENAME TO "Revision";
CREATE UNIQUE INDEX "Revision_songId_number_key" ON "Revision"("songId", "number");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Track_songId_idx" ON "Track"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "Track_songId_order_key" ON "Track"("songId", "order");

-- CreateIndex
CREATE INDEX "Measure_songId_idx" ON "Measure"("songId");

-- CreateIndex
CREATE UNIQUE INDEX "Measure_songId_order_key" ON "Measure"("songId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Cell_acceptedContributionId_key" ON "Cell"("acceptedContributionId");

-- CreateIndex
CREATE INDEX "Cell_songId_idx" ON "Cell"("songId");

-- CreateIndex
CREATE INDEX "Cell_trackId_idx" ON "Cell"("trackId");

-- CreateIndex
CREATE INDEX "Cell_measureId_idx" ON "Cell"("measureId");

-- CreateIndex
CREATE UNIQUE INDEX "Cell_trackId_measureId_key" ON "Cell"("trackId", "measureId");

-- CreateIndex
CREATE INDEX "CellContribution_cellId_idx" ON "CellContribution"("cellId");
