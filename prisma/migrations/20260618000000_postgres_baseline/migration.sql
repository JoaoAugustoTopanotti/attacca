-- GitSong — Postgres baseline migration (consolidated from all SQLite migrations)
-- Replaces the individual SQLite migrations; applies the full schema in one step.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Song" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT,
    "headerFragment" TEXT,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "authorName" TEXT NOT NULL DEFAULT 'anon',
    "message" TEXT,
    "source" TEXT NOT NULL,
    "originalName" TEXT,
    "blob" BYTEA,
    "storedPath" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "alphaTex" TEXT,
    "format" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'import',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "headerFragment" TEXT,
    "tuning" TEXT,
    "instrument" INTEGER,
    "isPercussion" BOOLEAN NOT NULL DEFAULT false,
    "ownerName" TEXT,
    "ownerId" TEXT,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measure" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "tsNumerator" INTEGER NOT NULL DEFAULT 4,
    "tsDenominator" INTEGER NOT NULL DEFAULT 4,
    "tempo" INTEGER,
    "structPrefix" TEXT,

    CONSTRAINT "Measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cell" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "measureId" TEXT NOT NULL,
    "acceptedContributionId" TEXT,

    CONSTRAINT "Cell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CellContribution" (
    "id" TEXT NOT NULL,
    "cellId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL DEFAULT 'anon',
    "authorId" TEXT,
    "alphaTex" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accepted',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CellContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Song_slug_key" ON "Song"("slug");

-- CreateIndex
CREATE INDEX "Song_ownerId_idx" ON "Song"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_songId_number_key" ON "Revision"("songId", "number");

-- CreateIndex
CREATE INDEX "Track_songId_idx" ON "Track"("songId");

-- CreateIndex
CREATE INDEX "Track_ownerId_idx" ON "Track"("ownerId");

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

-- CreateIndex
CREATE INDEX "CellContribution_authorId_idx" ON "CellContribution"("authorId");

-- AddForeignKey
ALTER TABLE "Song" ADD CONSTRAINT "Song_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Revision" ADD CONSTRAINT "Revision_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Track" ADD CONSTRAINT "Track_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measure" ADD CONSTRAINT "Measure_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cell" ADD CONSTRAINT "Cell_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cell" ADD CONSTRAINT "Cell_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cell" ADD CONSTRAINT "Cell_measureId_fkey" FOREIGN KEY ("measureId") REFERENCES "Measure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cell" ADD CONSTRAINT "Cell_acceptedContributionId_fkey" FOREIGN KEY ("acceptedContributionId") REFERENCES "CellContribution"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CellContribution" ADD CONSTRAINT "CellContribution_cellId_fkey" FOREIGN KEY ("cellId") REFERENCES "Cell"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CellContribution" ADD CONSTRAINT "CellContribution_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
