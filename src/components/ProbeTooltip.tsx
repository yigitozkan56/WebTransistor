import { useLayoutEffect, useRef, useState } from 'react';
import { LogicValue, logicValueLabel } from '../types/circuit';
import type { HoverProbe } from '../types/ui';

export interface ProbeTooltipProps {
  probe: HoverProbe | null;
}

interface ValueBadgeStyle {
  dotClass: string;
  badgeClass: string;
}

function getValueBadgeStyle(value: LogicValue): ValueBadgeStyle {
  switch (value) {
    case LogicValue.HIGH:
      return {
        dotClass: 'bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]',
        badgeClass: 'border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF]',
      };
    case LogicValue.WEAK_HIGH:
      return {
        dotClass: 'bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.7)]',
        badgeClass: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
      };
    case LogicValue.LOW:
      return {
        dotClass: 'bg-slate-400',
        badgeClass: 'border-slate-700/70 bg-[#141B24] text-slate-300',
      };
    case LogicValue.WEAK_LOW:
      return {
        dotClass: 'bg-slate-500',
        badgeClass: 'border-slate-700/70 bg-[#141B24]/80 text-slate-400',
      };
    case LogicValue.ERR:
      return {
        dotClass: 'bg-[#EF4444] shadow-[0_0_8px_#EF4444] animate-pulse',
        badgeClass: 'border-red-500/50 bg-red-500/15 text-red-400',
      };
    case LogicValue.Z:
    default:
      return {
        dotClass: 'border border-slate-500 bg-transparent',
        badgeClass: 'border-[#1E2633] bg-[#090C10]/90 text-slate-400',
      };
  }
}

export function ProbeTooltip({ probe }: ProbeTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!probe) return;
    const margin = 12;
    const offset = 14;
    const el = tooltipRef.current;
    const width = el ? el.offsetWidth : 220;
    const height = el ? el.offsetHeight : 88;
    const maxX = Math.max(margin, window.innerWidth - width - margin);
    const maxY = Math.max(margin, window.innerHeight - height - margin);

    const nextX = Math.min(Math.max(margin, probe.screenX + offset), maxX);
    const nextY = Math.min(Math.max(margin, probe.screenY + offset), maxY);
    setPos({ x: nextX, y: nextY });
  }, [probe]);

  if (!probe) {
    return null;
  }

  const style = getValueBadgeStyle(probe.value);

  return (
    <div
      ref={tooltipRef}
      style={{
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
      }}
      className="pointer-events-none fixed top-0 left-0 z-50 min-w-[180px] max-w-[280px] rounded-xl border border-[#1E2633] bg-[#0E131A]/95 px-3 py-2 text-xs shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-100">{probe.title}</div>
          {probe.subtitle && (
            <div className="truncate text-[11px] text-slate-400">{probe.subtitle}</div>
          )}
        </div>
        <span className="shrink-0 rounded border border-[#1E2633] bg-[#090C10] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
          {probe.netId !== null ? `Net #${probe.netId}` : 'Boşta'}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium ${style.badgeClass}`}
        >
          <span className={`h-2 w-2 rounded-full ${style.dotClass}`} />
          {logicValueLabel(probe.value)}
        </span>
      </div>
    </div>
  );
}
