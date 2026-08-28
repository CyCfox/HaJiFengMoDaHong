export interface MapObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MAP_WORLD_WIDTH = 1024;
export const MAP_WORLD_HEIGHT = 1024;
export const MAP_SPAWN_MARGIN = 28;
export const DAM_BOTTOM_Y = 404;

// 坝体底部以上的整片区域都禁止进入，避免从两侧绕入。
export const MAP_OBSTACLES: MapObstacle[] = [
  { x: 0, y: 0, width: MAP_WORLD_WIDTH, height: DAM_BOTTOM_Y },
];
