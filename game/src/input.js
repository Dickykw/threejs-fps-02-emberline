// Input: keyboard state, mouse look deltas and pointer lock, kept apart from the sim.
// The sim reads this through a small snapshot each step; nothing here touches the game.
export function createInput(canvas) {
  const keys = new Set();
  let lookDX = 0;
  let lookDY = 0;
  let attackHeld = false;
  let attackPressed = false;
  let locked = false;
  const pressed = new Set();

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (!locked) return;
    lookDX += e.movementX || 0;
    lookDY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (!locked) {
      canvas.requestPointerLock?.();
      return;
    }
    attackHeld = true;
    attackPressed = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) attackHeld = false;
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }
  function onBlur() {
    keys.clear();
    attackHeld = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    get locked() {
      return locked;
    },
    // Movement keys as a -1..1 pair, forward and strafe.
    moveAxis() {
      let f = 0;
      let s = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
      return { f, s };
    },
    get crouch() {
      return keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    },
    // Edge-triggered keys: true once per press, then cleared by the caller via consume().
    wasPressed(code) {
      return pressed.has(code);
    },
    consumePressed() {
      pressed.clear();
    },
    // Mouse look since the last consume, in pixels.
    consumeLook() {
      const out = { dx: lookDX, dy: lookDY };
      lookDX = 0;
      lookDY = 0;
      return out;
    },
    get attackHeld() {
      return attackHeld;
    },
    // True once per click, then cleared.
    consumeAttackPressed() {
      const v = attackPressed;
      attackPressed = false;
      return v;
    },
    // For screenshot / headless modes: pretend the pointer is locked without a click.
    forceLock() {
      locked = true;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };
}
