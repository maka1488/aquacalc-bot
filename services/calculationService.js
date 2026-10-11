// services/calculationService.js

/**
 * Округлення до 2 знаків після коми
 */
function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

/**
 * Розрахунок показників по одній адресі
 */
function calculateAddress(item) {
  const prev = parseFloat(item.previousReading) || 0;
  const hasCurrent = item.currentReading !== '' && item.currentReading !== null && item.currentReading !== undefined;
  const curr = hasCurrent ? parseFloat(item.currentReading) : null;
  const supplyRate = parseFloat(item.supplyRate) || 0;
  const drainageRate = parseFloat(item.drainageRate) || 0;

  let consumption = 0;
  let isNegative = false;

  if (curr !== null && !isNaN(curr)) {
    consumption = round2(curr - prev);
    if (consumption < 0) {
      isNegative = true;
    }
  }

  const effectiveConsumption = Math.max(0, consumption);
  const supplyCost = round2(effectiveConsumption * supplyRate);
  const drainageCost = round2(effectiveConsumption * drainageRate);
  const totalCost = round2(supplyCost + drainageCost);

  return {
    id: item.id,
    name: item.name || `Адреса ${item.id}`,
    previousReading: prev,
    currentReading: curr,
    hasCurrent,
    consumption,
    effectiveConsumption,
    isNegative,
    supplyRate,
    drainageRate,
    supplyCost,
    drainageCost,
    totalCost,
    note: item.note || ''
  };
}

/**
 * Повний розрахунок для списку адрес
 */
function calculateAll(addressesList) {
  const items = addressesList.map(calculateAddress);

  let totalSupplyCost = 0;
  let totalDrainageCost = 0;
  let totalConsumption = 0;
  let filledCount = 0;

  for (const item of items) {
    if (item.hasCurrent && !item.isNegative) {
      totalSupplyCost += item.supplyCost;
      totalDrainageCost += item.drainageCost;
      totalConsumption += item.effectiveConsumption;
      filledCount++;
    }
  }

  totalSupplyCost = round2(totalSupplyCost);
  totalDrainageCost = round2(totalDrainageCost);
  totalConsumption = round2(totalConsumption);
  const grandTotal = round2(totalSupplyCost + totalDrainageCost);

  return {
    items,
    totals: {
      totalSupplyCost,
      totalDrainageCost,
      grandTotal,
      totalConsumption,
      filledCount,
      totalAddresses: items.length
    }
  };
}

/**
 * Генерація красивого тексту звіту для Telegram / повідомлень
 */
function formatReportText(calcResult, periodName = '') {
  const { items, totals } = calcResult;
  const now = new Date();
  const dateStr = now.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  let text = `💧 <b>ЗВІТ НАРАХУВАНЬ ЗА ВОДУ</b>\n`;
  if (periodName) {
    text += `📅 <b>Період:</b> ${periodName}\n`;
  }
  text += `🕒 <i>${dateStr}</i>\n\n`;

  text += `<b>📍 ДЕТАЛІ ПО АДРЕСАХ:</b>\n`;
  text += `────────────────────\n`;

  items.forEach((item, idx) => {
    const num = idx + 1;
    const name = item.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    if (!item.hasCurrent) {
      text += `<b>${num}. ${name}</b>\n`;
      text += `   ⏳ <i>Показник не внесено</i> (Попередній: ${item.previousReading.toFixed(2)} м³)\n\n`;
      return;
    }

    if (item.isNegative) {
      text += `<b>${num}. ${name}</b>\n`;
      text += `   ⚠️ <i>Увага: поточний показник (${item.currentReading}) менший за попередній (${item.previousReading})!</i>\n\n`;
      return;
    }

    text += `<b>${num}. ${name}</b>\n`;
    text += `   • Лічильник: <code>${item.previousReading.toFixed(2)}</code> ➔ <code>${item.currentReading.toFixed(2)} м³</code>\n`;
    text += `   • Спожито: <b>${item.effectiveConsumption.toFixed(2)} м³</b>\n`;
    text += `   • 💧 Водопостачання (${item.supplyRate.toFixed(2)} грн/м³): <b>${item.supplyCost.toFixed(2)} грн</b>\n`;
    text += `   • 🔄 Водовідведення (${item.drainageRate.toFixed(2)} грн/м³): <b>${item.drainageCost.toFixed(2)} грн</b>\n`;
    text += `   • 💳 Разом по адресі: <b>${item.totalCost.toFixed(2)} грн</b>\n\n`;
  });

  text += `════════════════════\n`;
  text += `📊 <b>ПІДСУМОК ДО СПЛАТИ:</b>\n`;
  text += `💧 <b>Водопостачання:</b> <code>${totals.totalSupplyCost.toFixed(2)} грн</code>\n`;
  text += `🔄 <b>Водовідведення:</b> <code>${totals.totalDrainageCost.toFixed(2)} грн</code>\n`;
  text += `💰 <b>ЗАГАЛЬНА СУМА:</b> <b>${totals.grandTotal.toFixed(2)} грн</b>\n`;
  text += `🌊 <b>Загальний об'єм води:</b> ${totals.totalConsumption.toFixed(2)} м³\n`;
  text += `✅ <b>Заповнено адрес:</b> ${totals.filledCount} із ${totals.totalAddresses}\n`;

  return text;
}

module.exports = {
  round2,
  calculateAddress,
  calculateAll,
  formatReportText
};
