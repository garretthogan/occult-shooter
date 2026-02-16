/**
 * Scene setup: lighting, fog, background.
 * Pure scene construction; no game logic.
 */

import * as THREE from 'three';

function createNightSkyTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context == null) {
    return null;
  }

  const gradient = context.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, '#040812');
  gradient.addColorStop(0.55, '#070f1f');
  gradient.addColorStop(1, '#0d1730');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const starCount = 340;
  for (let index = 0; index < starCount; index++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const radius = Math.random() < 0.88 ? Math.random() * 1.1 : 1.8 + Math.random() * 1.4;
    const alpha = 0.4 + Math.random() * 0.6;
    context.fillStyle = `rgba(226,236,255,${alpha.toFixed(3)})`;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createNightSkyDome() {
  const texture = createNightSkyTexture();
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const geometry = new THREE.SphereGeometry(420, 36, 24);
  const dome = new THREE.Mesh(geometry, material);
  dome.name = 'night-sky-dome';
  dome.renderOrder = -10;
  return dome;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050914);
  scene.fog = new THREE.Fog(0x050914, 16, 92);
  scene.add(createNightSkyDome());
  return { scene };
}
