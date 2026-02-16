/**
 * Input state and pointer lock.
 * Tracks keyboard and mouse state; does not perform side effects beyond pointer lock.
 */

const KEY_STATES = new Map();

export function initInput(containerElement) {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  return {
    requestPointerLock: () => containerElement.requestPointerLock(),
    isKeyDown,
    getPointerLockElement: () => document.pointerLockElement,
  };
}

function onKeyDown(event) {
  KEY_STATES.set(event.code, true);
}

function onKeyUp(event) {
  KEY_STATES.set(event.code, false);
}

function isKeyDown(code) {
  return KEY_STATES.get(code) === true;
}
