"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ImgHTMLAttributes,
  type MouseEvent,
} from "react";
import { ImageOff, RotateCcw } from "lucide-react";
import {
  getMediaUrl,
  getReliableImageSources,
  type MediaReference,
} from "@/lib/media";

type ReliableImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "onError"
> & {
  reference: MediaReference;
  fallbackClassName?: string;
  fallbackLabel?: string;
  onOpen?: (url: string) => void;
};

export default function ReliableImage({
  reference,
  fallbackClassName = "w-40 h-32 rounded-lg bg-gray-200 text-gray-500",
  fallbackLabel = "Image unavailable · Tap to retry",
  onOpen,
  onClick,
  alt = "Shared image",
  ...imageProps
}: ReliableImageProps) {
  const referenceUrl = getMediaUrl(reference);
  const [retryToken, setRetryToken] = useState(0);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const sources = useMemo(
    () => getReliableImageSources(referenceUrl, retryToken),
    [referenceUrl, retryToken],
  );

  useEffect(() => {
    setSourceIndex(0);
    setFailed(false);
  }, [referenceUrl, retryToken]);

  const retry = () => {
    setSourceIndex(0);
    setFailed(false);
    setRetryToken(Date.now());
  };

  if (!sources.length || failed) {
    return (
      <button
        type="button"
        onClick={retry}
        className={`${fallbackClassName} flex flex-col items-center justify-center gap-2 text-xs transition-colors hover:brightness-95`}
        aria-label="Retry loading image"
      >
        {sources.length ? (
          <RotateCcw className="h-5 w-5" aria-hidden="true" />
        ) : (
          <ImageOff className="h-5 w-5" aria-hidden="true" />
        )}
        <span>{fallbackLabel}</span>
      </button>
    );
  }

  return (
    <img
      {...imageProps}
      src={sources[sourceIndex]}
      alt={alt}
      loading={imageProps.loading || "lazy"}
      decoding={imageProps.decoding || "async"}
      onClick={(event: MouseEvent<HTMLImageElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) onOpen?.(referenceUrl);
      }}
      onError={() => {
        if (sourceIndex + 1 < sources.length) {
          setSourceIndex((current) => current + 1);
          return;
        }
        console.warn("[ReliableImage] All media sources failed", {
          reference: referenceUrl,
          attempts: sources.length,
        });
        setFailed(true);
      }}
    />
  );
}
