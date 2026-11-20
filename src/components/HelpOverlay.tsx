import { useEffect } from 'react';
import { Cpu, Keyboard, MousePointer2, Sparkles, X } from 'lucide-react';

export interface HelpOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string[];
  label: string;
}

const GENERAL_SHORTCUTS: ShortcutRow[] = [
  { keys: ['1', '–', '0'], label: 'Hızlı bileşen seç (NMOS, PMOS, PU, PD, VCC, GND, SW, BTN, LED, MAT)' },
  { keys: ['R'], label: 'Seçili bileşeni 90° saat yönünde döndür' },
  { keys: ['Ctrl', 'C'], label: 'Seçili transistör bloğunu ve iç kablolarını kopyala' },
  { keys: ['Ctrl', 'V'], label: 'Panodaki açık transistör bloğunu yapıştır' },
  { keys: ['Ctrl', 'D'], label: 'Seçimi açık transistör ve kablolar olarak çoğalt (+40px)' },
  { keys: ['Ctrl', 'Z'], label: 'Son işlemi geri al' },
  { keys: ['Ctrl', 'Y'], label: 'İleri al (veya Ctrl+Shift+Z)' },
  { keys: ['Del'], label: 'Seçili bileşenleri ve kabloları sil' },
  { keys: ['F'], label: 'Devreyi ekrana sığdır (Fit-to-View)' },
  { keys: ['Esc'], label: 'Yerleştirme, kablo çizimi veya seçimi iptal et' },
];

const SILICON_PRINCIPLES: Array<{ title: string; desc: string }> = [
  {
    title: 'Sıfır Hazır Kapı & Sıfır Kara Kutu (Zero Abstraction)',
    desc: 'AND, OR, NOT, Flip-Flop veya kapalı kutu IC yoktur. Tüm mantık kapıları ve bellek hücreleri yalnızca gerçek NMOS ve PMOS transistörlerin bacaklarından (Gate, Drain, Source) kurulur.',
  },
  {
    title: 'Yapay Saat Yok — Transistörlü Halka Osilatör',
    desc: 'Hazır Clock bileşeni yoktur. Saat sinyali üretmek için tek sayıda (örn. 3 veya 5) transistörlü inverter halkası (Ring Oscillator) kurarak devrenin kendi kendine fiziksel olarak salınmasını sağlarsınız.',
  },
  {
    title: 'Sürücüsüz Ham Piksel Matrisi (PIXEL_MATRIX)',
    desc: '4×4 (16 bacak) veya 8×8 (64 bacak) LED matrisinin içinde gizli çip yoktur. Her pikselin doğrudan kendi fiziksel giriş bacağı (P_y_x) bulunur; transistör çıkışı doğrudan piksele bağlanır.',
  },
  {
    title: '1.000.000+ Transistör SoA Motoru & LOD',
    desc: 'Structure-of-Arrays (Int32Array / Uint8Array) mimarisi ve Web Worker çözücüsü sayesinde seçtiğiniz devreyi ×10, ×100, ×1000 matris olarak açıkça kopyalayabilir, uzaklaştığınızda Silikon Yoğunluk Haritası (LOD) ile 60 FPS izleyebilirsiniz.',
  },
];

export function HelpOverlay({ isOpen, onClose }: HelpOverlayProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-modal-title"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#1E2633] bg-[#0E131A]/95 shadow-2xl backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#1E2633] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#00E5FF]/30 bg-[#00E5FF]/10 text-[#00E5FF]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 id="help-modal-title" className="text-sm font-semibold text-slate-100">
                WebTransistor Mimari Kılavuzu &amp; Kısayollar
              </h2>
              <p className="text-xs text-slate-400">
                Sıfır soyutlama, %100 saf NMOS/PMOS silikon transistör simülatörü
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#141B24] hover:text-slate-100"
            aria-label="Yardım penceresini kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-5 text-xs text-slate-300">
          {/* WebTransistor Core Principles */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#00E5FF]">
              <Cpu className="h-3.5 w-3.5" />
              <span>WebTransistor Felsefesi</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {SILICON_PRINCIPLES.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-[#1E2633] bg-[#090C10]/80 p-3"
                >
                  <div className="font-medium text-slate-100">{item.title}</div>
                  <p className="mt-1 leading-relaxed text-slate-400">{item.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Mouse & Canvas Controls */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#00E5FF]">
              <MousePointer2 className="h-3.5 w-3.5" />
              <span>Fare, Tuval &amp; Fiziksel Tuş Atamaları</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/80 p-3">
                <div className="font-medium text-slate-100">Kaydırma &amp; LOD Yakınlaştırma</div>
                <p className="mt-1 leading-relaxed text-slate-400">
                  Orta/sağ fare tuşuyla sürükleyerek tuvali gezebilir, fare tekerleğiyle
                  yakınlaşabilirsiniz. Çok uzaklaştığınızda görüntü otomatik olarak yüksek
                  performanslı <span className="text-slate-200">Silikon Kalıp (LOD)</span> moduna
                  geçer.
                </p>
              </div>
              <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/80 p-3">
                <div className="font-medium text-slate-100">Mekanik Anahtar &amp; Klavye Ataması</div>
                <p className="mt-1 leading-relaxed text-slate-400">
                  <span className="text-slate-200">Anahtar (Switch)</span> veya{' '}
                  <span className="text-slate-200">Buton</span> seçiliyken sağ panelden bir klavye
                  tuşu (örn. <kbd className="rounded border border-[#1E2633] bg-[#141B24] px-1">A</kbd>,{' '}
                  <kbd className="rounded border border-[#1E2633] bg-[#141B24] px-1">Space</kbd>)
                  atayarak fiziksel tuşlarla devreyi sürebilirsiniz.
                </p>
              </div>
            </div>
          </section>

          {/* Keyboard Shortcuts */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#00E5FF]">
              <Keyboard className="h-3.5 w-3.5" />
              <span>Klavye Kısayolları</span>
            </div>
            <div className="space-y-1.5 rounded-xl border border-[#1E2633] bg-[#090C10]/80 p-3">
              {GENERAL_SHORTCUTS.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 border-b border-[#1E2633]/60 py-1 last:border-b-0"
                >
                  <span className="text-slate-300">{row.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {row.keys.map((k, idx) => (
                      <kbd
                        key={`${k}-${idx}`}
                        className="rounded border border-[#1E2633] bg-[#141B24] px-1.5 py-0.5 font-mono text-[10px] text-slate-200"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex justify-end border-t border-[#1E2633] bg-[#090C10]/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#00E5FF] px-4 py-1.5 text-xs font-semibold text-[#090C10] transition-colors hover:bg-[#33ecff]"
          >
            Anladım
          </button>
        </div>
      </div>
    </div>
  );
}
