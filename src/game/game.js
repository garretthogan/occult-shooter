/**
 * Main game orchestrator.
 * Wires scene, world, player, hitscan, input, and render loop.
 */

import * as THREE from 'three';
import { Clock } from 'three';
import { createScene } from './scene.js';
import { createRenderer, onWindowResize } from './renderer.js';
import { initInput } from './input.js';
import { createProceduralWorld, loadGlbWorld, loadSvgWorld } from './world.js';
import { createPlayer, applyPlayerControls, updatePlayerPhysics, teleportPlayerIfOob } from './player.js';
import { createHitscan } from './hitscan.js';
import { createNpc, updateNpc, alertNpc } from './npc.js';
import { buildWalkabilityGrid, getFloorAt } from './pathfinding.js';
import { createPathfindingDebug } from './pathfindingDebug.js';
import { createSceneControlPanel } from './sceneControlPanel.js';
import { loadLightingConfigFromUrl, applyLightingConfig } from './lightingConfig.js';
import { PHYSICS, PLAYER, NPC } from './config.js';
import { withBasePath } from '../shared/basePath.js';

const STEPS_PER_FRAME = PHYSICS.STEPS_PER_FRAME;
const MAX_DELTA = PHYSICS.MAX_DELTA_PER_STEP;
const CHUNK_GRAVITY = 22;
const CHUNK_LIFETIME = 1.4;
const CHUNK_COUNT = 12;
const CHUNK_SIZE_MIN = 0.06;
const CHUNK_SIZE_MAX = 0.16;
const CHUNK_SPEED_MIN = 2.8;
const CHUNK_SPEED_MAX = 7.4;
const CHUNK_UPWARD_MIN = 2.4;
const CHUNK_UPWARD_MAX = 6.8;
const GLASS_CHUNK_GRAVITY = 17;
const GLASS_CHUNK_LIFETIME = 1.1;
const GLASS_CHUNK_COUNT = 20;
const GLASS_CHUNK_SIZE_MIN = 0.035;
const GLASS_CHUNK_SIZE_MAX = 0.08;
const GLASS_CHUNK_SPEED_MIN = 2.2;
const GLASS_CHUNK_SPEED_MAX = 6.2;
const GLASS_CHUNK_UPWARD_MIN = 1.1;
const GLASS_CHUNK_UPWARD_MAX = 3.4;
const PLAYER_HIT_FLASH_MAX_OPACITY = 0.5;
const PLAYER_HIT_FLASH_DECAY = 2.8;
const GAME_OVER_CAMERA_HEIGHT = 24;
const GAME_OVER_CAMERA_DISTANCE = 8;

const DEFAULT_WORLD_GLB_URL = withBasePath('/collision-world.glb');

function resolvePlayerNpcCollision(player, npc, camera) {
  const playerCenter = player.collider.end.clone().add(player.collider.start).multiplyScalar(0.5);
  const npcCenter = npc.collider.end.clone().add(npc.collider.start).multiplyScalar(0.5);
  const minDist = PLAYER.RADIUS + NPC.RADIUS;
  const dx = playerCenter.x - npcCenter.x;
  const dz = playerCenter.z - npcCenter.z;
  const distSq = dx * dx + dz * dz;
  if (distSq < minDist * minDist && distSq > 1e-12) {
    const dist = Math.sqrt(distSq);
    const overlap = minDist - dist;
    const nx = dx / dist;
    const nz = dz / dist;
    player.collider.translate(new THREE.Vector3(nx, 0, nz).multiplyScalar(overlap));
    camera.position.copy(player.collider.end);
  }
}

function findNpcFromHitObject(hitObject, npcByGroup) {
  let current = hitObject;
  while (current != null) {
    const npc = npcByGroup.get(current);
    if (npc != null) {
      return npc;
    }
    current = current.parent ?? null;
  }
  return null;
}

function findObjectByKind(hitObject, kind) {
  let current = hitObject;
  while (current != null) {
    if (current.userData?.kind === kind) {
      return current;
    }
    current = current.parent ?? null;
  }
  return null;
}

function isNpcHeadHit(hitObject) {
  let current = hitObject;
  while (current != null) {
    if (current.userData?.npcPart === 'head') {
      return true;
    }
    if (current.userData?.kind === 'npc') {
      return false;
    }
    current = current.parent ?? null;
  }
  return false;
}

function createPlayerDamageFlash(containerElement) {
  const flash = document.createElement('div');
  flash.className = 'player-damage-flash';
  flash.setAttribute('aria-hidden', 'true');
  containerElement.appendChild(flash);
  return flash;
}

function createHud(containerElement) {
  const hud = document.createElement('div');
  hud.className = 'game-hud';

  const npcCounter = document.createElement('div');
  npcCounter.className = 'game-hud-counter';
  npcCounter.textContent = 'NPCs: 0 killed / 0 remaining';
  hud.appendChild(npcCounter);

  const healthRow = document.createElement('div');
  healthRow.className = 'game-hud-health-row';
  const healthLabel = document.createElement('span');
  healthLabel.className = 'game-hud-health-label';
  healthLabel.textContent = 'Health';
  const healthValue = document.createElement('span');
  healthValue.className = 'game-hud-health-value';
  healthValue.textContent = '100';
  healthRow.append(healthLabel, healthValue);
  hud.appendChild(healthRow);

  const healthBar = document.createElement('div');
  healthBar.className = 'game-hud-health-bar';
  const healthFill = document.createElement('div');
  healthFill.className = 'game-hud-health-fill';
  healthBar.appendChild(healthFill);
  hud.appendChild(healthBar);

  containerElement.appendChild(hud);

  const gameOver = document.createElement('div');
  gameOver.className = 'game-over-overlay';
  gameOver.setAttribute('aria-hidden', 'true');
  gameOver.textContent = 'GAME OVER';
  containerElement.appendChild(gameOver);

  return { npcCounter, healthValue, healthFill, gameOver };
}

function createPauseOverlay(containerElement) {
  const pauseOverlay = document.createElement('div');
  pauseOverlay.className = 'game-pause-overlay';
  pauseOverlay.setAttribute('aria-hidden', 'true');
  pauseOverlay.textContent = 'PAUSED';
  containerElement.appendChild(pauseOverlay);
  return pauseOverlay;
}

function createFullscreenToggle(containerElement) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'game-fullscreen-toggle';
  button.setAttribute('aria-label', 'Enter full screen');
  button.title = 'Enter full screen';
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path />
    </svg>
  `;
  containerElement.appendChild(button);
  return button;
}

function isContainerFullscreen(containerElement) {
  return document.fullscreenElement === containerElement;
}

function updateFullscreenButtonState(button, containerElement) {
  const fullscreen = isContainerFullscreen(containerElement);
  const nextLabel = fullscreen ? 'Exit full screen' : 'Enter full screen';
  button.setAttribute('aria-label', nextLabel);
  button.title = nextLabel;
  const path = button.querySelector('path');
  if (path == null) return;
  // Outward corners for enter, inward corners for exit.
  path.setAttribute(
    'd',
    fullscreen
      ? 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5'
      : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'
  );
}

async function toggleFullscreen(containerElement) {
  if (isContainerFullscreen(containerElement)) {
    await document.exitFullscreen?.();
    return;
  }
  await containerElement.requestFullscreen?.();
}

function supportsEscapeKeyboardLock() {
  return (
    typeof navigator !== 'undefined' &&
    navigator.keyboard != null &&
    typeof navigator.keyboard.lock === 'function' &&
    typeof navigator.keyboard.unlock === 'function'
  );
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function spawnNpcChunks(scene, npc, chunks) {
  const center = npc.collider.end.clone().add(npc.collider.start).multiplyScalar(0.5);
  for (let index = 0; index < CHUNK_COUNT; index++) {
    const size = randomRange(CHUNK_SIZE_MIN, CHUNK_SIZE_MAX);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshLambertMaterial({ color: 0x6fc3ff })
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(center);
    scene.add(mesh);

    const horizontal = new THREE.Vector3(
      randomRange(-1, 1),
      0,
      randomRange(-1, 1)
    );
    if (horizontal.lengthSq() < 1e-5) {
      horizontal.set(1, 0, 0);
    }
    horizontal.normalize().multiplyScalar(randomRange(CHUNK_SPEED_MIN, CHUNK_SPEED_MAX));
    const velocity = new THREE.Vector3(
      horizontal.x,
      randomRange(CHUNK_UPWARD_MIN, CHUNK_UPWARD_MAX),
      horizontal.z
    );
    chunks.push({
      mesh,
      velocity,
      age: 0,
      lifetime: CHUNK_LIFETIME,
    });
  }
}

function updateNpcChunks(scene, chunks, deltaTime, octree) {
  for (let index = chunks.length - 1; index >= 0; index--) {
    const chunk = chunks[index];
    chunk.age += deltaTime;
    chunk.velocity.y -= CHUNK_GRAVITY * deltaTime;
    const delta = chunk.velocity.clone().multiplyScalar(deltaTime);
    chunk.mesh.position.add(delta);

    const hit = octree.sphereIntersect(new THREE.Sphere(chunk.mesh.position.clone(), 0.05));
    const hitNormal = hit?.normal;
    const hitDepth = Number(hit?.depth);
    if (
      hitNormal instanceof THREE.Vector3 &&
      Number.isFinite(hitDepth) &&
      hitDepth > 0
    ) {
      chunk.mesh.position.add(hitNormal.clone().multiplyScalar(hitDepth));
      const bounce = hitNormal.clone().multiplyScalar(Math.max(0, hitNormal.dot(chunk.velocity)));
      chunk.velocity.sub(bounce.multiplyScalar(1.3));
      chunk.velocity.multiplyScalar(0.8);
    }

    if (chunk.age >= chunk.lifetime) {
      scene.remove(chunk.mesh);
      chunk.mesh.geometry?.dispose?.();
      if (Array.isArray(chunk.mesh.material)) {
        chunk.mesh.material.forEach((material) => material.dispose?.());
      } else {
        chunk.mesh.material?.dispose?.();
      }
      chunks.splice(index, 1);
    }
  }
}

function spawnWindowShards(scene, hit, windowMesh, shards) {
  const impactPoint = hit.point instanceof THREE.Vector3
    ? hit.point.clone()
    : windowMesh.getWorldPosition(new THREE.Vector3());
  const paneCenter = windowMesh.getWorldPosition(new THREE.Vector3());
  const paneQuaternion = windowMesh.getWorldQuaternion(new THREE.Quaternion());
  const paneRight = new THREE.Vector3(1, 0, 0).applyQuaternion(paneQuaternion).normalize();
  const paneUp = new THREE.Vector3(0, 1, 0).applyQuaternion(paneQuaternion).normalize();
  const paneNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(paneQuaternion).normalize();
  const hitNormal = hit.face?.normal instanceof THREE.Vector3
    ? hit.face.normal.clone().transformDirection(windowMesh.matrixWorld).normalize()
    : null;
  const outward = hitNormal instanceof THREE.Vector3 ? hitNormal : paneNormal;

  const paneGeometry = windowMesh.geometry?.parameters ?? {};
  const paneWidth = Number.isFinite(paneGeometry.width) ? paneGeometry.width : 1.8;
  const paneHeight = Number.isFinite(paneGeometry.height) ? paneGeometry.height : 1.2;
  const paneDepth = Number.isFinite(paneGeometry.depth) ? paneGeometry.depth : 0.04;

  const shardMaterial = new THREE.MeshPhongMaterial({
    color: 0xbfe7ff,
    transparent: true,
    opacity: 0.72,
    shininess: 95,
  });

  for (let index = 0; index < GLASS_CHUNK_COUNT; index++) {
    const size = randomRange(GLASS_CHUNK_SIZE_MIN, GLASS_CHUNK_SIZE_MAX);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size * 0.85, size * 0.08),
      shardMaterial.clone()
    );
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    const paneOffset = paneRight.clone().multiplyScalar(randomRange(-paneWidth * 0.45, paneWidth * 0.45))
      .addScaledVector(paneUp, randomRange(-paneHeight * 0.45, paneHeight * 0.45))
      .addScaledVector(paneNormal, randomRange(-paneDepth * 0.35, paneDepth * 0.35));
    const panePoint = paneCenter.clone().add(paneOffset);
    const spawnPoint = impactPoint.clone().lerp(panePoint, randomRange(0.35, 0.92));
    mesh.position.copy(spawnPoint);
    mesh.rotation.set(
      randomRange(-Math.PI, Math.PI),
      randomRange(-Math.PI, Math.PI),
      randomRange(-Math.PI, Math.PI)
    );
    scene.add(mesh);

    const radial = panePoint.clone().sub(impactPoint);
    if (radial.lengthSq() < 1e-5) {
      radial.copy(paneRight).multiplyScalar(randomRange(-1, 1)).addScaledVector(paneUp, randomRange(-0.4, 0.4));
    }
    radial.normalize();

    const jitter = new THREE.Vector3(
      randomRange(-1, 1),
      randomRange(-0.35, 0.9),
      randomRange(-1, 1)
    );
    if (jitter.lengthSq() < 1e-5) {
      jitter.set(1, 0, 0);
    }
    jitter.normalize();

    const velocity = outward.clone()
      .multiplyScalar(randomRange(GLASS_CHUNK_SPEED_MIN, GLASS_CHUNK_SPEED_MAX))
      .addScaledVector(radial, randomRange(0.9, 2.8))
      .addScaledVector(jitter, randomRange(0.25, 1.1));
    velocity.y += randomRange(GLASS_CHUNK_UPWARD_MIN, GLASS_CHUNK_UPWARD_MAX);

    shards.push({
      mesh,
      velocity,
      age: 0,
      lifetime: GLASS_CHUNK_LIFETIME,
    });
  }
}

function updateWindowShards(scene, shards, deltaTime, octree) {
  for (let index = shards.length - 1; index >= 0; index--) {
    const shard = shards[index];
    shard.age += deltaTime;
    shard.velocity.y -= GLASS_CHUNK_GRAVITY * deltaTime;
    shard.mesh.position.addScaledVector(shard.velocity, deltaTime);
    shard.mesh.rotation.x += deltaTime * 8;
    shard.mesh.rotation.y += deltaTime * 10;

    const hit = octree.sphereIntersect(new THREE.Sphere(shard.mesh.position.clone(), 0.03));
    const hitNormal = hit?.normal;
    const hitDepth = Number(hit?.depth);
    if (
      hitNormal instanceof THREE.Vector3 &&
      Number.isFinite(hitDepth) &&
      hitDepth > 0
    ) {
      shard.mesh.position.add(hitNormal.clone().multiplyScalar(hitDepth));
      const bounce = hitNormal.clone().multiplyScalar(Math.max(0, hitNormal.dot(shard.velocity)));
      shard.velocity.sub(bounce.multiplyScalar(1.55));
      shard.velocity.multiplyScalar(0.72);
    }

    if (shard.age >= shard.lifetime) {
      scene.remove(shard.mesh);
      shard.mesh.geometry?.dispose?.();
      if (Array.isArray(shard.mesh.material)) {
        shard.mesh.material.forEach((material) => material.dispose?.());
      } else {
        shard.mesh.material?.dispose?.();
      }
      shards.splice(index, 1);
    }
  }
}

export async function createGame(containerElement, options = {}) {
  const worldUrl = options.worldUrl ?? DEFAULT_WORLD_GLB_URL;
  const svgFloorPlanText = options.svgFloorPlanText;
  const spawnNpc = options.spawnNpc !== false;
  const showSceneGui = options.showSceneGui ?? import.meta.env.DEV;
  const escapePausesGame = options.escapePausesGame !== false;
  let npcStarts = Array.isArray(options.npcStarts) ? options.npcStarts : [];
  let playerStart = options.playerStart ?? null;
  const { scene, fillLight, directionalLight } = createScene();

  const lightingConfig = await loadLightingConfigFromUrl();
  if (lightingConfig !== null) {
    applyLightingConfig({ fillLight, directionalLight }, lightingConfig);
  }

  const camera = new THREE.PerspectiveCamera(
    70,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.rotation.order = 'YXZ';

  const renderer = createRenderer(containerElement);
  const input = initInput(containerElement);

  let worldGroup;
  let octree;

  if (typeof svgFloorPlanText === 'string' && svgFloorPlanText.length > 0) {
    try {
      const world = loadSvgWorld(svgFloorPlanText);
      worldGroup = world.group;
      octree = world.octree;
    } catch (err) {
      throw new Error('Failed to build world from SVG.', { cause: err });
    }
  } else {
    try {
      const world = await loadGlbWorld(worldUrl);
      worldGroup = world.group;
      octree = world.octree;
      if (playerStart == null && world.playerStart != null) {
        playerStart = world.playerStart;
      }
      if (npcStarts.length === 0 && Array.isArray(world.npcStarts) && world.npcStarts.length > 0) {
        npcStarts = world.npcStarts;
      }
    } catch (err) {
      console.warn(`Failed to load ${worldUrl}, using procedural level:`, err);
      const procedural = createProceduralWorld();
      worldGroup = procedural.group;
      octree = procedural.octree;
    }
  }

  scene.add(worldGroup);

  const gridData = buildWalkabilityGrid(worldGroup);

  const spawnX = playerStart?.x ?? 0;
  const spawnZ = playerStart?.z ?? 0;
  const spawnY = getFloorAt(gridData, spawnX, spawnZ);
  const player = createPlayer({ x: spawnX, y: spawnY, z: spawnZ });
  camera.position.copy(player.collider.end);
  const npcs = [];
  if (npcStarts.length > 0) {
    for (const npcStart of npcStarts) {
      const npcSpawnX = Number(npcStart?.x);
      const npcSpawnZ = Number(npcStart?.z);
      if (!Number.isFinite(npcSpawnX) || !Number.isFinite(npcSpawnZ)) continue;
      const npcFloorY = getFloorAt(gridData, npcSpawnX, npcSpawnZ);
      npcs.push(createNpc(scene, npcSpawnX, npcFloorY, npcSpawnZ));
    }
  } else if (spawnNpc) {
    const npcSpawnX = 2;
    const npcSpawnZ = 2;
    const npcFloorY = getFloorAt(gridData, npcSpawnX, npcSpawnZ);
    npcs.push(createNpc(scene, npcSpawnX, npcFloorY, npcSpawnZ));
  }

  const npcByGroup = new Map();
  for (const npc of npcs) {
    npcByGroup.set(npc.group, npc);
  }
  const totalNpcCount = npcs.length;
  let killedNpcCount = 0;
  let playerHealth = PLAYER.MAX_HEALTH;
  let isGameOver = false;

  const chunks = [];
  const windowShards = [];
  const hitscanTargets = [worldGroup, ...npcs.map((npc) => npc.group)];
  const hitscan = createHitscan(scene, hitscanTargets, {
    onHit: (hit) => {
      const windowGlass = findObjectByKind(hit.object, 'windowGlass');
      if (windowGlass != null && windowGlass.userData.shattered !== true) {
        windowGlass.userData.shattered = true;
        spawnWindowShards(scene, hit, windowGlass, windowShards);
        windowGlass.parent?.remove(windowGlass);
        windowGlass.geometry?.dispose?.();
        return;
      }

      const npc = findNpcFromHitObject(hit.object, npcByGroup);
      if (npc == null) return;
      alertNpc(npc);
      const damage = isNpcHeadHit(hit.object) ? NPC.MAX_HEALTH : 1;
      npc.health = Math.max(0, npc.health - damage);
      if (npc.health > 0) {
        return;
      }

      spawnNpcChunks(scene, npc, chunks);
      killedNpcCount += 1;
      updateNpcCounter();
      const npcIndex = npcs.indexOf(npc);
      if (npcIndex >= 0) {
        npcs.splice(npcIndex, 1);
      }
      npcByGroup.delete(npc.group);
      hitscan.removeTarget(npc.group);
      npc.group.parent?.remove(npc.group);
    },
  });

  const pathfindingDebug = showSceneGui
    ? createPathfindingDebug(scene, gridData, () => (npcs[0] == null ? [] : npcs[0].path))
    : { update: () => {}, setVisible: () => {} };
  const debugState = { showPathfinding: false };
  pathfindingDebug.setVisible(debugState.showPathfinding);

  if (showSceneGui) {
    createSceneControlPanel(
      { fillLight, directionalLight },
      containerElement,
      { pathfindingDebug, debugState }
    );
  }

  const reticle = document.createElement('div');
  reticle.className = 'reticle';
  reticle.setAttribute('aria-hidden', 'true');
  containerElement.appendChild(reticle);
  const damageFlash = createPlayerDamageFlash(containerElement);
  const hud = createHud(containerElement);
  const pauseOverlay = createPauseOverlay(containerElement);
  const fullscreenToggle = createFullscreenToggle(containerElement);
  let damageFlashIntensity = 0;
  let isPaused = false;
  let hasEverEnteredPointerLock = false;
  updateNpcCounter();
  updateHealthHud();
  updateFullscreenButtonState(fullscreenToggle, containerElement);

  const clock = new Clock();

  function updateNpcCounter() {
    const remaining = Math.max(0, totalNpcCount - killedNpcCount);
    hud.npcCounter.textContent = `NPCs: ${killedNpcCount} killed / ${remaining} remaining`;
  }

  function updateHealthHud() {
    const clamped = Math.max(0, Math.min(PLAYER.MAX_HEALTH, playerHealth));
    const ratio = PLAYER.MAX_HEALTH > 0 ? clamped / PLAYER.MAX_HEALTH : 0;
    hud.healthValue.textContent = String(Math.round(clamped));
    hud.healthFill.style.width = `${(ratio * 100).toFixed(1)}%`;
  }

  function enterGameOverState() {
    if (isGameOver) return;
    isGameOver = true;
    if (document.pointerLockElement !== null) {
      document.exitPointerLock?.();
    }
    hud.gameOver.setAttribute('aria-hidden', 'false');
    hud.gameOver.classList.add('is-visible');
    reticle.style.display = 'none';
    if (supportsEscapeKeyboardLock()) {
      navigator.keyboard.unlock();
    }
  }

  function setPaused(nextPaused) {
    if (isGameOver) return;
    if (isPaused === nextPaused) return;
    isPaused = nextPaused;
    containerElement.classList.toggle('is-paused', isPaused);
    pauseOverlay.setAttribute('aria-hidden', isPaused ? 'false' : 'true');
    pauseOverlay.classList.toggle('is-visible', isPaused);
    if (isPaused) {
      reticle.style.display = 'none';
      if (document.pointerLockElement !== null) {
        document.exitPointerLock?.();
      }
    } else {
      reticle.style.display = '';
    }
  }

  async function ensureFullscreenAfterPauseToggle(shouldStayFullscreen) {
    if (!shouldStayFullscreen) return;
    if (isContainerFullscreen(containerElement)) return;
    try {
      await containerElement.requestFullscreen?.();
    } catch {
      // Ignore: some browsers may block fullscreen restoration.
    }
    updateFullscreenButtonState(fullscreenToggle, containerElement);
  }

  function updateGameOverCamera() {
    const target = player.collider.end.clone();
    camera.position.set(
      target.x,
      target.y + GAME_OVER_CAMERA_HEIGHT,
      target.z + GAME_OVER_CAMERA_DISTANCE
    );
    camera.lookAt(target);
  }

  async function syncEscapeKeyboardLock() {
    if (!escapePausesGame) return;
    if (!supportsEscapeKeyboardLock()) return;
    try {
      if (isContainerFullscreen(containerElement)) {
        await navigator.keyboard.lock(['Escape']);
      } else {
        navigator.keyboard.unlock();
      }
    } catch {
      // Browser may reject lock/unlock depending on permission and focus state.
    }
  }

  containerElement.addEventListener('mousedown', (event) => {
    if (event.target.closest('.lil-gui') !== null) return;
    if (event.target.closest('.game-fullscreen-toggle') !== null) return;
    if (isGameOver) return;
    if (isPaused) {
      setPaused(false);
    }
    input.requestPointerLock();
  });

  document.addEventListener('mouseup', () => {
    if (isGameOver) return;
    if (isPaused) return;
    if (input.getPointerLockElement() !== null) {
      hitscan.fire(camera);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!escapePausesGame) return;
    if (event.code !== 'Escape') return;
    if (isGameOver) return;
    const wasFullscreen = isContainerFullscreen(containerElement);
    const nextPaused = !isPaused;
    event.preventDefault();
    setPaused(nextPaused);
    if (nextPaused) {
      void ensureFullscreenAfterPauseToggle(wasFullscreen);
    }
  });

  document.addEventListener('pointerlockchange', () => {
    if (isGameOver) return;
    if (!escapePausesGame) return;
    const pointerLockElement = input.getPointerLockElement();
    if (pointerLockElement === containerElement) {
      hasEverEnteredPointerLock = true;
      return;
    }
    if (hasEverEnteredPointerLock) {
      setPaused(true);
    }
  });

  document.addEventListener('fullscreenchange', () => {
    updateFullscreenButtonState(fullscreenToggle, containerElement);
    void syncEscapeKeyboardLock();
  });

  fullscreenToggle.addEventListener('mousedown', (event) => {
    event.stopPropagation();
  });
  fullscreenToggle.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await toggleFullscreen(containerElement);
    } catch (err) {
      console.warn('Unable to toggle full screen mode:', err);
    }
    updateFullscreenButtonState(fullscreenToggle, containerElement);
    void syncEscapeKeyboardLock();
  });

  document.addEventListener('mousemove', (event) => {
    if (isGameOver) return;
    if (isPaused) return;
    if (document.pointerLockElement !== null) {
      camera.rotation.y -= event.movementX / 500;
      camera.rotation.x -= event.movementY / 500;
    }
  });

  window.addEventListener('resize', () => {
    onWindowResize(camera, renderer);
  });

  function step(deltaTime) {
    if (isGameOver) return;
    if (isPaused) return;
    applyPlayerControls(player, camera, input, deltaTime);
    updatePlayerPhysics(player, octree, camera, deltaTime);
    for (const npc of npcs) {
      resolvePlayerNpcCollision(player, npc, camera);
    }
    teleportPlayerIfOob(player, camera);
    for (const npc of npcs) {
      updateNpc(npc, deltaTime, camera, octree, gridData, {
        worldGroup,
        onPlayerHit: () => {
          if (isGameOver) return;
          playerHealth = Math.max(0, playerHealth - NPC.SHOT_DAMAGE);
          updateHealthHud();
          damageFlashIntensity = 1;
          damageFlash.style.opacity = String(PLAYER_HIT_FLASH_MAX_OPACITY);
          if (playerHealth <= 0) {
            enterGameOverState();
          }
        },
      });
    }
  }

  function animate() {
    const rawDelta = Math.min(MAX_DELTA, clock.getDelta());
    const deltaPerStep = rawDelta / STEPS_PER_FRAME;

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      step(deltaPerStep);
    }

    if (debugState.showPathfinding) {
      pathfindingDebug.update();
    }
    if (damageFlashIntensity > 0) {
      damageFlashIntensity = Math.max(0, damageFlashIntensity - rawDelta * PLAYER_HIT_FLASH_DECAY);
      damageFlash.style.opacity = String(damageFlashIntensity * PLAYER_HIT_FLASH_MAX_OPACITY);
    }
    if (isGameOver) {
      updateGameOverCamera();
    }
    updateNpcChunks(scene, chunks, rawDelta, octree);
    updateWindowShards(scene, windowShards, rawDelta, octree);
    hitscan.update();
    renderer.render(scene, camera);
  }

  renderer.setAnimationLoop(animate);

  return {
    scene,
    camera,
    renderer,
    player,
    npc: npcs[0] ?? null,
    npcs,
    hitscan,
    octree,
    worldGroup,
  };
}
