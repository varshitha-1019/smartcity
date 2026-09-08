const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { AI_SUPPORTED_CATEGORIES } = require("../constants/issueCategories");

const allowedCategories = new Set(AI_SUPPORTED_CATEGORIES);
const INVALID_CATEGORY_MESSAGE = "Invalid image category. Please upload an image related to Garbage, Drainage, Water Leakage, or Potholes.";
const UNCERTAIN_MESSAGE = "AI could not confidently identify the issue. Please upload a clearer image or send it for manual review.";

function validatePrediction(parsed) {
  const confidence = Number(parsed?.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`AI prediction returned invalid confidence: ${JSON.stringify(parsed)}`);
  }

  let status = parsed?.status;
  if (!status) {
    if (confidence < 0.6 || !allowedCategories.has(parsed?.category)) {
      throw new Error(INVALID_CATEGORY_MESSAGE);
    }
    status = "VALID";
  }

  if (status === "REJECTED" || status === "UNCERTAIN") {
    return {
      category: "Unknown",
      confidence,
      status,
      isRelevant: status === "UNCERTAIN",
      reason: parsed.reason || (status === "REJECTED" ? INVALID_CATEGORY_MESSAGE : UNCERTAIN_MESSAGE),
      topCategory: parsed.topCategory || null,
      margin: Number(parsed.margin || 0),
      probabilities: parsed.probabilities || null,
    };
  }

  if (status !== "VALID") {
    throw new Error(INVALID_CATEGORY_MESSAGE);
  }
  if (!allowedCategories.has(parsed?.category)) {
    throw new Error(INVALID_CATEGORY_MESSAGE);
  }

  return {
    category: parsed.category,
    confidence,
    status: "VALID",
    isRelevant: true,
    reason: null,
    topCategory: parsed.topCategory || parsed.category,
    margin: Number(parsed.margin || 0),
    probabilities: parsed.probabilities || null,
  };
}

const predictionCache = new Map();

function getFileFingerprint(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    return `${stat.size}_${buf.slice(0, bytesRead).toString("hex")}`;
  } catch {
    return filePath;
  }
}

function resolvePythonExecutable(projectRoot) {
  const explicit = process.env.PYTHON_PATH || process.env.PYTHON_EXECUTABLE;
  if (explicit) return explicit;
  const candidates = process.platform === "win32"
    ? [path.join(projectRoot, ".venv", "Scripts", "python.exe"), path.join(projectRoot, "ai", "venv", "Scripts", "python.exe")]
    : [
        path.join(projectRoot, ".venv", "bin", "python"),
        path.join(projectRoot, "ai", "venv", "bin", "python"),
        path.join(projectRoot, ".venv", "bin", "python3"),
        path.join(projectRoot, "ai", "venv", "bin", "python3"),
        "/usr/bin/python3",
        "/usr/local/bin/python3",
      ];
  return candidates.find(fs.existsSync) || (process.platform === "win32" ? "python" : "python3");
}

let workerProcess = null;
let isWorkerReady = false;
let workerStartingPromise = null;
const pendingRequests = new Map();
let requestIdCounter = 0;

function startWorker() {
  if (workerProcess && !workerProcess.killed && isWorkerReady) {
    return Promise.resolve(workerProcess);
  }
  if (workerStartingPromise) {
    return workerStartingPromise;
  }

  workerStartingPromise = new Promise((resolve, reject) => {
    try {
      const projectRoot = path.resolve(__dirname, "..", "..");
      const workerScript = path.join(projectRoot, "ai", "scripts", "predict_worker.py");
      if (!fs.existsSync(workerScript)) {
        return resolve(null);
      }

      const pythonExe = resolvePythonExecutable(projectRoot);
      const child = spawn(pythonExe, ["-u", workerScript], {
        cwd: projectRoot,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          TF_CPP_MIN_LOG_LEVEL: process.env.TF_CPP_MIN_LOG_LEVEL || "2",
          TF_ENABLE_ONEDNN_OPTS: "0",
        },
      });

      let buffer = "";

      child.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep incomplete trailing line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed === "READY") {
            isWorkerReady = true;
            workerProcess = child;
            resolve(child);
            continue;
          }

          if (trimmed === "PONG") continue;

          try {
            const parsed = JSON.parse(trimmed);
            const reqId = parsed.id;
            if (reqId && pendingRequests.has(reqId)) {
              const { reqResolve, reqReject } = pendingRequests.get(reqId);
              pendingRequests.delete(reqId);
              if (parsed.error) {
                reqReject(new Error(parsed.error));
              } else {
                reqResolve(parsed);
              }
            }
          } catch {
            // Ignore non-JSON log lines
          }
        }
      });

      child.stderr.on("data", (chunk) => {
        const errText = chunk.toString();
        if (/Traceback|Error:/i.test(errText)) {
          console.warn("[aiPredictionService] Worker stderr:", errText.trim());
        }
      });

      child.on("error", (err) => {
        console.warn("[aiPredictionService] Worker error:", err.message);
        isWorkerReady = false;
        workerProcess = null;
        workerStartingPromise = null;
        for (const { reqReject } of pendingRequests.values()) {
          reqReject(new Error(`AI worker process crashed: ${err.message}`));
        }
        pendingRequests.clear();
      });

      child.on("close", (code) => {
        isWorkerReady = false;
        workerProcess = null;
        workerStartingPromise = null;
        for (const { reqReject } of pendingRequests.values()) {
          reqReject(new Error(`AI worker process exited (code ${code})`));
        }
        pendingRequests.clear();
      });

      child.unref();

      // Safety timeout: allow up to 120 seconds for cold-start
      const safetyTimer = setTimeout(() => {
        if (!isWorkerReady) {
          console.warn("[aiPredictionService] Worker did not signal READY in 120s; falling back to one-shot");
          workerStartingPromise = null;
          resolve(null);
        }
      }, 120000);
      safetyTimer.unref();
    } catch (ex) {
      console.warn("[aiPredictionService] Failed to spawn worker:", ex.message);
      workerStartingPromise = null;
      resolve(null);
    }
  });

  return workerStartingPromise;
}

function predictWithOneShot(imagePath) {
  return new Promise((resolve, reject) => {
    const projectRoot = path.resolve(__dirname, "..", "..");
    const script = path.join(projectRoot, "ai", "scripts", "predict.py");
    const python = spawn(resolvePythonExecutable(projectRoot), [script, path.resolve(imagePath)], {
      cwd: projectRoot,
      env: { ...process.env, TF_CPP_MIN_LOG_LEVEL: process.env.TF_CPP_MIN_LOG_LEVEL || "2" },
    });
    let stdout = "";
    let stderr = "";
    python.stdout.on("data", (d) => { stdout += d.toString(); });
    python.stderr.on("data", (d) => { stderr += d.toString(); });
    python.once("error", (e) => reject(new Error(`AI prediction process could not start: ${e.message}`)));
    python.once("close", (code) => {
      if (code !== 0) return reject(new Error(`AI prediction failed (exit ${code}): ${stderr.trim() || stdout.trim()}`));
      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed?.error) return reject(new Error(parsed.error));
        resolve({ ...validatePrediction(parsed), modelVersion: parsed.modelVersion || "urban_issue_classifier-v2" });
      } catch (e) {
        reject(e instanceof SyntaxError ? new Error(`AI prediction returned invalid JSON: ${stdout.trim()}`) : e);
      }
    });
  });
}

function hasYoloModel(projectRoot) {
  const modelDir = path.join(projectRoot, "ai", "model");
  return (
    fs.existsSync(path.join(modelDir, "best.pt")) ||
    fs.existsSync(path.join(modelDir, "best.onnx")) ||
    fs.existsSync(path.join(projectRoot, "best.pt"))
  );
}

function predictWithYolo(imagePath) {
  return new Promise((resolve, reject) => {
    const projectRoot = path.resolve(__dirname, "..", "..");
    const script = path.join(projectRoot, "ai", "scripts", "predict_yolo.py");
    const python = spawn(resolvePythonExecutable(projectRoot), [script, path.resolve(imagePath)], {
      cwd: projectRoot,
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    python.stdout.on("data", (d) => { stdout += d.toString(); });
    python.stderr.on("data", (d) => { stderr += d.toString(); });
    python.once("error", (e) => reject(new Error(`YOLO prediction process could not start: ${e.message}`)));
    python.once("close", (code) => {
      if (code !== 0) return reject(new Error(`YOLO prediction failed (exit ${code}): ${stderr.trim() || stdout.trim()}`));
      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed?.error) return reject(new Error(parsed.error));
        resolve({ ...validatePrediction(parsed), ...parsed });
      } catch (e) {
        reject(e instanceof SyntaxError ? new Error(`YOLO prediction returned invalid JSON: ${stdout.trim()}`) : e);
      }
    });
  });
}

async function predictImage(imagePath) {
  const fingerprint = getFileFingerprint(imagePath);
  if (predictionCache.has(fingerprint)) {
    return { ...predictionCache.get(fingerprint) };
  }

  const projectRoot = path.resolve(__dirname, "..", "..");
  if (hasYoloModel(projectRoot)) {
    try {
      const yoloResult = await predictWithYolo(imagePath);
      predictionCache.set(fingerprint, yoloResult);
      return yoloResult;
    } catch (yoloErr) {
      console.warn("[aiPredictionService] YOLO inference notice, falling back to classifier:", yoloErr.message);
    }
  }

  let result;
  try {
    const worker = await startWorker();
    if (worker && isWorkerReady && !worker.killed) {
      const id = `req_${Date.now()}_${++requestIdCounter}`;
      const payload = JSON.stringify({ id, imagePath: path.resolve(imagePath) }) + "\n";

      const parsed = await new Promise((reqResolve, reqReject) => {
        const timeoutMs = isWorkerReady ? 15000 : 35000;
        const timer = setTimeout(() => {
          if (pendingRequests.has(id)) {
            pendingRequests.delete(id);
            reqReject(new Error(`AI worker prediction timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);

        pendingRequests.set(id, {
          reqResolve: (res) => { clearTimeout(timer); reqResolve(res); },
          reqReject: (err) => { clearTimeout(timer); reqReject(err); },
        });

        worker.stdin.write(payload);
      });

      result = { ...validatePrediction(parsed), modelVersion: parsed.modelVersion || "urban_issue_classifier-v2" };
      predictionCache.set(fingerprint, result);
      return result;
    }
  } catch (workerErr) {
    console.warn("[aiPredictionService] Warm worker notice, falling back to one-shot:", workerErr.message);
  }

  // Fallback to one-shot execution
  result = await predictWithOneShot(imagePath);
  predictionCache.set(fingerprint, result);
  return result;
}

function stopWorker() {
  if (workerProcess && !workerProcess.killed) {
    try {
      workerProcess.kill();
    } catch (_) {}
  }
  workerProcess = null;
  isWorkerReady = false;
  workerStartingPromise = null;
}

module.exports = { predictImage, validatePrediction, startWorker, stopWorker };

