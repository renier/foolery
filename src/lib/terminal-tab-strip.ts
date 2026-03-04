const TAB_STRIP_EPSILON = 1;
const COMPACT_TAB_WIDTH_THRESHOLD = 190;

export interface TerminalTabStripMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export interface TerminalTabStripState {
  hasOverflow: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

export function resolveTerminalTabStripState(
  metrics: TerminalTabStripMetrics,
): TerminalTabStripState {
  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const boundedScrollLeft = Math.min(Math.max(metrics.scrollLeft, 0), maxScrollLeft);
  const hasOverflow = maxScrollLeft > TAB_STRIP_EPSILON;

  return {
    hasOverflow,
    canScrollLeft: hasOverflow && boundedScrollLeft > TAB_STRIP_EPSILON,
    canScrollRight:
      hasOverflow && maxScrollLeft - boundedScrollLeft > TAB_STRIP_EPSILON,
  };
}

export function shouldUseCompactTerminalTabLabels(
  hasOverflow: boolean,
  clientWidth: number,
  tabCount: number,
): boolean {
  if (!hasOverflow || tabCount <= 0) return false;
  return clientWidth / tabCount < COMPACT_TAB_WIDTH_THRESHOLD;
}

export function getTerminalTabScrollAmount(clientWidth: number): number {
  return Math.max(120, Math.round(clientWidth * 0.72));
}
