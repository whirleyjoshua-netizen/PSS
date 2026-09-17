import { createServer } from "node:http";

type Visit = { shipmentIndex?: number };
type InjectedRoute = { vehicleIndex?: number; visits?: Visit[] };
type Shipment = { deliveries?: { arrivalLocation?: { latitude?: number } }[] };
type StubRequest = {
  model?: { globalStartTime?: string; shipments?: Shipment[] };
  injectedSolutionConstraint?: { routes?: InjectedRoute[] };
};

/**
 * Stands in for routeoptimization.googleapis.com. A build puts every shipment on vehicle 0 in the order given;
 * a re-check keeps the injected order per vehicle. Each route's visits run one hour apart from the global start,
 * with 10 minutes of driving between stops. A shipment at latitude SKIP_LATITUDE is always reported as skipped,
 * and a vehicle with no visits is left out, as Google does.
 */
export const SKIP_LATITUDE = 36.2468;
export const STUB_PORT = 3199;

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
      let body: StubRequest;
      try {
        body = JSON.parse(raw || "{}") as StubRequest;
      } catch {
        res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "Body is not JSON" }));
        return;
      }
      requests.push(body);
      const start = Date.parse(body.model?.globalStartTime ?? "");
      const shipments = body.model?.shipments ?? [];
      const skipped = shipments.flatMap((s, i) =>
        s.deliveries?.[0]?.arrivalLocation?.latitude === SKIP_LATITUDE ? [i] : []);
      const plan = body.injectedSolutionConstraint?.routes
        ?? [{ vehicleIndex: 0, visits: shipments.map((_, i) => ({ shipmentIndex: i })) }];
      const routes = plan
        .map((route) => ({ ...route, visits: (route.visits ?? []).filter((v) => !skipped.includes(v.shipmentIndex ?? 0)) }))
        .filter((route) => route.visits.length > 0)
        .map((route) => ({
        vehicleIndex: route.vehicleIndex,
        visits: route.visits.map((v, i) => ({
          shipmentIndex: v.shipmentIndex, startTime: new Date(start + i * 3_600_000).toISOString(),
        })),
        // One transition before each visit and one after the last, as Google returns.
        transitions: [...route.visits, null].map((_, i) =>
          ({ travelDuration: i === 0 || i === route.visits.length ? "0s" : "600s" })),
      }));
      const skippedShipments = skipped.map((index) =>
        ({ index, reasons: [{ code: "CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TIME_WINDOWS" }] }));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ routes, skippedShipments }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => reject(error.code === "EADDRINUSE"
      ? new Error(`Optimizer stub: port ${port} is already in use. Stop whatever holds it (a previous e2e run?) and retry.`)
      : error));
    server.listen(port, "127.0.0.1", () => resolve());
  });
  return {
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
