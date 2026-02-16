/**
 * Input state and pointer lock.
 * Tracks keyboard and mouse state; does not perform side effects beyond pointer lock.
 */

import { GAMEPAD } from './config.js';

const KEY_STATES = new Map();
const ZERO_STICK_INPUT = Object.freeze({ x: 0, y: 0 });

const gamepadState = {
  move: { x: 0, y: 0 },
  look: { x: 0, y: 0 },
  jumpDown: false,
  sprintDown: false,
  pauseJustPressed: false,
  fireJustPressed: false,
};

const previousButtons = {
  pause: false,
  fire: false,
};

export function initInput(containerElement) {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  return {
    requestPointerLock: () => containerElement.requestPointerLock(),
    isKeyDown,
    updateGamepadState,
    getMoveInput,
    getLookInput,
    isJumpPressed,
    isSprintPressed,
    consumePausePressed,
    consumeFirePressed,
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

function updateGamepadState() {
  gamepadState.pauseJustPressed = false;
  gamepadState.fireJustPressed = false;
  gamepadState.jumpDown = false;
  gamepadState.sprintDown = false;
  gamepadState.move.x = 0;
  gamepadState.move.y = 0;
  gamepadState.look.x = 0;
  gamepadState.look.y = 0;

  const activeGamepad = readActiveGamepad();
  if (activeGamepad == null) {
    previousButtons.pause = false;
    previousButtons.fire = false;
    return;
  }

  const moveX = normalizeAxis(
    activeGamepad.axes?.[0] ?? 0,
    GAMEPAD.MOVE_DEADZONE,
    GAMEPAD.MOVE_RESPONSE_EXPONENT
  );
  const moveY = -normalizeAxis(
    activeGamepad.axes?.[1] ?? 0,
    GAMEPAD.MOVE_DEADZONE,
    GAMEPAD.MOVE_RESPONSE_EXPONENT
  );
  const lookX = normalizeAxis(
    activeGamepad.axes?.[2] ?? 0,
    GAMEPAD.LOOK_DEADZONE,
    GAMEPAD.LOOK_RESPONSE_EXPONENT
  );
  const lookY = normalizeAxis(
    activeGamepad.axes?.[3] ?? 0,
    GAMEPAD.LOOK_DEADZONE,
    GAMEPAD.LOOK_RESPONSE_EXPONENT
  );

  gamepadState.move.x = moveX;
  gamepadState.move.y = moveY;
  gamepadState.look.x = lookX;
  gamepadState.look.y = lookY;

  const pauseDown = isGamepadButtonDown(activeGamepad, 9);
  const fireDown = isGamepadButtonDown(activeGamepad, 7) || isGamepadButtonDown(activeGamepad, 5);
  gamepadState.jumpDown = isGamepadButtonDown(activeGamepad, 0);
  gamepadState.sprintDown = isGamepadButtonDown(activeGamepad, 10);
  gamepadState.pauseJustPressed = pauseDown && !previousButtons.pause;
  gamepadState.fireJustPressed = fireDown && !previousButtons.fire;
  previousButtons.pause = pauseDown;
  previousButtons.fire = fireDown;
}

function readActiveGamepad() {
  const allGamepads = navigator.getGamepads?.();
  if (allGamepads == null) return null;
  const connected = [...allGamepads].filter((gamepad) => gamepad != null && gamepad.connected);
  if (connected.length === 0) return null;
  return connected.find((gamepad) => gamepad.mapping === 'standard') ?? connected[0];
}

function normalizeAxis(rawValue, deadzone, exponent) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return 0;
  const magnitude = Math.abs(numeric);
  if (magnitude <= deadzone) return 0;
  const normalized = (magnitude - deadzone) / (1 - deadzone);
  const curved = Math.pow(Math.max(0, Math.min(1, normalized)), exponent);
  return Math.sign(numeric) * curved;
}

function isGamepadButtonDown(gamepad, index) {
  const button = gamepad.buttons?.[index];
  if (button == null) return false;
  if (button.pressed === true) return true;
  return Number(button.value) >= GAMEPAD.BUTTON_THRESHOLD;
}

function getMoveInput() {
  const keyboardMoveX = (isKeyDown('KeyD') ? 1 : 0) - (isKeyDown('KeyA') ? 1 : 0);
  const keyboardMoveY = (isKeyDown('KeyW') ? 1 : 0) - (isKeyDown('KeyS') ? 1 : 0);
  const x = clampAxis(keyboardMoveX + gamepadState.move.x);
  const y = clampAxis(keyboardMoveY + gamepadState.move.y);
  if (x === 0 && y === 0) return ZERO_STICK_INPUT;
  return { x, y };
}

function getLookInput() {
  return gamepadState.look;
}

function isJumpPressed() {
  return isKeyDown('Space') || gamepadState.jumpDown;
}

function isSprintPressed() {
  return (
    isKeyDown('ShiftLeft') ||
    isKeyDown('ShiftRight') ||
    isKeyDown('ControlLeft') ||
    isKeyDown('ControlRight') ||
    gamepadState.sprintDown
  );
}

function consumePausePressed() {
  if (!gamepadState.pauseJustPressed) return false;
  gamepadState.pauseJustPressed = false;
  return true;
}

function consumeFirePressed() {
  if (!gamepadState.fireJustPressed) return false;
  gamepadState.fireJustPressed = false;
  return true;
}

function clampAxis(value) {
  return Math.max(-1, Math.min(1, value));
}
