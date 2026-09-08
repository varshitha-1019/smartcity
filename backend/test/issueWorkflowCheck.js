const path = require("path");
const fs = require("fs");

const baseUrl = process.env.API_BASE_URL || "http://127.0.0.1:5000";
const authorityRegistrationKey = process.env.AUTHORITY_REGISTRATION_KEY;
const suffix = Date.now();

async function request(pathName, options = {}) {
  const response = await fetch(`${baseUrl}${pathName}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${pathName} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

async function register(payload) {
  return request("/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
}

(async () => {
  if (!authorityRegistrationKey) throw new Error("AUTHORITY_REGISTRATION_KEY is required for this disposable live test.");
  const citizen = await register({ name: "Live Citizen", email: `citizen_${suffix}@example.test`, password: "password123" });
  const authority = await register({
    name: "Live Pothole Authority", email: `pothole_${suffix}@example.test`, password: "password123",
    role: "authority", department: "Pothole", authorityRegistrationKey,
  });

  const form = new FormData();
  const imagePath = path.resolve(__dirname, "fixtures", "geotagged-pothole.jpg");
  form.append("image", new Blob([fs.readFileSync(imagePath)], { type: "image/jpeg" }), "geotagged-pothole.jpg");
  const issueResponse = await request("/api/issues", { method: "POST", headers: { Authorization: `Bearer ${citizen.token}` }, body: form });
  const issue = issueResponse.issue;
  const departments = { Pothole: "Pothole", Garbage: "Garbage", Drainage: "Drainage", "Water Leakage": "Water Leakage" };
  if (!issue || issue.status !== "Pending" || !issue.image || !issue.location?.address
    || !Number.isFinite(issue.location.latitude) || !Number.isFinite(issue.location.longitude)
    || !Number.isFinite(issue.aiPrediction?.confidence) || issue.assignedDepartment !== departments[issue.category]) {
    throw new Error(`Issue workflow response is incomplete: ${JSON.stringify(issueResponse)}`);
  }

  // The fixture is a pothole image, so the trained model should route it to Pothole.
  if (issue.assignedDepartment !== "Pothole") throw new Error(`Expected Pothole assignment for pothole fixture, received ${issue.assignedDepartment}`);
  const authorityHeaders = { Authorization: `Bearer ${authority.token}`, "Content-Type": "application/json" };
  await request("/api/issues", { headers: authorityHeaders });
  await request(`/api/issues/${issue._id}`, { headers: authorityHeaders });
  await request(`/api/issues/status/Pending`, { headers: authorityHeaders });
  await request(`/api/issues/category/Pothole`, { headers: authorityHeaders });
  await request(`/api/issues/department/Pothole`, { headers: authorityHeaders });
  await request(`/api/issues/${issue._id}/assign`, { method: "PATCH", headers: authorityHeaders, body: JSON.stringify({ assignedTo: authority.user.id }) });
  await request(`/api/issues/${issue._id}/status`, { method: "PATCH", headers: authorityHeaders, body: JSON.stringify({ status: "In Progress" }) });
  await request(`/api/issues/${issue._id}/status`, { method: "PATCH", headers: authorityHeaders, body: JSON.stringify({ status: "Resolved" }) });
  const stats = await request("/api/dashboard/stats", { headers: authorityHeaders });
  await request("/api/dashboard/recent", { headers: authorityHeaders });
  await request("/api/dashboard/departments", { headers: authorityHeaders });
  if (stats.totalIssues < 1 || stats.resolved < 1) throw new Error(`Dashboard statistics are incorrect: ${JSON.stringify(stats)}`);
  console.log(JSON.stringify({ ok: true, issueId: issue._id, category: issue.category, confidence: issue.aiPrediction.confidence, address: issue.location.address, stats }, null, 2));
})().catch((error) => { console.error(error); process.exit(1); });
