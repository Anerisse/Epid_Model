// App.tsx — маршрутизация приложения. Разделы соответствуют
// заданному списку; состояние модели общее (ModelProvider).
// Страницы подгружаются лениво (React.lazy) — recharts и прочие
// тяжёлые модули попадают только в бандлы нужных разделов.
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { ModelProvider } from "./lib/model-context";
import { AppShell } from "./components/app-shell";

const ModelPage = lazy(() => import("./pages/model-page").then((m) => ({ default: m.ModelPage })));
const SimulationPage = lazy(() =>
  import("./pages/simulation-page").then((m) => ({ default: m.SimulationPage })),
);
const ParametrizationPage = lazy(() =>
  import("./pages/parametrization-page").then((m) => ({ default: m.ParametrizationPage })),
);
const VerificationPage = lazy(() =>
  import("./pages/verification-page").then((m) => ({ default: m.VerificationPage })),
);
const SensitivityPage = lazy(() =>
  import("./pages/sensitivity-page").then((m) => ({ default: m.SensitivityPage })),
);
const ScenarioPage = lazy(() =>
  import("./pages/scenario-page").then((m) => ({ default: m.ScenarioPage })),
);

// Заглушка на время загрузки чанка раздела
function PageLoader() {
  return (
    <div className="grid h-full min-h-[60vh] place-items-center">
      <Loader2 className="size-6 animate-spin text-emerald-300" />
    </div>
  );
}

export default function App() {
  return (
    <ModelProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<ModelPage />} />
            <Route path="/parametrization" element={<ParametrizationPage />} />
            <Route path="/simulation" element={<SimulationPage />} />
            <Route path="/verification" element={<VerificationPage />} />
            <Route path="/sensitivity" element={<SensitivityPage />} />
            <Route path="/scenario" element={<ScenarioPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ModelProvider>
  );
}