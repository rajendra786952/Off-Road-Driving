// Cinematic layered backdrops, drawn as SVG (no image files): each region has its
// own sky, light and landform shapes. Used behind menus and on region cards.
import React, { useMemo } from 'react';

const ART = {
  forest:  { sky: ['#2a6fb0', '#a9d4ee', '#e8f3ee'], sun: ['#fff6cf', 78, 26, 9], layers: ['#7fb0a8', '#4d8a66', '#2f6a3f', '#1c4428'], shape: 'pines' },
  mud:     { sky: ['#3f4a55', '#77838c', '#a7aca6'], sun: null, layers: ['#6d766f', '#5a5f48', '#4a4630', '#2e2a1c'], shape: 'rolling', rain: true },
  rocky:   { sky: ['#1f5fb5', '#8fc0ea', '#e6eef5'], sun: ['#ffffff', 22, 22, 7], layers: ['#9fb4c8', '#7e8c9c', '#5b6470', '#373c44'], shape: 'alpine' },
  ridge:   { sky: ['#3a2f55', '#c06a4a', '#f3b877'], sun: ['#ffd9a0', 68, 58, 12], layers: ['#a8664a', '#7c4636', '#522d26', '#2b1718'], shape: 'crags' },
  snow:    { sky: ['#4f76a8', '#b9d0e6', '#f2f7fb'], sun: ['#ffffff', 30, 30, 7], layers: ['#d5e2ef', '#b4c8dc', '#8ea6bf', '#e9f1f8'], shape: 'snowpeaks', snow: true },
  desert:  { sky: ['#1e63b8', '#f0c98a', '#f7e2b4'], sun: ['#fff3c4', 74, 18, 11], layers: ['#e2b676', '#d09a55', '#b97b3c', '#8a5526'], shape: 'dunes' },
  jungle:  { sky: ['#1f6f86', '#8fd0b8', '#d7f0d8'], sun: ['#fffbd6', 28, 24, 8], layers: ['#5fae8a', '#2f8a58', '#17683a', '#0c3f22'], shape: 'canopy' },
  volcano: { sky: ['#120d12', '#5b1f14', '#d1481b'], sun: null, layers: ['#4a1c16', '#2c1513', '#1b0f0f', '#0d0909'], shape: 'volcano', glow: true }
};

function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Build one ridge-line polygon (viewBox 100 x 56). */
function layer(shape, k, seed) {
  const r = rnd(seed * 97 + k * 13);
  const base = 26 + k * 7.5;          // nearer layers sit lower
  const amp = [11, 9, 7, 5][k];
  const pts = [];
  const n = shape === 'dunes' || shape === 'rolling' ? 40 : 64;
  let y = base;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * 100;
    const t = i / n;
    let h;
    switch (shape) {
      case 'pines': h = Math.sin(t * 9 + k * 2) * amp * 0.35 + (i % 2 ? amp * 0.5 : 0) * (k > 1 ? 1 : 0.3) + r() * 1.2; break;
      case 'rolling': h = Math.sin(t * 5 + k * 1.7) * amp * 0.5 + Math.sin(t * 11 + k) * amp * 0.15; break;
      case 'alpine': h = Math.abs(Math.sin(t * 7 + k * 2.1)) * amp * 1.5 + (r() - 0.5) * 3; break;
      case 'crags': h = Math.round((Math.sin(t * 6 + k * 1.3) * 0.5 + 0.5) * 3) / 3 * amp * 1.5 + (r() > 0.85 ? amp * 0.6 : 0); break;
      case 'snowpeaks': h = Math.abs(Math.sin(t * 6 + k * 2.6)) * amp * 1.8 + (r() - 0.5) * 2; break;
      case 'dunes': h = Math.pow(0.5 + 0.5 * Math.sin(t * 8 + k * 2.2), 2.4) * amp * 1.2; break;
      case 'canopy': h = Math.sin(t * 6 + k) * amp * 0.3 + r() * amp * 0.55 + (r() > 0.9 ? amp * 0.5 : 0); break;
      case 'volcano': {
        h = (r() - 0.3) * 2.5;
        const c = k === 0 ? 0.3 : k === 1 ? 0.72 : -1;
        if (c > 0) { const d = Math.abs(t - c); h = Math.max(h, Math.min(amp * 2.6 * Math.max(0, 1 - d / 0.2), amp * 2.0)); }
        break;
      }
      default: h = Math.sin(t * 6) * amp;
    }
    y = base - h;
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return `0,56 ${pts.join(' ')} 100,56`;
}

export default function Backdrop({ region = 'forest', dim = 0.55, className = '' }) {
  const a = ART[region] || ART.forest;
  const polys = useMemo(() => a.layers.map((c, k) => ({ c, d: layer(a.shape, k, region.length * 31 + region.charCodeAt(0)) })), [region]);
  const id = `bd-${region}`;
  return (
    <div className={`backdrop ${className}`} aria-hidden="true">
      <svg viewBox="0 0 100 56" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={a.sky[0]} /><stop offset="0.6" stopColor={a.sky[1]} /><stop offset="1" stopColor={a.sky[2]} />
          </linearGradient>
          <radialGradient id={`${id}-sun`}><stop offset="0" stopColor={a.sun ? a.sun[0] : '#fff'} stopOpacity="1" /><stop offset="0.25" stopColor={a.sun ? a.sun[0] : '#fff'} stopOpacity="0.55" /><stop offset="1" stopColor={a.sun ? a.sun[0] : '#fff'} stopOpacity="0" /></radialGradient>
          <radialGradient id={`${id}-glow`}><stop offset="0" stopColor="#ffb347" stopOpacity="0.95" /><stop offset="0.4" stopColor="#ff4a12" stopOpacity="0.5" /><stop offset="1" stopColor="#ff2a00" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width="100" height="56" fill={`url(#${id}-sky)`} />
        {a.sun && <circle cx={a.sun[1]} cy={a.sun[2]} r={a.sun[3]} fill={`url(#${id}-sun)`} />}
        {a.glow && <><ellipse cx="30" cy="12" rx="16" ry="9" fill={`url(#${id}-glow)`} /><ellipse cx="72" cy="22" rx="12" ry="7" fill={`url(#${id}-glow)`} opacity="0.7" /></>}
        {polys.map((p, k) => (
          <g key={k} className={`bd-layer bd-l${k}`}>
            <polygon points={p.d} fill={p.c} />
            {a.shape === 'snowpeaks' && k < 3 && <polygon points={p.d} fill="#ffffff" opacity="0.35" transform="translate(0,-0.6)" />}
          </g>
        ))}
        {a.glow && <rect x="0" y="50" width="100" height="6" fill="#ff5a1a" opacity="0.35" />}
      </svg>
      {a.rain && <div className="bd-rain" />}
      {a.snow && <div className="bd-snow" />}
      <div className="bd-dim" style={{ opacity: dim }} />
    </div>
  );
}

export const REGION_ART = ART;
