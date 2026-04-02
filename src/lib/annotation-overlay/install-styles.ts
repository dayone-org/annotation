import annotationStyles from "../../index.css?inline";

const STYLE_ELEMENT_ID = "dayone-annotation-styles";

export function ensureAnnotationStyles(root: Document | ShadowRoot) {
  if (typeof document === "undefined") {
    return;
  }

  const existingStyle = root.querySelector(`#${STYLE_ELEMENT_ID}`);
  if (existingStyle instanceof HTMLStyleElement) {
    return;
  }

  const ownerDocument = root instanceof Document ? root : root.ownerDocument;
  const styleElement = ownerDocument.createElement("style");
  styleElement.id = STYLE_ELEMENT_ID;
  styleElement.setAttribute("data-dayone-annotation", "true");
  styleElement.textContent = annotationStyles;

  if (root instanceof Document) {
    root.head.appendChild(styleElement);
    return;
  }

  root.appendChild(styleElement);
}
