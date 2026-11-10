(function () {
  'use strict';

  var root = document.getElementById('cutscene');
  var flashEl = document.getElementById('csFlash');
  var DURATION = 10.6;
  var FALLBACK_MS = 3200;

  var playing = false;
  var closeTimer = null;
  var fallbackTimer = null;

  function ready() {
    return typeof window.CityScene !== 'undefined';
  }

  function flash(strength) {
    if (!flashEl) return;
    flashEl.classList.remove('is-on');
    void flashEl.offsetWidth;
    flashEl.style.setProperty('--flash-max', String(strength));
    flashEl.classList.add('is-on');
  }

  function onSceneEvent(name) {
    if (name === 'bigflash') flash(0.95);
    else flash(0.7);
  }

  function play() {
    if (playing) return;
    playing = true;

    clearTimeout(closeTimer);
    clearTimeout(fallbackTimer);
    if (flashEl) flashEl.classList.remove('is-on');

    root.classList.remove('closing', 'fallback');
    root.classList.add('play');
    root.setAttribute('aria-hidden', 'false');

    if (ready()) {
      window.CityScene.play({ onEvent: onSceneEvent, onEnd: close });
    } else {
      // three.js has not finished loading: hold the overlay, then give up gracefully
      root.classList.add('fallback');
      fallbackTimer = setTimeout(close, FALLBACK_MS);
    }
  }

  function close() {
    if (!playing) return;
    playing = false;

    clearTimeout(fallbackTimer);
    if (ready()) window.CityScene.stop();

    root.classList.add('closing');
    closeTimer = setTimeout(function () {
      root.classList.remove('play', 'closing', 'fallback');
      root.setAttribute('aria-hidden', 'true');
      if (flashEl) flashEl.classList.remove('is-on');
    }, 380);
  }

  root.addEventListener('pointerdown', function (e) {
    if (!playing) return;
    e.preventDefault();
    close();
  });

  document.addEventListener('keydown', function (e) {
    if (!playing) return;
    if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      close();
    }
  });

  // pay the WebGL warm-up cost while the calculator sits idle
  function warmSoon() {
    if (ready()) {
      try { window.CityScene.warm(); } catch (e) { /* fallback path handles it */ }
    } else {
      window.addEventListener('cityscene-ready', function () {
        try { window.CityScene.warm(); } catch (e) { /* ignore */ }
      }, { once: true });
    }
  }
  if (document.readyState === 'complete') setTimeout(warmSoon, 1200);
  else window.addEventListener('load', function () { setTimeout(warmSoon, 1200); });

  window.Cutscene = { play: play, close: close, isPlaying: function () { return playing; } };
})();
