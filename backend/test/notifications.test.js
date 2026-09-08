const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-secret";

const Issue = require("../models/issueModel");
const { getNotifications } = require("../controllers/dashboardController");

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

function mockIssueFind(fakeIssues, captureQuery) {
  const originalFind = Issue.find;
  const chain = {
    populate: () => chain,
    sort: async () => fakeIssues,
  };
  Issue.find = (query) => {
    if (captureQuery) captureQuery(query);
    return chain;
  };
  return () => {
    Issue.find = originalFind;
  };
}

test("getNotifications derives real notifications from statusHistory, newest first", async () => {
  const fakeIssues = [
    {
      _id: "issue-1",
      title: "Pothole on Main St",
      statusHistory: [
        {
          status: "Pending",
          remarks: "",
          completionProof: null,
          changedBy: { name: "Citizen One" },
          changedAt: new Date("2026-01-01T10:00:00Z"),
        },
        {
          status: "Resolved",
          remarks: "Fixed the pothole.",
          completionProof: "/uploads/proof.jpg",
          changedBy: { name: "Pothole Authority" },
          changedAt: new Date("2026-01-03T10:00:00Z"),
        },
      ],
    },
  ];

  const restore = mockIssueFind(fakeIssues);

  try {
    const req = { user: { _id: "citizen-1", role: "citizen" } };
    const res = makeRes();

    await getNotifications(req, res);

    assert.equal(res.body.count, 2);
    // Newest first.
    assert.equal(res.body.notifications[0].status, "Resolved");
    assert.equal(res.body.notifications[0].remarks, "Fixed the pothole.");
    assert.equal(res.body.notifications[0].hasCompletionProof, true);
    assert.equal(res.body.notifications[0].changedBy, "Pothole Authority");
    assert.equal(res.body.notifications[0].issueId, "issue-1");
    assert.equal(res.body.notifications[0].issueTitle, "Pothole on Main St");
    assert.equal(res.body.notifications[1].status, "Pending");

    // No sensitive fields leaked.
    for (const note of res.body.notifications) {
      assert.equal(note.password, undefined);
      assert.equal(note.token, undefined);
      assert.equal(note.jwtSecret, undefined);
    }
  } finally {
    restore();
  }
});

test("getNotifications scopes the underlying query to the citizen's own issues", async () => {
  let capturedQuery = null;
  const restore = mockIssueFind([], (query) => {
    capturedQuery = query;
  });

  try {
    const req = { user: { _id: "citizen-42", role: "citizen" } };
    const res = makeRes();

    await getNotifications(req, res);

    // fetchIssuesForAuthority (shared with getAllIssues/getRecentIssues) is
    // what enforces this - confirming it's actually wired in, not bypassed.
    assert.equal(capturedQuery.reportedBy, "citizen-42");
    assert.equal(capturedQuery.assignedDepartment, undefined);
  } finally {
    restore();
  }
});

test("getNotifications scopes the underlying query to the authority's own department", async () => {
  let capturedQuery = null;
  const restore = mockIssueFind([], (query) => {
    capturedQuery = query;
  });

  try {
    const req = { user: { _id: "authority-1", role: "authority", department: "Pothole" } };
    const res = makeRes();

    await getNotifications(req, res);

    assert.equal(capturedQuery.assignedDepartment, "Pothole");
    assert.equal(capturedQuery.reportedBy, undefined);
  } finally {
    restore();
  }
});

test("getNotifications returns an empty list rather than fabricating data when there are no issues", async () => {
  const restore = mockIssueFind([]);

  try {
    const req = { user: { _id: "citizen-1", role: "citizen" } };
    const res = makeRes();

    await getNotifications(req, res);

    assert.equal(res.body.count, 0);
    assert.deepEqual(res.body.notifications, []);
  } finally {
    restore();
  }
});
