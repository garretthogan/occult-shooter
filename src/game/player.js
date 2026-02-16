/**
 * Player state: capsule collider, velocity, and control logic.
 * Separates physics state from input handling.
 */

import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import {
  PLAYER,
  GRAVITY,
  PHYSICS,
  WORLD,
} from './config.js';

const FORWARD = new THREE.Vector3();
const SIDE = new THREE.Vector3();

export function createPlayer(spawn = { x: 0, y: 0, z: 0 }) {
  const spawnPosition = new THREE.Vector3(
    Number(spawn.x) || 0,
    Number(spawn.y) || 0,
    Number(spawn.z) || 0
  );
  const collider = new Capsule(
    new THREE.Vector3(spawnPosition.x, spawnPosition.y + PLAYER.RADIUS, spawnPosition.z),
    new THREE.Vector3(spawnPosition.x, spawnPosition.y + PLAYER.HEIGHT - PLAYER.RADIUS, spawnPosition.z),
    PLAYER.RADIUS
  );

  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();

  return {
    collider,
    velocity,
    direction,
    onFloor: false,
    spawnPosition,
  };
}

function resetPlayer(player, camera) {
  player.collider.start.set(
    player.spawnPosition.x,
    player.spawnPosition.y + PLAYER.RADIUS,
    player.spawnPosition.z
  );
  player.collider.end.set(
    player.spawnPosition.x,
    player.spawnPosition.y + PLAYER.HEIGHT - PLAYER.RADIUS,
    player.spawnPosition.z
  );
  player.collider.radius = PLAYER.RADIUS;
  player.velocity.set(0, 0, 0);
  player.onFloor = false;
  camera.position.copy(player.collider.end);
  camera.rotation.set(0, 0, 0);
}

export function applyPlayerControls(player, camera, input, deltaTime) {
  const speedDelta = deltaTime * (player.onFloor ? PLAYER.GROUND_ACCEL : PLAYER.AIR_ACCEL);

  getForwardVector(camera, FORWARD);
  getSideVector(camera, SIDE);

  if (input.isKeyDown('KeyW')) {
    player.velocity.add(FORWARD.clone().multiplyScalar(speedDelta));
  }
  if (input.isKeyDown('KeyS')) {
    player.velocity.add(FORWARD.clone().multiplyScalar(-speedDelta));
  }
  if (input.isKeyDown('KeyA')) {
    player.velocity.add(SIDE.clone().multiplyScalar(-speedDelta));
  }
  if (input.isKeyDown('KeyD')) {
    player.velocity.add(SIDE.clone().multiplyScalar(speedDelta));
  }
  if (player.onFloor && input.isKeyDown('Space')) {
    player.velocity.y = PLAYER.JUMP_VELOCITY;
  }
}

export function updatePlayerPhysics(player, octree, camera, deltaTime) {
  const damping =
    (Math.exp(-PLAYER.DAMPING_FACTOR * deltaTime) - 1) *
    (player.onFloor ? 1 : PLAYER.AIR_RESISTANCE);

  if (!player.onFloor) {
    player.velocity.y -= GRAVITY * deltaTime;
  }

  player.velocity.addScaledVector(player.velocity, damping);

  const deltaPosition = player.velocity.clone().multiplyScalar(deltaTime);
  player.collider.translate(deltaPosition);

  resolvePlayerCollisions(player, octree);
  camera.position.copy(player.collider.end);
}

function getForwardVector(camera, out) {
  camera.getWorldDirection(out);
  out.y = 0;
  out.normalize();
  return out;
}

function getSideVector(camera, out) {
  camera.getWorldDirection(out);
  out.y = 0;
  out.normalize();
  out.cross(camera.up);
  return out;
}

function resolvePlayerCollisions(player, octree) {
  const result = octree.capsuleIntersect(player.collider);
  player.onFloor = false;

  if (!result) return;

  player.onFloor = result.normal.y > 0;

  if (!player.onFloor) {
    player.velocity.addScaledVector(
      result.normal,
      -result.normal.dot(player.velocity)
    );
  }

  if (result.depth >= 1e-10) {
    player.collider.translate(result.normal.multiplyScalar(result.depth));
  }
}

export function teleportPlayerIfOob(player, camera) {
  if (camera.position.y <= WORLD.OOB_Y_THRESHOLD) {
    resetPlayer(player, camera);
  }
}
