/**
 * World geometry and Octree collision structure.
 * Supports procedural levels and optional GLB loading for future expansion.
 */

import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { parseFloorPlanSvg, buildStageGroup } from '../stageFromSvg/stageModel.js';

/** Default procedural level size (half-extents). */
const LEVEL_SIZE = 25;
const FLOOR_THICKNESS = 1;
const WALL_HEIGHT = 8;

/**
 * Creates a procedural room (floor + walls) for collision.
 * @returns {{ group: THREE.Group, octree: Octree }}
 */
export function createProceduralWorld() {
  const group = new THREE.Group();

  const floorGeometry = new THREE.BoxGeometry(
    LEVEL_SIZE * 2,
    FLOOR_THICKNESS,
    LEVEL_SIZE * 2
  );
  const wallMaterial = new THREE.MeshLambertMaterial({ color: 0x88aa88 });
  const floorMaterial = new THREE.MeshLambertMaterial({ color: 0x668866 });

  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.name = 'floor';
  floor.position.y = -FLOOR_THICKNESS / 2;
  floor.receiveShadow = true;
  floor.castShadow = true;
  group.add(floor);

  const wallGeometries = [
    { size: [LEVEL_SIZE * 2, WALL_HEIGHT, FLOOR_THICKNESS], pos: [0, WALL_HEIGHT / 2 - FLOOR_THICKNESS / 2, LEVEL_SIZE] },
    { size: [LEVEL_SIZE * 2, WALL_HEIGHT, FLOOR_THICKNESS], pos: [0, WALL_HEIGHT / 2 - FLOOR_THICKNESS / 2, -LEVEL_SIZE] },
    { size: [FLOOR_THICKNESS, WALL_HEIGHT, LEVEL_SIZE * 2], pos: [LEVEL_SIZE, WALL_HEIGHT / 2 - FLOOR_THICKNESS / 2, 0] },
    { size: [FLOOR_THICKNESS, WALL_HEIGHT, LEVEL_SIZE * 2], pos: [-LEVEL_SIZE, WALL_HEIGHT / 2 - FLOOR_THICKNESS / 2, 0] },
  ];

  for (const { size, pos } of wallGeometries) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      wallMaterial
    );
    wall.name = 'wall';
    wall.position.set(...pos);
    wall.receiveShadow = true;
    wall.castShadow = true;
    group.add(wall);
  }

  const octree = new Octree();
  octree.fromGraphNode(group);

  return { group, octree };
}

/**
 * Loads a GLB world and builds its Octree.
 * @param {string} url - Path to GLB file
 * @returns {Promise<{
 *  group: THREE.Group,
 *  octree: Octree,
 *  playerStart: { x: number, z: number } | null,
 *  npcStarts: { x: number, z: number }[],
 *  lightSpawns: { x: number, z: number, height: number, intensity: number, range: number, color: string }[]
 * }>}
 */
export async function loadGlbWorld(url) {
  const gltf = await new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(url, resolve, undefined, reject);
  });

  const group = gltf.scene;

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material?.map) {
        child.material.map.anisotropy = 4;
      }
    }
  });

  const octree = new Octree();
  octree.fromGraphNode(group);

  let playerStart = null;
  const npcStarts = [];
  const lightSpawns = [];
  const playerStartNode = group.getObjectByName('player-start');
  if (playerStartNode != null) {
    const worldPos = new THREE.Vector3();
    playerStartNode.getWorldPosition(worldPos);
    if (Number.isFinite(worldPos.x) && Number.isFinite(worldPos.z)) {
      playerStart = { x: worldPos.x, z: worldPos.z };
    }
  }

  group.traverse((node) => {
    if (typeof node?.name !== 'string') return;
    if (!node.name.startsWith('npc-spawn-')) return;
    const worldPos = new THREE.Vector3();
    node.getWorldPosition(worldPos);
    if (Number.isFinite(worldPos.x) && Number.isFinite(worldPos.z)) {
      npcStarts.push({ x: worldPos.x, z: worldPos.z });
    }
  });

  group.traverse((node) => {
    if (typeof node?.name !== 'string') return;
    if (!node.name.startsWith('stage-light-')) return;
    const worldPos = new THREE.Vector3();
    node.getWorldPosition(worldPos);
    if (!Number.isFinite(worldPos.x) || !Number.isFinite(worldPos.z)) return;
    const intensity = Number(node.userData?.intensity) || 1.2;
    const range = Number(node.userData?.range) || 7.5;
    const height = Number(node.userData?.height) || 2.35;
    const color =
      typeof node.userData?.color === 'string' && node.userData.color.length > 0
        ? node.userData.color
        : '#ffe8b8';
    lightSpawns.push({ x: worldPos.x, z: worldPos.z, height, intensity, range, color });
  });

  return { group, octree, playerStart, npcStarts, lightSpawns };
}

/**
 * Builds a collision world from floor-plan SVG text.
 * @param {string} svgText - SVG content exported by floor planner
 * @returns {{ group: THREE.Group, octree: Octree }}
 */
export function loadSvgWorld(svgText) {
  const stageData = parseFloorPlanSvg(svgText);
  const group = buildStageGroup(stageData, {
    mode: 'runtime',
    includeLandscape: false,
    includeTrees: false,
  });
  const collisionGroup = buildStageGroup(stageData, {
    mode: 'collision',
    includeLandscape: false,
    includeTrees: false,
  });
  const octree = new Octree();
  octree.fromGraphNode(collisionGroup);
  return { group, octree };
}
