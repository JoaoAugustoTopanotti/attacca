-- CreateTable
CREATE TABLE "Song" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Revision" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Revision_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Song_slug_key" ON "Song"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_songId_number_key" ON "Revision"("songId", "number");
