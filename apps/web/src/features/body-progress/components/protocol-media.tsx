import { bodyMeasurementProtocols, type BodyMeasurementSite } from '@pulse/shared';

const landmarkY: Record<BodyMeasurementSite, number> = {
  chest_nipple_line_relaxed: 69,
  hips_maximum: 119,
  thigh_midpoint: 157,
  upper_arm_midpoint_flexed: 82,
  waist_iliac_crest_nhanes: 101,
};

const equivalentText: Record<BodyMeasurementSite, string> = {
  waist_iliac_crest_nhanes:
    'Diagram and motion: a horizontal tape circles the torso immediately above the right iliac crest at the end of a normal breath out.',
  chest_nipple_line_relaxed:
    'Diagram and motion: a horizontal tape circles the relaxed chest at nipple line after the arms return to the sides.',
  hips_maximum:
    'Diagram and motion: a horizontal tape circles the widest point of the buttocks while the feet stay together.',
  upper_arm_midpoint_flexed:
    'Diagram and motion: the tape circles the selected flexed upper arm at the marked midpoint between shoulder and elbow.',
  thigh_midpoint:
    'Diagram and motion: the tape circles the selected thigh at its fixed midpoint while standing with weight distributed consistently.',
};

export function ProtocolMedia({ site }: { site: BodyMeasurementSite }) {
  const protocol = bodyMeasurementProtocols[site];
  const y = landmarkY[site];
  const isLimb = site === 'upper_arm_midpoint_flexed' || site === 'thigh_midpoint';
  const x1 = isLimb ? (site === 'upper_arm_midpoint_flexed' ? 122 : 112) : 48;
  const x2 = isLimb ? (site === 'upper_arm_midpoint_flexed' ? 143 : 139) : 152;

  return (
    <figure className="grid gap-3 rounded-2xl border border-border/70 bg-secondary/20 p-3 sm:grid-cols-[180px_1fr] sm:items-center">
      <svg
        aria-labelledby={`protocol-title-${site} protocol-description-${site}`}
        className="mx-auto h-48 w-full max-w-[180px] text-foreground"
        role="img"
        viewBox="0 0 200 210"
      >
        <title id={`protocol-title-${site}`}>{protocol.name} landmark diagram</title>
        <desc id={`protocol-description-${site}`}>{equivalentText[site]}</desc>
        <circle
          cx="100"
          cy="25"
          fill="var(--secondary)"
          r="17"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M73 50 Q100 40 127 50 L137 127 Q122 141 119 190 L81 190 Q78 141 63 127Z"
          fill="var(--secondary)"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M72 55 L47 124 M128 55 L153 124 M82 188 L75 205 M118 188 L125 205"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="9"
        />
        <line
          className="body-protocol-tape"
          x1={x1}
          x2={x2}
          y1={y}
          y2={y}
          stroke="var(--primary)"
          strokeDasharray="5 4"
          strokeLinecap="round"
          strokeWidth="6"
        />
        <circle
          className="body-protocol-marker"
          cx={x2}
          cy={y}
          fill="var(--accent)"
          r="7"
          stroke="currentColor"
          strokeWidth="2"
        />
      </svg>
      <figcaption className="space-y-2 text-sm">
        <p className="font-semibold text-foreground">Landmark in motion</p>
        <p className="text-muted-foreground">{equivalentText[site]}</p>
        <p className="rounded-lg bg-background/70 p-2 text-xs text-muted-foreground">
          Keep the tape level, snug without compressing skin, and repeat the same landmark each
          time.
        </p>
      </figcaption>
    </figure>
  );
}
