import { PUBLIC_DEPLOYMENT } from "@/lib/deployment";
import { checkDeploymentHealth } from "@/lib/deployment-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const health = await checkDeploymentHealth(PUBLIC_DEPLOYMENT);
  return Response.json(health, {
    status: health.status === "ready" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
