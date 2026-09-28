import { useMemo } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "../../../i18n/opsAdminResources";
import "./registerAnalysisLocale";
import {
  AttentionSummaryBadge,
  UnifiedAttentionPanel,
  computeAttentionTotalCount,
} from "./UnifiedAttentionPanel";

/**
 * Sticky side column for “ما يحتاج إجراءك” (inside dashboard content area, not nav sidebar).
 */
export default function SuperAdminAttentionSidePanel({ items, loading }) {
  const { t } = useTranslation();
  const attentionTotal = useMemo(() => computeAttentionTotalCount(items), [items]);

  return (
    <div className="sa-attention-side-panel" aria-labelledby="sa-attention-side-title">
      <header className="sa-attention-side-panel__head">
        <div className="sa-attention-side-panel__head-copy">
          <h2 id="sa-attention-side-title" className="sa-attention-side-panel__title m-0">
            {t("opsAdmin.attentionSidePanel.title")}
          </h2>
          <p className="sa-attention-side-panel__desc m-0">{t("opsAdmin.attentionSidePanel.description")}</p>
        </div>
        <div className="sa-attention-side-panel__head-actions">
          <AttentionSummaryBadge total={attentionTotal} loading={loading} compact />
        </div>
      </header>
      <div className="sa-attention-side-panel__body">
        <UnifiedAttentionPanel items={items} loading={loading} showFooter={false} />
      </div>
      <p className="sa-attention-side-panel__footer m-0">
        {t("analysis.attention.footer")}
      </p>
    </div>
  );
}
