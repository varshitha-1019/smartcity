const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";

const User = require("../models/userModel");
const { registerUser, loginUser } = require("../controllers/authController");
const { protect, authorize } = require("../middleware/authMiddleware");

test("public registration always creates a citizen account", async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  let createdPayload = null;

  try {
    User.findOne = async () => null;
    User.create = async (payload) => {
      createdPayload = payload;
      return {
        _id: "authority-id",
        ...payload,
      };
    };

    const req = {
      body: {
        name: "Authority User",
        email: "authority@test.com",
        password: "password123",
        role: "authority",
      },
    };

    const res = {
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

    await registerUser(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(createdPayload.role, "citizen");
    assert.equal(res.body.user.role, "citizen");
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test("loginUser normalizes the email address before lookup", async () => {
  const originalFindOne = User.findOne;
  const originalCompare = require("bcryptjs").compare;
  let lookupEmail = null;

  try {
    User.findOne = async (query) => {
      lookupEmail = query.email;
      return {
        _id: "user-id",
        name: "Sample User",
        email: "sample@example.com",
        role: "citizen",
        department: null,
        password: "hashed-password",
        active: true,
      };
    };
    require("bcryptjs").compare = async () => true;

    const req = {
      body: {
        email: "Sample@Example.com",
        password: "password123",
      },
    };

    const res = {
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

    await loginUser(req, res);

    assert.equal(lookupEmail, "sample@example.com");
    assert.equal(res.body.user.role, "citizen");
  } finally {
    User.findOne = originalFindOne;
    require("bcryptjs").compare = originalCompare;
  }
});

test("protected middleware rejects requests without a bearer token", async () => {
  const res = {
    statusCode: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  await protect({ headers: {} }, res, () => assert.fail("next must not be called"));
  assert.equal(res.statusCode, 401);
});

test("role authorization rejects citizens from authority endpoints", () => {
  const res = {
    statusCode: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  authorize("authority", "admin")({ user: { role: "citizen" } }, res, () => assert.fail("next must not be called"));
  assert.equal(res.statusCode, 403);
});
