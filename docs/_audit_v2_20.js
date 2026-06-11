const fs = require('fs');

function parseOrders(text) {
  return text
    .split(/(?=نوع الطلب:)/)
    .filter((p) => p.trim().startsWith('نوع الطلب:'))
    .map((block) => {
      const pick = (label, next) => {
        const nextEsc = next.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const re = new RegExp(label + ':\\n([\\s\\S]*?)(?=\\n(?:' + nextEsc + '):|$)');
        const m = block.match(re);
        return m ? m[1].trim() : '';
      };
      const desc = pick('وصف المشروع', ['التصنيف']);
      const words = desc.split(/\s+/).filter(Boolean);
      const sentences = desc.split(/[.!؟?]\s+/).filter(Boolean);
      const sentenceCounts = {};
      sentences.forEach((s) => {
        const t = s.trim();
        if (t.length > 20) sentenceCounts[t] = (sentenceCounts[t] || 0) + 1;
      });
      const repeatedSentences = Object.entries(sentenceCounts).filter(([, c]) => c > 1);
      const fieldLabels = (desc.match(/^(الهدف|الجمهور|النطاق|الخلفية|المخرجات|اللغة|الجودة|التسليم|القبول|تعليمات):/gm) || []).length;
      const checklistOpen = /^الخلفية والسياق:|^لماذا هذه الخدمة:/m.test(desc);
      const opening = desc.slice(0, 60);
      return {
        title: pick('عنوان المشروع', ['وصف المشروع']),
        sub: pick('التفصيلي', ['الميزانية']),
        budget: +pick('الميزانية', ['مدة التسليم']),
        words: words.length,
        desc,
        repeatedSentences,
        fieldLabels,
        checklistOpen,
        opening,
      };
    });
}

const BUDGET_TIERS = {
  content: {
    micro: { min: 3, max: 8, subs: ['SMS', 'تدقيق', 'اقتباس', 'بطاقات'] },
    small: { min: 8, max: 15, subs: ['السيرة', 'تغطية', 'FAQ', 'إعلان'] },
    medium: { min: 15, max: 25, subs: ['مواقع', 'مدونة', 'سوشيال', 'صحف'] },
    large: { min: 25, max: 45, subs: ['جدوى', 'مساق', 'خطة', 'أدبيات', 'مراسلات'] },
  },
  design: {
    micro: { min: 3, max: 10, subs: ['صور شخصية', 'شعار'] },
    small: { min: 10, max: 18, subs: ['دعو', 'إنفوجرافيك', 'سيرة'] },
    medium: { min: 18, max: 30, subs: ['منشورات', 'هبوط', 'بوستر'] },
    large: { min: 30, max: 50, subs: ['هوية'] },
  },
};

function budgetOk(sub, budget, vertical) {
  const tiers = BUDGET_TIERS[vertical];
  for (const t of Object.values(tiers)) {
    if (t.subs.some((k) => sub.includes(k) || sub.toLowerCase().includes(k))) {
      return budget >= t.min && budget <= t.max;
    }
  }
  return budget >= 3 && budget <= 50;
}

function auditFile(path, vertical, maxWords) {
  const orders = parseOrders(fs.readFileSync(path, 'utf8'));
  const openings = orders.map((o) => o.opening);
  const uniqueOpenings = new Set(openings).size;
  const dimsClone = orders.filter((o) => /1920|1080×1920|جولة واحدة مجانية/.test(o.desc)).length;
  const padding = orders.filter((o) => /نؤكد الجودة/.test(o.desc)).length;
  const overMax = orders.filter((o) => o.words > maxWords).length;
  const underMin = orders.filter((o) => o.words < 60).length;
  const repeated = orders.filter((o) => o.repeatedSentences.length > 0).length;
  const fieldLabels = orders.filter((o) => o.fieldLabels > 0 || o.checklistOpen).length;
  const budgetBad = orders.filter((o) => !budgetOk(o.sub, o.budget, vertical)).length;
  const personalSubs = orders.filter((o) =>
    /شخصي|SMS|خواطر|دعو|صور شخصية|قوالب اجتماعية|إنفوجرافيك.*سيرة/.test(o.sub + o.title)
  ).length;
  return {
    count: orders.length,
    words: orders.map((o) => ({ title: o.title, words: o.words, budget: o.budget })),
    repeated,
    fieldLabels,
    overMax,
    underMin,
    budgetBad,
    uniqueOpenings,
    dimsClone,
    padding,
    personalSubs,
    subs: orders.map((o) => o.sub),
  };
}

const content = auditFile('c:/Users/Batman/Desktop/Orderz_House/docs/validation-v2-content-10.txt', 'content', 450);
const design = auditFile('c:/Users/Batman/Desktop/Orderz_House/docs/validation-v2-design-10.txt', 'design', 380);
console.log(JSON.stringify({ content, design }, null, 2));
