import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Binary,
  BookOpen,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Cpu,
  FileCode2,
  Flame,
  FolderKanban,
  HelpCircle,
  Keyboard,
  Layers,
  Play,
  Search,
  ShieldAlert,
  Sparkles,
  Terminal,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  CIRCUIT_DESIGN_GUIDES,
  CMOS_DUALITY_RULES,
  COMPONENT_REFERENCE_LIST,
  COMPUTE_BACKENDS,
  ECOSYSTEM_CARDS,
  ENGINE_PIPELINE_BLOCKS,
  FAQ_ITEMS,
  JSON_EXAMPLE_STRING,
  JSON_SCHEMA_FIELDS,
  JSON_SCHEMA_RULES,
  LOGIC_LATTICE_STATES,
  LOGIC_RESOLUTION_RULES,
  PHILOSOPHY_PILLARS,
  POWER_TOOLS,
  SHORTCUT_REFERENCE,
  WIKI_SECTIONS,
  type WikiSectionId,
} from '../data/wikiContent';
import type { ComponentType } from '../types/circuit';

export interface WikiPageProps {
  onOpenSimulator: () => void;
  onOpenProject: (projectId: string) => void;
  onNavigateProjects: () => void;
}

function normalizeSearch(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .trim();
}

function matchesQuery(normalizedQuery: string, ...fields: Array<string | undefined>): boolean {
  if (!normalizedQuery) return true;
  for (const field of fields) {
    if (field && normalizeSearch(field).includes(normalizedQuery)) {
      return true;
    }
  }
  return false;
}

function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => false);
  }
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return Promise.resolve(ok);
    } catch {
      return Promise.resolve(false);
    }
  }
  return Promise.resolve(false);
}

function ComponentGlyph({ type }: { type: ComponentType }) {
  switch (type) {
    case 'NMOS':
      return (
        <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
          <rect x="4" y="4" width="40" height="40" rx="8" fill="#090C10" stroke="#1E2633" />
          <line x1="8" y1="24" x2="17" y2="24" stroke="#00E5FF" strokeWidth="2" />
          <line x1="17" y1="15" x2="17" y2="33" stroke="#00E5FF" strokeWidth="2" />
          <line x1="22" y1="14" x2="22" y2="20" stroke="#94A3B8" strokeWidth="2" />
          <line x1="22" y1="21" x2="22" y2="27" stroke="#94A3B8" strokeWidth="2" />
          <line x1="22" y1="28" x2="22" y2="34" stroke="#94A3B8" strokeWidth="2" />
          <path d="M22 17h8V8M22 31h8v9M22 24h8v7" fill="none" stroke="#E2E8F0" strokeWidth="1.8" />
          <polygon points="23,24 27,22 27,26" fill="#00E5FF" />
        </svg>
      );
    case 'PMOS':
      return (
        <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
          <rect x="4" y="4" width="40" height="40" rx="8" fill="#090C10" stroke="#1E2633" />
          <line x1="8" y1="24" x2="13" y2="24" stroke="#F59E0B" strokeWidth="2" />
          <circle cx="15" cy="24" r="2.3" fill="#090C10" stroke="#F59E0B" strokeWidth="1.8" />
          <line x1="19" y1="15" x2="19" y2="33" stroke="#F59E0B" strokeWidth="2" />
          <line x1="23" y1="14" x2="23" y2="20" stroke="#94A3B8" strokeWidth="2" />
          <line x1="23" y1="21" x2="23" y2="27" stroke="#94A3B8" strokeWidth="2" />
          <line x1="23" y1="28" x2="23" y2="34" stroke="#94A3B8" strokeWidth="2" />
          <path d="M23 17h8V8M23 31h8v9M23 24h8v7" fill="none" stroke="#E2E8F0" strokeWidth="1.8" />
        </svg>
      );
    case 'PULL_UP':
      return (
        <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
          <rect x="4" y="4" width="40" height="40" rx="8" fill="#090C10" stroke="#1E2633" />
          <line x1="15" y1="11" x2="33" y2="11" stroke="#38BDF8" strokeWidth="2.4" />
          <path
            d="M24 11v4l-4 2.5 8 4-8 4 8 4-4 2.5v8"
            fill="none"
            stroke="#38BDF8"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="24" cy="40" r="2.5" fill="#38BDF8" />
        </svg>
      );
    case 'PULL_DOWN':
      return (
        <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
          <rect x="4" y="4" width="40" height="40" rx="8" fill="#090C10" stroke="#1E2633" />
          <circle cx="24" cy="8" r="2.5" fill="#94A3B8" />
          <path
            d="M24 8v6l-4 2.5 8 4-8 4 8 4-4 2.5v4"
            fill="none"
            stroke="#94A3B8"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <line x1="16" y1="35" x2="32" y2="35" stroke="#64748B" strokeWidth="2" />
          <line x1="19" y1="39" x2="29" y2="39" stroke="#64748B" strokeWidth="2" />
        </svg>
      );
    case 'VCC':
      return (
        <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
          <rect x="4" y="4" width="40" height="40" rx="8" fill="#090C10" stroke="#00E5FF" strokeOpacity="0.45" />
          <path d="M24 11l-8 10h16z" fill="#00E5FF" fillOpacity="0.25" stroke="#00E5FF" strokeWidth="2" />
          <line x1="24" y1="21" x2="24" y2="40" stroke="#00E5FF" strokeWidth="2.2" />
          <circle cx="24" cy="40" r="2.5" fill="#00E5FF" />
        </svg>
      );
    case 'GND':
      return (
        <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
          <rect x="4" y="4" width="40" height="40" rx="8" fill="#090C10" stroke="#1E2633" />
          <circle cx="24" cy="8" r="2.5" fill="#94A3B8" />
          <line x1="24" y1="8" x2="24" y2="25" stroke="#94A3B8" strokeWidth="2.2" />
          <line x1="13" y1="25" x2="35" y2="25" stroke="#E2E8F0" strokeWidth="2.2" />
          <line x1="17" y1="30" x2="31" y2="30" stroke="#94A3B8" strokeWidth="2.2" />
          <line x1="21" y1="35" x2="27" y2="35" stroke="#64748B" strokeWidth="2.2" />
        </svg>
      );
    case 'TOGGLE_SWITCH':
      return (
        <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
          <rect x="4" y="10" width="40" height="28" rx="8" fill="#090C10" stroke="#1E2633" />
          <rect x="9" y="18" width="22" height="12" rx="6" fill="#141B24" stroke="#00E5FF" strokeWidth="1.6" />
          <circle cx="25" cy="24" r="4" fill="#00E5FF" />
          <line x1="31" y1="24" x2="40" y2="24" stroke="#00E5FF" strokeWidth="2" />
          <circle cx="40" cy="24" r="2.4" fill="#00E5FF" />
        </svg>
      );
    case 'PUSH_BUTTON':
      return (
        <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
          <rect x="4" y="10" width="40" height="28" rx="8" fill="#090C10" stroke="#1E2633" />
          <rect x="13" y="16" width="16" height="16" rx="4" fill="#141B24" stroke="#38BDF8" strokeWidth="1.6" />
          <circle cx="21" cy="24" r="4" fill="#38BDF8" />
          <line x1="29" y1="24" x2="40" y2="24" stroke="#38BDF8" strokeWidth="2" />
          <circle cx="40" cy="24" r="2.4" fill="#38BDF8" />
        </svg>
      );
    case 'LED':
      return (
        <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
          <rect x="4" y="4" width="40" height="40" rx="8" fill="#090C10" stroke="#1E2633" />
          <line x1="8" y1="24" x2="17" y2="24" stroke="#00E5FF" strokeWidth="2" />
          <circle cx="8" cy="24" r="2.3" fill="#00E5FF" />
          <circle cx="27" cy="24" r="9.5" fill="#00E5FF" fillOpacity="0.2" stroke="#00E5FF" strokeWidth="2" />
          <circle cx="27" cy="24" r="4.5" fill="#00E5FF" />
        </svg>
      );
    case 'PIXEL_MATRIX':
      return (
        <svg viewBox="0 0 48 48" className="h-11 w-11 shrink-0" aria-hidden="true">
          <rect x="7" y="7" width="34" height="34" rx="6" fill="#090C10" stroke="#1E2633" />
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2, 3].map((c) => {
              const lit = (r === 1 && (c === 1 || c === 2)) || (r === 2 && c === 1);
              return (
                <rect
                  key={`${r}-${c}`}
                  x={12 + c * 6.5}
                  y={12 + r * 6.5}
                  width="4.8"
                  height="4.8"
                  rx="1"
                  fill={lit ? '#00E5FF' : '#1E2633'}
                />
              );
            }),
          )}
        </svg>
      );
  }
}

export function WikiPage({
  onOpenSimulator,
  onOpenProject,
  onNavigateProjects,
}: WikiPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSectionId, setActiveSectionId] = useState<WikiSectionId>('felsefe');
  const [copiedJson, setCopiedJson] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  const normalizedQuery = useMemo(() => normalizeSearch(searchQuery), [searchQuery]);

  // Filtered sub-lists per section
  const filteredLogicStates = useMemo(() => {
    if (!normalizedQuery) return LOGIC_LATTICE_STATES;
    return LOGIC_LATTICE_STATES.filter((st) =>
      matchesQuery(
        normalizedQuery,
        st.name,
        st.key,
        String(st.numericCode),
        st.gpuCode,
        st.hex,
        st.strength,
        st.gateEffect,
        st.description,
      ),
    );
  }, [normalizedQuery]);

  const filteredComponents = useMemo(() => {
    if (!normalizedQuery) return COMPONENT_REFERENCE_LIST;
    return COMPONENT_REFERENCE_LIST.filter((c) =>
      matchesQuery(
        normalizedQuery,
        c.type,
        c.name,
        c.shortName,
        c.category,
        c.dimensions,
        c.behavior,
        c.designTip,
        ...c.pins.map((p) => `${p.id} ${p.side} ${p.role}`),
      ),
    );
  }, [normalizedQuery]);

  const filteredDesignGuides = useMemo(() => {
    if (!normalizedQuery) return CIRCUIT_DESIGN_GUIDES;
    return CIRCUIT_DESIGN_GUIDES.filter((g) =>
      matchesQuery(
        normalizedQuery,
        g.projectId,
        g.order,
        g.title,
        g.transistorSummary,
        g.category,
        g.topology,
        g.howItWorks,
        g.keyTakeaway,
      ),
    );
  }, [normalizedQuery]);

  const filteredSchemaFields = useMemo(() => {
    if (!normalizedQuery) return JSON_SCHEMA_FIELDS;
    return JSON_SCHEMA_FIELDS.filter((f) =>
      matchesQuery(normalizedQuery, f.scope, f.field, f.type, f.description),
    );
  }, [normalizedQuery]);

  const filteredEngineBlocks = useMemo(() => {
    if (!normalizedQuery) return ENGINE_PIPELINE_BLOCKS;
    return ENGINE_PIPELINE_BLOCKS.filter((b) =>
      matchesQuery(normalizedQuery, b.title, b.subtitle, b.codeSignature, ...b.bullets),
    );
  }, [normalizedQuery]);

  const filteredBackends = useMemo(() => {
    if (!normalizedQuery) return COMPUTE_BACKENDS;
    return COMPUTE_BACKENDS.filter((t) =>
      matchesQuery(normalizedQuery, t.backend, t.trigger, t.mechanism),
    );
  }, [normalizedQuery]);

  const filteredShortcuts = useMemo(() => {
    if (!normalizedQuery) return SHORTCUT_REFERENCE;
    return SHORTCUT_REFERENCE.filter((s) =>
      matchesQuery(normalizedQuery, s.category, s.description, s.keys.join(' ')),
    );
  }, [normalizedQuery]);

  const filteredFaqs = useMemo(() => {
    if (!normalizedQuery) return FAQ_ITEMS;
    return FAQ_ITEMS.filter((f) =>
      matchesQuery(normalizedQuery, f.question, f.tag, f.answer),
    );
  }, [normalizedQuery]);

  const visibleSectionIds = useMemo(() => {
    const set = new Set<WikiSectionId>();
    for (const sec of WIKI_SECTIONS) {
      if (!normalizedQuery) {
        set.add(sec.id);
        continue;
      }
      const metaMatch = matchesQuery(
        normalizedQuery,
        sec.title,
        sec.shortTitle,
        sec.summary,
        ...sec.keywords,
      );
      if (metaMatch) {
        set.add(sec.id);
        continue;
      }
      if (
        sec.id === 'felsefe' &&
        (PHILOSOPHY_PILLARS.some((p) =>
          matchesQuery(normalizedQuery, p.title, p.badge, p.description),
        ) ||
          ECOSYSTEM_CARDS.some((e) =>
            matchesQuery(normalizedQuery, e.platform, e.stack, ...e.capabilities),
          ))
      ) {
        set.add(sec.id);
      } else if (
        sec.id === 'lojik-kafes' &&
        (filteredLogicStates.length > 0 ||
          LOGIC_RESOLUTION_RULES.some((r) =>
            matchesQuery(normalizedQuery, r.title, r.formula, r.explanation),
          ))
      ) {
        set.add(sec.id);
      } else if (sec.id === 'bilesenler' && filteredComponents.length > 0) {
        set.add(sec.id);
      } else if (
        sec.id === 'devre-tasarimi' &&
        (filteredDesignGuides.length > 0 ||
          CMOS_DUALITY_RULES.some((d) =>
            matchesQuery(normalizedQuery, d.gate, d.pullUp, d.pullDown, d.note),
          ))
      ) {
        set.add(sec.id);
      } else if (
        sec.id === 'json-semasi' &&
        (filteredSchemaFields.length > 0 ||
          JSON_SCHEMA_RULES.some((r) =>
            matchesQuery(normalizedQuery, r.title, r.badge, r.detail),
          ))
      ) {
        set.add(sec.id);
      } else if (
        sec.id === 'motor-gpu' &&
        (filteredEngineBlocks.length > 0 || filteredBackends.length > 0)
      ) {
        set.add(sec.id);
      } else if (
        sec.id === 'kisayollar-sss' &&
        (filteredShortcuts.length > 0 ||
          filteredFaqs.length > 0 ||
          POWER_TOOLS.some((t) =>
            matchesQuery(normalizedQuery, t.title, t.badge, t.description),
          ))
      ) {
        set.add(sec.id);
      }
    }
    return set;
  }, [
    filteredBackends.length,
    filteredComponents.length,
    filteredDesignGuides.length,
    filteredEngineBlocks.length,
    filteredFaqs.length,
    filteredLogicStates.length,
    filteredSchemaFields.length,
    filteredShortcuts.length,
    normalizedQuery,
  ]);

  const visibleSections = useMemo(
    () => WIKI_SECTIONS.filter((sec) => visibleSectionIds.has(sec.id)),
    [visibleSectionIds],
  );

  useEffect(() => {
    if (visibleSections.length > 0 && !visibleSectionIds.has(activeSectionId)) {
      setActiveSectionId(visibleSections[0].id);
    }
  }, [activeSectionId, visibleSectionIds, visibleSections]);

  // Scroll-spy via IntersectionObserver
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const elements = visibleSections
      .map((s) => document.getElementById(`wiki-sec-${s.id}`))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-section-id') as WikiSectionId | null;
            if (id) {
              setActiveSectionId(id);
            }
          }
        }
      },
      {
        rootMargin: '-12% 0px -70% 0px',
        threshold: 0,
      },
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [visibleSections]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const scrollToSection = (id: WikiSectionId) => {
    setActiveSectionId(id);
    const target = document.getElementById(`wiki-sec-${id}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCopyJson = async () => {
    const ok = await copyTextToClipboard(JSON_EXAMPLE_STRING);
    if (ok) {
      setCopiedJson(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedJson(false);
      }, 2000);
    }
  };

  // Resolve items to render inside each section (if section matched by items, show matching subset; if matched only by section meta, show full list)
  const displayedLogicStates =
    normalizedQuery && filteredLogicStates.length > 0
      ? filteredLogicStates
      : LOGIC_LATTICE_STATES;
  const displayedComponents =
    normalizedQuery && filteredComponents.length > 0
      ? filteredComponents
      : COMPONENT_REFERENCE_LIST;
  const displayedDesignGuides =
    normalizedQuery && filteredDesignGuides.length > 0
      ? filteredDesignGuides
      : CIRCUIT_DESIGN_GUIDES;
  const displayedSchemaFields =
    normalizedQuery && filteredSchemaFields.length > 0
      ? filteredSchemaFields
      : JSON_SCHEMA_FIELDS;
  const displayedEngineBlocks =
    normalizedQuery && filteredEngineBlocks.length > 0
      ? filteredEngineBlocks
      : ENGINE_PIPELINE_BLOCKS;
  const displayedBackends =
    normalizedQuery && filteredBackends.length > 0 ? filteredBackends : COMPUTE_BACKENDS;
  const displayedShortcuts =
    normalizedQuery && filteredShortcuts.length > 0
      ? filteredShortcuts
      : SHORTCUT_REFERENCE;
  const displayedFaqs =
    normalizedQuery && filteredFaqs.length > 0 ? filteredFaqs : FAQ_ITEMS;

  return (
    <div className="min-h-full bg-[#090C10] text-slate-200">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        {/* Top Hero Banner */}
        <section className="relative overflow-hidden rounded-2xl border border-[#1E2633] bg-gradient-to-br from-[#0E131A] via-[#0E131A] to-[#141B24] p-6 shadow-xl sm:p-8">
          <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#00E5FF]/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-3 py-1 font-mono text-[11px] font-semibold text-[#00E5FF]">
                  <BookOpen className="h-3.5 w-3.5" />
                  Teknik Wiki &amp; Referans
                </span>
                <span className="rounded-full border border-[#1E2633] bg-[#090C10]/80 px-2.5 py-1 font-mono text-[11px] text-slate-300">
                  Sıfır Soyutlama · 100% NMOS/PMOS
                </span>
                <span className="rounded-full border border-[#1E2633] bg-[#090C10]/80 px-2.5 py-1 font-mono text-[11px] text-slate-300">
                  WebGPU WGSL + Tauri wgpu
                </span>
              </div>

              <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
                WebTransistor <span className="text-[#00E5FF]">Silikon Mimarisi</span> &amp; Tasarım Kılavuzu
              </h1>

              <p className="text-sm leading-relaxed text-slate-400 sm:text-base">
                Hazır mantık kapısı ve yapay saat olmadan 6-durumlu MOS lojik kafesinden
                1.000.000+ transistörlü SoA/WGSL simülasyon motoruna kadar WebTransistor’ın
                tüm fiziksel kuralları, bileşen pinout’ları, CircuitDocument v1 JSON şeması
                ve örnek devre topolojileri.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row lg:shrink-0 lg:flex-col">
              <button
                type="button"
                onClick={onOpenSimulator}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#00E5FF] px-5 py-2.5 text-sm font-semibold text-[#090C10] shadow-[0_0_20px_rgba(0,229,255,0.28)] transition-all hover:bg-[#33ecff]"
              >
                <Cpu className="h-4 w-4" />
                <span>Sanal WebTransistor&apos;ı Aç</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onNavigateProjects}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#1E2633] bg-[#141B24] px-5 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-[#00E5FF]/50 hover:text-[#00E5FF]"
              >
                <FolderKanban className="h-4 w-4 text-[#00E5FF]" />
                <span>10 Örnek JSON Projesini İncele</span>
              </button>
            </div>
          </div>
        </section>

        {/* Mobile Search & Section Selector */}
        <div className="sticky top-0 z-20 -mx-4 mt-5 border-y border-[#1E2633] bg-[#090C10]/95 px-4 py-3 backdrop-blur-md lg:hidden">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Wiki’de ara (ör. PMOS, WGSL, XOR, ERR, JSON)..."
                aria-label="Wiki içeriğinde ara"
                className="w-full rounded-xl border border-[#1E2633] bg-[#0E131A] py-2 pr-8 pl-9 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-[#00E5FF]/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Aramayı temizle"
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <select
              aria-label="Wiki Bölümü Seç"
              value={activeSectionId}
              onChange={(e) => scrollToSection(e.target.value as WikiSectionId)}
              className="rounded-xl border border-[#1E2633] bg-[#0E131A] px-3 py-2 text-xs font-medium text-slate-200 outline-none focus:border-[#00E5FF]/60"
            >
              {visibleSections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.number}. {sec.shortTitle}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main 2-Column Layout: Sticky Desktop Sidebar + Content */}
        <div className="mt-6 flex flex-col gap-8 lg:mt-8 lg:flex-row lg:items-start">
          {/* Desktop Sticky Left Sidebar */}
          <aside className="hidden w-72 shrink-0 lg:sticky lg:top-6 lg:block">
            <div className="rounded-2xl border border-[#1E2633] bg-[#0E131A] p-4 shadow-lg">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Konu, pin veya terim ara..."
                  aria-label="Wiki konularında ara"
                  className="w-full rounded-xl border border-[#1E2633] bg-[#090C10] py-2 pr-8 pl-9 text-xs text-slate-100 placeholder-slate-500 outline-none transition-colors focus:border-[#00E5FF]/60"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Aramayı temizle"
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {normalizedQuery && (
                <div className="mt-2.5 flex items-center justify-between rounded-lg border border-[#1E2633] bg-[#141B24]/70 px-2.5 py-1.5 text-[11px] text-slate-400">
                  <span>{visibleSections.length} / 7 bölüm eşleşti</span>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="font-medium text-[#00E5FF] hover:underline"
                  >
                    Temizle
                  </button>
                </div>
              )}

              <div className="mt-4 mb-2 px-2 text-[10px] font-semibold tracking-wider text-slate-500 uppercase">
                İçindekiler
              </div>

              <nav aria-label="Wiki İçindekiler" className="space-y-1">
                {WIKI_SECTIONS.map((sec) => {
                  const isVisible = visibleSectionIds.has(sec.id);
                  const isActive = activeSectionId === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      disabled={!isVisible}
                      onClick={() => scrollToSection(sec.id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition-all ${
                        !isVisible
                          ? 'cursor-not-allowed opacity-35'
                          : isActive
                            ? 'border border-[#00E5FF]/40 bg-[#00E5FF]/10 font-semibold text-[#00E5FF]'
                            : 'border border-transparent text-slate-300 hover:bg-[#141B24] hover:text-slate-100'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] ${
                          isActive
                            ? 'bg-[#00E5FF] font-bold text-[#090C10]'
                            : 'bg-[#141B24] text-slate-400'
                        }`}
                      >
                        {sec.number}
                      </span>
                      <span className="truncate">{sec.shortTitle}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="mt-5 space-y-2 border-t border-[#1E2633] pt-4">
                <button
                  type="button"
                  onClick={onOpenSimulator}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#00E5FF] px-3 py-2 text-xs font-semibold text-[#090C10] transition-colors hover:bg-[#33ecff]"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  <span>Sanal WebTransistor&apos;ı Aç</span>
                </button>
                <button
                  type="button"
                  onClick={onNavigateProjects}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#1E2633] bg-[#141B24] px-3 py-2 text-xs font-medium text-slate-200 transition-colors hover:border-[#00E5FF]/40 hover:text-[#00E5FF]"
                >
                  <FolderKanban className="h-3.5 w-3.5 text-[#00E5FF]" />
                  <span>10 Örnek JSON Projesi</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="min-w-0 flex-1 space-y-10">
            {visibleSections.length === 0 && (
              <div className="rounded-2xl border border-[#1E2633] bg-[#0E131A] p-8 text-center">
                <Search className="mx-auto h-8 w-8 text-slate-500" />
                <h2 className="mt-3 text-base font-semibold text-slate-100">
                  &ldquo;{searchQuery}&rdquo; için eşleşen Wiki içeriği bulunamadı
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  NMOS, PMOS, LogicValue, Ring Oscillator, CircuitDocument, WGSL veya ERR gibi
                  terimlerle tekrar deneyin.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-4 py-2 text-xs font-semibold text-[#00E5FF] hover:bg-[#00E5FF]/20"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Aramayı Sıfırla</span>
                </button>
              </div>
            )}

            {/* SECTION 01: WebTransistor Nedir & Sıfır Soyutlama Felsefesi */}
            {visibleSectionIds.has('felsefe') && (
              <section
                id="wiki-sec-felsefe"
                data-section-id="felsefe"
                className="scroll-mt-28 lg:scroll-mt-6 space-y-5 rounded-2xl border border-[#1E2633] bg-[#0E131A] p-6"
              >
                <SectionHeader
                  number="01"
                  icon={<Sparkles className="h-4 w-4" />}
                  title="WebTransistor Nedir? & Sıfır Soyutlama Felsefesi"
                  subtitle="Hazır mantık kapısı, yapay saat veya kara kutu IC olmadan yalnızca saf silikon fiziği."
                />

                <div className="grid gap-4 md:grid-cols-2">
                  {PHILOSOPHY_PILLARS.map((pillar) => (
                    <div
                      key={pillar.title}
                      className="rounded-xl border border-[#1E2633] bg-[#090C10]/80 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-100">{pillar.title}</h3>
                        <span className="shrink-0 rounded-md border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#00E5FF]">
                          {pillar.badge}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-400">
                        {pillar.description}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {ECOSYSTEM_CARDS.map((card) => (
                    <div
                      key={card.platform}
                      className="rounded-xl border border-[#1E2633] bg-[#141B24]/70 p-4"
                    >
                      <div className="text-sm font-semibold text-slate-100">{card.platform}</div>
                      <div className="mt-1 font-mono text-[11px] text-[#00E5FF]">{card.stack}</div>
                      <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
                        {card.capabilities.map((cap) => (
                          <li key={cap} className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00E5FF]" />
                            <span className="leading-relaxed text-slate-400">{cap}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* SECTION 02: 6-Durumlu MOS Lojik Kafesi */}
            {visibleSectionIds.has('lojik-kafes') && (
              <section
                id="wiki-sec-lojik-kafes"
                data-section-id="lojik-kafes"
                className="scroll-mt-28 lg:scroll-mt-6 space-y-5 rounded-2xl border border-[#1E2633] bg-[#0E131A] p-6"
              >
                <SectionHeader
                  number="02"
                  icon={<Binary className="h-4 w-4" />}
                  title="6-Durumlu MOS Lojik Kafesi (LogicValue)"
                  subtitle="Switch-level MOSFET simülasyonunda her elektriksel düğüm (net) Uint8Array içinde bu 6 durumdan birini taşır."
                />

                <div className="overflow-x-auto rounded-xl border border-[#1E2633] bg-[#090C10]">
                  <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#1E2633] bg-[#141B24]/90 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                        <th className="px-4 py-3">Renk &amp; Durum</th>
                        <th className="px-3 py-3 font-mono">LogicValue</th>
                        <th className="px-3 py-3 font-mono">GPU Buffer</th>
                        <th className="px-3 py-3">Sürüş Gücü</th>
                        <th className="px-3 py-3">MOSFET Kapı Etkisi</th>
                        <th className="px-4 py-3">Elektriksel Anlam</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2633]/80">
                      {displayedLogicStates.map((st) => (
                        <tr key={st.key} className="transition-colors hover:bg-[#141B24]/50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="h-4 w-4 shrink-0 rounded-full border border-white/20"
                                style={{
                                  backgroundColor: st.hex,
                                  boxShadow:
                                    st.key === 'HIGH' || st.key === 'ERR'
                                      ? `0 0 10px ${st.hex}80`
                                      : undefined,
                                }}
                              />
                              <div>
                                <div className="font-semibold text-slate-100">{st.name}</div>
                                <div className="font-mono text-[10px] text-slate-500">{st.hex}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 font-mono font-semibold text-[#00E5FF]">
                            {st.key} = {st.numericCode}
                          </td>
                          <td className="px-3 py-3 font-mono text-slate-300">{st.gpuCode}</td>
                          <td className="px-3 py-3 text-slate-300">{st.strength}</td>
                          <td className="px-3 py-3 font-mono text-[11px] text-slate-300">
                            {st.gateEffect}
                          </td>
                          <td className="px-4 py-3 leading-relaxed text-slate-400">
                            {st.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {LOGIC_RESOLUTION_RULES.map((rule) => (
                    <div
                      key={rule.title}
                      className="rounded-xl border border-[#1E2633] bg-[#090C10]/85 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-slate-100">{rule.title}</h3>
                        <span
                          className="rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold"
                          style={{
                            borderColor: `${rule.resultHex}66`,
                            backgroundColor: `${rule.resultHex}18`,
                            color: rule.resultHex === '#484F58' ? '#94A3B8' : rule.resultHex,
                          }}
                        >
                          {rule.resultLabel}
                        </span>
                      </div>
                      <div className="mt-2 rounded-lg border border-[#1E2633] bg-[#141B24] px-2.5 py-1.5 font-mono text-[11px] text-slate-200">
                        {rule.formula}
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-400">
                        {rule.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* SECTION 03: 10 Fiziksel Bileşen Referansı */}
            {visibleSectionIds.has('bilesenler') && (
              <section
                id="wiki-sec-bilesenler"
                data-section-id="bilesenler"
                className="scroll-mt-28 lg:scroll-mt-6 space-y-5 rounded-2xl border border-[#1E2633] bg-[#0E131A] p-6"
              >
                <SectionHeader
                  number="03"
                  icon={<Layers className="h-4 w-4" />}
                  title="10 Fiziksel Bileşen Referansı"
                  subtitle="WebTransistor devresinde izin verilen tek 10 bileşen tipi (PALETTE_CATALOG & componentDefs.ts)."
                />

                <div className="grid gap-4 md:grid-cols-2">
                  {displayedComponents.map((comp) => (
                    <article
                      key={comp.type}
                      className="flex flex-col justify-between rounded-xl border border-[#1E2633] bg-[#090C10]/85 p-4 transition-colors hover:border-[#00E5FF]/40"
                    >
                      <div>
                        <div className="flex items-start gap-3">
                          <ComponentGlyph type={comp.type} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h3 className="text-sm font-semibold text-slate-100">{comp.name}</h3>
                              <kbd className="rounded-md border border-[#1E2633] bg-[#141B24] px-2 py-0.5 font-mono text-[11px] font-bold text-[#00E5FF]">
                                Tuş: {comp.shortcut}
                              </kbd>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
                              <span className="rounded bg-[#141B24] px-1.5 py-0.5 text-slate-200">
                                {comp.type}
                              </span>
                              <span className="rounded border border-[#1E2633] px-1.5 py-0.5 text-slate-400">
                                {comp.dimensions}
                              </span>
                              <span className="text-slate-500">{comp.category}</span>
                            </div>
                          </div>
                        </div>

                        <p className="mt-3 text-xs leading-relaxed text-slate-300">
                          {comp.behavior}
                        </p>

                        <div className="mt-3 rounded-lg border border-[#1E2633] bg-[#141B24]/60 p-2.5">
                          <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                            Pin Yerleşimi (rotation = 0°)
                          </div>
                          <div className="space-y-1">
                            {comp.pins.map((pin) => (
                              <div
                                key={pin.id}
                                className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]"
                              >
                                <span className="font-semibold text-[#00E5FF]">
                                  {pin.id}{' '}
                                  <span className="font-normal text-slate-400">({pin.side})</span>
                                </span>
                                <span className="text-slate-300">{pin.offset}</span>
                                <span className="text-[10px] text-slate-500">{pin.role}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#1E2633]/80 pt-2.5 text-[11px] text-slate-400">
                        <span>{comp.designTip}</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          props: {comp.propsSummary.join(', ')}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* SECTION 04: CMOS & NMOS Devre Tasarım Rehberi */}
            {visibleSectionIds.has('devre-tasarimi') && (
              <section
                id="wiki-sec-devre-tasarimi"
                data-section-id="devre-tasarimi"
                className="scroll-mt-28 lg:scroll-mt-6 space-y-5 rounded-2xl border border-[#1E2633] bg-[#0E131A] p-6"
              >
                <SectionHeader
                  number="04"
                  icon={<Zap className="h-4 w-4" />}
                  title="CMOS & NMOS Devre Tasarım Rehberi"
                  subtitle="Tamamlayıcı pull-up/pull-down ikiliğinden 10 adet saf transistörlü örnek devre mimarisine."
                />

                {/* CMOS Duality Reference Bar */}
                <div className="grid gap-3 md:grid-cols-3">
                  {CMOS_DUALITY_RULES.map((rule) => (
                    <div
                      key={rule.gate}
                      className="rounded-xl border border-[#1E2633] bg-[#141B24]/70 p-3.5"
                    >
                      <div className="font-mono text-xs font-bold text-[#00E5FF]">{rule.gate}</div>
                      <div className="mt-2 space-y-1 font-mono text-[11px]">
                        <div className="text-amber-300">Pull-Up: {rule.pullUp}</div>
                        <div className="text-cyan-300">Pull-Down: {rule.pullDown}</div>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-400">{rule.note}</p>
                    </div>
                  ))}
                </div>

                {/* 10 Interactive Project Design Cards */}
                <div className="grid gap-4 md:grid-cols-2">
                  {displayedDesignGuides.map((guide) => (
                    <article
                      key={guide.projectId}
                      className="flex flex-col justify-between rounded-xl border border-[#1E2633] bg-[#090C10]/85 p-4 transition-colors hover:border-[#00E5FF]/40"
                    >
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#00E5FF]">
                              {guide.order}
                            </span>
                            <span className="rounded-md border border-[#1E2633] bg-[#141B24] px-2 py-0.5 text-[10px] font-medium text-slate-300">
                              {guide.category}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-amber-300">
                            {guide.transistorSummary}
                          </span>
                        </div>

                        <h3 className="mt-2.5 text-sm font-semibold text-slate-100">
                          {guide.title}
                        </h3>

                        <div className="mt-2 rounded-lg border border-[#1E2633] bg-[#141B24]/60 px-2.5 py-1.5 font-mono text-[11px] text-slate-300">
                          {guide.topology}
                        </div>

                        <p className="mt-2.5 text-xs leading-relaxed text-slate-400">
                          {guide.howItWorks}
                        </p>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#1E2633]/80 pt-3">
                        <p className="min-w-0 flex-1 text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-200">Not:</span>{' '}
                          {guide.keyTakeaway}
                        </p>
                        <button
                          type="button"
                          onClick={() => onOpenProject(guide.projectId)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#00E5FF] px-3 py-1.5 text-xs font-semibold text-[#090C10] transition-colors hover:bg-[#33ecff]"
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>Simülatörde Aç</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {/* SECTION 05: JSON Devre Şeması */}
            {visibleSectionIds.has('json-semasi') && (
              <section
                id="wiki-sec-json-semasi"
                data-section-id="json-semasi"
                className="scroll-mt-28 lg:scroll-mt-6 space-y-5 rounded-2xl border border-[#1E2633] bg-[#0E131A] p-6"
              >
                <SectionHeader
                  number="05"
                  icon={<FileCode2 className="h-4 w-4" />}
                  title="JSON Devre Şeması (CircuitDocument v1)"
                  subtitle="Dışa/içe aktarılabilen saf JSON devre formatı, 20px ızgara hizalaması ve güvenli tuş atama kuralları."
                />

                {/* Critical Schema Rules */}
                <div className="grid gap-3 md:grid-cols-3">
                  {JSON_SCHEMA_RULES.map((rule) => (
                    <div
                      key={rule.title}
                      className="rounded-xl border border-[#1E2633] bg-[#141B24]/70 p-4"
                    >
                      <span className="inline-block rounded-md border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#00E5FF]">
                        {rule.badge}
                      </span>
                      <h3 className="mt-2 text-xs font-semibold text-slate-100">{rule.title}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{rule.detail}</p>
                    </div>
                  ))}
                </div>

                {/* Field Reference Table */}
                <div className="overflow-x-auto rounded-xl border border-[#1E2633] bg-[#090C10]">
                  <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#1E2633] bg-[#141B24]/90 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                        <th className="px-4 py-2.5">Kapsam</th>
                        <th className="px-3 py-2.5 font-mono">Alan</th>
                        <th className="px-3 py-2.5 font-mono">Tip</th>
                        <th className="px-3 py-2.5">Zorunlu</th>
                        <th className="px-4 py-2.5">Açıklama</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E2633]/80">
                      {displayedSchemaFields.map((f) => (
                        <tr
                          key={`${f.scope}-${f.field}`}
                          className="transition-colors hover:bg-[#141B24]/50"
                        >
                          <td className="px-4 py-2.5 text-slate-300">{f.scope}</td>
                          <td className="px-3 py-2.5 font-mono font-semibold text-[#00E5FF]">
                            {f.field}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11px] text-amber-300">
                            {f.type}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                                f.required
                                  ? 'bg-[#00E5FF]/15 text-[#00E5FF]'
                                  : 'bg-[#141B24] text-slate-400'
                              }`}
                            >
                              {f.required ? 'Evet' : 'Opsiyonel'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-400">{f.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Copyable Complete JSON Example */}
                <div className="overflow-hidden rounded-xl border border-[#1E2633] bg-[#090C10]">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2633] bg-[#141B24] px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Code2 className="h-4 w-4 text-[#00E5FF]" />
                      <span className="font-mono text-xs font-semibold text-slate-200">
                        2t-cmos-inverter-ornek.json
                      </span>
                      <span className="rounded border border-[#1E2633] bg-[#090C10] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                        CircuitDocument v1
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyJson}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-all ${
                        copiedJson
                          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                          : 'border-[#1E2633] bg-[#090C10] text-slate-200 hover:border-[#00E5FF]/50 hover:text-[#00E5FF]'
                      }`}
                    >
                      {copiedJson ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>Kopyalandı</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Kopyala</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="max-h-96 overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-300">
                    <code>{JSON_EXAMPLE_STRING}</code>
                  </pre>
                </div>
              </section>
            )}

            {/* SECTION 06: Simülasyon Motoru & Donanım Hızlandırma */}
            {visibleSectionIds.has('motor-gpu') && (
              <section
                id="wiki-sec-motor-gpu"
                data-section-id="motor-gpu"
                className="scroll-mt-28 lg:scroll-mt-6 space-y-5 rounded-2xl border border-[#1E2633] bg-[#0E131A] p-6"
              >
                <SectionHeader
                  number="06"
                  icon={<Activity className="h-4 w-4" />}
                  title="Simülasyon Motoru & Donanım Hızlandırma"
                  subtitle="SoA tamponları, Switch-Island CSR derleyicisi, Two-Pass WGSL shader, 4 katmanlı backend seçimi ve WebGL2 Instanced + LOD çizimi."
                />

                <div className="grid gap-4 md:grid-cols-2">
                  {displayedEngineBlocks.map((block) => (
                    <div
                      key={block.title}
                      className="flex flex-col justify-between rounded-xl border border-[#1E2633] bg-[#090C10]/85 p-4"
                    >
                      <div>
                        <h3 className="text-sm font-semibold text-slate-100">{block.title}</h3>
                        <div className="mt-0.5 font-mono text-[11px] text-[#00E5FF]">
                          {block.subtitle}
                        </div>
                        <ul className="mt-3 space-y-1.5 text-xs text-slate-400">
                          {block.bullets.map((b) => (
                            <li key={b} className="flex items-start gap-2">
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#00E5FF]" />
                              <span className="leading-relaxed">{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="mt-3 rounded-lg border border-[#1E2633] bg-[#141B24] px-2.5 py-1.5 font-mono text-[10px] text-slate-300">
                        {block.codeSignature}
                      </div>
                    </div>
                  ))}
                </div>

                {/* 4-Tier Backend Selection Table */}
                <div className="rounded-xl border border-[#1E2633] bg-[#090C10] p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[#00E5FF] uppercase">
                    <Terminal className="h-3.5 w-3.5" />
                    <span>4 Katmanlı Compute Backend Seçim Hiyerarşisi (WorkerSimulatorClient)</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {displayedBackends.map((tier) => (
                      <div
                        key={tier.tier}
                        className="rounded-xl border border-[#1E2633] bg-[#141B24]/60 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-slate-100">
                            Katman {tier.tier}: {tier.backend}
                          </span>
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-[#00E5FF]">
                          Koşul: {tier.trigger}
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                          {tier.mechanism}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* SECTION 07: Klavye Kısayolları, Araçlar & SSS */}
            {visibleSectionIds.has('kisayollar-sss') && (
              <section
                id="wiki-sec-kisayollar-sss"
                data-section-id="kisayollar-sss"
                className="scroll-mt-28 lg:scroll-mt-6 space-y-5 rounded-2xl border border-[#1E2633] bg-[#0E131A] p-6"
              >
                <SectionHeader
                  number="07"
                  icon={<Wrench className="h-4 w-4" />}
                  title="Klavye Kısayolları, Araçlar & SSS"
                  subtitle="Hızlı tuş kombinasyonları, ×10/×100/×1000 matris çoğaltma, Benchmark ve sık karşılaşılan hata çözümleri."
                />

                {/* Shortcuts Table */}
                <div className="rounded-xl border border-[#1E2633] bg-[#090C10] p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-[#00E5FF] uppercase">
                    <Keyboard className="h-3.5 w-3.5" />
                    <span>Klavye Kısayolları</span>
                  </div>
                  <div className="divide-y divide-[#1E2633]/70">
                    {displayedShortcuts.map((row) => (
                      <div
                        key={row.description}
                        className="flex flex-wrap items-center justify-between gap-3 py-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded border border-[#1E2633] bg-[#141B24] px-1.5 py-0.5 text-[10px] text-slate-400">
                            {row.category}
                          </span>
                          <span className="text-slate-300">{row.description}</span>
                        </div>
                        <span className="flex shrink-0 items-center gap-1">
                          {row.keys.map((k, idx) => (
                            <kbd
                              key={`${k}-${idx}`}
                              className="rounded border border-[#1E2633] bg-[#141B24] px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-200"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Power Tools */}
                <div className="grid gap-3 md:grid-cols-2">
                  {POWER_TOOLS.map((tool) => (
                    <div
                      key={tool.title}
                      className="rounded-xl border border-[#1E2633] bg-[#141B24]/70 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                          <Flame className="h-3.5 w-3.5 text-amber-400" />
                          <span>{tool.title}</span>
                        </h3>
                        <span className="rounded border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#00E5FF]">
                          {tool.badge}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-400">
                        {tool.description}
                      </p>
                    </div>
                  ))}
                </div>

                {/* FAQ / Troubleshooting */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#00E5FF] uppercase">
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>Sıkça Sorulan Sorular &amp; Sorun Giderme</span>
                  </div>
                  {displayedFaqs.map((faq) => (
                    <div
                      key={faq.question}
                      className="rounded-xl border border-[#1E2633] bg-[#090C10]/85 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-100 sm:text-sm">
                          {faq.tag.includes('ERR') ? (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-[#EF4444]" />
                          ) : (
                            <ShieldAlert className="h-4 w-4 shrink-0 text-[#00E5FF]" />
                          )}
                          <span>{faq.question}</span>
                        </h3>
                        <span className="rounded-md border border-[#1E2633] bg-[#141B24] px-2 py-0.5 font-mono text-[10px] text-slate-300">
                          {faq.tag}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-slate-400">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Bottom CTA Banner */}
            <section className="rounded-2xl border border-[#00E5FF]/30 bg-gradient-to-r from-[#0E131A] via-[#141B24] to-[#0E131A] p-6 sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-100">
                    Kendi Transistör Devrenizi Kurmaya Hazır mısınız?
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400 sm:text-sm">
                    Doğrudan boş veya başlangıç çalışma alanında NMOS/PMOS yerleştirmeye başlayın ya da
                    hazırlanmış 10 saf transistör JSON projesini inceleyin.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onOpenSimulator}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#00E5FF] px-4 py-2.5 text-xs font-semibold text-[#090C10] shadow-[0_0_16px_rgba(0,229,255,0.25)] transition-colors hover:bg-[#33ecff] sm:text-sm"
                  >
                    <Cpu className="h-4 w-4" />
                    <span>Sanal WebTransistor&apos;ı Aç</span>
                  </button>
                  <button
                    type="button"
                    onClick={onNavigateProjects}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#1E2633] bg-[#090C10] px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors hover:border-[#00E5FF]/50 hover:text-[#00E5FF] sm:text-sm"
                  >
                    <FolderKanban className="h-4 w-4 text-[#00E5FF]" />
                    <span>10 Örnek JSON Projesini İncele</span>
                  </button>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

interface SectionHeaderProps {
  number: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
}

function SectionHeader({ number, icon, title, subtitle }: SectionHeaderProps) {
  return (
    <div className="border-b border-[#1E2633] pb-4">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-[#00E5FF] uppercase">
        <span className="rounded bg-[#00E5FF]/15 px-1.5 py-0.5 font-mono text-[11px] font-bold">
          {number}
        </span>
        {icon}
        <span>Bölüm {number}</span>
      </div>
      <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-100 sm:text-xl">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400 sm:text-sm">{subtitle}</p>
    </div>
  );
}

export default WikiPage;
