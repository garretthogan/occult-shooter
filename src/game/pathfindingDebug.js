/**
 * Debug visuals for pathfinding: grid and path.
 * Dev-only; toggled via scene panel.
 */

import * as THREE from 'three';

const WALKABLE_COLOR = 0x00ff88;
const BLOCKED_COLOR = 0xff4444;
const GRID_LINE_COLOR = 0x333333;
const PATH_COLOR = 0x00ff00;
const MARKER_HEIGHT = 0.15;

function createLine(x1, y1, z1, x2, y2, z2, color) {
  const geom = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x1, y1, z1),
    new THREE.Vector3(x2, y2, z2),
  ]);
  return new THREE.Line(geom, new THREE.LineBasicMaterial({ color }));
}

/**
 * Creates debug visuals for the pathfinding grid and current path.
 *
 * @param {THREE.Scene} scene
 * @param {ReturnType<typeof import('./pathfinding.js').buildWalkabilityGrid>} gridData
 * @param {() => { x: number, z: number, y: number }[]} getPath - Returns current NPC path
 * @returns {{ group: THREE.Group, update: () => void, setVisible: (v: boolean) => void }}
 */
export function createPathfindingDebug(scene, gridData, getPath) {
  const group = new THREE.Group();
  group.name = 'pathfinding-debug';
  scene.add(group);

  const cellSize = gridData.cellSize;
  const minX = gridData.minX;
  const minZ = gridData.minZ;

  function getFloors(r, c) {
    const f = gridData.floorY[r]?.[c];
    return Array.isArray(f) ? f : (f != null ? [f] : []);
  }

  for (let r = 0; r < gridData.rows; r++) {
    for (let c = 0; c < gridData.cols; c++) {
      const floors = getFloors(r, c);
      const color = gridData.grid[r]?.[c] ? WALKABLE_COLOR : BLOCKED_COLOR;
      for (const y of floors) {
        const x = minX + (c + 0.5) * cellSize;
        const z = minZ + (r + 0.5) * cellSize;
        group.add(createLine(x, y, z, x, y + MARKER_HEIGHT, z, color));

        const x0 = minX + c * cellSize;
        const z0 = minZ + r * cellSize;
        const x1 = minX + (c + 1) * cellSize;
        const z1 = minZ + (r + 1) * cellSize;
        const o = 0.01;
        group.add(createLine(x0, y + o, z0, x1, y + o, z0, GRID_LINE_COLOR));
        group.add(createLine(x1, y + o, z0, x1, y + o, z1, GRID_LINE_COLOR));
        group.add(createLine(x1, y + o, z1, x0, y + o, z1, GRID_LINE_COLOR));
        group.add(createLine(x0, y + o, z1, x0, y + o, z0, GRID_LINE_COLOR));
      }
    }
  }

  const pathLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: PATH_COLOR, linewidth: 2 })
  );
  pathLine.frustumCulled = false;
  group.add(pathLine);

  function update() {
    const path = getPath();
    if (path.length < 2) {
      pathLine.visible = false;
      return;
    }
    pathLine.visible = true;
    const points = path.map((p) => new THREE.Vector3(p.x, p.y + 0.05, p.z));
    pathLine.geometry.setFromPoints(points);
    pathLine.geometry.attributes.position.needsUpdate = true;
  }

  function setVisible(visible) {
    group.visible = visible;
  }

  return { group, update, setVisible };
}
