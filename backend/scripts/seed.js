/**
 * Development-only seed script.
 *
 * Creates one administrator, one authority, and one citizen account so the
 * full Citizen -> Authority -> Administrator workflow can be exercised
 * locally without manually registering each role by hand.
 *
 * DO NOT run this against a production database - it is meant for local
 * development only, and the printed credentials below are for local testing
 * only. Change them (or delete these accounts) before deploying anywhere
 * real users can reach.
 *
 * NOTE: if you're using the default in-memory development database (no
 * MONGODB_URI set), this script's in-memory MongoDB instance is separate
 * from - and does not persist into - the one your `npm run dev` / `npm
 * start` server process creates, because each Node process that calls
 * connectDB() spins up its own ephemeral in-memory database that is
 * destroyed when that process exits. In that mode you don't need to run
 * this script at all: server.js seeds these same accounts automatically on
 * startup (see backend/config/devAccounts.js). This script remains useful
 * when MONGODB_URI points at a real, persistent MongoDB instance you want
 * to seed directly.
 *
 * Usage:
 *   cd backend
 *   node scripts/seed.js
 */
require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { seedDevelopmentAccounts } = require("../config/devAccounts");

async function seed() {
  await connectDB();

  const { created, skipped } = await seedDevelopmentAccounts();

  skipped.forEach((email) => console.log(`Skipping ${email} - already exists.`));

  if (created.length === 0 && skipped.length > 0) {
    console.log("\nAll development accounts already existed - nothing to create.");
  }

  console.log("\nSeeding complete. These are development-only credentials - do not use them in production.");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed script failed:", error);
  process.exit(1);
});
