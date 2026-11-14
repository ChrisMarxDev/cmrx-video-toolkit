import React, { useEffect, useRef, useState } from "react";
import type { Asset, Clip } from "./model";
import type { MediaPreview } from "./media-preview";
const cache = new Map<string, Promise<MediaPreview>>();

export function ClipMedia({
  clip,
  asset,
  zoom,
  url,
}: {
  clip: Clip;
  asset?: Asset;
  zoom: number;
  url: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [media, setMedia] = useState<MediaPreview | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const key = JSON.stringify([url, asset?.path, asset?.duration, asset?.audio]);
  useEffect(() => {
    let active = true;
    setMedia(null);
    setImage(null);
    setFailed(false);
    let request = cache.get(key);
    if (!request) {
      request = fetch(url).then(async (response) => {
        if (!response.ok) throw Error("Preview unavailable");
        return response.json() as Promise<MediaPreview>;
      });
      cache.set(key, request);
      request.catch(() => cache.delete(key));
    }
    request
      .then((data) => {
        if (!active) return;
        setMedia(data);
        if (data.sprite) {
          const img = new Image();
          img.onload = () => {
            if (active) setImage(img);
          };
          img.onerror = () => {
            if (active) setFailed(true);
          };
          img.src = data.sprite;
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [key]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !media) return;
    const width = Math.max(12, clip.duration * zoom);
    el.width = Math.min(4096, Math.ceil(width));
    el.height = 50;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, el.width, 50);
    ctx.fillStyle = asset ? "#c9ddf2" : "#b9a8cc";
    ctx.fillRect(0, 0, el.width, 50);
    const ratio = el.width / width;
    const tileWidth = Math.max((50 * 96) / 54, width / 120) * ratio;
    if (image)
      for (let x = 0; x < el.width; x += tileWidth) {
        const sourceTime = clip.in + (x / el.width) * clip.duration;
        const index =
          (media.offset || 0) +
          Math.max(
            0,
            Math.min(
              media.count - 1,
              Math.floor(
                (sourceTime - (media.sourceStart || 0)) / media.interval,
              ),
            ),
          );
        ctx.drawImage(
          image,
          (index % media.columns) * 96,
          Math.floor(index / media.columns) * 54,
          96,
          54,
          x,
          0,
          tileWidth,
          50,
        );
      }
    if (media.peaks) {
      ctx.fillStyle = "#c6e2db";
      ctx.fillRect(0, 34, el.width, 16);
      ctx.fillStyle = clip.muted ? "#647c78" : "#215d51";
      ctx.globalAlpha = clip.muted ? 0.45 : 1;
      for (let x = 0; x < el.width; x++) {
        const from = Math.floor(
          (clip.in -
            (media.sourceStart || 0) +
            (x / el.width) * clip.duration) *
            media.peakRate,
        );
        const to = Math.ceil(
          (clip.in -
            (media.sourceStart || 0) +
            ((x + 1) / el.width) * clip.duration) *
            media.peakRate,
        );
        let peak = 0;
        for (let n = from; n < to; n++)
          peak = Math.max(peak, media.peaks[n] ?? 0);
        const height = Math.max(1, peak * 14);
        ctx.fillRect(x, 42 - height / 2, 1, height);
      }
      ctx.globalAlpha = 1;
    }
  }, [media, image, clip.in, clip.duration, clip.muted, zoom, asset]);
  const error = failed || !!media?.errors.length;
  return (
    <>
      <canvas
        ref={canvas}
        className="clip-media"
        aria-hidden="true"
        data-ready={!!media && (!media.sprite || !!image)}
        data-source-in={clip.in}
        data-waveform={!!media?.peaks}
      />
      {(!media || error) && (
        <span
          className="media-status"
          title={
            error
              ? media?.errors.join("; ") || "Media preview unavailable"
              : "Loading media preview"
          }
        >
          {error ? "!" : "…"}
        </span>
      )}
    </>
  );
}
