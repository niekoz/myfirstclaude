'use strict';

// ── Storage ───────────────────────────────────────────────────────────────────

const Storage = {
  getSettings() {
    return JSON.parse(localStorage.getItem('ct_settings') || 'null') || {};
  },
  saveSettings(s) {
    localStorage.setItem('ct_settings', JSON.stringify(s));
  },
  getTravels() {
    return JSON.parse(localStorage.getItem('ct_travels') || '{}');
  },
  saveTravels(t) {
    localStorage.setItem('ct_travels', JSON.stringify(t));
  },
  addTravel(dateKey, entry) {
    const travels = this.getTravels();
    if (!travels[dateKey]) travels[dateKey] = [];
    travels[dateKey].push(entry);
    this.saveTravels(travels);
  },
  removeTravel(dateKey, index) {
    const travels = this.getTravels();
    if (travels[dateKey]) {
      travels[dateKey].splice(index, 1);
      if (!travels[dateKey].length) delete travels[dateKey];
      this.saveTravels(travels);
    }
  },
  getDeletedAuto() {
    return new Set(JSON.parse(localStorage.getItem('ct_deleted_auto') || '[]'));
  },
  deleteAutoEntry(dateKey) {
    const deleted = this.getDeletedAuto();
    deleted.add(dateKey);
    localStorage.setItem('ct_deleted_auto', JSON.stringify([...deleted]));
  },
};

// ── ORS API ───────────────────────────────────────────────────────────────────

const ORS = {
  async geocode(address, apiKey) {
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(address)}&size=1`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Geocoding failed (${res.status})`);
    }
    const data = await res.json();
    if (!data.features?.length) throw new Error(`Address not found: "${address}"`);
    const [lng, lat] = data.features[0].geometry.coordinates;
    return { lat, lng, label: data.features[0].properties.label };
  },

  async getDistance(from, to, apiKey) {
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': apiKey },
      body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error?.message || `Route failed (${res.status})`);
    }
    const data = await res.json();
    return data.routes[0].summary.distance / 1000;
  },
};

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_NAMES        = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES      = ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'];
const DEFAULT_KM_RATE  = 0.23;

function getKmRate(settings) {
  return Number.isFinite(settings.kmRate) ? settings.kmRate : DEFAULT_KM_RATE;
}

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  selectedDate: null,
  pendingEntry: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isToday(y, m, d) {
  const now = new Date();
  return now.getFullYear() === y && now.getMonth() === m && now.getDate() === d;
}

function shortLabel(type, label) {
  if (type === 'home') return 'Home';
  if (type === 'work') return 'Work';
  const first = label.split(',')[0].trim();
  return first.length > 18 ? first.slice(0, 16) + '…' : first;
}

function arrowChar(roundTrip) {
  return roundTrip ? '&#8596;' : '&#8594;';
}

// ── Calendar Rendering ────────────────────────────────────────────────────────

function renderCalendar() {
  const travels     = Storage.getTravels();
  const settings    = Storage.getSettings();
  const deletedAuto = Storage.getDeletedAuto();

  const workDays     = (settings.workDays || []).map(Number);
  const autoKm       = settings.homeWorkDistance
    ? (settings.autoRoundTrip ? settings.homeWorkDistance * 2 : settings.homeWorkDistance)
    : null;
  const showAuto     = workDays.length > 0 && autoKm !== null && settings.homeCoords && settings.workCoords;

  document.getElementById('month-title').textContent =
    `${MONTH_NAMES[state.month]} ${state.year}`;

  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  let totalKm = 0;

  const list = document.getElementById('calendar-list');
  list.innerHTML = '';

  for (let d = 1; d <= daysInMonth; d++) {
    const dow      = new Date(state.year, state.month, d).getDay();
    const key      = makeDateKey(state.year, state.month, d);
    const manual   = travels[key] || [];
    const isAutoDay = showAuto && workDays.includes(dow) && !deletedAuto.has(key);

    if (isAutoDay) totalKm += autoKm;
    manual.forEach(e => { totalKm += e.distance; });

    const row = document.createElement('div');
    row.className = 'day-row'
      + (dow === 0 || dow === 6 ? ' weekend' : '')
      + (isToday(state.year, state.month, d) ? ' today' : '');

    const label = document.createElement('div');
    label.className = 'day-label';
    label.innerHTML = `<span class="day-name">${DAY_NAMES[dow]}</span>`
                    + `<span class="day-number">${String(d).padStart(2, '0')}</span>`;

    const content = document.createElement('div');
    content.className = 'day-content';

    if (isAutoDay || manual.length) {
      const entriesEl = document.createElement('div');
      entriesEl.className = 'travel-entries';

      if (isAutoDay) {
        const el = document.createElement('div');
        el.className = 'travel-entry';
        el.innerHTML =
          `<span class="auto-badge">auto</span>`
          + `<div class="entry-route">`
          + `<span class="entry-chip">Home</span>`
          + `<span class="entry-arrow">${arrowChar(settings.autoRoundTrip)}</span>`
          + `<span class="entry-chip">Work</span>`
          + `</div>`
          + `<span class="entry-km">${autoKm.toFixed(1)} km</span>`
          + `<button class="btn-del" data-key="${key}" data-auto="1" title="Remove auto entry">&times;</button>`;
        entriesEl.appendChild(el);
      }

      manual.forEach((entry, i) => {
        const el = document.createElement('div');
        el.className = 'travel-entry';
        el.innerHTML =
          `<div class="entry-route">`
          + `<span class="entry-chip" title="${entry.departureLabel}">${entry.departureShort}</span>`
          + `<span class="entry-arrow">${arrowChar(entry.roundTrip)}</span>`
          + `<span class="entry-chip" title="${entry.destinationLabel}">${entry.destinationShort}</span>`
          + `</div>`
          + `<span class="entry-km">${entry.distance.toFixed(1)} km</span>`
          + `<button class="btn-del" data-key="${key}" data-index="${i}" title="Remove entry">&times;</button>`;
        entriesEl.appendChild(el);
      });

      content.appendChild(entriesEl);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'add-btn';
    addBtn.dataset.key = key;
    addBtn.textContent = '+ Add travel';
    content.appendChild(addBtn);

    row.appendChild(label);
    row.appendChild(content);
    list.appendChild(row);
  }

  document.getElementById('total-km').textContent = `${totalKm.toFixed(1)} km`;

  const ready = settings.apiKey && settings.homeCoords && settings.workCoords;
  document.getElementById('setup-banner').classList.toggle('hidden', !!ready);

  list.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', () => openTravelModal(btn.dataset.key));
  });
  list.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.auto) {
        Storage.deleteAutoEntry(btn.dataset.key);
      } else {
        Storage.removeTravel(btn.dataset.key, parseInt(btn.dataset.index, 10));
      }
      renderCalendar();
    });
  });
}

// ── Settings Modal ────────────────────────────────────────────────────────────

function openSettingsModal() {
  const s = Storage.getSettings();
  document.getElementById('api-key').value      = s.apiKey      || '';
  document.getElementById('home-address').value = s.homeAddress || '';
  document.getElementById('work-address').value = s.workAddress || '';
  setAddrStatus('home-status', s.homeCoords ? `✓ ${s.homeCoords.label}` : '', s.homeCoords ? 'ok' : '');
  setAddrStatus('work-status', s.workCoords ? `✓ ${s.workCoords.label}` : '', s.workCoords ? 'ok' : '');

  const workDays = (s.workDays || []).map(Number);
  document.querySelectorAll('input[name="workday"]').forEach(cb => {
    cb.checked = workDays.includes(Number(cb.value));
  });
  document.getElementById('auto-round-trip').checked = !!s.autoRoundTrip;
  document.getElementById('km-rate').value = getKmRate(s);

  openModal('settings-modal');
}

function setAddrStatus(id, text, cls) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'addr-status' + (cls ? ` ${cls}` : '');
}

async function verifyAddress(type) {
  const inputId  = type === 'home' ? 'home-address' : 'work-address';
  const statusId = type === 'home' ? 'home-status'  : 'work-status';
  const address  = document.getElementById(inputId).value.trim();
  const apiKey   = document.getElementById('api-key').value.trim();

  if (!address) { setAddrStatus(statusId, 'Enter an address first', 'err'); return; }
  if (!apiKey)  { setAddrStatus(statusId, 'Enter your API key first', 'err'); return; }

  setAddrStatus(statusId, 'Verifying…', 'wait');
  try {
    const coords = await ORS.geocode(address, apiKey);
    setAddrStatus(statusId, `✓ ${coords.label}`, 'ok');
    const s = Storage.getSettings();
    s.apiKey = apiKey;
    if (type === 'home') { s.homeCoords = coords; s.homeAddress = address; }
    else                 { s.workCoords = coords; s.workAddress = address; }
    // Cache the home↔work driving distance when both are available
    if (s.homeCoords && s.workCoords) {
      try {
        s.homeWorkDistance = await ORS.getDistance(s.homeCoords, s.workCoords, apiKey);
      } catch (_) { /* non-critical */ }
    }
    Storage.saveSettings(s);
  } catch (e) {
    setAddrStatus(statusId, `✗ ${e.message}`, 'err');
  }
}

function saveSettings() {
  const s           = Storage.getSettings();
  const apiKey      = document.getElementById('api-key').value.trim();
  const homeAddress = document.getElementById('home-address').value.trim();
  const workAddress = document.getElementById('work-address').value.trim();

  if (homeAddress !== s.homeAddress) { s.homeCoords = null; s.homeAddress = homeAddress; s.homeWorkDistance = null; }
  if (workAddress !== s.workAddress) { s.workCoords = null; s.workAddress = workAddress; s.homeWorkDistance = null; }
  s.apiKey = apiKey;

  s.workDays = [...document.querySelectorAll('input[name="workday"]:checked')]
    .map(cb => Number(cb.value));
  s.autoRoundTrip = document.getElementById('auto-round-trip').checked;

  const rate = parseFloat(document.getElementById('km-rate').value);
  s.kmRate = Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_KM_RATE;

  Storage.saveSettings(s);
  closeModal('settings-modal');
  renderCalendar();
}

// ── Travel Modal ──────────────────────────────────────────────────────────────

function openTravelModal(dateKey) {
  const settings = Storage.getSettings();
  if (!settings.apiKey || !settings.homeCoords || !settings.workCoords) {
    openSettingsModal();
    return;
  }

  state.selectedDate = dateKey;
  state.pendingEntry = null;

  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  document.getElementById('travel-modal-title').textContent =
    `Add Travel — ${DAY_NAMES[date.getDay()]} ${String(d).padStart(2, '0')} ${MONTH_NAMES[m - 1]}`;

  document.querySelectorAll('input[name="departure"], input[name="destination"]')
    .forEach(r => { r.checked = false; });
  document.getElementById('departure-custom').value   = '';
  document.getElementById('destination-custom').value = '';
  document.getElementById('departure-custom').classList.add('hidden');
  document.getElementById('destination-custom').classList.add('hidden');
  document.getElementById('round-trip').checked  = false;
  document.getElementById('fixed-km').value      = '';
  document.getElementById('distance-result').classList.add('hidden');
  document.getElementById('roundtrip-detail').classList.add('hidden');
  document.getElementById('travel-error').classList.add('hidden');
  document.getElementById('save-travel-btn').classList.add('hidden');
  document.getElementById('calc-btn').disabled    = false;
  document.getElementById('calc-btn').textContent = 'Calculate Distance';

  document.querySelector('input[name="departure"][value="home"]').checked   = true;
  document.querySelector('input[name="destination"][value="work"]').checked = true;

  openModal('travel-modal');
}

async function calculateDistance() {
  const settings  = Storage.getSettings();
  const depType   = document.querySelector('input[name="departure"]:checked')?.value;
  const destType  = document.querySelector('input[name="destination"]:checked')?.value;
  const isRoundTrip = document.getElementById('round-trip').checked;
  const errorEl   = document.getElementById('travel-error');
  const resultEl  = document.getElementById('distance-result');
  const detailEl  = document.getElementById('roundtrip-detail');
  const arrowEl   = document.getElementById('route-arrow');
  const calcBtn   = document.getElementById('calc-btn');
  const saveBtn   = document.getElementById('save-travel-btn');

  errorEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  detailEl.classList.add('hidden');
  saveBtn.classList.add('hidden');

  if (!depType || !destType) {
    showTravelError('Select both a departure and a destination.');
    return;
  }
  if (depType !== 'custom' && depType === destType) {
    showTravelError('Departure and destination cannot be the same location.');
    return;
  }

  calcBtn.disabled    = true;
  calcBtn.textContent = 'Calculating…';

  try {
    let depCoords, depLabel, destCoords, destLabel;

    if (depType === 'home')      { depCoords = settings.homeCoords; depLabel = settings.homeAddress; }
    else if (depType === 'work') { depCoords = settings.workCoords; depLabel = settings.workAddress; }
    else {
      const addr = document.getElementById('departure-custom').value.trim();
      if (!addr) throw new Error('Enter a departure address in the text field.');
      const g = await ORS.geocode(addr, settings.apiKey);
      depCoords = g; depLabel = g.label;
    }

    if (destType === 'home')      { destCoords = settings.homeCoords; destLabel = settings.homeAddress; }
    else if (destType === 'work') { destCoords = settings.workCoords; destLabel = settings.workAddress; }
    else {
      const addr = document.getElementById('destination-custom').value.trim();
      if (!addr) throw new Error('Enter a destination address in the text field.');
      const g = await ORS.geocode(addr, settings.apiKey);
      destCoords = g; destLabel = g.label;
    }

    const oneWayKm = await ORS.getDistance(depCoords, destCoords, settings.apiKey);
    const totalKm  = isRoundTrip ? oneWayKm * 2 : oneWayKm;

    document.getElementById('calc-distance').textContent = `${totalKm.toFixed(1)} km`;
    document.getElementById('route-from-label').textContent = shortLabel(depType, depLabel);
    document.getElementById('route-to-label').textContent   = shortLabel(destType, destLabel);
    arrowEl.innerHTML = arrowChar(isRoundTrip);

    if (isRoundTrip) {
      detailEl.textContent = `2 × ${oneWayKm.toFixed(1)} km`;
      detailEl.classList.remove('hidden');
    }

    resultEl.classList.remove('hidden');

    state.pendingEntry = {
      departure:         depType,
      departureCoords:   depCoords,
      departureLabel:    depLabel,
      departureShort:    shortLabel(depType, depLabel),
      destination:       destType,
      destinationCoords: destCoords,
      destinationLabel:  destLabel,
      destinationShort:  shortLabel(destType, destLabel),
      distance:          totalKm,
      roundTrip:         isRoundTrip,
    };
    saveBtn.classList.remove('hidden');
  } catch (e) {
    showTravelError(e.message);
  } finally {
    calcBtn.disabled    = false;
    calcBtn.textContent = 'Calculate Distance';
  }
}

function useFixedKm() {
  const settings    = Storage.getSettings();
  const depType     = document.querySelector('input[name="departure"]:checked')?.value;
  const destType    = document.querySelector('input[name="destination"]:checked')?.value;
  const isRoundTrip = document.getElementById('round-trip').checked;
  const fixedInput  = document.getElementById('fixed-km');
  const oneWayKm    = parseFloat(fixedInput.value);
  const errorEl     = document.getElementById('travel-error');
  const resultEl    = document.getElementById('distance-result');
  const detailEl    = document.getElementById('roundtrip-detail');
  const arrowEl     = document.getElementById('route-arrow');
  const saveBtn     = document.getElementById('save-travel-btn');

  errorEl.classList.add('hidden');
  resultEl.classList.add('hidden');
  detailEl.classList.add('hidden');
  saveBtn.classList.add('hidden');

  if (!depType || !destType) {
    showTravelError('Select both a departure and a destination.');
    return;
  }
  if (depType !== 'custom' && depType === destType) {
    showTravelError('Departure and destination cannot be the same location.');
    return;
  }
  if (!fixedInput.value || isNaN(oneWayKm) || oneWayKm <= 0) {
    showTravelError('Enter a valid distance greater than 0.');
    return;
  }

  let depLabel, destLabel;
  if (depType === 'home')      depLabel = settings.homeAddress;
  else if (depType === 'work') depLabel = settings.workAddress;
  else                         depLabel = document.getElementById('departure-custom').value.trim() || 'Custom';

  if (destType === 'home')      destLabel = settings.homeAddress;
  else if (destType === 'work') destLabel = settings.workAddress;
  else                          destLabel = document.getElementById('destination-custom').value.trim() || 'Custom';

  const totalKm = isRoundTrip ? oneWayKm * 2 : oneWayKm;

  document.getElementById('calc-distance').textContent         = `${totalKm.toFixed(1)} km`;
  document.getElementById('route-from-label').textContent      = shortLabel(depType, depLabel);
  document.getElementById('route-to-label').textContent        = shortLabel(destType, destLabel);
  arrowEl.innerHTML = arrowChar(isRoundTrip);

  if (isRoundTrip) {
    detailEl.textContent = `2 × ${oneWayKm.toFixed(1)} km`;
    detailEl.classList.remove('hidden');
  }

  resultEl.classList.remove('hidden');

  state.pendingEntry = {
    departure:         depType,
    departureCoords:   depType === 'home' ? settings.homeCoords : depType === 'work' ? settings.workCoords : null,
    departureLabel:    depLabel,
    departureShort:    shortLabel(depType, depLabel),
    destination:       destType,
    destinationCoords: destType === 'home' ? settings.homeCoords : destType === 'work' ? settings.workCoords : null,
    destinationLabel:  destLabel,
    destinationShort:  shortLabel(destType, destLabel),
    distance:          totalKm,
    roundTrip:         isRoundTrip,
  };
  saveBtn.classList.remove('hidden');
}

function showTravelError(msg) {
  const el = document.getElementById('travel-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function saveTravelEntry() {
  if (!state.pendingEntry || !state.selectedDate) return;
  Storage.addTravel(state.selectedDate, state.pendingEntry);
  closeModal('travel-modal');
  renderCalendar();
}

// ── Excel Export ──────────────────────────────────────────────────────────────

function exportToExcel() {
  const settings    = Storage.getSettings();
  const travels     = Storage.getTravels();
  const deletedAuto = Storage.getDeletedAuto();

  const workDays  = (settings.workDays || []).map(Number);
  const autoKm    = settings.homeWorkDistance
    ? (settings.autoRoundTrip ? settings.homeWorkDistance * 2 : settings.homeWorkDistance)
    : null;
  const showAuto  = workDays.length > 0 && autoKm !== null && settings.homeCoords && settings.workCoords;

  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const rate        = getKmRate(settings);
  const EUR_FORMAT  = '"€" #,##0.00';
  const KM_FORMAT   = '0.0';
  const rows = [];

  // Row numbers below are 1-based Excel rows; the rate lives in B2 and data starts on row 5.
  rows.push([`Commute Report – ${MONTH_NAMES[state.month]} ${state.year}`]);
  rows.push(['Rate per km', { t: 'n', v: rate, z: EUR_FORMAT }]);
  rows.push([]);
  rows.push(['Date', 'Day', 'Departure', 'Destination', 'Type', 'Distance (km)', 'Amount (€)', 'Full addresses']);
  const firstDataRow = rows.length + 1;

  const kmCell = km => ({ t: 'n', v: km, z: KM_FORMAT });
  const amountCell = km => {
    const excelRow = rows.length + 1;
    return { t: 'n', v: km * rate, f: `F${excelRow}*$B$2`, z: EUR_FORMAT };
  };

  let total = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dow     = new Date(state.year, state.month, d).getDay();
    const key     = makeDateKey(state.year, state.month, d);
    const dateStr = `${String(d).padStart(2, '0')} ${MONTH_NAMES[state.month]} ${state.year}`;
    const dayStr  = DAY_NAMES_FULL[dow];
    const manual  = travels[key] || [];

    if (showAuto && workDays.includes(dow) && !deletedAuto.has(key)) {
      const km = parseFloat(autoKm.toFixed(1));
      rows.push([
        dateStr, dayStr,
        'Home', 'Work',
        settings.autoRoundTrip ? 'Round trip' : 'One-way',
        kmCell(km),
        amountCell(km),
        `${settings.homeAddress} → ${settings.workAddress}`,
      ]);
      total += km;
    }

    manual.forEach(entry => {
      const depAddr  = entry.departureLabel  || entry.departureShort;
      const destAddr = entry.destinationLabel || entry.destinationShort;
      const km = parseFloat(entry.distance.toFixed(1));
      rows.push([
        dateStr, dayStr,
        entry.departureShort,
        entry.destinationShort,
        entry.roundTrip ? 'Round trip' : 'One-way',
        kmCell(km),
        amountCell(km),
        `${depAddr} → ${destAddr}`,
      ]);
      total += km;
    });
  }

  const lastDataRow = rows.length;
  rows.push([]);
  const totalRow  = rows.length + 1;
  const hasData   = lastDataRow >= firstDataRow;
  const totalKm   = Math.round(total * 10) / 10;
  rows.push([
    '', '', '', '', 'Total',
    hasData
      ? { t: 'n', v: totalKm, f: `SUM(F${firstDataRow}:F${lastDataRow})`, z: KM_FORMAT }
      : kmCell(0),
    { t: 'n', v: Math.round(totalKm * rate * 100) / 100, f: `ROUND(F${totalRow}*$B$2,2)`, z: EUR_FORMAT },
    '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 16 }, // Date
    { wch: 11 }, // Day
    { wch: 12 }, // Departure
    { wch: 13 }, // Destination
    { wch: 11 }, // Type
    { wch: 14 }, // Distance
    { wch: 12 }, // Amount
    { wch: 52 }, // Full addresses
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${MONTH_NAMES[state.month]} ${state.year}`);
  XLSX.writeFile(wb, `commute-${MONTH_NAMES[state.month].toLowerCase()}-${state.year}.xlsx`);
}

// ── Modal Helpers ─────────────────────────────────────────────────────────────

function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  renderCalendar();

  document.getElementById('prev-month').addEventListener('click', () => {
    if (state.month === 0) { state.month = 11; state.year--; }
    else state.month--;
    renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    if (state.month === 11) { state.month = 0; state.year++; }
    else state.month++;
    renderCalendar();
  });

  document.getElementById('settings-btn').addEventListener('click', openSettingsModal);
  document.getElementById('setup-btn').addEventListener('click', openSettingsModal);
  document.getElementById('verify-home').addEventListener('click', () => verifyAddress('home'));
  document.getElementById('verify-work').addEventListener('click', () => verifyAddress('work'));
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('export-btn').addEventListener('click', exportToExcel);

  document.getElementById('toggle-api-key').addEventListener('click', () => {
    const input = document.getElementById('api-key');
    const btn   = document.getElementById('toggle-api-key');
    const show  = input.type === 'password';
    input.type      = show ? 'text' : 'password';
    btn.textContent = show ? 'Hide' : 'Show';
  });

  document.getElementById('calc-btn').addEventListener('click', calculateDistance);
  document.getElementById('use-fixed-btn').addEventListener('click', useFixedKm);
  document.getElementById('fixed-km').addEventListener('keydown', e => { if (e.key === 'Enter') useFixedKm(); });
  document.getElementById('save-travel-btn').addEventListener('click', saveTravelEntry);

  // Reset result when travel options change
  const resetResult = () => {
    document.getElementById('distance-result').classList.add('hidden');
    document.getElementById('roundtrip-detail').classList.add('hidden');
    document.getElementById('save-travel-btn').classList.add('hidden');
    document.getElementById('travel-error').classList.add('hidden');
  };

  ['departure', 'destination'].forEach(name => {
    document.querySelectorAll(`input[name="${name}"]`).forEach(radio => {
      radio.addEventListener('change', () => {
        document.getElementById(`${name}-custom`).classList.toggle('hidden', radio.value !== 'custom');
        resetResult();
      });
    });
  });
  document.getElementById('round-trip').addEventListener('change', resetResult);

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });
});
