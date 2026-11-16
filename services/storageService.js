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
    syncToTelegramCloud(addresses);
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

// ==================== TELEGRAM CLOUD STORAGE ====================
let tgBot = null;
let cloudSyncTimeout = null;

function formatStorageMessage(addresses) {
  const dateStr = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });
  const b64 = Buffer.from(JSON.stringify(addresses)).toString('base64');
  
  let text = `💧 <b>AquaCalc: Хмарне сховище показників 24/7</b>\n`;
  text += `<i>Останнє оновлення: ${dateStr}</i>\n\n`;
  
  addresses.forEach((item, idx) => {
    const currStr = item.currentReading !== '' && item.currentReading !== null && item.currentReading !== undefined
      ? `<b>${item.currentReading} м³</b>`
      : `<i>(очікує)</i>`;
    text += `${idx + 1}. <b>${item.name}</b>: ${item.previousReading} ➔ ${currStr}\n`;
  });
  
  text += `\n📌 <i>Це закріплене повідомлення забезпечує збереження даних при перезапусках Render. Не відкріплюйте його.</i>\n\n`;
  text += `<tg-spoiler>#AQUACALC_DATA#${b64}#END#</tg-spoiler>`;
  return text;
}

function parseAddressesFromMessage(msgText) {
  if (!msgText) return null;
  const match = msgText.match(/#AQUACALC_DATA#([A-Za-z0-9+/=]+)#END#/);
  if (!match) return null;
  try {
    const raw = Buffer.from(match[1], 'base64').toString('utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.error('[Telegram Storage] Помилка декодування base64:', err.message);
  }
  return null;
}

async function initTelegramCloud(botInstance) {
  if (!botInstance) return;
  tgBot = botInstance;
  const adminId = getAdminChatId();
  if (!adminId) return;

  try {
    const chat = await tgBot.telegram.getChat(adminId);
    let cloudAddresses = null;
    let pinnedMsgId = null;

    if (chat && chat.pinned_message) {
      pinnedMsgId = chat.pinned_message.message_id;
      cloudAddresses = parseAddressesFromMessage(chat.pinned_message.text);
    }

    const cfg = getConfig();
    if (pinnedMsgId) {
      cfg.pinnedMessageId = pinnedMsgId;
      saveConfig(cfg);
    }

    if (cloudAddresses && Array.isArray(cloudAddresses) && cloudAddresses.length > 0) {
      console.log(`[Telegram Storage] Знайдено збережені дані в закріпленому повідомленні #${pinnedMsgId} (${cloudAddresses.length} адрес).`);
      
      const local = getAddresses();
      const cloudHasReadings = cloudAddresses.some(a => a.currentReading !== '' && a.currentReading !== null && a.currentReading !== undefined);
      const localHasReadings = local.some(a => a.currentReading !== '' && a.currentReading !== null && a.currentReading !== undefined);

      if (cloudHasReadings || !localHasReadings || cloudAddresses.length !== local.length) {
        fs.writeFileSync(ADDRESSES_FILE, JSON.stringify(cloudAddresses, null, 2), 'utf-8');
        console.log('✅ [Telegram Storage] Дані адрес та показників успішно відновлено з Telegram Cloud!');
      }
    } else {
      console.log('[Telegram Storage] Створюємо початкове закріплене повідомлення бази даних...');
      const currentList = getAddresses();
      const msgText = formatStorageMessage(currentList);
      const sent = await tgBot.telegram.sendMessage(adminId, msgText, {
        parse_mode: 'HTML',
        disable_notification: true
      });
      await tgBot.telegram.pinChatMessage(adminId, sent.message_id, { disable_notification: true }).catch(() => {});
      cfg.pinnedMessageId = sent.message_id;
      saveConfig(cfg);
      console.log(`✅ [Telegram Storage] Створено та закріплено нове сховище повідомлення #${sent.message_id}`);
    }
  } catch (err) {
    console.warn('[Telegram Storage] Не вдалося ініціалізувати хмарне сховище в Telegram:', err.message);
  }
}

function syncToTelegramCloud(addresses) {
  if (!tgBot) return;
  const adminId = getAdminChatId();
  if (!adminId) return;

  clearTimeout(cloudSyncTimeout);
  cloudSyncTimeout = setTimeout(async () => {
    try {
      const cfg = getConfig();
      let msgId = cfg.pinnedMessageId;
      const msgText = formatStorageMessage(addresses);

      if (msgId) {
        try {
          await tgBot.telegram.editMessageText(adminId, msgId, null, msgText, { parse_mode: 'HTML' });
          return;
        } catch (editErr) {
          // Якщо ID повідомлення застаріло, шукаємо в закріплених
        }
      }

      const chat = await tgBot.telegram.getChat(adminId);
      if (chat && chat.pinned_message && chat.pinned_message.text && chat.pinned_message.text.includes('#AQUACALC_DATA#')) {
        cfg.pinnedMessageId = chat.pinned_message.message_id;
        saveConfig(cfg);
        await tgBot.telegram.editMessageText(adminId, chat.pinned_message.message_id, null, msgText, { parse_mode: 'HTML' });
      } else {
        const sent = await tgBot.telegram.sendMessage(adminId, msgText, { parse_mode: 'HTML', disable_notification: true });
        await tgBot.telegram.pinChatMessage(adminId, sent.message_id, { disable_notification: true }).catch(() => {});
        cfg.pinnedMessageId = sent.message_id;
        saveConfig(cfg);
      }
    } catch (e) {
      console.warn('[Telegram Storage] Помилка оновлення Telegram Cloud:', e.message);
    }
  }, 400);
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
  getAdminChatId,
  initTelegramCloud,
  syncToTelegramCloud
};

