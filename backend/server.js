// dotenv MUST be configured before any other local module is required.
// Several modules (authService.js, config/db.js, etc.) read process.env at
// module-load time via top-level `const x = process.env.X || fallback`.
// Node caches modules by file path on first require, so if any of those
// modules gets pulled in - even transitively, e.g. issueRoutes requiring
// authMiddleware requiring authService - before dotenv populates
// process.env, that module permanently binds to its hardcoded fallback for
// the lifetime of the process, no matter how many times it's required
// again afterwards. This previously caused JWT_SECRET from .env to be
// silently ignored (falling back to a hardcoded default) because
// issueRoutes was required above dotenv.config().
require("dotenv").config();

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    // Refuse to start with a well-known, publicly-visible fallback secret
    // in production - that's the same class of bug this file's dotenv
    // ordering fix above addressed, just moved from "silently wrong" to
    // "silently insecure" instead. Fail loudly instead.
    console.error(
      "FATAL: JWT_SECRET is not set. Refusing to start in production with the insecure default secret. " +
        "Set JWT_SECRET in the environment before starting the server."
    );
    process.exit(1);
  }

  console.warn(
    "WARNING: JWT_SECRET is not set in the environment. Falling back to an insecure, " +
      "publicly-known default. Set JWT_SECRET in backend/.env for any non-throwaway use."
  );
}

const path = require("path");
const issueRoutes = require("./routes/issueRoutes");
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const { stopDB } = require("./config/db");
const { seedDevelopmentAccounts } = require("./config/devAccounts");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

// Database
connectDB()
  .then(() => {
    // The default in-memory development database (used whenever
    // MONGODB_URI isn't set) lives and dies with whichever process created
    // it. A separate `node scripts/seed.js` run gets its own, disconnected
    // in-memory instance and exits, so nothing it created ever reaches this
    // server process's database. Bootstrapping the same well-known
    // development accounts directly here - in the process that's actually
    // serving requests - is what makes them available to log in with.
    // Skipped in production, and skipped whenever a real MONGODB_URI is
    // configured (that database is expected to be seeded explicitly via
    // `npm run seed`, not auto-populated on every server start).
    if (process.env.AUTO_SEED === "true" || (!process.env.MONGODB_URI && process.env.NODE_ENV !== "production")) {
      return seedDevelopmentAccounts();
    }
  })
  .catch((error) => {
    console.error("Development account bootstrap failed:", error.message);
  });

// Middleware
const isDev = process.env.NODE_ENV !== "production";
const configuredOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // In development, automatically allow all localhost & 127.0.0.1 ports (5173, 5174, 5175, etc.)
      if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      try {
        const hostname = new URL(origin).hostname;
        if (hostname.endsWith(".onrender.com") || hostname.endsWith(".vercel.app")) {
          return callback(null, true);
        }
      } catch {
        // ignore invalid URL
      }
      if (configuredOrigins.length === 0 || configuredOrigins.includes("*") || configuredOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const uploadsPath = path.resolve(__dirname, "uploads");
app.use("/uploads", express.static(uploadsPath));

// Health check
app.get("/", (req, res) => {
  res.json({
    message: "AI-based Urban Smart City Monitoring System API is running",
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);

  if (err instanceof Error && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "Image file is too large. Maximum size is 10MB." });
  }

  if (err instanceof Error && err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({ message: "Unexpected file field. Use field name 'image'." });
  }

  // Mongoose validation errors are safe and useful to show as-is (e.g.
  // "Path `email` is required."), since they describe exactly what the
  // client sent wrong.
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }

  // Duplicate key (e.g. a race between the existing-user check and create)
  // - don't leak the raw Mongo error, which includes internal collection
  // and index names.
  if (err.code === 11000) {
    return res.status(409).json({ message: "A record with that value already exists." });
  }

  // Invalid ObjectId passed to a Mongoose query.
  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid identifier provided." });
  }

  // Anything else is unexpected (e.g. a database connectivity failure, or a
  // genuine bug) - the full error is already logged above for debugging,
  // but the client only ever sees a generic message, never the raw
  // driver/stack-trace text.
  res.status(err.statusCode || 500).json({
    message: err.statusCode ? err.message : "An unexpected server error occurred. Please try again.",
  });
});

const PORT = process.env.PORT || 5000;

let httpServer;

// Ensures the local MongoMemoryServer's mongod child process is always
// stopped before this process exits. Without this, Ctrl+C, a nodemon
// restart, or a normal `npm start`/`npm run dev` teardown can leave mongod
// still holding the lock on .devDb, so the very next startup fails with
// DBPathInUse even though nothing appears to be running anymore.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\nReceived ${signal}, shutting down gracefully...`);

  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    await stopDB();
    await stopTesseractWorker();
    stopWorker();
  } catch (error) {
    console.error("Error during shutdown:", error.message);
  }

  if (signal === "SIGUSR2") {
    // nodemon's documented restart pattern: re-raise the same signal on
    // ourselves once cleanup is done, instead of calling process.exit(),
    // so nodemon can tell cleanup actually finished before it respawns us.
    process.kill(process.pid, "SIGUSR2");
  } else {
    process.exit(0);
  }
}

["SIGINT", "SIGTERM", "SIGUSR2"].forEach((signal) => {
  process.once(signal, () => shutdown(signal));
});

const { startWorker, stopWorker } = require("./services/aiPredictionService");
const { getTesseractWorker, stopTesseractWorker } = require("./services/gpsService");

if (require.main === module) {
  httpServer = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Warm up AI classifier model worker and OCR worker for instant responses
    startWorker().catch((err) => console.warn("[AI] Worker warm-up notice:", err.message));
    getTesseractWorker().catch((err) => console.warn("[OCR] Worker warm-up notice:", err.message));
  });
}

module.exports = app;
