'use client';

import {
  Universal3DTilesManager,
  Universal3DTilesCallbacks,
} from './Universal3DTilesLayer';

export type Deck3DTilesOverlayCallbacks = Universal3DTilesCallbacks & {
  onFallback?: (reason?: string) => void;
};

/**
 * Deck3DTilesManager (하위 호환 래퍼)
 * 범용 하이브리드 3D 타일셋 매니저(Universal3DTilesManager)를 상속 및 위임하여
 * 100% 전 지역 고정밀 3D 타일셋 스트리밍을 제공합니다.
 */
export class Deck3DTilesManager extends Universal3DTilesManager {
  constructor(callbacks?: Deck3DTilesOverlayCallbacks) {
    super(callbacks);
  }
}
