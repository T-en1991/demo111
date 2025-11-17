/*
  Warnings:

  - You are about to drop the column `ip` on the `fish` table. All the data in the column will be lost.
  - You are about to drop the column `port` on the `fish` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_fish" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'default',
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
    "manualCommand" TEXT,
    "exitManualCommand" TEXT,
    "returnCommand" TEXT,
    "description" TEXT,
    "track" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_fish" ("ascendCommand", "createdAt", "descendCommand", "description", "exitManualCommand", "forwardCommand", "id", "leftCommand", "manualCommand", "microwaveIp", "microwavePort", "name", "returnCommand", "rightCommand", "satcomIp", "satcomPort1", "satcomPort2", "status", "track", "type", "updatedAt") SELECT "ascendCommand", "createdAt", "descendCommand", "description", "exitManualCommand", "forwardCommand", "id", "leftCommand", "manualCommand", "microwaveIp", "microwavePort", "name", "returnCommand", "rightCommand", "satcomIp", "satcomPort1", "satcomPort2", "status", "track", "type", "updatedAt" FROM "fish";
DROP TABLE "fish";
ALTER TABLE "new_fish" RENAME TO "fish";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
