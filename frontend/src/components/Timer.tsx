interface Props {
  seconds: number;
  total?: number;
}

export default function Timer({ seconds, total = 30 }: Props) {
  const pct = (seconds / total) * 100;
  const color = seconds <= 5 ? 'text-red-400' : seconds <= 10 ? 'text-yellow-400' : 'text-green-400';
  const barColor = seconds <= 5 ? 'bg-red-500' : seconds <= 10 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-4xl font-extrabold tabular-nums ${color}`}>{seconds}</span>
      <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
