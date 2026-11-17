'use client';

import React, { useEffect, useRef } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { WEATHER_PRESETS, deriveWeatherEffectProfile, WeatherPresetType } from '@/lib/vendor/weatherEffects';

interface Particle {
  x: number;
  y: number;
  speed: number;
  length: number;
  opacity: number;
  drift: number;
  size: number;
}

export const AtmosphericWeatherOverlay: React.FC = () => {
  const weatherPreset = (useMapStore((state: any) => state.weatherPreset) || 'clear') as WeatherPresetType;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (weatherPreset === 'clear') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const observation = WEATHER_PRESETS[weatherPreset] || WEATHER_PRESETS.clear;
    const profile = deriveWeatherEffectProfile(observation);

    // Initialize particles based on weather type
    const particles: Particle[] = [];
    const count = weatherPreset === 'rain' ? 120 : weatherPreset === 'snow' ? 80 : 0;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        speed: weatherPreset === 'rain' ? 12 + Math.random() * 10 : 1.2 + Math.random() * 2.0,
        length: weatherPreset === 'rain' ? 14 + Math.random() * 18 : 0,
        opacity: 0.25 + Math.random() * 0.45,
        drift: (Math.random() - 0.5) * (weatherPreset === 'snow' ? 1.5 : 0.8),
        size: weatherPreset === 'snow' ? 1.5 + Math.random() * 2.5 : 1,
      });
    }

    let time = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      time += 0.015;

      // 1. Fog / Overcast ambient wash
      if (weatherPreset === 'fog' || profile.fog > 0.4) {
        const fogGradient = ctx.createLinearGradient(0, 0, 0, height);
        fogGradient.addColorStop(0, 'rgba(210, 220, 230, 0.42)');
        fogGradient.addColorStop(0.4, 'rgba(220, 230, 240, 0.28)');
        fogGradient.addColorStop(0.85, 'rgba(200, 215, 225, 0.35)');
        fogGradient.addColorStop(1, 'rgba(230, 240, 250, 0.48)');
        ctx.fillStyle = fogGradient;
        ctx.fillRect(0, 0, width, height);

        // Low-frequency mist wave
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(0, height * 0.65);
        for (let x = 0; x <= width; x += 40) {
          const y = height * 0.65 + Math.sin(x * 0.003 + time) * 35 + Math.cos(x * 0.006 - time * 0.7) * 20;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();
      } else if (weatherPreset === 'overcast' || profile.cloud > 0.6) {
        const cloudGrad = ctx.createRadialGradient(
          width * 0.5,
          height * 0.2,
          50,
          width * 0.5,
          height * 0.4,
          Math.max(width, height) * 0.8
        );
        cloudGrad.addColorStop(0, 'rgba(40, 50, 60, 0.0)');
        cloudGrad.addColorStop(0.7, 'rgba(30, 42, 55, 0.25)');
        cloudGrad.addColorStop(1, 'rgba(15, 25, 38, 0.45)');
        ctx.fillStyle = cloudGrad;
        ctx.fillRect(0, 0, width, height);
      }

      // 2. Rain streaks
      if (weatherPreset === 'rain') {
        ctx.strokeStyle = 'rgba(180, 210, 245, 0.65)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const p of particles) {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.drift * 3, p.y + p.length);

          p.y += p.speed;
          p.x += p.drift;
          if (p.y > height) {
            p.y = -p.length;
            p.x = Math.random() * width;
          }
        }
        ctx.stroke();

        // Subtle wet atmosphere wash
        ctx.fillStyle = 'rgba(20, 35, 55, 0.18)';
        ctx.fillRect(0, 0, width, height);
      }

      // 3. Snow flakes
      if (weatherPreset === 'snow') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        for (const p of particles) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();

          p.y += p.speed;
          p.x += p.drift + Math.sin(time + p.y * 0.01) * 0.6;
          if (p.y > height) {
            p.y = -5;
            p.x = Math.random() * width;
          }
        }

        // Frost vignette
        ctx.fillStyle = 'rgba(220, 235, 255, 0.12)';
        ctx.fillRect(0, 0, width, height);
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, [weatherPreset]);

  if (weatherPreset === 'clear') return null;

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-20 h-full w-full"
      style={{ mixBlendMode: weatherPreset === 'fog' ? 'screen' : 'normal' }}
    />
  );
};
