import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Cpu,
  Download,
  Eye,
  FileCode2,
  FileJson,
  FolderOpen,
  Keyboard,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { getComponentAABB } from '../canvas/geometry';
import { computeWirePath, findWireJunctions, type WirePath } from '../canvas/routing';
import {
  EXAMPLE_PROJECTS,
  EXAMPLE_PROJECT_CATEGORIES,
  fetchExampleProjectDocument,
  type ExampleProjectMeta,
  type ProjectCategory,
  type ProjectDifficulty,
} from '../data/exampleProjects';
import {
  getComponentPins,
  getPinWorldPosition,
  getPixelMatrixSize,
} from '../engine/componentDefs';
import type {
  CircuitComponent,
  CircuitDocument,
  ComponentType,
  Point,
} from '../types/circuit';

export interface ProjectsPageProps {
  onOpenProject: (projectId: string) => void;
  onOpenCustomJson: (jsonText: string) => void;
}

type CategoryFilter = 'Tümü' | ProjectCategory;
type DifficultyFilter = 'Tümü' | ProjectDifficulty;

const DIFFICULTY_OPTIONS: readonly DifficultyFilter[] = [
  'Tümü',
  'Başlangıç',
  'Orta',
  'İleri',
] as const;

const DIFFICULTY_BADGE_STYLES: Record<ProjectDifficulty, string> = {
  Başlangıç: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  Orta: 'border-[#00E5FF]/40 bg-[#00E5FF]/10 text-[#00E5FF]',
  İleri: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
};

interface SchematicNodeStyle {
  fill: string;
  stroke: string;
  text: string;
  shortLabel: string;
}

const COMPONENT_NODE_STYLES: Record<ComponentType, SchematicNodeStyle> = {
  NMOS: {
    fill: '#0B1D26',
    stroke: '#00E5FF',
    text: '#67E8F9',
    shortLabel: 'N',
  },
  PMOS: {
    fill: '#1D122E',
    stroke: '#A855F7',
    text: '#D8B4FE',
    shortLabel: 'P',
  },
  VCC: {
    fill: '#0A2218',
    stroke: '#22C55E',
    text: '#86EFAC',
    shortLabel: 'VCC',
  },
  PULL_UP: {
    fill: '#0A1F1C',
    stroke: '#34D399',
    text: '#6EE7B7',
    shortLabel: 'PU',
  },
  GND: {
    fill: '#11161F',
    stroke: '#64748B',
    text: '#CBD5E1',
    shortLabel: 'GND',
  },
  PULL_DOWN: {
    fill: '#131924',
    stroke: '#94A3B8',
    text: '#CBD5E1',
    shortLabel: 'PD',
  },
  TOGGLE_SWITCH: {
    fill: '#231909',
    stroke: '#F59E0B',
    text: '#FCD34D',
    shortLabel: 'SW',
  },
  PUSH_BUTTON: {
    fill: '#24170B',
    stroke: '#FB923C',
    text: '#FDBA74',
    shortLabel: 'BTN',
  },
  LED: {
    fill: '#0D1B2A',
    stroke: '#38BDF8',
    text: '#E0F2FE',
    shortLabel: 'LED',
  },
  PIXEL_MATRIX: {
    fill: '#091520',
    stroke: '#00E5FF',
    text: '#BAE6FD',
    shortLabel: 'MAT',
  },
};

const SCHEMATIC_LEGEND_ITEMS: ReadonlyArray<{ label: string; color: string }> = [
  { label: 'NMOS', color: '#00E5FF' },
  { label: 'PMOS', color: '#A855F7' },
  { label: 'VCC / PU', color: '#22C55E' },
  { label: 'GND / PD', color: '#64748B' },
  { label: 'Anahtar / Buton', color: '#F59E0B' },
  { label: 'LED / Matris', color: '#38BDF8' },
];

function formatOrderBadge(order: number): string {
  return `#${String(order).padStart(2, '0')}`;
}

function normalizeTr(value: string): string {
  return value.toLocaleLowerCase('tr-TR').trim();
}

function resolveLedAccentHex(color?: 'cyan' | 'green' | 'amber' | 'red'): string {
  switch (color) {
    case 'green':
      return '#22C55E';
    case 'amber':
      return '#F59E0B';
    case 'red':
      return '#EF4444';
    case 'cyan':
    default:
      return '#00E5FF';
  }
}

interface PreviewComponentRender {
  comp: CircuitComponent;
  minX: number;
  minY: number;
  width: number;
  height: number;
  stroke: string;
  fill: string;
  textColor: string;
  label: string;
  pins: Point[];
  matrixSize: 4 | 8 | null;
}

interface PreviewWireRender {
  id: string;
  pointsAttr: string;
  stroke: string;
}

interface SchematicPreviewGeometry {
  viewBox: string;
  strokeScale: number;
  showSubLabels: boolean;
  components: PreviewComponentRender[];
  wires: PreviewWireRender[];
  junctions: Point[];
}

function buildSchematicPreviewGeometry(doc: CircuitDocument): SchematicPreviewGeometry {
  if (doc.components.length === 0) {
    return {
      viewBox: '-120 -80 240 160',
      strokeScale: 1,
      showSubLabels: true,
      components: [],
      wires: [],
      junctions: [],
    };
  }

  const compMap = new Map<string, CircuitComponent>();
  for (let i = 0; i < doc.components.length; i++) {
    compMap.set(doc.components[i].id, doc.components[i]);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const expandBounds = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  const components: PreviewComponentRender[] = doc.components.map((comp) => {
    const aabb = getComponentAABB(comp);
    expandBounds(aabb.minX, aabb.minY);
    expandBounds(aabb.maxX, aabb.maxY);

    const baseStyle = COMPONENT_NODE_STYLES[comp.type];
    const isLightComponent = comp.type === 'LED' || comp.type === 'PIXEL_MATRIX';
    const stroke = isLightComponent
      ? resolveLedAccentHex(comp.props.color)
      : baseStyle.stroke;

    const pinDefs = getComponentPins(comp);
    const pins: Point[] = pinDefs.map((pin) => {
      const worldPos = getPinWorldPosition(comp, pin);
      expandBounds(worldPos.x, worldPos.y);
      return worldPos;
    });

    const matrixSize = comp.type === 'PIXEL_MATRIX' ? getPixelMatrixSize(comp) : null;
    const rawLabel = comp.props.label?.trim();
    const label =
      comp.type === 'NMOS' || comp.type === 'PMOS'
        ? baseStyle.shortLabel
        : rawLabel && rawLabel.length <= 7
          ? rawLabel
          : matrixSize
            ? `${matrixSize}×${matrixSize}`
            : baseStyle.shortLabel;

    return {
      comp,
      minX: aabb.minX,
      minY: aabb.minY,
      width: aabb.width,
      height: aabb.height,
      stroke,
      fill: baseStyle.fill,
      textColor: isLightComponent ? stroke : baseStyle.text,
      label,
      pins,
      matrixSize,
    };
  });

  const pathMap = new Map<string, WirePath>();
  const wires: PreviewWireRender[] = [];

  for (let i = 0; i < doc.wires.length; i++) {
    const wire = doc.wires[i];
    const path = computeWirePath(wire, compMap, 'orthogonal');
    if (!path || path.points.length < 2) continue;

    pathMap.set(wire.id, path);
    for (let j = 0; j < path.points.length; j++) {
      expandBounds(path.points[j].x, path.points[j].y);
    }

    const pointsAttr = path.points
      .map((pt) => `${Math.round(pt.x * 10) / 10},${Math.round(pt.y * 10) / 10}`)
      .join(' ');

    wires.push({
      id: wire.id,
      pointsAttr,
      stroke: wire.color ?? '#38BDF8',
    });
  }

  const junctions = findWireJunctions(doc.wires, pathMap).map((j) => ({ x: j.x, y: j.y }));

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = -120;
    minY = -80;
    maxX = 120;
    maxY = 80;
  }

  const rawWidth = Math.max(120, maxX - minX);
  const rawHeight = Math.max(80, maxY - minY);
  const pad = Math.max(32, Math.round(Math.max(rawWidth, rawHeight) * 0.06));
  const vbX = Math.floor(minX - pad);
  const vbY = Math.floor(minY - pad);
  const vbW = Math.ceil(rawWidth + pad * 2);
  const vbH = Math.ceil(rawHeight + pad * 2);

  const maxSpan = Math.max(vbW, vbH);
  const strokeScale = Math.max(1, Math.min(2.6, maxSpan / 480));

  return {
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    strokeScale,
    showSubLabels: doc.components.length <= 48,
    components,
    wires,
    junctions,
  };
}

interface MiniSchematicPreviewProps {
  document: CircuitDocument;
}

function MiniSchematicPreview({ document }: MiniSchematicPreviewProps) {
  const gridPatternId = useId();
  const geometry = useMemo(() => buildSchematicPreviewGeometry(document), [document]);

  return (
    <div className="overflow-hidden rounded-xl border border-[#1E2633] bg-[#06090D]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2633] bg-[#090C10]/90 px-3.5 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Cpu className="h-3.5 w-3.5 text-[#00E5FF]" />
          <span>Canlı Şematik Önizleme</span>
          <span className="rounded border border-[#1E2633] bg-[#141B24] px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-400">
            {document.components.length} bileşen · {document.wires.length} kablo
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[10px] text-slate-400">
          {SCHEMATIC_LEGEND_ITEMS.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="relative p-2">
        <svg
          viewBox={geometry.viewBox}
          className="h-56 w-full rounded-lg bg-[#05070B] sm:h-64"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${document.name} canlı şematik önizlemesi`}
        >
          <defs>
            <pattern
              id={gridPatternId}
              width={20}
              height={20}
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="#141B24"
                strokeWidth={0.8}
                vectorEffect="non-scaling-stroke"
              />
            </pattern>
          </defs>

          <rect x="-50000" y="-50000" width="100000" height="100000" fill={`url(#${gridPatternId})`} />

          {/* Orthogonal schematic wires */}
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {geometry.wires.map((wire) => (
              <polyline
                key={wire.id}
                points={wire.pointsAttr}
                stroke={wire.stroke}
                strokeOpacity={0.68}
                strokeWidth={1.8 * geometry.strokeScale}
              />
            ))}
          </g>

          {/* Wire tee / multi-pin junctions */}
          <g>
            {geometry.junctions.map((pt, idx) => (
              <circle
                key={`${pt.x}-${pt.y}-${idx}`}
                cx={pt.x}
                cy={pt.y}
                r={2.8 * geometry.strokeScale}
                fill="#00E5FF"
              />
            ))}
          </g>

          {/* Component nodes */}
          <g>
            {geometry.components.map((item) => {
              const { comp } = item;
              const radius = item.matrixSize ? 6 : 4;
              const baseFontSize = Math.max(
                8,
                Math.min(13, Math.min(item.width, item.height) * 0.28),
              );
              const fontSize = Math.max(
                6.5,
                Math.min(
                  baseFontSize,
                  (item.width - 8) / Math.max(1, item.label.length * 0.65),
                ),
              );
              const subLabel = comp.props.label?.trim();
              const showExtraLabel =
                geometry.showSubLabels &&
                Boolean(subLabel) &&
                (comp.type === 'NMOS' || comp.type === 'PMOS' || subLabel !== item.label);

              return (
                <g key={comp.id}>
                  <title>
                    {`${comp.type}${subLabel ? ` (${subLabel})` : ''} [${comp.x}, ${comp.y}]`}
                  </title>

                  <rect
                    x={item.minX}
                    y={item.minY}
                    width={item.width}
                    height={item.height}
                    rx={radius}
                    fill={item.fill}
                    stroke={item.stroke}
                    strokeWidth={1.5 * geometry.strokeScale}
                  />

                  {/* Pixel matrix internal subgrid */}
                  {item.matrixSize && (
                    <g>
                      {Array.from({ length: item.matrixSize * item.matrixSize }).map((_, idx) => {
                        const gridSize = item.matrixSize as number;
                        const row = Math.floor(idx / gridSize);
                        const col = idx % gridSize;
                        const pad = 18;
                        const innerW = Math.max(20, item.width - pad * 2);
                        const innerH = Math.max(20, item.height - pad * 2);
                        const cellW = innerW / gridSize;
                        const cellH = innerH / gridSize;
                        const cx = item.minX + pad + col * cellW + cellW / 2;
                        const cy = item.minY + pad + row * cellH + cellH / 2;
                        const r = Math.max(2.5, Math.min(cellW, cellH) * 0.28);
                        return (
                          <circle
                            key={idx}
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill={item.stroke}
                            fillOpacity={0.28}
                            stroke={item.stroke}
                            strokeOpacity={0.65}
                            strokeWidth={0.9 * geometry.strokeScale}
                          />
                        );
                      })}
                    </g>
                  )}

                  {/* Pins */}
                  {item.pins.map((pinPos, idx) => (
                    <circle
                      key={idx}
                      cx={pinPos.x}
                      cy={pinPos.y}
                      r={2.1 * geometry.strokeScale}
                      fill={item.stroke}
                    />
                  ))}

                  {/* Component core label */}
                  {!item.matrixSize && (
                    <text
                      x={comp.x}
                      y={comp.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={item.textColor}
                      fontSize={fontSize}
                      fontWeight={700}
                      fontFamily="var(--font-mono), monospace"
                    >
                      {item.label}
                    </text>
                  )}

                  {/* Optional short external label */}
                  {showExtraLabel && (
                    <text
                      x={comp.x}
                      y={item.minY + item.height + 10 * geometry.strokeScale}
                      textAnchor="middle"
                      fill="#94A3B8"
                      fontSize={8.5 * Math.min(1.3, geometry.strokeScale)}
                      fontFamily="var(--font-mono), monospace"
                    >
                      {subLabel}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

interface JsonPreviewModalProps {
  project: ExampleProjectMeta;
  onClose: () => void;
  onOpenProject: (projectId: string) => void;
}

type ModalFetchState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; document: CircuitDocument; rawJson: string };

function JsonPreviewModal({ project, onClose, onOpenProject }: JsonPreviewModalProps) {
  const [fetchState, setFetchState] = useState<ModalFetchState>({ status: 'loading' });
  const [retryToken, setRetryToken] = useState(0);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFetchState({ status: 'loading' });
    setCopied(false);

    fetchExampleProjectDocument(project)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setFetchState({
            status: 'ready',
            document: res.document,
            rawJson: res.rawJson,
          });
        } else {
          setFetchState({ status: 'error', error: res.error });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : 'JSON dosyası yüklenirken beklenmeyen bir hata oluştu.';
        setFetchState({ status: 'error', error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [project, retryToken]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const formattedJson = useMemo(() => {
    if (fetchState.status !== 'ready') return '';
    return fetchState.rawJson.trim()
      ? fetchState.rawJson
      : JSON.stringify(fetchState.document, null, 2);
  }, [fetchState]);

  const jsonMetrics = useMemo(() => {
    if (!formattedJson) return null;
    const lines = formattedJson.split('\n').length;
    const kb = (new Blob([formattedJson]).size / 1024).toFixed(1);
    return { lines, kb };
  }, [formattedJson]);

  const handleCopyJson = async () => {
    if (!formattedJson) return;
    let copiedOk = false;

    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(formattedJson);
        copiedOk = true;
      }
    } catch {
      copiedOk = false;
    }

    if (!copiedOk) {
      try {
        const textarea = window.document.createElement('textarea');
        textarea.value = formattedJson;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        window.document.body.appendChild(textarea);
        textarea.select();
        copiedOk = window.document.execCommand('copy');
        window.document.body.removeChild(textarea);
      } catch {
        copiedOk = false;
      }
    }

    if (copiedOk) {
      setCopied(true);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        copyTimerRef.current = null;
      }, 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="json-preview-modal-title"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#1E2633] bg-[#0E131A] shadow-[0_24px_80px_rgba(0,0,0,0.75)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#1E2633] bg-[#090C10]/85 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-[#1E2633] bg-[#141B24] px-2 py-0.5 font-mono text-[11px] font-bold text-[#00E5FF]">
                {formatOrderBadge(project.order)}
              </span>
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${DIFFICULTY_BADGE_STYLES[project.difficulty]}`}
              >
                {project.difficulty}
              </span>
              <span className="rounded-md border border-[#1E2633] bg-[#141B24] px-2 py-0.5 font-mono text-[11px] text-slate-400">
                {project.filename}
              </span>
            </div>
            <h2
              id="json-preview-modal-title"
              className="mt-1.5 truncate text-base font-bold text-slate-100 sm:text-lg"
            >
              {project.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">{project.subtitle}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-transparent p-1.5 text-slate-400 transition-colors hover:border-[#1E2633] hover:bg-[#141B24] hover:text-slate-100"
            aria-label="Önizleme penceresini kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {fetchState.status === 'loading' && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#1E2633] bg-[#090C10]/70 py-16 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-[#00E5FF]" />
              <div>
                <p className="text-sm font-medium text-slate-200">
                  JSON Devre Şeması Yükleniyor...
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">
                  {project.jsonPath}
                </p>
              </div>
            </div>
          )}

          {fetchState.status === 'error' && (
            <div className="rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#EF4444]" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-red-200">
                    Devre JSON Dosyası Yüklenemedi
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-red-200/80">
                    {fetchState.error}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryToken((prev) => prev + 1)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/25"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Tekrar Dene</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {fetchState.status === 'ready' && (
            <>
              <MiniSchematicPreview document={fetchState.document} />

              <div className="overflow-hidden rounded-xl border border-[#1E2633] bg-[#090C10]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2633] bg-[#141B24]/80 px-3.5 py-2">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="h-3.5 w-3.5 text-[#00E5FF]" />
                    <span className="font-mono text-xs font-semibold text-slate-200">
                      CircuitDocument v1 JSON
                    </span>
                    {jsonMetrics && (
                      <span className="font-mono text-[11px] text-slate-400">
                        · {jsonMetrics.lines} satır · {jsonMetrics.kb} KB
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                      copied
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : 'border-[#1E2633] bg-[#0E131A] text-slate-200 hover:border-[#00E5FF]/50 hover:text-[#00E5FF]'
                    }`}
                  >
                    {copied ? (
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

                <pre className="max-h-80 overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-200">
                  <code>{formattedJson}</code>
                </pre>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1E2633] bg-[#090C10]/90 px-5 py-3">
          <span className="text-xs text-slate-400">
            Önerilen simülasyon hızı:{' '}
            <span className="font-mono font-semibold text-[#00E5FF]">
              {project.defaultClockHz} Tick/sn
            </span>
          </span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#1E2633] bg-[#141B24] px-3.5 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100"
            >
              Kapat
            </button>

            <a
              href={project.jsonPath}
              download={project.filename}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#1E2633] bg-[#141B24] px-3.5 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-[#00E5FF]/40 hover:text-[#00E5FF]"
            >
              <Download className="h-3.5 w-3.5" />
              <span>JSON İndir</span>
            </a>

            <button
              type="button"
              onClick={() => {
                const targetId = project.id;
                onClose();
                onOpenProject(targetId);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#00E5FF] px-4 py-2 text-xs font-bold text-[#090C10] shadow-[0_0_16px_rgba(0,229,255,0.28)] transition-all hover:bg-[#33ecff]"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Simülatörde Aç</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProjectCardProps {
  project: ExampleProjectMeta;
  onOpenProject: (projectId: string) => void;
  onPreview: (project: ExampleProjectMeta) => void;
  onTagClick: (tag: string) => void;
}

function ProjectCard({ project, onOpenProject, onPreview, onTagClick }: ProjectCardProps) {
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-[#1E2633] bg-[#0E131A] p-5 transition-all hover:border-[#00E5FF]/45 hover:bg-[#101720] hover:shadow-[0_12px_36px_rgba(0,0,0,0.45)]">
      {/* Top badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded-lg border border-[#1E2633] bg-[#141B24] px-2 py-0.5 font-mono text-xs font-bold text-[#00E5FF]">
            {formatOrderBadge(project.order)}
          </span>
          <span
            className={`rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${DIFFICULTY_BADGE_STYLES[project.difficulty]}`}
          >
            {project.difficulty}
          </span>
        </div>

        <span className="rounded-full border border-[#1E2633] bg-[#141B24] px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
          {project.category}
        </span>
      </div>

      {/* Title & Subtitle */}
      <div className="mt-3.5">
        <h2 className="text-base font-bold leading-snug text-slate-100 transition-colors group-hover:text-[#00E5FF]">
          {project.title}
        </h2>
        <p className="mt-0.5 text-xs font-medium text-[#38BDF8]/90">{project.subtitle}</p>
      </div>

      {/* Description */}
      <p className="mt-2.5 text-xs leading-relaxed text-slate-300">{project.description}</p>

      {/* How it works & controls hint callout */}
      <div className="mt-3.5 space-y-2 rounded-xl border border-[#1E2633] bg-[#090C10]/85 p-3 text-[11px] leading-relaxed">
        <div className="flex items-start gap-2 text-slate-300">
          <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#00E5FF]" />
          <div>
            <span className="font-semibold text-slate-200">Nasıl Çalışır: </span>
            <span className="text-slate-400">{project.howItWorks}</span>
          </div>
        </div>
        <div className="flex items-start gap-2 border-t border-[#1E2633]/70 pt-2 text-slate-300">
          <Keyboard className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold text-slate-200">Kontrol: </span>
            <span className="text-slate-400">{project.controlsHint}</span>
          </div>
        </div>
      </div>

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              className="rounded-md border border-[#1E2633] bg-[#141B24]/70 px-2 py-0.5 font-mono text-[10px] text-slate-400 transition-colors hover:border-[#00E5FF]/40 hover:text-[#00E5FF]"
              title={`"${tag}" etiketiyle filtrele`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Telemetry chips */}
      <div className="mt-4 grid grid-cols-2 gap-1.5 font-mono text-[11px] sm:grid-cols-4">
        <div className="rounded-lg border border-[#1E2633] bg-[#090C10] px-2 py-1.5 text-center">
          <div className="text-[9px] tracking-wider text-slate-500 uppercase">Transistör</div>
          <div className="font-bold text-[#00E5FF]">{project.transistorCount} TX</div>
        </div>
        <div className="rounded-lg border border-[#1E2633] bg-[#090C10] px-2 py-1.5 text-center">
          <div className="text-[9px] tracking-wider text-slate-500 uppercase">Bileşen</div>
          <div className="font-semibold text-slate-200">{project.componentCount}</div>
        </div>
        <div className="rounded-lg border border-[#1E2633] bg-[#090C10] px-2 py-1.5 text-center">
          <div className="text-[9px] tracking-wider text-slate-500 uppercase">Kablo</div>
          <div className="font-semibold text-slate-200">{project.wireCount}</div>
        </div>
        <div className="rounded-lg border border-[#1E2633] bg-[#090C10] px-2 py-1.5 text-center">
          <div className="text-[9px] tracking-wider text-slate-500 uppercase">Hız</div>
          <div className="flex items-center justify-center gap-0.5 font-semibold text-emerald-300">
            <Zap className="h-2.5 w-2.5" />
            <span>{project.defaultClockHz}/sn</span>
          </div>
        </div>
      </div>

      {/* 3 Action Buttons */}
      <div className="mt-auto pt-4">
        <div className="flex flex-wrap items-center gap-2 border-t border-[#1E2633]/80 pt-3.5">
          <button
            type="button"
            onClick={() => onOpenProject(project.id)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#00E5FF] px-3 py-2 text-xs font-bold text-[#090C10] shadow-[0_0_16px_rgba(0,229,255,0.2)] transition-all hover:bg-[#33ecff]"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Simülatörde Aç</span>
          </button>

          <a
            href={project.jsonPath}
            download={project.filename}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#1E2633] bg-[#141B24] px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-[#00E5FF]/40 hover:text-[#00E5FF]"
          >
            <Download className="h-3.5 w-3.5" />
            <span>JSON İndir</span>
          </a>

          <button
            type="button"
            onClick={() => onPreview(project)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#1E2633] bg-[#141B24] px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-[#00E5FF]/40 hover:text-[#00E5FF]"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>JSON Önizle</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export function ProjectsPage({ onOpenProject, onOpenCustomJson }: ProjectsPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('Tümü');
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyFilter>('Tümü');
  const [previewProject, setPreviewProject] = useState<ExampleProjectMeta | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isReadingFile, setIsReadingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const totalTransistors = useMemo(
    () => EXAMPLE_PROJECTS.reduce((acc, item) => acc + item.transistorCount, 0),
    [],
  );

  const categoryCounts = useMemo(() => {
    const counts = new Map<ProjectCategory, number>();
    for (const cat of EXAMPLE_PROJECT_CATEGORIES) {
      counts.set(cat, 0);
    }
    for (const project of EXAMPLE_PROJECTS) {
      counts.set(project.category, (counts.get(project.category) ?? 0) + 1);
    }
    return counts;
  }, []);

  const filteredProjects = useMemo(() => {
    const query = normalizeTr(searchQuery);

    return EXAMPLE_PROJECTS.filter((project) => {
      if (selectedCategory !== 'Tümü' && project.category !== selectedCategory) {
        return false;
      }
      if (selectedDifficulty !== 'Tümü' && project.difficulty !== selectedDifficulty) {
        return false;
      }
      if (!query) {
        return true;
      }

      const haystack = [
        project.title,
        project.subtitle,
        project.description,
        project.category,
        project.filename,
        ...project.tags,
      ]
        .map(normalizeTr)
        .join(' ');

      return haystack.includes(query);
    });
  }, [searchQuery, selectedCategory, selectedDifficulty]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedCategory !== 'Tümü' ||
    selectedDifficulty !== 'Tümü';

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('Tümü');
    setSelectedDifficulty('Tümü');
  };

  const handleTagClick = (tag: string) => {
    setSearchQuery((prev) => (normalizeTr(prev) === normalizeTr(tag) ? '' : tag));
  };

  const handlePickFileClick = () => {
    setFileError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.currentTarget;
    const file = inputEl.files?.[0];
    if (!file) return;

    setFileError(null);
    setIsReadingFile(true);

    try {
      if (file.size === 0) {
        setFileError(`"${file.name}" dosyası boş görünüyor.`);
        return;
      }

      const text = await file.text();
      if (!text.trim()) {
        setFileError(`"${file.name}" dosyası okunabilir JSON metni içermiyor.`);
        return;
      }

      onOpenCustomJson(text);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Bilinmeyen okuma hatası.';
      setFileError(`"${file.name}" okunurken hata oluştu: ${reason}`);
    } finally {
      setIsReadingFile(false);
      inputEl.value = '';
    }
  };

  return (
    <div className="min-h-full bg-[#090C10] text-slate-200">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Hidden File Input for Custom JSON */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-2xl border border-[#1E2633] bg-[#0E131A] p-6 sm:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#00E5FF]/10 blur-3xl"
          />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00E5FF]/40 bg-[#00E5FF]/10 px-3 py-1 text-xs font-semibold text-[#00E5FF]">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>%100 Saf NMOS / PMOS Transistör</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Sıfır Kara Kutu IC &amp; Hazır Kapı</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1E2633] bg-[#141B24] px-3 py-1 font-mono text-xs text-slate-300">
                  <Layers className="h-3.5 w-3.5 text-[#00E5FF]" />
                  <span>
                    {EXAMPLE_PROJECTS.length} Proje · {totalTransistors} Fiziksel Transistör
                  </span>
                </span>
              </div>

              <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
                Örnek JSON Projeleri
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Temel CMOS mantık kapılarından halka osilatöre, SR/D bellek hücrelerinden 4×4 ham
                piksel matris dekodere kadar tüm devreler yalnızca fiziksel NMOS ve PMOS
                transistörlerle kurulmuştur. Tek tıkla simülatörde açabilir, JSON şemasını
                inceleyebilir veya bilgisayarınıza indirebilirsiniz.
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row lg:flex-col">
              <button
                type="button"
                onClick={handlePickFileClick}
                disabled={isReadingFile}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#00E5FF]/50 bg-[#141B24] px-4 py-3 text-sm font-semibold text-[#00E5FF] shadow-[0_0_20px_rgba(0,229,255,0.12)] transition-all hover:bg-[#00E5FF]/15 disabled:cursor-wait disabled:opacity-60"
              >
                {isReadingFile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                <span>Kendi JSON Dosyanı Aç</span>
              </button>
              <span className="text-center font-mono text-[11px] text-slate-500">
                CircuitDocument v1 (.json)
              </span>
            </div>
          </div>
        </section>

        {/* File read error banner */}
        {fileError && (
          <div
            role="alert"
            className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[#EF4444]/50 bg-[#EF4444]/10 px-4 py-3 text-xs text-red-200"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#EF4444]" />
              <span>{fileError}</span>
            </div>
            <button
              type="button"
              onClick={() => setFileError(null)}
              className="rounded-lg p-1 text-red-200/80 transition-colors hover:bg-red-500/20 hover:text-red-100"
              aria-label="Hata mesajını kapat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Filter Bar */}
        <section className="mt-6 space-y-4 rounded-2xl border border-[#1E2633] bg-[#0E131A]/90 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search input */}
            <div className="relative flex-1 lg:max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Proje, etiket veya devre ara (örn. XOR, latch, matris)..."
                aria-label="Örnek projelerde ara"
                className="w-full rounded-xl border border-[#1E2633] bg-[#090C10] py-2.5 pr-9 pl-10 text-xs text-slate-100 placeholder-slate-500 transition-colors focus:border-[#00E5FF] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-slate-400 transition-colors hover:bg-[#141B24] hover:text-slate-100"
                  aria-label="Aramayı temizle"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Difficulty pills + counter */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Zorluk filtresi">
                <span className="mr-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                  Seviye:
                </span>
                {DIFFICULTY_OPTIONS.map((difficulty) => {
                  const active = selectedDifficulty === difficulty;
                  return (
                    <button
                      key={difficulty}
                      type="button"
                      onClick={() => setSelectedDifficulty(difficulty)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all ${
                        active
                          ? 'border-[#00E5FF] bg-[#00E5FF]/15 text-[#00E5FF]'
                          : 'border-[#1E2633] bg-[#090C10] text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      {difficulty}
                    </button>
                  );
                })}
              </div>

              <div className="font-mono text-xs text-slate-400">
                <span className="font-bold text-[#00E5FF]">{filteredProjects.length}</span> /{' '}
                {EXAMPLE_PROJECTS.length} proje
              </div>
            </div>
          </div>

          {/* Category Tabs */}
          <div
            className="flex flex-wrap items-center gap-1.5 border-t border-[#1E2633]/80 pt-3.5"
            role="tablist"
            aria-label="Proje kategorileri"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === 'Tümü'}
              onClick={() => setSelectedCategory('Tümü')}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                selectedCategory === 'Tümü'
                  ? 'border-[#00E5FF] bg-[#00E5FF] text-[#090C10] shadow-[0_0_12px_rgba(0,229,255,0.25)]'
                  : 'border-[#1E2633] bg-[#141B24]/70 text-slate-300 hover:border-slate-600 hover:text-slate-100'
              }`}
            >
              <span>Tümü</span>
              <span
                className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
                  selectedCategory === 'Tümü'
                    ? 'bg-[#090C10]/20 text-[#090C10]'
                    : 'bg-[#090C10] text-slate-400'
                }`}
              >
                {EXAMPLE_PROJECTS.length}
              </span>
            </button>

            {EXAMPLE_PROJECT_CATEGORIES.map((category) => {
              const active = selectedCategory === category;
              const count = categoryCounts.get(category) ?? 0;
              return (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedCategory(category)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? 'border-[#00E5FF] bg-[#00E5FF] text-[#090C10] shadow-[0_0_12px_rgba(0,229,255,0.25)]'
                      : 'border-[#1E2633] bg-[#141B24]/70 text-slate-300 hover:border-slate-600 hover:text-slate-100'
                  }`}
                >
                  <span>{category}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${
                      active
                        ? 'bg-[#090C10]/20 text-[#090C10]'
                        : 'bg-[#090C10] text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-[#141B24] hover:text-[#00E5FF]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Filtreleri Sıfırla</span>
              </button>
            )}
          </div>
        </section>

        {/* Cards Grid or Empty State */}
        {filteredProjects.length > 0 ? (
          <section
            className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
            aria-label="Örnek JSON projeleri listesi"
          >
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpenProject={onOpenProject}
                onPreview={setPreviewProject}
                onTagClick={handleTagClick}
              />
            ))}
          </section>
        ) : (
          <section className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-[#1E2633] bg-[#0E131A] px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#1E2633] bg-[#141B24] text-[#00E5FF]">
              <FileJson className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-100">
              Eşleşen Örnek Proje Bulunamadı
            </h2>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-400">
              Seçili arama terimi, kategori veya zorluk seviyesiyle eşleşen bir devre yok. Tüm
              örnek projeleri tekrar görmek için filtreleri sıfırlayabilirsiniz.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#00E5FF] px-4 py-2 text-xs font-bold text-[#090C10] shadow-[0_0_16px_rgba(0,229,255,0.25)] transition-colors hover:bg-[#33ecff]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Filtreleri Sıfırla</span>
              </button>
              <button
                type="button"
                onClick={handlePickFileClick}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#1E2633] bg-[#141B24] px-4 py-2 text-xs font-semibold text-slate-200 transition-colors hover:border-[#00E5FF]/40 hover:text-[#00E5FF]"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span>Kendi JSON Dosyanı Aç</span>
              </button>
            </div>
          </section>
        )}
      </div>

      {/* JSON Preview Modal */}
      {previewProject && (
        <JsonPreviewModal
          project={previewProject}
          onClose={() => setPreviewProject(null)}
          onOpenProject={onOpenProject}
        />
      )}
    </div>
  );
}

export default ProjectsPage;
