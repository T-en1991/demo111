-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_alerts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "level" TEXT NOT NULL DEFAULT 'info',
    "type" TEXT,
    "source" TEXT,
    "imgFile" TEXT,
    "lat" REAL,
    "lon" REAL,
    "fishId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromSocket" BOOLEAN NOT NULL DEFAULT true,
    "imageBase64" TEXT,
    CONSTRAINT "alerts_fishId_fkey" FOREIGN KEY ("fishId") REFERENCES "fish" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_alerts" ("createdAt", "fishId", "id", "imgFile", "lat", "level", "lon", "message", "source", "status", "title", "type") SELECT "createdAt", "fishId", "id", "imgFile", "lat", "level", "lon", "message", "source", "status", "title", "type" FROM "alerts";
DROP TABLE "alerts";
ALTER TABLE "new_alerts" RENAME TO "alerts";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
