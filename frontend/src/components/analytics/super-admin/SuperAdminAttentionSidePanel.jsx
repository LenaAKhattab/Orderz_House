import { useMemo } from "react";
import { Link } from "react-router-dom";
import { formatInt } from "./superAdminHomeBundleUi";
import { SA_ROUTES } from "./superAdminHomeDataUtils";
import {
  AttentionSummaryBadge,
  UnifiedAttentionPanel,
  computeAttentionTotalCount,
} from "./UnifiedAttentionPanel";

/**
 * Sticky side column for “ما يحتاج إجراءك” (inside dashboard content area, not nav sidebar).
 */
export default function SuperAdminAttentionSidePanel({ items, loading }) {
  const attentionTotal = useMemo(() => computeAttentionTotalCount(items), [items]);

  return (
    <div className="sa-attention-side-panel" aria-labelledby="sa-attention-side-title">
      <header className="sa-attention-side-panel__head">
        <div className="sa-attention-side-panel__head-copy">
          <h2 id="sa-attention-side-title" className="sa-attention-side-panel__title m-0">
            ما يحتاج إجراءك
          </h2>
          <p className="sa-attention-side-panel__desc m-0">
            أولويات ومهام مقترحة لمساعدتك على اتخاذ قرارات سريعة.
          </p>
        </div>
        <div className="sa-attention-side-panel__head-actions">
          <AttentionSummaryBadge total={attentionTotal} loading={loading} compact />
          <Link to={SA_ROUTES.orders} className="sa-command-panel__view-all">
            عرض الكل
          </Link>
        </div>
      </header>
      <div className="sa-attention-side-panel__body">
        <UnifiedAttentionPanel items={items} loading={loading} showFooter={false} />
      </div>
      <p className="sa-attention-side-panel__footer m-0">
        تعتمد هذه القائمة على بيانات المنصة الحالية ويتم تحديثها تلقائياً.
      </p>
    </div>
  );
}
