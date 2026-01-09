const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const prismaDir = path.join(__dirname, '../src/main/prisma');
const templateDbPath = path.join(prismaDir, 'template.db');
const schemaPath = path.join(prismaDir, 'schema.prisma');

console.log('Generating template database...');
console.log(`Schema: ${schemaPath}`);
console.log(`Target: ${templateDbPath}`);

// Ensure the directory exists
if (!fs.existsSync(prismaDir)) {
  fs.mkdirSync(prismaDir, { recursive: true });
}

// Remove existing template if any
if (fs.existsSync(templateDbPath)) {
  fs.unlinkSync(templateDbPath);
}

// Set environment variable for Prisma
const env = { ...process.env, DATABASE_URL: `file:${templateDbPath}` };

try {
  // Run prisma migrate deploy to create the DB and apply migrations
  // We use 'npx prisma' to ensure we use the local installed version
  execSync(`npx prisma migrate deploy --schema "${schemaPath}"`, { 
    env, 
    stdio: 'inherit',
    cwd: path.join(__dirname, '..') // Run from project root
  });
  console.log('Template database generated successfully!');
} catch (error) {
  console.error('Failed to generate template database:', error);
  process.exit(1);
}
