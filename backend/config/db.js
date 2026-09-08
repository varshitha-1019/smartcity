const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongod;

// Fixed, persistent location for the zero-config local development
// database (used whenever MONGODB_URI isn't set). Despite the package
// name, mongodb-memory-server runs a real local mongod binary - by
// default against a throwaway temp directory that's deleted as soon as
// the process exits, meaning every server restart (including routine
// nodemon reloads during local development) silently wiped all data,
// including anything an administrator had just created or activated.
// Pointing dbPath at a fixed, gitignored directory inside the repo makes
// this data survive restarts, matching what a developer actually expects
// from "my local database" during a normal edit/restart/test loop.
const DEV_DB_PATH = path.resolve(__dirname, "../.devDb");
const LOCK_FILE = path.join(DEV_DB_PATH, "mongod.lock");

// Guards against this same process calling connectDB() twice concurrently
// (e.g. a route handler racing the startup call) and both branches deciding
// `!mongod` is true and racing to spawn two MongoMemoryServer instances
// against the same dbPath from within one Node process.
let startingPromise = null;

const startMemoryServer = async () => {
  fs.mkdirSync(DEV_DB_PATH, { recursive: true });
  try {
    return await MongoMemoryServer.create({
      binary: { version: "7.0.14" },
      instance: { dbPath: DEV_DB_PATH, storageEngine: "wiredTiger" },
    });
  } catch (error) {
    const message = String(error && error.message);
    if (message.includes("DBPathInUse") || message.includes("mongod.lock")) {
      // This is not a corrupt database - it means a *second* process (another
      // `npm start`/`npm run dev`/`npm run seed` in a different terminal, or
      // an orphaned mongod left over from a previous run that wasn't shut
      // down cleanly) is already holding the lock on this same dbPath.
      // Deleting .devDb or the lock file here would destroy real local data,
      // so we only ever explain the problem - never touch the files.
      console.error(
        "\nMongoDB could not start: another process is already using the local development " +
          `database at:\n  ${DEV_DB_PATH}\n\n` +
          "This almost always means another 'npm start', 'npm run dev', or 'npm run seed' is " +
          "already running against this project (check other terminals/tabs) - only one process " +
          "may own this database at a time.\n\n" +
          "Do NOT delete .devDb - that destroys your local data. If you're certain nothing else " +
          "is running (e.g. a stale lock left behind by a crash or a killed terminal), it is safe " +
          `to remove just the lock file:\n  ${LOCK_FILE}\n`
      );
    }
    throw error;
  }
};

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (mongoUri) {
      await mongoose.connect(mongoUri);
      console.log("MongoDB connected successfully");
      return;
    }

    if (!mongod) {
      if (!startingPromise) {
        startingPromise = startMemoryServer();
      }
      mongod = await startingPromise;
    }

    const uri = await mongod.getUri();
    await mongoose.connect(uri, { dbName: "smartcity" });
    console.log(`MongoDB connected successfully (local persistent dev database at ${DEV_DB_PATH})`);
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

// Releases the mongod lock cleanly. Must be called on every controlled exit
// path (SIGINT/SIGTERM, and nodemon's SIGUSR2 restart signal) - otherwise
// the in-memory server's mongod child process can outlive a "stopped" dev
// server and keep holding mongod.lock, which is what produces DBPathInUse
// on the very next `npm start`/`npm run dev` even though nothing looks like
// it's still running.
const stopDB = async () => {
  await mongoose.disconnect().catch(() => {});
  if (mongod) {
    await mongod.stop();
    mongod = undefined;
  }
  startingPromise = null;
};

module.exports = connectDB;
module.exports.stopDB = stopDB;
module.exports.DEV_DB_PATH = DEV_DB_PATH;