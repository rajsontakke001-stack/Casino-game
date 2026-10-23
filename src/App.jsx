import { useState, useEffect, useRef } from "react";
import fireworksSrc from "./assets/fireworks.mp3";
import "./App.css";

/* ----------------------------- game settings ----------------------------- */
const START_CREDITS = 250;
const MIN_BET = 10;
const BET_STEP = 10;
const PAYOUT = 9;        // correct number pays 9x your wager (your stake comes back too)
const SPIN_MS = 4300;    // must match the transition duration used in the wheel
const SLICE = 36;        // 360 / 10 numbers

// Order and colours match the design: 0 sits at the top, numbers go clockwise
const NUMBERS = [
  { n: 0, color: "#f7b500" },
  { n: 1, color: "#e0203a" },
  { n: 2, color: "#e8209b" },
  { n: 3, color: "#8a2fd8" },
  { n: 4, color: "#2f6fe0" },
  { n: 5, color: "#1ba6ea" },
  { n: 6, color: "#11a79c" },
  { n: 7, color: "#1f9f3c" },
  { n: 8, color: "#ff7a10" },
  { n: 9, color: "#6d35d9" },
];

// Converts an angle (0 = top, clockwise) and a radius into x/y coordinates
const polar = (deg, radius, cx = 200, cy = 200) => {
  const rad = (deg * Math.PI) / 180;
  return [cx + radius * Math.sin(rad), cy - radius * Math.cos(rad)];
};

/* --------------------------------- wheel --------------------------------- */
function WheelFace() {
  return (
    <svg viewBox="0 0 400 400" aria-hidden="true">
      <defs>
        <radialGradient id="lo-shine" cx="50%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
        </radialGradient>
      </defs>

      {NUMBERS.map(({ n, color }, i) => {
        const [x0, y0] = polar(i * SLICE - SLICE / 2, 200);
        const [x1, y1] = polar(i * SLICE + SLICE / 2, 200);
        const [tx, ty] = polar(i * SLICE, 132);
        return (
          <g key={n}>
            <path
              d={`M200 200 L${x0} ${y0} A200 200 0 0 1 ${x1} ${y1} Z`}
              fill={color}
              stroke="rgba(0,0,0,0.25)"
              strokeWidth="1.5"
            />
            <text
              x={tx}
              y={ty}
              textAnchor="middle"
              dominantBaseline="central"
              className="lo-seg-num"
            >
              {n}
            </text>
          </g>
        );
      })}

      <circle cx="200" cy="200" r="200" fill="url(#lo-shine)" />
    </svg>
  );
}

function Wheel({ rotation, spinning }) {
  const bulbs = Array.from({ length: 16 }, (_, k) => {
    const [x, y] = polar(k * 22.5, 47.75, 50, 50); // percentage positions on the rim
    return (
      <span
        key={k}
        className="lo-bulb"
        style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(k % 4) * 0.15}s` }}
      />
    );
  });

  return (
    <div className="lo-wheel-col">
      <div className={`lo-wheel ${spinning ? "is-spinning" : ""}`}>
        <div className="lo-floor" />
        <div className="lo-halo" />
        <div className="lo-orbit" />
        <div className="lo-rim" />
        {bulbs}
        <div
          className="lo-disc"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.12, 0.99)`,
          }}
        >
          <WheelFace />
        </div>
        <div className="lo-hub" />
        <div className="lo-pointer" />
      </div>
    </div>
  );
}

/* ---------------------------------- app ---------------------------------- */
/* ============================ FIREWORKS SHOW ============================ */

const FW_COLORS = ["#ff4d6d", "#ffb703", "#06d6a0", "#4cc9f0", "#c77dff", "#ff8fab", "#fff3b0", "#ffffff", "#ff9f1c", "#90e0ef"];

/* ---------------------- sound: the real fireworks recording ---------------------- */

// In the standalone HTML the recording is embedded as window.__FIREWORKS_SRC.
// In the Vite project it is the bundled file imported above.
const FIREWORKS_SRC = window.__FIREWORKS_SRC || fireworksSrc;

let fwCtxRef = null;

// One shared AudioContext with a compressor, so many overlapping bangs never clip.
function fwAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!fwCtxRef) {
      const ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 8;
      comp.ratio.value = 4;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);
      comp.connect(ctx.destination);
      ctx.master = master;
      fwCtxRef = ctx;
    }
    if (fwCtxRef.state === "suspended") fwCtxRef.resume();
    return fwCtxRef;
  } catch {
    return null;
  }
}

const fwSound = { buf: null, hits: [], norm: 1, loading: null };

// Gets the mp3 bytes: from the embedded data URL, or from the bundled file.
async function fwBytes() {
  const src = FIREWORKS_SRC;
  if (src.startsWith("data:")) {
    const bin = atob(src.slice(src.indexOf(",") + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  const res = await fetch(src);
  return res.arrayBuffer();
}

// Finds the moments in the recording where a bang starts (a sudden sharp rise in loudness),
// so each explosion on screen can play a real bang from the recording.
function fwFindBangs(buf) {
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;
  const win = Math.max(1, Math.floor(sr * 0.02));
  const env = [];
  for (let i = 0; i + win <= data.length; i += win) {
    let s = 0;
    for (let j = 0; j < win; j++) s += data[i + j] * data[i + j];
    env.push(Math.sqrt(s / win));
  }
  let max = 0;
  for (let k = 0; k < env.length; k++) if (env[k] > max) max = env[k];
  const hits = [];
  let lastIdx = -100;
  for (let k = 2; k < env.length; k++) {
    const rising = env[k] > env[k - 2] * 2.5 && env[k] > max * 0.15;
    if (rising && k - lastIdx > 12) {
      hits.push(((k - 1) * win) / sr);
      lastIdx = k;
    }
  }
  return hits;
}

// Decodes the recording once, so every explosion can use it straight away.
function fwLoadSound() {
  if (fwSound.loading) return fwSound.loading;
  const ctx = fwAudio();
  if (!ctx) return Promise.resolve(false);
  fwSound.loading = fwBytes()
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buf) => {
      const data = buf.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = Math.abs(data[i]);
        if (v > peak) peak = v;
      }
      fwSound.buf = buf;
      fwSound.norm = peak > 0 ? 0.9 / peak : 1;
      fwSound.hits = fwFindBangs(buf);
      return true;
    })
    .catch(() => false);
  return fwSound.loading;
}

// Plays one real bang from the recording.
// level: 0..1 loudness, length: seconds, delay: seconds from now.
function fwBang({ delay = 0, level = 0.7, length = 2.2 } = {}) {
  const ctx = fwAudio();
  const { buf, hits, norm } = fwSound;
  if (!ctx || !buf) return;
  const when = ctx.currentTime + delay;
  const start = hits.length
    ? hits[Math.floor(Math.random() * hits.length)]
    : Math.random() * Math.max(0, buf.duration - length);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.92 + Math.random() * 0.16;

  const g = ctx.createGain();
  const peak = Math.max(0.0002, level * norm);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(peak, when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + length);
  src.connect(g);

  if (ctx.createStereoPanner) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.2 - 0.6;
    g.connect(pan);
    pan.connect(ctx.master);
  } else {
    g.connect(ctx.master);
  }
  src.start(when, Math.max(0, start - 0.02), length + 0.2);
}

// A string of firecracker snaps: quick at first, then thinning out, like a real strand.
function fwCrackers(count, level) {
  let t = 0;
  for (let i = 0; i < count; i++) {
    const fade = 1 - i / (count + 3);
    fwBang({ delay: t, level: level * fade, length: 0.35 });
    t += 0.03 + Math.random() * (0.05 + i * 0.01);
  }
}


/* ----------------------------- visual sprites ----------------------------- */
// Soft glow and smoke sprites are drawn once and reused, which is far faster than gradients every frame.

const fwSprites = {};

function fwGlow(color) {
  if (!fwSprites[color]) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const x = c.getContext("2d");
    const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(0.2, color);
    grd.addColorStop(0.55, color + "44");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = grd;
    x.fillRect(0, 0, 64, 64);
    fwSprites[color] = c;
  }
  return fwSprites[color];
}

function fwSmoke() {
  if (!fwSprites.smoke) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const x = c.getContext("2d");
    const grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(175,175,195,0.9)");
    grd.addColorStop(0.5, "rgba(140,140,165,0.4)");
    grd.addColorStop(1, "rgba(120,120,145,0)");
    x.fillStyle = grd;
    x.fillRect(0, 0, 64, 64);
    fwSprites.smoke = c;
  }
  return fwSprites.smoke;
}

/* ------------------------------ the show ------------------------------ */

// Rockets climb with a smoke trail and a glowing head, then burst into peonies,
// chrysanthemums (with crackling stars), willows (drooping gold) or rings.
// Ground firecracker strings go off now and then. It runs until the player clicks.
function Fireworks() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas.getContext("2d");
    const ctx = fwAudio();
    const choose = (arr) => arr[Math.floor(Math.random() * arr.length)];

    const SHELLS = {
      peony: { count: 120, min: 95, max: 210, grav: 110, drag: 0.55, decay: [0.42, 0.62], trail: 3, twinkle: 0.25 },
      chrysanthemum: { count: 140, min: 110, max: 230, grav: 120, drag: 0.6, decay: [0.38, 0.55], trail: 8, twinkle: 0.1, split: true },
      willow: { count: 100, min: 60, max: 140, grav: 170, drag: 0.8, decay: [0.15, 0.22], trail: 14, twinkle: 0.4, gold: true },
      ring: { count: 96, min: 165, max: 175, grav: 100, drag: 0.5, decay: [0.5, 0.6], trail: 4, twinkle: 0.15, tilt: true },
    };

    let w = 0;
    let h = 0;
    let raf = 0;
    let alive = true;
    let last = performance.now();
    let clock = 0;
    let nextLaunch = 0.3;
    let nextCracker = 2.2;
    let rockets = [];
    let sparks = [];
    let pending = [];
    let smoke = [];
    let flashes = [];
    let delayed = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // New particles are queued and merged between passes, so no list changes mid-loop.
    const spawn = (o) => {
      pending.push({
        life: 1,
        decay: 0.5,
        grav: 110,
        drag: 0.55,
        size: 2,
        color: "#ffffff",
        trail: [],
        trailLen: 3,
        twinkle: false,
        phase: Math.random() * 6.28,
        split: false,
        splitDone: true,
        ...o,
      });
    };
    const merge = () => {
      if (pending.length) {
        sparks.push(...pending);
        pending = [];
      }
    };

    const launch = () => {
      const roll = Math.random();
      const shell = roll < 0.35 ? "peony" : roll < 0.6 ? "chrysanthemum" : roll < 0.8 ? "willow" : "ring";
      const flight = 0.9 + Math.random() * 0.5;
      const apex = h * (0.1 + Math.random() * 0.38);
      rockets.push({
        x: w * (0.1 + Math.random() * 0.8),
        y: h + 8,
        vx: (Math.random() - 0.5) * 30,
        vy: -(h + 8 - apex) / flight,
        apex,
        shell,
        color: choose(FW_COLORS),
        smokeT: 0,
      });
      if (ctx) fwBang({ level: 0.12, length: 0.8 });
    };

    const burst = (x, y, rocket) => {
      const s = SHELLS[rocket.shell];
      const mono = Math.random() < 0.6;
      const tilt = s.tilt ? 0.25 + Math.random() * 0.45 : 1;
      const count = Math.min(s.count, Math.max(0, 1500 - sparks.length));
      for (let i = 0; i < count; i++) {
        const a = (i / s.count) * Math.PI * 2 + Math.random() * 0.06;
        const v = s.min + Math.random() * (s.max - s.min);
        let color;
        if (s.gold) color = choose(["#ffd27a", "#fff3c4", "#ffb347"]);
        else color = mono ? rocket.color : choose(FW_COLORS);
        spawn({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * tilt,
          decay: s.decay[0] + Math.random() * (s.decay[1] - s.decay[0]),
          grav: s.grav,
          drag: s.drag,
          size: 1.8 + Math.random() * 1.7,
          color,
          trailLen: s.trail,
          twinkle: Math.random() < s.twinkle,
          split: !!s.split && Math.random() < 0.3,
          splitDone: false,
        });
      }
      flashes.push({ x, y, life: 1, size: 90 + Math.random() * 70 });
      smoke.push({ x, y, vx: 0, vy: -6, life: 1, size: 30 + Math.random() * 20 });
      if (ctx) fwBang({ level: 0.6 + Math.random() * 0.3, length: 2.4 });
      if (ctx && Math.random() < 0.7) fwCrackers(6 + Math.floor(Math.random() * 7), 0.2);
      if (s.split && Math.random() < 0.35) {
        delayed.push({ at: clock + 0.5 + Math.random() * 0.4, x, y, color: choose(FW_COLORS) });
      }
    };

    // a smaller second burst that opens up after the first one (chrysanthemum)
    const secondary = (x, y, color) => {
      for (let i = 0; i < 45; i++) {
        const a = (i / 45) * Math.PI * 2;
        const v = 60 + Math.random() * 70;
        spawn({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          decay: 0.5 + Math.random() * 0.3,
          grav: 120,
          drag: 0.6,
          size: 1.4 + Math.random(),
          color,
          trailLen: 4,
        });
      }
      if (ctx) fwBang({ level: 0.35, length: 1.2 });
    };

    // firecracker strand going off on the ground
    const groundCracker = () => {
      const x = w * (0.1 + Math.random() * 0.8);
      if (ctx) fwCrackers(10 + Math.floor(Math.random() * 6), 0.35);
      flashes.push({ x, y: h - 4, life: 0.8, size: 60 });
      for (let i = 0; i < 16; i++) {
        spawn({
          x: x + (Math.random() - 0.5) * 30,
          y: h - 6,
          vx: (Math.random() - 0.5) * 240,
          vy: -(60 + Math.random() * 160),
          decay: 1.5 + Math.random(),
          grav: 260,
          drag: 0.7,
          size: 1.3,
          color: choose(["#ffd27a", "#ffffff", "#ff9f1c"]),
          trailLen: 3,
        });
      }
    };

    const frame = (now) => {
      if (!alive) return;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      clock += dt;

      nextLaunch -= dt;
      if (nextLaunch <= 0) {
        launch();
        if (Math.random() < 0.35) launch();
        nextLaunch = 0.6 + Math.random() * 0.9;
      }
      nextCracker -= dt;
      if (nextCracker <= 0) {
        groundCracker();
        nextCracker = 3 + Math.random() * 4;
      }

      g.clearRect(0, 0, w, h);

      // smoke haze first, with normal blending
      g.globalCompositeOperation = "source-over";
      smoke = smoke.filter((s) => {
        s.life -= dt * 0.35;
        if (s.life <= 0) return false;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.size += 14 * dt;
        g.globalAlpha = s.life * 0.2;
        g.drawImage(fwSmoke(), s.x - s.size, s.y - s.size, s.size * 2, s.size * 2);
        return true;
      });

      // everything that glows uses additive blending
      g.globalCompositeOperation = "lighter";

      rockets = rockets.filter((r) => {
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.smokeT -= dt;
        if (r.smokeT <= 0) {
          r.smokeT = 0.06;
          smoke.push({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * 10, vy: 6, life: 1, size: 7 + Math.random() * 5 });
        }
        spawn({
          x: r.x + (Math.random() - 0.5) * 3,
          y: r.y + 6,
          vx: (Math.random() - 0.5) * 40,
          vy: 50 + Math.random() * 50,
          decay: 1.8 + Math.random(),
          grav: 220,
          drag: 0.7,
          size: 1.2,
          color: "#ffd27a",
          trailLen: 3,
        });
        g.globalAlpha = 1;
        g.drawImage(fwGlow("#ffe6a0"), r.x - 16, r.y - 16, 32, 32);
        if (r.y <= r.apex) {
          burst(r.x, r.y, r);
          return false;
        }
        return true;
      });
      merge();

      flashes = flashes.filter((f) => {
        f.life -= dt * 6;
        if (f.life <= 0) return false;
        g.globalAlpha = f.life * 0.8;
        g.drawImage(fwGlow("#fff6d6"), f.x - f.size, f.y - f.size, f.size * 2, f.size * 2);
        return true;
      });

      sparks = sparks.filter((p) => {
        p.vy += p.grav * dt;
        const k = Math.pow(p.drag, dt);
        p.vx *= k;
        p.vy *= k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= p.decay * dt;
        if (p.life <= 0) return false;

        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > p.trailLen) p.trail.shift();

        // chrysanthemum sparks crackle into little stars before they die
        if (p.split && !p.splitDone && p.life < 0.3) {
          p.splitDone = true;
          for (let n = 0; n < 3; n++) {
            const aa = Math.random() * Math.PI * 2;
            const vv = 40 + Math.random() * 60;
            spawn({
              x: p.x,
              y: p.y,
              vx: Math.cos(aa) * vv,
              vy: Math.sin(aa) * vv,
              decay: 2.4,
              grav: 160,
              drag: 0.4,
              size: 1.1,
              color: "#ffffff",
              trailLen: 2,
            });
          }
          if (ctx && Math.random() < 0.5) fwCrackers(2, 0.15);
        }

        const a = Math.min(1, p.life);
        const tw = p.twinkle ? 0.5 + 0.5 * Math.sin(clock * 35 + p.phase) : 1;

        if (p.trail.length > 1) {
          g.globalAlpha = a * tw * 0.45;
          g.strokeStyle = p.color;
          g.lineWidth = Math.max(0.6, p.size * 0.8);
          g.beginPath();
          g.moveTo(p.trail[0].x, p.trail[0].y);
          for (let n = 1; n < p.trail.length; n++) g.lineTo(p.trail[n].x, p.trail[n].y);
          g.stroke();
        }

        const r = p.size * 5.5;
        g.globalAlpha = a * tw * 0.85;
        g.drawImage(fwGlow(p.color), p.x - r, p.y - r, r * 2, r * 2);
        g.globalAlpha = a * tw;
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.arc(p.x, p.y, p.size * 0.45, 0, Math.PI * 2);
        g.fill();
        return true;
      });
      merge();

      delayed = delayed.filter((d) => {
        if (clock < d.at) return true;
        secondary(d.x, d.y, d.color);
        return false;
      });
      merge();

      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fw-canvas" />;
}

// Full-screen win show. The fireworks keep going until the player clicks,
// then the overlay closes and the game is ready for the next bet.
function WinPopup({ amount, lucky, onClose }) {
  return (
    <div className="fw-overlay" onClick={onClose}>
      <Fireworks />
      <div className="fw-card">
        <div className="fw-emoji">{lucky ? "🍀" : "🎉"}</div>
        <h2>{lucky ? "Lucky 3rd bet!" : "You won!"}</h2>
        <p className="fw-amount">+{amount} credits</p>
        <p className="fw-sub">{lucky ? "Every 3rd bet is a guaranteed win." : "Nice shot!"}</p>
        <p className="fw-tap">👆 Click anywhere to play the next bet</p>
      </div>
    </div>
  );
}


export default function App() {
  const [credits, setCredits] = useState(START_CREDITS);
  const [pick, setPick] = useState(0);
  const [bet, setBet] = useState(MIN_BET);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [resultId, setResultId] = useState(0);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [spinCount, setSpinCount] = useState(0);
  const [celebrate, setCelebrate] = useState(null);
  const [msg, setMsg] = useState({
    type: "info",
    text: "Pick a number, set your wager and spin!",
  });
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    fwLoadSound();
  }, []);

  // The wager can never be more than the player can afford
  const maxBet = Math.max(MIN_BET, Math.floor(credits / BET_STEP) * BET_STEP);
  const wager = Math.min(bet, maxBet);
  const broke = credits < MIN_BET;

  const changeBet = (dir) => {
    const next = wager + dir * BET_STEP;
    if (next >= MIN_BET && next <= maxBet) setBet(next);
  };

  const spin = () => {
    if (spinning || broke || wager > credits) return;

    // every 3rd bet is a guaranteed win: the wheel lands on your pick
    const spinNo = spinCount + 1;
    const lucky = spinNo % 3 === 0;
    setSpinCount(spinNo);
    const result = lucky ? pick : Math.floor(Math.random() * 10);

    // Stop at a random spot inside the winning slice, not exactly on the line
    const jitter = (Math.random() * 2 - 1) * (SLICE / 2 - 4);

    // Wheel angle (mod 360) that puts slice `result` under the top pointer
    const target = (((-result * SLICE + jitter) % 360) + 360) % 360;
    const current = ((rotation % 360) + 360) % 360;
    const delta = (target - current + 360) % 360;

    setRotation(rotation + 6 * 360 + delta); // six full turns, then settle
    setSpinning(true);
    setCredits((c) => c - wager);
    setMsg({ type: "info", text: "Good luck! The wheel is spinning..." });

    timer.current = setTimeout(() => {
      setSpinning(false);
      setLastResult(result);
      setResultId((id) => id + 1);

      if (result === pick) {
        setCredits((c) => c + wager * (PAYOUT + 1)); // stake back + payout
        setWins((w) => w + 1);
        setCelebrate({ id: Date.now(), amount: wager * PAYOUT, lucky });
        setMsg({
          type: "win",
          text: `Number ${result} hit! You won ${wager * PAYOUT} credits.`,
        });
      } else {
        setLosses((l) => l + 1);
        setMsg({
          type: "lose",
          text: `Result ${result}, your pick was ${pick}. You lost ${wager} credits.`,
        });
      }
    }, SPIN_MS);
  };

  const restart = () => {
    setCredits(START_CREDITS);
    setBet(MIN_BET);
    setLastResult(null);
    setWins(0);
    setLosses(0);
    setSpinCount(0);
    setCelebrate(null);
    setMsg({ type: "info", text: "New game! Good luck." });
  };

  // Space bar shortcut (ignored while spinning or when a button is focused)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space" || e.repeat || spinning || e.target.tagName === "BUTTON") return;
      e.preventDefault();
      if (broke) restart();
      else spin();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const notice =
    broke && !spinning
      ? { type: "lose", text: "Out of credits! Press PLAY AGAIN to start over." }
      : msg;

  return (
    <div className="lo-app">
      <header className="lo-topbar">
        <nav className="lo-nav">
          <span>Spin</span>
          <span>Bet</span>
          <span>Win</span>
        </nav>

        <div className="lo-logo">
          <h1 className="lo-title">LUCKY ORBIT</h1>
          <div className="lo-subtitle">Wheel of Fortune</div>
        </div>

        <div className="lo-credits">
          <span className="lo-coin">$</span>
          <div>
            <small>Credits</small>
            <strong>{credits}</strong>
          </div>
        </div>
      </header>

      <main className="lo-game">
        <Wheel rotation={rotation} spinning={spinning} />

        <section className="lo-panel">
          <div className="lo-box">
            <h2 className="lo-box-title">Place your bet</h2>

            <div className="lo-numbers">
              {NUMBERS.map(({ n, color }) => (
                <button
                  key={n}
                  type="button"
                  className={`lo-num ${pick === n ? "selected" : ""}`}
                  style={{ "--c": color }}
                  onClick={() => setPick(n)}
                  disabled={spinning}
                  aria-pressed={pick === n}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="lo-wager">
              <div className="lo-wager-head">
                <span className="lo-coin lo-coin-sm">$</span>
                Your wager
              </div>
              <div className="lo-wager-ctrl">
                <button
                  type="button"
                  className="lo-round"
                  onClick={() => changeBet(-1)}
                  disabled={spinning || wager - BET_STEP < MIN_BET}
                  aria-label="Decrease wager"
                >
                  −
                </button>
                <span className="lo-wager-val">{wager}</span>
                <button
                  type="button"
                  className="lo-round"
                  onClick={() => changeBet(1)}
                  disabled={spinning || wager + BET_STEP > maxBet}
                  aria-label="Increase wager"
                >
                  +
                </button>
              </div>
            </div>

            <button
              type="button"
              className="lo-spin"
              onClick={broke ? restart : spin}
              disabled={spinning}
            >
              {!spinning && !broke && <span className="lo-play" />}
              {spinning ? "SPINNING..." : broke ? "PLAY AGAIN" : "START SPIN"}
            </button>
            <p className="fx-lucky-note">
              {(spinCount + 1) % 3 === 0
                ? "🍀 Next bet is a LUCKY win!"
                : `Bet #${spinCount + 1} · lucky win on bet #${Math.ceil((spinCount + 1) / 3) * 3}`}
            </p>

            <p className={`lo-msg ${notice.type}`}>{notice.text}</p>
            <p className="lo-hint">
              Press <kbd>Space</kbd> to spin · Correct number pays {PAYOUT}× your wager
            </p>
          </div>

          <div className="lo-stats">
            <div className="lo-stat">
              <span className="lo-stat-ico gold">🏆</span>
              <div>
                <small>Last result</small>
                <strong key={resultId} className={resultId ? "lo-pop" : ""}>
                  {lastResult ?? "–"}
                </strong>
              </div>
            </div>
            <div className="lo-stat">
              <span className="lo-stat-ico good">★</span>
              <div>
                <small>Win</small>
                <strong className="good">{wins}</strong>
              </div>
            </div>
            <div className="lo-stat">
              <span className="lo-stat-ico bad">✕</span>
              <div>
                <small>Loss</small>
                <strong className="bad">{losses}</strong>
              </div>
            </div>
          </div>
        </section>
      </main>
      {celebrate ? (
        <WinPopup
          key={celebrate.id}
          amount={celebrate.amount}
          lucky={celebrate.lucky}
          onClose={() => setCelebrate(null)}
        />
      ) : null}
    </div>
  );
}
