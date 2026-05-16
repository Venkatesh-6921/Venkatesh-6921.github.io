'use strict';

/*
  mascot.js — KaizenCode GitHub Profile Mascot Engine v2
  ──────────────────────────────────────────────────────
  Sprite-based animation engine + live GitHub API + activity-driven emotions.

  Architecture:
  - 10 sprite sheets (6 frames each, 32x32 per frame, 192x32 strip)
  - Canvas renderer at 140px (32px base × 4.375 upscale, pixelated)
  - GitHub API fetches repos, computes activity scores, drives emotions
  - Activity tiers: high (80+), mid (50-79), low (20-49), stale (0-19)
*/

// ═══════════════════════════════════════════════════════
//  EMOTION REGISTRY — sprite sheets + config
// ═══════════════════════════════════════════════════════
const EMOTIONS = {
  wave: {
    sprite: 'assets/mascot/wave-sprite.png',
    frames: 6,
    fps: 8,
    msg: "Hey! Welcome to my profile 👋",
    msgDuration: 4000,
    loop: 'sway',
  },
  excited: {
    sprite: 'assets/mascot/excited-sprite.png',
    frames: 6,
    fps: 12,
    msg: "THIS one! My best project! ⚡",
    msgDuration: 0,
    loop: 'jump',
  },
  happy: {
    sprite: 'assets/mascot/happy-sprite.png',
    frames: 6,
    fps: 8,
    msg: "Nice! I worked hard on this 🎉",
    msgDuration: 3000,
    loop: 'bob',
  },
  happy_alt: {
    sprite: 'assets/mascot/happy_alt-sprite.png',
    frames: 6,
    fps: 8,
    msg: "Yeah, this one's pretty cool too! 😄",
    msgDuration: 2500,
    loop: 'bob',
  },
  curious: {
    sprite: 'assets/mascot/curious-sprite.png',
    frames: 6,
    fps: 6,
    msg: "Hmm... exploring? 🔍",
    msgDuration: 3000,
    loop: 'tilt',
  },
  disappointed: {
    sprite: 'assets/mascot/disappointed-sprite.png',
    frames: 6,
    fps: 5,
    msg: "Oh... this one needs more love 😅",
    msgDuration: 3000,
    loop: 'droop',
  },
  coding: {
    sprite: 'assets/mascot/coding-sprite.png',
    frames: 6,
    fps: 8,
    msg: "Back to coding... 💻",
    msgDuration: 2500,
    loop: 'type',
  },
  neutral: {
    sprite: 'assets/mascot/neutral-sprite.png',
    frames: 6,
    fps: 6,
    msg: '',
    msgDuration: 0,
    loop: 'float',
  },
  relaxed: {
    sprite: 'assets/mascot/relaxed-sprite.png',
    frames: 6,
    fps: 4,
    msg: '',
    msgDuration: 0,
    loop: 'float',
  },
  sleeping: {
    sprite: 'assets/mascot/sleeping-sprite.png',
    frames: 6,
    fps: 4,
    msg: 'Zzz... wake me up! 💤',
    msgDuration: 3000,
    loop: 'float',
  },
};

// ═══════════════════════════════════════════════════════
//  SPRITE RENDERER — draws animated frames on canvas
// ═══════════════════════════════════════════════════════
const canvas = () => document.getElementById('mascot-canvas');
let spriteImg = null;
let currentFrame = 0;
let frameTimer = null;
let spriteReady = false;
let animFps = 8;
let lastFrameTime = 0;

function loadSprite(emotionName) {
  const em = EMOTIONS[emotionName];
  if (!em) return;

  const img = new Image();
  img.onload = () => {
    spriteImg = img;
    spriteReady = true;
    currentFrame = 0;
    animFps = em.fps;
    drawFrame(0);
    startAnimLoop();
  };
  img.src = em.sprite;
}

function drawFrame(frameIdx) {
  const c = canvas();
  if (!c || !spriteImg || !spriteReady) return;
  const ctx = c.getContext('2d');
  const em = EMOTIONS[currentEmotion] || EMOTIONS.neutral;
  const fw = 32; // frame width in sprite
  const fh = 32; // frame height
  const sx = frameIdx * fw;

  // Clear
  ctx.clearRect(0, 0, c.width, c.height);

  // Draw sprite frame scaled up to canvas (140x140)
  // Center the 32px frame in 140px canvas: offset = (140 - 140) / 2 = 0
  // Scale: 140 / 32 = 4.375
  const scale = c.width / fw;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(spriteImg, sx, 0, fw, fh, 0, 0, c.width, c.height);
}

function startAnimLoop() {
  if (frameTimer) cancelAnimationFrame(frameTimer);

  const interval = 1000 / animFps;

  function tick(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    const elapsed = timestamp - lastFrameTime;

    if (elapsed >= interval) {
      const em = EMOTIONS[currentEmotion] || EMOTIONS.neutral;
      currentFrame = (currentFrame + 1) % em.frames;
      drawFrame(currentFrame);
      lastFrameTime = timestamp;
    }

    frameTimer = requestAnimationFrame(tick);
  }

  frameTimer = requestAnimationFrame(tick);
}

function stopAnimLoop() {
  if (frameTimer) {
    cancelAnimationFrame(frameTimer);
    frameTimer = null;
  }
}

// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
let currentEmotion  = null;
let idleLoopTween   = null;
let idleTimer       = null;
let bubbleTimer     = null;
let cardLeaveTimer  = null;
let isTransitioning = false;
let deepIdleTimer   = null;
let hoverHistory    = {};
let portfolioHealth = 50; // default mid
let repoActivities  = {}; // name -> score

// ═══════════════════════════════════════════════════════
//  ELEMENT HELPERS
// ═══════════════════════════════════════════════════════
const sh    = () => document.getElementById('mascot-shadow');
const bbl   = () => document.getElementById('speech-bubble');
const btxt  = () => document.getElementById('speech-text');

// ═══════════════════════════════════════════════════════
//  EMOTION SWAP — now uses sprite renderer
// ═══════════════════════════════════════════════════════
function setEmotion(name) {
  if (!EMOTIONS[name]) return;
  if (currentEmotion === name || isTransitioning) return;

  isTransitioning = true;
  currentEmotion  = name;
  const em = EMOTIONS[name];

  if (idleLoopTween) { idleLoopTween.kill(); idleLoopTween = null; }
  gsap.killTweensOf(canvas());

  stopAnimLoop();
  lastFrameTime = 0;

  const tl = gsap.timeline({
    onComplete:  () => { isTransitioning = false; startIdleLoop(name); },
    onInterrupt: () => { isTransitioning = false; },
  });

  tl
    .to(canvas(), {
      scale: 0.8, opacity: 0.3, scaleY: 1,
      duration: 0.10, ease: 'power2.in',
    })
    .call(() => { loadSprite(name); })
    .fromTo(canvas(),
      { scale: 0.8, opacity: 0.3, rotation: -3 },
      { scale: 1,    opacity: 1,   rotation:  0,
        duration: 0.45, ease: 'elastic.out(1.1, 0.55)' }
    )
    .to(sh(), {
      scaleX: 1, opacity: 0.35,
      duration: 0.3, ease: 'power2.out',
    }, '<0.2');

  showBubble(em.msg, em.msgDuration);
}

// ═══════════════════════════════════════════════════════
//  SPEECH BUBBLE
// ═══════════════════════════════════════════════════════
function showBubble(msg, duration) {
  clearTimeout(bubbleTimer);
  gsap.killTweensOf(bbl());

  const mobile = window.innerWidth < 768;

  if (!msg) {
    gsap.to(bbl(), {
      opacity: 0,
      ...(mobile ? {} : { x: -8, scale: 0.9 }),
      duration: 0.22, ease: 'power2.in',
      onComplete: () => {
        gsap.set(bbl(), { display: 'none', clearProps: 'x,scale' });
      },
    });
    return;
  }

  btxt().textContent = msg;

  if (mobile) {
    gsap.set(bbl(), { display: 'block', opacity: 0, clearProps: 'x,scale' });
    gsap.to(bbl(), { opacity: 1, duration: 0.3, ease: 'power2.out' });
  } else {
    gsap.set(bbl(), {
      display: 'block',
      opacity: 0,
      y: 12,
      scale: 0.82,
      transformOrigin: 'center bottom',
    });
    gsap.to(bbl(), {
      opacity: 1, y: 0, scale: 1,
      duration: 0.4, ease: 'back.out(1.6)',
    });
  }

  if (duration > 0) {
    bubbleTimer = setTimeout(() => {
      gsap.killTweensOf(bbl());
      const m = window.innerWidth < 768;
      gsap.to(bbl(), {
        opacity: 0,
        ...(m ? {} : { x: -8, scale: 0.9 }),
        duration: 0.26, ease: 'power2.in',
        onComplete: () => {
          gsap.set(bbl(), { display: 'none', clearProps: 'x,scale' });
        },
      });
    }, duration);
  }
}

// ═══════════════════════════════════════════════════════
//  BLINK ANIMATION — scaleY squash on canvas
// ═══════════════════════════════════════════════════════
let blinkTimeout = null;

function startBlinkLoop() {
  const c = canvas();
  if (!c) return;

  function scheduleBlink() {
    const delay = 2000 + Math.random() * 4000;
    blinkTimeout = setTimeout(() => {
      if (isTransitioning) { scheduleBlink(); return; }
      gsap.timeline()
        .to(c, { scaleY: 0.1, duration: 0.08, ease: 'power2.in' })
        .to(c, { scaleY: 1,   duration: 0.08, ease: 'power2.out' })
        .eventCallback('onComplete', scheduleBlink);
    }, delay);
  }
  scheduleBlink();
}

// ═══════════════════════════════════════════════════════
//  IDLE LOOP — GSAP animations on canvas element
// ═══════════════════════════════════════════════════════
function startIdleLoop(name) {
  const c = canvas();
  const shd = sh();

  gsap.set(c, { x: 0, y: 0, rotation: 0, scale: 1 });

  switch (EMOTIONS[name]?.loop) {

    case 'sway':
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(c, { rotation:  10, duration: 0.38, ease: 'power1.inOut' })
        .to(c, { rotation: -10, duration: 0.38, ease: 'power1.inOut' })
        .to(c, { rotation:   0, duration: 0.30, ease: 'power1.out'   });
      break;

    case 'jump':
      idleLoopTween = gsap.timeline({ repeat: -1, repeatDelay: 0.7 })
        .to(c, { y: -30, scale: 1.07, scaleY: 1.03, duration: 0.28, ease: 'power2.out'  })
        .to(shd, { scaleX: 0.55, opacity: 0.12, duration: 0.28 }, '<')
        .to(c, { y:   0, scale: 1,    scaleY: 1,    duration: 0.36, ease: 'bounce.out' })
        .to(shd, { scaleX: 1,    opacity: 0.35, duration: 0.20 }, '<');
      break;

    case 'bob':
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(c, { y: -10, scaleY: 1.012, duration: 0.9, ease: 'sine.inOut' })
        .to(c, { y:   0, scaleY: 1,     duration: 0.9, ease: 'sine.inOut' });
      break;

    case 'tilt':
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(c, { rotation: -7, duration: 1.4, ease: 'sine.inOut' })
        .to(c, { rotation:  7, duration: 1.4, ease: 'sine.inOut' })
        .to(c, { rotation:  0, duration: 0.8, ease: 'sine.inOut' });
      break;

    case 'droop':
      idleLoopTween = gsap.timeline({ repeat: -1, repeatDelay: 2.5 })
        .to(c, { x:  6, duration: 0.07, ease: 'none' })
        .to(c, { x: -6, duration: 0.07, ease: 'none' })
        .to(c, { x:  4, duration: 0.07, ease: 'none' })
        .to(c, { x: -4, duration: 0.07, ease: 'none' })
        .to(c, { x:  0, duration: 0.10, ease: 'none' })
        .to(c, { y: 7, rotation: -3, duration: 0.55, ease: 'power2.out'   })
        .to(c, { y: 0, rotation:  0, duration: 0.65, ease: 'power2.inOut', delay: 1.0 });
      break;

    case 'type':
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(c, { y: -4, scaleY: 1.01, duration: 0.32, ease: 'power1.inOut' })
        .to(c, { y:  0, scaleY: 1,    duration: 0.32, ease: 'power1.inOut' });
      break;

    case 'float':
    default:
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(c, { y: -9, scaleY: 1.015, duration: 2.2, ease: 'sine.inOut' })
        .to(c, { y:  0, scaleY: 1,     duration: 2.2, ease: 'sine.inOut' });
      break;
  }
}

// ═══════════════════════════════════════════════════════
//  CURSOR TRACKING
// ═══════════════════════════════════════════════════════
function initCursorTracking() {
  const wrapper = document.getElementById('mascot-col');
  if (!wrapper) return;

  const OFFSET_X = 80;
  const OFFSET_Y = -30;

  const xTo   = gsap.quickTo(wrapper, 'x',        { duration: 0.75, ease: 'power3.out' });
  const yTo   = gsap.quickTo(wrapper, 'y',        { duration: 0.75, ease: 'power3.out' });
  const rotTo = gsap.quickTo(wrapper, 'rotation', { duration: 0.95, ease: 'power2.out' });

  document.addEventListener('mousemove', (e) => {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    const dx = (e.clientX - cx) / cx;
    const dy = (e.clientY - cy) / cy;

    xTo(e.clientX + OFFSET_X);
    yTo(e.clientY + OFFSET_Y);
    rotTo(dx * 5.5);

    resetIdleTimer();
  });

  document.addEventListener('mouseleave', () => {
    setEmotion('coding');
  });

  document.addEventListener('mouseenter', () => {
    if (currentEmotion === 'coding') setEmotion('neutral');
  });
}

// ═══════════════════════════════════════════════════════
//  IDLE DETECTION
// ═══════════════════════════════════════════════════════
function resetIdleTimer() {
  clearTimeout(idleTimer);
  clearTimeout(deepIdleTimer);

  if (currentEmotion === 'sleeping') {
    setEmotion('neutral');
  }

  if (currentEmotion === 'curious') {
    currentEmotion = null;
  }

  idleTimer = setTimeout(() => {
    if (!['excited', 'happy', 'disappointed', 'coding', 'sleeping'].includes(currentEmotion)) {
      setEmotion('curious');
    }
  }, 5000);

  deepIdleTimer = setTimeout(() => {
    if (!['excited', 'happy', 'disappointed', 'coding'].includes(currentEmotion)) {
      setEmotion('sleeping');
    }
  }, 30000);
}

// ═══════════════════════════════════════════════════════
//  ACTIVITY SCORING — computes 0-100 per repo
// ═══════════════════════════════════════════════════════
function computeActivity(repo) {
  const now = Date.now();
  const pushed = repo.pushed_at ? new Date(repo.pushed_at).getTime() : 0;
  const daysSincePush = pushed ? Math.max(0, (now - pushed) / (1000 * 60 * 60 * 24)) : 999;

  // Recency score (0-40): recent = high
  const recencyScore = daysSincePush < 7 ? 40 :
                       daysSincePush < 30 ? 30 :
                       daysSincePush < 90 ? 20 :
                       daysSincePush < 180 ? 10 : 0;

  // Stars score (0-25)
  const starsScore = Math.min(25, repo.stargazers_count * 3);

  // Forks score (0-15)
  const forksScore = Math.min(15, repo.forks_count * 2);

  // Issues activity (0-10)
  const issuesScore = Math.min(10, (repo.open_issues_count || 0) * 2);

  // Size/complexity signal (0-10)
  const sizeScore = repo.size ? Math.min(10, Math.log2(repo.size + 1) * 2) : 0;

  return Math.min(100, Math.round(recencyScore + starsScore + forksScore + issuesScore + sizeScore));
}

function activityTier(score) {
  if (score >= 80) return 'best';
  if (score >= 50) return 'high';
  if (score >= 20) return 'mid';
  return 'low';
}

function activityLabel(score) {
  if (score >= 80) return '⚡';
  if (score >= 50) return '🔥';
  if (score >= 20) return '📁';
  return '💤';
}

function activityEmotion(score) {
  if (score >= 80) return 'excited';
  if (score >= 50) return 'happy';
  if (score >= 20) return 'neutral';
  return 'disappointed';
}

function activitySpeech(score, name) {
  if (score >= 80) return `THIS one is active! ⚡`;
  if (score >= 50) return `Pretty solid project! 🎉`;
  if (score >= 20) return `Nice work here 👀`;
  return `Could use some love...`;
}

function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = (now - then) / 1000;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

// Language colors
const LANG_COLORS = {
  Python: '#3572A5',
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  'Jupyter Notebook': '#DA5B0B',
  Dart: '#00B4AB',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  SCSS: '#c6538c',
};

// ═══════════════════════════════════════════════════════
//  GITHUB API — fetch repos, compute scores, render cards
// ═══════════════════════════════════════════════════════
const GITHUB_USER = 'Venkatesh-6921';
const CACHE_KEY = 'kc_github_repos';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchGitHubRepos() {
  // Check cache
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) {
        console.log('[mascot] Using cached GitHub repos');
        return data;
      }
    }
  } catch {}

  try {
    const res = await fetch(`https://api.github.com/users/${GITHUB_USER}/repos?sort=pushed&per_page=100`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Cache it
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch {}

    return data;
  } catch (err) {
    console.warn('[mascot] GitHub API failed — using fallback.', err.message);
    return null;
  }
}

// Fallback repos (used if GitHub API fails)
const FALLBACK_REPOS = [
  {
    name: 'context-diff',
    description: 'VS Code extension tracking how two devs explore a codebase + AI blindspot reports',
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    size: 500,
    pushed_at: new Date().toISOString(),
    language: 'TypeScript',
    html_url: 'https://github.com/KaizenCode/context-diff',
  },
  {
    name: 'django-fastify',
    description: 'FastAPI-style routing, DI, and OpenAPI for Django — 6,200+ lines, 29 files',
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    size: 1200,
    pushed_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    language: 'Python',
    html_url: 'https://github.com/KaizenCode/django-fastify',
  },
  {
    name: 'omniroute',
    description: 'Universal free LLM router with multi-tier complexity classifier + npm package',
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    size: 300,
    pushed_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    language: 'TypeScript',
    html_url: 'https://github.com/KaizenCode/omniroute',
  },
  {
    name: 'TubeScope',
    description: 'YouTube channel dashboard with AI summaries and download support',
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    size: 800,
    pushed_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    language: 'Python',
    html_url: 'https://github.com/KaizenCode/tubescope',
  },
  {
    name: 'PrepMind AI',
    description: 'Single-file exam prep dashboard powered by Claude API',
    stargazers_count: 0,
    forks_count: 0,
    open_issues_count: 0,
    size: 200,
    pushed_at: new Date(Date.now() - 120 * 86400000).toISOString(),
    language: 'JavaScript',
    html_url: 'https://github.com/KaizenCode/prepmind-ai',
  },
];

async function loadRepos() {
  let repos = await fetchGitHubRepos();
  if (!repos || repos.length === 0) {
    repos = FALLBACK_REPOS;
  }

  // Filter out forks, sort by activity score, take top 12
  const scored = repos
    .filter(r => !r.fork)
    .map(r => ({ ...r, activityScore: computeActivity(r) }))
    .sort((a, b) => b.activityScore - a.activityScore)
    .slice(0, 12);

  // Store activity scores for hover lookup
  repoActivities = {};
  scored.forEach(r => {
    repoActivities[r.name] = r.activityScore;
  });

  // Compute portfolio health (average of top 12)
  portfolioHealth = scored.length > 0
    ? Math.round(scored.reduce((sum, r) => sum + r.activityScore, 0) / scored.length)
    : 50;

  const grid = document.getElementById('repo-grid');

  scored.forEach((repo, i) => {
    const score = repo.activityScore;
    const tier = activityTier(score);
    const icon = activityLabel(score);
    const lang = repo.language || 'Unknown';
    const langColor = LANG_COLORS[lang] || '#8b949e';
    const updated = timeAgo(repo.pushed_at);

    const card = document.createElement('div');
    card.className = 'repo-card';
    card.dataset.tier = tier;
    card.dataset.activity = score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low';
    card.dataset.name = repo.name;
    card.setAttribute('role', 'listitem');

    card.innerHTML = `
      <div class="repo-header">
        <div class="repo-name-row">
          <span class="repo-tier-icon">${icon}</span>
          <h3>${repo.name}</h3>
        </div>
        <span class="stars" aria-label="${repo.stargazers_count} stars">★ ${repo.stargazers_count}</span>
      </div>
      <p>${repo.description || 'No description provided.'}</p>
      <div class="repo-meta">
        <span><span class="lang-dot" style="background:${langColor}"></span> ${lang}</span>
        <span>🍴 ${repo.forks_count}</span>
        <span class="updated">Updated ${updated}</span>
      </div>
      <div class="tags" aria-label="Technologies">
        <span>${lang}</span>
        ${score >= 80 ? '<span>active</span>' : ''}
        ${repo.stargazers_count > 10 ? '<span>popular</span>' : ''}
      </div>
      <a class="repo-link"
         href="${repo.html_url}"
         target="_blank"
         rel="noopener noreferrer"
         aria-label="View ${repo.name} on GitHub">
        View on GitHub →
      </a>
    `;

    // Staggered card entrance
    gsap.from(card, {
      opacity: 0, y: 32,
      duration: 0.55, ease: 'power2.out',
      delay: 0.3 + i * 0.08,
    });

    // Hover — emotion driven by activity score
    card.addEventListener('mouseenter', () => {
      clearTimeout(cardLeaveTimer);
      clearTimeout(idleTimer);
      clearTimeout(deepIdleTimer);

      hoverHistory[repo.name] = (hoverHistory[repo.name] || 0) + 1;

      const emotion = activityEmotion(score);
      const speech = activitySpeech(score, repo.name);

      // Alt variant on repeated hovers
      let finalEmotion = emotion;
      if (hoverHistory[repo.name] >= 2 && emotion === 'happy') {
        finalEmotion = 'happy_alt';
      }

      setEmotion(finalEmotion);
      // Override speech for activity context
      const em = EMOTIONS[finalEmotion];
      showBubble(speech, em.msgDuration);

      gsap.to(card, {
        y: -7,
        boxShadow: '0 12px 32px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06)',
        duration: 0.25, ease: 'power2.out',
      });
    });

    card.addEventListener('mouseleave', () => {
      gsap.to(card, {
        y: 0,
        boxShadow: '0 0px 0px rgba(0,0,0,0)',
        duration: 0.38, ease: 'power2.inOut',
      });

      cardLeaveTimer = setTimeout(() => {
        setEmotion('neutral');
      }, 600);
    });

    grid.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════════
//  FIRST-VISIT GREETING SEQUENCE
// ═══════════════════════════════════════════════════════
function runGreetingSequence() {
  const arrow = document.getElementById('pointer-pill');

  gsap.timeline()

    .from('#mascot-col', {
      opacity: 0, scale: 0.55,
      duration: 1.15,
      ease: 'elastic.out(1, 0.5)',
      onStart: () => {
        currentEmotion = 'wave';
        showBubble(EMOTIONS.wave.msg, EMOTIONS.wave.msgDuration);
      },
      onComplete: () => {
        isTransitioning = false;
        startIdleLoop('wave');
      },
    })

    .call(() => {
      setEmotion('excited');

      const bestCard = document.querySelector('[data-tier="best"]');
      if (!bestCard) return;

      const rect = bestCard.getBoundingClientRect();
      arrow.style.left = (rect.left + window.scrollX) + 'px';
      arrow.style.top  = (rect.top  + window.scrollY - 46) + 'px';

      gsap.set(arrow, { display: 'flex', opacity: 0, x: 0 });

      gsap.timeline()
        .to(arrow, { opacity: 1, duration: 0.35, ease: 'back.out(1.6)' })
        .to(arrow, {
          x: 16, duration: 0.55,
          repeat: 9, yoyo: true, ease: 'power1.inOut',
        })
        .to(arrow, {
          opacity: 0, duration: 0.3,
          onComplete: () => gsap.set(arrow, { display: 'none', x: 0 }),
        });

      bestCard.addEventListener('mouseenter', () => {
        gsap.to(arrow, {
          opacity: 0, y: -10, duration: 0.2,
          onComplete: () => gsap.set(arrow, { display: 'none', x: 0, y: 0 }),
        });
      }, { once: true });

    }, [], 4.5)

    .call(() => {
      if (currentEmotion === 'excited') setEmotion('neutral');
    }, [], 10);
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {

  // Preload all sprite images
  Object.values(EMOTIONS).forEach(({ sprite }) => {
    const p = new Image();
    p.src = sprite;
  });

  await loadRepos();
  initCursorTracking();
  startBlinkLoop();

  // Set initial emotion based on portfolio health
  const initialEmotion = activityEmotion(portfolioHealth);
  loadSprite(initialEmotion);
  currentEmotion = initialEmotion;

  if (!sessionStorage.getItem('kc_visited')) {
    sessionStorage.setItem('kc_visited', '1');
    runGreetingSequence();
  } else {
    gsap.from('#mascot-col', {
      opacity: 0, scale: 0.85,
      duration: 0.8, ease: 'power3.out',
      onComplete: () => {
        currentEmotion = 'wave';
        showBubble(EMOTIONS.wave.msg, EMOTIONS.wave.msgDuration);
        startIdleLoop('wave');
        setTimeout(() => setEmotion('neutral'), 3200);
      },
    });
  }
});