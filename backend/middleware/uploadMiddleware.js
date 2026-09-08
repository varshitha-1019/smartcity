const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Upload directory
const uploadPath = path.resolve(__dirname, "../uploads");

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${extension}`;

    cb(null, uniqueName);
  },
});

// Allowed image extensions
const allowedExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
];

// Allowed MIME types
const allowedMimeTypes = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

// Validate uploaded file
const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  const extensionValid = allowedExtensions.includes(extension);
  const mimeValid = allowedMimeTypes.includes(file.mimetype);

  if (!extensionValid) {
    return cb(
      new Error(
        "Invalid file extension. Please upload JPG, JPEG, PNG or WEBP images."
      ),
      false
    );
  }

  if (!mimeValid) {
    return cb(
      new Error(
        "Invalid image format. Please upload JPG, JPEG, PNG or WEBP images."
      ),
      false
    );
  }

  cb(null, true);
};

// Multer configuration
const upload = multer({
  storage,

  fileFilter,

  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
});

module.exports = upload;