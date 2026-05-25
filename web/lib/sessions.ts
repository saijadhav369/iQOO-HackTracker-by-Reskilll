// Gap (ms) above which a continuous session ends.
// Mirrors Android Constants.SESSION_GAP_MS.
export const SESSION_GAP_MS = 120_000;

/**
 * Walk per-team heartbeat ticks and return the longest continuous session
 * in milliseconds for each team. Input rows must be grouped by teamId and
 * ordered by tick time ascending.
 */
export function computeLongestSessionMsPerTeam(
  rows: Array<{ teamId: string; recordedAt: Date | null }>
): Map<string, number> {
  const result = new Map<string, number>();
  let currentTeam: string | null = null;
  let sessionStart = 0;
  let lastTime = 0;
  let bestForTeam = 0;

  const flush = () => {
    if (currentTeam !== null) {
      const final = Math.max(bestForTeam, lastTime - sessionStart);
      result.set(currentTeam, final);
    }
  };

  for (const row of rows) {
    const t = row.recordedAt ? new Date(row.recordedAt).getTime() : 0;
    if (!t) continue;
    if (row.teamId !== currentTeam) {
      flush();
      currentTeam = row.teamId;
      sessionStart = t;
      lastTime = t;
      bestForTeam = 0;
    } else {
      if (t - lastTime > SESSION_GAP_MS) {
        bestForTeam = Math.max(bestForTeam, lastTime - sessionStart);
        sessionStart = t;
      }
      lastTime = t;
    }
  }
  flush();
  return result;
}
