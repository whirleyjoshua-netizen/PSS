"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { MAX_PIXEL_RATIO, PNG_DATA_URL_MAX } from "@/lib/portal/adoption-limits";

/**
 * A drawing pad (spec §4). It uses pointer events, so a finger, a pen or a mouse all draw, and
 * `touch-none` so drawing never scrolls the page. The bitmap is sized on the first stroke from the
 * pad's laid-out size, at a pixel ratio capped at 2, so the PNG stays within the server's
 * 1200 x 400. The strokes become a transparent PNG data URL, carried by a required text input: an
 * empty pad blocks the submit. Rendered only after hydration, so JavaScript-off never meets it.
 */
export function SignaturePad({ name, label, maxWidth, maxHeight, value, onChange }: {
  name: string;
  /** "Signature" or "Initials": the canvas is "<label> pad", the button "Clear <label>". */
  label: string;
  maxWidth: number;
  maxHeight: number;
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // The pointer drawing the current stroke, or null. A second finger neither extends nor ends it.
  const active = useRef<number | null>(null);
  const carrier = useRef<HTMLInputElement>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const lower = label.toLowerCase();

  // An empty pad blocks the submit; the browser's bubble then says what to do, not "fill in this field".
  useEffect(() => {
    carrier.current?.setCustomValidity(value ? "" : `Draw your ${lower}`);
  }, [value, lower]);

  const context = (element: HTMLCanvasElement) => {
    if (element.dataset.sized !== "1") {
      const rect = element.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      element.width = Math.max(1, Math.round(Math.min(rect.width, maxWidth) * ratio));
      element.height = Math.max(1, Math.round(Math.min(rect.height, maxHeight) * ratio));
      element.dataset.sized = "1";
    }
    const ctx = element.getContext("2d");
    if (ctx) {
      const rect = element.getBoundingClientRect();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2.5 * (rect.width ? element.width / rect.width : 1);
    }
    return ctx;
  };

  // Where the pointer is, in bitmap pixels: the pad may be laid out at any size.
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (rect.width ? element.width / rect.width : 1),
      y: (event.clientY - rect.top) * (rect.height ? element.height / rect.height : 1),
    };
  };

  const clear = () => {
    const element = canvas.current;
    if (element) element.getContext("2d")?.clearRect(0, 0, element.width, element.height);
    onChange("");
  };

  const start = (event: PointerEvent<HTMLCanvasElement>) => {
    if (active.current !== null) return;
    const ctx = context(event.currentTarget);
    if (!ctx) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    active.current = event.pointerId;
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y); // a tap leaves a dot
    ctx.stroke();
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (active.current !== event.pointerId) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    event.preventDefault();
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = (event: PointerEvent<HTMLCanvasElement>) => {
    if (active.current !== event.pointerId || !canvas.current) return;
    active.current = null;
    const url = canvas.current.toDataURL("image/png");
    // The server refuses anything longer (lib/portal/adoption.ts): say so here, not after the post.
    if (url.length > PNG_DATA_URL_MAX) {
      setTooLarge(true);
      clear();
      return;
    }
    setTooLarge(false);
    onChange(url);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm">Draw your {lower}</span>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${label} pad`}
        className="w-full touch-none border border-rule bg-ivory"
        style={{ maxWidth, aspectRatio: `${maxWidth} / ${maxHeight}` }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setTooLarge(false);
            clear();
          }}
          className="min-h-11 text-sm underline underline-offset-4"
        >
          Clear {lower}
        </button>
        {tooLarge ? <p role="alert" className="text-sm">That {lower} is too detailed to send. Clear it and draw it a little simpler.</p> : null}
      </div>
      {/* Carries the drawing. Required and NOT read-only (a read-only input is never validated), so an
          empty pad blocks the submit. Hidden from assistive tech and the tab order: the pad is the control. */}
      <input
        ref={carrier}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        value={value}
        onChange={() => {}}
        required
      />
    </div>
  );
}
