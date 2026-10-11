// index.js
// Головний сервер: Telegram Mini App & Bot для розрахунку вартості води для 10 адрес
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const { Telegraf, Markup } = require('telegraf');

const storageService = require('./services/storageService');
const calculationService = require('./services/calculationService');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const hasValidBotToken = BOT_TOKEN && 
  BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN_HERE' && 
  !BOT_TOKEN.includes('YOUR_');

const PORT = process.env.PORT || 3005;
let currentWebAppUrl = process.env.WEBAPP_URL || '';
let tunnelProcess = null;

// ==================== 1. EXPRESS WEB APP & API ====================
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Отримати список всіх 10 адрес
app.get('/api/addresses', (req, res) => {
  try {
    const list = storageService.getAddresses();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Зберегти список адрес (оновлення показників чи назв)
app.post('/api/addresses', (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      storageService.saveAddresses(req.body);
      res.json({ success: true, count: req.body.length });
    } else {
      res.status(400).json({ error: 'Очікується масив адрес' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Оновити одну адресу
app.post('/api/address/:id', (req, res) => {
  try {
    const updated = storageService.updateAddress(req.params.id, req.body);
    if (updated) {
      res.json({ success: true, address: updated });
    } else {
      res.status(404).json({ error: 'Адресу не знайдено' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Додати нову адресу
app.post('/api/address', (req, res) => {
  try {
    const created = storageService.addAddress(req.body);
    res.json({ success: true, address: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Видалити адресу
app.delete('/api/address/:id', (req, res) => {
  try {
    const ok = storageService.deleteAddress(req.params.id);
    if (ok) {
      res.json({ success: true, message: 'Адресу видалено' });
    } else {
      res.status(404).json({ error: 'Адресу не знайдено' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Розрахунок показників
app.post('/api/calculate', (req, res) => {
  try {
    const addressesList = Array.isArray(req.body) ? req.body : storageService.getAddresses();
    const result = calculationService.calculateAll(addressesList);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Отримати історію розрахунків
app.get('/api/history', (req, res) => {
  try {
    const history = storageService.getHistory();
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Закриття періоду (поточні показники стають попередніми)
app.post('/api/rollover', (req, res) => {
  try {
    const { historyEntry, addresses: updatedAddresses } = req.body;
    if (historyEntry) {
      storageService.addHistoryEntry(historyEntry);
    }
    if (Array.isArray(updatedAddresses)) {
      storageService.saveAddresses(updatedAddresses);
    } else {
      storageService.rolloverPeriod();
    }
    res.json({ success: true, message: 'Період закрито' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Надіслати звіт у чат Telegram через API
app.post('/api/send-report', async (req, res) => {
  try {
    const { totals, items, initData, chatId: bodyChatId } = req.body;
    
    // Якщо передано об'єкт звіту, зберігаємо в історію
    if (totals && items) {
      storageService.addHistoryEntry({ totals, items });
    }

    let sent = false;
    let targetChatId = bodyChatId;

    if (!targetChatId && initData) {
      try {
        const params = new URLSearchParams(initData);
        const userStr = params.get('user');
        if (userStr) {
          const userObj = JSON.parse(userStr);
          targetChatId = userObj.id;
        }
      } catch (parseErr) {
        console.warn('Не вдалося розпарсити user з initData:', parseErr.message);
      }
    }

    if (bot && targetChatId) {
      try {
        const htmlMessage = calculationService.formatReportText({ items, totals });
        await bot.telegram.sendMessage(targetChatId, htmlMessage, { parse_mode: 'HTML' });
        console.log(`[Telegram Report] Звіт успішно надіслано користувачу з ID: ${targetChatId}`);
        sent = true;
      } catch (tgErr) {
        console.error('Помилка відправки повідомлення в Telegram:', tgErr.message);
      }
    } else {
      console.warn('[Telegram Report] targetChatId не знайдено (користувач відкрив не з Telegram або без ID)');
    }

    res.json({ success: true, sentInChat: sent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 2. TELEGRAF TELEGRAM BOT ====================
let bot = null;

if (hasValidBotToken) {
  bot = new Telegraf(BOT_TOKEN);

  // Логування всіх вхідних повідомлень для діагностики
  bot.use((ctx, next) => {
    if (ctx.message) {
      console.log(`[Telegram Повідомлення] від ${ctx.from?.first_name || 'користувач'} (@${ctx.from?.username || ctx.from?.id}): "${ctx.message.text || 'дія'}"`);
    }
    return next();
  });

  // Головне меню кнопок
  function getMainKeyboard() {
    const buttons = [];
    if (currentWebAppUrl) {
      buttons.push([Markup.button.webApp('💧 Відкрити Mini App (Розрахунок)', currentWebAppUrl)]);
    }
    buttons.push(['📊 Поточний розрахунок', '⚙️ Актуальні тарифи']);
    buttons.push(['📜 Останні звіти', 'ℹ️ Як користуватись']);
    return Markup.keyboard(buttons).resize();
  }

  // Інлайн клавіатура: WebApp + Пряме посилання у браузер
  function getInlineWebAppKeyboard() {
    if (currentWebAppUrl) {
      return Markup.inlineKeyboard([
        [Markup.button.webApp('💧 Відкрити Mini App в Telegram', currentWebAppUrl)],
        [Markup.button.url('🌐 Відкрити у звичайному браузері', currentWebAppUrl)]
      ]);
    }
    return null;
  }

  // Команда /start
  bot.start(async (ctx) => {
    const userName = ctx.from.first_name || 'користувачу';

    if (currentWebAppUrl && ctx.chat?.id) {
      ctx.setChatMenuButton({
        type: 'web_app',
        text: '💧 Розрахунок води',
        web_app: { url: currentWebAppUrl }
      }).catch(() => {});
    }

    const welcomeMsg =
      `💧 <b>Вітаю, ${userName}!</b>\n\n` +
      `Я бот для точного обліку та розрахунку <b>оплати за воду по адресах</b>.\n\n` +
      `🔹 <b>Як користуватись:</b>\n` +
      `1. Натисніть кнопку <b>«💧 Відкрити Mini App в Telegram»</b> нижче.\n` +
      `2. Для кожної адреси натисніть <b>«✍️ Внести показник»</b> — відкриється окреме віконце з кнопкою ОК.\n` +
      `3. Окремо розраховується:\n` +
      `   • 💧 <b>Водопостачання</b> (м³ × ціна води)\n` +
      `   • 🔄 <b>Водовідведення</b> (м³ × ціна стоку)\n` +
      `   • 💳 <b>Разом до сплати</b>\n` +
      `4. Ви можете додавати нові адреси (кнопка ➕) та видаляти непотрібні (кошик 🗑️).\n\n` +
      `🔗 <b>Пряме посилання:</b>\n<a href="${currentWebAppUrl || 'http://localhost:3005'}">${currentWebAppUrl || 'http://localhost:3005'}</a>`;

    const inlineKb = getInlineWebAppKeyboard();
    await ctx.reply(welcomeMsg, {
      parse_mode: 'HTML',
      reply_markup: inlineKb ? inlineKb.reply_markup : getMainKeyboard().reply_markup
    });
  });

  // Обробка даних з Mini App (коли користувач натискає "Надіслати в Telegram")
  bot.on('message', async (ctx, next) => {
    if (ctx.message.web_app_data) {
      try {
        const rawData = ctx.message.web_app_data.data;
        const payload = JSON.parse(rawData);

        if (payload.action === 'water_report' && payload.totals && payload.items) {
          // Зберігаємо звіт
          storageService.addHistoryEntry({
            totals: payload.totals,
            items: payload.items
          });

          // Формуємо красиве повідомлення
          const formattedText = calculationService.formatReportText(payload);
          await ctx.reply(formattedText, { parse_mode: 'HTML' });
          return;
        }
      } catch (err) {
        console.error('Помилка обробки web_app_data:', err);
      }
    }
    return next();
  });

  // Команда /report або кнопка "📊 Поточний розрахунок"
  bot.hears(['📊 Поточний розрахунок', '/report', '/calc'], async (ctx) => {
    try {
      const list = storageService.getAddresses();
      const calcResult = calculationService.calculateAll(list);
      const reportHtml = calculationService.formatReportText(calcResult);

      const inlineKb = getInlineWebAppKeyboard();
      await ctx.reply(reportHtml, {
        parse_mode: 'HTML',
        reply_markup: inlineKb ? inlineKb.reply_markup : undefined
      });
    } catch (err) {
      await ctx.reply(`Помилка формування звіту: ${err.message}`);
    }
  });

  // Команда /tariffs або кнопка "⚙️ Актуальні тарифи"
  bot.hears(['⚙️ Актуальні тарифи', '/tariffs'], async (ctx) => {
    const list = storageService.getAddresses();
    let text = `⚙️ <b>АКТУАЛЬНІ ТАРИФИ ПО 10 АДРЕСАХ:</b>\n`;
    text += `────────────────────\n`;

    list.forEach((item, idx) => {
      text += `<b>${idx + 1}. ${item.name}</b>\n`;
      text += `   • 💧 Водопостачання: <b>${item.supplyRate.toFixed(2)} грн/м³</b>\n`;
      text += `   • 🔄 Водовідведення: <b>${item.drainageRate.toFixed(2)} грн/м³</b>\n`;
      text += `   • ⏱️ Попередній показник: <code>${item.previousReading.toFixed(2)} м³</code>\n\n`;
    });

    text += `💡 <i>Змінити тарифи або показники можна безпосередньо у Mini App.</i>`;

    const inlineKb = getInlineWebAppKeyboard();
    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: inlineKb ? inlineKb.reply_markup : undefined
    });
  });

  // Команда /history або кнопка "📜 Останні звіти"
  bot.hears(['📜 Останні звіти', '/history'], async (ctx) => {
    const history = storageService.getHistory();
    if (!history || history.length === 0) {
      await ctx.reply('📜 Історія розрахунків поки що порожня. Відкрийте Mini App і сформуйте перший звіт!');
      return;
    }

    let text = `📜 <b>ОСТАННІ ЗВІТИ З ІСТОРІЇ:</b>\n\n`;
    history.slice(0, 5).forEach((h, idx) => {
      const d = new Date(h.createdAt || h.date);
      const dateStr = d.toLocaleDateString('uk-UA', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const t = h.totals || {};
      text += `<b>#${idx + 1} (${dateStr}):</b>\n`;
      text += `   • 💧 Водопостачання: <b>${(t.totalSupplyCost || t.totalSupply || 0).toFixed(2)} грн</b>\n`;
      text += `   • 🔄 Водовідведення: <b>${(t.totalDrainageCost || t.totalDrainage || 0).toFixed(2)} грн</b>\n`;
      text += `   • 💰 Разом: <b>${(t.grandTotal || 0).toFixed(2)} грн</b> (🌊 ${(t.totalConsumption || t.totalVolume || 0).toFixed(2)} м³)\n\n`;
    });

    await ctx.reply(text, { parse_mode: 'HTML' });
  });

  // Довідка
  bot.hears(['ℹ️ Як користуватись', '/help'], async (ctx) => {
    const helpText =
      `ℹ️ <b>ІНСТРУКЦІЯ З КОРИСТУВАННЯ AQUACALC:</b>\n\n` +
      `1️⃣ Натисніть кнопку <b>"💧 Відкрити Mini App"</b> внизу.\n` +
      `2️⃣ Для кожної з 10 адрес введіть <b>поточний показник</b> лічильника у відповідне поле.\n` +
      `3️⃣ Додаток миттєво підрахує різницю і відобразить:\n` +
      `   • Суму за водопостачання\n` +
      `   • Суму за водовідведення\n` +
      `   • Загальну суму по адресі та підсумок за всіма 10 адресами.\n` +
      `4️⃣ Потрібно змінити тариф? Натисніть <b>"Змінити тариф"</b> на картці адреси або зверху в меню <b>"⚙️ Тарифи"</b>.\n` +
      `5️⃣ Натисніть <b>"🚀 Надіслати в Telegram"</b> для збереження або <b>"📋 Копіювати"</b>.\n` +
      `6️⃣ Наприкінці місяця скористайтеся кнопкою <b>"🔄 Закрити період"</b>, щоб перенести поточні показники в попередні для наступного розрахунку!`;

    await ctx.reply(helpText, { parse_mode: 'HTML' });
  });

  // Оновлення кнопки меню Telegram Bot при наявності WebApp URL
  async function updateMenuButton(url) {
    if (!bot || !url) return;
    try {
      await bot.telegram.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: '💧 Розрахунок води',
          web_app: { url }
        }
      });
      console.log(`[Telegram] Menu Button оновлено на URL: ${url}`);
    } catch (e) {
      console.warn('[Telegram] Не вдалося оновити Menu Button:', e.message);
    }
  }

  // Запуск бота
  bot.telegram.getMe().then(botInfo => {
    console.log(`🤖 Telegram Бот @${botInfo.username} (${botInfo.first_name}) успішно підключено!`);
    if (currentWebAppUrl) {
      updateMenuButton(currentWebAppUrl);
    }
  }).catch(err => {
    console.error('Помилка авторизації бота:', err.message);
  });

  bot.launch().catch(err => {
    console.error('Помилка запуску Telegram Бота:', err.message);
  });

  process.once('SIGINT', () => bot && bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot && bot.stop('SIGTERM'));
} else {
  console.log('⚠️ BOT_TOKEN не знайдено або не налаштовано в .env.');
  console.log('💡 Ви можете користуватись додатком локально у браузері або додати токен від @BotFather до файлу .env');
}

// ==================== 3. АВТОМАТИЧНИЙ CLOUDFLARE TUNNEL ====================
function startCloudflareTunnel(port) {
  const cloudflaredPath = path.join(__dirname, 'cloudflared.exe');
  if (!fs.existsSync(cloudflaredPath)) {
    console.log('ℹ️ cloudflared.exe не знайдено в папці проекту. Тунель не запускається автоматично.');
    return;
  }

  console.log('🌐 Запуск Cloudflare Tunnel для створення публічного HTTPS посилання (HTTP/2)...');
  try {
    tunnelProcess = spawn(cloudflaredPath, ['tunnel', '--protocol', 'http2', '--url', `http://localhost:${port}`]);

    const handleOutput = (data) => {
      const output = data.toString();
      const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match && !currentWebAppUrl) {
        currentWebAppUrl = match[0];
        console.log(`\n🎉 ========================================================`);
        console.log(`🚀 CLOUDFLARE TUNNEL АКТИВНИЙ!`);
        console.log(`🔗 Публічний HTTPS URL для Telegram Mini App: ${currentWebAppUrl}`);
        console.log(`========================================================\n`);

        if (bot && typeof bot.telegram !== 'undefined') {
          bot.telegram.setChatMenuButton({
            menu_button: {
              type: 'web_app',
              text: '💧 Розрахунок води',
              web_app: { url: currentWebAppUrl }
            }
          }).then(() => {
            console.log(`[Telegram] Menu Button оновлено на URL: ${currentWebAppUrl}`);
          }).catch((err) => {
            console.warn('[Telegram] Menu Button notice:', err.message);
          });
        }
      }
    };

    tunnelProcess.stdout.on('data', handleOutput);
    tunnelProcess.stderr.on('data', handleOutput);

    tunnelProcess.on('error', (err) => {
      console.warn('Помилка процесу cloudflared:', err.message);
    });
  } catch (err) {
    console.warn('Не вдалося запустити cloudflared:', err.message);
  }
}

// ==================== 4. СТАРТ СЕРВЕРА ====================
app.listen(PORT, () => {
  console.log(`\n💧 AquaCalc сервер запущено на http://localhost:${PORT}`);
  console.log(`📱 Локальний доступ у браузері: http://localhost:${PORT}`);
  
  // Якщо URL не задано вручну і тунель дозволено
  if (!process.env.WEBAPP_URL && process.env.AUTO_TUNNEL !== 'false') {
    startCloudflareTunnel(PORT);
  }
});
