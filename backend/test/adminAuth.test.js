const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";

const User = require("../models/userModel");
const { registerUser, loginUser } = require("../controllers/authController");
const { protect, authorize } = require("../middleware/authMiddleware");
const { generateToken, verifyToken } = require("../services/authService");
const { DEV_SEED_USERS, seedDevelopmentAccounts } = require("../config/devAccounts");

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

test("public registration cannot create an administrator, even if the request asks for one", async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  let createdPayload = null;

  try {
    User.findOne = async () => null;
    User.create = async (payload) => {
      createdPayload = payload;
      return { _id: "escalation-attempt-id", ...payload };
    };

    const req = {
      body: {
        name: "Wannabe Admin",
        email: "wannabe-admin@test.com",
        password: "password123",
        role: "administrator",
      },
    };
    const res = makeRes();

    await registerUser(req, res);

    assert.equal(res.statusCode, 201);
    assert.equal(createdPayload.role, "citizen");
    assert.equal(res.body.user.role, "citizen");
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test("seedDevelopmentAccounts creates the administrator, authority, and citizen dev accounts", async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const createdRoles = [];

  try {
    User.findOne = async () => null;
    User.create = async (payload) => {
      createdRoles.push(payload.role);
      return { _id: `${payload.role}-id`, ...payload };
    };

    const { created, skipped } = await seedDevelopmentAccounts({ silent: true });

    assert.deepEqual(skipped, []);
    assert.equal(created.length, DEV_SEED_USERS.length);
    assert.ok(createdRoles.includes("administrator"));
    assert.ok(createdRoles.includes("authority"));
    assert.ok(createdRoles.includes("citizen"));
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test("seedDevelopmentAccounts is a no-op in production", async () => {
  const originalFindOne = User.findOne;
  const originalNodeEnv = process.env.NODE_ENV;
  let findOneCalled = false;

  try {
    process.env.NODE_ENV = "production";
    User.findOne = async () => {
      findOneCalled = true;
      return null;
    };

    const result = await seedDevelopmentAccounts();

    assert.equal(findOneCalled, false);
    assert.deepEqual(result, { created: [], skipped: [] });
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    User.findOne = originalFindOne;
  }
});

test("admin@smartcity.com authenticates and receives an administrator session", async () => {
  const originalFindOne = User.findOne;
  const originalCompare = require("bcryptjs").compare;

  try {
    User.findOne = async () => ({
      _id: "admin-id",
      name: "System Administrator",
      email: "admin@smartcity.com",
      role: "administrator",
      department: null,
      password: "hashed-password",
      active: true,
    });
    require("bcryptjs").compare = async () => true;

    const req = { body: { email: "admin@smartcity.com", password: "Admin@123" } };
    const res = makeRes();

    await loginUser(req, res);

    assert.equal(res.statusCode, null); // res.json() called directly, no explicit status(200)
    assert.equal(res.body.user.role, "administrator");
    assert.ok(res.body.token);

    const decoded = verifyToken(res.body.token);
    assert.equal(decoded.role, "administrator");
  } finally {
    User.findOne = originalFindOne;
    require("bcryptjs").compare = originalCompare;
  }
});

test("wrong admin password is rejected", async () => {
  const originalFindOne = User.findOne;
  const originalCompare = require("bcryptjs").compare;

  try {
    User.findOne = async () => ({
      _id: "admin-id",
      email: "admin@smartcity.com",
      role: "administrator",
      password: "hashed-password",
      active: true,
    });
    require("bcryptjs").compare = async () => false;

    const req = { body: { email: "admin@smartcity.com", password: "wrong-password" } };
    const res = makeRes();

    await loginUser(req, res);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.message, "Invalid email or password");
  } finally {
    User.findOne = originalFindOne;
    require("bcryptjs").compare = originalCompare;
  }
});

test("generateToken embeds the administrator role and verifyToken reads it back", () => {
  const token = generateToken({ _id: "admin-id", role: "administrator" });
  const decoded = verifyToken(token);

  assert.equal(decoded.role, "administrator");
  assert.equal(decoded.id, "admin-id");
});

test("protect middleware accepts a valid administrator token", async () => {
  const originalFindById = User.findById;

  try {
    const token = generateToken({ _id: "admin-id", role: "administrator" });

    User.findById = () => ({
      select: async () => ({ _id: "admin-id", role: "administrator", active: true }),
    });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = makeRes();
    let nextCalled = false;

    await protect(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.user.role, "administrator");
  } finally {
    User.findById = originalFindById;
  }
});

test("authorize('administrator') permits the administrator and rejects a citizen", () => {
  const allow = makeRes();
  authorize("administrator")({ user: { role: "administrator" } }, allow, () => {
    allow.statusCode = "next-called";
  });
  assert.equal(allow.statusCode, "next-called");

  const deny = makeRes();
  authorize("administrator")({ user: { role: "citizen" } }, deny, () =>
    assert.fail("next must not be called")
  );
  assert.equal(deny.statusCode, 403);
});
