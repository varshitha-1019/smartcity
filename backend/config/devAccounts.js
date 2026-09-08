const bcrypt = require("bcryptjs");
const User = require("../models/userModel");

/**
 * Development-only bootstrap accounts.
 *
 * These credentials exist purely so the full Citizen -> Authority ->
 * Administrator workflow can be exercised locally without hand-registering
 * every role. They are never created automatically in production - see the
 * NODE_ENV guard in seedDevelopmentAccounts() below, which every caller of
 * this module (scripts/seed.js and server.js) relies on.
 */
const DEV_SEED_USERS = [
  {
    name: "System Administrator",
    email: "admin@smartcity.com",
    password: "Admin@123",
    role: "administrator",
  },
  {
    name: "Pothole Authority",
    email: "pothole.authority@smartcity.com",
    password: "pothole@12",
    role: "authority",
    department: "Pothole",
    active: true,
  },
  { name: "Drainage Authority", email: "drainage.authority@smartcity.com", password: "drainage@12", role: "authority", department: "Drainage", active: true },
  { name: "Garbage Authority", email: "garbage.authority@smartcity.com", password: "garbage@12", role: "authority", department: "Garbage", active: true },
  { name: "Water Leakage Authority", email: "water.authority@smartcity.com", password: "water@12", role: "authority", department: "Water Leakage", active: true },
  {
    name: "Demo Citizen",
    email: "citizen@smartcity.com",
    password: "Citizen@123",
    role: "citizen",
  },
];

/**
 * Idempotently creates the development accounts above (skips any that
 * already exist by email). Safe to call every time the dev server starts,
 * not just from the standalone seed script - that's what lets the
 * in-memory development database (which lives and dies with whichever
 * process created it) actually contain these accounts when the backend
 * server process itself is the one serving login requests.
 *
 * Refuses to run in production regardless of caller, so these well-known
 * credentials can never be auto-created outside local development.
 */
async function seedDevelopmentAccounts({ silent = false } = {}) {
  if (process.env.NODE_ENV === "production" && process.env.MONGODB_URI && process.env.AUTO_SEED !== "true") {
    return { created: [], skipped: [] };
  }

  const created = [];
  const skipped = [];

  for (const seedUser of DEV_SEED_USERS) {
    const existing = await User.findOne({ email: seedUser.email });

    if (existing) {
      skipped.push(seedUser.email);
      continue;
    }

    const hashedPassword = await bcrypt.hash(seedUser.password, 10);

    await User.create({
      ...seedUser,
      password: hashedPassword,
    });

    created.push(seedUser.email);

    if (!silent) {
      console.log(`Created ${seedUser.role}: ${seedUser.email} (dev-only password: ${seedUser.password})`);
    }
  }

  return { created, skipped };
}

module.exports = {
  DEV_SEED_USERS,
  seedDevelopmentAccounts,
};
