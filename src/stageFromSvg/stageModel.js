/**
 * Shared SVG stage model utilities for preview and gameplay worlds.
 */

import * as THREE from 'three';
import { decodeSvgMetadata } from '../shared/svgMetadata.js';

const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.2;
const ROOF_THICKNESS = 0.24;
const DOOR_HEIGHT = 2.2;
const WINDOW_SILL_HEIGHT = 1;
const WINDOW_HEIGHT = 1.1;
const WINDOW_GLASS_THICKNESS = 0.04;
const LANDSCAPE_MARGIN = 42;
const TREE_CLEARANCE = 6;
const TREE_OUTER_PADDING = 5;
const TREE_MAX_COUNT = 56;

function decodeFloorPlanMetadata(svgElement) {
  const parsed = decodeSvgMetadata(svgElement);
  if (parsed == null || !Array.isArray(parsed?.rooms)) return null;
  return {
    seed: Number.isFinite(Number(parsed.seed)) ? Number(parsed.seed) : null,
    padding: Number(parsed.padding) || 0,
    rooms: parsed.rooms,
    hallways: Array.isArray(parsed.hallways) ? parsed.hallways : [],
    furniture: Array.isArray(parsed.furniture) ? parsed.furniture : [],
    npcSpawns: Array.isArray(parsed.npcSpawns) ? parsed.npcSpawns : [],
    playerStart: parsed.playerStart ?? null,
  };
}

function parseNumberAttribute(element, name) {
  const raw = element.getAttribute(name);
  if (raw == null) {
    throw new Error(`Missing ${name} attribute on SVG line.`);
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${name} value: ${raw}`);
  }
  return value;
}

function hasClass(element, className) {
  const value = element.getAttribute('class') ?? '';
  return value.split(/\s+/).includes(className);
}

export function parseFloorPlanSvg(svgText) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(svgText, 'image/svg+xml');
  const parserError = documentNode.querySelector('parsererror');
  if (parserError != null) {
    throw new Error('The selected file is not a valid SVG document.');
  }

  const svgElement = documentNode.querySelector('svg');
  if (svgElement == null) {
    throw new Error('SVG root element not found.');
  }

  const viewBoxRaw = svgElement.getAttribute('viewBox');
  if (viewBoxRaw == null) {
    throw new Error('SVG must define a viewBox.');
  }
  const viewBoxParts = viewBoxRaw.trim().split(/\s+/).map(Number);
  if (viewBoxParts.length !== 4 || viewBoxParts.some((value) => !Number.isFinite(value))) {
    throw new Error('SVG viewBox must contain four numeric values.');
  }

  const [, , planWidth, planHeight] = viewBoxParts;
  const toWorldX = (x) => x - planWidth / 2;
  const toWorldZ = (y) => y - planHeight / 2;

  const allLines = [...svgElement.querySelectorAll('line')];
  const walls = [];
  const doors = [];
  const windows = [];

  for (const line of allLines) {
    const lineData = {
      x1: parseNumberAttribute(line, 'x1'),
      y1: parseNumberAttribute(line, 'y1'),
      x2: parseNumberAttribute(line, 'x2'),
      y2: parseNumberAttribute(line, 'y2'),
    };
    const segment = {
      x1: toWorldX(lineData.x1),
      z1: toWorldZ(lineData.y1),
      x2: toWorldX(lineData.x2),
      z2: toWorldZ(lineData.y2),
    };

    if (hasClass(line, 'wall')) {
      walls.push(segment);
    } else if (hasClass(line, 'door')) {
      doors.push(segment);
    } else if (hasClass(line, 'window')) {
      windows.push(segment);
    }
  }

  if (walls.length === 0) {
    throw new Error('No wall segments found. Import an SVG produced by the floor plan generator.');
  }

  const metadata = decodeFloorPlanMetadata(svgElement);
  const padding = metadata?.padding ?? 0;
  const fromPlanToWorldX = (planX) => planX + padding - planWidth / 2;
  const fromPlanToWorldZ = (planY) => planY + padding - planHeight / 2;
  const playerStart =
    metadata?.playerStart != null &&
    Number.isFinite(Number(metadata.playerStart.x)) &&
    Number.isFinite(Number(metadata.playerStart.y))
      ? {
          x: fromPlanToWorldX(Number(metadata.playerStart.x)),
          z: fromPlanToWorldZ(Number(metadata.playerStart.y)),
        }
      : null;
  const furniture = Array.isArray(metadata?.furniture)
    ? metadata.furniture
      .map((item, index) => {
        const x = Number(item.x);
        const y = Number(item.y);
        const width = Number(item.width);
        const depth = Number(item.depth);
        const height = Number(item.height);
        const type = String(item.type ?? 'table');
        const shape = String(item.shape ?? 'rect');
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(width) ||
          !Number.isFinite(depth) ||
          !Number.isFinite(height)
        ) {
          return null;
        }
        return {
          id: item.id ?? `legacy-${index + 1}`,
          metaIndex: index,
          roomId: item.roomId ?? null,
          type,
          shape,
          width,
          depth,
          height,
          x: fromPlanToWorldX(x),
          z: fromPlanToWorldZ(y),
        };
      })
      .filter((item) => item != null)
    : [];
  const npcSpawns = Array.isArray(metadata?.npcSpawns)
    ? metadata.npcSpawns
      .map((item) => {
        const x = Number(item?.x);
        const y = Number(item?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return {
          id: item.id ?? null,
          x: fromPlanToWorldX(x),
          z: fromPlanToWorldZ(y),
        };
      })
      .filter((item) => item != null)
    : [];
  const roofCellKeys = new Set();
  if (Array.isArray(metadata?.rooms)) {
    for (const room of metadata.rooms) {
      if (!Array.isArray(room?.cells)) continue;
      for (const cell of room.cells) {
        const x = Number(cell?.x);
        const y = Number(cell?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        roofCellKeys.add(`${x},${y}`);
      }
    }
  }
  if (Array.isArray(metadata?.hallways)) {
    for (const hallway of metadata.hallways) {
      if (!Array.isArray(hallway?.cells)) continue;
      for (const cell of hallway.cells) {
        const x = Number(cell?.x);
        const y = Number(cell?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        roofCellKeys.add(`${x},${y}`);
      }
    }
  }
  const roofCells = [...roofCellKeys].map((key) => {
    const [xRaw, yRaw] = key.split(',');
    const x = Number(xRaw);
    const y = Number(yRaw);
    return {
      x: fromPlanToWorldX(x + 0.5),
      z: fromPlanToWorldZ(y + 0.5),
    };
  });

  return {
    seed: metadata?.seed ?? null,
    width: planWidth,
    height: planHeight,
    walls,
    doors,
    windows,
    furniture,
    playerStart,
    npcSpawns,
    roofCells,
  };
}

function createSegmentMesh(segment, thickness, height, material, baseY = 0) {
  const dx = segment.x2 - segment.x1;
  const dz = segment.z2 - segment.z1;
  const length = Math.hypot(dx, dz);
  if (length < 0.01) {
    return null;
  }

  const geometry = new THREE.BoxGeometry(length, height, thickness);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    (segment.x1 + segment.x2) / 2,
    baseY + height / 2,
    (segment.z1 + segment.z2) / 2
  );
  mesh.rotation.y = Math.atan2(dz, dx);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addWindowBlockingGeometry(group, windowSegments, wallMaterial) {
  const lowerHeight = WINDOW_SILL_HEIGHT;
  const upperBaseY = WINDOW_SILL_HEIGHT + WINDOW_HEIGHT;
  const upperHeight = WALL_HEIGHT - upperBaseY;

  for (const windowSegment of windowSegments) {
    if (lowerHeight > 0) {
      const lowerBlock = createSegmentMesh(
        windowSegment,
        WALL_THICKNESS,
        lowerHeight,
        wallMaterial,
        0
      );
      if (lowerBlock != null) {
        group.add(lowerBlock);
      }
    }

    if (upperHeight > 0) {
      const upperBlock = createSegmentMesh(
        windowSegment,
        WALL_THICKNESS,
        upperHeight,
        wallMaterial,
        upperBaseY
      );
      if (upperBlock != null) {
        group.add(upperBlock);
      }
    }
  }
}

function addDoorLintelGeometry(group, doorSegments, wallMaterial) {
  const lintelBaseY = DOOR_HEIGHT;
  const lintelHeight = WALL_HEIGHT - lintelBaseY;
  if (lintelHeight <= 0) return;

  for (const doorSegment of doorSegments) {
    const lintel = createSegmentMesh(
      doorSegment,
      WALL_THICKNESS,
      lintelHeight,
      wallMaterial,
      lintelBaseY
    );
    if (lintel != null) {
      group.add(lintel);
    }
  }
}

function addWindowGlassGeometry(group, windowSegments) {
  if (!Array.isArray(windowSegments) || windowSegments.length === 0) {
    return;
  }

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xbfe7ff,
    transmission: 1,
    opacity: 1,
    transparent: true,
    roughness: 0.02,
    metalness: 0,
    ior: 1.5,
    thickness: 0.2,
    dispersion: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
  });

  for (const windowSegment of windowSegments) {
    const glassPane = createSegmentMesh(
      windowSegment,
      WINDOW_GLASS_THICKNESS,
      WINDOW_HEIGHT,
      glassMaterial,
      WINDOW_SILL_HEIGHT
    );
    if (glassPane != null) {
      glassPane.castShadow = false;
      glassPane.receiveShadow = true;
      glassPane.userData = {
        kind: 'windowGlass',
        shattered: false,
      };
      group.add(glassPane);
    }
  }
}

function addFurnitureMeshes(group, stageData) {
  if (!Array.isArray(stageData.furniture) || stageData.furniture.length === 0) {
    return;
  }

  const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x8b6a43, roughness: 0.72 });
  const chairMaterial = new THREE.MeshStandardMaterial({ color: 0x6a5942, roughness: 0.78 });
  const bedMaterial = new THREE.MeshStandardMaterial({ color: 0x74839c, roughness: 0.74 });
  const couchMaterial = new THREE.MeshStandardMaterial({ color: 0x4e657f, roughness: 0.7 });
  const armoireMaterial = new THREE.MeshStandardMaterial({ color: 0x564230, roughness: 0.78 });
  const materialByType = {
    table: tableMaterial,
    chair: chairMaterial,
    bed: bedMaterial,
    couch: couchMaterial,
    armoire: armoireMaterial,
  };

  for (const item of stageData.furniture) {
    const material = materialByType[item.type] ?? tableMaterial;
    let mesh;
    if (item.shape === 'circle') {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(item.width / 2, item.width / 2, item.height, 16),
        material
      );
      mesh.position.set(item.x, item.height / 2, item.z);
    } else {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(item.width, item.height, item.depth),
        material
      );
      mesh.position.set(item.x, item.height / 2, item.z);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = {
      kind: 'furniture',
      id: item.id ?? null,
      metaIndex: item.metaIndex ?? null,
      width: item.width,
      depth: item.depth,
      height: item.height,
      shape: item.shape,
      type: item.type,
    };
    group.add(mesh);
  }
}

function createSeededRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function randomRange(rng, min, max) {
  return min + rng() * (max - min);
}

function resolveStageFootprint(stageData) {
  const segments = [...(stageData.walls ?? []), ...(stageData.doors ?? []), ...(stageData.windows ?? [])];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const segment of segments) {
    minX = Math.min(minX, segment.x1, segment.x2);
    maxX = Math.max(maxX, segment.x1, segment.x2);
    minZ = Math.min(minZ, segment.z1, segment.z2);
    maxZ = Math.max(maxZ, segment.z1, segment.z2);
  }

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minZ) ||
    !Number.isFinite(maxZ)
  ) {
    return {
      centerX: 0,
      centerZ: 0,
      width: stageData.width,
      height: stageData.height,
    };
  }

  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxZ - minZ),
  };
}

function addSurroundingLandscape(group, stageData, stageFootprint) {
  const outerWidth = stageData.width + LANDSCAPE_MARGIN * 2;
  const outerHeight = stageData.height + LANDSCAPE_MARGIN * 2;
  const landscape = new THREE.Mesh(
    new THREE.PlaneGeometry(outerWidth, outerHeight),
    new THREE.MeshStandardMaterial({ color: 0x253a28, roughness: 0.98 })
  );
  landscape.rotation.x = -Math.PI / 2;
  landscape.position.set(stageFootprint.centerX, -0.02, stageFootprint.centerZ);
  landscape.receiveShadow = true;
  group.add(landscape);
}

function addSurroundingTrees(group, stageData, stageFootprint) {
  const halfWidth = stageData.width / 2;
  const halfHeight = stageData.height / 2;
  const innerX = halfWidth + TREE_CLEARANCE;
  const innerZ = halfHeight + TREE_CLEARANCE;
  const outerX = halfWidth + LANDSCAPE_MARGIN - TREE_OUTER_PADDING;
  const outerZ = halfHeight + LANDSCAPE_MARGIN - TREE_OUTER_PADDING;
  const areaEstimate = (outerX * outerZ - innerX * innerZ) * 4;
  const treeCount = Math.max(18, Math.min(TREE_MAX_COUNT, Math.floor(areaEstimate / 52)));

  const seedBase =
    Math.floor(stageData.width * 97) ^
    Math.floor(stageData.height * 193) ^
    Math.floor((stageData.walls?.length ?? 0) * 17);
  const rng = createSeededRng(seedBase);

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5b452e, roughness: 0.92 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x3a6b3f, roughness: 0.84 });

  const isInsideInnerBounds = (x, z) =>
    Math.abs(x - stageFootprint.centerX) < innerX && Math.abs(z - stageFootprint.centerZ) < innerZ;

  for (let index = 0; index < treeCount; index++) {
    let x = 0;
    let z = 0;
    let found = false;
    for (let attempt = 0; attempt < 16; attempt++) {
      x = randomRange(rng, stageFootprint.centerX - outerX, stageFootprint.centerX + outerX);
      z = randomRange(rng, stageFootprint.centerZ - outerZ, stageFootprint.centerZ + outerZ);
      if (!isInsideInnerBounds(x, z)) {
        found = true;
        break;
      }
    }
    if (!found) continue;

    const trunkHeight = randomRange(rng, 2.2, 3.6);
    const trunkRadius = randomRange(rng, 0.16, 0.24);
    const canopyRadius = randomRange(rng, 0.9, 1.5);
    const canopyHeight = randomRange(rng, 1.8, 2.8);

    const tree = new THREE.Group();
    tree.position.set(x, 0, z);

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(trunkRadius * 0.8, trunkRadius, trunkHeight, 8),
      trunkMaterial
    );
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(canopyRadius, canopyHeight, 9),
      leafMaterial
    );
    canopy.position.y = trunkHeight + canopyHeight * 0.45;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    tree.add(canopy);

    group.add(tree);
  }
}

function addRoofGeometry(group, stageData, material, stageFootprint) {
  if (Array.isArray(stageData.roofCells) && stageData.roofCells.length > 0) {
    for (const cell of stageData.roofCells) {
      const roofTile = new THREE.Mesh(
        new THREE.BoxGeometry(1.02, ROOF_THICKNESS, 1.02),
        material
      );
      roofTile.position.set(cell.x, WALL_HEIGHT + ROOF_THICKNESS / 2, cell.z);
      roofTile.castShadow = true;
      roofTile.receiveShadow = true;
      roofTile.name = 'stage-roof-tile';
      roofTile.userData = {
        kind: 'roof',
        ignoreForWalkability: true,
      };
      group.add(roofTile);
    }
    return;
  }

  const fallbackRoof = new THREE.Mesh(
    new THREE.BoxGeometry(stageData.width, ROOF_THICKNESS, stageData.height),
    material
  );
  fallbackRoof.position.set(
    stageFootprint.centerX,
    WALL_HEIGHT + ROOF_THICKNESS / 2,
    stageFootprint.centerZ
  );
  fallbackRoof.castShadow = true;
  fallbackRoof.receiveShadow = true;
  fallbackRoof.name = 'stage-roof';
  fallbackRoof.userData = {
    kind: 'roof',
    ignoreForWalkability: true,
  };
  group.add(fallbackRoof);
}

export function buildStageGroup(stageData, options = {}) {
  const mode = options.mode ?? 'preview';
  const includeLandscape = options.includeLandscape ?? mode !== 'preview';
  const includeTrees = options.includeTrees ?? (mode !== 'preview' && mode !== 'collision');
  const includeWindowGlass = options.includeWindowGlass ?? true;
  const includeFurniture = options.includeFurniture ?? true;
  const stageFootprint = resolveStageFootprint(stageData);
  const group = new THREE.Group();
  group.name = 'svg-stage';

  const floorGeometry = new THREE.PlaneGeometry(stageData.width, stageData.height);
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x2f3f32, roughness: 0.95 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(stageFootprint.centerX, 0, stageFootprint.centerZ);
  floor.receiveShadow = true;
  group.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xd9dee4, roughness: 0.85 });
  for (const wallSegment of stageData.walls) {
    const wall = createSegmentMesh(wallSegment, WALL_THICKNESS, WALL_HEIGHT, wallMaterial, 0);
    if (wall != null) {
      group.add(wall);
    }
  }
  addDoorLintelGeometry(group, stageData.doors, wallMaterial);

  if (mode !== 'preview') {
    addRoofGeometry(group, stageData, floorMaterial, stageFootprint);
  }

  addWindowBlockingGeometry(group, stageData.windows, wallMaterial);
  if (includeWindowGlass) {
    addWindowGlassGeometry(group, stageData.windows);
  }
  if (includeFurniture) {
    addFurnitureMeshes(group, stageData);
  }

  if (includeLandscape) {
    addSurroundingLandscape(group, stageData, stageFootprint);
  }
  if (includeTrees) {
    addSurroundingTrees(group, stageData, stageFootprint);
  }

  if (mode !== 'preview') {
    return group;
  }

  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x4fd37a, roughness: 0.6 });
  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x56b6ff, roughness: 0.3 });

  for (const doorSegment of stageData.doors) {
    const doorMarker = createSegmentMesh(
      doorSegment,
      WALL_THICKNESS * 0.55,
      DOOR_HEIGHT,
      doorMaterial,
      0
    );
    if (doorMarker != null) {
      group.add(doorMarker);
    }
  }

  // Keep thin window edge markers in preview to aid readability around transparent glass.
  for (const windowSegment of stageData.windows) {
    const windowMarker = createSegmentMesh(
      windowSegment,
      WALL_THICKNESS * 0.12,
      WINDOW_HEIGHT,
      windowMaterial,
      WINDOW_SILL_HEIGHT
    );
    if (windowMarker != null) {
      group.add(windowMarker);
    }
  }

  return group;
}
