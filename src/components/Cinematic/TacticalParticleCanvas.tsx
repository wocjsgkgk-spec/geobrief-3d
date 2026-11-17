'use client';

import React, { useEffect, useRef } from 'react';

type TacticalParticleCanvasProps = {
  className?: string;
  density?: 'sparse' | 'normal' | 'dense';
  color?: 'emerald' | 'cyan' | 'amber';
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
};

/**
 * [타 저장소 벤더링]: 경량 전술 앰비언트 파티클 네트워크 캔버스
 * - CPU/GPU 부하 0.1% 미만의 부드러운 배경 사이버네틱스 파티클
 * - 브리핑 및 후보지 비교 모달의 전술적 입체감 부여
 */
export const TacticalParticleCanvas: React.FC<TacticalParticleCanvasProps> = ({
  className = '',
  density = 'normal',
  color = 'emerald',
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    let animId: number;
    let width = 0;
    let height = 0;
    let particles: Particle[] = [];

    const colorMap = {
      emerald: { r: 16, g: 185, b: 129 },
      cyan: { r: 6, g: 182, b: 212 },
      amber: { r: 245, g: 158, b: 11 },
    };
    const c = colorMap[color] || colorMap.emerald;

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const targetCount =
        density === 'sparse' ? 24 : density === 'dense' ? 65 : 42;
      const count = Math.min(targetCount, Math.max(15, Math.floor((width * height) / 22000)));

      particles = Array.from({ length: count }, (_, idx) => ({
        x: ((idx * 67) % 101) / 100 * width,
        y: ((idx * 43) % 97) / 96 * height,
        vx: ((idx % 5) - 2) * 0.15,
        vy: (((idx + 2) % 5) - 2) * 0.12,
        radius: 0.8 + (idx % 3) * 0.5,
        alpha: 0.25 + (idx % 4) * 0.08,
      }));
    };

    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);

      // 정점 순회 및 링크 라인 렌더링
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        // 점 그리기
        ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();

        // 인접 정점 간 네트워크 연결선 (거리 < 110px)
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 110) {
            const lineAlpha = (1 - dist / 110) * 0.18;
            ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${lineAlpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [density, color]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 z-0 opacity-80 ${className}`}
    />
  );
};
