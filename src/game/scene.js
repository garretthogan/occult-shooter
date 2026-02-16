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

  const fillLight = new THREE.HemisphereLight(0x415a8a, 0x091220, 1.1);
  fillLight.position.set(2, 1, 1);
  scene.add(fillLight);

  const directionalLight = new THREE.DirectionalLight(0xb7c9ff, 1.35);
  directionalLight.position.set(-5, 25, -1);
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.near = 0.01;
  directionalLight.shadow.camera.far = 500;
  directionalLight.shadow.camera.right = 30;
  directionalLight.shadow.camera.left = -30;
  directionalLight.shadow.camera.top = 30;
  directionalLight.shadow.camera.bottom = -30;
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  directionalLight.shadow.radius = 4;
  directionalLight.shadow.bias = -0.00006;
  scene.add(directionalLight);

  return { scene, fillLight, directionalLight };
}
