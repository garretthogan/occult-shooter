/**
 * Hitscan: raycast from camera, place marker sphere at hit point.
 * Configurable range; no physics.
 */

import * as THREE from 'three';
import { Raycaster } from 'three';
import { HITSCAN } from './config.js';

const CENTER_NDC = new THREE.Vector2(0, 0);

/**
 * Creates a hitscan system. Fire from camera; raycast against targets; place marker at hit.
 * Markers disappear after MARKER_LIFETIME seconds.
 *
 * @param {THREE.Scene} scene - Scene to add hit markers to
 * @param {THREE.Object3D | THREE.Object3D[]} raycastTargets - Object(s) to raycast against (world, NPCs, etc.)
 * @param {{ onHit?: (hit: import('three').Intersection) => void }} [options]
 * @returns {{
 *  fire: (camera: THREE.Camera) => void,
 *  update: () => void,
 *  addTarget: (target: THREE.Object3D) => void,
 *  removeTarget: (target: THREE.Object3D) => void
 * }}
 */
export function createHitscan(scene, raycastTargets, options = {}) {
  const raycaster = new Raycaster();
  raycaster.far = HITSCAN.RANGE;
  const onHit = typeof options.onHit === 'function' ? options.onHit : null;

  const targets = Array.isArray(raycastTargets) ? [...raycastTargets] : [raycastTargets];

  const geometry = new THREE.SphereGeometry(HITSCAN.MARKER_RADIUS, 16, 12);
  const material = new THREE.MeshBasicMaterial({
    color: HITSCAN.MARKER_COLOR,
    transparent: true,
    opacity: HITSCAN.MARKER_OPACITY,
    depthWrite: false,
  });

  const markers = [];

  function fire(camera) {
    raycaster.setFromCamera(CENTER_NDC, camera);
    const intersects = raycaster.intersectObjects(targets, true);

    if (intersects.length === 0) return;

    const hit = intersects[0];
    if (onHit != null) {
      onHit(hit);
    }
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(hit.point);
    scene.add(marker);
    markers.push({ mesh: marker, spawnTime: performance.now() });
  }

  function addTarget(target) {
    if (target == null) return;
    if (!targets.includes(target)) {
      targets.push(target);
    }
  }

  function removeTarget(target) {
    if (target == null) return;
    const index = targets.indexOf(target);
    if (index >= 0) {
      targets.splice(index, 1);
    }
  }

  function update() {
    const now = performance.now();
    const expiry = HITSCAN.MARKER_LIFETIME * 1000;

    for (let i = markers.length - 1; i >= 0; i--) {
      if (now - markers[i].spawnTime >= expiry) {
        scene.remove(markers[i].mesh);
        markers.splice(i, 1);
      }
    }
  }

  return { fire, update, addTarget, removeTarget };
}
