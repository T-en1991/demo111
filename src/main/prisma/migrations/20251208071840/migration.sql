/*
  Warnings:

  - A unique constraint covering the columns `[time]` on the table `history` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "fish" ADD COLUMN "ip" TEXT;
ALTER TABLE "fish" ADD COLUMN "port" INTEGER;
ALTER TABLE "fish" ADD COLUMN "rtsp2" TEXT;
ALTER TABLE "fish" ADD COLUMN "rtspUrl" TEXT;

-- AlterTable
ALTER TABLE "history" ADD COLUMN "axMs2" REAL;
ALTER TABLE "history" ADD COLUMN "ayMs2" REAL;
ALTER TABLE "history" ADD COLUMN "azMs2" REAL;
ALTER TABLE "history" ADD COLUMN "pitchDeg" REAL;
ALTER TABLE "history" ADD COLUMN "rollDeg" REAL;
ALTER TABLE "history" ADD COLUMN "yawDeg" REAL;

-- CreateTable
CREATE TABLE "videos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER,
    "camera" TEXT NOT NULL DEFAULT 'unknown',
    "recordedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "history_time_key" ON "history"("time");
