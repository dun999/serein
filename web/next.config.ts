import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  // Next 16's CLI checker loses captured `tsc --showConfig` output under the
  // Node 24 runtime used by the build host. TypeScript 5.9 still exposes the
  // compiler API, so use the documented API checker instead.
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
