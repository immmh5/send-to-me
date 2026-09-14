import sharp from "sharp";

/**
 * Builds a fast-loading WebP thumbnail (max 900px) from an in-memory buffer.
 * Best-effort: null means "no thumbnail" (corrupt image, unsupported codec,
 * enormous source) and the client then simply shows the original file.
 */
export async function makeThumbBuffer(input: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(input, { failOn: "none" })
      .rotate() // respect EXIF orientation
      .resize(900, 900, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 76 })
      .toBuffer();
  } catch {
    return null;
  }
}
