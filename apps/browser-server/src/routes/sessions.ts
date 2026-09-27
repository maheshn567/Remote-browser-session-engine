import type { FastifyInstance } from "fastify";
import { SessionManager } from "../browser/SessionManager.ts";
import { BrowserSession } from "../browser/BrowserSession.ts";
import type { WebRTCGatewayService } from "../webrtc/webrtcserver.ts";

export function registerSessionRoutes(
  app: FastifyInstance,
  sessionManager: SessionManager,
  getGateway: (sessionId: string) => WebRTCGatewayService | undefined,
) {
  app.get("/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.get(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    return { id: session.id, state: session.state, controller: session.controller };
  });

  app.post("/sessions/:id/take-control", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.get(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    session.takeControl();
    return { id: session.id, state: session.state, controller: session.controller };
  });

  app.post("/sessions/:id/release-control", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.get(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    session.releaseControl();
    return { id: session.id, state: session.state, controller: session.controller };
  });

  app.post("/sessions/:id/navigate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { url } = request.body as { url: string };
    const session = sessionManager.get(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    if (!url) return reply.status(400).send({ error: "URL required" });

    const targetUrl = /^https?:\/\//.test(url) ? url : `https://${url}`;
    await session.getPage().goto(targetUrl);
    return { success: true, url: targetUrl };
  });

  app.post("/sessions/:id/input", async (request, reply) => {
    const { id } = request.params as { id: string };
    const gateway = getGateway(id);
    if (!gateway) return reply.status(404).send({ error: "No active gateway for session" });
    await gateway.handleClientInputEvent(request.body);
    return { ok: true };
  });

  app.get("/sessions/:id/tabs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.get(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    const context = session.getContext();
    const pages = context.pages();
    const activePage = session.getCdp().getActivePage();
    const tabs = await Promise.all(
      pages.map(async (p, index) => ({
        index,
        title: (await p.title().catch(() => "New Tab")) || "New Tab",
        url: p.url(),
        active: activePage === p,
      })),
    );
    return { tabs };
  });

  app.post("/sessions/:id/tabs/switch", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { index } = request.body as { index: number };
    const session = sessionManager.get(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    const pages = session.getContext().pages();
    if (!pages[index]) return { success: false };
    await session.getCdp().setActivePage(pages[index]);
    return { success: true };
  });

  app.post("/sessions/:id/tabs/close", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { index } = request.body as { index: number };
    const session = sessionManager.get(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    const pages = session.getContext().pages();
    if (!pages[index] || pages.length <= 1) return { success: false };
    await pages[index].close();
    const remaining = session.getContext().pages();
    await session.getCdp().setActivePage(remaining[remaining.length - 1]);
    return { success: true };
  });

  // --- The actual point of the project ---

  app.post("/sessions/:id/capture-auth", async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = sessionManager.get(id);
    if (!session) return reply.status(404).send({ error: "Session not found" });

    const result = await session.captureAuth();
    return { success: true, ...result };
  });

  app.get("/sessions/:id/has-captured-auth", async (request) => {
    const { id } = request.params as { id: string };
    return { captured: await BrowserSession.hasCapturedAuth(id) };
  });

  app.post("/sessions/:id/replay", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { targetUrl } = request.body as { targetUrl: string };
    if (!targetUrl) return reply.status(400).send({ error: "targetUrl required" });

    try {
      const result = await BrowserSession.replay(sessionManager.getBrowser(), id, targetUrl);
      return { success: true, ...result };
    } catch (err) {
      return reply.status(404).send({ error: "No captured auth found for this session" });
    }
  });
}
