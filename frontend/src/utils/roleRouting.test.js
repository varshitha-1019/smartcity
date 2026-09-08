import test from "node:test";
import assert from "node:assert/strict";

import { getPostLoginRedirect } from "./roleRouting.js";

test("administrator is routed to /admin", () => {
  assert.equal(getPostLoginRedirect("administrator"), "/admin");
});

test("authority is routed to /authority", () => {
  assert.equal(getPostLoginRedirect("authority"), "/authority");
});

test("citizen is routed to /dashboard", () => {
  assert.equal(getPostLoginRedirect("citizen"), "/dashboard");
});

test("an unrecognized role falls back to /dashboard rather than throwing", () => {
  assert.equal(getPostLoginRedirect("not-a-real-role"), "/dashboard");
});
