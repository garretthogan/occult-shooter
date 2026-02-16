/**
 * 2D grid pathfinding for NPC navigation.
 * Builds walkability grid from world geometry; A* finds paths.
 */

import * as THREE from 'three';
import { Raycaster } from 'three';
import { PATHFINDING } from './config.js';

const DOWN = new THREE.Vector3(0, -1, 0);
const RAY_ORIGIN = new THREE.Vector3();
const HEIGHT_ROUNDING = 100;
const FLOOR_EPSILON = 0.05;

function roundHeight(value) {
  return Math.round(value * HEIGHT_ROUNDING) / HEIGHT_ROUNDING;
}

function hasStandingClearance(intersects, floorHeight) {
  const requiredClearance = PATHFINDING.AGENT_HEIGHT ?? 1.4;
  const minBlockingY = floorHeight + FLOOR_EPSILON;
  const maxBlockingY = floorHeight + requiredClearance - FLOOR_EPSILON;

  return !intersects.some((hit) => {
    if (hit.object?.userData?.ignoreForWalkability === true) {
      return false;
    }
    const y = hit.point.y;
    return y > minBlockingY && y < maxBlockingY;
  });
}

/**
 * Builds a walkability grid by raycasting down at each cell.
 *
 * @param {THREE.Object3D} worldGroup - World geometry to sample
 * @param {{ cellSize?: number, bounds?: THREE.Box3 }} [options]
 * @returns {{ grid: boolean[][], floorY: number[][], cellSize: number, minX: number, minZ: number, cols: number, rows: number }}
 */
export function buildWalkabilityGrid(worldGroup, options = {}) {
  const cellSize = options.cellSize ?? PATHFINDING.CELL_SIZE;

  const box = new THREE.Box3().setFromObject(worldGroup);
  const minX = Math.floor(box.min.x / cellSize) * cellSize;
  const minZ = Math.floor(box.min.z / cellSize) * cellSize;
  const maxX = Math.ceil(box.max.x / cellSize) * cellSize;
  const maxZ = Math.ceil(box.max.z / cellSize) * cellSize;

  const cols = Math.round((maxX - minX) / cellSize) || 1;
  const rows = Math.round((maxZ - minZ) / cellSize) || 1;

  const grid = [];
  const floorY = [];

  const raycaster = new Raycaster();
  raycaster.far = 20;

  const normal = new THREE.Vector3();

  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    floorY[r] = [];
    for (let c = 0; c < cols; c++) {
      const x = minX + (c + 0.5) * cellSize;
      const z = minZ + (r + 0.5) * cellSize;

      RAY_ORIGIN.set(x, 10, z);
      raycaster.set(RAY_ORIGIN, DOWN);

      const intersects = raycaster.intersectObject(worldGroup, true);

      const floorHeights = new Set();
      for (const hit of intersects) {
        if (hit.object?.userData?.ignoreForWalkability === true) {
          continue;
        }
        if (hit.normal != null) {
          normal.copy(hit.normal);
        } else if (hit.face != null) {
          normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
        } else {
          normal.set(0, 1, 0);
        }
        if (normal.y >= PATHFINDING.MIN_WALKABLE_NORMAL_Y) {
          const floorHeight = roundHeight(hit.point.y);
          if (hasStandingClearance(intersects, floorHeight)) {
            floorHeights.add(floorHeight);
          }
        }
      }
      const floors = [...floorHeights].sort((a, b) => a - b);
      const walkable = floors.length > 0;
      grid[r][c] = walkable;
      floorY[r][c] = floors;
    }
  }

  return {
    grid,
    floorY,
    cellSize,
    minX,
    minZ,
    cols,
    rows,
  };
}

/**
 * Converts world XZ to grid cell indices.
 */
export function worldToCell(gridData, x, z) {
  const c = Math.floor((x - gridData.minX) / gridData.cellSize);
  const r = Math.floor((z - gridData.minZ) / gridData.cellSize);
  return { r, c };
}

/**
 * Converts grid cell to world XZ center. Uses first (lowest) floor if floors is array.
 */
export function cellToWorld(gridData, r, c, floorIndex = 0) {
  const x = gridData.minX + (c + 0.5) * gridData.cellSize;
  const z = gridData.minZ + (r + 0.5) * gridData.cellSize;
  const floors = gridData.floorY[r]?.[c];
  const y = Array.isArray(floors)
    ? (floors[floorIndex] ?? floors[0] ?? 0)
    : (floors ?? 0);
  return { x, z, y };
}

function getFloors(gridData, r, c) {
  const f = gridData.floorY[r]?.[c];
  return Array.isArray(f) ? f : (f != null ? [f] : []);
}

/**
 * Checks if cell is valid and walkable.
 */
function isWalkable(gridData, r, c) {
  if (r < 0 || r >= gridData.rows || c < 0 || c >= gridData.cols) return false;
  return gridData.grid[r][c] === true;
}

/**
 * Returns the lowest floor height at (x, z), or 0 if no walkable floor.
 */
export function getFloorAt(gridData, x, z) {
  const { r, c } = worldToCell(gridData, x, z);
  const floors = getFloors(gridData, r, c);
  return floors.length > 0 ? floors[0] : 0;
}

/**
 * Returns true if (x, z) is in a walkable cell with a floor within step height of feetY.
 * Used to avoid repelling NPC off platforms.
 */
export function isOnWalkableAt(gridData, x, z, feetY) {
  const { r, c } = worldToCell(gridData, x, z);
  if (!isWalkable(gridData, r, c)) return false;
  const floors = getFloors(gridData, r, c);
  const maxStepUp = PATHFINDING.MAX_STEP_UP ?? 0.5;
  const maxStepDown = PATHFINDING.MAX_STEP_DOWN ?? 1.5;
  return floors.some(
    (h) => h - feetY <= maxStepUp && h - feetY >= -maxStepDown
  );
}

const NEIGHBORS_8 = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

/**
 * A* pathfinding with height awareness. Supports multiple floors per cell (ground, stairs, platforms).
 * Returns array of world positions { x, z, y }.
 *
 * @param {ReturnType<typeof buildWalkabilityGrid>} gridData
 * @param {number} fromX
 * @param {number} fromZ
 * @param {number} toX
 * @param {number} toZ
 * @param {number} [targetFloorY] - Floor height at target; used to prefer end cells at similar height
 * @param {number} [fromY] - NPC feet Y; used to pick start floor when cell has multiple
 * @returns {{ x: number, z: number, y: number }[]}
 */
export function findPath(gridData, fromX, fromZ, toX, toZ, targetFloorY, fromY) {
  const start = worldToCell(gridData, fromX, fromZ);
  let end = worldToCell(gridData, toX, toZ);

  if (!isWalkable(gridData, start.r, start.c)) {
    const nearest = nearestWalkable(gridData, start.r, start.c);
    if (nearest == null) return [];
    start.r = nearest.r;
    start.c = nearest.c;
  }

  const endFloorsForCheck = getFloors(gridData, end.r, end.c);
  const endHasTargetFloor =
    targetFloorY != null &&
    endFloorsForCheck.some((h) => Math.abs(h - targetFloorY) < 0.5);

  if (
    !isWalkable(gridData, end.r, end.c) ||
    (targetFloorY != null && !endHasTargetFloor)
  ) {
    const nearest =
      targetFloorY != null
        ? nearestWalkableNearHeight(
            gridData,
            end.r,
            end.c,
            targetFloorY,
            12
          )
        : nearestWalkable(gridData, end.r, end.c);
    if (nearest == null) return [];
    end = nearest;
  }

  const startFloors = getFloors(gridData, start.r, start.c);
  const npcFeetY = fromY ?? startFloors[0] ?? 0;
  const startHeight = startFloors.length > 0
    ? (() => {
        const atOrBelow = startFloors.filter((h) => h <= npcFeetY + 0.05);
        const candidates = atOrBelow.length > 0 ? atOrBelow : startFloors;
        return candidates.reduce((best, h) =>
          Math.abs(h - npcFeetY) < Math.abs(best - npcFeetY) ? h : best
        , candidates[0]);
      })()
    : 0;

  const endFloors = getFloors(gridData, end.r, end.c);
  const targetEndHeight =
    targetFloorY != null && endFloors.length > 0
      ? endFloors.reduce((best, h) =>
          Math.abs(h - targetFloorY) < Math.abs(best - targetFloorY) ? h : best
        , endFloors[0])
      : null;

  const maxStepUp = PATHFINDING.MAX_STEP_UP ?? 0.5;
  const maxStepDown = PATHFINDING.MAX_STEP_DOWN ?? 1.5;

  const open = [{ r: start.r, c: start.c, h: startHeight, g: 0, hCost: 0, f: 0, parent: null }];
  const closed = new Set();
  const key = (r, c, h) => `${r},${c},${h.toFixed(3)}`;
  const openByKey = new Map();
  openByKey.set(key(start.r, start.c, startHeight), open[0]);

  const heuristic = (r, c) => {
    const dr = Math.abs(r - end.r);
    const dc = Math.abs(c - end.c);
    return Math.max(dr, dc) + (Math.SQRT2 - 1) * Math.min(dr, dc);
  };

  const canStep = (fromH, toH) => {
    const delta = toH - fromH;
    return delta <= maxStepUp && delta >= -maxStepDown;
  };


  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIndex].f) {
        bestIndex = i;
      }
    }
    const current = open.splice(bestIndex, 1)[0];
    openByKey.delete(key(current.r, current.c, current.h));
    const k = key(current.r, current.c, current.h);
    if (closed.has(k)) continue;
    closed.add(k);

    const reachedEndCell = current.r === end.r && current.c === end.c;
    const reachedTargetFloor =
      targetEndHeight == null ||
      Math.abs(current.h - targetEndHeight) < 0.02;

    if (reachedEndCell && reachedTargetFloor) {
      const path = [];
      let node = current;
      while (node != null) {
        const floors = getFloors(gridData, node.r, node.c);
        const idx = floors.indexOf(node.h);
        const w = cellToWorld(gridData, node.r, node.c, idx >= 0 ? idx : 0);
        path.unshift(w);
        node = node.parent;
      }
      return path;
    }

    for (const [dr, dc] of NEIGHBORS_8) {
      const nr = current.r + dr;
      const nc = current.c + dc;
      if (!isWalkable(gridData, nr, nc)) continue;

      if (dr !== 0 && dc !== 0) {
        const rowNeighborWalkable = isWalkable(gridData, current.r + dr, current.c);
        const colNeighborWalkable = isWalkable(gridData, current.r, current.c + dc);
        if (!rowNeighborWalkable || !colNeighborWalkable) continue;
      }

      const toFloors = getFloors(gridData, nr, nc);
      for (const toH of toFloors) {
        if (!canStep(current.h, toH)) continue;

        const nk = key(nr, nc, toH);
        if (closed.has(nk)) continue;

        const cost = dr !== 0 && dc !== 0 ? Math.SQRT2 : 1;
        const g = current.g + cost;
        const hCost = heuristic(nr, nc);
        const f = g + hCost;
        const existing = openByKey.get(nk);
        if (existing != null) {
          if (g < existing.g) {
            existing.g = g;
            existing.hCost = hCost;
            existing.f = f;
            existing.parent = current;
          }
          continue;
        }

        const node = { r: nr, c: nc, h: toH, g, hCost, f, parent: current };
        open.push(node);
        openByKey.set(nk, node);
      }
    }
  }

  return [];
}

function nearestWalkable(gridData, r, c, maxRadius = 5) {
  for (let rad = 0; rad <= maxRadius; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (isWalkable(gridData, nr, nc)) return { r: nr, c: nc };
      }
    }
  }
  return null;
}

function nearestWalkableNearHeight(gridData, r, c, targetFloorY, maxRadius = 8, heightTolerance = 0.6) {
  let best = null;
  let bestDist = Infinity;
  let bestHeightDiff = Infinity;

  for (let rad = 0; rad <= maxRadius; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.abs(dr) !== rad && Math.abs(dc) !== rad) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (!isWalkable(gridData, nr, nc)) continue;

        const floors = getFloors(gridData, nr, nc);
        const heightDiff = floors.length > 0
          ? Math.min(...floors.map((h) => Math.abs(h - targetFloorY)))
          : Infinity;
        const dist = Math.abs(dr) + Math.abs(dc);

        if (heightDiff <= heightTolerance && (heightDiff < bestHeightDiff || (heightDiff === bestHeightDiff && dist < bestDist))) {
          best = { r: nr, c: nc };
          bestDist = dist;
          bestHeightDiff = heightDiff;
        } else if (best == null) {
          best = { r: nr, c: nc };
          bestDist = dist;
          bestHeightDiff = heightDiff;
        }
      }
    }
    if (best != null && bestHeightDiff <= heightTolerance) break;
  }

  return best;
}
