// ─── AICreativeSuite.tsx ──────────────────────────────────────────────────────
// Complete rebuild — image + video + copy generation that actually works.
//
// Image : black-forest-labs/flux-schnell  (Replicate)
// Video : luma/ray                         (Replicate)
// Copy  : claude-haiku-4-5-20251001        (Anthropic SDK, streaming)

import React, { useState, useRef, useEffect } from 'react';
import Anthropic from '@anthropic-ai/sdk';
import { generate } from '../lib/replicateApi';
import type { ReplicateStatus } from '../lib/replicateApi';

// ─── Credentials ──────────────────────────────────────────────────────────────
const REPLICATE_TOKEN = import.meta.env.VITE_REPLICATE_API_TOKEN ?? '';
const ANTHROPIC_KEY   = import.meta.env.VITE_ANTHROPIC_API_KEY   ?? '';

// ─── Model IDs ────────────────────────────────────────────────────────────────
const FLUX = 'black-forest-labs/flux-schnell';
const LUMA = 'luma/ray-2-720p';

// ─── Types ────────────────────────────────────────────────────────────────────
type Mode       = 'image' | 'video' | 'copy';
type VideoStage = 'requesting' | ReplicateStatus;

type GenState =
  | { s: 'idle' }
  | { s: 'gen_image' }
  | { s: 'gen_video'; stage: VideoStage }
  | { s: 'gen_copy';  partial: string }
  | { s: 'done_image'; url: string; prompt: string }
  | { s: 'done_video'; url: string; prompt: string }
  | { s: 'done_copy';  text: string }
  | { s: 'error'; msg: string };

// ─── Video stage display ──────────────────────────────────────────────────────
const VSTAGE: Record<VideoStage, { label: string; sub: string }> = {
  requesting: { label: 'Sending Request',  sub: 'Connecting to Replicate…'        },
  queued:     { label: 'In Queue',         sub: 'Waiting for GPU · ~10–30 sec'    },
  starting:   { label: 'Starting GPU',     sub: 'Loading model · ~30–60 sec'      },
  processing: { label: 'Generating Video', sub: 'Rendering your clip · ~2–4 min'  },
  succeeded:  { label: 'Complete',         sub: ''                                 },
  failed:     { label: 'Failed',           sub: ''                                 },
  canceled:   { label: 'Canceled',         sub: ''                                 },
};

const PIPELINE: VideoStage[] = ['requesting', 'queued', 'starting', 'processing'];

// ─── Sample prompts ───────────────────────────────────────────────────────────
const SAMPLES: Record<Mode, string[]> = {
  image: [
    'Luxury perfume bottle on dark marble, cinematic golden light, product shot',
    'Flat lay of fitness gear on white background, minimal clean style',
    'Lifestyle photo: person enjoying coffee outdoors, natural sunlight',
  ],
  video: [
    'Slow motion dark espresso pouring into a white cup, steam rising close up',
    'Athletic sneaker rotating on white surface, dramatic spotlight',
    'Elegant handbag on velvet table, camera slowly circling, cinematic',
  ],
  copy: [
    'Premium protein shake brand launching a new chocolate flavor',
    "Women's fashion brand summer collection, target audience 25–40",
    'B2B SaaS productivity tool for remote teams',
  ],
};

// ─── Shared styles ────────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: 'var(--brand-surface-card)',
  border: '1px solid var(--brand-muted)',
  borderRadius: 8,
};

const btnBase: React.CSSProperties = {
  padding: '7px 14px',
  borderRadius: 5,
  border: '1px solid var(--brand-muted)',
  background: 'transparent',
  color: '#9ca3af',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

// ─── Global CSS animations ────────────────────────────────────────────────────
const ANIM_CSS = `
  @keyframes cs-spin  { to { transform: rotate(360deg); } }
  @keyframes cs-pulse { 0%,100% { opacity:1; box-shadow:0 0 0 4px rgba(167,139,250,.15); }
                        50%     { opacity:.5; box-shadow:0 0 0 8px rgba(167,139,250,.04); } }
  @keyframes cs-dot   { 0%,100% { opacity:1; } 50% { opacity:.2; } }
`;

// ─── AICreativeSuite ─────────────────────────────────────────────────────────
export const AICreativeSuite: React.FC = () => {
  const [mode,      setMode]      = useState<Mode>('image');
  const [prompt,    setPrompt]    = useState('');
  const [imgAspect, setImgAspect] = useState('1:1');
  const [vidAspect, setVidAspect] = useState('16:9');
  const [duration,  setDuration]  = useState<5 | 9>(5);
  const [genState,  setGenState]  = useState<GenState>({ s: 'idle' });
  const [elapsed,   setElapsed]   = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    timerRef.current && clearInterval(timerRef.current);
    abortRef.current?.abort();
  }, []);

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(n => n + 1), 1000);
  };

  const stopTimer = () => {
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const fmtTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const abort = () => {
    abortRef.current?.abort();
    stopTimer();
    setGenState({ s: 'idle' });
  };

  const switchMode = (m: Mode) => {
    abort();
    setMode(m);
  };

  // ── Image generation ────────────────────────────────────────────────────────
  const handleGenImage = async () => {
    if (!prompt.trim() || !REPLICATE_TOKEN) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setGenState({ s: 'gen_image' });
    startTimer();
    try {
      const url = await generate(
        REPLICATE_TOKEN,
        FLUX,
        { prompt: prompt.trim(), aspect_ratio: imgAspect, num_inference_steps: 4, output_quality: 90 },
        undefined,
        ac.signal,
      );
      stopTimer();
      setGenState({ s: 'done_image', url, prompt: prompt.trim() });
    } catch (e: unknown) {
      stopTimer();
      const err = e as Error;
      if (err.name === 'AbortError') { setGenState({ s: 'idle' }); return; }
      setGenState({ s: 'error', msg: err.message });
    }
  };

  // ── Video generation ────────────────────────────────────────────────────────
  const handleGenVideo = async () => {
    if (!prompt.trim() || !REPLICATE_TOKEN) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setGenState({ s: 'gen_video', stage: 'requesting' });
    startTimer();
    try {
      const url = await generate(
        REPLICATE_TOKEN,
        LUMA,
        { prompt: prompt.trim(), aspect_ratio: vidAspect, duration },
        (stage) => setGenState({ s: 'gen_video', stage: stage as VideoStage }),
        ac.signal,
      );
      stopTimer();
      setGenState({ s: 'done_video', url, prompt: prompt.trim() });
    } catch (e: unknown) {
      stopTimer();
      const err = e as Error;
      if (err.name === 'AbortError') { setGenState({ s: 'idle' }); return; }
      setGenState({ s: 'error', msg: err.message });
    }
  };

  // ── Copy generation ─────────────────────────────────────────────────────────
  const handleGenCopy = async () => {
    if (!prompt.trim() || !ANTHROPIC_KEY) return;
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY, dangerouslyAllowBrowser: true });
    setGenState({ s: 'gen_copy', partial: '' });
    startTimer();
    let full = '';
    try {
      const stream = client.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: 'You are an expert Meta Ads copywriter. Write compelling, conversion-focused ad copy.',
        messages: [{
          role: 'user',
          content: `Create Meta ad copy for: "${prompt.trim()}"

Format your response exactly like this:

**Primary Text** (max 125 chars):
...

**Headline** (max 40 chars):
...

**Description** (max 30 chars):
...

**Call to Action**:
...

**Hook** (first 3 seconds of video/reel):
...`,
        }],
      });
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          full += chunk.delta.text;
          setGenState({ s: 'gen_copy', partial: full });
        }
      }
      stopTimer();
      setGenState({ s: 'done_copy', text: full });
    } catch (e: unknown) {
      stopTimer();
      setGenState({ s: 'error', msg: (e as Error).message });
    }
  };

  const handleGenerate = () => {
    if (mode === 'image') handleGenImage();
    else if (mode === 'video') handleGenVideo();
    else handleGenCopy();
  };

  const isGenerating = genState.s === 'gen_image' || genState.s === 'gen_video' || genState.s === 'gen_copy';
  const canGenerate  = !!prompt.trim() && !isGenerating &&
    (mode === 'copy' ? !!ANTHROPIC_KEY : !!REPLICATE_TOKEN);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      <style>{ANIM_CSS}</style>

      {/* ── Mode selector ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['image', 'video', 'copy'] as Mode[]).map(m => {
          const active = mode === m;
          const labels: Record<Mode, string> = { image: '🖼  Image', video: '🎬  Video', copy: '✍  Copy' };
          const subs:   Record<Mode, string> = { image: 'Flux Schnell', video: 'Luma Ray 2', copy: 'Claude AI' };
          return (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                padding: '10px 18px', borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${active ? 'rgba(167,139,250,.5)' : 'var(--brand-muted)'}`,
                background: active ? 'rgba(167,139,250,.1)' : 'transparent',
                color: active ? '#a78bfa' : '#6b7280',
                textAlign: 'left', transition: 'all .15s',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>{labels[m]}</div>
              <div style={{ fontSize: 10, marginTop: 2, color: active ? 'rgba(167,139,250,.6)' : '#374151' }}>{subs[m]}</div>
            </button>
          );
        })}

        {!REPLICATE_TOKEN && mode !== 'copy' && (
          <div style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.05)', color: '#f87171', fontSize: 11 }}>
            ⚠ VITE_REPLICATE_API_TOKEN not set in .env.local
          </div>
        )}
        {!ANTHROPIC_KEY && mode === 'copy' && (
          <div style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.05)', color: '#f87171', fontSize: 11 }}>
            ⚠ VITE_ANTHROPIC_API_KEY not set in .env.local
          </div>
        )}
      </div>

      {/* ── Input card ────────────────────────────────────────────────────── */}
      <div style={{ ...card, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Image options */}
        {mode === 'image' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Aspect Ratio
            </span>
            {['1:1', '16:9', '9:16', '4:5'].map(a => (
              <button key={a} onClick={() => setImgAspect(a)} style={{
                padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
                border: `1px solid ${imgAspect === a ? 'rgba(167,139,250,.4)' : 'var(--brand-muted)'}`,
                background: imgAspect === a ? 'rgba(167,139,250,.1)' : 'transparent',
                color: imgAspect === a ? '#a78bfa' : '#6b7280',
                fontSize: 11, fontWeight: 700,
              }}>{a}</button>
            ))}
          </div>
        )}

        {/* Video options */}
        {mode === 'video' && (
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Aspect</span>
              {['16:9', '9:16', '1:1', '4:3'].map(a => (
                <button key={a} onClick={() => setVidAspect(a)} style={{
                  padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
                  border: `1px solid ${vidAspect === a ? 'rgba(167,139,250,.4)' : 'var(--brand-muted)'}`,
                  background: vidAspect === a ? 'rgba(167,139,250,.1)' : 'transparent',
                  color: vidAspect === a ? '#a78bfa' : '#6b7280',
                  fontSize: 11, fontWeight: 700,
                }}>{a}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>Duration</span>
              {([5, 9] as const).map(d => (
                <button key={d} onClick={() => setDuration(d)} style={{
                  padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: 'monospace',
                  border: `1px solid ${duration === d ? 'rgba(167,139,250,.4)' : 'var(--brand-muted)'}`,
                  background: duration === d ? 'rgba(167,139,250,.1)' : 'transparent',
                  color: duration === d ? '#a78bfa' : '#6b7280',
                  fontSize: 11, fontWeight: 700,
                }}>{d}s</button>
              ))}
            </div>
          </div>
        )}

        {/* Prompt */}
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canGenerate) {
              e.preventDefault();
              handleGenerate();
            }
          }}
          placeholder={
            mode === 'image' ? 'Describe the image you want to generate…' :
            mode === 'video' ? 'Describe the video scene to generate…' :
                               'Describe your product, brand, or campaign…'
          }
          rows={3}
          disabled={isGenerating}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(0,0,0,.25)',
            border: '1px solid var(--brand-muted)',
            borderRadius: 6, resize: 'vertical',
            color: '#ffffff', fontSize: 13, lineHeight: 1.6,
            padding: '12px 14px', fontFamily: 'inherit',
            outline: 'none', opacity: isGenerating ? .5 : 1,
          }}
        />

        {/* Sample prompts */}
        {!prompt && genState.s === 'idle' && (
          <div>
            <p style={{ fontSize: 10, color: '#374151', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, marginBottom: 8 }}>
              Try an example:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SAMPLES[mode].map((s, i) => (
                <button key={i} onClick={() => setPrompt(s)} style={{
                  padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid var(--brand-muted)',
                  background: 'rgba(255,255,255,.02)',
                  color: '#6b7280', fontSize: 11,
                  maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={s}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          {prompt && !isGenerating && (
            <button onClick={() => setPrompt('')} style={btnBase}>Clear</button>
          )}
          {isGenerating ? (
            <button onClick={abort} style={{
              padding: '10px 20px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid rgba(239,68,68,.4)',
              background: 'rgba(239,68,68,.08)',
              color: '#ef4444', fontSize: 12, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '.08em',
            }}>
              ✕ Cancel
            </button>
          ) : (
            <button onClick={handleGenerate} disabled={!canGenerate} style={{
              padding: '10px 24px', borderRadius: 6, border: 'none',
              background: canGenerate
                ? 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)'
                : 'rgba(167,139,250,.15)',
              color: canGenerate ? '#fff' : '#4b5563',
              fontSize: 12, fontWeight: 700,
              cursor: canGenerate ? 'pointer' : 'not-allowed',
              textTransform: 'uppercase', letterSpacing: '.08em',
            }}>
              {mode === 'image' ? '✨ Generate Image' :
               mode === 'video' ? '🎬 Generate Video' :
                                  '✍ Write Copy'}
            </button>
          )}
        </div>
      </div>

      {/* ── Output ────────────────────────────────────────────────────────── */}
      <Output
        state={genState}
        elapsed={elapsed}
        fmtTime={fmtTime}
        onReset={() => setGenState({ s: 'idle' })}
      />
    </div>
  );
};

// ─── Output panel ─────────────────────────────────────────────────────────────
const Output: React.FC<{
  state:   GenState;
  elapsed: number;
  fmtTime: (s: number) => string;
  onReset: () => void;
}> = ({ state, elapsed, fmtTime, onReset }) => {

  if (state.s === 'idle') return null;

  // Generating image
  if (state.s === 'gen_image') return (
    <div style={{ ...card, padding: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '28px 0' }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          border: '3px solid rgba(167,139,250,.15)',
          borderTop: '3px solid #a78bfa',
          animation: 'cs-spin .9s linear infinite',
        }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0 }}>Generating Image…</p>
          <p style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>Flux Schnell · {fmtTime(elapsed)}</p>
        </div>
      </div>
    </div>
  );

  // Generating video
  if (state.s === 'gen_video') {
    const info = VSTAGE[state.stage] ?? VSTAGE.queued;
    const idx  = PIPELINE.indexOf(state.stage as typeof PIPELINE[number]);
    return (
      <div style={{ ...card, padding: 24 }}>
        {/* Pipeline bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {PIPELINE.map((step, i) => {
            const done   = idx > i;
            const active = idx === i;
            return (
              <div key={step} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{
                  height: 3, borderRadius: 2, transition: 'background .4s',
                  background: done ? '#a78bfa' : active ? 'rgba(167,139,250,.5)' : 'rgba(255,255,255,.06)',
                }} />
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '.06em',
                  color: done ? '#a78bfa' : active ? '#e5e7eb' : '#374151',
                }}>
                  {VSTAGE[step].label}
                </span>
              </div>
            );
          })}
        </div>
        {/* Status row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
            background: '#a78bfa',
            animation: 'cs-pulse 1.5s ease-in-out infinite',
          }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0 }}>{info.label}</p>
            {info.sub && <p style={{ color: '#6b7280', fontSize: 12, margin: '2px 0 0' }}>{info.sub}</p>}
          </div>
          <span style={{ color: '#374151', fontSize: 12, fontFamily: 'monospace', flexShrink: 0 }}>
            {fmtTime(elapsed)}
          </span>
        </div>
      </div>
    );
  }

  // Generating copy
  if (state.s === 'gen_copy') return (
    <div style={{ ...card, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: '#a78bfa',
          animation: 'cs-dot 1.2s ease-in-out infinite',
        }} />
        <span style={{ color: '#a78bfa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Writing · {fmtTime(elapsed)}
        </span>
      </div>
      <pre style={{
        color: '#9ca3af', fontSize: 13, lineHeight: 1.7,
        whiteSpace: 'pre-wrap', fontFamily: 'inherit',
        margin: 0, minHeight: 60,
      }}>{state.partial || '…'}</pre>
    </div>
  );

  // Done: image
  if (state.s === 'done_image') return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <img
        src={state.url}
        alt={state.prompt}
        style={{ width: '100%', display: 'block', maxHeight: 600, objectFit: 'contain' }}
      />
      <div style={{ display: 'flex', gap: 8, padding: 12 }}>
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...btnBase, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          ↓ Open / Download
        </a>
        <button onClick={onReset} style={btnBase}>↺ Generate New</button>
      </div>
    </div>
  );

  // Done: video
  if (state.s === 'done_video') return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <video
        src={state.url}
        controls autoPlay loop
        style={{ width: '100%', display: 'block', maxHeight: 600, background: '#000' }}
      />
      <div style={{ display: 'flex', gap: 8, padding: 12 }}>
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...btnBase, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          ↓ Open / Download
        </a>
        <button onClick={onReset} style={btnBase}>↺ Generate New</button>
      </div>
    </div>
  );

  // Done: copy
  if (state.s === 'done_copy') return (
    <div style={{ ...card, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ color: '#a78bfa', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em' }}>
          Generated Ad Copy
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigator.clipboard.writeText(state.text)} style={btnBase}>
            Copy All
          </button>
          <button onClick={onReset} style={btnBase}>↺ New</button>
        </div>
      </div>
      <pre style={{
        color: '#e5e7eb', fontSize: 13, lineHeight: 1.7,
        whiteSpace: 'pre-wrap', fontFamily: 'inherit',
        margin: 0, padding: '14px 16px',
        background: 'rgba(0,0,0,.2)',
        border: '1px solid rgba(255,255,255,.05)',
        borderRadius: 6,
      }}>{state.text}</pre>
    </div>
  );

  // Error
  if (state.s === 'error') return (
    <div style={{
      ...card, padding: 20,
      border: '1px solid rgba(239,68,68,.3)',
      background: 'rgba(239,68,68,.04)',
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
        <div style={{ flex: 1 }}>
          <p style={{ color: '#f87171', fontWeight: 700, fontSize: 14, margin: 0 }}>Generation Failed</p>
          <p style={{
            color: '#9ca3af', fontSize: 12, margin: '6px 0 0',
            fontFamily: 'monospace', wordBreak: 'break-all',
            background: 'rgba(0,0,0,.2)', padding: '8px 10px', borderRadius: 4,
          }}>{state.msg}</p>
        </div>
      </div>
      <button
        onClick={onReset}
        style={{ ...btnBase, color: '#f87171', border: '1px solid rgba(239,68,68,.3)' }}
      >
        ↺ Try Again
      </button>
    </div>
  );

  return null;
};
