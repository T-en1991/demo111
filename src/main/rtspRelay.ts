// src/main/rtspRelay.ts
// Electron 主进程：RTSP 转 WebSocket 推流服务
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';

let wss: WebSocketServer | null = null;
let ffmpeg: ChildProcessWithoutNullStreams | null = null;

export interface RtspRelayOptions {
  rtspUrl: string;
  wsPort?: number;
}

export function startRtspRelay({ rtspUrl, wsPort = 8085 }: RtspRelayOptions) {
  // 优先使用环境变量 RTSP_URL
  const finalRtspUrl = process.env.RTSP_URL || rtspUrl;
  if (wss) return; // 已启动
  wss = new WebSocketServer({ port: wsPort });
  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');
  ffmpeg = spawn('C://Program Files//ffmpeg//bin//ffmpeg.exe', [
       '-rtsp_transport', 'tcp',
        '-analyzeduration', '10000000',
        '-probesize', '10000000',
        '-i', finalRtspUrl,
        '-vf', 'format=yuv420p,scale=640:360',
        '-c:v', 'mpeg1video',
        '-b:v', '2000k',
        '-codec:a', 'mp2',
        '-b:a', '128k',
        '-strict', '-2',
        '-tune', 'zerolatency',
        '-muxdelay', '0',
        '-f', 'mpegts',
        '-r', '30',
        'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    ffmpeg.stdout.on('data', (data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    });
    ffmpeg.on('close', (code) => {
      console.log('ffmpeg process closed, code', code);
      ws.close();
    });
    ws.on('close', () => {
      ffmpeg && ffmpeg.kill('SIGINT');
    });
    ws.on('error', () => {
      ffmpeg && ffmpeg.kill('SIGINT');
    });
  });
  console.log(`RTSP relay started. RTSP: ${finalRtspUrl} => ws://localhost:${wsPort}/`);
}

export function stopRtspRelay() {
  if (wss) {
    wss.close();
    wss = null;
  }
  if (ffmpeg) {
    ffmpeg.kill('SIGINT');
    ffmpeg = null;
  }
}
