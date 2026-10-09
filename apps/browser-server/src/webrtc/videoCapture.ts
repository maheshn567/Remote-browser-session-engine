import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { config } from "../config.ts";

export class VideoCaptureService {
  private ffmpegProcess: ChildProcess | null = null;

  startCapture(display: string = config.display, rtpPort: number = config.rtpPort) {
    if (this.ffmpegProcess) {
      console.log("⚠️ FFmpeg capture is already running.");
      return;
    }

    // `bun --watch` restarts this process in place, which leaves the previous
    // run's FFmpeg alive and still streaming into the same RTP port. Clear any
    // such orphan before starting a fresh capture.
    spawnSync("pkill", ["-f", `x11grab.*rtp://127.0.0.1:${rtpPort}`]);

    const { width, height } = config.viewport;
    console.log(`🎥 Starting FFmpeg VP8 capture on ${display}.0 (${width}x${height}) → RTP ${rtpPort}...`);

    this.ffmpegProcess = spawn("ffmpeg", [
      "-y",
      "-f", "x11grab",
      "-draw_mouse", "1",
      "-video_size", `${width}x${height}`,
      "-framerate", "30",
      "-i", `${display}.0`,
      "-c:v", "libvpx",
      "-b:v", "4M",
      "-crf", "10",
      "-quality", "realtime",
      "-cpu-used", "8",
      "-g", "30",
      "-keyint_min", "30",
      "-pix_fmt", "yuv420p",
      "-f", "rtp",
      `rtp://127.0.0.1:${rtpPort}`,
    ]);

    this.ffmpegProcess.stderr?.on("data", (data) => {
      const log = data.toString();
      if (log.includes("fps=") || log.includes("Stream #0")) {
        console.log(`[FFmpeg] ${log.trim().split("\n")[0]}`);
      }
    });

    this.ffmpegProcess.on("close", (code) => {
      console.log(`🎥 FFmpeg capture stopped with exit code ${code}`);
      this.ffmpegProcess = null;
    });
  }

  stopCapture() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill("SIGTERM");
      this.ffmpegProcess = null;
    }
  }
}
