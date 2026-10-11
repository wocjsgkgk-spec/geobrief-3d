/**
 * Canvas Stream 기반 고해상도 WebGL 브리핑 동영상 녹화기
 * - MediaRecorder API 활용 60fps 캔버스 레코딩
 * - WebM (VP9/VP8) 및 MP4 지원 코덱 자동 감지
 * - 완료 시 고화질 동영상 원클릭 다운로드
 */

export interface VideoRecorderOptions {
  fps?: number;
  videoBitrate?: number; // bps (기본: 8,000,000 = 8Mbps)
  onProgress?: (recordedDurationMs: number) => void;
}

export class CanvasVideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording = false;
  private startTime = 0;
  private timerId: number | null = null;
  private selectedMimeType = '';

  /**
   * 브라우저에서 지원하는 최적의 비디오 MIME 타입 탐색
   */
  public static getSupportedMimeType(): string {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1',
      'video/mp4',
    ];

    if (typeof MediaRecorder === 'undefined') {
      return '';
    }

    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    }

    return '';
  }

  /**
   * 캔버스 스트림 녹화 시작
   */
  public start(canvas: HTMLCanvasElement, options: VideoRecorderOptions = {}): boolean {
    if (this.isRecording) {
      console.warn('[CanvasVideoRecorder] Recording already in progress.');
      return false;
    }

    const mimeType = CanvasVideoRecorder.getSupportedMimeType();
    if (!mimeType) {
      console.error('[CanvasVideoRecorder] No supported MediaRecorder mime type found.');
      return false;
    }

    this.selectedMimeType = mimeType;
    this.recordedChunks = [];

    try {
      const fps = options.fps || 60;
      // captureStream 호출
      const stream = canvas.captureStream ? canvas.captureStream(fps) : (canvas as any).mozCaptureStream?.(fps);

      if (!stream) {
        console.error('[CanvasVideoRecorder] Failed to capture stream from canvas.');
        return false;
      }

      const recorderOptions: MediaRecorderOptions = {
        mimeType: this.selectedMimeType,
        videoBitsPerSecond: options.videoBitrate || 8000000, // 8Mbps 고해상도
      };

      const recorder = new MediaRecorder(stream, recorderOptions);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      recorder.onerror = (err) => {
        console.error('[CanvasVideoRecorder] MediaRecorder error:', err);
      };

      // 250ms 단위 청크 쪼개기
      recorder.start(250);
      this.mediaRecorder = recorder;
      this.isRecording = true;
      this.startTime = performance.now();

      if (options.onProgress) {
        this.timerId = window.setInterval(() => {
          if (this.isRecording) {
            const duration = performance.now() - this.startTime;
            options.onProgress?.(duration);
          }
        }, 200);
      }

      return true;
    } catch (err) {
      console.error('[CanvasVideoRecorder] Start recording failed:', err);
      return false;
    }
  }

  /**
   * 캔버스 녹화 종료 및 비디오 Blob 생성
   */
  public stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (this.timerId !== null) {
        clearInterval(this.timerId);
        this.timerId = null;
      }

      if (!this.mediaRecorder || !this.isRecording) {
        this.isRecording = false;
        resolve(null);
        return;
      }

      const recorder = this.mediaRecorder;
      this.isRecording = false;

      recorder.onstop = () => {
        try {
          const mime = this.selectedMimeType || 'video/webm';
          const blob = new Blob(this.recordedChunks, { type: mime });
          this.mediaRecorder = null;
          resolve(blob);
        } catch (err) {
          console.error('[CanvasVideoRecorder] Failed to create video blob:', err);
          resolve(null);
        }
      };

      try {
        recorder.stop();
      } catch (err) {
        console.warn('[CanvasVideoRecorder] recorder.stop() exception:', err);
        resolve(null);
      }
    });
  }

  /**
   * 생성된 비디오 Blob을 브라우저에서 다운로드
   */
  public static download(blob: Blob, baseName: string = 'GeoBrief3D_시네마틱_브리핑'): void {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, '')
      .slice(0, 14);
    const filename = `${baseName}_${timestamp}.${ext}`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  public get recording(): boolean {
    return this.isRecording;
  }
}
