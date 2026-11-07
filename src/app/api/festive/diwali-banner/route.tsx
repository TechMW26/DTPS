import {ImageResponse} from 'next/og';

/*
 * Picture for the Diwali push notification (1024 x 512 PNG), drawn in code so no image file is needed.
 * Public on purpose: phones download it when the notification arrives.
 */

const W = 1024;
const H = 512;

function diya(x: number, y: number, s: number) {
  return `<g transform="translate(${x},${y}) scale(${s})">
    <ellipse cx="0" cy="-38" rx="60" ry="60" fill="url(#g)"/>
    <path d="M-12,-6 C-14,-26 -4,-40 0,-56 C4,-40 14,-26 12,-6 C8,2 -8,2 -12,-6Z" fill="url(#f)"/>
    <path d="M-5,-8 C-6,-18 -1,-26 0,-34 C1,-26 6,-18 5,-8 C3,-4 -3,-4 -5,-8Z" fill="#fff7c2"/>
    <path d="M-44,-2 Q0,-12 44,-2 Q38,26 0,30 Q-38,26 -44,-2Z" fill="url(#c)"/>
    <path d="M-44,-2 Q0,-12 44,-2 Q0,6 -44,-2Z" fill="#7a2a0c"/>
    <path d="M-30,10 Q0,18 30,10" stroke="#ffd36b" stroke-width="2.5" fill="none" stroke-dasharray="3 5" stroke-linecap="round"/>
    <circle cx="0" cy="17" r="3" fill="#ffd36b"/>
  </g>`;
}

function kandeel(x: number, y: number, s: number, c1: string, c2: string, len: number) {
  const tassels = [-8, -3, 2, 7].map((t) => `<line x1="${t}" y1="60" x2="${t * 1.4}" y2="92" stroke="${c1}" stroke-width="2.4" stroke-linecap="round"/>`).join('');
  return `<g transform="translate(${x},${y}) scale(${s})">
    <line x1="0" y1="${-len / s}" x2="0" y2="-62" stroke="#e9c46a" stroke-width="2"/>
    <ellipse cx="0" cy="0" rx="70" ry="70" fill="url(#s)"/>
    <path d="M-10,-62 L10,-62 L14,-54 L-14,-54Z" fill="#e9c46a"/>
    <path d="M-14,-54 L14,-54 L42,-18 L-42,-18Z" fill="${c1}"/>
    <path d="M-42,-18 L42,-18 L42,18 L-42,18Z" fill="${c2}"/>
    <path d="M-42,18 L42,18 L14,54 L-14,54Z" fill="${c1}"/>
    <path d="M-42,-18 L42,-18 M-42,18 L42,18 M0,-54 L0,54 M-14,-54 L-28,0 L-14,54 M14,-54 L28,0 L14,54" stroke="#ffe08a" stroke-width="1.6" fill="none" opacity="0.85"/>
    <circle cx="0" cy="0" r="9" fill="#fff3b0"/>
    <path d="M-14,54 L14,54 L10,60 L-10,60Z" fill="#e9c46a"/>${tassels}
    <circle cx="0" cy="62" r="4" fill="#e9c46a"/>
  </g>`;
}

function burst(x: number, y: number, r: number, color: string, rays: number) {
  let out = `<g transform="translate(${x},${y})">`;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const x1 = Math.cos(a) * r * 0.25, y1 = Math.sin(a) * r * 0.25, x2 = Math.cos(a) * r, y2 = Math.sin(a) * r;
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/><circle cx="${(x2 * 1.08).toFixed(1)}" cy="${(y2 * 1.08).toFixed(1)}" r="2.2" fill="${color}"/>`;
  }
  return out + `<circle r="${(r * 0.12).toFixed(1)}" fill="#fff6d6"/></g>`;
}

function stars() {
  let seed = 7, out = '';
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 90; i++) out += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * 300).toFixed(0)}" r="${(rand() * 1.6 + 0.4).toFixed(1)}" fill="#fff" opacity="${(rand() * 0.6 + 0.3).toFixed(2)}"/>`;
  return out;
}

const ART = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="120%" r="110%"><stop offset="0" stop-color="#5a1a3a"/><stop offset="0.4" stop-color="#2a0f3d"/><stop offset="1" stop-color="#0c0a24"/></radialGradient>
    <radialGradient id="g"><stop offset="0" stop-color="#ffcf4d" stop-opacity="0.75"/><stop offset="0.45" stop-color="#ff8a00" stop-opacity="0.25"/><stop offset="1" stop-color="#ff8a00" stop-opacity="0"/></radialGradient>
    <radialGradient id="s"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.45"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
    <linearGradient id="f" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff6a00"/><stop offset="0.6" stop-color="#ffb000"/><stop offset="1" stop-color="#fff1a8"/></linearGradient>
    <linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9622b"/><stop offset="1" stop-color="#8e2f0d"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  ${stars()}
  ${burst(230, 85, 62, '#ffcf4d', 18)}${burst(790, 80, 58, '#ff6fb5', 16)}${burst(400, 48, 30, '#7fe0ff', 12)}${burst(640, 45, 34, '#b388ff', 12)}${burst(520, 95, 20, '#ffcf4d', 10)}
  ${kandeel(60, 120, 0.95, '#e63946', '#f4a261', 120)}${kandeel(965, 140, 0.95, '#2a9d8f', '#e9c46a', 140)}${kandeel(905, 330, 0.5, '#e76f51', '#ffd166', 330)}
  <path d="M0,470 Q512,420 1024,470 L1024,512 L0,512Z" fill="#1a0b14" opacity="0.9"/>
  ${[90, 240, 380, 644, 784, 934].map((x, i) => diya(x, 468, i % 2 ? 0.95 : 1.1)).join('')}${diya(512, 472, 1.4)}
</svg>`;

const ART_URL = `data:image/svg+xml;base64,${Buffer.from(ART).toString('base64')}`;

export function GET() {
  return new ImageResponse(
    (
      <div style={{width: W, height: H, display: 'flex', position: 'relative'}}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ART_URL} width={W} height={H} alt="" style={{position: 'absolute', top: 0, left: 0}} />
        <div style={{position: 'absolute', top: 150, left: 0, width: W, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
          <div style={{fontSize: 96, color: '#f6c453', letterSpacing: -1, textShadow: '0 0 24px rgba(255,190,80,0.6)'}}>Happy Diwali</div>
          <div style={{fontSize: 26, color: '#ffe7c2', marginTop: 10}}>Light up your home and your health journey</div>
          <div style={{fontSize: 16, color: '#f6c453', letterSpacing: 6, marginTop: 12}}>FROM TEAM DTPS</div>
        </div>
      </div>
    ),
    {width: W, height: H, headers: {'Cache-Control': 'public, max-age=86400, immutable'}},
  );
}
