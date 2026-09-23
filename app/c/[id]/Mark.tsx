'use client';

/**
 * One vector mark, drawn exactly as the renderer draws it.  [Doctrine U-12]
 *
 * Shared by every surface that shows marks, so what is placed on screen is
 * what comes out of the render. A second implementation of these shapes is a
 * second definition of where a circle is.
 */
/** The same shapes the renderer draws, so what is placed is what is rendered. */
export default function Mark({ mark }: { mark: any }) {
  const W = 1000;
  const H = 563;
  const colour = mark.style?.color ?? '#ffcc00';
  const width = Math.max(2, (mark.style?.width ?? 0.005) * H);
  const points = (mark.points ?? []).map((p: any) => ({ x: p.x * W, y: p.y * H }));
  if (points.length === 0) return null;
  const [a, b] = [points[0], points[1] ?? points[0]];

  switch (mark.kind) {
    case 'box':
    case 'blur':
      return (
        <rect
          x={Math.min(a.x, b.x)} y={Math.min(a.y, b.y)}
          width={Math.abs(b.x - a.x)} height={Math.abs(b.y - a.y)}
          fill={mark.kind === 'blur' ? 'rgba(255,255,255,.35)' : 'none'}
          stroke={mark.kind === 'blur' ? '#ffffff' : colour}
          strokeDasharray={mark.kind === 'blur' ? '6 4' : undefined}
          strokeWidth={width}
        />
      );
    case 'ellipse':
      return (
        <ellipse
          cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2}
          rx={Math.abs(b.x - a.x) / 2} ry={Math.abs(b.y - a.y) / 2}
          fill="none" stroke={colour} strokeWidth={width}
        />
      );
    case 'point': {
      // The same ring the renderer draws: 4.5% of the canvas height.
      const r = H * 0.045;
      return (
        <>
          <circle cx={a.x} cy={a.y} r={r} fill="none" stroke={colour} strokeWidth={width * 1.4} />
          <circle cx={a.x} cy={a.y} r={Math.max(2, width * 0.8)} fill={colour} />
        </>
      );
    }
    case 'underline':
      return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colour} strokeWidth={width * 1.6} />;
    case 'arrow':
      return (
        <g stroke={colour} strokeWidth={width} fill={colour}>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          <circle cx={b.x} cy={b.y} r={width * 2} />
        </g>
      );
    case 'freehand':
      return (
        <polyline
          points={points.map((p: any) => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke={colour} strokeWidth={width}
          strokeLinejoin="round" strokeLinecap="round"
        />
      );
    case 'text':
      return (
        <text x={a.x} y={a.y} fill={colour} fontSize={H * 0.05} stroke="#000" strokeWidth={1}>
          {mark.text}
        </text>
      );
    default:
      return null;
  }
}
