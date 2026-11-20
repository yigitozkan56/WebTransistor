import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Flame,
  Gauge,
  Layers,
  Zap,
} from 'lucide-react';
import type { CircuitPreset, ComputeBackendType } from '../types/circuit';
import type { SimulationStats } from '../types/ui';

export interface HardwareMonitorProps {
  stats: SimulationStats;
  isRunning?: boolean;
  activePreset?: CircuitPreset | null;
  onGenerateBenchmark?: (targetTransistors: number) => void;
}

export function formatTransistorCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count >= 1_000_000) {
    return `${count.toLocaleString('tr-TR')}+`;
  }
  return count.toLocaleString('tr-TR');
}

export function formatTps(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '0 TPS';
  if (hz >= 1_000_000) {
    return `${(hz / 1_000_000).toFixed(2)}M TPS`;
  }
  if (hz >= 1_000) {
    const k = hz / 1_000;
    return k >= 100 ? `${Math.round(k)}k TPS` : `${k.toFixed(1)}k TPS`;
  }
  return `${Math.round(hz)} TPS`;
}

function resolveComputeBackend(stats: SimulationStats): ComputeBackendType {
  if (stats.backend) return stats.backend;
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return 'Native Vulkan/DX12/CUDA (Tauri)';
  }
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    return 'WebGPU (WGSL Compute)';
  }
  if (typeof SharedArrayBuffer !== 'undefined') {
    return 'SharedArrayBuffer Worker';
  }
  return 'CPU Fallback (SoA Worker)';
}

export function HardwareMonitor({
  stats,
  isRunning = true,
  activePreset = null,
  onGenerateBenchmark,
}: HardwareMonitorProps) {
  const [collapsed, setCollapsed] = useState(false);

  const backend = resolveComputeBackend(stats);
  const renderMode = stats.renderMode ?? 'WebGL2 Instanced';
  const fps = Math.max(0, Math.round(stats.fps || 60));

  // Color-coded FPS health indicator
  const fpsColorClass =
    fps >= 50
      ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
      : fps >= 30
        ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
        : 'text-red-400 border-red-500/40 bg-red-500/10';

  const fpsDotClass =
    fps >= 50
      ? 'bg-emerald-400 shadow-[0_0_8px_#22C55E]'
      : fps >= 30
        ? 'bg-amber-400 shadow-[0_0_8px_#F59E0B]'
        : 'bg-red-400 shadow-[0_0_8px_#EF4444]';

  // Progress bar scale up to 1,000,000 TX (hybrid log/linear feel so 10k-1M is clearly visible)
  const txCount = Math.max(0, stats.transistorCount);
  const txProgressPercent =
    txCount <= 0
      ? 0
      : txCount >= 1_000_000
        ? 100
        : Math.min(
            100,
            Math.max(
              4,
              Math.round((Math.log10(Math.max(1, txCount)) / 6) * 100),
            ),
          );

  const isGpuAccelerated =
    backend === 'WebGPU (WGSL Compute)' ||
    backend === 'Native Vulkan/DX12/CUDA (Tauri)';

  return (
    <aside
      aria-label="Silikon Donanım ve Performans Monitörü"
      className="pointer-events-auto absolute top-3 right-3 z-20 w-76 rounded-2xl border border-[#1E2633] bg-[#0E131A]/95 shadow-2xl backdrop-blur-md transition-all"
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF]">
            <Activity className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-tight text-slate-100">
              <span>Donanım &amp; Performans</span>
              <span
                className={`h-2 w-2 rounded-full ${
                  isRunning
                    ? 'bg-[#00E5FF] shadow-[0_0_8px_#00E5FF]'
                    : 'bg-slate-600'
                }`}
              />
            </div>
            <div className="font-mono text-[10px] text-slate-400">
              {formatTransistorCount(txCount)} TX · {formatTps(stats.effectiveHz)} · {fps} FPS
            </div>
          </div>
        </div>
        {collapsed ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {!collapsed && (
        <div className="space-y-3 border-t border-[#1E2633] px-3.5 py-3 text-xs">
          {/* Active Compute Backend & Render Engine Badges */}
          <div className="space-y-1.5 rounded-xl border border-[#1E2633] bg-[#090C10]/90 p-2.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                Aktif Compute Backend
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#00E5FF]">
                <Layers className="h-2.5 w-2.5" />
                {renderMode}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Cpu
                className={`h-3.5 w-3.5 shrink-0 ${
                  isGpuAccelerated ? 'text-[#00E5FF]' : 'text-amber-400'
                }`}
              />
              <span
                className={`truncate font-mono text-[11px] font-semibold ${
                  isGpuAccelerated ? 'text-slate-100' : 'text-amber-300'
                }`}
                title={backend}
              >
                {backend}
              </span>
            </div>

            {stats.gpuDeviceName && (
              <div className="truncate font-mono text-[10px] text-slate-400">
                GPU: {stats.gpuDeviceName}
              </div>
            )}
          </div>

          {/* Total Transistor Count (TX) + 1.000.000 TX Scale Bar */}
          <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/90 p-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                Toplam Transistör (TX)
              </span>
              <span className="font-mono text-sm font-bold text-[#00E5FF]">
                {formatTransistorCount(txCount)}
              </span>
            </div>

            {/* Progress Bar up to 1.000.000 TX */}
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#141B24] p-0.5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#00E5FF] via-cyan-300 to-amber-400 transition-all duration-300"
                style={{
                  width: `${txProgressPercent}%`,
                  boxShadow: '0 0 10px rgba(0, 229, 255, 0.5)',
                }}
              />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[9px] text-slate-500">
              <span>0</span>
              <span>10K</span>
              <span>100K</span>
              <span>250K</span>
              <span className="text-[#00E5FF]">1.000.000 TX</span>
            </div>
          </div>

          {/* Live TPS & FPS Telemetry Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/85 px-2.5 py-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase">
                <span>Simülasyon (TPS)</span>
                <Zap className="h-3 w-3 text-[#00E5FF]" />
              </div>
              <div className="mt-0.5 font-mono text-sm font-bold text-[#00E5FF]">
                {isRunning ? formatTps(stats.effectiveHz) : 'Duraklatıldı'}
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
                Tick: {stats.tickCount.toLocaleString('tr-TR')}
              </div>
            </div>

            <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/85 px-2.5 py-2">
              <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase">
                <span>Render (FPS)</span>
                <Gauge className="h-3 w-3 text-emerald-400" />
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${fpsDotClass}`} />
                <span className="font-mono text-sm font-bold text-slate-100">
                  {fps} FPS
                </span>
              </div>
              <div className="mt-0.5">
                <span
                  className={`inline-block rounded border px-1 py-0.2 font-mono text-[9px] font-semibold ${fpsColorClass}`}
                >
                  {fps >= 50 ? '60Hz Akıcı' : fps >= 30 ? 'Orta Yük' : 'Ağır Yük'}
                </span>
              </div>
            </div>
          </div>

          {/* Nodes (Net) & Switching Islands */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/80 px-2.5 py-1.5">
              <div className="text-[10px] text-slate-500 uppercase">
                Düğüm (Net)
              </div>
              <div className="font-mono text-xs font-semibold text-slate-200">
                {stats.netCount.toLocaleString('tr-TR')}
              </div>
            </div>
            <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/80 px-2.5 py-1.5">
              <div className="text-[10px] text-slate-500 uppercase">
                Anahtarlama Adası
              </div>
              <div className="font-mono text-xs font-semibold text-slate-200">
                {stats.islandCount.toLocaleString('tr-TR')}
              </div>
            </div>
          </div>

          {/* Short-Circuit (ERR) Contention Status */}
          <div
            className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[11px] font-medium ${
              stats.hasShortCircuit
                ? 'animate-pulse border-red-500/50 bg-red-500/15 text-red-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            }`}
          >
            {stats.hasShortCircuit ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                <span>Kısa Devre (ERR) Çekişmesi Algılandı!</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span>VCC / GND Güç Rayları Kararlı</span>
              </>
            )}
          </div>

          {/* Quick 1-Click Silicon Benchmark Bar */}
          {onGenerateBenchmark && (
            <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/90 p-2">
              <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
                <span className="flex items-center gap-1">
                  <Flame className="h-3 w-3" />
                  <span>Hızlı Silikon Stres Testi</span>
                </span>
                <span className="font-mono text-[9px] text-slate-500">1-Tık Yonga</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    { label: '10K', count: 10_000 },
                    { label: '100K', count: 100_000 },
                    { label: '250K', count: 250_000 },
                    { label: '1M', count: 1_000_000 },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.count}
                    type="button"
                    onClick={() => onGenerateBenchmark(item.count)}
                    className="rounded-lg border border-[#1E2633] bg-[#141B24] py-1 font-mono text-[10px] font-bold text-[#00E5FF] transition-all hover:border-[#00E5FF]/60 hover:bg-[#00E5FF]/15"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Preset Guide */}
          {activePreset?.controlsHint && (
            <div className="rounded-xl border border-[#00E5FF]/25 bg-[#00E5FF]/8 p-2.5">
              <div className="text-[10px] font-semibold tracking-wider text-[#00E5FF] uppercase">
                Devre Rehberi
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                {activePreset.controlsHint}
              </p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
