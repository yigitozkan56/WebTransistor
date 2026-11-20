import {
  CopyPlus,
  Keyboard,
  RotateCw,
  Sliders,
  Trash2,
} from 'lucide-react';
import { PALETTE_CATALOG } from '../engine/componentDefs';
import type {
  CircuitComponent,
  CircuitPreset,
  ComponentProps,
} from '../types/circuit';
import type { SelectionState, SimulationStats } from '../types/ui';
import { HardwareMonitor } from './HardwareMonitor';

export interface InspectorPanelProps {
  activeComponents: CircuitComponent[];
  selection: SelectionState;
  stats: SimulationStats;
  isRunning?: boolean;
  activePreset: CircuitPreset | null;
  onUpdateProps: (compId: string, patch: Partial<ComponentProps>) => void;
  onSetRotation: (compId: string, rotation: 0 | 90 | 180 | 270) => void;
  onRotateSelection: () => void;
  onDuplicateSelection: () => void;
  onDuplicateArray: (copies: number) => void;
  onDeleteSelection: () => void;
  onToggleSwitch: (compId: string, nextState: boolean) => void;
  onGenerateBenchmark?: (targetTransistors: number) => void;
}

const COLOR_OPTIONS: Array<{
  id: NonNullable<ComponentProps['color']>;
  label: string;
  hex: string;
}> = [
  { id: 'cyan', label: 'Elektrik Mavisi', hex: '#00E5FF' },
  { id: 'green', label: 'Yeşil', hex: '#22C55E' },
  { id: 'amber', label: 'Altın Kehribar', hex: '#F59E0B' },
  { id: 'red', label: 'Kırmızı', hex: '#EF4444' },
];

const QUICK_KEY_BINDINGS = ['A', 'B', 'W', 'S', 'D', 'Space', 'Enter', 'X', 'Z'];

function getComponentTypeTitle(comp: CircuitComponent): string {
  const found = PALETTE_CATALOG.find((item) => item.type === comp.type);
  return found ? found.name : comp.type;
}

export function InspectorPanel({
  activeComponents,
  selection,
  stats,
  isRunning = true,
  activePreset,
  onUpdateProps,
  onSetRotation,
  onRotateSelection,
  onDuplicateSelection,
  onDuplicateArray,
  onDeleteSelection,
  onToggleSwitch,
  onGenerateBenchmark,
}: InspectorPanelProps) {
  const selectedComponents = activeComponents.filter((c) =>
    selection.componentIds.has(c.id),
  );
  const selectedComp =
    selectedComponents.length === 1 ? selectedComponents[0] : null;
  const hasSelection =
    selection.componentIds.size > 0 || selection.wireIds.size > 0;

  // Empty selection -> Real-Time Top-Right Silicon Hardware & Performance Monitor
  if (!hasSelection) {
    return (
      <HardwareMonitor
        stats={stats}
        isRunning={isRunning}
        activePreset={activePreset}
        onGenerateBenchmark={onGenerateBenchmark}
      />
    );
  }

  // Multi-selection or wire-only selection
  if (!selectedComp) {
    return (
      <aside className="z-20 flex w-64 shrink-0 flex-col border-l border-[#1E2633] bg-[#0E131A]/95 backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-[#1E2633] px-3.5 py-2.5">
          <Sliders className="h-3.5 w-3.5 text-[#00E5FF]" />
          <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase">
            Çoklu Seçim
          </span>
        </div>

        <div className="space-y-3 p-3.5 text-xs">
          <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/80 p-3 text-slate-300">
            <div className="font-semibold text-slate-100">Seçilen Silikon Bloğu</div>
            <div className="mt-1 font-mono text-[11px] text-slate-400">
              {selection.componentIds.size} bileşen · {selection.wireIds.size} kablo
            </div>
          </div>

          <div className="space-y-2">
            {selection.componentIds.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={onDuplicateSelection}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#00E5FF] px-3 py-2 text-xs font-semibold text-[#090C10] transition-colors hover:bg-[#33ecff]"
                >
                  <CopyPlus className="h-3.5 w-3.5" />
                  <span>Çoğalt — Açık Transistör (Ctrl+D)</span>
                </button>

                <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/80 p-2.5">
                  <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    Matris Kopyala (Açık Silikon Dizisi)
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([10, 100, 1000] as const).map((copies) => (
                      <button
                        key={copies}
                        type="button"
                        onClick={() => onDuplicateArray(copies)}
                        className="rounded-lg border border-[#1E2633] bg-[#141B24] py-1.5 font-mono text-xs font-semibold text-[#00E5FF] transition-colors hover:border-[#00E5FF]/50 hover:bg-[#00E5FF]/15"
                      >
                        ×{copies}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onRotateSelection}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#1E2633] bg-[#141B24] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-slate-600 hover:text-[#00E5FF]"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>90° Döndür (R)</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onDeleteSelection}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Seçimi Sil (Del)</span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // Single component inspector
  const isColorEditable =
    selectedComp.type === 'LED' || selectedComp.type === 'PIXEL_MATRIX';
  const isKeyBindable =
    selectedComp.type === 'TOGGLE_SWITCH' ||
    selectedComp.type === 'PUSH_BUTTON';

  return (
    <aside className="z-20 flex w-64 shrink-0 flex-col border-l border-[#1E2633] bg-[#0E131A]/95 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-[#1E2633] px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-100">
            {getComponentTypeTitle(selectedComp)}
          </div>
          <div className="truncate font-mono text-[10px] text-slate-500">
            {selectedComp.id} · ({selectedComp.x}, {selectedComp.y})
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3.5 text-xs">
        {/* Label */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-slate-400">
            Etiket (Label)
          </label>
          <input
            type="text"
            value={selectedComp.props.label ?? ''}
            onChange={(e) =>
              onUpdateProps(selectedComp.id, { label: e.target.value })
            }
            placeholder="Opsiyonel etiket..."
            className="w-full rounded-lg border border-[#1E2633] bg-[#090C10]/90 px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-600 outline-none transition-colors focus:border-[#00E5FF]/60"
          />
        </div>

        {/* Toggle Switch state */}
        {selectedComp.type === 'TOGGLE_SWITCH' && (
          <div>
            <div className="mb-1 text-[11px] font-medium text-slate-400">
              Fiziksel Anahtar Durumu
            </div>
            <button
              type="button"
              onClick={() =>
                onToggleSwitch(selectedComp.id, !selectedComp.props.state)
              }
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 font-mono text-xs font-semibold transition-all ${
                selectedComp.props.state
                  ? 'border-[#00E5FF]/50 bg-[#00E5FF]/15 text-[#00E5FF]'
                  : 'border-[#1E2633] bg-[#090C10]/90 text-slate-300'
              }`}
            >
              <span>{selectedComp.props.state ? 'AÇIK (HIGH 1)' : 'KAPALI (LOW 0)'}</span>
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  selectedComp.props.state
                    ? 'bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]'
                    : 'bg-slate-600'
                }`}
              />
            </button>
          </div>
        )}

        {/* Key Binding for TOGGLE_SWITCH and PUSH_BUTTON */}
        {isKeyBindable && (
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <Keyboard className="h-3.5 w-3.5 text-[#00E5FF]" />
              <span>Klavye Tuş Ataması (Key Binding)</span>
            </label>
            <input
              type="text"
              maxLength={12}
              value={selectedComp.props.keyBinding ?? ''}
              onChange={(e) =>
                onUpdateProps(selectedComp.id, {
                  keyBinding: e.target.value.trim(),
                })
              }
              placeholder="Örn: A, B, Space, W..."
              className="w-full rounded-lg border border-[#1E2633] bg-[#090C10]/90 px-2.5 py-1.5 font-mono text-xs text-slate-100 placeholder-slate-600 outline-none focus:border-[#00E5FF]/60"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {QUICK_KEY_BINDINGS.map((k) => {
                const active =
                  (selectedComp.props.keyBinding ?? '').toLowerCase() ===
                  k.toLowerCase();
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      onUpdateProps(selectedComp.id, {
                        keyBinding: active ? '' : k,
                      })
                    }
                    className={`rounded-md border px-2 py-0.5 font-mono text-[10px] transition-colors ${
                      active
                        ? 'border-[#00E5FF]/60 bg-[#00E5FF]/15 text-[#00E5FF]'
                        : 'border-[#1E2633] bg-[#090C10]/70 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              Atanan klavye tuşuna basıldığında fiziksel kontak doğrudan kapanır.
            </p>
          </div>
        )}

        {/* PIXEL_MATRIX Resolution (4x4 = 16 direct pins, 8x8 = 64 direct pins) */}
        {selectedComp.type === 'PIXEL_MATRIX' && (
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-slate-400">
              Ham Piksel Matrisi Boyutu (Doğrudan Bacaklı)
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {([4, 8] as const).map((size) => {
                const active = (selectedComp.props.matrixSize ?? 4) === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() =>
                      onUpdateProps(selectedComp.id, { matrixSize: size })
                    }
                    className={`rounded-lg border py-1.5 font-mono text-xs transition-colors ${
                      active
                        ? 'border-[#00E5FF]/60 bg-[#00E5FF]/15 text-[#00E5FF]'
                        : 'border-[#1E2633] bg-[#090C10]/70 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {size}×{size} ({size * size} Pin)
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              Her piksel (P_y_x) kendi doğrudan fiziksel giriş bacağına sahiptir;
              dahili saat veya sürücü çipi yoktur.
            </p>
          </div>
        )}

        {/* Color swatch for LED / PIXEL_MATRIX */}
        {isColorEditable && (
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-slate-400">
              Işık Rengi
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {COLOR_OPTIONS.map((opt) => {
                const active = (selectedComp.props.color ?? 'cyan') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    title={opt.label}
                    onClick={() =>
                      onUpdateProps(selectedComp.id, { color: opt.id })
                    }
                    className={`flex h-8 items-center justify-center rounded-lg border transition-all ${
                      active
                        ? 'border-white/70 bg-[#141B24] ring-1 ring-[#00E5FF]/60'
                        : 'border-[#1E2633] bg-[#090C10]/80 hover:border-slate-700'
                    }`}
                  >
                    <span
                      className="h-3.5 w-3.5 rounded-full"
                      style={{
                        backgroundColor: opt.hex,
                        boxShadow: active ? `0 0 10px ${opt.hex}` : undefined,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Rotation */}
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-slate-400">
            Yönlendirme (Rotation)
          </div>
          <div className="grid grid-cols-4 gap-1">
            {([0, 90, 180, 270] as const).map((deg) => {
              const active = selectedComp.rotation === deg;
              return (
                <button
                  key={deg}
                  type="button"
                  onClick={() => onSetRotation(selectedComp.id, deg)}
                  className={`rounded-lg border py-1 font-mono text-[11px] transition-colors ${
                    active
                      ? 'border-[#00E5FF]/60 bg-[#00E5FF]/15 text-[#00E5FF]'
                      : 'border-[#1E2633] bg-[#090C10]/70 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {deg}°
                </button>
              );
            })}
          </div>
        </div>

        {/* High-Speed Macro Duplication */}
        <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/80 p-2.5">
          <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
            Çoğalt / Matris Kopyala
          </div>
          <div className="grid grid-cols-4 gap-1">
            {([1, 10, 100, 1000] as const).map((copies) => (
              <button
                key={copies}
                type="button"
                onClick={() =>
                  copies === 1 ? onDuplicateSelection() : onDuplicateArray(copies)
                }
                className="rounded-lg border border-[#1E2633] bg-[#141B24] py-1 font-mono text-[11px] font-semibold text-[#00E5FF] transition-colors hover:border-[#00E5FF]/50 hover:bg-[#00E5FF]/15"
              >
                ×{copies}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Delete */}
      <div className="border-t border-[#1E2633] p-3">
        <button
          type="button"
          onClick={onDeleteSelection}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Bileşeni Sil</span>
        </button>
      </div>
    </aside>
  );
}
