-- Combined migration: final schema
PRAGMA foreign_keys=off;

-- Create users table
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Unique index on users.email
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Create fish table
CREATE TABLE "fish" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ip" TEXT,
    "port" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'running',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Create alerts table
CREATE TABLE "alerts" (
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
    CONSTRAINT "alerts_fishId_fkey" FOREIGN KEY ("fishId") REFERENCES "fish" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

PRAGMA foreign_keys=on;
