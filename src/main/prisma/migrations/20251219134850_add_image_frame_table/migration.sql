-- CreateTable
CREATE TABLE "image_frames" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "imageId" TEXT NOT NULL,
    "current" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "crc" TEXT,
    "filename" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
