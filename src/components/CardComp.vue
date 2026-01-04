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
  image-rendering: -webkit-optimize-contrast; /* Safari */
  image-rendering: crisp-edges;

  /* Cursor handled by parent .table-view with custom colored cursors */
  cursor: inherit;
  will-change: transform;

  box-shadow: 0px 1px 6px rgba(0, 0, 0, 0.25);
  transition: box-shadow 0.2s ease;
}

/* Cards in a stack don't show shadow (except the bottom one) */
.card.in-stack {
  box-shadow: none;
}

/* Stack depth visual - creates edge effect based on card count */
.card.in-stack.stack-bottom {
  box-shadow: 0px 1px 6px rgba(0, 0, 0, 0.25);
}

.card.dragging:not(.in-stack),
.card.dragging.in-stack.stack-bottom {
  z-index: 2;
  box-shadow: 0px 12px 12px -4px rgba(0, 0, 0, 0.25);
}
</style>
