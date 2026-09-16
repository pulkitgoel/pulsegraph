export interface Point {
  x: number;
  y: number;
}

/** Preserve validated orthogonal corridors; smooth only nonorthogonal Dagre paths. */
export function pointsToPath(points: Point[]): string {
  if (points.length < 2) return '';
  const orthogonal = points.every(
    (point, index) =>
      index === 0 || point.x === points[index - 1].x || point.y === points[index - 1].y,
  );
  let path = 'M ' + points[0].x + ' ' + points[0].y;
  if (orthogonal) {
    return (
      path +
      points
        .slice(1)
        .map((point) => ' L ' + point.x + ' ' + point.y)
        .join('')
    );
  }
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index],
      next = points[index + 1];
    path +=
      ' Q ' +
      point.x +
      ' ' +
      point.y +
      ' ' +
      (point.x + next.x) / 2 +
      ' ' +
      (point.y + next.y) / 2;
  }
  const last = points[points.length - 1];
  return path + ' L ' + last.x + ' ' + last.y;
}

/** Convert routed vertices to a path with bounded quadratic corner arcs. */
export function pointsToRoundedPath(points: Point[], radius = 18): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incoming = Math.hypot(corner.x - previous.x, corner.y - previous.y);
    const outgoing = Math.hypot(next.x - corner.x, next.y - corner.y);
    const curve = Math.min(radius, incoming / 2, outgoing / 2);

    if (!curve || incoming === 0 || outgoing === 0) {
      path += ` L ${corner.x} ${corner.y}`;
      continue;
    }

    const before = {
      x: corner.x - ((corner.x - previous.x) / incoming) * curve,
      y: corner.y - ((corner.y - previous.y) / incoming) * curve,
    };
    const after = {
      x: corner.x + ((next.x - corner.x) / outgoing) * curve,
      y: corner.y + ((next.y - corner.y) / outgoing) * curve,
    };
    path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }

  const last = points.at(-1)!;
  return path + ` L ${last.x} ${last.y}`;
}
