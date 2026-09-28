// next.config.mjs — конфигурация Next.js: порт 3001, native-модуль SQLite
// помечается как серверный пакет (не бандлится webpack'ом).
/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;