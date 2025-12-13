/*
  Warnings:

  - You are about to drop the column `exitManualCommand` on the `fish` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "system_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "time" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_fish" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'default',
    "ip" TEXT,
    "port" INTEGER,
    "rtspUrl" TEXT,
    "rtsp2" TEXT,
    "satcomIp" TEXT,
    "satcomPort1" INTEGER,
    "satcomPort2" INTEGER,
    "microwaveIp" TEXT,
    "microwavePort" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'running',
    "ascendCommand" TEXT,
    "descendCommand" TEXT,
    "forwardCommand" TEXT,
    "leftCommand" TEXT,
    "rightCommand" TEXT,
    "upCommand" TEXT,
    "downCommand" TEXT,
    "surfCommand" TEXT,
    "manualCommand" TEXT,
    "returnCommand" TEXT,
    "navigateCommand" TEXT,
    "lightOnCommand" TEXT,
    "lightOffCommand" TEXT,
    "wifiCommand" TEXT,
    "description" TEXT,
    "track" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_fish" ("ascendCommand", "createdAt", "descendCommand", "description", "forwardCommand", "id", "ip", "leftCommand", "manualCommand", "microwaveIp", "microwavePort", "name", "port", "returnCommand", "rightCommand", "rtsp2", "rtspUrl", "satcomIp", "satcomPort1", "satcomPort2", "status", "track", "type", "updatedAt") SELECT "ascendCommand", "createdAt", "descendCommand", "description", "forwardCommand", "id", "ip", "leftCommand", "manualCommand", "microwaveIp", "microwavePort", "name", "port", "returnCommand", "rightCommand", "rtsp2", "rtspUrl", "satcomIp", "satcomPort1", "satcomPort2", "status", "track", "type", "updatedAt" FROM "fish";
DROP TABLE "fish";
ALTER TABLE "new_fish" RENAME TO "fish";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
