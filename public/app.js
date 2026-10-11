// public/app.js - AquaCalc Application Logic

// ==================== 1. TELEGRAM WEBAPP ІНІЦІАЛІЗАЦІЯ ====================
const tg = window.Telegram?.WebApp;

if (tg) {
  try {
    tg.ready();
    tg.expand();
    if (tg.enableClosingConfirmation) {
      tg.enableClosingConfirmation();
    }
  } catch (e) {
    console.warn('Telegram WebApp init warning:', e);
  }
}

function triggerHaptic(type = 'light') {
  if (tg?.HapticFeedback) {
    try {
      if (type === 'light') tg.HapticFeedback.impactOccurred('light');
      else if (type === 'medium') tg.HapticFeedback.impactOccurred('medium');
      else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
      else if (type === 'warning') tg.HapticFeedback.notificationOccurred('warning');
    } catch (e) {}
  }
}

// ==================== 2. СТАН ДОДАТКУ ====================
let addresses = [];
let currentFilter = 'all';
let activeReadingAddressId = null;
let activeDeleteAddressId = null;

const LOCAL_STORAGE_KEY = 'aquacalc_water_addresses_v1';
const LOCAL_STORAGE_HISTORY_KEY = 'aquacalc_water_history_v1';

function generateDefaultAddresses() {
  const defaults = [
    { id: 1, name: 'Адреса 1 (вул. Шевченка, 12, кв. 4)', previousReading: 145.0, currentReading: '', supplyRate: 22.50, drainageRate: 16.80 },
    { id: 2, name: 'Адреса 2 (вул. Франка, 45, кв. 18)', previousReading: 89.2, currentReading: '', supplyRate: 24.10, drainageRate: 17.50 },
    { id: 3, name: 'Адреса 3 (просп. Соборний, 110, оф. 2)', previousReading: 210.5, currentReading: '', supplyRate: 25.00, drainageRate: 18.00 },
    { id: 4, name: 'Адреса 4 (вул. Лесі Українки, 7, кв. 32)', previousReading: 64.0, currentReading: '', supplyRate: 21.80, drainageRate: 15.60 },
    { id: 5, name: 'Адреса 5 (вул. Грушевського, 28, кв. 11)', previousReading: 312.4, currentReading: '', supplyRate: 22.50, drainageRate: 16.80 },
    { id: 6, name: 'Адреса 6 (вул. Б. Хмельницького, 3, кв. 9)', previousReading: 178.6, currentReading: '', supplyRate: 23.40, drainageRate: 16.20 },
    { id: 7, name: 'Адреса 7 (вул. Садова, 15, кв. 22)', previousReading: 95.0, currentReading: '', supplyRate: 22.00, drainageRate: 15.80 },
    { id: 8, name: 'Адреса 8 (вул. Миру, 54, кв. 7)', previousReading: 140.8, currentReading: '', supplyRate: 26.20, drainageRate: 19.10 },
    { id: 9, name: 'Адреса 9 (вул. Незалежності, 88, кв. 61)', previousReading: 52.3, currentReading: '', supplyRate: 21.50, drainageRate: 15.20 },
    { id: 10, name: 'Адреса 10 (вул. Володимира Великого, 19)', previousReading: 230.1, currentReading: '', supplyRate: 23.00, drainageRate: 16.50 }
  ];
  return defaults;
}

// ==================== 3. РОЗРАХУНКОВІ ФУНКЦІЇ ====================
function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

function calculateItem(item) {
  const prev = parseFloat(item.previousReading) || 0;
  const hasCurrent = item.currentReading !== '' && item.currentReading !== null && item.currentReading !== undefined;
  const curr = hasCurrent ? parseFloat(item.currentReading) : null;
  const supplyRate = parseFloat(item.supplyRate) || 0;
  const drainageRate = parseFloat(item.drainageRate) || 0;

  let delta = 0;
  let isNegative = false;

  if (curr !== null && !isNaN(curr)) {
    delta = round2(curr - prev);
    if (delta < 0) {
      isNegative = true;
    }
  }

  const effectiveVolume = Math.max(0, delta);
  const supplyCost = round2(effectiveVolume * supplyRate);
  const drainageCost = round2(effectiveVolume * drainageRate);
  const totalCost = round2(supplyCost + drainageCost);

  return {
    ...item,
    prev,
    curr,
    hasCurrent: hasCurrent && !isNaN(curr),
    delta,
    effectiveVolume,
    isNegative,
    supplyCost,
    drainageCost,
    totalCost
  };
}

function calculateTotals(calculatedList) {
  let totalSupply = 0;
  let totalDrainage = 0;
  let totalVolume = 0;
  let filledCount = 0;

  calculatedList.forEach(item => {
    if (item.hasCurrent && !item.isNegative) {
      totalSupply += item.supplyCost;
      totalDrainage += item.drainageCost;
      totalVolume += item.effectiveVolume;
      filledCount++;
    }
  });

  totalSupply = round2(totalSupply);
  totalDrainage = round2(totalDrainage);
  totalVolume = round2(totalVolume);
  const grandTotal = round2(totalSupply + totalDrainage);

  return {
    totalSupply,
    totalDrainage,
    grandTotal,
    totalVolume,
    filledCount,
    totalAddresses: calculatedList.length
  };
}

// ==================== 4. СИНХРОНІЗАЦІЯ ДАНИХ ====================
async function loadData() {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) {
      addresses = JSON.parse(cached);
    }
  } catch (e) {}

  if (!Array.isArray(addresses) || addresses.length === 0) {
    addresses = generateDefaultAddresses();
  }

  // МИТТЄВИЙ РЕНДЕР
  renderApp();

  try {
    const res = await fetch('/api/addresses');
    if (res.ok) {
      const serverData = await res.json();
      if (Array.isArray(serverData) && serverData.length > 0) {
        addresses = serverData;
        saveToLocalStorage();
        renderApp();
      }
    }
  } catch (err) {
    console.log('Працюємо в автономному режимі (LocalStorage).');
  }
}

function saveToLocalStorage() {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(addresses));
  } catch (e) {
    console.warn('LocalStorage save error:', e);
  }
}

async function syncWithServer() {
  saveToLocalStorage();
  try {
    await fetch('/api/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addresses)
    });
  } catch (e) {}
}

let syncTimeout = null;
function debouncedSync() {
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncWithServer();
  }, 1000);
}

// ==================== 5. РЕНДЕРИНГ ====================
function renderApp() {
  const calculated = addresses.map(calculateItem);
  const totals = calculateTotals(calculated);

  renderSummary(totals);
  renderAddressCards(calculated);
  updateFilterChips(calculated);
}

function renderSummary(totals) {
  document.getElementById('grandTotalDisplay').innerHTML = `${totals.grandTotal.toFixed(2)} <small>грн</small>`;
  document.getElementById('totalSupplyDisplay').textContent = `${totals.totalSupply.toFixed(2)} грн`;
  document.getElementById('totalDrainageDisplay').textContent = `${totals.totalDrainage.toFixed(2)} грн`;
  document.getElementById('totalVolumeDisplay').textContent = `${totals.totalVolume.toFixed(2)} м³`;
  
  const badge = document.getElementById('filledCounterBadge');
  badge.textContent = `${totals.filledCount} / ${totals.totalAddresses} заповнено`;
  if (totals.filledCount === totals.totalAddresses && totals.totalAddresses > 0) {
    badge.style.background = 'rgba(16, 185, 129, 0.2)';
    badge.style.color = '#34d399';
    badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
  } else {
    badge.style.background = 'rgba(56, 189, 248, 0.15)';
    badge.style.color = '#7dd3fc';
    badge.style.borderColor = 'rgba(56, 189, 248, 0.3)';
  }

  // Оновлюємо заголовок секції
  const sectionTitle = document.getElementById('sectionTitle');
  if (sectionTitle) {
    sectionTitle.textContent = `📍 Список адрес (${totals.totalAddresses})`;
  }
}

function updateFilterChips(calculatedList) {
  const filledCount = calculatedList.filter(i => i.hasCurrent && !i.isNegative).length;
  const emptyCount = calculatedList.filter(i => !i.hasCurrent).length;

  const chipAll = document.getElementById('filterChipAll');
  const chipFilled = document.getElementById('filterChipFilled');
  const chipEmpty = document.getElementById('filterChipEmpty');

  if (chipAll) chipAll.textContent = `Всі (${calculatedList.length})`;
  if (chipFilled) chipFilled.textContent = `Заповнені (${filledCount})`;
  if (chipEmpty) chipEmpty.textContent = `Очікують (${emptyCount})`;
}

function renderAddressCards(calculatedList) {
  const container = document.getElementById('addressesList');
  container.innerHTML = '';

  const filtered = calculatedList.filter(item => {
    if (currentFilter === 'filled') return item.hasCurrent && !item.isNegative;
    if (currentFilter === 'empty') return !item.hasCurrent;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="loading-state">
        <p>Немає адрес для обраного фільтра.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((item, index) => {
    const card = document.createElement('div');
    let cardClass = 'address-card';
    let statusBadge = '<span class="card-status-badge badge-empty">Очікує показник</span>';

    if (item.hasCurrent) {
      if (item.isNegative) {
        cardClass += ' card-warning';
        statusBadge = '<span class="card-status-badge badge-error">⚠️ Помилка лічильника</span>';
      } else {
        cardClass += ' card-filled';
        statusBadge = '<span class="card-status-badge badge-done">✓ Розраховано</span>';
      }
    }
    card.className = cardClass;

    const deltaSign = item.delta > 0 ? `+${item.delta.toFixed(2)}` : `${item.delta.toFixed(2)}`;
    const deltaClass = item.isNegative ? 'delta-value negative' : 'delta-value';

    card.innerHTML = `
      <div class="card-header">
        <div class="card-title-group">
          <span class="card-number-badge">${index + 1}</span>
          <span class="card-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
        </div>
        <div class="card-actions-inline">
          <button class="btn-icon-action" onclick="openSingleAddressTariff(${item.id})" title="Редагувати назву або тариф">✏️</button>
          <button class="btn-icon-action btn-delete-card" onclick="openDeleteAddressModal(${item.id})" title="Видалити адресу">🗑️</button>
          ${statusBadge}
        </div>
      </div>

      <!-- Зручний блок для відкриття модального вікна введення показника -->
      <div class="reading-action-section">
        <div class="reading-display-box ${item.hasCurrent ? 'box-filled' : 'box-empty'}" onclick="openReadingModal(${item.id})">
          <div class="reading-box-left">
            <span class="reading-box-label">Показник лічильника</span>
            <div class="reading-values-line">
              <span class="prev-badge">Попер: <b>${item.prev.toFixed(2)} м³</b></span>
              <span class="arrow-separator">➔</span>
              ${item.hasCurrent 
                ? `<span class="curr-badge filled">${item.curr.toFixed(2)} м³</span>` 
                : `<span class="curr-badge empty">✍️ Внести показник</span>`
              }
            </div>
          </div>
          <button class="btn-tap-enter" onclick="event.stopPropagation(); openReadingModal(${item.id})">
            ${item.hasCurrent ? '✏️ Змінити' : '✍️ Ввести'}
          </button>
        </div>
      </div>

      <div class="consumption-delta-row">
        <span class="delta-label">Різниця споживання:</span>
        <span class="${deltaClass}">${item.hasCurrent ? `${deltaSign} м³` : '—'}</span>
      </div>

      <div class="tariffs-inline-row">
        <div class="tariffs-chips">
          <span class="rate-tag">💧 Вода: <b>${item.supplyRate.toFixed(2)} грн</b></span>
          <span class="rate-tag">🔄 Стік: <b>${item.drainageRate.toFixed(2)} грн</b></span>
        </div>
        <button class="btn-card-edit-rates" onclick="openSingleAddressTariff(${item.id})">
          Змінити тариф
        </button>
      </div>

      <div class="card-results-bar">
        <div class="result-cell">
          <div class="cell-caption">💧 Водопостач.</div>
          <div class="cell-sum">${item.hasCurrent && !item.isNegative ? `${item.supplyCost.toFixed(2)}` : '0.00'} грн</div>
        </div>
        <div class="result-cell">
          <div class="cell-caption">🔄 Водовідвед.</div>
          <div class="cell-sum">${item.hasCurrent && !item.isNegative ? `${item.drainageCost.toFixed(2)}` : '0.00'} грн</div>
        </div>
        <div class="result-cell highlight-total">
          <div class="cell-caption">💳 Разом</div>
          <div class="cell-sum">${item.hasCurrent && !item.isNegative ? `${item.totalCost.toFixed(2)}` : '0.00'} грн</div>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// ==================== 6. ВНЕСЕННЯ ПОКАЗНИКА (МОДАЛЬНЕ ВІКНО) ====================
function openReadingModal(id) {
  const item = addresses.find(a => a.id === id);
  if (!item) return;

  activeReadingAddressId = id;
  const index = addresses.findIndex(a => a.id === id);

  document.getElementById('readingModalBadge').textContent = `Адреса #${index + 1}`;
  document.getElementById('readingModalAddressName').textContent = item.name;
  document.getElementById('readingModalPrevVal').textContent = `${(parseFloat(item.previousReading) || 0).toFixed(2)} м³`;

  const input = document.getElementById('inputModalReading');
  input.value = item.currentReading !== '' && item.currentReading !== null ? item.currentReading : '';

  updateModalCalcPreview();
  openModal('readingModal');

  setTimeout(() => {
    input.focus();
    input.select();
  }, 120);
}

function updateModalCalcPreview() {
  if (activeReadingAddressId === null) return;
  const item = addresses.find(a => a.id === activeReadingAddressId);
  if (!item) return;

  const prev = parseFloat(item.previousReading) || 0;
  const inputVal = document.getElementById('inputModalReading').value.trim();
  const supplyRate = parseFloat(item.supplyRate) || 0;
  const drainageRate = parseFloat(item.drainageRate) || 0;

  document.getElementById('modalCalcSupplyRate').textContent = `${supplyRate.toFixed(2)} грн/м³`;
  document.getElementById('modalCalcDrainageRate').textContent = `${drainageRate.toFixed(2)} грн/м³`;

  const warningEl = document.getElementById('modalCalcWarning');

  if (inputVal === '') {
    document.getElementById('modalCalcVolume').textContent = '—';
    document.getElementById('modalCalcSupplyCost').textContent = '0.00 грн';
    document.getElementById('modalCalcDrainageCost').textContent = '0.00 грн';
    document.getElementById('modalCalcTotalCost').textContent = '0.00 грн';
    warningEl.style.display = 'none';
    return;
  }

  const curr = parseFloat(inputVal);
  if (isNaN(curr)) {
    return;
  }

  const delta = round2(curr - prev);
  if (delta < 0) {
    warningEl.style.display = 'block';
    warningEl.textContent = `⚠️ Поточний показник (${curr}) менший за попередній (${prev})!`;
  } else {
    warningEl.style.display = 'none';
  }

  const effective = Math.max(0, delta);
  const supply = round2(effective * supplyRate);
  const drainage = round2(effective * drainageRate);
  const total = round2(supply + drainage);

  document.getElementById('modalCalcVolume').textContent = `${delta > 0 ? '+' : ''}${delta.toFixed(2)} м³`;
  document.getElementById('modalCalcSupplyCost').textContent = `${supply.toFixed(2)} грн`;
  document.getElementById('modalCalcDrainageCost').textContent = `${drainage.toFixed(2)} грн`;
  document.getElementById('modalCalcTotalCost').textContent = `${total.toFixed(2)} грн`;
}

// Слухач на введення в модалці
document.getElementById('inputModalReading').addEventListener('input', updateModalCalcPreview);

// Підтвердження введення кнопкою ОК або Enter
function confirmReading() {
  if (activeReadingAddressId === null) return;
  const item = addresses.find(a => a.id === activeReadingAddressId);
  if (!item) return;

  const inputVal = document.getElementById('inputModalReading').value.trim();
  item.currentReading = inputVal;

  saveToLocalStorage();
  debouncedSync();
  renderApp();
  closeModal('readingModal');
  triggerHaptic('success');
  showToast(`Показник для "${item.name}" збережено! ✅`);
}

document.getElementById('btnModalConfirmReading').addEventListener('click', confirmReading);

document.getElementById('inputModalReading').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmReading();
  }
});

// ==================== 7. ДОДАВАННЯ ТА ВИДАЛЕННЯ АДРЕС ====================
// ДОДАВАННЯ НОВОЇ АДРЕСИ
document.getElementById('btnOpenAddAddress').addEventListener('click', () => {
  const nextNum = addresses.length + 1;
  document.getElementById('newAddressName').value = `Адреса ${nextNum}`;
  document.getElementById('newAddressPrev').value = '0';
  document.getElementById('newAddressSupplyRate').value = '23.00';
  document.getElementById('newAddressDrainageRate').value = '16.50';
  openModal('addAddressModal');
  setTimeout(() => {
    document.getElementById('newAddressName').focus();
  }, 120);
});

document.getElementById('btnSaveNewAddress').addEventListener('click', async () => {
  const name = document.getElementById('newAddressName').value.trim();
  const prev = parseFloat(document.getElementById('newAddressPrev').value) || 0;
  const sRate = parseFloat(document.getElementById('newAddressSupplyRate').value) || 23.00;
  const dRate = parseFloat(document.getElementById('newAddressDrainageRate').value) || 16.50;

  if (!name) {
    showToast('Введіть назву адреси!');
    return;
  }

  const maxId = addresses.reduce((m, item) => Math.max(m, Number(item.id) || 0), 0);
  const newAddr = {
    id: maxId + 1,
    name,
    previousReading: round2(prev),
    currentReading: '',
    supplyRate: round2(sRate),
    drainageRate: round2(dRate)
  };

  addresses.push(newAddr);
  saveToLocalStorage();
  syncWithServer();
  renderApp();
  closeModal('addAddressModal');
  triggerHaptic('success');
  showToast(`Адресу "${name}" успішно додано! ➕`);
});

// ВИДАЛЕННЯ АДРЕСИ
function openDeleteAddressModal(id) {
  const item = addresses.find(a => a.id === id);
  if (!item) return;

  activeDeleteAddressId = id;
  document.getElementById('deleteAddressModalName').textContent = item.name;
  openModal('deleteAddressModal');
}

document.getElementById('btnConfirmDeleteAddress').addEventListener('click', async () => {
  if (activeDeleteAddressId === null) return;
  const id = activeDeleteAddressId;
  const item = addresses.find(a => a.id === id);
  const name = item ? item.name : 'Адреса';

  addresses = addresses.filter(a => a.id !== id);
  saveToLocalStorage();
  
  try {
    await fetch(`/api/address/${id}`, { method: 'DELETE' });
  } catch (e) {}

  renderApp();
  closeModal('deleteAddressModal');
  triggerHaptic('warning');
  showToast(`Адресу "${name}" видалено! 🗑️`);
});

// ==================== 8. МОДАЛЬНІ ВІКНА ТА ДІЇ ====================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.classList.add('modal-open');
    triggerHaptic('light');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    // Перевіряємо чи відкриті інші модалки
    const activeModals = document.querySelectorAll('.modal-overlay.active');
    if (activeModals.length === 0) {
      document.body.classList.remove('modal-open');
    }
  }
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('modal-close') || e.target.getAttribute('data-close')) {
      closeModal(overlay.id);
    }
  });
});

// МОДАЛКА ТАРИФІВ
function renderTariffModal() {
  const list = document.getElementById('tariffAddressesList');
  list.innerHTML = '';

  addresses.forEach(item => {
    const row = document.createElement('div');
    row.className = 'tariff-item-row';
    row.innerHTML = `
      <input 
        type="text" 
        class="tariff-item-title-input" 
        data-id="${item.id}" 
        data-type="name" 
        value="${escapeHtml(item.name)}" 
        placeholder="Назва адреси"
      />
      <div class="tariff-item-rates-grid">
        <div class="tariff-subfield">
          <label>💧 Вода (грн)</label>
          <input 
            type="number" 
            step="0.01" 
            data-id="${item.id}" 
            data-type="supplyRate" 
            value="${item.supplyRate}" 
          />
        </div>
        <div class="tariff-subfield">
          <label>🔄 Стік (грн)</label>
          <input 
            type="number" 
            step="0.01" 
            data-id="${item.id}" 
            data-type="drainageRate" 
            value="${item.drainageRate}" 
          />
        </div>
        <div class="tariff-subfield">
          <label>⏱️ Попередній (м³)</label>
          <input 
            type="number" 
            step="0.01" 
            data-id="${item.id}" 
            data-type="previousReading" 
            value="${item.previousReading}" 
          />
        </div>
      </div>
    `;
    list.appendChild(row);
  });
}

function openSingleAddressTariff(id) {
  renderTariffModal();
  openModal('tariffModal');
  setTimeout(() => {
    const input = document.querySelector(`.tariff-item-rates-grid input[data-id="${id}"][data-type="supplyRate"]`);
    if (input) {
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus();
    }
  }, 200);
}

document.getElementById('btnApplyBulkRates').addEventListener('click', () => {
  const supplyVal = parseFloat(document.getElementById('bulkSupplyRate').value);
  const drainageVal = parseFloat(document.getElementById('bulkDrainageRate').value);

  if (isNaN(supplyVal) && isNaN(drainageVal)) {
    showToast('Введіть хоча б один тариф!');
    return;
  }

  const supplyInputs = document.querySelectorAll('#tariffAddressesList input[data-type="supplyRate"]');
  const drainageInputs = document.querySelectorAll('#tariffAddressesList input[data-type="drainageRate"]');

  if (!isNaN(supplyVal)) {
    supplyInputs.forEach(i => i.value = supplyVal.toFixed(2));
  }
  if (!isNaN(drainageVal)) {
    drainageInputs.forEach(i => i.value = drainageVal.toFixed(2));
  }

  triggerHaptic('medium');
  showToast('Тарифи підставлено у форму! Натисніть "Зберегти тарифи".');
});

document.getElementById('btnSaveTariffs').addEventListener('click', () => {
  const rows = document.querySelectorAll('#tariffAddressesList .tariff-item-row');
  rows.forEach(row => {
    const nameInput = row.querySelector('input[data-type="name"]');
    const supplyInput = row.querySelector('input[data-type="supplyRate"]');
    const drainageInput = row.querySelector('input[data-type="drainageRate"]');
    const prevInput = row.querySelector('input[data-type="previousReading"]');

    const id = parseInt(nameInput.dataset.id, 10);
    const item = addresses.find(a => a.id === id);

    if (item) {
      if (nameInput.value.trim()) item.name = nameInput.value.trim();
      const s = parseFloat(supplyInput.value);
      if (!isNaN(s) && s >= 0) item.supplyRate = round2(s);
      const d = parseFloat(drainageInput.value);
      if (!isNaN(d) && d >= 0) item.drainageRate = round2(d);
      const p = parseFloat(prevInput.value);
      if (!isNaN(p) && p >= 0) item.previousReading = round2(p);
    }
  });

  saveToLocalStorage();
  syncWithServer();
  renderApp();
  closeModal('tariffModal');
  triggerHaptic('success');
  showToast('Тарифи та налаштування успішно збережено!');
});

// ==================== 9. ГЕНЕРАЦІЯ ЗВІТУ ====================
function generateReportText() {
  const calculated = addresses.map(calculateItem);
  const totals = calculateTotals(calculated);

  const now = new Date();
  const dateStr = now.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let text = `💧 ЗВІТ РОЗРАХУНКУ ВОДИ\n`;
  text += `📅 Дата: ${dateStr}\n\n`;

  calculated.forEach((item, idx) => {
    const num = idx + 1;
    if (!item.hasCurrent) {
      text += `${num}. ${item.name}\n`;
      text += `   ⏳ Показник не внесено (Попередній: ${item.prev.toFixed(2)} м³)\n\n`;
      return;
    }

    if (item.isNegative) {
      text += `${num}. ${item.name}\n`;
      text += `   ⚠️ Увага: поточний (${item.curr}) < попередній (${item.prev})!\n\n`;
      return;
    }

    text += `${num}. ${item.name}\n`;
    text += `   • Лічильник: ${item.prev.toFixed(2)} ➔ ${item.curr.toFixed(2)} м³ (Спожито: ${item.effectiveVolume.toFixed(2)} м³)\n`;
    text += `   • 💧 Водопостачання (${item.supplyRate.toFixed(2)} грн): ${item.supplyCost.toFixed(2)} грн\n`;
    text += `   • 🔄 Водовідведення (${item.drainageRate.toFixed(2)} грн): ${item.drainageCost.toFixed(2)} грн\n`;
    text += `   • 💳 Разом по адресі: ${item.totalCost.toFixed(2)} грн\n\n`;
  });

  text += `═════════════════════════════\n`;
  text += `📊 ПІДСУМОК ДО СПЛАТИ:\n`;
  text += `💧 Водопостачання: ${totals.totalSupply.toFixed(2)} грн\n`;
  text += `🔄 Водовідведення: ${totals.totalDrainage.toFixed(2)} грн\n`;
  text += `💰 ЗАГАЛЬНА СУМА: ${totals.grandTotal.toFixed(2)} грн\n`;
  text += `🌊 Загальний об'єм: ${totals.totalVolume.toFixed(2)} м³\n`;
  text += `✅ Заповнено: ${totals.filledCount} із ${totals.totalAddresses} адрес\n`;

  return text;
}

function showReportPreview() {
  const text = generateReportText();
  document.getElementById('reportTextPreview').textContent = text;
  openModal('reportModal');
}

async function copyReportToClipboard() {
  const text = generateReportText();
  try {
    await navigator.clipboard.writeText(text);
    triggerHaptic('success');
    showToast('Звіт скопійовано в буфер обміну! 📋');
  } catch (err) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    triggerHaptic('success');
    showToast('Звіт скопійовано! 📋');
  }
}

async function sendReportToTelegram() {
  const calculated = addresses.map(calculateItem);
  const totals = calculateTotals(calculated);
  const text = generateReportText();

  const chatId = tg?.initDataUnsafe?.user?.id || null;
  const initData = tg?.initData || '';

  const payload = {
    action: 'water_report',
    chatId,
    initData,
    totals,
    text,
    items: calculated.map(c => ({
      id: c.id,
      name: c.name,
      previousReading: c.prev,
      currentReading: c.curr,
      delta: c.delta,
      supplyRate: c.supplyRate,
      drainageRate: c.drainageRate,
      supplyCost: c.supplyCost,
      drainageCost: c.drainageCost,
      totalCost: c.totalCost
    }))
  };

  showToast('Надсилаємо звіт...');

  // 1. Пряма відправка через REST API бота (працює завжди з будь-якого типу запуску Mini App)
  try {
    const res = await fetch('/api/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.sentInChat) {
      triggerHaptic('success');
      showToast('Звіт успішно надіслано у ваш чат Telegram! 🚀');
      return;
    }
  } catch (e) {
    console.warn('Помилка API /send-report:', e);
  }

  // 2. Якщо запущено через Keyboard Button
  if (tg && typeof tg.sendData === 'function') {
    try {
      tg.sendData(JSON.stringify(payload));
      triggerHaptic('success');
      showToast('Звіт надіслано в бот!');
      return;
    } catch (e) {}
  }

  // 3. Резервний варіант (якщо відкрито поза Telegram)
  await copyReportToClipboard();
  showToast('Звіт скопійовано! В чаті бота введіть /report 📋');
}

// ЗАКРИТТЯ ПЕРІОДУ
document.getElementById('btnRolloverPeriod').addEventListener('click', () => {
  const calculated = addresses.map(calculateItem);
  const totals = calculateTotals(calculated);

  if (totals.filledCount === 0) {
    showToast('Жоден поточний показник не заповнено!');
    return;
  }

  openModal('rolloverModal');
});

document.getElementById('btnConfirmRollover').addEventListener('click', async () => {
  const calculated = addresses.map(calculateItem);
  const totals = calculateTotals(calculated);

  const historyEntry = {
    id: Date.now().toString(),
    date: new Date().toISOString(),
    totals,
    items: calculated
  };

  let history = [];
  try {
    const rawHist = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
    if (rawHist) history = JSON.parse(rawHist);
  } catch (e) {}

  history.unshift(historyEntry);
  if (history.length > 50) history.length = 50;
  localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(history));

  addresses = addresses.map(item => {
    const cur = parseFloat(item.currentReading);
    if (!isNaN(cur) && cur >= 0) {
      return {
        ...item,
        previousReading: cur,
        currentReading: ''
      };
    }
    return item;
  });

  saveToLocalStorage();

  try {
    await fetch('/api/rollover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ historyEntry, addresses })
    });
  } catch (e) {}

  closeModal('rolloverModal');
  renderApp();
  triggerHaptic('success');
  showToast('Період закрито! Показники оновлено для нового місяця 🎉');
});

// ІСТОРІЯ РОЗРАХУНКІВ
async function openHistoryModal() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<div class="spinner"></div>';
  openModal('historyModal');

  let history = [];
  try {
    const res = await fetch('/api/history');
    if (res.ok) {
      history = await res.json();
    }
  } catch (e) {}

  if (!history || history.length === 0) {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
      if (raw) history = JSON.parse(raw);
    } catch (e) {}
  }

  if (!history || history.length === 0) {
    list.innerHTML = '<p class="modal-desc" style="text-align:center;">Історія розрахунків поки порожня.</p>';
    return;
  }

  list.innerHTML = '';
  history.forEach(item => {
    const date = new Date(item.createdAt || item.date);
    const dateFormatted = date.toLocaleDateString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const card = document.createElement('div');
    card.className = 'history-card';
    card.innerHTML = `
      <div class="history-card-header">
        <span class="history-date">📅 ${dateFormatted}</span>
        <span class="history-total">${item.totals.grandTotal.toFixed(2)} грн</span>
      </div>
      <div class="history-details">
        <span>💧 Вода: <b>${item.totals.totalSupplyCost?.toFixed(2) || item.totals.totalSupply?.toFixed(2) || '0.00'} грн</b></span>
        <span>🔄 Стік: <b>${item.totals.totalDrainageCost?.toFixed(2) || item.totals.totalDrainage?.toFixed(2) || '0.00'} грн</b></span>
        <span>🌊 Об'єм: <b>${item.totals.totalConsumption?.toFixed(2) || item.totals.totalVolume?.toFixed(2) || '0.00'} м³</b></span>
      </div>
    `;
    list.appendChild(card);
  });
}

// ==================== 10. УТИЛІТИ ТА ПРИВ'ЯЗКА ПОДІЙ ====================
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

document.getElementById('btnTariffModal').addEventListener('click', () => {
  renderTariffModal();
  openModal('tariffModal');
});

document.getElementById('btnHistoryModal').addEventListener('click', openHistoryModal);
document.getElementById('btnQuickReport').addEventListener('click', showReportPreview);
document.getElementById('btnShareReport').addEventListener('click', sendReportToTelegram);
document.getElementById('btnCopyReport').addEventListener('click', copyReportToClipboard);
document.getElementById('btnModalCopy').addEventListener('click', copyReportToClipboard);
document.getElementById('btnModalSendTg').addEventListener('click', sendReportToTelegram);

// Фільтри
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentFilter = chip.dataset.filter;
    triggerHaptic('light');
    renderApp();
  });
});

// Експорт функцій для inline onclick
window.openReadingModal = openReadingModal;
window.openSingleAddressTariff = openSingleAddressTariff;
window.openDeleteAddressModal = openDeleteAddressModal;
window.openEditAddressModal = openSingleAddressTariff;

document.addEventListener('DOMContentLoaded', loadData);
