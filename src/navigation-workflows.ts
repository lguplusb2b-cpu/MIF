export function recordPageTransition<Page extends string>(
  history: Page[],
  current: Page,
  next: Page,
  maxDepth = 30,
) {
  if (current === next) return history;
  return [...history, current].slice(-maxDepth);
}

export function getPreviousPage<Page extends string>(
  history: Page[],
  fallback: Page,
) {
  if (!history.length) return { page: fallback, history };
  return {
    page: history[history.length - 1],
    history: history.slice(0, -1),
  };
}
