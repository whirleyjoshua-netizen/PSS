/**
 * Cropping a drawn signature to its ink (spec §4). The pad's blank margins would otherwise be part of
 * the PNG, and the stamp scales the whole image into its box, so the drawing would come out small.
 * Pure, so it is safe in a client component and testable without a real canvas.
 */

/** Device pixels kept around the ink, so the anti-aliased edge of a stroke is never cut. */
export const INK_PADDING = 4;

export type InkBox = { x: number; y: number; width: number; height: number };

/**
 * The smallest box holding every pixel with any opacity, grown by `padding` on each side and kept
 * inside the bitmap. Null when nothing is drawn. Colour is ignored: the pad is transparent, and only
 * the alpha channel says where the ink is.
 */
export function inkBounds(image: Pick<ImageData, "data" | "width" | "height">, padding = INK_PADDING): InkBox | null {
  const { data, width, height } = image;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
    }
  }
  if (right < 0) return null;
  const x = Math.max(0, left - padding);
  const y = Math.max(0, top - padding);
  return { x, y, width: Math.min(width - 1, right + padding) - x + 1, height: Math.min(height - 1, bottom + padding) - y + 1 };
}
