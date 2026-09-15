"use client";

import { useEffect, useRef } from "react";

const reducedMotion = () =>
  typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Champagne, sand and charcoal — the site's palette (see app/globals.css @theme). */
const COLORS = ["#CDB891", "#E7E1D6", "#1E1E1E"];
const PIECE_COUNT = 140;
const DURATION_MS = 2000;

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  shape: "rect" | "circle";
};

function makePiece(width: number): Piece {
  return {
    x: Math.random() * width,
    y: -20 - Math.random() * 200,
    vx: (Math.random() - 0.5) * 120,
    vy: 140 + Math.random() * 160,
    size: 4 + Math.random() * 6,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 6,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    shape: Math.random() < 0.5 ? "rect" : "circle",
  };
}

/**
 * A short confetti burst on mount. Falls in champagne, sand and charcoal, then
 * clears itself after ~2s so there is no lingering overlay. Always renders the
 * same aria-hidden, pointer-events-none canvas on the server and the first
 * client render (avoiding a hydration mismatch); the reduced-motion check runs
 * inside the effect, before any animation starts, so reduced-motion visitors
 * get an empty canvas and no listeners. Never throws if canvas isn't
 * available (jsdom).
 */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (reducedMotion()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const pieces = Array.from({ length: PIECE_COUNT }, () => makePiece(width));

    let raf = 0;
    let start: number | null = null;
    let lastTime = 0;

    const tick = (time: number) => {
      if (start === null) start = time;
      const elapsed = time - start;
      const dt = lastTime ? (time - lastTime) / 1000 : 0;
      lastTime = time;

      if (elapsed >= DURATION_MS) {
        ctx.clearRect(0, 0, width, height);
        return;
      }

      ctx.clearRect(0, 0, width, height);
      for (const piece of pieces) {
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.rotation += piece.spin * dt;

        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rotation);
        ctx.fillStyle = piece.color;
        if (piece.shape === "rect") {
          ctx.fillRect(-piece.size / 2, -piece.size / 3, piece.size, (piece.size * 2) / 3);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, piece.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, width, height);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50"
    />
  );
}
