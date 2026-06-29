// ==UserScript==
// @name         TORN CITY Property Lease Alerter
// @namespace    sanxion.tc.propertyleasealerter
// @version      1.1.3
// @description  Highlights property boxes on the Torn City properties page by the time left on the current lease.
// @author       Sanxion [2987640]
// @match        https://www.torn.com/properties.php*
// @updateURL    https://github.com/Quantarallax/Torn-City-Property-Lease-Alerter/raw/refs/heads/main/TornCityPropertyLeaseAlerter.user.js
// @downloadURL  https://github.com/Quantarallax/Torn-City-Property-Lease-Alerter/raw/refs/heads/main/TornCityPropertyLeaseAlerter.user.js
// @license      MIT
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const LOG_TAG = '[TC Property Lease Alerter]';
  const SCRIPT_NAME = 'TORN CITY Property Lease Alerter';
  const SCRIPT_VERSION = '1.1.3';
  const STORAGE_KEY = 'sanxion_tc_property_lease_alerter_settings';
  const MARK_ATTR = 'data-pla-marked';
  const BAR_ID = 'pla-status-bar';
  const PANEL_ID = 'pla-settings-panel';
  const STYLE_ID = 'pla-style';

  const PROFILE_URL = 'https://www.torn.com/profiles.php?XID=2987640';
  const FORUM_URL = 'https://www.torn.com/forums.php#/p=threads&f=67&t=16561948&b=0&a=0&start=0&to=0';
  const OTHER_SCRIPTS_URL = 'https://greasyfork.org/en/users/1593713-quantarallax?sort=total_installs';
  const PIXEL_URL = 'https://c.statcounter.com/13226682/0/97211ccb/1/';

  const COLOURS = {
    red: '#ff4d4d',
    amber: '#ffb13b',
    green: '#46d17a',
    grey: '#8a8f98'
  };

  const DEFAULT_SETTINGS = {
    enabled: true,
    showCounts: true,
    redMin: 1,
    amberMin: 4,
    greenMin: 7
  };

  const DAYS_PATTERN = /(\d+)\s*\/\s*\d+\s*days/i;

  let settings = loadSettings();
  let scanTimer = null;

  const countNodes = { red: null, amber: null, green: null };
  const thresholdInputs = { red: null, amber: null, green: null };
  const legendNodes = { red: null, amber: null, green: null };
  let countsWrapper = null;

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return Object.assign({}, DEFAULT_SETTINGS);
      }
      const parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT_SETTINGS, parsed);
    } catch (err) {
      console.error(LOG_TAG, 'Failed to load settings:', err);
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (err) {
      console.error(LOG_TAG, 'Failed to save settings:', err);
    }
  }

  function fireStatCounter() {
    try {
      const img = document.createElement('img');
      img.src = PIXEL_URL;
      img.alt = '';
      img.referrerPolicy = 'no-referrer-when-downgrade';
      img.style.position = 'absolute';
      img.style.width = '1px';
      img.style.height = '1px';
      img.style.left = '-9999px';
      img.style.top = '-9999px';
      document.body.appendChild(img);
    } catch (err) {
      console.error(LOG_TAG, 'StatCounter pixel failed:', err);
    }
  }

  function initStatCounter() {
    if (document.readyState === 'complete') {
      fireStatCounter();
    } else {
      window.addEventListener('load', fireStatCounter, { once: true });
    }
  }

  function classifyDays(days) {
    if (days >= settings.greenMin) {
      return 'green';
    }
    if (days >= settings.amberMin) {
      return 'amber';
    }
    return 'red';
  }

  function findLeaseNodes() {
    const matches = [];
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let node = walker.nextNode();
      while (node) {
        const text = node.nodeValue;
        if (text && DAYS_PATTERN.test(text)) {
          matches.push(node);
        }
        node = walker.nextNode();
      }
    } catch (err) {
      console.error(LOG_TAG, 'findLeaseNodes failed:', err);
    }
    return matches;
  }

  function findPropertyCard(textNode) {
    let el = textNode.parentElement;
    let depth = 0;
    while (el && depth < 12) {
      if (el.querySelector('img')) {
        return el;
      }
      el = el.parentElement;
      depth += 1;
    }
    return null;
  }

  function applyBorder(card, colour) {
    const img = card.querySelector('img');
    if (!img) {
      return false;
    }
    img.style.outline = '3px solid ' + colour;
    img.style.outlineOffset = '1px';
    img.style.borderRadius = '4px';
    img.style.boxShadow = '0 0 8px ' + colour;
    img.setAttribute(MARK_ATTR, '1');
    return true;
  }

  function clearMarks() {
    const marked = document.querySelectorAll('[' + MARK_ATTR + ']');
    marked.forEach(function (img) {
      img.style.outline = '';
      img.style.outlineOffset = '';
      img.style.boxShadow = '';
      img.removeAttribute(MARK_ATTR);
    });
  }

  function scanProperties() {
    const counts = { red: 0, amber: 0, green: 0 };
    try {
      clearMarks();
      if (settings.enabled) {
        const leaseNodes = findLeaseNodes();
        const seenCards = [];
        leaseNodes.forEach(function (node) {
          const match = node.nodeValue.match(DAYS_PATTERN);
          if (!match) {
            return;
          }
          const days = parseInt(match[1], 10);
          if (Number.isNaN(days)) {
            return;
          }
          const card = findPropertyCard(node);
          if (!card || seenCards.indexOf(card) !== -1) {
            return;
          }
          seenCards.push(card);
          const colour = classifyDays(days);
          if (applyBorder(card, COLOURS[colour])) {
            counts[colour] += 1;
          }
        });
      }
    } catch (err) {
      console.error(LOG_TAG, 'scanProperties failed:', err);
    }
    updateStatusBar(counts);
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#' + BAR_ID + ' {',
      'display: flex; align-items: center; gap: 10px;',
      'font-family: Arial, Helvetica, sans-serif; font-size: 13px;',
      'background: #15171c; color: #e6e8ec;',
      'border: 1px solid #2b2f37; border-radius: 6px;',
      'padding: 6px 10px; margin: 8px 0;',
      '}',
      '#' + BAR_ID + ' .pla-title { font-weight: bold; letter-spacing: 0.3px; }',
      '#' + BAR_ID + ' .pla-counts { font-weight: bold; }',
      '#' + BAR_ID + ' .pla-cog {',
      'margin-left: auto; cursor: pointer; font-size: 16px;',
      'user-select: none; line-height: 1; color: #c7cbd1;',
      '}',
      '#' + BAR_ID + ' .pla-cog:hover { color: #ffffff; }',
      '#' + PANEL_ID + ' {',
      'position: fixed; top: 120px; right: 20px; width: 330px; z-index: 99999;',
      'background: #15171c; color: #e6e8ec; border: 1px solid #2b2f37;',
      'border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,0.6);',
      'font-family: Arial, Helvetica, sans-serif; font-size: 13px; display: none;',
      '}',
      '#' + PANEL_ID + ' .pla-head {',
      'cursor: move; padding: 10px 12px; background: #1c1f26;',
      'border-bottom: 1px solid #2b2f37; border-radius: 8px 8px 0 0;',
      'display: flex; align-items: center; justify-content: space-between;',
      '}',
      '#' + PANEL_ID + ' .pla-head .pla-name { font-weight: bold; }',
      '#' + PANEL_ID + ' .pla-head .pla-ver { color: #8a8f98; font-size: 11px; }',
      '#' + PANEL_ID + ' .pla-close { cursor: pointer; color: #c7cbd1; font-size: 16px; line-height: 1; }',
      '#' + PANEL_ID + ' .pla-close:hover { color: #ffffff; }',
      '#' + PANEL_ID + ' .pla-body { padding: 12px; }',
      '#' + PANEL_ID + ' .pla-section { margin-bottom: 12px; }',
      '#' + PANEL_ID + ' .pla-section h4 {',
      'margin: 0 0 6px 0; font-size: 12px; text-transform: uppercase;',
      'letter-spacing: 0.5px; color: #8a8f98;',
      '}',
      '#' + PANEL_ID + ' label.pla-row {',
      'display: flex; align-items: center; gap: 8px; margin: 4px 0; cursor: pointer;',
      '}',
      '#' + PANEL_ID + ' .pla-threshold {',
      'display: flex; align-items: center; justify-content: space-between; margin: 6px 0; gap: 8px;',
      '}',
      '#' + PANEL_ID + ' .pla-threshold input {',
      'width: 64px; background: #0f1115; color: #e6e8ec;',
      'border: 1px solid #2b2f37; border-radius: 4px; padding: 4px 6px; font-size: 13px;',
      '}',
      '#' + PANEL_ID + ' .pla-hint { color: #8a8f98; font-size: 11px; margin-top: 4px; }',
      '#' + PANEL_ID + ' .pla-legend { margin: 4px 0; }',
      '#' + PANEL_ID + ' .pla-swatch {',
      'width: 12px; height: 12px; border-radius: 3px; display: inline-block; margin-right: 6px; vertical-align: middle;',
      '}',
      '#' + PANEL_ID + ' a { color: #6fb6ff; text-decoration: none; }',
      '#' + PANEL_ID + ' a:hover { text-decoration: underline; }',
      '#' + PANEL_ID + ' .pla-credit { margin: 4px 0; line-height: 1.4; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function getContentAnchor() {
    const selectors = ['#mainContainer .content-wrapper', '#mainContainer', '.content-wrapper'];
    for (let i = 0; i < selectors.length; i += 1) {
      const el = document.querySelector(selectors[i]);
      if (el) {
        return el;
      }
    }
    return document.body;
  }

  function buildCountSpan(colourKey) {
    const span = document.createElement('span');
    span.style.color = COLOURS[colourKey];
    const textNode = document.createTextNode('');
    span.appendChild(textNode);
    countNodes[colourKey] = textNode;
    return span;
  }

  function buildStatusBar() {
    if (document.getElementById(BAR_ID)) {
      return;
    }
    const bar = document.createElement('div');
    bar.id = BAR_ID;

    const title = document.createElement('span');
    title.className = 'pla-title';
    title.textContent = 'Property Lease Alerter';

    countsWrapper = document.createElement('span');
    countsWrapper.className = 'pla-counts';
    countsWrapper.appendChild(buildCountSpan('red'));
    countsWrapper.appendChild(document.createTextNode(', '));
    countsWrapper.appendChild(buildCountSpan('amber'));
    countsWrapper.appendChild(document.createTextNode(', '));
    countsWrapper.appendChild(buildCountSpan('green'));

    const cog = document.createElement('span');
    cog.className = 'pla-cog';
    cog.textContent = '\u2699';
    cog.title = 'Settings';
    cog.addEventListener('click', togglePanel);

    bar.appendChild(title);
    bar.appendChild(countsWrapper);
    bar.appendChild(cog);

    const anchor = getContentAnchor();
    anchor.insertBefore(bar, anchor.firstChild);
  }

  function updateStatusBar(counts) {
    if (!countsWrapper) {
      return;
    }
    countsWrapper.style.display = settings.showCounts ? '' : 'none';
    if (countNodes.red) {
      countNodes.red.nodeValue = 'Red: ' + counts.red;
    }
    if (countNodes.amber) {
      countNodes.amber.nodeValue = 'Amber: ' + counts.amber;
    }
    if (countNodes.green) {
      countNodes.green.nodeValue = 'Green: ' + counts.green;
    }
  }

  function makeCheckbox(labelText, checked, onChange) {
    const label = document.createElement('label');
    label.className = 'pla-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', function () {
      onChange(box.checked);
    });
    const span = document.createElement('span');
    span.textContent = labelText;
    label.appendChild(box);
    label.appendChild(span);
    return label;
  }

  function makeThresholdRow(colourKey, labelText) {
    const row = document.createElement('div');
    row.className = 'pla-threshold';
    const label = document.createElement('span');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.value = String(settings[colourKey + 'Min']);
    input.addEventListener('change', commitThresholds);
    thresholdInputs[colourKey] = input;
    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  function commitThresholds() {
    const newRed = parseInt(thresholdInputs.red.value, 10);
    const newAmber = parseInt(thresholdInputs.amber.value, 10);
    const newGreen = parseInt(thresholdInputs.green.value, 10);
    const values = [newRed, newAmber, newGreen];
    const allValid = values.every(function (v) {
      return Number.isInteger(v) && v >= 1;
    });
    const ascending = (newRed < newAmber) && (newAmber < newGreen);
    if (!allValid || !ascending) {
      thresholdInputs.red.value = String(settings.redMin);
      thresholdInputs.amber.value = String(settings.amberMin);
      thresholdInputs.green.value = String(settings.greenMin);
      return;
    }
    settings.redMin = newRed;
    settings.amberMin = newAmber;
    settings.greenMin = newGreen;
    saveSettings();
    refreshLegend();
    scanProperties();
  }

  function makeLegendRow(colourKey) {
    const row = document.createElement('div');
    row.className = 'pla-legend';
    const swatch = document.createElement('span');
    swatch.className = 'pla-swatch';
    swatch.style.background = COLOURS[colourKey];
    const label = document.createElement('span');
    const textNode = document.createTextNode('');
    label.appendChild(textNode);
    legendNodes[colourKey] = textNode;
    row.appendChild(swatch);
    row.appendChild(label);
    return row;
  }

  function refreshLegend() {
    if (legendNodes.red) {
      legendNodes.red.nodeValue = settings.redMin + ' to ' + (settings.amberMin - 1) + ' days left';
    }
    if (legendNodes.amber) {
      legendNodes.amber.nodeValue = settings.amberMin + ' to ' + (settings.greenMin - 1) + ' days left';
    }
    if (legendNodes.green) {
      legendNodes.green.nodeValue = settings.greenMin + ' or more days left';
    }
  }

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) {
      return;
    }
    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    const head = document.createElement('div');
    head.className = 'pla-head';
    const headLeft = document.createElement('div');
    const name = document.createElement('span');
    name.className = 'pla-name';
    name.textContent = SCRIPT_NAME;
    const ver = document.createElement('div');
    ver.className = 'pla-ver';
    ver.textContent = 'Version ' + SCRIPT_VERSION;
    headLeft.appendChild(name);
    headLeft.appendChild(ver);
    const close = document.createElement('span');
    close.className = 'pla-close';
    close.textContent = '\u00d7';
    close.title = 'Close';
    close.addEventListener('click', function () {
      panel.style.display = 'none';
    });
    head.appendChild(headLeft);
    head.appendChild(close);

    const body = document.createElement('div');
    body.className = 'pla-body';

    const settingsSection = document.createElement('div');
    settingsSection.className = 'pla-section';
    const settingsTitle = document.createElement('h4');
    settingsTitle.textContent = 'Settings';
    settingsSection.appendChild(settingsTitle);
    settingsSection.appendChild(makeCheckbox('Highlight property boxes', settings.enabled, function (value) {
      settings.enabled = value;
      saveSettings();
      scanProperties();
    }));
    settingsSection.appendChild(makeCheckbox('Show colour counts', settings.showCounts, function (value) {
      settings.showCounts = value;
      saveSettings();
      scanProperties();
    }));

    const thresholdSection = document.createElement('div');
    thresholdSection.className = 'pla-section';
    const thresholdTitle = document.createElement('h4');
    thresholdTitle.textContent = 'Day thresholds';
    thresholdSection.appendChild(thresholdTitle);
    thresholdSection.appendChild(makeThresholdRow('red', 'Red (min days left)'));
    thresholdSection.appendChild(makeThresholdRow('amber', 'Amber (min days left)'));
    thresholdSection.appendChild(makeThresholdRow('green', 'Green (min days left)'));
    const hint = document.createElement('div');
    hint.className = 'pla-hint';
    hint.textContent = 'Values must ascend: red below amber below green.';
    thresholdSection.appendChild(hint);

    const legendSection = document.createElement('div');
    legendSection.className = 'pla-section';
    const legendTitle = document.createElement('h4');
    legendTitle.textContent = 'Current bands';
    legendSection.appendChild(legendTitle);
    legendSection.appendChild(makeLegendRow('red'));
    legendSection.appendChild(makeLegendRow('amber'));
    legendSection.appendChild(makeLegendRow('green'));

    const creditsSection = document.createElement('div');
    creditsSection.className = 'pla-section';
    const creditsTitle = document.createElement('h4');
    creditsTitle.textContent = 'Credits';
    creditsSection.appendChild(creditsTitle);

    const author = document.createElement('div');
    author.className = 'pla-credit';
    const authorText = document.createTextNode('Written by ');
    const authorLink = document.createElement('a');
    authorLink.href = PROFILE_URL;
    authorLink.target = '_blank';
    authorLink.rel = 'noopener noreferrer';
    authorLink.textContent = 'Sanxion [2987640]';
    author.appendChild(authorText);
    author.appendChild(authorLink);

    const forum = document.createElement('div');
    forum.className = 'pla-credit';
    const forumLink = document.createElement('a');
    forumLink.href = FORUM_URL;
    forumLink.target = '_blank';
    forumLink.rel = 'noopener noreferrer';
    forumLink.textContent = 'Forum link: Bugs, feedback and LIKES welcome!';
    forum.appendChild(forumLink);

    const other = document.createElement('div');
    other.className = 'pla-credit';
    const otherLink = document.createElement('a');
    otherLink.href = OTHER_SCRIPTS_URL;
    otherLink.target = '_blank';
    otherLink.rel = 'noopener noreferrer';
    otherLink.textContent = "Sanxion's Other Scripts";
    other.appendChild(otherLink);

    creditsSection.appendChild(author);
    creditsSection.appendChild(forum);
    creditsSection.appendChild(other);

    body.appendChild(settingsSection);
    body.appendChild(thresholdSection);
    body.appendChild(legendSection);
    body.appendChild(creditsSection);

    panel.appendChild(head);
    panel.appendChild(body);
    document.body.appendChild(panel);

    refreshLegend();
    enableDragging(panel, head);
  }

  function togglePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return;
    }
    panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
  }

  function enableDragging(panel, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('mousedown', function (event) {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      panel.style.right = 'auto';
      event.preventDefault();
    });

    document.addEventListener('mousemove', function (event) {
      if (!dragging) {
        return;
      }
      panel.style.left = (event.clientX - offsetX) + 'px';
      panel.style.top = (event.clientY - offsetY) + 'px';
    });

    document.addEventListener('mouseup', function () {
      dragging = false;
    });
  }

  function scheduleScan() {
    if (scanTimer) {
      clearTimeout(scanTimer);
    }
    scanTimer = setTimeout(function () {
      scanTimer = null;
      scanProperties();
    }, 400);
  }

  function initObserver() {
    try {
      const observer = new MutationObserver(function () {
        scheduleScan();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (err) {
      console.error(LOG_TAG, 'Observer init failed:', err);
    }
  }

  function init() {
    try {
      injectStyle();
      buildStatusBar();
      buildPanel();
      scanProperties();
      initObserver();
      initStatCounter();
    } catch (err) {
      console.error(LOG_TAG, 'init failed:', err);
    }
  }

  init();
}());
