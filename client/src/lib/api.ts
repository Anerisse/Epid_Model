// ============================================================
// lib/api.ts — клиент к API сервера (Next.js, порт 3001).
// В dev-режиме Vite проксирует /api на http://localhost:3001.
// Типы ответов соответствуют серверным роутам (app/api/*).
// ============================================================

const API_BASE = "/api";

// --- Общие типы (зеркало server/core/*.ts) ---------------------

export interface ParamPreset {
  value: number;
  min: number;
  max: number;
  step: number;
}

export interface Flow {
  from: string;
  to: string | null;
  label: string;
  drivers: string[];
}

export interface CompartmentInfo {
  name: string;
  derivType: string;
  denominator: string | null;
  rhs_text: string;
}

export interface ModelStructure {
  compartments: CompartmentInfo[];
  parameters: string[];
  time_vars: string[];
  functions: string[];
  flows: Flow[];
}

export interface Box {
  x: number;
  y: number;
  size: number;
}

export interface DiagramLayout {
  order: string[];
  boxes: Record<string, Box>;
  flows: Flow[];
  colors: Record<string, string>;
}

export interface SimStats {
  peakValue: number | null;
  peakDay: number | null;
  recovered: number | null;
  steps: number;
}

export type AnalysisDetails =
  | { kind: "terms"; rows: { name: string; F: string; V: string }[] }
  | { kind: "matrices"; F: string; V: string };

export interface AnalysisReport {
  r0: number | null;
  verdict: string;
  tone: string;
  head: string;
  formula: string | null;
  infected: string[];
  threshold: number | null;
  finalSize: number | null;
  conservation: string;
  details: AnalysisDetails | null;
}

export interface ParseResponse {
  ok: boolean;
  error?: string;
  structure?: ModelStructure;
  presets?: Record<string, ParamPreset>;
  diagram?: DiagramLayout;
}

export interface SimulateResponse {
  ok: boolean;
  error?: string;
  time: number[];
  series: number[][];
  names: string[];
  colors: string[];
  rhsText: string[];
  stats: SimStats;
  analysis: AnalysisReport;
}

export interface FitPoint {
  t: number;
  value: number;
}

export interface FitResponse {
  ok: boolean;
  error?: string;
  params: Record<string, number>;
  rmse: number;
  r2: number;
  iterations: number;
  time: number[];
  model: number[];
  points: FitPoint[];
}

export interface SyntheticResponse {
  ok: boolean;
  error?: string;
  text: string;
  params?: Record<string, number>;
}

export interface ModelRecord {
  id: number;
  name: string;
  raw_text: string;
  structure: unknown | null;
  created_at: string;
  updated_at: string;
}

// --- HTTP-хелперы ------------------------------------------------

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `Ошибка HTTP ${res.status}`);
  }
  return data as T;
}

export function getJson<T>(url: string): Promise<T> {
  return request<T>(url);
}

export function postJson<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function patchJson<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function del<T>(url: string): Promise<T> {
  return request<T>(url, { method: "DELETE" });
}

// --- Типизированные вызовы конечных точек ------------------------

export const api = {
  parse: (text: string) => postJson<ParseResponse>("/parse", { text }),
  simulate: (payload: {
    text: string;
    params: Record<string, number>;
    initial: Record<string, number>;
    horizon: number;
    manualFormula?: string;
  }) => postJson<SimulateResponse>("/simulate", payload),
  fit: (payload: {
    text: string;
    dataText: string;
    free: string[];
    fixed: Record<string, number>;
    N: number;
  }) => postJson<FitResponse>("/fit", payload),
  synthetic: (text: string) => postJson<SyntheticResponse>("/fit/synthetic", { text }),
  models: {
    list: () => getJson<ModelRecord[]>("/models"),
    create: (name: string, raw_text: string) =>
      postJson<ModelRecord>("/models", { name, raw_text }),
    remove: (id: number) => del<{ ok: boolean }>(`/models/${id}`),
  },
};