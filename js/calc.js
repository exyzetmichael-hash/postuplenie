// Логика калькулятора проходимости.
// Не тянет ничего из сети — считает только по тому, что лежит в data.js.
(function () {
  const EDGE_MARGIN = 3; // +-3 балла от проходного считаем "на грани"

  function achievementFor(vuz) {
    const table = window.APP_DATA.individualAchievements;
    if (table[vuz]) return table[vuz];
    // ВШЭ СПб / ВШЭ Москва и т.п. — ищем по первому слову вуза
    const key = Object.keys(table).find(k => k !== '_comment' && vuz.startsWith(k));
    return key ? table[key] : { bonus: 0, cap: 0 };
  }

  function effectiveScore(vuz) {
    const a = achievementFor(vuz);
    const bonus = typeof a.bonus === 'number' ? a.bonus : 0;
    return window.APP_DATA.yourScore.sum + bonus;
  }

  // Возвращает { status, label, detail, effectiveScore }
  // status: 'unavailable' | 'bvi_only' | 'pass' | 'edge' | 'fail' | 'unknown'
  function evaluateProgram(p) {
    const score = effectiveScore(p.vuz);

    if (p.unavailable) {
      return {
        status: 'unavailable',
        label: 'Недоступно',
        detail: p.unavailableReason || 'ЕГЭ не подходит',
        effectiveScore: score
      };
    }

    if (p.budgetOnlyBVI) {
      const hasPaidOption = p.priceYear != null && !p.noPaidSeats;
      return {
        status: 'bvi_only',
        label: 'Бюджет практически только БВИ',
        detail: (p.prokhBudgetNote || 'Бюджетные места фактически заняты олимпиадниками — по общему конкурсу шансов почти нет.') +
          (hasPaidOption ? ' Есть платное место как запасной вариант.' : ' Платных мест нет.'),
        effectiveScore: score
      };
    }

    if (typeof p.prokhBudget === 'number') {
      const diff = score - p.prokhBudget;
      let status, label;
      if (diff >= EDGE_MARGIN) {
        status = 'pass';
        label = `Проходишь по баллам (запас ${diff})`;
      } else if (diff >= -EDGE_MARGIN) {
        status = 'edge';
        label = `На грани (${diff >= 0 ? '+' : ''}${diff})`;
      } else {
        status = 'fail';
        label = `Не проходишь по баллам (не хватает ${Math.abs(diff)})`;
      }
      const approxNote = p.prokhBudgetApprox
        ? ' ⚠ Проходной — не точная официальная цифра, требует проверки.'
        : '';
      return { status, label, detail: (p.prokhBudgetNote || '') + approxNote, effectiveScore: score };
    }

    return {
      status: 'unknown',
      label: 'Нет данных о проходном',
      detail: p.prokhBudgetNote || 'Официальный проходной по этой программе не публиковался или не найден.',
      effectiveScore: score
    };
  }

  window.CALC = { achievementFor, effectiveScore, evaluateProgram, EDGE_MARGIN };
})();
