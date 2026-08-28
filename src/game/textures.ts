import Phaser from "phaser";

function alphaBounds(image: HTMLImageElement | HTMLCanvasElement): { x: number; y: number; width: number; height: number } {
  const source = image as CanvasImageSource;
  const width = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const height = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, width, height };
  ctx.drawImage(source, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width, height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function createCroppedTexture(
  scene: Phaser.Scene,
  originalKey: string,
  targetKey: string,
  fixedBounds?: { x: number; y: number; width: number; height: number },
): void {
  const texture = scene.textures.get(originalKey);
  const image = texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const bounds = fixedBounds ?? alphaBounds(image);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, bounds.width);
  canvas.height = Math.max(1, bounds.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
  if (scene.textures.exists(targetKey)) scene.textures.remove(targetKey);
  scene.textures.addCanvas(targetKey, canvas);
}

export function unionBounds(bounds: Array<{ x: number; y: number; width: number; height: number }>): { x: number; y: number; width: number; height: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const b of bounds) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function sourceBounds(scene: Phaser.Scene, key: string): { x: number; y: number; width: number; height: number } {
  const texture = scene.textures.get(key);
  return alphaBounds(texture.getSourceImage() as HTMLImageElement);
}
