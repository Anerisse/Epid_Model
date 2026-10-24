import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./lib/theme";
import "./index.css";

// Точка входа: React + React Router (BrowserRouter) поверх Vite.
// Все вычисления — на сервере (Next.js, см. src/lib/api.ts).
// ThemeProvider — переключение тёмной/светлой темы (класс .light).
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);