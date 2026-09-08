const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/userModel");
const Issue = require("../models/issueModel");
const adminController = require("../controllers/adminController");
const { loginUser } = require("../controllers/authController");

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test("createAuthority hashes the password, never returns it, and defaults active to true", async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  let createdPayload = null;

  try {
    User.findOne = async () => null;
    User.create = async (payload) => {
      createdPayload = payload;
      return { _id: "authority-1", ...payload };
    };

    const req = {
      body: {
        name: "Pothole Authority",
        email: "pothole.authority@smartcity.com",
        password: "pothole@12",
        department: "Pothole",
      },
    };
    const res = makeRes();

    await adminController.createAuthority(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(createdPayload.active, true);
    assert.notEqual(createdPayload.password, "pothole@12");
    assert.equal(await bcrypt.compare("pothole@12", createdPayload.password), true);
    assert.equal(res.body.authority.password, undefined);
    assert.equal(res.body.authority.email, "pothole.authority@smartcity.com");
    assert.equal(res.body.authority.department, "Pothole");
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test("createAuthority rejects a duplicate email", async () => {
  const originalFindOne = User.findOne;

  try {
    User.findOne = async () => ({ _id: "existing-user" });

    const req = {
      body: {
        name: "Duplicate",
        email: "pothole.authority@smartcity.com",
        password: "pothole@12",
        department: "Pothole",
      },
    };
    const res = makeRes();

    await adminController.createAuthority(req, res);

    assert.equal(res.statusCode, 409);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("updateAuthorityStatus persists active:true, and a subsequent login for that user succeeds", async () => {
  const originalFindOneAuthority = User.findOne;
  const originalSave = null;

  // Simulate a single persistent user record: updateAuthorityStatus mutates
  // it in place and saves, then loginUser's own separate User.findOne must
  // see the same, now-updated record - this is the exact real-world
  // "administrator activates an authority, then that authority logs in"
  // sequence from the bug report.
  const userRecord = {
    _id: "authority-1",
    name: "Pothole Authority",
    email: "pothole.authority@smartcity.com",
    role: "authority",
    department: "Pothole",
    password: await bcrypt.hash("pothole@12", 10),
    active: false,
    save: async function () {
      return this;
    },
  };

  try {
    User.findOne = async (query) => {
      if (query.role === "authority" && query._id === "authority-1") return userRecord;
      if (query.email === "pothole.authority@smartcity.com") return userRecord;
      return null;
    };

    // Step 1: administrator activates the authority.
    const activateReq = { params: { id: "authority-1" }, body: { active: true } };
    const activateRes = makeRes();
    await adminController.updateAuthorityStatus(activateReq, activateRes);

    assert.equal(activateRes.statusCode, null);
    assert.equal(activateRes.body.authority.active, true);
    assert.equal(userRecord.active, true);

    // Step 2: that same authority now logs in and must succeed, not see
    // "This account has been deactivated."
    const loginReq = { body: { email: "pothole.authority@smartcity.com", password: "pothole@12" } };
    const loginRes = makeRes();
    await loginUser(loginReq, loginRes);

    assert.equal(loginRes.statusCode, null);
    assert.equal(loginRes.body.message, "Login successful");
    assert.equal(loginRes.body.user.role, "authority");
  } finally {
    User.findOne = originalFindOneAuthority;
  }
});

test("updateAuthorityStatus false immediately blocks that authority's next login", async () => {
  const originalFindOne = User.findOne;

  const userRecord = {
    _id: "authority-2",
    email: "authority2@test.com",
    role: "authority",
    department: "Garbage",
    password: await bcrypt.hash("password1", 10),
    active: true,
    save: async function () {
      return this;
    },
  };

  try {
    User.findOne = async (query) => {
      if (query._id === "authority-2") return userRecord;
      if (query.email === "authority2@test.com") return userRecord;
      return null;
    };

    const deactivateReq = { params: { id: "authority-2" }, body: { active: false } };
    const deactivateRes = makeRes();
    await adminController.updateAuthorityStatus(deactivateReq, deactivateRes);

    assert.equal(userRecord.active, false);

    const loginReq = { body: { email: "authority2@test.com", password: "password1" } };
    const loginRes = makeRes();
    await loginUser(loginReq, loginRes);

    assert.equal(loginRes.statusCode, 403);
    assert.match(loginRes.body.message, /deactivated/i);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("updateAuthority updates only the allowed fields and validates the department", async () => {
  const originalFindOne = User.findOne;

  const userRecord = {
    _id: "authority-3",
    name: "Old Name",
    email: "old@test.com",
    role: "authority",
    department: "Pothole",
    active: true,
    password: "irrelevant-hash",
    save: async function () {
      return this;
    },
  };

  try {
    User.findOne = async () => userRecord;

    const req = {
      params: { id: "authority-3" },
      body: { name: "New Name", department: "Garbage" },
    };
    const res = makeRes();

    await adminController.updateAuthority(req, res);

    assert.equal(res.body.authority.name, "New Name");
    assert.equal(res.body.authority.department, "Garbage");
    assert.equal(userRecord.email, "old@test.com"); // untouched
  } finally {
    User.findOne = originalFindOne;
  }
});

test("updateAuthority rejects an invalid department", async () => {
  const originalFindOne = User.findOne;

  const userRecord = {
    _id: "authority-4",
    name: "Someone",
    email: "someone@test.com",
    role: "authority",
    department: "Pothole",
    active: true,
    save: async function () {
      return this;
    },
  };

  try {
    User.findOne = async () => userRecord;

    const req = { params: { id: "authority-4" }, body: { department: "NotARealDepartment" } };
    const res = makeRes();

    await adminController.updateAuthority(req, res);

    assert.equal(res.statusCode, 400);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("deleteAuthority removes the account and unassigns their active issues back to Pending", async () => {
  const originalFindOne = User.findOne;
  const originalUpdateMany = Issue.updateMany;
  const originalDeleteOne = User.deleteOne;
  const updateManyCalls = [];

  try {
    User.findOne = async () => ({ _id: "authority-5", role: "authority" });
    Issue.updateMany = async (query, update) => {
      updateManyCalls.push({ query, update });
      return { modifiedCount: query.status ? 2 : 0 };
    };
    User.deleteOne = async () => ({ deletedCount: 1 });

    const validId = new mongoose.Types.ObjectId().toString();
    const req = { params: { id: validId } };
    // deleteAuthority looks the user up by the literal id from params, so
    // make findOne echo it back regardless of exact match for this test.
    User.findOne = async () => ({ _id: validId, role: "authority" });

    const res = makeRes();
    await adminController.deleteAuthority(req, res);

    assert.equal(res.body.message, "Authority deleted");
    assert.equal(res.body.unassignedIssueCount, 2);
    assert.equal(updateManyCalls.length, 2);
    assert.deepEqual(updateManyCalls[0].update.$set, { assignedTo: null, status: "Pending" });
  } finally {
    User.findOne = originalFindOne;
    Issue.updateMany = originalUpdateMany;
    User.deleteOne = originalDeleteOne;
  }
});

test("deleteAuthority rejects an invalid id before touching the database", async () => {
  const req = { params: { id: "not-a-real-object-id" } };
  const res = makeRes();

  await adminController.deleteAuthority(req, res);

  assert.equal(res.statusCode, 400);
});

test("deleteAuthority returns 404 for a non-existent authority", async () => {
  const originalFindOne = User.findOne;

  try {
    User.findOne = async () => null;

    const validId = new mongoose.Types.ObjectId().toString();
    const req = { params: { id: validId } };
    const res = makeRes();

    await adminController.deleteAuthority(req, res);

    assert.equal(res.statusCode, 404);
  } finally {
    User.findOne = originalFindOne;
  }
});
