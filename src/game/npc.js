/**
 * NPC: stationary sentry that rotates to face player and fires on clear LOS.
 */

import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { NPC } from './config.js';

const SHOOT_RANGE_SQ = NPC.SHOOT_RANGE * NPC.SHOOT_RANGE;
const NPC_RAYCASTER = new THREE.Raycaster();
const NPC_EYE = new THREE.Vector3();
const PLAYER_DELTA = new THREE.Vector3();

/**
 * Creates a ranged NPC with capsule collider and combat mesh.
 *
 * @param {THREE.Scene} scene - Scene to add NPC mesh
 * @param {number} x - Starting X
 * @param {number} y - Starting Y
 * @param {number} z - Starting Z
 * @returns {{ collider: Capsule, mesh: THREE.Mesh, group: THREE.Group, path: { x: number, z: number, y: number }[], lastShotTime: number, nextShotTime: number, health: number, velocity: THREE.Vector3 }}
 */
export function createNpc(scene, x, y, z) {
  const collider = new Capsule(
    new THREE.Vector3(x, y + NPC.RADIUS, z),
    new THREE.Vector3(x, y + NPC.HEIGHT - NPC.RADIUS, z),
    NPC.RADIUS
  );

  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.name = 'npc';

  const bodyHeight = NPC.HEIGHT * 0.58;
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(NPC.RADIUS * 0.92, bodyHeight, 6, 12),
    new THREE.MeshLambertMaterial({ color: 0x6c3f4d })
  );
  body.position.y = NPC.HEIGHT * 0.44;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(NPC.RADIUS * 0.58, 14, 10),
    new THREE.MeshLambertMaterial({ color: 0xb67a82 })
  );
  head.position.y = NPC.HEIGHT * 0.9;
  head.castShadow = true;
  head.receiveShadow = true;
  head.userData = { npcPart: 'head' };
  group.add(head);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(NPC.RADIUS * 0.9, NPC.RADIUS * 0.22, NPC.RADIUS * 0.25),
    new THREE.MeshLambertMaterial({ color: 0xff6565, emissive: 0x330000 })
  );
  visor.position.set(0, NPC.HEIGHT * 0.9, NPC.RADIUS * 0.44);
  visor.castShadow = false;
  visor.receiveShadow = false;
  visor.userData = { npcPart: 'head' };
  group.add(visor);

  const weapon = new THREE.Mesh(
    new THREE.BoxGeometry(NPC.RADIUS * 1.25, NPC.RADIUS * 0.3, NPC.RADIUS * 0.34),
    new THREE.MeshLambertMaterial({ color: 0x2f2f34 })
  );
  weapon.position.set(NPC.RADIUS * 0.52, NPC.HEIGHT * 0.58, NPC.RADIUS * 0.6);
  weapon.castShadow = true;
  weapon.receiveShadow = true;
  weapon.userData = { npcPart: 'body' };
  group.add(weapon);

  // Hitscan interactions target this root group.
  group.userData = { kind: 'npc' };
  scene.add(group);

  const initialShotCooldown = randomRange(NPC.SHOOT_INTERVAL_MIN, NPC.SHOOT_INTERVAL_MAX);

  return {
    collider,
    mesh: body,
    group,
    velocity: new THREE.Vector3(),
    path: [],
    lastShotTime: 0,
    nextShotTime: performance.now() / 1000 + initialShotCooldown,
    health: NPC.MAX_HEALTH,
  };
}

export function alertNpc(npc, nowSeconds = performance.now() / 1000) {
  npc.nextShotTime = Math.min(
    npc.nextShotTime,
    nowSeconds + randomRange(0.12, 0.24)
  );
}

/**
 * Updates NPC sentry: if player is visible, face player and fire.
 *
 * @param {ReturnType<typeof createNpc>} npc
 * @param {number} deltaTime
 * @param {THREE.Camera} camera - Player camera (position = player head)
 * @param {import('three/addons/math/Octree.js').Octree} octree
 * @param {ReturnType<typeof import('./pathfinding.js').buildWalkabilityGrid>} gridData
 */
export function updateNpc(npc, deltaTime, camera, octree, gridData, combatContext = {}) {
  const worldGroup = combatContext.worldGroup ?? null;
  const onPlayerHit = typeof combatContext.onPlayerHit === 'function'
    ? combatContext.onPlayerHit
    : null;
  const playerPos = camera.position.clone();
  const npcPos = npc.collider.end.clone().add(npc.collider.start).multiplyScalar(0.5);
  const now = performance.now() / 1000;
  const distSq = npcPos.distanceToSquared(playerPos);
  npc.velocity.set(0, 0, 0);
  const hasClearLine = distSq <= SHOOT_RANGE_SQ && hasLineOfSight(npcPos, playerPos, worldGroup);
  if (hasClearLine) {
    setNpcFacingToward(npc, playerPos.x, playerPos.z);
    tryShootPlayer(npc, npcPos, playerPos, distSq, now, onPlayerHit);
  }
  syncNpcMesh(npc);
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function tryShootPlayer(npc, npcPos, playerPos, distSq, now, onPlayerHit) {
  if (onPlayerHit == null) return;
  if (distSq > SHOOT_RANGE_SQ) return;
  if (now < npc.nextShotTime) return;

  npc.lastShotTime = now;
  npc.nextShotTime = now + randomRange(NPC.SHOOT_INTERVAL_MIN, NPC.SHOOT_INTERVAL_MAX);
  if (Math.random() > NPC.SHOT_ACCURACY) {
    return;
  }
  onPlayerHit({
    source: npc,
    origin: getNpcEyePosition(npcPos),
    target: playerPos.clone(),
  });
}

function getNpcEyePosition(npcPos) {
  return NPC_EYE.set(
    npcPos.x,
    npcPos.y + NPC.HEIGHT * 0.2,
    npcPos.z
  );
}

function hasLineOfSight(npcPos, playerPos, worldGroup) {
  if (worldGroup == null) return true;
  const origin = getNpcEyePosition(npcPos);
  PLAYER_DELTA.copy(playerPos).sub(origin);
  const distance = PLAYER_DELTA.length();
  if (distance <= 0.2) return true;

  PLAYER_DELTA.divideScalar(distance);
  NPC_RAYCASTER.set(origin, PLAYER_DELTA);
  NPC_RAYCASTER.near = 0.05;
  NPC_RAYCASTER.far = Math.max(0.05, distance - 0.2);
  const hits = NPC_RAYCASTER.intersectObject(worldGroup, true);
  return hits.length === 0;
}


function setNpcFacingToward(npc, targetX, targetZ) {
  const dx = targetX - npc.group.position.x;
  const dz = targetZ - npc.group.position.z;
  if (dx * dx + dz * dz < 1e-6) return;
  const yaw = Math.atan2(dx, dz);
  npc.group.rotation.set(0, yaw, 0);
}

function syncNpcMesh(npc) {
  const center = npc.collider.end.clone().add(npc.collider.start).multiplyScalar(0.5);
  npc.group.position.set(center.x, center.y - NPC.HEIGHT / 2, center.z);
}
