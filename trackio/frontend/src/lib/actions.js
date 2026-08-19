export function clickOutside(node, callback) {
  function onPointerDown(event) {
    if (!node.contains(event.target)) {
      callback(event);
    }
  }
  document.addEventListener("pointerdown", onPointerDown, true);
  return {
    destroy() {
      document.removeEventListener("pointerdown", onPointerDown, true);
    },
  };
}
