const fs = require("fs/promises");
const path = require("path");

const ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
];

function hasImageSignature(buffer) {
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isPng =
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(
        Buffer.from([
          0x89,
          0x50,
          0x4e,
          0x47,
          0x0d,
          0x0a,
          0x1a,
          0x0a,
        ])
      );

  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";

  return isJpeg || isPng || isWebp;
}

async function validateStoredImage(imagePath) {
  if (!imagePath) {
    const error = new Error("Image file is required.");
    error.statusCode = 400;
    throw error;
  }

  const extension = path.extname(imagePath).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    const error = new Error(
      "File is not a valid image (unsupported format)."
    );
    error.statusCode = 400;
    throw error;
  }

  const handle = await fs.open(imagePath, "r");

  try {
    const buffer = Buffer.alloc(32);

    const { bytesRead } = await handle.read(
      buffer,
      0,
      buffer.length,
      0
    );

    if (!hasImageSignature(buffer.subarray(0, bytesRead))) {
      const error = new Error(
        "File is not a valid image (unrecognized content)."
      );
      error.statusCode = 400;
      throw error;
    }

    const stats = await handle.stat();

    if (stats.size === 0) {
      const error = new Error("Uploaded image is empty.");
      error.statusCode = 400;
      throw error;
    }

    if (stats.size > 10 * 1024 * 1024) {
      const error = new Error(
        "Image size exceeds the 10 MB limit."
      );
      error.statusCode = 400;
      throw error;
    }
  } finally {
    await handle.close();
  }
}

async function removeUploadedFile(imagePath) {
  if (!imagePath) return;

  try {
    await fs.unlink(imagePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(
        "Could not remove rejected upload:",
        error.message
      );
    }
  }
}

module.exports = {
  validateStoredImage,
  removeUploadedFile,
};