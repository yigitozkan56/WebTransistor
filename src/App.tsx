import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { SiteHeader } from './components/SiteHeader';
import {
  fetchExampleProjectDocument,
  getExampleProjectById,
} from './data/exampleProjects';
import { ProjectsPage } from './pages/ProjectsPage';
import {
  SimulatorPage,
  type ExternalCircuitLoadRequest,
} from './pages/SimulatorPage';
import { WikiPage } from './pages/WikiPage';
import {
  clearProjectQuery,
  getInitialProjectParam,
  useRoute,
  type AppRoute,
} from './router/useRoute';
import { parseAndValidateCircuitDocument } from './store/circuitStore';

const ROUTE_TITLES: Record<AppRoute, string> = {
  simulator: 'WebTransistor — Sanal Transistör & Çip Simülatörü',
  wiki: 'Wiki — WebTransistor',
  projects: 'Örnek JSON Projeleri — WebTransistor',
};

interface ShellToast {
  kind: 'error' | 'info';
  message: string;
}

export default function App() {
  const { route, navigate } = useRoute();
  const [externalLoadRequest, setExternalLoadRequest] =
    useState<ExternalCircuitLoadRequest | null>(null);
  const [shellToast, setShellToast] = useState<ShellToast | null>(null);

  const nonceCounterRef = useRef(0);
  const latestOpenRequestRef = useRef(0);
  const initialProjectHandledRef = useRef(false);

  const nextNonce = useCallback(() => {
    nonceCounterRef.current += 1;
    return Date.now() * 1000 + (nonceCounterRef.current % 1000);
  }, []);

  useEffect(() => {
    window.document.title = ROUTE_TITLES[route];
  }, [route]);

  useEffect(() => {
    if (!shellToast) return;
    const timer = window.setTimeout(() => setShellToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [shellToast]);

  const handleOpenProject = useCallback(
    async (projectId: string) => {
      const requestSeq = ++latestOpenRequestRef.current;
      const project = getExampleProjectById(projectId);
      if (!project) {
        setShellToast({
          kind: 'error',
          message: `Örnek proje bulunamadı: "${projectId}".`,
        });
        return;
      }

      const res = await fetchExampleProjectDocument(project);
      if (requestSeq !== latestOpenRequestRef.current) {
        return;
      }

      if (!res.ok) {
        setShellToast({
          kind: 'error',
          message: `"${project.title}" yüklenemedi: ${res.error}`,
        });
        return;
      }

      setShellToast(null);
      setExternalLoadRequest({
        doc: res.document,
        clockHz: project.defaultClockHz,
        nonce: nextNonce(),
      });
      navigate('simulator');
    },
    [navigate, nextNonce],
  );

  const handleOpenCustomJson = useCallback(
    (jsonText: string) => {
      const validation = parseAndValidateCircuitDocument(jsonText);
      if (!validation.ok) {
        setShellToast({
          kind: 'error',
          message: validation.error,
        });
        return;
      }

      setShellToast(null);
      setExternalLoadRequest({
        doc: validation.document,
        clockHz: 6,
        nonce: nextNonce(),
      });
      navigate('simulator');
    },
    [navigate, nextNonce],
  );

  // Support direct deep links like /?project=04-cmos-xor-gate
  useEffect(() => {
    if (initialProjectHandledRef.current) return;
    initialProjectHandledRef.current = true;
    const projectId = getInitialProjectParam();
    if (projectId) {
      clearProjectQuery();
      void handleOpenProject(projectId);
    }
  }, [handleOpenProject]);

  const handleOpenSimulator = useCallback(() => {
    navigate('simulator');
  }, [navigate]);

  const handleNavigateProjects = useCallback(() => {
    navigate('projects');
  }, [navigate]);

  const handleNavigateWiki = useCallback(() => {
    navigate('wiki');
  }, [navigate]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#090C10] text-slate-200">
      <SiteHeader activeRoute={route} onNavigate={navigate} />

      <div
        className={
          route === 'simulator'
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
            : 'hidden'
        }
      >
        <SimulatorPage
          isActive={route === 'simulator'}
          externalLoadRequest={externalLoadRequest}
          onNavigateProjects={handleNavigateProjects}
          onNavigateWiki={handleNavigateWiki}
        />
      </div>

      {route === 'wiki' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <WikiPage
            onOpenSimulator={handleOpenSimulator}
            onOpenProject={handleOpenProject}
            onNavigateProjects={handleNavigateProjects}
          />
        </div>
      )}

      {route === 'projects' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProjectsPage
            onOpenProject={handleOpenProject}
            onOpenCustomJson={handleOpenCustomJson}
          />
        </div>
      )}

      {shellToast && (
        <div
          role="alert"
          className={`fixed right-4 bottom-4 z-50 flex max-w-md items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs shadow-2xl backdrop-blur-md ${
            shellToast.kind === 'error'
              ? 'border-red-500/50 bg-[#0E131A]/95 text-red-300'
              : 'border-[#00E5FF]/40 bg-[#0E131A]/95 text-[#00E5FF]'
          }`}
        >
          {shellToast.kind === 'error' ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span className="text-slate-100">{shellToast.message}</span>
          <button
            type="button"
            onClick={() => setShellToast(null)}
            aria-label="Bildirimi kapat"
            className="ml-1 rounded p-0.5 text-slate-400 hover:bg-[#141B24] hover:text-slate-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
