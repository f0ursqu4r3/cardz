<template>
  <div class="card"></div>
</template>

<style scoped>
.card {
  border-radius: 2px;
  width: var(--tile-w);
  height: var(--tile-h);
  position: absolute;

  background-image: var(--atlas);
  background-repeat: no-repeat;
  background-position: calc(-1 * (var(--pad-x) + (var(--col) * (var(--tile-w) + var(--gap-x)))))
    calc(-1 * (var(--pad-y) + (var(--row) * (var(--tile-h) + var(--gap-y)))));

  contain: layout paint;
  image-rendering: auto;

  cursor: grab;
  will-change: transform;

  box-shadow: 0px 1px 6px rgba(0, 0, 0, 0.25);
}

.card.dragging {
  cursor: grabbing;
  z-index: 2;
}
</style>
