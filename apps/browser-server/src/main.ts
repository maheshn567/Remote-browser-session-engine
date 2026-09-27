// Catch background UDP/STUN ECONNREFUSED noise without swallowing real bugs.
// The old version's blanket `unhandledRejection` handler ate everything —
// narrowed here to only the noise it was actually meant to filter.
process.on("uncaughtException", (err: any) => {
  if (err?.code === "ECONNREFUSED" || err?.message?.includes("ECONNREFUSED")) return;
  console.error("⚠️ Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason: any) => {
  if (reason?.code === "ECONNREFUSED" || reason?.message?.includes("ECONNREFUSED")) return;
  console.error("⚠️ Unhandled Rejection:", reason);
});

import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.ts";
import { SessionManager } from "./browser/SessionManager.ts";
import { VideoCaptureService } from "./webrtc/videoCapture.ts";
import type { WebRTCGatewayService } from "./webrtc/webrtcserver.ts";
import { registerSessionRoutes } from "./routes/sessions.ts";
import { registerWebrtcRoutes } from "./routes/webrtc.ts";

async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: config.frontendOrigin });

  const sessionManager = new SessionManager();
  await sessionManager.launch();

  // One demo session to start with — createSession() supports any number
  // of concurrent ids; this just seeds the one the frontend defaults to.
  await sessionManager.createSession("demo", "https://accounts.google.com");

  const videoCapture = new VideoCaptureService();
  videoCapture.startCapture();

  const gateways = new Map<string, WebRTCGatewayService>();

  registerSessionRoutes(app, sessionManager, (id) => gateways.get(id));
  registerWebrtcRoutes(app, sessionManager, gateways);

  const shutdown = async () => {
    console.log("\n🛑 Shutting down...");
    videoCapture.stopCapture();
    for (const gateway of gateways.values()) gateway.close();
    await sessionManager.shutdown();
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`✅ Browser control & WebRTC signaling server on http://localhost:${config.port}`);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
