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
