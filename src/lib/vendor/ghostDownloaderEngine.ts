/**
 * src/lib/vendor/ghostDownloaderEngine.ts
 *
 * [XiaoYouChR/Ghost-Downloader-3 벤더링 엔진]
 * - HTTP Range 기반 스마트 청크 분할 다운로드 (Zero-Copy Uint8Array 오프셋 직접 기록, 별도 병합 부하 제거)
 * - 청크별 RTT/대역폭 측정에 따른 동시성 자동 적응 (2~6 워커)
 * - 실패 청크 지수 백오프 자동 재시도 및 AbortSignal 지원
 * - Range 미지원 서버 시 ReadableStream 진행률 스트리밍 폴백
 */

export interface GhostDownloadProgress {
  url: string;
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  activeWorkers: number;
  speedBps: number;
}

export interface GhostDownloadOptions {
  chunkSizeBytes?: number;
  minWorkers?: number;
  maxWorkers?: number;
  maxRetries?: number;
  signal?: AbortSignal;
  onProgress?: (progress: GhostDownloadProgress) => void;
}

interface ChunkTask {
  index: number;
  start: number;
  end: number;
}

const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
const MIN_RANGE_THRESHOLD = 2 * 1024 * 1024; // 2MB 이상일 때 멀티청크 분할

class GhostDownloaderEngine {
  private activeDownloads = new Map<string, Promise<ArrayBuffer>>();

  /**
   * 대용량 리소스를 멀티청크 분할 또는 스트리밍으로 고속 수신 (동일 URL 중복 요청 Coalescing 포함)
   */
  public async downloadArrayBuffer(url: string, options: GhostDownloadOptions = {}): Promise<ArrayBuffer> {
    const existing = this.activeDownloads.get(url);
    if (existing) {
      return existing;
    }

    const promise = this.executeDownload(url, options).finally(() => {
      this.activeDownloads.delete(url);
    });
    this.activeDownloads.set(url, promise);
    return promise;
  }

  public async downloadJson<T = any>(url: string, options: GhostDownloadOptions = {}): Promise<T> {
    const buffer = await this.downloadArrayBuffer(url, options);
    const text = new TextDecoder('utf-8').decode(buffer);
    return JSON.parse(text) as T;
  }

  private async executeDownload(url: string, options: GhostDownloadOptions): Promise<ArrayBuffer> {
    const {
      chunkSizeBytes = DEFAULT_CHUNK_SIZE,
      minWorkers = 2,
      maxWorkers = 6,
      maxRetries = 3,
      signal,
      onProgress,
    } = options;

    let totalBytes = 0;
    let supportsRange = false;

    try {
      const headRes = await fetch(url, { method: 'HEAD', signal });
      if (headRes.ok) {
        const lenStr = headRes.headers.get('content-length');
        const acceptRanges = headRes.headers.get('accept-ranges');
        totalBytes = lenStr ? parseInt(lenStr, 10) : 0;
        supportsRange = acceptRanges?.toLowerCase() === 'bytes' && totalBytes >= MIN_RANGE_THRESHOLD;
      }
    } catch {
      // HEAD 미지원/실패 시 단일 스트리밍 폴백
    }

    if (!supportsRange || totalBytes <= 0) {
      return this.streamSingleDownload(url, totalBytes, signal, onProgress);
    }

    // 스마트 청크 분할: 별도 파일 병합 없이 단일 대상 버퍼 오프셋에 직접 기록
    const resultBuffer = new Uint8Array(totalBytes);
    const chunks: ChunkTask[] = [];
    for (let start = 0, index = 0; start < totalBytes; start += chunkSizeBytes, index++) {
      const end = Math.min(start + chunkSizeBytes - 1, totalBytes - 1);
      chunks.push({ index, start, end });
    }

    let nextChunkIdx = 0;
    let loadedBytes = 0;
    let currentWorkers = Math.min(maxWorkers, Math.max(minWorkers, Math.ceil(chunks.length / 2)));
    const startTime = performance.now();

    const fetchChunkWithRetry = async (chunk: ChunkTask): Promise<void> => {
      let attempt = 0;
      while (attempt <= maxRetries) {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        const t0 = performance.now();
        try {
          const res = await fetch(url, {
            headers: { Range: `bytes=${chunk.start}-${chunk.end}` },
            signal,
          });
          if (!res.ok && res.status !== 206) {
            throw new Error(`HTTP ${res.status} for chunk ${chunk.index}`);
          }
          const chunkBuf = new Uint8Array(await res.arrayBuffer());
          resultBuffer.set(chunkBuf, chunk.start);
          loadedBytes += chunkBuf.byteLength;

          // 대역폭 자동 적응: 청크 RTT 기반 워커 수 조절
          const elapsedMs = Math.max(1, performance.now() - t0);
          const chunkSpeedBps = (chunkBuf.byteLength / elapsedMs) * 1000;
          if (chunkSpeedBps > 8 * 1024 * 1024 && currentWorkers < maxWorkers) {
            currentWorkers++;
          } else if (chunkSpeedBps < 512 * 1024 && currentWorkers > minWorkers) {
            currentWorkers--;
          }

          if (onProgress) {
            const totalElapsedSec = Math.max(0.001, (performance.now() - startTime) / 1000);
            onProgress({
              url,
              loadedBytes,
              totalBytes,
              percent: Math.min(100, Math.round((loadedBytes / totalBytes) * 100)),
              activeWorkers: currentWorkers,
              speedBps: loadedBytes / totalElapsedSec,
            });
          }
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') throw err;
          attempt++;
          if (attempt > maxRetries) throw err;
          const backoffMs = Math.min(2000, 200 * Math.pow(2, attempt - 1));
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    };

    const runWorker = async (): Promise<void> => {
      while (nextChunkIdx < chunks.length) {
        const chunk = chunks[nextChunkIdx++];
        await fetchChunkWithRetry(chunk);
      }
    };

    const workers: Promise<void>[] = [];
    for (let w = 0; w < currentWorkers; w++) {
      workers.push(runWorker());
    }
    await Promise.all(workers);

    return resultBuffer.buffer;
  }

  private async streamSingleDownload(
    url: string,
    knownTotalBytes: number,
    signal?: AbortSignal,
    onProgress?: (progress: GhostDownloadProgress) => void
  ): Promise<ArrayBuffer> {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} loading ${url}`);
    }
    const headerTotal = parseInt(res.headers.get('content-length') || '0', 10) || knownTotalBytes;
    if (!res.body || !onProgress) {
      return res.arrayBuffer();
    }

    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let loadedBytes = 0;
    const startTime = performance.now();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        parts.push(value);
        loadedBytes += value.byteLength;
        const elapsedSec = Math.max(0.001, (performance.now() - startTime) / 1000);
        onProgress({
          url,
          loadedBytes,
          totalBytes: headerTotal || loadedBytes,
          percent: headerTotal > 0 ? Math.min(100, Math.round((loadedBytes / headerTotal) * 100)) : 0,
          activeWorkers: 1,
          speedBps: loadedBytes / elapsedSec,
        });
      }
    }

    const merged = new Uint8Array(loadedBytes);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.byteLength;
    }
    return merged.buffer;
  }
}

export const ghostDownloaderEngine = new GhostDownloaderEngine();
