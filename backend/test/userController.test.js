const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";

const bcrypt = require("bcryptjs");
const User = require("../models/userModel");
const { changePassword } = require("../controllers/userController");

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

test("changePassword rejects when currentPassword is missing", async () => {
  const req = { user: { _id: "user-1" }, body: { newPassword: "newpass123" } };
  const res = makeRes();

  await changePassword(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /current password/i);
});

test("changePassword rejects a new password shorter than 6 characters", async () => {
  const req = { user: { _id: "user-1" }, body: { currentPassword: "old", newPassword: "abc" } };
  const res = makeRes();

  await changePassword(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /at least 6 characters/i);
});

test("changePassword returns 401 and does not touch the record on wrong current password", async () => {
  const originalFindById = User.findById;
  const oldHash = await bcrypt.hash("correct-password", 10);
  let saved = false;

  try {
    User.findById = async () => ({
      _id: "user-1",
      password: oldHash,
      save: async () => {
        saved = true;
      },
    });

    const req = {
      user: { _id: "user-1" },
      body: { currentPassword: "wrong-password", newPassword: "brand-new-pass" },
    };
    const res = makeRes();

    await changePassword(req, res);

    assert.equal(res.statusCode, 401);
    assert.match(res.body.message, /incorrect/i);
    assert.equal(saved, false);
  } finally {
    User.findById = originalFindById;
  }
});

test("changePassword hashes and saves the new password, touching no other field, and never returns it", async () => {
  const originalFindById = User.findById;
  const oldHash = await bcrypt.hash("correct-password", 10);
  const userDoc = {
    _id: "user-1",
    name: "Original Name",
    email: "user@test.com",
    role: "citizen",
    department: null,
    active: true,
    password: oldHash,
    save: async () => userDoc,
  };

  try {
    User.findById = async () => userDoc;

    const req = {
      user: { _id: "user-1" },
      body: { currentPassword: "correct-password", newPassword: "brand-new-pass" },
    };
    const res = makeRes();

    await changePassword(req, res);

    assert.equal(res.statusCode, null); // default 200, no explicit .status() call
    assert.equal(res.body.message, "Password updated successfully.");
    assert.equal(res.body.password, undefined);
    assert.equal(res.body.hash, undefined);

    // The stored password is now a bcrypt hash of the new password, not
    // plaintext, and the new password actually verifies against it.
    assert.notEqual(userDoc.password, "brand-new-pass");
    assert.equal(await bcrypt.compare("brand-new-pass", userDoc.password), true);
    // The old password no longer works.
    assert.equal(await bcrypt.compare("correct-password", userDoc.password), false);

    // No unrelated authorization fields were touched.
    assert.equal(userDoc.name, "Original Name");
    assert.equal(userDoc.email, "user@test.com");
    assert.equal(userDoc.role, "citizen");
    assert.equal(userDoc.active, true);
  } finally {
    User.findById = originalFindById;
  }
});
