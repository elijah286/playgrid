import { getSharedPlayByTokenAction } from "@/app/actions/share";
import { pathGeometryToSvgD } from "@/domain/play/geometry";

type Props = { params: Promise<{ token: string }> };

export default async function SharedPlayPage({ params }: Props) {
  const { token } = await params;
  const res = await getSharedPlayByTokenAction(token);

  if (!res.ok) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm text-slate-600">{res.error}</p>
      </div>
    );
  }

  const doc = res.document;

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Shared play</p>
        <h1 className="text-2xl font-semibold text-slate-900">{doc.metadata.coachName}</h1>
        <p className="text-sm text-slate-500">{doc.metadata.wristbandCode}</p>
      </div>
      <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-emerald-50 ring-1 ring-slate-200/80">
        <svg viewBox="0 0 1 1" className="h-full w-full">
          <rect width={1} height={1} fill="#ecfdf5" />
          {doc.layers.routes.map((r) => (
            <path
              key={r.id}
              d={pathGeometryToSvgD(r.geometry)}
              fill="none"
              stroke={r.style.stroke}
              strokeWidth={0.004}
            />
          ))}
          {doc.layers.players.map((pl) => (
            <circle
              key={pl.id}
              cx={pl.position.x}
              cy={1 - pl.position.y}
              r={0.03}
              fill={pl.style.fill}
              stroke={pl.style.stroke}
              strokeWidth={0.003}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
