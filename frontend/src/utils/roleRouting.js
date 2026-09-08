// Centralizes the "which page does this role land on after login" mapping
// used by Login.jsx, so App.jsx's route table and Login.jsx's redirect
// can't silently drift apart, and so this logic is testable as a plain
// function (see roleRouting.test.js).
export const ROLE_HOME_ROUTES = {
  administrator: "/admin",
  authority: "/authority",
  citizen: "/dashboard",
};

export function getPostLoginRedirect(role) {
  return ROLE_HOME_ROUTES[role] || "/dashboard";
}
