import { CopyPlus, Grid, RotateCw, Trash2 } from 'lucide-react';
import type { SelectionState } from '../types/ui';

export interface FloatingSelectionBarProps {
  selection: SelectionState;
  onRotate: () => void;
  onDuplicate: () => void;
  onDuplicateArray: (copies: number) => void;
  onDelete: () => void;
}

export function FloatingSelectionBar({
  selection,
  onRotate,
  onDuplicate,
  onDuplicateArray,
  onDelete,
}: FloatingSelectionBarProps) {
  const compCount = selection.componentIds.size;
  const wireCount = selection.wireIds.size;

  if (compCount === 0) {
    return null;
  }

  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 z-30 flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-2xl border border-[#1E2633] bg-[#0E131A]/95 px-2.5 py-1.5 whitespace-nowrap shadow-2xl backdrop-blur-md">
      <div className="hidden shrink-0 items-center gap-1.5 border-r border-[#1E2633] pr-2.5 pl-1 text-xs whitespace-nowrap text-slate-300 sm:flex">
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-[#141B24] px-1.5 font-mono text-[11px] font-semibold text-[#00E5FF]">
          {compCount}
        </span>
        <span className="text-slate-400">
          bileşen{wireCount > 0 ? ` · ${wireCount} kablo` : ''}
        </span>
      </div>

      {/* Single Duplicate */}
      <button
        type="button"
        onClick={onDuplicate}
        title="Seçimi Çoğalt — Açık Transistör Kopyası (Ctrl+D)"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#00E5FF] px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-[#090C10] shadow-[0_0_18px_rgba(0,229,255,0.3)] transition-all hover:bg-[#33ecff]"
      >
        <CopyPlus className="h-3.5 w-3.5 shrink-0" />
        <span>Çoğalt (×1)</span>
        <kbd className="hidden rounded bg-[#090C10]/20 px-1 py-0.5 font-mono text-[10px] text-[#090C10] lg:inline">
          Ctrl+D
        </kbd>
      </button>

      {/* High-Speed Macro Array Duplication (10x / 100x / 1000x transparent transistors) */}
      <div className="flex shrink-0 items-center gap-1 rounded-xl border border-[#1E2633] bg-[#090C10]/90 px-1.5 py-0.5">
        <span className="hidden items-center gap-1 px-1 text-[10px] font-medium text-slate-400 md:inline-flex">
          <Grid className="h-3 w-3 text-[#00E5FF]" />
          <span>Matris Kopyala:</span>
        </span>
        {([10, 100, 1000] as const).map((copies) => (
          <button
            key={copies}
            type="button"
            onClick={() => onDuplicateArray(copies)}
            title={`Seçili devreyi ${copies} kez açık fiziksel transistör ve kablo matrisi olarak çoğalt`}
            className="rounded-lg px-2 py-1 font-mono text-[11px] font-semibold text-[#00E5FF] transition-colors hover:bg-[#00E5FF]/15"
          >
            ×{copies}
          </button>
        ))}
      </div>

      <div className="mx-0.5 h-5 w-px shrink-0 bg-[#1E2633]" />

      <button
        type="button"
        onClick={onRotate}
        title="90° Döndür (R)"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-slate-200 transition-colors hover:bg-[#141B24] hover:text-[#00E5FF]"
      >
        <RotateCw className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden md:inline">Döndür</span>
        <kbd className="rounded border border-[#1E2633] bg-[#090C10] px-1 py-0.5 font-mono text-[10px] text-slate-400">
          R
        </kbd>
      </button>

      <button
        type="button"
        onClick={onDelete}
        title="Seçimi Sil (Del)"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-slate-300 transition-colors hover:bg-red-500/15 hover:text-red-400"
      >
        <Trash2 className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden md:inline">Sil</span>
        <kbd className="rounded border border-[#1E2633] bg-[#090C10] px-1 py-0.5 font-mono text-[10px] text-slate-400">
          Del
        </kbd>
      </button>
    </div>
  );
}
