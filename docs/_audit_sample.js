const fs = require('fs');

function parseOrders(text) {
  const parts = text.split(/(?=نوع الطلب:)/).filter((p) => p.trim().startsWith('نوع الطلب:'));
  return parts.map((block) => {
    const pick = (label, nextLabels) => {
      const next = nextLabels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const re = new RegExp(label + ':\\n([\\s\\S]*?)(?=\\n(?:' + next + '):|$)');
      const m = block.match(re);
      return m ? m[1].trim() : '';
    };
    const desc = pick('وصف المشروع', ['التصنيف']);
    const lines = desc.split('\n');
    const repeatedLine = lines.reduce((acc, l) => {
      const t = l.trim();
      if (t) acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});
    const maxRepeat = Object.entries(repeatedLine).sort((a, b) => b[1] - a[1])[0];
    return {
      title: pick('عنوان المشروع', ['وصف المشروع']),
      sub: pick('التفصيلي', ['الميزانية']),
      budget: +pick('الميزانية', ['مدة التسليم']),
      delivery: pick('مدة التسليم', ['المرفقات']),
      words: desc.split(/\s+/).filter(Boolean).length,
      desc,
      maxRepeatLine: maxRepeat,
      opening: desc.slice(0, 120),
      hasPadding: maxRepeat && maxRepeat[1] > 3,
    };
  });
}

function audit(file, minWords, name) {
  const orders = parseOrders(fs.readFileSync(file, 'utf8'));
  const titles = orders.map((o) => o.title);
  const subs = orders.map((o) => o.sub);
  const openings = orders.map((o) => o.opening);
  const paddingOrders = orders.filter((o) => o.hasPadding);
  const belowMin = orders.filter((o) => o.words < minWords);
  const openingCounts = {};
  openings.forEach((o) => {
    openingCounts[o] = (openingCounts[o] || 0) + 1;
  });
  const commonOpenings = Object.entries(openingCounts).filter(([, c]) => c > 1);
  const structuralMarkers = {
    contentTemplate: orders.filter((o) => /الخلفية والسياق:|لماذا هذه الخدمة:/.test(o.desc)).length,
    designTemplate: orders.filter(
      (o) => /نحن .+ مقيمون في/.test(o.desc) && /خلفية المشروع تبدأ من حاجة حقيقية/.test(o.desc)
    ).length,
    academicBlock: orders.filter((o) => /مشكلة الدراسة|المنهجية|APA|Harvard/.test(o.desc)).length,
    dimsBlock: orders.filter((o) => /1920 بكسل|1080×1920/.test(o.desc)).length,
    closingBlock: orders.filter((o) => /شكراً مقدماً لكل من يقدم عرضاً مدروساً/.test(o.desc)).length,
  };
  const budgetMismatch = orders.filter((o) => {
    const big = /رسالة|دكتوراه|هوية|RFP|دراسة جدوى|VR|واقع افتراضي|شامل|متكامل/i.test(o.title + o.sub);
    return big && o.budget < 15;
  });
  const uae = orders.filter((o) => /دبي|أبوظبي|الشارقة|عجمان|رأس الخيم|فجيرة|إمارات|أم القيوين/.test(o.title + o.desc)).length;
  return {
    name,
    count: orders.length,
    uniqueTitles: new Set(titles).size,
    uniqueSubs: new Set(subs).size,
    avgWords: Math.round(orders.reduce((s, o) => s + o.words, 0) / orders.length),
    minWordsObserved: Math.min(...orders.map((o) => o.words)),
    belowMin: belowMin.length,
    paddingOrders: paddingOrders.length,
    commonOpenings: commonOpenings.length,
    structuralMarkers,
    budgetMismatch: budgetMismatch.length,
    uaePct: Math.round((uae / orders.length) * 100),
    avgMaxRepeat: Math.round(
      paddingOrders.reduce((s, o) => s + o.maxRepeatLine[1], 0) / Math.max(paddingOrders.length, 1)
    ),
  };
}

const content = audit('c:/Users/Batman/Desktop/Orderz_House/docs/feasibility-sample-content-50.txt', 500, 'content');
const design = audit('c:/Users/Batman/Desktop/Orderz_House/docs/feasibility-sample-design-50.txt', 300, 'design');
console.log(JSON.stringify({ content, design }, null, 2));
