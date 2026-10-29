// Images on comments: the browser shrinks each picked file before it is uploaded to the bucket.
export const IMAGE_BUCKET = "comment-images";
export const MAX_IMAGES = 5;
export const MAX_PICK_BYTES = 10 * 1024 * 1024;
// The bucket and the upload policy refuse more.
export const MAX_STORED_BYTES = 5 * 1024 * 1024;
export const MAX_SIDE = 1600;
export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const QUALITIES = [0.82, 0.6, 0.4];

export type PreparedImage = {
  blob: Blob;
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
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Image could not be read.");
  }
  const draw = (background?: string) => {
    context.clearRect(0, 0, width, height);
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(bitmap, 0, 0, width, height);
  };
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  try {
    draw();
    // Safari cannot write WebP and silently returns PNG; JPEG then, on white (no transparency).
    let type = "image/webp";
    let blob = await encode(type, QUALITIES[0]);
    if (blob?.type !== type) {
      type = "image/jpeg";
      draw("#fff");
      blob = await encode(type, QUALITIES[0]);
    }
    for (const quality of QUALITIES.slice(1)) {
      if (!blob || blob.size <= MAX_STORED_BYTES) {
        break;
      }
      blob = await encode(type, quality);
    }
    if (!blob || blob.type !== type || blob.size > MAX_STORED_BYTES) {
      throw new Error("Image could not be compressed.");
    }
    return { blob, width, height, extension: type === "image/webp" ? "webp" : "jpg" };
  } finally {
    bitmap.close();
  }
}
