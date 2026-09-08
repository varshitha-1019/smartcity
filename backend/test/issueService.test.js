const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDashboardStats,
  buildDepartmentStats,
  fetchIssueById,
  fetchIssuesForAuthority,
  updateIssueStatus,
  assignIssue,
} = require("../services/issueService");
const { getDepartment } = require("../services/departmentService");

function makeMockIssue(overrides = {}) {
  const issue = {
    _id: new (require("mongoose").Types.ObjectId)().toString(),
    status: "Assigned",
    assignedDepartment: "Pothole",
    assignedTo: "authority-1",
    statusHistory: [],
    remarks: "",
    completionProof: null,
    resolvedAt: null,
    updatedBy: null,
    ...overrides,
  };
  issue.save = async () => issue;
  issue.populate = async () => issue;
  return issue;
}

test("buildDashboardStats aggregates status and category counts", () => {
  const issues = [
    { status: "Pending", category: "Pothole", assignedDepartment: "Pothole" },
    { status: "Assigned", category: "Garbage", assignedDepartment: "Garbage" },
    { status: "In Progress", category: "Drainage", assignedDepartment: "Drainage" },
    { status: "Resolved", category: "Water Leakage", assignedDepartment: "Water Leakage" },
    { status: "Rejected", category: null, assignedDepartment: "Drainage" },
  ];

  const stats = buildDashboardStats(issues);

  assert.equal(stats.totalIssues, 5);
  assert.equal(stats.pending, 1);
  assert.equal(stats.assigned, 1);
  assert.equal(stats.inProgress, 1);
  assert.equal(stats.resolved, 1);
  assert.equal(stats.rejected, 1);
  assert.equal(stats.potholes, 1);
  assert.equal(stats.garbage, 1);
  assert.equal(stats.drainage, 1);
  assert.equal(stats.waterLeakage, 1);
});

test("buildDepartmentStats groups issues by department", () => {
  const issues = [
    { assignedDepartment: "Pothole" },
    { assignedDepartment: "Pothole" },
    { assignedDepartment: "Garbage" },
    { assignedDepartment: "Water Leakage" },
  ];

  const departments = buildDepartmentStats(issues);

  assert.deepEqual(departments, [
    { department: "Pothole", count: 2 },
    { department: "Garbage", count: 1 },
    { department: "Water Leakage", count: 1 },
  ]);
});

test("fetchIssueById denies citizens access to other users' issues", async () => {
  const Issue = require("../models/issueModel");
  const originalFindById = Issue.findById;
  const validIssueId = new (require("mongoose").Types.ObjectId)().toString();

  try {
    Issue.findById = () => {
      const issue = {
        _id: validIssueId,
        reportedBy: { _id: "other-user" },
        assignedDepartment: "Pothole",
      };
      issue.populate = () => issue;
      return issue;
    };

    await assert.rejects(
      () => fetchIssueById(validIssueId, { role: "citizen", _id: "current-user" }),
      (error) => {
        assert.equal(error.statusCode, 403);
        return true;
      }
    );
  } finally {
    Issue.findById = originalFindById;
  }
});

test("updateIssueStatus appends a statusHistory entry and sets resolvedAt on Resolved", async () => {
  const Issue = require("../models/issueModel");
  const originalFindById = Issue.findById;
  const authorityId = "authority-1";
  const mockIssue = makeMockIssue({ status: "In Progress", assignedTo: authorityId });

  try {
    Issue.findById = () => mockIssue;

    const updated = await updateIssueStatus(
      mockIssue._id,
      { status: "Resolved", remarks: "Pothole filled and road resurfaced.", completionProofPath: "/uploads/proof.jpg" },
      { role: "authority", _id: authorityId, department: "Pothole" }
    );

    assert.equal(updated.status, "Resolved");
    assert.equal(updated.remarks, "Pothole filled and road resurfaced.");
    assert.equal(updated.completionProof, "/uploads/proof.jpg");
    assert.ok(updated.resolvedAt instanceof Date);
    assert.equal(updated.updatedBy, authorityId);
    assert.equal(updated.statusHistory.length, 1);
    assert.equal(updated.statusHistory[0].status, "Resolved");
    assert.equal(updated.statusHistory[0].remarks, "Pothole filled and road resurfaced.");
    assert.equal(updated.statusHistory[0].completionProof, "/uploads/proof.jpg");
    assert.equal(updated.statusHistory[0].changedBy, authorityId);
  } finally {
    Issue.findById = originalFindById;
  }
});

test("updateIssueStatus rejects an invalid status transition", async () => {
  const Issue = require("../models/issueModel");
  const originalFindById = Issue.findById;
  const authorityId = "authority-1";
  const mockIssue = makeMockIssue({ status: "Resolved", assignedTo: authorityId });

  try {
    Issue.findById = () => mockIssue;

    await assert.rejects(
      () =>
        updateIssueStatus(
          mockIssue._id,
          { status: "Pending" },
          { role: "authority", _id: authorityId, department: "Pothole" }
        ),
      (error) => {
        assert.equal(error.statusCode, 400);
        return true;
      }
    );
  } finally {
    Issue.findById = originalFindById;
  }
});

test("updateIssueStatus lets an authority add remarks without changing status", async () => {
  const Issue = require("../models/issueModel");
  const originalFindById = Issue.findById;
  const authorityId = "authority-1";
  const mockIssue = makeMockIssue({ status: "In Progress", assignedTo: authorityId });

  try {
    Issue.findById = () => mockIssue;

    const updated = await updateIssueStatus(
      mockIssue._id,
      { remarks: "Team dispatched, ETA 2 hours." },
          { role: "authority", _id: authorityId, department: "Pothole" }
    );

    assert.equal(updated.status, "In Progress");
    assert.equal(updated.remarks, "Team dispatched, ETA 2 hours.");
    assert.equal(updated.statusHistory.length, 1);
    assert.equal(updated.statusHistory[0].status, "In Progress");
  } finally {
    Issue.findById = originalFindById;
  }
});

test("updateIssueStatus denies an authority from a different department", async () => {
  const Issue = require("../models/issueModel");
  const originalFindById = Issue.findById;
  const mockIssue = makeMockIssue({ status: "Assigned", assignedDepartment: "Garbage", assignedTo: "authority-1" });

  try {
    Issue.findById = () => mockIssue;

    await assert.rejects(
      () =>
        updateIssueStatus(
          mockIssue._id,
          { status: "In Progress" },
          { role: "authority", _id: "authority-1", department: "Pothole" }
        ),
      (error) => {
        assert.equal(error.statusCode, 403);
        return true;
      }
    );
  } finally {
    Issue.findById = originalFindById;
  }
});

test("assignIssue records the assignment in statusHistory", async () => {
  const Issue = require("../models/issueModel");
  const User = require("../models/userModel");
  const originalFindById = Issue.findById;
  const originalUserFindById = User.findById;
  const authorityId = new (require("mongoose").Types.ObjectId)().toString();
  const mockIssue = makeMockIssue({ status: "Pending", assignedTo: null });

  try {
    Issue.findById = () => mockIssue;
    User.findById = () => ({
      select: async () => ({ role: "authority", department: "Pothole", active: true }),
    });

    const updated = await assignIssue(mockIssue._id, authorityId, {
      role: "authority",
      _id: authorityId,
      department: "Pothole",
    });

    assert.equal(updated.status, "Assigned");
    assert.equal(updated.assignedTo, authorityId);
    assert.equal(updated.statusHistory.length, 1);
    assert.equal(updated.statusHistory[0].status, "Assigned");
    assert.equal(updated.statusHistory[0].changedBy, authorityId);
  } finally {
    Issue.findById = originalFindById;
    User.findById = originalUserFindById;
  }
});

// Regression test for the "Assignee must be an active authority user" bug:
// assignIssue's User.findById(...).select(...) call MUST include "active"
// in its projection. A real Mongoose .select() only returns the fields you
// ask for - if "active" is ever dropped from that projection again,
// assignee.active silently comes back as undefined (falsy) for every user,
// so this would reject the assignment even for an authority the Admin
// Dashboard shows as Active. Unlike the test above (whose mock always
// returns active:true regardless of the requested fields and so cannot
// catch this), this mock honors the requested field list like real
// Mongoose projections do.
test("assignIssue succeeds for an active authority when User.select() only returns requested fields", async () => {
  const Issue = require("../models/issueModel");
  const User = require("../models/userModel");
  const originalFindById = Issue.findById;
  const originalUserFindById = User.findById;
  const authorityId = new (require("mongoose").Types.ObjectId)().toString();
  const mockIssue = makeMockIssue({ status: "Pending", assignedTo: null });
  const fullAuthorityRecord = { role: "authority", department: "Pothole", active: true, name: "Pothole Authority", email: "pothole.authority@smartcity.com" };

  try {
    Issue.findById = () => mockIssue;
    User.findById = () => ({
      // Mimics real Mongoose: only fields named in .select(...) are present
      // on the returned document; anything else is undefined.
      select: async (fields) => {
        const requested = String(fields).split(/\s+/).filter(Boolean);
        const projected = {};
        for (const field of requested) projected[field] = fullAuthorityRecord[field];
        return projected;
      },
    });

    const updated = await assignIssue(mockIssue._id, authorityId, {
      role: "authority",
      _id: authorityId,
      department: "Pothole",
    });

    assert.equal(updated.status, "Assigned");
    assert.equal(updated.assignedTo, authorityId);
  } finally {
    Issue.findById = originalFindById;
    User.findById = originalUserFindById;
  }
});

test("assignIssue rejects assignment when the assignee's active field isn't projected (regression guard)", async () => {
  const Issue = require("../models/issueModel");
  const User = require("../models/userModel");
  const originalFindById = Issue.findById;
  const originalUserFindById = User.findById;
  const authorityId = new (require("mongoose").Types.ObjectId)().toString();
  const mockIssue = makeMockIssue({ status: "Pending", assignedTo: null });

  try {
    Issue.findById = () => mockIssue;
    // Simulates the old, buggy .select("role department") projection that
    // omitted "active" entirely.
    User.findById = () => ({
      select: async () => ({ role: "authority", department: "Pothole" }),
    });

    await assert.rejects(
      () =>
        assignIssue(mockIssue._id, authorityId, {
          role: "authority",
          _id: authorityId,
          department: "Pothole",
        }),
      (error) => {
        assert.match(error.message, /active authority user/);
        return true;
      }
    );
  } finally {
    Issue.findById = originalFindById;
    User.findById = originalUserFindById;
  }
});

// Real, reported bug: a Pothole issue (Pending, assignedDepartment: "Pothole")
// was not appearing in the Pothole authority's dashboard. Pins down the exact
// mapping and query-scoping this depends on, end to end.
test("getDepartment maps Pothole to the Pothole authority", () => {
  assert.equal(getDepartment("Pothole"), "Pothole");
});

test("fetchIssuesForAuthority returns a Pending, unassigned Pothole issue to its authority", async () => {
  const Issue = require("../models/issueModel");
  const originalFind = Issue.find;
  const potholeIssue = {
    _id: "issue-pothole-1",
    category: "Pothole",
    assignedDepartment: getDepartment("Pothole"),
    status: "Pending",
    assignedTo: null,
  };

  const chain = {
    populate: () => chain,
    sort: async () => [potholeIssue],
  };

  let capturedQuery = null;

  try {
    Issue.find = (query) => {
      capturedQuery = query;
      return chain;
    };

    const results = await fetchIssuesForAuthority({
      role: "authority",
      _id: "authority-1",
      department: "Pothole",
    });

    assert.equal(capturedQuery.assignedDepartment, "Pothole");
    assert.equal(results.length, 1);
    assert.equal(results[0].category, "Pothole");
    assert.equal(results[0].status, "Pending");
  } finally {
    Issue.find = originalFind;
  }
});

test("fetchIssuesForAuthority does not leak a Pothole issue to a Garbage authority", async () => {
  const Issue = require("../models/issueModel");
  const originalFind = Issue.find;

  const chain = {
    populate: () => chain,
    // The mock still records what query it was called with; a real
    // MongoDB query with assignedDepartment: "Garbage" would correctly
    // exclude the Pothole issue, which is exactly what this test verifies
    // was actually requested.
    sort: async () => [],
  };

  let capturedQuery = null;

  try {
    Issue.find = (query) => {
      capturedQuery = query;
      return chain;
    };

    const results = await fetchIssuesForAuthority({
      role: "authority",
      _id: "authority-2",
      department: "Garbage",
    });

    assert.equal(capturedQuery.assignedDepartment, "Garbage");
    assert.notEqual(capturedQuery.assignedDepartment, "Pothole");
    assert.equal(results.length, 0);
  } finally {
    Issue.find = originalFind;
  }
});
