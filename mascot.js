'use strict';

/*
  mascot.js — KaizenCode GitHub Profile Mascot Engine
  ────────────────────────────────────────────────────
  All 10 bugs fixed. Each fix is labelled inline.

  BUG SUMMARY:
  #1  isTransitioning permanent lock — added onInterrupt callback
  #2  sway loop finite (repeat:6) — changed to repeat:-1
  #3  || true dead condition in mouseleave — removed, fixed logic
  #4  Shadow sibling of wrapper — moved inside wrapper in HTML
  #5  Pointer pill wrong GSAP x/y positioning — use style.left/top
  #6  setEmotion('wave') during entrance jitters — skip swap on init
  #7  fetch no try-catch — wrapped with hardcoded fallback
  #8  Mobile bubble CSS vs GSAP transform conflict — isMobile branch
  #9  No killTweensOf on bubble — added at top of showBubble()
  #10 Cross-card leave timer not shared — added cardLeaveTimer state
*/

// ═══════════════════════════════════════════════════════
//  EMOTION REGISTRY
// ═══════════════════════════════════════════════════════
const EMOTIONS = {
  wave: {
    img: 'assets/mascot/wave.png',
    msg: "Hey! Welcome to my profile 👋",
    msgDuration: 4000,
    loop: 'sway',
  },
  excited: {
    img: 'assets/mascot/excited.png',
    msg: "THIS one! My best project! ⚡",
    msgDuration: 0,   // 0 = stays until next emotion fires
    loop: 'jump',
  },
  happy: {
    img: 'assets/mascot/happy.png',
    msg: "Nice! I worked hard on this 🎉",
    msgDuration: 3000,
    loop: 'bob',
  },
  curious: {
    img: 'assets/mascot/curious.png',
    msg: "Hmm... exploring? 🔍",
    msgDuration: 3000,
    loop: 'tilt',
  },
  disappointed: {
    img: 'assets/mascot/disappointed.png',
    msg: "Oh... this one needs more love 😅",
    msgDuration: 3000,
    loop: 'droop',
  },
  coding: {
    img: 'assets/mascot/coding.png',
    msg: "Back to coding... 💻",
    msgDuration: 2500,
    loop: 'type',
  },
  neutral: {
    img: 'assets/mascot/neutral.png',
    msg: '',
    msgDuration: 0,
    loop: 'float',
  },
};

// Hardcoded fallback repos (used if data/repos.json fails to load — FIX #7)
const FALLBACK_REPOS = [
  {
    name: 'context-diff',
    description: 'VS Code extension tracking how two devs explore a codebase + AI blindspot reports',
    stars: 0,
    url: 'https://github.com/KaizenCode/context-diff',
    tags: ['TypeScript', 'FastAPI', 'React'],
    tier: 'best',
  },
  {
    name: 'django-fastify',
    description: 'FastAPI-style routing, DI, and OpenAPI for Django — 6,200+ lines, 29 files',
    stars: 0,
    url: 'https://github.com/KaizenCode/django-fastify',
    tags: ['Python', 'Django', 'PyPI'],
    tier: 'high',
  },
  {
    name: 'omniroute',
    description: 'Universal free LLM router with multi-tier complexity classifier + npm package',
    stars: 0,
    url: 'https://github.com/KaizenCode/omniroute',
    tags: ['TypeScript', 'npm', 'LLM'],
    tier: 'high',
  },
  {
    name: 'TubeScope',
    description: 'YouTube channel dashboard with AI summaries and download support',
    stars: 0,
    url: 'https://github.com/KaizenCode/tubescope',
    tags: ['FastAPI', 'yt-dlp', 'OpenRouter'],
    tier: 'high',
  },
  {
    name: 'PrepMind AI',
    description: 'Single-file exam prep dashboard powered by Claude API',
    stars: 0,
    url: 'https://github.com/KaizenCode/prepmind-ai',
    tags: ['Vanilla JS', 'Claude API'],
    tier: 'low',
  },
];

// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
let currentEmotion  = null;
let idleLoopTween   = null;
let idleTimer       = null;
let bubbleTimer     = null;
let cardLeaveTimer  = null;   // FIX #3 & #10 — shared across ALL cards
let isTransitioning = false;

// ═══════════════════════════════════════════════════════
//  ELEMENT HELPERS  (called as functions to avoid
//  caching stale references before DOMContentLoaded)
// ═══════════════════════════════════════════════════════
const el    = () => document.getElementById('mascot-img');
const sh    = () => document.getElementById('mascot-shadow');
const bbl   = () => document.getElementById('speech-bubble');
const btxt  = () => document.getElementById('speech-text');

// ═══════════════════════════════════════════════════════
//  EMOTION SWAP
// ═══════════════════════════════════════════════════════
function setEmotion(name) {
  if (!EMOTIONS[name]) return;                          // guard unknown name
  if (currentEmotion === name || isTransitioning) return;

  isTransitioning = true;
  currentEmotion  = name;
  const em = EMOTIONS[name];

  // Kill current idle loop and any in-progress tween on mascot image
  if (idleLoopTween) { idleLoopTween.kill(); idleLoopTween = null; }
  gsap.killTweensOf(el());

  const tl = gsap.timeline({
    onComplete:  () => { isTransitioning = false; startIdleLoop(name); },
    // FIX #1: if this timeline is ever killed externally the lock resets
    onInterrupt: () => { isTransitioning = false; },
  });

  tl
    // 1. Exit — shrink + fade out
    .to(el(), {
      scale: 0.75, opacity: 0,
      duration: 0.14, ease: 'power2.in',
    })
    // 2. Swap src while invisible (no flicker)
    .call(() => { el().src = em.img; })
    // 3. Enter — elastic overshoot pop
    .fromTo(el(),
      { scale: 0.75, opacity: 0, rotation: -4 },
      { scale: 1,    opacity: 1, rotation:  0,
        duration: 0.5, ease: 'elastic.out(1.1, 0.55)' }
    )
    // Shadow pulses in sync, offset slightly behind for realism
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
  gsap.killTweensOf(bbl());   // FIX #9 — prevent tween stacking on fast swaps

  // FIX #8 — detect mobile ONCE per call to avoid repeated reflows
  const mobile = window.innerWidth < 768;

  if (!msg) {
    // Dismiss: hide with fade (+ slide on desktop)
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
    // FIX #8 — mobile: ONLY animate opacity.
    // CSS positions bubble above mascot via transform:translateX(-50%).
    // Any GSAP x/scale would overwrite that CSS transform and break layout.
    gsap.set(bbl(), { display: 'block', opacity: 0, clearProps: 'x,scale' });
    gsap.to(bbl(), { opacity: 1, duration: 0.3, ease: 'power2.out' });
  } else {
    // Desktop: slide in from left with scale overshoot
    gsap.set(bbl(), {
      display: 'block',
      opacity: 0,
      x: -14,
      scale: 0.86,
      transformOrigin: 'left center',
    });
    gsap.to(bbl(), {
      opacity: 1, x: 0, scale: 1,
      duration: 0.38, ease: 'back.out(1.5)',
    });
  }

  if (duration > 0) {
    bubbleTimer = setTimeout(() => {
      gsap.killTweensOf(bbl());   // kill any in-flight tween before dismiss
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
//  IDLE LOOP — personality animation per emotion
// ═══════════════════════════════════════════════════════
function startIdleLoop(name) {
  const img = el();
  const shd = sh();

  // Clean slate before starting a new loop
  gsap.set(img, { x: 0, y: 0, rotation: 0, scale: 1 });

  switch (EMOTIONS[name]?.loop) {

    // SWAY — gentle left-right rock (wave greeting)
    // FIX #2: was repeat:6 (finite). Changed to repeat:-1 so mascot
    //         doesn't freeze after 6 cycles.
    case 'sway':
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(img, { rotation:  10, duration: 0.38, ease: 'power1.inOut' })
        .to(img, { rotation: -10, duration: 0.38, ease: 'power1.inOut' })
        .to(img, { rotation:   0, duration: 0.30, ease: 'power1.out'   });
      break;

    // JUMP — excited bounce with shadow compression
    // Shadow shrinks on ascent, expands on landing = grounded realism
    case 'jump':
      idleLoopTween = gsap.timeline({ repeat: -1, repeatDelay: 0.7 })
        .to(img, { y: -30, scale: 1.07, duration: 0.28, ease: 'power2.out'  })
        .to(shd, { scaleX: 0.55, opacity: 0.12, duration: 0.28 }, '<')
        .to(img, { y:   0, scale: 1,    duration: 0.36, ease: 'bounce.out' })
        .to(shd, { scaleX: 1,    opacity: 0.35, duration: 0.20 }, '<');
      break;

    // BOB — smooth happy float
    case 'bob':
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(img, { y: -10, duration: 0.9, ease: 'sine.inOut' })
        .to(img, { y:   0, duration: 0.9, ease: 'sine.inOut' });
      break;

    // TILT — slow curious head rock
    case 'tilt':
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(img, { rotation: -7, duration: 1.4, ease: 'sine.inOut' })
        .to(img, { rotation:  7, duration: 1.4, ease: 'sine.inOut' })
        .to(img, { rotation:  0, duration: 0.8, ease: 'sine.inOut' });
      break;

    // DROOP — frustrated shake then resigned sag
    case 'droop':
      idleLoopTween = gsap.timeline({ repeat: -1, repeatDelay: 2.5 })
        .to(img, { x:  6, duration: 0.07, ease: 'none' })
        .to(img, { x: -6, duration: 0.07, ease: 'none' })
        .to(img, { x:  4, duration: 0.07, ease: 'none' })
        .to(img, { x: -4, duration: 0.07, ease: 'none' })
        .to(img, { x:  0, duration: 0.10, ease: 'none' })
        .to(img, { y: 7, rotation: -3, duration: 0.55, ease: 'power2.out'   })
        .to(img, { y: 0, rotation:  0, duration: 0.65, ease: 'power2.inOut', delay: 1.0 });
      break;

    // TYPE — subtle rhythmic bob while coding
    case 'type':
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(img, { y: -4, duration: 0.32, ease: 'power1.inOut' })
        .to(img, { y:  0, duration: 0.32, ease: 'power1.inOut' });
      break;

    // FLOAT — slow levitate for neutral/default state
    case 'float':
    default:
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(img, { y: -9, duration: 2.2, ease: 'sine.inOut' })
        .to(img, { y:  0, duration: 2.2, ease: 'sine.inOut' });
      break;
  }
}

// ═══════════════════════════════════════════════════════
//  CURSOR TRACKING — gsap.quickTo()
//  Pre-compiled functions called thousands of times per
//  second on mousemove with zero overhead.
// ═══════════════════════════════════════════════════════
function initCursorTracking() {
  const wrapper = document.getElementById('mascot-wrapper');

  const xTo   = gsap.quickTo(wrapper, 'x',        { duration: 0.75, ease: 'power3.out' });
  const yTo   = gsap.quickTo(wrapper, 'y',        { duration: 0.75, ease: 'power3.out' });
  const rotTo = gsap.quickTo(wrapper, 'rotation', { duration: 0.95, ease: 'power2.out' });

  document.addEventListener('mousemove', (e) => {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    // Normalise to -1..+1 relative to screen centre
    const dx = (e.clientX - cx) / cx;
    const dy = (e.clientY - cy) / cy;

    xTo(dx * 20);       // max 20px horizontal lean
    yTo(dy * 11);       // max 11px vertical lean
    rotTo(dx * 5.5);    // max 5.5° tilt

    resetIdleTimer();
  });

  document.addEventListener('mouseleave', () => {
    // Reset lean when cursor exits browser window
    xTo(0); yTo(0); rotTo(0);
    setEmotion('coding');
  });

  document.addEventListener('mouseenter', () => {
    setEmotion('neutral');
  });
}

// ═══════════════════════════════════════════════════════
//  IDLE DETECTION
// ═══════════════════════════════════════════════════════
function resetIdleTimer() {
  clearTimeout(idleTimer);

  // Allow re-triggering curious after it's already shown
  if (currentEmotion === 'curious') {
    currentEmotion = null;
  }

  idleTimer = setTimeout(() => {
    // Don't interrupt a repo-hover or leave-window state
    if (!['excited', 'happy', 'disappointed', 'coding'].includes(currentEmotion)) {
      setEmotion('curious');
    }
  }, 5000);
}

// ═══════════════════════════════════════════════════════
//  FIRST-VISIT GREETING SEQUENCE
// ═══════════════════════════════════════════════════════
function runGreetingSequence() {
  const arrow = document.getElementById('pointer-pill');

  gsap.timeline()

    // Elastic bounce-in entrance from below
    .from('#mascot-wrapper', {
      y: 90, opacity: 0, scale: 0.55,
      duration: 1.15,
      ease: 'elastic.out(1, 0.5)',
      // FIX #6: set wave state DIRECTLY inside the entrance animation.
      // The img src is already wave.png so we must NOT call setEmotion('wave')
      // (which would scale-down → swap same file → pop = pointless jitter).
      // Instead we manually initialise state and start the idle loop.
      onStart: () => {
        currentEmotion = 'wave';
        showBubble(EMOTIONS.wave.msg, EMOTIONS.wave.msgDuration);
      },
      onComplete: () => {
        isTransitioning = false;
        startIdleLoop('wave');
      },
    })

    // t = 4.5s — switch to excited + show pointer pill
    .call(() => {
      setEmotion('excited');

      const bestCard = document.querySelector('[data-tier="best"]');
      if (!bestCard) return;

      // FIX #5: position pill using style.left / style.top anchored in
      // document space (getBoundingClientRect + scrollY).
      // GSAP's x is a translateX — a relative bounce offset on top of
      // the CSS left position. This is correct.
      // Old code used gsap.set(arrow, { x: rect.left, y: rect.top + scrollY })
      // which stacked transforms onto default top:0, left:0, placing the pill
      // at the wrong screen position on most layouts.
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

      // Dismiss pill early if visitor reaches the best card
      bestCard.addEventListener('mouseenter', () => {
        gsap.to(arrow, {
          opacity: 0, y: -10, duration: 0.2,
          onComplete: () => gsap.set(arrow, { display: 'none', x: 0, y: 0 }),
        });
      }, { once: true });

    }, [], 4.5)

    // t = 10s — settle to neutral if visitor hasn't interacted
    .call(() => {
      if (currentEmotion === 'excited') setEmotion('neutral');
    }, [], 10);
}

// ═══════════════════════════════════════════════════════
//  REPO CARDS
// ═══════════════════════════════════════════════════════
async function loadRepos() {
  let repos;

  // FIX #7: try-catch so a missing/malformed repos.json never
  // kills the page. Mascot and cursor tracking still initialise.
  try {
    const res = await fetch('data/repos.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    repos = await res.json();
  } catch (err) {
    console.warn('[mascot] repos.json failed — using fallback data.', err.message);
    repos = FALLBACK_REPOS;
  }

  const grid = document.getElementById('repo-grid');

  repos.forEach((repo, i) => {
    const card = document.createElement('div');
    card.className    = 'repo-card';
    card.dataset.tier = repo.tier;
    card.setAttribute('role', 'listitem');
    card.innerHTML = `
      <div class="repo-header">
        <h3 class="mono">${repo.name}</h3>
        <span class="stars" aria-label="${repo.stars} stars">⭐ ${repo.stars}</span>
      </div>
      <p>${repo.description}</p>
      <div class="tags" aria-label="Technologies">
        ${repo.tags.map(t => `<span>${t}</span>`).join('')}
      </div>
      <a class="repo-link"
         href="${repo.url}"
         target="_blank"
         rel="noopener noreferrer"
         aria-label="View ${repo.name} on GitHub">
        View on GitHub →
      </a>
    `;

    // Staggered card entrance (starts slightly after hero)
    gsap.from(card, {
      opacity: 0, y: 32,
      duration: 0.55, ease: 'power2.out',
      delay: 0.3 + i * 0.08,
    });

    card.addEventListener('mouseenter', () => {
      // FIX #10: clear the shared leave timer so hovering card B
      // immediately after card A doesn't get neutral fired 600ms later
      clearTimeout(cardLeaveTimer);
      clearTimeout(idleTimer);

      if (repo.tier === 'best')      setEmotion('excited');
      else if (repo.tier === 'high') setEmotion('happy');
      else                           setEmotion('disappointed');

      gsap.to(card, {
        y: -7,
        boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
        duration: 0.25, ease: 'power2.out',
      });
    });

    card.addEventListener('mouseleave', () => {
      gsap.to(card, {
        y: 0,
        boxShadow: '0 0px 0px rgba(0,0,0,0)',
        duration: 0.38, ease: 'power2.inOut',
      });

      // FIX #3: was `|| true` making the condition always true.
      // FIX #10: use shared cardLeaveTimer — only the LAST card
      //          to fire mouseleave actually triggers neutral.
      cardLeaveTimer = setTimeout(() => {
        setEmotion('neutral');
      }, 600);
    });

    grid.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {

  // Preload all emotion images silently in background so
  // first swap has zero delay
  Object.values(EMOTIONS).forEach(({ img }) => {
    const p = new Image();
    p.src = img;
  });

  // loadRepos is wrapped in try-catch (FIX #7) so this await is safe
  await loadRepos();
  initCursorTracking();

  if (!sessionStorage.getItem('kc_visited')) {
    sessionStorage.setItem('kc_visited', '1');
    runGreetingSequence();
  } else {
    // Return visit — quick entrance, short wave, then settle
    gsap.from('#mascot-wrapper', {
      y: 40, opacity: 0,
      duration: 0.8, ease: 'power3.out',
      onComplete: () => {
        // FIX #6: same direct-state init as greeting sequence —
        // no swap animation since img is already wave.png
        currentEmotion = 'wave';
        showBubble(EMOTIONS.wave.msg, EMOTIONS.wave.msgDuration);
        startIdleLoop('wave');
        setTimeout(() => setEmotion('neutral'), 3200);
      },
    });
  }
});
