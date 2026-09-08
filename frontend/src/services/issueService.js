import { apiRequest } from "./api";

export const createIssue = async (
  image,
  token,
  priority = "Medium",
  locationData = null
) => {
  const formData = new FormData();

  formData.append("image", image);

  if (priority) {
    formData.append("priority", priority);
  }

  if (locationData) {
    if (locationData.latitude !== undefined) {
      formData.append("latitude", locationData.latitude);
    }

    if (locationData.longitude !== undefined) {
      formData.append("longitude", locationData.longitude);
    }

    if (locationData.accuracy !== undefined && locationData.accuracy !== null) {
      formData.append("accuracy", locationData.accuracy);
    }

    if (locationData.captureTimestamp) {
      formData.append(
        "captureTimestamp",
        locationData.captureTimestamp
      );
    }

    if (locationData.source) {
      formData.append("source", locationData.source);
    }

    if (locationData.address) {
      formData.append("address", locationData.address);
    }

    if (locationData.isManual || locationData.source === "manual") {
      formData.append("isManual", "true");
    }
  }


  return apiRequest("/issues", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
};

// Live, read-only address preview for a set of coordinates - used by the
// Report Issue form to show the resolved address before submission. Never
// throws on failure; the form should just fall back to showing raw
// coordinates instead of blocking the user.
export const previewAddress = async (latitude, longitude, token) => {
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
    });

    const data = await apiRequest(`/issues/geocode/preview?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return data.address || null;
  } catch {
    return null;
  }
};

// Live, read-only location preview for a just-selected file - mirrors the
// backend's EXIF-first GPS resolution (EXIF GPS from the image itself when
// present, browser/device GPS only as a fallback), so the Report Issue form
// can show the citizen the location that will actually be used before they
// submit. Never throws on failure; callers should fall back to whatever
// browser location they already have instead of blocking the user.
export const previewImageLocation = async (file, browserLocation, token) => {
  const formData = new FormData();
  formData.append("image", file);

  if (browserLocation?.latitude !== undefined && browserLocation?.latitude !== null) {
    formData.append("latitude", browserLocation.latitude);
    formData.append("longitude", browserLocation.longitude);
    if (browserLocation.accuracy !== undefined && browserLocation.accuracy !== null) {
      formData.append("accuracy", browserLocation.accuracy);
    }
    if (browserLocation.captureTimestamp) {
      formData.append("captureTimestamp", browserLocation.captureTimestamp);
    }
  }

  return apiRequest("/issues/geocode/preview-image", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
};

export const previewPrediction = async (file, token) => {
  const formData = new FormData();
  formData.append("image", file);

  return apiRequest("/issues/predict-preview", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
};

export const getMyIssues = async (token) => {
  return apiRequest("/issues/my", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const getAllIssues = async (token) => {
  return apiRequest("/issues", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const getIssueById = async (issueId, token) => {
  return apiRequest(`/issues/${issueId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const getIssuesByStatus = async (status, token) => {
  return apiRequest(`/issues/status/${encodeURIComponent(status)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const getIssuesByCategory = async (category, token) => {
  return apiRequest(`/issues/category/${encodeURIComponent(category)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const getIssuesByDepartment = async (department, token) => {
  return apiRequest(
    `/issues/department/${encodeURIComponent(department)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
};

export const updateIssueStatus = async (
  issueId,
  { status, remarks, completionProofFile, evidenceLocation } = {},
  token
) => {
  const formData = new FormData();

  if (status) {
    formData.append("status", status);
  }

  if (remarks !== undefined && remarks !== null && remarks !== "") {
    formData.append("remarks", remarks);
  }

  if (completionProofFile) {
    formData.append("completionProof", completionProofFile);

    // Browser/device GPS captured at the moment the authority attached the
    // evidence photo - only ever used as a fallback: the backend always
    // prefers EXIF GPS embedded in the evidence image itself when present.
    if (evidenceLocation?.latitude !== undefined && evidenceLocation?.latitude !== null) {
      formData.append("latitude", evidenceLocation.latitude);
      formData.append("longitude", evidenceLocation.longitude);
      if (evidenceLocation.accuracy !== undefined && evidenceLocation.accuracy !== null) {
        formData.append("accuracy", evidenceLocation.accuracy);
      }
      if (evidenceLocation.captureTimestamp) {
        formData.append("captureTimestamp", evidenceLocation.captureTimestamp);
      }
    }
  }

  return apiRequest(`/issues/${issueId}/status`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
};

export const assignIssue = async (
  issueId,
  assignedTo,
  token
) => {
  return apiRequest(`/issues/${issueId}/assign`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ assignedTo }),
  });
};

export const getDashboardStats = async (token) => {
  return apiRequest("/dashboard/stats", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const getRecentIssues = async (token) => {
  return apiRequest("/dashboard/recent", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};

export const getDepartmentStats = async (token) => {
  return apiRequest("/dashboard/departments", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};