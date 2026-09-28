// pages/verification-page.tsx — раздел «Верификация» (план).
import { ShieldCheck } from "lucide-react";
import { PlanPlaceholder } from "../components/plan-placeholder";

export function VerificationPage() {
  return (
    <PlanPlaceholder
      title="Верификация"
      description="Сравнение модели с реальными (или синтетическими) данными: расчёт метрик согласия, визуальная сверка кривых, проверка адекватности параметров."
      icon={ShieldCheck}
      points={[
        "Сравнение ряда I(t) модели с наблюдениями на общем графике",
        "Метрики согласия: RMSE, R², коэффициент корреляции Пирсона",
        "Проверка на обучающей и контрольной выборке (обобщение)",
        "Синтетические данные симулятора как контрольная точка",
      ]}
      inputs={["структура модели", "подобранные параметры (МНК)", "наблюдения I(t)" , "горизонт прогноза"]}
      server="POST /api/verify"
    />
  );
}