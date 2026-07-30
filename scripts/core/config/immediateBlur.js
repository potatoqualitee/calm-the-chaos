import { getStorageData } from '../../utils/chromeStorage.js';

// Sites with a dedicated handler (e.g. CNN) finish initial filtering in a few
// hundred milliseconds, which used to yank the mindful-pause message off
// screen before it was readable. Non-forced removals wait until the message
// has been visible at least this long.
const MIN_MESSAGE_DISPLAY_MS = 2000;

// Client-rendered sites (e.g. CNN) keep mounting content after the initial
// scan finishes, and the mutation observer filters it as it appears. Lifting
// the blur on the initial-scan checkpoint reveals unfiltered content that then
// visibly disappears. Instead, the settled removal below holds the overlay
// until the DOM has been quiet for a beat.
//
// Keep the quiet window short and the cap tight. A page with an autoplaying
// video player and rotating ads (cnn.com) mutates near-continuously: measured
// on a live load, it took 4.4s to produce a single quiet second, so a 1000ms
// window turned into 4.4s of opaque screen after filtering had already
// finished. A few hundred milliseconds of quiet is enough to mean "the
// observer has caught up" and is reached almost immediately.
//
// The cap is the ceiling on that wait, not a rare safety valve — on a page that
// never settles it is the only exit. The two failure modes are wildly
// asymmetric: holding too long shows an opaque screen and reads as a broken
// page, while releasing too early shows a headline that vanishes a moment
// later.
const SETTLE_QUIET_MS = 400;
const SETTLE_POLL_MS = 250;
const SETTLE_MAX_WAIT_MS = 1500;

// Absolute failsafe so a broken page can never stay blurred forever. Must
// exceed the worst realistic initial-scan + settle time on slow connections,
// and no more: every second past that is a page the user cannot see at all.
const MAX_OVERLAY_LIFETIME_MS = 10000;

let lastPageActivityAt = 0;
let settleLoopActive = false;
let settleGeneration = 0;

// Called by the mutation observer on every DOM change batch.
export function markPageActivity() {
    lastPageActivityAt = Date.now();
}

// A re-init (extension reload, keyword update, tab wake-up) replaces the
// overlay while a settle loop may still be polling for the old one. That loop
// measures its wait from the overlay it was started for, so letting it survive
// hands the new overlay a budget that is already spent — it gets released one
// poll later, on a page that never settled. Retire the loop with the overlay.
function cancelSettleWait() {
    settleGeneration++;
    settleLoopActive = false;
}

// Remove the overlay once the page has stopped mutating (filtering caught
// up), rather than the moment the initial scan finishes.
export function removeImmediateBlurWhenSettled() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay || settleLoopActive) {
        if (!overlay) removeImmediateBlur();
        return;
    }

    settleLoopActive = true;
    const generation = settleGeneration;
    const settleStartedAt = Date.now();
    const check = () => {
        if (generation !== settleGeneration) return;

        const quietFor = Date.now() - lastPageActivityAt;
        const waited = Date.now() - settleStartedAt;
        if (quietFor >= SETTLE_QUIET_MS || waited >= SETTLE_MAX_WAIT_MS) {
            settleLoopActive = false;
            traceBlurEvent(`settled quiet=${quietFor}ms waited=${waited}ms`);
            removeImmediateBlur();
            return;
        }
        setTimeout(check, SETTLE_POLL_MS);
    };
    check();
}

// Diagnostic breadcrumb trail for the blur lifecycle, written to a DOM
// attribute so it can be read from any world (page console, devtools,
// automation) after the fact: data-calm-chaos-log on <html>.
export function traceBlurEvent(event) {
    try {
        const root = document.documentElement;
        if (!root) return;
        const existing = root.getAttribute('data-calm-chaos-log') || '';
        if (existing.length > 4000) return;
        const now = Math.round(globalThis.performance?.now?.() ?? 0);
        const entry = `${now}:${event}`;
        root.setAttribute('data-calm-chaos-log', existing ? `${existing}|${entry}` : entry);
    } catch (_error) {
        // Diagnostics must never break the page.
    }
}

// Cosmetic ad-block filters (e.g. Brave Shields annoyance lists) hide
// full-screen elements whose names look like paywall or consent overlays —
// the old #calm-chaos-blur-overlay id was display:none'd on cnn.com. Use a
// neutral id and force the critical styles with !important so a stylesheet
// rule cannot silently hide the pause.
const OVERLAY_ID = 'calm-chaos-mindful-pause';

function applyImportantStyles(element, styles) {
    if (!element.style?.setProperty) return;
    for (const [property, value] of Object.entries(styles)) {
        element.style.setProperty(property, value, 'important');
    }
}

// Create and show blur overlay
export async function showImmediateBlur() {
    cancelSettleWait();

    // Remove any existing overlay first (but don't remove initial blur yet)
    const existingOverlay = document.getElementById(OVERLAY_ID);
    if (existingOverlay && existingOverlay.parentNode) {
        existingOverlay.parentNode.removeChild(existingOverlay);
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    applyImportantStyles(overlay, {
        'position': 'fixed',
        'top': '0',
        'left': '0',
        'width': '100%',
        'height': '100%',
        'backdrop-filter': 'blur(10px)',
        'background-color': 'rgba(255, 255, 255, 0.5)',
        'z-index': '2147483647',
        'display': 'flex',
        'justify-content': 'center',
        'align-items': 'center',
        'visibility': 'visible',
        'opacity': '1'
    });

    // Absolute failsafe: force the blur down even if filtering never settles
    setTimeout(() => {
        traceBlurEvent('failsafe-cap');
        removeImmediateBlur(true);
    }, MAX_OVERLAY_LIFETIME_MS);

    // Check if message should be shown
    const settings = await getStorageData(['showBlurMessage']);
    const showMessage = settings.showBlurMessage !== false; // Default to true if not set
    traceBlurEvent(`show-blur msg=${showMessage} vis=${document.visibilityState}`);

    if (showMessage) {
        const messageContainer = document.createElement('div');
        messageContainer.style.cssText = `
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(240, 248, 255, 0.95));
            border-radius: 20px;
            padding: 28px 40px;
            text-align: center;
            box-shadow: 0 8px 32px rgba(31, 38, 135, 0.15);
            min-width: 480px;
            white-space: nowrap;
            pointer-events: none;
            border: 1px solid rgba(255, 255, 255, 0.4);
            backdrop-filter: blur(4px);
        `;

        const emojis = document.createElement('div');
        emojis.style.cssText = `
            font-size: 32px;
            margin-bottom: 20px;
            display: flex;
            justify-content: center;
            gap: 12px;
            animation: float 6s ease-in-out infinite;
        `;
        emojis.innerHTML = '☁️ 🍵 😌 🌿';

        const message = document.createElement('p');
        message.style.cssText = `
            margin: 0;
            color: #2c3e50;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 18px;
            line-height: 1.6;
            font-weight: 500;
        `;
        message.textContent = 'Taking a mindful pause to filter content...';

        // Add floating animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes float {
                0% { transform: translateY(0px); }
                50% { transform: translateY(-10px); }
                100% { transform: translateY(0px); }
            }
        `;
        overlay.appendChild(style);

        messageContainer.appendChild(emojis);
        messageContainer.appendChild(message);
        overlay.appendChild(messageContainer);
        overlay.__mindfulMessageShownAt = Date.now();
    }
    document.documentElement.appendChild(overlay);
    traceBlurEvent('overlay-attached');

    // Only remove the initial blur after the new overlay is in place
    // This ensures continuous coverage without any gaps
    document.documentElement.classList.add('blur-removed');

    return overlay;
}

// Remove blur overlay
export function removeImmediateBlur(force = false) {
    const overlay = document.getElementById(OVERLAY_ID);

    if (overlay && !force && overlay.__mindfulMessageShownAt) {
        const remaining = MIN_MESSAGE_DISPLAY_MS - (Date.now() - overlay.__mindfulMessageShownAt);
        if (remaining > 0) {
            traceBlurEvent(`remove-deferred ${remaining}ms`);
            setTimeout(() => removeImmediateBlur(), remaining);
            return;
        }
    }

    traceBlurEvent(`remove force=${force} overlay=${Boolean(overlay)}`);
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }

    // Force removal or check state
    if (force) {
        document.documentElement.classList.add('blur-removed');
    } else {
        // Only remove blur if we're not in a loading or sleeping state
        const state = document.documentElement.getAttribute('data-calm-chaos-state');
        if (state !== 'loading' && state !== 'sleeping') {
            document.documentElement.classList.add('blur-removed');
        }
    }
}
