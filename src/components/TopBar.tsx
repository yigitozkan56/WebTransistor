import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  CopyPlus,
  Cpu,
  Download,
  Flame,
  Hand,
  HelpCircle,
  Layers,
  Maximize2,
  MousePointer2,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Spline,
  StepForward,
  Undo2,
  Upload,
} from 'lucide-react';
import { EXAMPLE_PROJECTS } from '../data/exampleProjects';
import type { CircuitPreset } from '../types/circuit';
import type {
  SimulationStats,
  ToolMode,
  WireStyle,
} from '../types/ui';
import { BenchmarkMenu } from './BenchmarkModal';

export interface TopBarProps {
  presets: CircuitPreset[];
  activePresetId: string | null;
  onLoadPreset: (presetId: string) => void;
  circuitName: string;
  isRunning: boolean;
  onToggleRun: () => void;
  onStep: () => void;
  onReset: () => void;
  clockHz: number;
  onClockHzChange: (hz: number) => void;
  stats: SimulationStats;
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  wireStyle: WireStyle;
  onWireStyleChange: (style: WireStyle) => void;
  onFitToView: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExportJson: () => void;
  onImportJsonClick: () => void;
  onOpenHelp: () => void;
  onMacroDuplicateAll?: (copies: number) => void;
  onGenerateBenchmarkChip?: (targetTransistors: number, recommendedHz?: number) => void;
  onNavigateProjects?: () => void;
}

const MIN_HZ = 1;
const MAX_HZ = 150_000;
const LOG_MAX = Math.log(MAX_HZ);

const TICK_PRESET_PILLS: Array<{ label: string; hz: number }> = [
  { label: '2/sn', hz: 2 },
  { label: '20/sn', hz: 20 },
  { label: '1k/sn', hz: 1_000 },
  { label: '25k/sn', hz: 25_000 },
  { label: 'MAX', hz: 150_000 },
];

export function formatHz(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '0 Tick/sn';
  if (hz >= 1000) {
    const k = hz / 1000;
    return k >= 100 ? `${Math.round(k)}k Tick/sn` : `${k.toFixed(1)}k Tick/sn`;
  }
  return hz >= 10
    ? `${Math.round(hz)} Tick/sn`
    : `${hz.toFixed(1).replace(/\.0$/, '')} Tick/sn`;
}

function hzToSlider(hz: number): number {
  const clamped = Math.min(MAX_HZ, Math.max(MIN_HZ, hz));
  return Math.round((Math.log(clamped) / LOG_MAX) * 1000);
}

function sliderToHz(value: number): number {
  if (value <= 0) return MIN_HZ;
  if (value >= 1000) return MAX_HZ;
  const raw = Math.exp((value / 1000) * LOG_MAX);
  if (raw < 20) return Math.round(raw);
  if (raw < 1000) return Math.round(raw / 5) * 5;
  if (raw < 10_000) return Math.round(raw / 100) * 100;
  return Math.min(MAX_HZ, Math.round(raw / 500) * 500);
}

export function TopBar({
  presets,
  activePresetId,
  onLoadPreset,
  circuitName,
  isRunning,
  onToggleRun,
  onStep,
  onReset,
  clockHz,
  onClockHzChange,
  stats,
  toolMode,
  onToolModeChange,
  wireStyle,
  onWireStyleChange,
  onFitToView,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExportJson,
  onImportJsonClick,
  onOpenHelp,
  onMacroDuplicateAll,
  onGenerateBenchmarkChip,
  onNavigateProjects,
}: TopBarProps) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const benchmarkRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!presetsOpen && !benchmarkOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPresetsOpen(false);
      }
      if (benchmarkRef.current && !benchmarkRef.current.contains(e.target as Node)) {
        setBenchmarkOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPresetsOpen(false);
        setBenchmarkOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [presetsOpen, benchmarkOpen]);

  const sliderValue = hzToSlider(clockHz);

  return (
    <div className="relative z-40 shrink-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2633] bg-[#0E131A]/95 px-3 py-1.5 backdrop-blur-md">
        {/* Active Circuit Pill + Transport */}
        <div className="flex items-center gap-2.5">
          <div
            className="flex max-w-[210px] items-center gap-2 rounded-xl border border-[#1E2633] bg-[#090C10]/90 px-2.5 py-1"
            title={`Aktif Devre: ${circuitName}`}
          >
            <Cpu className="h-3.5 w-3.5 shrink-0 text-[#00E5FF]" />
            <div className="min-w-0 leading-none">
              <span className="block text-[9px] font-semibold tracking-wider text-slate-500 uppercase">
                Aktif Devre
              </span>
              <span className="mt-0.5 block truncate text-xs font-semibold text-slate-200">
                {circuitName}
              </span>
            </div>
          </div>

          <div className="hidden h-5 w-px bg-[#1E2633] sm:block" />

          {/* Transport Controls */}
          <div className="flex items-center gap-1 rounded-xl border border-[#1E2633] bg-[#090C10]/90 p-1">
            <button
              type="button"
              onClick={onToggleRun}
              title={isRunning ? 'Simülasyonu Duraklat' : 'Simülasyonu Başlat'}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                isRunning
                  ? 'bg-[#00E5FF] text-[#090C10] shadow-[0_0_14px_rgba(0,229,255,0.35)] hover:bg-[#33ecff]'
                  : 'bg-[#141B24] text-slate-200 hover:bg-[#1E2633] hover:text-[#00E5FF]'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Duraklat</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Başlat</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onStep}
              title="Tek Fiziksel Yayılım Adımı (Tick)"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-[#141B24] hover:text-[#00E5FF]"
            >
              <StepForward className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Adım</span>
            </button>

            <button
              type="button"
              onClick={onReset}
              title="Simülasyonu Sıfırla"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-[#141B24] hover:text-amber-300"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Sıfırla</span>
            </button>
          </div>
        </div>

        {/* Simulation Speed (Tick/sn) + Live Silicon Telemetry */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-[#1E2633] bg-[#090C10]/90 px-2.5 py-1">
            <span className="text-[10px] font-medium text-slate-400 uppercase">
              Simülasyon Hızı
            </span>
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={sliderValue}
              onChange={(e) => onClockHzChange(sliderToHz(Number(e.target.value)))}
              aria-label="Simülasyon Hızı (Tick/sn)"
              className="h-1.5 w-24 cursor-pointer accent-[#00E5FF] sm:w-28"
            />
            <span className="w-20 text-right font-mono text-[11px] font-semibold text-[#00E5FF]">
              {formatHz(clockHz)}
            </span>
            <div className="hidden items-center gap-0.5 border-l border-[#1E2633] pl-2 md:flex">
              {TICK_PRESET_PILLS.map((pill) => {
                const active =
                  Math.abs(clockHz - pill.hz) <= Math.max(1, pill.hz * 0.05);
                return (
                  <button
                    key={pill.label}
                    type="button"
                    onClick={() => onClockHzChange(pill.hz)}
                    className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                      active
                        ? 'bg-[#00E5FF]/20 font-semibold text-[#00E5FF]'
                        : 'text-slate-400 hover:bg-[#141B24] hover:text-slate-200'
                    }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Silicon Telemetry Pill */}
          <div className="flex items-center gap-2 rounded-xl border border-[#1E2633] bg-[#090C10]/90 px-2.5 py-1 font-mono text-[11px]">
            <span
              className="flex items-center gap-1 text-slate-200"
              title="Toplam Fiziksel Transistör Sayısı"
            >
              <span className="text-[10px] text-slate-500">TX:</span>
              <span className="font-semibold text-[#00E5FF]">
                {stats.transistorCount.toLocaleString('tr-TR')}
              </span>
            </span>
            <span className="text-slate-700">·</span>
            <span
              className="hidden items-center gap-1 text-slate-300 sm:flex"
              title="Aktif Düğüm (Net) / Anahtarlama Adası"
            >
              <span className="text-[10px] text-slate-500">Düğüm/Ada:</span>
              <span>
                {stats.netCount.toLocaleString('tr-TR')}/
                {stats.islandCount.toLocaleString('tr-TR')}
              </span>
            </span>
            <span className="hidden text-slate-700 sm:inline">·</span>
            <span className="flex items-center gap-1.5 text-slate-300" title="Gerçekleşen Tick/sn">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isRunning ? 'bg-[#00E5FF] shadow-[0_0_6px_#00E5FF]' : 'bg-slate-600'
                }`}
              />
              {isRunning ? formatHz(stats.effectiveHz) : 'Durdu'}
            </span>
            <span className="text-slate-700">·</span>
            <span className="text-slate-400" title="Render Kare Hızı">
              {Math.round(stats.fps)} FPS
            </span>
            {stats.hasShortCircuit && (
              <span className="inline-flex animate-pulse items-center gap-1 rounded-md border border-red-500/50 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#EF4444]">
                <AlertTriangle className="h-3 w-3" />
                Kısa Devre (ERR)!
              </span>
            )}
          </div>
        </div>

        {/* Tools, File, Presets, Help */}
        <div className="flex items-center gap-1.5">
          {/* Tool Mode */}
          <div className="flex items-center rounded-lg border border-[#1E2633] bg-[#090C10]/90 p-0.5">
            <button
              type="button"
              onClick={() => onToolModeChange('select')}
              title="Seçim Aracı"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                toolMode === 'select' || toolMode === 'place'
                  ? 'bg-[#141B24] text-[#00E5FF]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MousePointer2 className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Seç</span>
            </button>
            <button
              type="button"
              onClick={() => onToolModeChange('pan')}
              title="Tuvali Kaydır"
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                toolMode === 'pan'
                  ? 'bg-[#141B24] text-[#00E5FF]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Hand className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Kaydır</span>
            </button>
          </div>

          {/* Wire Style */}
          <button
            type="button"
            onClick={() =>
              onWireStyleChange(wireStyle === 'orthogonal' ? 'bezier' : 'orthogonal')
            }
            title="Kablo Çizim Stilini Değiştir"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E2633] bg-[#090C10]/90 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-[#00E5FF]"
          >
            <Spline className="h-3.5 w-3.5 text-[#00E5FF]" />
            <span className="hidden lg:inline">
              {wireStyle === 'orthogonal' ? '90° Ortogonal' : 'Bezier'}
            </span>
          </button>

          {/* Fit to view */}
          <button
            type="button"
            onClick={onFitToView}
            title="Ekrana Sığdır (F)"
            className="inline-flex items-center gap-1 rounded-lg border border-[#1E2633] bg-[#090C10]/90 px-2 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-[#00E5FF]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Sığdır</span>
          </button>

          {/* Undo / Redo */}
          <div className="flex items-center rounded-lg border border-[#1E2633] bg-[#090C10]/90 p-0.5">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title="Geri Al (Ctrl+Z)"
              className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-[#141B24] hover:text-[#00E5FF] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title="İleri Al (Ctrl+Y)"
              className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-[#141B24] hover:text-[#00E5FF] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Export / Import */}
          <div className="flex items-center rounded-lg border border-[#1E2633] bg-[#090C10]/90 p-0.5">
            <button
              type="button"
              onClick={onExportJson}
              title="JSON Olarak Dışa Aktar"
              className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-[#141B24] hover:text-[#00E5FF]"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onImportJsonClick}
              title="JSON Dosyası İçe Aktar"
              className="rounded-md p-1.5 text-slate-300 transition-colors hover:bg-[#141B24] hover:text-[#00E5FF]"
            >
              <Upload className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Help */}
          <button
            type="button"
            onClick={onOpenHelp}
            title="Yardım ve Kısayollar (?)"
            className="rounded-lg border border-[#1E2633] bg-[#090C10]/90 p-1.5 text-slate-300 transition-colors hover:border-slate-700 hover:text-[#00E5FF]"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* Benchmark / Chip Generator Stress-Test Menu */}
          {onGenerateBenchmarkChip && (
            <div className="relative" ref={benchmarkRef}>
              <button
                type="button"
                onClick={() => {
                  setBenchmarkOpen((prev) => !prev);
                  setPresetsOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/50 bg-amber-500/15 px-2.5 py-1.5 text-xs font-bold text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.18)] transition-all hover:border-amber-400 hover:bg-amber-500/25"
              >
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                <span>Benchmark / Chip Generator</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    benchmarkOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {benchmarkOpen && (
                <div className="absolute right-0 mt-2">
                  <BenchmarkMenu
                    activeTransistorCount={stats.transistorCount}
                    onSelectBenchmark={(targetTx, recHz) => {
                      onGenerateBenchmarkChip(targetTx, recHz);
                      setBenchmarkOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Örnek Devreler & Matris Test Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => {
                setPresetsOpen((prev) => !prev);
                setBenchmarkOpen(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2.5 py-1.5 text-xs font-semibold text-[#00E5FF] transition-all hover:bg-[#00E5FF]/20"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Sahne &amp; Matris</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  presetsOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {presetsOpen && (
              <div className="absolute right-0 mt-2 max-h-[calc(100vh-7rem)] w-80 overflow-y-auto rounded-2xl border border-[#1E2633] bg-[#0E131A]/95 p-2 shadow-2xl backdrop-blur-md">
                <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                  Saf Transistör Başlangıç Sahneleri
                </div>
                <div className="space-y-1">
                  {presets.map((preset) => {
                    const isActive = preset.id === activePresetId;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          onLoadPreset(preset.id);
                          setPresetsOpen(false);
                        }}
                        className={`w-full rounded-xl border p-2.5 text-left transition-all ${
                          isActive
                            ? 'border-[#00E5FF]/50 bg-[#00E5FF]/10'
                            : 'border-transparent hover:border-[#1E2633] hover:bg-[#141B24]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-xs font-semibold ${
                              isActive ? 'text-[#00E5FF]' : 'text-slate-100'
                            }`}
                          >
                            {preset.name}
                          </span>
                          <span className="shrink-0 rounded border border-[#1E2633] bg-[#090C10] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                            {formatHz(preset.defaultClockHz)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] font-medium text-slate-400">
                          {preset.subtitle}
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500">
                          {preset.description}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {onMacroDuplicateAll && (
                  <div className="mt-2 border-t border-[#1E2633] pt-2">
                    <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                      Hızlı Silikon Matris Çoğaltma (Açık Transistör)
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-1 px-1">
                      {([10, 100, 1000] as const).map((copies) => (
                        <button
                          key={copies}
                          type="button"
                          onClick={() => {
                            onMacroDuplicateAll(copies);
                            setPresetsOpen(false);
                          }}
                          className="flex items-center justify-center gap-1 rounded-lg border border-[#1E2633] bg-[#090C10] py-1.5 font-mono text-[11px] font-semibold text-[#00E5FF] transition-colors hover:border-[#00E5FF]/50 hover:bg-[#00E5FF]/10"
                        >
                          <CopyPlus className="h-3 w-3" />
                          <span>×{copies}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {onNavigateProjects && (
                  <div className="mt-2 border-t border-[#1E2633] pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPresetsOpen(false);
                        onNavigateProjects();
                      }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#00E5FF]/35 bg-[#00E5FF]/10 px-3 py-2 text-xs font-semibold text-[#00E5FF] transition-all hover:border-[#00E5FF]/60 hover:bg-[#00E5FF]/20"
                    >
                      <span>{EXAMPLE_PROJECTS.length} Örnek JSON Projesini Aç →</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
