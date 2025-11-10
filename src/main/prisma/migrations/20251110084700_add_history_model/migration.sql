-- CreateTable
CREATE TABLE "history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lon" REAL,
    "lat" REAL,
    "depth" REAL,
    "height" REAL,
    "battery" INTEGER,
    "signalStrength" INTEGER,
    "time" DATETIME NOT NULL,
    "content" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
