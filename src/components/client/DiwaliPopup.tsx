'use client';

import {useEffect, useState} from 'react';
import {Sparkles, X} from 'lucide-react';
import {isDiwaliPopupTime} from '@/lib/festive/diwali';

/*
 * Diwali greeting popup for the client app (8 to 10 Nov 2026, IST).
 * Shows every time the app is opened or refreshed in that window; the cross or the button closes it.
 * The artwork is static SVG built from fixed numbers below (no user data), animated with CSS.
 */

const W = 358;
const H = 680;

function diya(x: number, y: number, s: number, delay: number) {
  return `<g transform="translate(${x},${y}) scale(${s})">
    <ellipse class="dw-glow" style="animation-delay:${delay}s" cx="0" cy="-38" rx="60" ry="60" fill="url(#dwGlow)"/>
    <g class="dw-flame" style="animation-delay:${delay}s">
      <path d="M-12,-6 C-14,-26 -4,-40 0,-56 C4,-40 14,-26 12,-6 C8,2 -8,2 -12,-6Z" fill="url(#dwFlame)"/>
      <path d="M-5,-8 C-6,-18 -1,-26 0,-34 C1,-26 6,-18 5,-8 C3,-4 -3,-4 -5,-8Z" fill="#fff7c2"/>
    </g>
    <path d="M-44,-2 Q0,-12 44,-2 Q38,26 0,30 Q-38,26 -44,-2Z" fill="url(#dwClay)"/>
    <path d="M-44,-2 Q0,-12 44,-2 Q0,6 -44,-2Z" fill="#7a2a0c"/>
    <path d="M-30,10 Q0,18 30,10" stroke="#ffd36b" stroke-width="2.5" fill="none" stroke-dasharray="3 5" stroke-linecap="round"/>
    <circle cx="0" cy="17" r="3" fill="#ffd36b"/>
  </g>`;
}

function kandeel(x: number, y: number, s: number, c1: string, c2: string, len: number) {
  const tassels = [-8, -3, 2, 7].map((t) => `<line x1="${t}" y1="60" x2="${t * 1.4}" y2="92" stroke="${c1}" stroke-width="2.4" stroke-linecap="round"/>`).join('');
  return `<g class="dw-swing" style="transform-origin:${x}px ${y - len}px"><g transform="translate(${x},${y}) scale(${s})">
    <line x1="0" y1="${-len / s}" x2="0" y2="-62" stroke="#e9c46a" stroke-width="2"/>
    <ellipse cx="0" cy="0" rx="70" ry="70" fill="url(#dwGlowSoft)"/>
    <path d="M-10,-62 L10,-62 L14,-54 L-14,-54Z" fill="#e9c46a"/>
    <path d="M-14,-54 L14,-54 L42,-18 L-42,-18Z" fill="${c1}"/>
    <path d="M-42,-18 L42,-18 L42,18 L-42,18Z" fill="${c2}"/>
    <path d="M-42,18 L42,18 L14,54 L-14,54Z" fill="${c1}"/>
    <path d="M-42,-18 L42,-18 M-42,18 L42,18 M0,-54 L0,54 M-14,-54 L-28,0 L-14,54 M14,-54 L28,0 L14,54" stroke="#ffe08a" stroke-width="1.6" fill="none" opacity="0.85"/>
    <circle class="dw-glow" cx="0" cy="0" r="9" fill="#fff3b0"/>
    <path d="M-14,54 L14,54 L10,60 L-10,60Z" fill="#e9c46a"/>${tassels}
    <circle cx="0" cy="62" r="4" fill="#e9c46a"/>
  </g></g>`;
}

function burst(x: number, y: number, r: number, color: string, rays: number, delay: number) {
  let out = `<g class="dw-burst" style="animation-delay:${delay}s;transform-origin:${x}px ${y}px"><g transform="translate(${x},${y})">`;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const x1 = Math.cos(a) * r * 0.25, y1 = Math.sin(a) * r * 0.25, x2 = Math.cos(a) * r, y2 = Math.sin(a) * r;
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/><circle cx="${(x2 * 1.08).toFixed(1)}" cy="${(y2 * 1.08).toFixed(1)}" r="1.8" fill="${color}"/>`;
  }
  return out + `<circle r="${r * 0.12}" fill="#fff6d6"/></g></g>`;
}

function swastik(x: number, y: number, s: number) {
  return `<g transform="translate(${x},${y}) scale(${s})" stroke="#d62828" stroke-width="10" stroke-linecap="round" fill="none">
    <path d="M0,-50 L0,50 M-50,0 L50,0 M0,-50 L50,-50 M50,0 L50,50 M0,50 L-50,50 M-50,0 L-50,-50"/>
    <g fill="#d62828" stroke="none"><circle cx="25" cy="-25" r="8"/><circle cx="25" cy="25" r="8"/><circle cx="-25" cy="25" r="8"/><circle cx="-25" cy="-25" r="8"/></g>
  </g>`;
}

function toran() {
  let out = `<path d="M0,10 Q${W / 2},34 ${W},10" stroke="#7a3b10" stroke-width="2" fill="none"/>`;
  for (let i = 0; i <= 14; i++) {
    const x = (i * W) / 14, y = 10 + 24 * Math.sin((Math.PI * i) / 14);
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="${i % 2 ? '#ff9f1c' : '#ffd23f'}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${i % 2 ? '#e85d04' : '#f4a261'}"/>`;
    if (i % 2 === 0 && i > 0 && i < 14) {
      out += `<path d="M${x},${y + 8} q-6,14 0,26 q6,-12 0,-26Z" fill="#2d6a4f"/><path d="M${x - 3},${y + 8} q-14,8 -14,22 q10,-6 14,-22Z" fill="#40916c"/><path d="M${x + 3},${y + 8} q14,8 14,22 q-10,-6 -14,-22Z" fill="#40916c"/>`;
    }
  }
  return out;
}

function rangoli(cx: number, cy: number) {
  const colors = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#b5179e', '#ff9f1c'];
  let out = '<g class="dw-spin" style="transform-origin:' + cx + 'px ' + cy + 'px">';
  for (let ring = 0; ring < 3; ring++) {
    const n = [16, 12, 8][ring], R = [104, 82, 62][ring], r = [16, 18, 20][ring];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (ring % 2 ? Math.PI / n : 0);
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      out += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${r}" ry="${(r * 0.45).toFixed(1)}" transform="rotate(${((a * 180) / Math.PI).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${colors[(i + ring) % colors.length]}" opacity="0.92"/>`;
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    out += `<circle cx="${(cx + Math.cos(a) * 120).toFixed(1)}" cy="${(cy + Math.sin(a) * 120).toFixed(1)}" r="2.6" fill="#ffe08a"/>`;
  }
  out += '</g>';
  return out + `<circle cx="${cx}" cy="${cy}" r="52" fill="#fff8e7"/><circle cx="${cx}" cy="${cy}" r="52" fill="none" stroke="#f6c453" stroke-width="3"/>`;
}

function stars() {
  let seed = 3, out = '';
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 60; i++) {
    out += `<circle class="dw-twinkle" style="animation-delay:${(rand() * 3).toFixed(2)}s" cx="${(rand() * W).toFixed(0)}" cy="${(rand() * H).toFixed(0)}" r="${(rand() * 1.6 + 0.4).toFixed(1)}" fill="#fff"/>`;
  }
  return out;
}

export const DIWALI_ART = `<svg width="100%" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <radialGradient id="dwGlow"><stop offset="0" stop-color="#ffcf4d" stop-opacity="0.75"/><stop offset="0.45" stop-color="#ff8a00" stop-opacity="0.25"/><stop offset="1" stop-color="#ff8a00" stop-opacity="0"/></radialGradient>
    <radialGradient id="dwGlowSoft"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.45"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    <linearGradient id="dwFlame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff6a00"/><stop offset="0.6" stop-color="#ffb000"/><stop offset="1" stop-color="#fff1a8"/></linearGradient>
    <linearGradient id="dwClay" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9622b"/><stop offset="1" stop-color="#8e2f0d"/></linearGradient>
  </defs>
  ${stars()}
  ${burst(70, 120, 34, '#ffcf4d', 14, 0)}${burst(300, 140, 28, '#ff6fb5', 12, 1.1)}
  ${kandeel(34, 95, 0.42, '#e63946', '#f4a261', 95)}${kandeel(324, 110, 0.42, '#2a9d8f', '#e9c46a', 110)}
  ${rangoli(W / 2, 225)}${swastik(W / 2, 225, 0.62)}
  ${toran()}
  ${diya(40, H - 28, 0.5, 0)}${diya(110, H - 24, 0.55, 0.4)}${diya(W / 2, H - 20, 0.62, 0.15)}${diya(W - 110, H - 24, 0.55, 0.6)}${diya(W - 40, H - 28, 0.5, 0.3)}
</svg>`;

export const DIWALI_STYLES = `
.dw-flame{transform-box:fill-box;transform-origin:50% 100%;animation:dwFlicker 1.1s ease-in-out infinite alternate}
.dw-glow{animation:dwGlow 1.6s ease-in-out infinite alternate}
.dw-twinkle{animation:dwTwinkle 2.4s ease-in-out infinite}
.dw-swing{animation:dwSwing 3.2s ease-in-out infinite alternate}
.dw-burst{animation:dwBurst 2.6s ease-out infinite}
.dw-spin{animation:dwSpin 60s linear infinite}
.dw-card{animation:dwIn .45s cubic-bezier(.2,.8,.2,1) both}
@keyframes dwFlicker{0%{transform:scale(1,1) rotate(-2deg);opacity:.95}50%{transform:scale(.92,1.08) rotate(2deg);opacity:1}100%{transform:scale(1.05,.94) rotate(-1deg);opacity:.85}}
@keyframes dwGlow{from{opacity:.55}to{opacity:1}}
@keyframes dwTwinkle{0%,100%{opacity:.2}50%{opacity:1}}
@keyframes dwSwing{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}
@keyframes dwBurst{0%{transform:scale(.3);opacity:0}25%{opacity:1}100%{transform:scale(1.1);opacity:0}}
@keyframes dwSpin{to{transform:rotate(360deg)}}
@keyframes dwIn{from{transform:translateY(24px) scale(.96);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.dw-flame,.dw-glow,.dw-twinkle,.dw-swing,.dw-burst,.dw-spin,.dw-card{animation:none}}
`;

export function DiwaliPopup() {
  const [open, setOpen] = useState(false);

  // Runs once per app open / refresh. Navigating inside the app does not bring it back.
  useEffect(() => {
    // On localhost only, add ?diwali-preview to the URL to see it before 8 Nov.
    const preview = process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).has('diwali-preview');
    if (isDiwaliPopupTime() || preview) setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="diwali-title" onClick={() => setOpen(false)}>
      <style>{DIWALI_STYLES}</style>
      <div
        className="dw-card relative h-[min(680px,calc(100dvh-2rem))] w-full max-w-[380px] overflow-hidden rounded-[30px] shadow-2xl ring-2 ring-[#f6c453]/60"
        style={{background: 'radial-gradient(ellipse at 50% 38%,#4a1c4f 0%,#2a1046 45%,#120a2b 100%)'}}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute inset-0" dangerouslySetInnerHTML={{__html: DIWALI_ART}} />
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-11 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white backdrop-blur hover:bg-white/25"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="absolute inset-x-5 bottom-[14%] z-10 text-center">
          <div className="text-[11px] font-bold tracking-[5px] text-[#f6c453]">SHUBH DEEPAVALI</div>
          <h2
            id="diwali-title"
            className="mt-1 bg-gradient-to-b from-[#fff4c2] via-[#f6c453] to-[#d9962b] bg-clip-text font-serif text-[42px] font-bold italic leading-tight text-transparent drop-shadow-[0_0_12px_rgba(255,190,80,0.5)]"
          >
            Happy Diwali
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-purple-50">
            May the diyas light up your home, and every healthy choice light up your life. Enjoy the sweets mindfully, savour every moment, and shine bright!
          </p>
          <p className="mt-2 text-xs font-semibold text-[#f6c453]">With love, Dt. Poonam Sagar &amp; Team DTPS</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#E06A26] to-[#f59e0b] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/40"
          >
            Celebrate with DTPS
            <Sparkles className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
