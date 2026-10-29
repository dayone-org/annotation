// Images on comments: the browser shrinks each picked file before it is uploaded to the bucket.
export const IMAGE_BUCKET = "comment-images";
export const MAX_IMAGES = 5;
const MAX_PICK_BYTES = 10 * 1024 * 1024;
// The bucket and the upload policy refuse more.
const MAX_STORED_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 1600;
// Thumb for the squares under a comment (4.5 rem, sharp at 2x); a thread loads only these.
const THUMB_SIDE = 144;
export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const QUALITIES = [0.82, 0.6, 0.4];

export type PreparedImage = {
  blob: Blob;
  /** Same type, longest side at most 144 px. */
  thumb: Blob;
  width: number;
  height: number;
  extension: "webp" | "jpg";
};

// Longest side at most `max`, never scaled up.
export function fitWithin(width: number, height: number, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Random UUID v4 for the file name. crypto.randomUUID is missing outside secure contexts (http other than
// localhost) and before Safari 15.4; getRandomValues is not.
export function randomUuid(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function imageUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${IMAGE_BUCKET}/${path}`;
}

// Throws an Error with a message for the composer.
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error("PNG, JPG, WebP or GIF");
  }
  if (file.size > MAX_PICK_BYTES) {
    throw new Error("Max. 10 MB");
  }
  // A GIF becomes its first frame.
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Image could not be read.");
  });
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const thumbSize = fitWithin(width, height, THUMB_SIDE);
  const draw = (size: { width: number; height: number }, background?: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Image could not be read.");
    }
    context.imageSmoothingQuality = "high";
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, size.width, size.height);
    }
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return canvas;
  };
  const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  try {
    // Safari cannot write WebP and silently returns PNG; JPEG then, on white (no transparency).
    let type = "image/webp";
    let canvas = draw({ width, height });
    let blob = await encode(canvas, type, QUALITIES[0]);
    if (blob?.type !== type) {
      type = "image/jpeg";
      canvas = draw({ width, height }, "#fff");
      blob = await encode(canvas, type, QUALITIES[0]);
    }
    for (const quality of QUALITIES.slice(1)) {
      if (!blob || blob.size <= MAX_STORED_BYTES) {
        break;
      }
      blob = await encode(canvas, type, quality);
    }
    const thumb = await encode(
      draw(thumbSize, type === "image/jpeg" ? "#fff" : undefined),
      type,
      QUALITIES[0],
    );
    if (!blob || blob.type !== type || blob.size > MAX_STORED_BYTES || thumb?.type !== type) {
      throw new Error("Image could not be compressed.");
    }
    return { blob, thumb, width, height, extension: type === "image/webp" ? "webp" : "jpg" };
  } finally {
    bitmap.close();
  }
}
