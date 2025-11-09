/*
  Warnings:

  - You are about to drop the column `status` on the `fish` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `fish` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_fish" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "ip" TEXT,
    "port" INTEGER,
    "ascendCommand" TEXT,
    "descendCommand" TEXT,
    "forwardCommand" TEXT,
    "backwardCommand" TEXT,
    "leftCommand" TEXT,
    "rightCommand" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_fish" ("createdAt", "id", "ip", "name", "port", "updatedAt") SELECT "createdAt", "id", "ip", "name", "port", "updatedAt" FROM "fish";
DROP TABLE "fish";
ALTER TABLE "new_fish" RENAME TO "fish";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
