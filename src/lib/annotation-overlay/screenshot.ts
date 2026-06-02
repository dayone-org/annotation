import html2canvas from "html2canvas";
import type { AnnotationScreenshot } from "./types";

const SCREENSHOT_QUALITY = 0.76;
const SCREENSHOT_SCALE = 1;

type ViewportCanvasOptions = {
  foreignObjectRendering: boolean;
};

export class ScreenshotCaptureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ScreenshotCaptureError";
  }
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDataUrlSize(dataUrl: string): number {
  const [, payload = ""] = dataUrl.split(",", 2);
  return Math.ceil((payload.length * 3) / 4);
}

function sanitizeCloneColors(clonedDocument: Document) {
  const style = clonedDocument.createElement("style");
  style.setAttribute("data-annotation-screenshot-sanitize", "true");
  style.textContent = `
    * {
      border-color: rgb(229, 229, 229) !important;
      box-shadow: none !important;
      outline-color: rgb(24, 24, 27) !important;
      text-shadow: none !important;
    }

    html,
    body {
      background: rgb(255, 255, 255) !important;
      color: rgb(24, 24, 27) !important;
    }
  `;
  clonedDocument.head.appendChild(style);
}

function renderViewportCanvas({ foreignObjectRendering }: ViewportCanvasOptions) {
  return html2canvas(document.body, {
    backgroundColor: "#ffffff",
    foreignObjectRendering,
    height: window.innerHeight,
    ignoreElements: (element) => element.hasAttribute("data-annotation-overlay-root"),
    logging: false,
    scale: SCREENSHOT_SCALE,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    useCORS: true,
    width: window.innerWidth,
    windowHeight: window.innerHeight,
    windowWidth: window.innerWidth,
    x: window.scrollX,
    y: window.scrollY,
    onclone: sanitizeCloneColors,
  });
}

export async function captureViewportScreenshot(): Promise<AnnotationScreenshot> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new ScreenshotCaptureError("Screenshot capture is only available in the browser.");
  }

  const capturedAt = new Date().toISOString();
  const canvas = await renderViewportCanvas({ foreignObjectRendering: true }).catch(
    async (error: unknown) => {
      try {
        return await renderViewportCanvas({ foreignObjectRendering: false });
      } catch (fallbackError) {
        throw new ScreenshotCaptureError("Could not capture screenshot.", {
          cause: fallbackError ?? error,
        });
      }
    },
  );
  const dataUrl = canvas.toDataURL("image/jpeg", SCREENSHOT_QUALITY);

  return {
    id: createId(),
    name: `viewport-${capturedAt}.jpg`,
    type: "image/jpeg",
    size: getDataUrlSize(dataUrl),
    data_url: dataUrl,
    created_at: capturedAt,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scroll_x: window.scrollX,
      scroll_y: window.scrollY,
      device_pixel_ratio: window.devicePixelRatio,
    },
  };
}
