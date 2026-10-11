// services/storageService.js
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ADDRESSES_FILE = path.join(DATA_DIR, 'addresses.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

// Переконуємось, що папка data існує
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getDefaultAddresses() {
  return [
    { id: 1, name: 'Ряшівська 9', previousReading: 2169, currentReading: '', supplyRate: 37.00, drainageRate: 21.00, note: '' },
    { id: 2, name: 'Вагонна 20', previousReading: 1250, currentReading: '', supplyRate: 37.00, drainageRate: 21.00, note: '' },
    { id: 3, name: 'Кульпарківська 176', previousReading: 865, currentReading: '', supplyRate: 37.00, drainageRate: 21.00, note: '' },
    { id: 4, name: 'Хоткевича 28', previousReading: 998, currentReading: '', supplyRate: 37.00, drainageRate: 21.00, note: '' },
    { id: 5, name: 'ЧК 67', previousReading: 193, currentReading: '', supplyRate: 37.00, drainageRate: 21.00, note: '' },
    { id: 6, name: 'Антоненка-Давидовича 1', previousReading: 24, currentReading: '', supplyRate: 37.00, drainageRate: 21.00, note: '' },
    { id: 7, name: 'ЧК98', previousReading: 1705, currentReading: '', supplyRate: 37.00, drainageRate: 21.00, note: '' }
  ];
}

function getAddresses() {
  try {
    if (!fs.existsSync(ADDRESSES_FILE)) {
      const def = getDefaultAddresses();
      fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(def, null, 2), 'utf-8');
      return def;
    }
    const raw = fs.readFileSync(ADDRESSES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return getDefaultAddresses();
  } catch (err) {
    console.error('Помилка читання addresses.json:', err);
    return getDefaultAddresses();
  }
}

function saveAddresses(addresses) {
  try {
    fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(addresses, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Помилка запису addresses.json:', err);
    return false;
  }
}

function updateAddress(id, patch) {
  const list = getAddresses();
  const index = list.findIndex(a => a.id === Number(id));
  if (index !== -1) {
    list[index] = { ...list[index], ...patch };
    saveAddresses(list);
    return list[index];
  }
  return null;
}

function getHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      fs.writeFileSync(HISTORY_FILE, '[]', 'utf-8');
      return [];
    }
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Помилка читання history.json:', err);
    return [];
  }
}

function addHistoryEntry(entry) {
  try {
    const history = getHistory();
    const newEntry = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      ...entry
    };
    history.unshift(newEntry);
    // Зберігаємо останні 100 звітів
    if (history.length > 100) {
      history.length = 100;
    }
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
    return newEntry;
  } catch (err) {
    console.error('Помилка збереження history.json:', err);
    return null;
  }
}

function deleteHistoryEntry(id) {
  try {
    const history = getHistory();
    const initialLen = history.length;
    const filtered = history.filter(item => String(item.id) !== String(id));
    if (filtered.length !== initialLen) {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
      return true;
    }
  } catch (err) {
    console.error('Помилка видалення запису з history.json:', err);
  }
  return false;
}

function addAddress(newAddress) {
  const list = getAddresses();
  const maxId = list.reduce((m, item) => Math.max(m, Number(item.id) || 0), 0);
  const created = {
    id: maxId + 1,
    name: newAddress.name?.trim() || `Адреса ${maxId + 1}`,
    previousReading: parseFloat(newAddress.previousReading) || 0,
    currentReading: '',
    supplyRate: parseFloat(newAddress.supplyRate) || 23.00,
    drainageRate: parseFloat(newAddress.drainageRate) || 16.50,
    note: newAddress.note || ''
  };
  list.push(created);
  saveAddresses(list);
  return created;
}

function deleteAddress(id) {
  let list = getAddresses();
  const initialLen = list.length;
  list = list.filter(item => item.id !== Number(id));
  if (list.length !== initialLen) {
    saveAddresses(list);
    return true;
  }
  return false;
}

function rolloverPeriod() {
  const list = getAddresses();
  const updated = list.map(item => {
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
  saveAddresses(updated);
  return updated;
}

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function getConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {}
  return { adminChatId: process.env.ADMIN_CHAT_ID || 521075324, adminUsername: 'nicetry00' };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {}
}

function setAdminChatId(chatId) {
  const cfg = getConfig();
  cfg.adminChatId = chatId;
  saveConfig(cfg);
  return cfg;
}

function getAdminChatId() {
  const cfg = getConfig();
  return cfg.adminChatId || process.env.ADMIN_CHAT_ID || 521075324;
}

module.exports = {
  getAddresses,
  saveAddresses,
  updateAddress,
  addAddress,
  deleteAddress,
  getHistory,
  addHistoryEntry,
  deleteHistoryEntry,
  rolloverPeriod,
  getConfig,
  setAdminChatId,
  getAdminChatId
};

