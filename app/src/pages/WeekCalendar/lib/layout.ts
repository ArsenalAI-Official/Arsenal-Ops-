// Pure overlap layout for a single day's blocks. Concurrent blocks are placed
// side-by-side: each block is assigned a lane (column) and the total lane count
// of its overlap cluster, so the view can size widths as (1 / lanes). No React.

export interface Interval {
  start: number;
  end: number;
}

export interface Positioned<T extends Interval> {
  item: T;
  /** 0-based column within the overlap cluster. */
  lane: number;
  /** Total columns in this block's cluster. */
  lanes: number;
}

const EPS = 1e-9;

/**
 * Greedy interval-graph lane assignment + cluster sizing.
 *
 * 1. Sort by start (then end). Assign each block the first lane whose previous
 *    occupant has ended — opening a new lane when none is free.
 * 2. Group blocks into clusters of transitive overlap; every block in a cluster
 *    shares the cluster's max lane count so their widths line up.
 */
export function layoutDay<T extends Interval>(items: T[]): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);

  const laneEnds: number[] = [];
  const withLane = sorted.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start + EPS);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[lane] = item.end;
    }
    return { item, lane };
  });

  // Partition into clusters: a new cluster starts when a block begins at or
  // after the running max end of the current cluster (no overlap).
  const out: Positioned<T>[] = [];
  let cluster: { item: T; lane: number }[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (!cluster.length) return;
    const lanes = Math.max(...cluster.map((c) => c.lane)) + 1;
    for (const c of cluster) out.push({ item: c.item, lane: c.lane, lanes });
    cluster = [];
  };
  for (const entry of withLane) {
    if (cluster.length && entry.item.start >= clusterEnd - EPS) flush();
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.item.end);
  }
  flush();
  return out;
}
