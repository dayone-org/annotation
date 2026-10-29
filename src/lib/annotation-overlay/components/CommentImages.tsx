import { CaretLeftIcon, CaretRightIcon, XIcon } from "@phosphor-icons/react";
import { Dialog } from "radix-ui";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AnnotationImage } from "../types";

// Squares of one size under the comment text (also for a single image), from the thumbs; a click opens the
// large view, which loads the image itself.
export function CommentImages({
  images,
  portalContainer,
}: {
  images: AnnotationImage[];
  portalContainer: Element | DocumentFragment | null;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // No Dialog.Trigger (one dialog for all squares): focus goes back to the square that opened it.
  const opener = useRef<HTMLButtonElement | null>(null);
  if (!images.length) {
    return null;
  }
  const count = images.length;
  const label = (index: number) => `Image ${index + 1} of ${count}`;
  const step = (delta: number) =>
    setOpenIndex((index) => (index === null ? null : (index + delta + count) % count));
  const open = openIndex === null ? null : images[openIndex];

  return (
    <div className="annotation:flex annotation:flex-wrap annotation:gap-2">
      {images.map((image, index) => (
        <button
          aria-label={`Open ${label(index).toLowerCase()}`}
          className="annotation:size-18 annotation:overflow-hidden annotation:rounded-md annotation:border annotation:border-border annotation:bg-muted annotation:p-0 annotation:outline-none annotation:focus-visible:ring-2 annotation:focus-visible:ring-ring"
          key={image.path}
          onClick={(event) => {
            opener.current = event.currentTarget;
            setOpenIndex(index);
          }}
          type="button"
        >
          <img
            alt=""
            className="annotation:size-full annotation:object-cover"
            decoding="async"
            height={image.height}
            loading="lazy"
            src={image.thumbUrl}
            width={image.width}
          />
        </button>
      ))}
      <Dialog.Root onOpenChange={(isOpen) => !isOpen && setOpenIndex(null)} open={open !== null}>
        <Dialog.Portal container={portalContainer}>
          <Dialog.Overlay
            className="annotation:fixed annotation:inset-0 annotation:z-2147483605 annotation:bg-black/80"
            data-annotation-overlay-root="true"
          />
          {open && openIndex !== null ? (
            <Dialog.Content
              aria-describedby={undefined}
              className="annotation:fixed annotation:top-1/2 annotation:left-1/2 annotation:z-2147483605 annotation:flex annotation:-translate-x-1/2 annotation:-translate-y-1/2 annotation:items-center annotation:gap-2 annotation:outline-none"
              data-annotation-image-viewer="true"
              data-annotation-overlay-root="true"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                opener.current?.focus();
              }}
              onKeyDown={(event) => {
                if (count > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
                  event.preventDefault();
                  step(event.key === "ArrowLeft" ? -1 : 1);
                }
              }}
            >
              <Dialog.Title className="annotation:sr-only">{label(openIndex)}</Dialog.Title>
              {count > 1 ? (
                <Button
                  aria-label="Previous image"
                  onClick={() => step(-1)}
                  size="icon"
                  variant="secondary"
                >
                  <CaretLeftIcon />
                </Button>
              ) : null}
              {/* The dialog title names the image. */}
              <img
                alt=""
                className="annotation:h-auto annotation:max-h-[85vh] annotation:w-auto annotation:max-w-[min(85vw,1600px)] annotation:rounded-md annotation:object-contain annotation:shadow-2xl"
                height={open.height}
                src={open.url}
                width={open.width}
              />
              {count > 1 ? (
                <Button
                  aria-label="Next image"
                  onClick={() => step(1)}
                  size="icon"
                  variant="secondary"
                >
                  <CaretRightIcon />
                </Button>
              ) : null}
              <Dialog.Close asChild>
                <Button
                  aria-label="Close"
                  className="annotation:absolute annotation:-top-10 annotation:right-0"
                  size="icon"
                  variant="secondary"
                >
                  <XIcon />
                </Button>
              </Dialog.Close>
            </Dialog.Content>
          ) : null}
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
