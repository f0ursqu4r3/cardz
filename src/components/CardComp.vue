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
  /* Calculate visual depth: min(stack-size, 10) cards shown, 1px per card edge */
  --depth: min(var(--stack-size, 1), 10);
  /* Shadow shows stack depth - darker and larger for bigger stacks */
  box-shadow:
    /* Card edges effect - shows deck thickness */
    calc(var(--depth) * 0.3px) calc(var(--depth) * 0.5px) 0 rgba(50, 50, 50, 0.9),
    calc(var(--depth) * 0.2px) calc(var(--depth) * 0.4px) 0 rgba(80, 80, 80, 0.8),
    calc(var(--depth) * 0.1px) calc(var(--depth) * 0.2px) 0 rgba(120, 120, 120, 0.7),
    /* Drop shadow scaled to stack size */ 0px calc(2px + var(--depth) * 0.5px)
      calc(6px + var(--depth) * 1px) rgba(0, 0, 0, 0.3);
}

.card.dragging:not(.in-stack),
.card.dragging.in-stack.stack-bottom {
  z-index: 2;
  box-shadow: 0px 12px 12px -4px rgba(0, 0, 0, 0.25);
}
</style>
