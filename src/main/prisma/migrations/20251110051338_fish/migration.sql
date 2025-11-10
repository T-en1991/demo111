/*
  Warnings:

  - You are about to drop the column `backwardCommand` on the `fish` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_fish" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'default',
    "ip" TEXT,
    "port" INTEGER,
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
INSERT INTO "new_fish" ("ascendCommand", "createdAt", "descendCommand", "description", "forwardCommand", "id", "ip", "leftCommand", "name", "port", "rightCommand", "updatedAt") SELECT "ascendCommand", "createdAt", "descendCommand", "description", "forwardCommand", "id", "ip", "leftCommand", "name", "port", "rightCommand", "updatedAt" FROM "fish";
DROP TABLE "fish";
ALTER TABLE "new_fish" RENAME TO "fish";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
