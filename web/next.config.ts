import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfkit ships AFM core-font binaries and exceljs lazy-requires zip helpers —
  // bundling them through Turbopack breaks runtime resource resolution. Leave
  // them as plain Node modules so server routes can require them at runtime.
  serverExternalPackages: ["pdfkit", "exceljs"],
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
