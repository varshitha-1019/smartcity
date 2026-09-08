const { CATEGORY_DEPARTMENT_MAP, AUTHORITY_EMAIL_MAP } = require("../constants/issueCategories");

function getDepartment(category) {
  const department = CATEGORY_DEPARTMENT_MAP[category];

  if (!department) {
    throw new Error(`Unsupported issue category: ${category}`);
  }

  return department;
}

module.exports = {
  getDepartment,
  getAuthorityEmail: (category) => AUTHORITY_EMAIL_MAP[category] || null,
};
