import type { FastifyInstance } from "fastify";
import { WebRTCGatewayService } from "../webrtc/webrtcserver.ts";
import type { SessionManager } from "../browser/SessionManager.ts";

export function registerWebrtcRoutes(
  app: FastifyInstance,
  sessionManager: SessionManager,
  gateways: Map<string, WebRTCGatewayService>,
) {
  app.post("/sessions/:id/webrtc/offer", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sdp } = request.body as { sdp: string };
    if (!sdp) return reply.status(400).send({ error: "SDP offer required" });

    const session = sessionManager.get(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    try {
      let gateway = gateways.get(id);
      if (!gateway) {
        gateway = new WebRTCGatewayService(session.getCdp());
        gateways.set(id, gateway);
      }
      const answerSdp = await gateway.handleOffer(sdp);
      return { sdp: answerSdp };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: "Failed to process WebRTC offer" });
    }
  });
}
