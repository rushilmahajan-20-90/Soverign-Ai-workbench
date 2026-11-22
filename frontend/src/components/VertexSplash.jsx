import { useEffect, useState } from 'react';
import { ShieldCheck, UserCheck, Lock } from 'lucide-react';

const VERTEX_CHARS = ['V', 'E', 'R', 'T', 'E', 'X'];
const SUBTITLE_WORDS = ['SOVEREIGN', 'AI', 'WORKBENCH'];

export default function VertexSplash({ user, workspace, onComplete }) {
  const [visibleLetters, setVisibleLetters] = useState(0);
  const [visibleWords, setVisibleWords] = useState(0);
  const [showStatus, setShowStatus] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Letter by letter sequential reveal: V -> E -> R -> T -> E -> X
    const letterTimers = VERTEX_CHARS.map((_, i) =>
      setTimeout(() => {
        setVisibleLetters(i + 1);
      }, 150 + i * 110)
    );

    // Word by word sequential reveal for subtitle: SOVEREIGN -> AI -> WORKBENCH
    const wordTimers = SUBTITLE_WORDS.map((_, i) =>
      setTimeout(() => {
        setVisibleWords(i + 1);
      }, 880 + i * 150)
    );

    // Show credential status and verified badge
    const statusTimer = setTimeout(() => {
      setShowStatus(true);
    }, 1380);

    // Exit transition
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, 2000);

    // Complete callback
    const doneTimer = setTimeout(() => {
      onComplete?.();
    }, 2350);

    return () => {
      letterTimers.forEach(clearTimeout);
      wordTimers.forEach(clearTimeout);
      clearTimeout(statusTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  const isAdmin = user?.role === 'Administrator';
  const orgName = workspace?.org_name || 'Vertex Enterprise';
  const displayName = user?.display_name || user?.username || 'Authenticated User';

  return (
    <div className={`vertex-scene-overlay ${isExiting ? 'exit-fade' : ''}`}>
      {/* 100% Pure Black Void - No background textures or gray tints */}

      <div className="vertex-center-stage">
        {/* Animated Central Emblem */}
        <div className="vertex-emblem-box">
          <svg className="vertex-prism-svg" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="laserGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="50%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
              <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Rotating Outer Hexagon */}
            <polygon
              points="60,12 100,34 100,86 60,108 20,86 20,34"
              stroke="rgba(255, 255, 255, 0.25)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              className="vertex-svg-hex"
            />

            {/* Inner Glowing Chevron */}
            <path
              d="M34 42 L60 90 L86 42"
              stroke="url(#laserGrad)"
              strokeWidth="5.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#neonGlow)"
              className="vertex-svg-chevron"
            />

            {/* Center Light Core */}
            <circle cx="60" cy="60" r="4.5" fill="#ffffff" className="vertex-quantum-core" />
          </svg>
        </div>

        {/* Word-by-Word / Letter-by-Letter Brand Reveal */}
        <div className="vertex-brand-reveal-zone">
          {/* VERTEX: Reveals letter by letter with shining flashes */}
          <div className="vertex-letters-row" aria-label="VERTEX">
            {VERTEX_CHARS.map((char, index) => {
              const isVisible = index < visibleLetters;
              const isJustRevealed = index === visibleLetters - 1;
              return (
                <span
                  key={index}
                  className={`vertex-char ${isVisible ? 'char-visible' : 'char-hidden'} ${isJustRevealed ? 'char-active' : ''}`}
                >
                  {char}
                </span>
              );
            })}
          </div>

          {/* Subtitle: Reveals word by word */}
          <div className="vertex-words-row">
            {SUBTITLE_WORDS.map((word, index) => {
              const isVisible = index < visibleWords;
              return (
                <span
                  key={index}
                  className={`vertex-word ${isVisible ? 'word-visible' : 'word-hidden'}`}
                >
                  {word}
                </span>
              );
            })}
          </div>
        </div>

        {/* Laser Progress Beam */}
        <div className="vertex-laser-track">
          <div
            className="vertex-laser-fill"
            style={{
              width: `${Math.min(100, (visibleLetters / VERTEX_CHARS.length) * 50 + (visibleWords / SUBTITLE_WORDS.length) * 50)}%`,
            }}
          />
        </div>

        {/* Credential Status & Identity Seal */}
        <div className={`vertex-credentials-card ${showStatus ? 'status-visible' : 'status-hidden'}`}>
          <div className={`vertex-access-pill ${isAdmin ? 'admin-glow' : 'member-glow'}`}>
            {isAdmin ? (
              <>
                <ShieldCheck size={14} className="pill-icon" />
                <span className="pill-role">ADMINISTRATOR</span>
                <span className="pill-scope">CONSOLE ACCESS</span>
              </>
            ) : (
              <>
                <UserCheck size={14} className="pill-icon" />
                <span className="pill-role">MEMBER</span>
                <span className="pill-scope">WORKSPACE ACCESS</span>
              </>
            )}
          </div>

          <div className="vertex-user-signature">
            <span className="sig-name">{displayName}</span>
            <span className="sig-divider">•</span>
            <span className="sig-org">{orgName}</span>
          </div>

          <div className="vertex-bottom-guarantee">
            <Lock size={11} className="lock-icon" />
            <span>100% LOCAL AIR-GAPPED ENVIRONMENT</span>
          </div>
        </div>
      </div>
    </div>
  );
}
