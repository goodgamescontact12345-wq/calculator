(function () {
  'use strict';

  var valueEl = document.getElementById('value');
  var historyEl = document.getElementById('history');
  var clearEl = document.getElementById('clearKey');
  var keysEl = document.getElementById('keys');

  var MAX_DIGITS = 10;

  var current = '0';
  var previous = null;
  var operator = null;
  var overwrite = true;
  var lastTriggered = null;
  var opButtons = Array.prototype.slice.call(document.querySelectorAll('.key-op'));

  /* ---------------- helpers ---------------- */

  function digitsOnly(value) {
    return value.replace(/[^0-9]/g, '');
  }

  function countDigits(value) {
    return digitsOnly(value).length;
  }

  function format(raw) {
    if (raw === 'Error') return 'Error';
    var negative = raw.charAt(0) === '-';
    var body = negative ? raw.slice(1) : raw;
    var parts = body.split('.');
    var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    var decPart = parts.length > 1 ? '.' + parts[1] : '';
    return (negative ? '-' : '') + intPart + decPart;
  }

  function trimNumber(n) {
    if (!isFinite(n)) return 'Error';
    var rounded = parseFloat(n.toPrecision(12));
    var text = String(rounded);
    if (text.indexOf('e') !== -1) {
      text = rounded.toExponential(6);
    }
    if (text === '-0') text = '0';
    return text;
  }

  function render() {
    var text = format(current);
    valueEl.textContent = text;

    var length = text.length;
    valueEl.classList.toggle('shrink-1', length > 6 && length <= 9);
    valueEl.classList.toggle('shrink-2', length > 9);
    valueEl.classList.toggle('is-error', current === 'Error');

    var idle = current === '0' && previous === null && operator === null;
    clearEl.textContent = idle ? 'AC' : 'C';

    if (previous !== null && operator !== null) {
      historyEl.textContent = format(previous) + ' ' + operator;
    } else {
      historyEl.innerHTML = '&nbsp;';
    }

    opButtons.forEach(function (btn) {
      var isEquals = btn.dataset.op === '=';
      btn.classList.toggle('is-active', !isEquals && btn.dataset.op === operator);
    });
  }

  function maybeTrigger() {
    var value = digitsOnly(current);
    if (value === '67') {
      if (lastTriggered !== current) {
        lastTriggered = current;
        if (window.Cutscene) window.Cutscene.play();
      }
    } else {
      lastTriggered = null;
    }
  }

  /* ---------------- operations ---------------- */

  function calculate(a, b, op) {
    switch (op) {
      case '+': return a + b;
      case '−': return a - b;
      case '×': return a * b;
      case '÷': return b === 0 ? NaN : a / b;
      default: return b;
    }
  }

  function inputDigit(digit) {
    if (current === 'Error') {
      current = '0';
      overwrite = true;
    }

    if (overwrite) {
      current = digit;
      overwrite = false;
    } else {
      if (countDigits(current) >= MAX_DIGITS) return;
      current = current === '0' ? digit : current + digit;
    }

    render();
    maybeTrigger();
  }

  function inputDecimal() {
    if (current === 'Error') {
      current = '0';
      overwrite = true;
    }

    if (overwrite) {
      current = '0.';
      overwrite = false;
    } else if (current.indexOf('.') === -1) {
      current += '.';
    }

    render();
  }

  function chooseOperator(op) {
    if (current === 'Error') return;

    if (operator !== null && !overwrite) {
      var result = calculate(parseFloat(previous), parseFloat(current), operator);
      current = trimNumber(result);
      previous = current;
    } else {
      previous = current;
    }

    operator = op;
    overwrite = true;
    render();
  }

  function equals() {
    if (current === 'Error') return;
    if (operator === null || previous === null) {
      overwrite = true;
      render();
      return;
    }

    var result = calculate(parseFloat(previous), parseFloat(current), operator);
    current = trimNumber(result);
    previous = null;
    operator = null;
    overwrite = true;
    render();
    maybeTrigger();
  }

  function toggleSign() {
    if (current === 'Error' || current === '0') return;
    current = current.charAt(0) === '-' ? current.slice(1) : '-' + current;
    overwrite = false;
    render();
    maybeTrigger();
  }

  function percent() {
    if (current === 'Error') return;
    current = trimNumber(parseFloat(current) / 100);
    overwrite = true;
    render();
    maybeTrigger();
  }

  function clearEntry() {
    var idle = current === '0' && previous === null && operator === null;
    if (idle) {
      previous = null;
      operator = null;
    }
    current = '0';
    overwrite = true;
    lastTriggered = null;
    render();
  }

  function backspace() {
    if (current === 'Error') {
      clearEntry();
      return;
    }
    if (overwrite) return;
    current = current.slice(0, -1);
    if (current === '' || current === '-') {
      current = '0';
      overwrite = true;
    }
    render();
  }

  /* ---------------- input wiring ---------------- */

  keysEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;

    var digit = btn.dataset.digit;
    var op = btn.dataset.op;
    var action = btn.dataset.action;

    if (digit !== undefined) {
      if (digit === '.') inputDecimal();
      else inputDigit(digit);
    } else if (op !== undefined) {
      if (op === '=') equals();
      else chooseOperator(op);
    } else if (action === 'clear') {
      clearEntry();
    } else if (action === 'sign') {
      toggleSign();
    } else if (action === 'percent') {
      percent();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (window.Cutscene && window.Cutscene.isPlaying()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    var key = e.key;

    if (key >= '0' && key <= '9') {
      inputDigit(key);
    } else if (key === '.' || key === ',') {
      inputDecimal();
    } else if (key === '+') {
      chooseOperator('+');
    } else if (key === '-') {
      chooseOperator('−');
    } else if (key === '*' || key === 'x' || key === 'X') {
      chooseOperator('×');
    } else if (key === '/') {
      chooseOperator('÷');
    } else if (key === '=' || key === 'Enter') {
      e.preventDefault();
      equals();
    } else if (key === 'Escape') {
      clearEntry();
    } else if (key === 'Backspace') {
      e.preventDefault();
      backspace();
    } else if (key === '%') {
      percent();
    }
  });

  render();
})();
