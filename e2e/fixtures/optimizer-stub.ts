import { createServer } from "node:http";

type Visit = { shipmentIndex?: number };
type InjectedRoute = { vehicleIndex?: number; visits?: Visit[] };
type StubRequest = {
  model?: { globalStartTime?: string; shipments?: unknown[] };
  injectedSolutionConstraint?: { routes?: InjectedRoute[] };
};

/**
 * Stands in for routeoptimization.googleapis.com. A build puts every shipment on vehicle 0 in the order given;
 * a re-check keeps the injected order per vehicle. Each route's visits run one hour apart from the global start,
 * with 10 minutes of driving between stops.
 */
export async function startOptimizerStub(port: number) {
  const requests: StubRequest[] = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (req.headers.authorization !== "Bearer e2e-token") {
        res.writeHead(401).end("{}");
        return;
      }
      const body = JSON.parse(raw || "{}") as StubRequest;
      requests.push(body);
      const start = Date.parse(body.model?.globalStartTime ?? "");
      const plan = body.injectedSolutionConstraint?.routes
        ?? [{ vehicleIndex: 0, visits: (body.model?.shipments ?? []).map((_, i) => ({ shipmentIndex: i })) }];
      const routes = plan.map((route) => ({
        vehicleIndex: route.vehicleIndex,
        visits: (route.visits ?? []).map((v, i) => ({
          shipmentIndex: v.shipmentIndex, startTime: new Date(start + i * 3_600_000).toISOString(),
        })),
        transitions: (route.visits ?? []).map((_, i) => ({ travelDuration: i === 0 ? "0s" : "600s" })),
      }));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ routes }));
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
