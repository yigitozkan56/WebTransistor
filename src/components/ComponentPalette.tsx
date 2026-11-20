import { useMemo, useState } from 'react';
import {
  Cpu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from 'lucide-react';
import {
  PALETTE_CATALOG,
  PALETTE_CATEGORIES,
  type PaletteCatalogItem,
} from '../engine/componentDefs';
import type {
  ComponentProps,
  ComponentType,
} from '../types/circuit';
import type { PendingPlacement } from '../types/ui';

export interface ComponentPaletteProps {
  pendingPlacement: PendingPlacement | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectPlacement: (type: ComponentType, props?: ComponentProps) => void;
}

function ComponentMiniGlyph({ type }: { type: ComponentType }) {
  switch (type) {
    case 'NMOS':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M4 12h4M8 7v10M11 7v10M11 8h6V4M11 16h6v4M17 12l-3-2v4l3-2z" />
        </svg>
      );
    case 'PMOS':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M3 12h3M10 7v10M13 7v10M13 8h5V4M13 16h5v4" />
          <circle cx="7.5" cy="12" r="1.5" />
        </svg>
      );
    case 'VCC':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 19V7M6 7h12" />
          <circle cx="12" cy="4.5" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'GND':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 5v7M6 12h12M8.5 15.5h7M10.5 19h3" />
        </svg>
      );
    case 'PULL_UP':
    case 'PULL_DOWN':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 3v3l2.5 1.5L9.5 10l5 2.5-5 2.5 2.5 1.5V21" />
        </svg>
      );
    case 'TOGGLE_SWITCH':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75">
          <rect x="3" y="7.5" width="18" height="9" rx="4.5" />
          <circle cx="16.5" cy="12" r="2.5" fill="currentColor" />
        </svg>
      );
    case 'PUSH_BUTTON':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75">
          <rect x="4" y="6" width="16" height="12" rx="3" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'LED':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
        </svg>
      );
    case 'PIXEL_MATRIX':
      return (
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M8 9h2v2H8zM13 9h2v2h-2zM8 13h2v2H8zM13 13h2v2h-2z" fill="currentColor" />
        </svg>
      );
    default:
      return <Cpu className="h-4 w-4 shrink-0" />;
  }
}

export function ComponentPalette({
  pendingPlacement,
  isCollapsed,
  onToggleCollapse,
  onSelectPlacement,
}: ComponentPaletteProps) {
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLocaleLowerCase('tr');

  const filteredCatalog = useMemo(() => {
    if (!normalizedQuery) return PALETTE_CATALOG;
    return PALETTE_CATALOG.filter(
      (item) =>
        item.name.toLocaleLowerCase('tr').includes(normalizedQuery) ||
        item.shortName.toLocaleLowerCase('tr').includes(normalizedQuery) ||
        item.description.toLocaleLowerCase('tr').includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  const handleDragStart = (
    e: React.DragEvent<HTMLElement>,
    type: ComponentType,
    props?: ComponentProps,
  ) => {
    e.dataTransfer.setData(
      'application/x-webtransistor-component',
      JSON.stringify({ type, props: props ?? {} }),
    );
    e.dataTransfer.effectAllowed = 'copy';
  };

  if (isCollapsed) {
    return (
      <aside className="z-20 flex w-10 shrink-0 flex-col items-center border-r border-[#1E2633] bg-[#0E131A]/95 py-2.5 backdrop-blur-md">
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Silikon Paletini Aç"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-[#141B24] hover:text-[#00E5FF]"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
        <div
          className="mt-4 select-none text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
          style={{ writingMode: 'vertical-rl' }}
        >
          Silikon
        </div>
      </aside>
    );
  }

  return (
    <aside className="z-20 flex w-56 shrink-0 flex-col border-r border-[#1E2633] bg-[#0E131A]/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1E2633] px-3 py-2.5">
        <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase">
          Fiziksel Bileşenler
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Paleti Daralt"
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-[#141B24] hover:text-slate-100"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-[#1E2633] p-2">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bileşen ara..."
            className="w-full rounded-lg border border-[#1E2633] bg-[#090C10]/90 py-1.5 pr-7 pl-8 text-xs text-slate-200 placeholder-slate-500 outline-none transition-colors focus:border-[#00E5FF]/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 rounded p-0.5 text-slate-500 hover:text-slate-200"
              aria-label="Aramayı temizle"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable catalog */}
      <div className="flex-1 space-y-4 overflow-y-auto px-2 py-2.5">
        {PALETTE_CATEGORIES.map((category) => {
          const items: PaletteCatalogItem[] = filteredCatalog.filter(
            (item) => item.category === category,
          );
          if (items.length === 0) return null;

          return (
            <div key={category}>
              <div className="mb-1.5 px-1.5 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                {category}
              </div>
              <div className="space-y-1">
                {items.map((item) => {
                  const isActive = pendingPlacement?.type === item.type;

                  return (
                    <button
                      key={item.type}
                      type="button"
                      draggable
                      onDragStart={(e) =>
                        handleDragStart(e, item.type, item.defaultProps)
                      }
                      onClick={() =>
                        onSelectPlacement(item.type, item.defaultProps)
                      }
                      title={item.description}
                      className={`group flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all ${
                        isActive
                          ? 'border-[#00E5FF]/60 bg-[#00E5FF]/12 text-[#00E5FF] shadow-[0_0_12px_rgba(0,229,255,0.12)]'
                          : 'border-[#1E2633] bg-[#090C10]/60 text-slate-300 hover:border-slate-700 hover:bg-[#141B24] hover:text-slate-100'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={
                            isActive
                              ? 'text-[#00E5FF]'
                              : 'text-slate-400 group-hover:text-[#00E5FF]'
                          }
                        >
                          <ComponentMiniGlyph type={item.type} />
                        </span>
                        <span className="truncate font-medium">{item.name}</span>
                      </span>
                      {item.shortcut && (
                        <kbd
                          className={`shrink-0 rounded border px-1 py-0.5 font-mono text-[10px] ${
                            isActive
                              ? 'border-[#00E5FF]/40 bg-[#00E5FF]/15 text-[#00E5FF]'
                              : 'border-[#1E2633] bg-[#090C10] text-slate-500'
                          }`}
                        >
                          {item.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="rounded-xl border border-[#1E2633] bg-[#090C10]/70 p-2.5 text-[11px] leading-relaxed text-slate-400">
          <div className="font-semibold text-[#00E5FF]">Saf Silikon Kuralı</div>
          <p className="mt-1">
            Hazır lojik kapı veya kapalı kutu IC yoktur. Kurduğunuz transistör
            bloklarını seçip <span className="text-slate-200">Ctrl+D</span> veya{' '}
            <span className="text-slate-200">Matris Kopyala (×10 / ×100)</span>{' '}
            ile açık transistör dizileri olarak çoğaltabilirsiniz.
          </p>
        </div>
      </div>
    </aside>
  );
}
