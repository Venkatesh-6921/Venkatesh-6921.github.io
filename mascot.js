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
  happy_alt: {
    img: 'assets/mascot/happy_alt.png',
    msg: "Yeah, this one's pretty cool too! 😄",
    msgDuration: 2500,
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
  relaxed: {
    img: 'assets/mascot/relaxed.png',
    msg: '',
    msgDuration: 0,
    loop: 'float',
  },
  sleeping: {
    img: 'assets/mascot/sleeping.png',
    msg: 'Zzz... wake me up! 💤',
    msgDuration: 3000,
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
let deepIdleTimer   = null;   // triggers sleeping after 30s of inactivity
let hoverHistory    = {};     // tracks consecutive hovers per card for alt variants

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
    // 1. Exit — shrink + fade to 30% (crossfade overlap, not full blackout)
    .to(el(), {
      scale: 0.8, opacity: 0.3, scaleY: 1,
      duration: 0.10, ease: 'power2.in',
    })
    // 2. Swap src while semi-transparent (soft crossfade, no hard cut)
    .call(() => { el().src = em.img; })
    // 3. Enter — elastic overshoot pop from semi-visible
    .fromTo(el(),
      { scale: 0.8, opacity: 0.3, rotation: -3 },
      { scale: 1,    opacity: 1,   rotation:  0,
        duration: 0.45, ease: 'elastic.out(1.1, 0.55)' }
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
    // Desktop: pop up from below with elastic overshoot
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
//  BLINK ANIMATION — random interval, scaleY squash
// ═══════════════════════════════════════════════════════
let blinkTimeout = null;

function startBlinkLoop() {
  const img = el();
  if (!img) return;

  function scheduleBlink() {
    const delay = 2000 + Math.random() * 4000; // 2–6s random
    blinkTimeout = setTimeout(() => {
      if (isTransitioning) { scheduleBlink(); return; }
      gsap.timeline()
        .to(img, { scaleY: 0.1, duration: 0.08, ease: 'power2.in' })
        .to(img, { scaleY: 1,   duration: 0.08, ease: 'power2.out' })
        .eventCallback('onComplete', scheduleBlink);
    }, delay);
  }
  scheduleBlink();
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

    // JUMP — excited bounce with shadow compression + breathing
    // Shadow shrinks on ascent, expands on landing = grounded realism
    case 'jump':
      idleLoopTween = gsap.timeline({ repeat: -1, repeatDelay: 0.7 })
        .to(img, { y: -30, scale: 1.07, scaleY: 1.03, duration: 0.28, ease: 'power2.out'  })
        .to(shd, { scaleX: 0.55, opacity: 0.12, duration: 0.28 }, '<')
        .to(img, { y:   0, scale: 1,    scaleY: 1,    duration: 0.36, ease: 'bounce.out' })
        .to(shd, { scaleX: 1,    opacity: 0.35, duration: 0.20 }, '<');
      break;

    // BOB — smooth happy float with breathing
    case 'bob':
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(img, { y: -10, scaleY: 1.012, duration: 0.9, ease: 'sine.inOut' })
        .to(img, { y:   0, scaleY: 1,     duration: 0.9, ease: 'sine.inOut' });
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

    // TYPE — subtle rhythmic bob while coding + breathing
    case 'type':
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(img, { y: -4, scaleY: 1.01, duration: 0.32, ease: 'power1.inOut' })
        .to(img, { y:  0, scaleY: 1,    duration: 0.32, ease: 'power1.inOut' });
      break;

    // FLOAT — slow levitate for neutral/default state
    case 'float':
    default:
      idleLoopTween = gsap.timeline({ repeat: -1 })
        .to(img, { y: -9, scaleY: 1.015, duration: 2.2, ease: 'sine.inOut' })
        .to(img, { y:  0, scaleY: 1,     duration: 2.2, ease: 'sine.inOut' });
      break;
  }
}

// ═══════════════════════════════════════════════════════
//  CURSOR TRACKING — mascot follows cursor via gsap.quickTo()
//  Mascot is position:fixed, offset +80px right / -30px up from cursor.
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

  // Wake up from sleeping if any interaction occurs
  if (currentEmotion === 'sleeping') {
    setEmotion('neutral');
  }

  // Allow re-triggering curious after it's already shown
  if (currentEmotion === 'curious') {
    currentEmotion = null;
  }

  idleTimer = setTimeout(() => {
    // Don't interrupt a repo-hover or leave-window state
    if (!['excited', 'happy', 'disappointed', 'coding', 'sleeping'].includes(currentEmotion)) {
      setEmotion('curious');
    }
  }, 5000);

  // Deep idle: sleeping after 30s of zero interaction
  deepIdleTimer = setTimeout(() => {
    if (!['excited', 'happy', 'disappointed', 'coding'].includes(currentEmotion)) {
      setEmotion('sleeping');
    }
  }, 30000);
}

// ═══════════════════════════════════════════════════════
//  FIRST-VISIT GREETING SEQUENCE
// ═══════════════════════════════════════════════════════
function runGreetingSequence() {
  const arrow = document.getElementById('pointer-pill');

  gsap.timeline()

    // Fade-in entrance (mascot is fixed at cursor position)
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

    // t = 4.5s — switch to excited + show pointer pill
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

    // t = 10s — settle to neutral if visitor hasn't interacted
    .call(() => {
      if (currentEmotion === 'excited') setEmotion('neutral');
    }, [], 10);
}

// ═══════════════════════════════════════════════════════
//  DYNAMIC TIER ASSIGNMENT — star-count based emotions
// ═══════════════════════════════════════════════════════
function assignTiers(repos) {
  const maxStars = Math.max(...repos.map(r => r.stars));

  // All repos have 0 stars — preserve existing hierarchy by index
  if (maxStars === 0) {
    repos.forEach((repo, i) => {
      if (i === 0)               repo.tier = 'best';
      else if (i <= repos.length - 2) repo.tier = 'high';
      else                        repo.tier = 'low';
    });
    return;
  }

  repos.forEach((repo) => {
    if (repo.stars >= 100)      repo.tier = 'best';
    else if (repo.stars >= 20)  repo.tier = 'high';
    else                        repo.tier = 'low';
  });

  // If no repo qualified as 'best', promote the highest-starred one
  if (!repos.some(r => r.tier === 'best')) {
    const top = repos.reduce((a, b) => a.stars > b.stars ? a : b);
    top.tier = 'best';
  }
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

  // Assign tiers dynamically based on star counts
  assignTiers(repos);

  const grid = document.getElementById('repo-grid');

  repos.forEach((repo, i) => {
    const card = document.createElement('div');
    card.className    = 'repo-card';
    card.dataset.tier = repo.tier;
    card.setAttribute('role', 'listitem');
    const tierIcon = repo.tier === 'best' ? '⚡' : repo.tier === 'high' ? '🔥' : '📁';
    card.innerHTML = `
      <div class="repo-header">
        <div class="repo-name-row">
          <span class="repo-tier-icon">${tierIcon}</span>
          <h3>${repo.name}</h3>
        </div>
        <span class="stars" aria-label="${repo.stars} stars">★ ${repo.stars}</span>
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
      clearTimeout(deepIdleTimer);

      // Track consecutive hovers for alt variant selection
      hoverHistory[repo.name] = (hoverHistory[repo.name] || 0) + 1;

      let emotion;
      if (repo.tier === 'best')      emotion = 'excited';
      else if (repo.tier === 'high') emotion = 'happy';
      else                           emotion = 'disappointed';

      // On 2nd+ consecutive hover of same card, try alt variant
      if (hoverHistory[repo.name] >= 2) {
        const altMap = { excited: 'excited', happy: 'happy_alt', disappointed: 'disappointed' };
        const altEmotion = altMap[emotion];
        if (altEmotion && EMOTIONS[altEmotion]) {
          emotion = altEmotion;
        }
      }

      setEmotion(emotion);

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
  startBlinkLoop();

  if (!sessionStorage.getItem('kc_visited')) {
    sessionStorage.setItem('kc_visited', '1');
    runGreetingSequence();
  } else {
    // Return visit — quick entrance, short wave, then settle
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
