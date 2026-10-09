import { MediaStreamTrack, RTCPeerConnection, RtpPacket } from "werift";
import { createSocket, type Socket } from "node:dgram";
import { CDPController } from "../browser/cdpController.ts";

export class WebRTCGatewayService {
  private peerConnection: RTCPeerConnection | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private udpSocket: Socket | null = null;

  constructor(private cdp: CDPController) {
    // 1. Bind UDP Socket on port 5004 for FFmpeg RTP video packets
    this.udpSocket = createSocket("udp4");

    // Catch transient ICMP UDP errors to prevent process crashes
    this.udpSocket.on("error", (err) => {
      // Ignore ECONNREFUSED/ICMP transient packet errors
    });

    this.udpSocket.bind(5004, "127.0.0.1", () => {
      console.log("🎥 Server listening for VP8 RTP video packets on UDP port 5004...");
    });

    // 2. Pipe incoming RTP video packets into WebRTC Track!
    this.udpSocket.on("message", (buf) => {
      if (this.videoTrack) {
        this.videoTrack.writeRtp(buf);
      }
    });
  }

  /**
   * Processes incoming WebRTC SDP Offer from Next.js client
   */
  async handleOffer(sdpOffer: string): Promise<string> {
    console.log("🌐 Received WebRTC SDP Offer from Next.js client...");

    try {
      // Each offer gets its own local connection. Overlapping offers (e.g.
      // React StrictMode mounting the page twice) previously shared
      // this.peerConnection across awaits, so one request could answer with
      // another request's SDP and the browser never received video.
      this.peerConnection?.close();
      const pc = new RTCPeerConnection({
        iceServers: [],
      });

      // 3. Create VP8 MediaStreamTrack
      const track = new MediaStreamTrack({
        kind: "video",
        codec: {
          mimeType: "video/VP8",
          clockRate: 90000,
          payloadType: 96,
        },
      } as any);
      this.peerConnection = pc;
      this.videoTrack = track;

      // Add track to PeerConnection
      pc.addTrack(track);

      // Setup DataChannel listener
      pc.onDataChannel.subscribe((dc) => {
        console.log(`⚡ DataChannel connected: '${dc.label}'`);
        dc.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data.toString());
            this.handleClientInputEvent(parsed);
          } catch (err) {
            console.error("Error parsing DataChannel message:", err);
          }
        };
      });

      // Set Remote Description (Client Offer)
      await pc.setRemoteDescription({
        type: "offer",
        sdp: sdpOffer,
      });

      // Create Local Answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // 4. WAIT for ICE Gathering to complete so all candidates are embedded in SDP!
      console.log("⏳ Gathering WebRTC ICE Candidates...");
      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve();
        } else {
          const subscription = (pc as any).onIceGatheringStateChange.subscribe(
            (state: string) => {
              if (state === "complete") {
                subscription?.unsubscribe();
                resolve();
              }
            }
          );
        }
      });

      const fullAnswerSdp = pc.localDescription?.sdp || "";
      console.log("✅ WebRTC SDP Answer with complete ICE candidates generated!");
      return fullAnswerSdp;
    } catch (err) {
      console.error("❌ Error in handleOffer:", err);
      throw err;
    }
  }

    /**
   * Dispatches DataChannel inputs to Chromium via CDP
   */
  async handleClientInputEvent(event: any) {
    if (!this.cdp) return;

    if (event.type === "click") {
      await this.cdp.dispatchClick(event.x, event.y, event.button || "left");
    } else if (event.type === "mousemove") {
      await this.cdp.dispatchMouseMove(event.x, event.y);
    } else if (event.type === "keypress") {
      await this.cdp.dispatchKeyPress(event.key, event.text, event.code);
    } else if (event.type === "wheel") {
      await this.cdp.dispatchWheel(event.x, event.y, event.deltaX, event.deltaY);
    }
  }

  close() {
    this.udpSocket?.close();
    this.peerConnection?.close();
    this.peerConnection = null;
    this.videoTrack = null;
  }
}