import annotationStyles from "../../index.css?inline";

const STYLE_ELEMENT_ID = "dayone-annotation-styles";

export function ensureAnnotationStyles() {
  if (typeof document === "undefined") {
    return;
  }

  const existingStyle = document.getElementById(STYLE_ELEMENT_ID);
  if (existingStyle instanceof HTMLStyleElement) {
    return;
  }

  const styleElement = document.createElement("style");
  styleElement.id = STYLE_ELEMENT_ID;
  styleElement.setAttribute("data-dayone-annotation", "true");
  styleElement.textContent = annotationStyles;
  document.head.appendChild(styleElement);
}
