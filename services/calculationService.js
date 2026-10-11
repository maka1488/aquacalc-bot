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
      totalSupply: totalSupplyCost,
      totalDrainage: totalDrainageCost,
      grandTotal,
      totalConsumption,
      totalVolume: totalConsumption,
      filledCount,
      totalAddresses: items.length
    }
  };
}

/**
 * Генерація красивого тексту звіту для Telegram / повідомлень
 */
function formatReportText(calcResult, periodName = '') {
  if (!calcResult) return '';
  const items = Array.isArray(calcResult.items) ? calcResult.items : [];
  const totals = calcResult.totals || {};

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
    const name = String(item.name || `Адреса ${num}`).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const prev = Number(item.previousReading ?? item.prev ?? 0);
    const currRaw = item.currentReading ?? item.curr;
    const hasCurrent = item.hasCurrent ?? (currRaw !== '' && currRaw !== null && currRaw !== undefined && !isNaN(Number(currRaw)));
    const curr = hasCurrent ? Number(currRaw) : null;
    const isNegative = item.isNegative ?? (curr !== null && curr < prev);

    if (!hasCurrent) {
      text += `<b>${num}. ${name}</b>\n`;
      text += `   ⏳ <i>Показник не внесено</i> (Попередній: ${prev.toFixed(2)} м³)\n\n`;
      return;
    }

    if (isNegative) {
      text += `<b>${num}. ${name}</b>\n`;
      text += `   ⚠️ <i>Увага: поточний показник (${curr}) менший за попередній (${prev.toFixed(2)})!</i>\n\n`;
      return;
    }

    const consumption = Number(item.effectiveConsumption ?? item.effectiveVolume ?? item.delta ?? Math.max(0, (curr || 0) - prev));
    const supplyRate = Number(item.supplyRate ?? 0);
    const drainageRate = Number(item.drainageRate ?? 0);
    const supplyCost = Number(item.supplyCost ?? round2(consumption * supplyRate));
    const drainageCost = Number(item.drainageCost ?? round2(consumption * drainageRate));
    const totalCost = Number(item.totalCost ?? round2(supplyCost + drainageCost));

    text += `<b>${num}. ${name}</b>\n`;
    text += `   • Лічильник: <code>${prev.toFixed(2)}</code> ➔ <code>${(curr !== null ? curr.toFixed(2) : '—')} м³</code>\n`;
    text += `   • Спожито: <b>${consumption.toFixed(2)} м³</b>\n`;
    text += `   • 💧 Водопостачання (${supplyRate.toFixed(2)} грн/м³): <b>${supplyCost.toFixed(2)} грн</b>\n`;
    text += `   • 🔄 Водовідведення (${drainageRate.toFixed(2)} грн/м³): <b>${drainageCost.toFixed(2)} грн</b>\n`;
    text += `   • 💳 Разом по адресі: <b>${totalCost.toFixed(2)} грн</b>\n\n`;
  });

  const totalSupplyCost = Number(totals.totalSupplyCost ?? totals.totalSupply ?? 0);
  const totalDrainageCost = Number(totals.totalDrainageCost ?? totals.totalDrainage ?? 0);
  const grandTotal = Number(totals.grandTotal ?? round2(totalSupplyCost + totalDrainageCost));
  const totalConsumption = Number(totals.totalConsumption ?? totals.totalVolume ?? 0);
  const filledCount = Number(totals.filledCount ?? items.filter(i => (i.currentReading ?? i.curr) !== '' && (i.currentReading ?? i.curr) !== null && (i.currentReading ?? i.curr) !== undefined).length);
  const totalAddresses = Number(totals.totalAddresses ?? items.length);

  text += `════════════════════\n`;
  text += `📊 <b>ПІДСУМОК ДО СПЛАТИ:</b>\n`;
  text += `💧 <b>Водопостачання:</b> <code>${totalSupplyCost.toFixed(2)} грн</code>\n`;
  text += `🔄 <b>Водовідведення:</b> <code>${totalDrainageCost.toFixed(2)} грн</code>\n`;
  text += `💰 <b>ЗАГАЛЬНА СУМА:</b> <b>${grandTotal.toFixed(2)} грн</b>\n`;
  text += `🌊 <b>Загальний об'єм води:</b> ${totalConsumption.toFixed(2)} м³\n`;
  text += `✅ <b>Заповнено адрес:</b> ${filledCount} із ${totalAddresses}\n`;

  return text;
}

module.exports = {
  round2,
  calculateAddress,
  calculateAll,
  formatReportText
};
