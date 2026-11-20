import { Cpu, Flame, Sparkles, Zap } from 'lucide-react';

export interface BenchmarkChipOption {
  targetTransistors: number;
  title: string;
  subtitle: string;
  description: string;
  recommendedHz: number;
  badge: string;
  accentClass: string;
}

export const BENCHMARK_CHIP_OPTIONS: BenchmarkChipOption[] = [
  {
    targetTransistors: 10_000,
    title: '10.000 Transistör',
    subtitle: '2.500× CMOS NAND + Ring Oscillator Saat Ağı',
    description:
      'Otonom 3T Ring Oscillator saat üreteçleri ile sürülen 2.500 adet saf 4T CMOS NAND kapısı ve evirici zincirleri.',
    recommendedHz: 25_000,
    badge: '10K TX',
    accentClass: 'text-[#00E5FF] border-[#00E5FF]/40 bg-[#00E5FF]/10',
  },
  {
    targetTransistors: 100_000,
    title: '100.000 Transistör',
    subtitle: '25.000× CMOS NAND + Çoklu Ring Oscillator Stres Testi',
    description:
      'WebGPU WGSL Two-Pass Parallel Solver ve WebGL2 Instanced Renderer için 100K fiziksel NMOS/PMOS silikon stres testi.',
    recommendedHz: 150_000,
    badge: '100K TX',
    accentClass: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  },
  {
    targetTransistors: 250_000,
    title: '250.000 Transistör',
    subtitle: '62.500× CMOS NAND + Yüksek Yoğunluklu Silikon Kalıp',
    description:
      'Çeyrek milyon fiziksel transistörlü yüksek yoğunluklu CMOS silikon kalıp ve termal akım yoğunluğu haritası.',
    recommendedHz: 150_000,
    badge: '250K TX',
    accentClass: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  },
  {
    targetTransistors: 1_000_000,
    title: '1.000.000 Transistör',
    subtitle: '250.000× CMOS NAND — Tam Ölçekli VLSI Silikon Yonga Stres Testi',
    description:
      '1.000.000+ saf fiziksel NMOS/PMOS transistör! Tek WebGL2 drawArraysInstanced çağrısı ve paralel GPU çözücü ile tam ölçekli VLSI stres testi.',
    recommendedHz: 150_000,
    badge: '1M+ TX',
    accentClass: 'text-rose-400 border-rose-500/50 bg-rose-500/15',
  },
];

export interface BenchmarkMenuProps {
  activeTransistorCount?: number;
  onSelectBenchmark: (targetTransistors: number, recommendedHz: number) => void;
}

export function BenchmarkMenu({
  activeTransistorCount = 0,
  onSelectBenchmark,
}: BenchmarkMenuProps) {
  return (
    <div className="w-96 rounded-2xl border border-[#1E2633] bg-[#0E131A]/95 p-2.5 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-[#1E2633] px-2 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-400">
            <Flame className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-100">
              Benchmark / Chip Generator
            </div>
            <div className="text-[10px] text-slate-400">
              %100 Saf Fiziksel NMOS/PMOS Silikon Kalıp Üreteci
            </div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#00E5FF]">
          <Sparkles className="h-2.5 w-2.5" />
          GPU/SoA
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        {BENCHMARK_CHIP_OPTIONS.map((opt) => {
          const isCurrentScale =
            activeTransistorCount >= opt.targetTransistors &&
            activeTransistorCount < opt.targetTransistors * 1.35;

          return (
            <button
              key={opt.targetTransistors}
              type="button"
              onClick={() =>
                onSelectBenchmark(opt.targetTransistors, opt.recommendedHz)
              }
              className={`group w-full rounded-xl border p-2.5 text-left transition-all ${
                isCurrentScale
                  ? 'border-[#00E5FF]/60 bg-[#00E5FF]/10'
                  : 'border-[#1E2633]/80 bg-[#090C10]/70 hover:border-[#00E5FF]/50 hover:bg-[#141B24]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-100 group-hover:text-[#00E5FF]">
                  <Cpu className="h-3.5 w-3.5 text-[#00E5FF]" />
                  <span>{opt.title}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-0.5 rounded border border-[#1E2633] bg-[#090C10] px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                    <Zap className="h-2.5 w-2.5 text-amber-400" />
                    {opt.recommendedHz >= 1000
                      ? `${opt.recommendedHz / 1000}k TPS`
                      : `${opt.recommendedHz} TPS`}
                  </span>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold ${opt.accentClass}`}
                  >
                    {opt.badge}
                  </span>
                </div>
              </div>

              <div className="mt-1 text-[11px] font-semibold text-amber-300/90">
                {opt.subtitle}
              </div>

              <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
