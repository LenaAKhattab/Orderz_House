import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, Clock3, MessageCircle, Smartphone, SquarePen, Users } from "lucide-react";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { editWebsiteBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { SUPER_ADMIN_FOOTER_SECTIONS } from "../../constants/superAdminWebsiteSections";
import { coalesceFooterVisible, mergeFooterSettings } from "../../constants/footerSettings";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/siteEditorResources";
import { getSuperAdminFooterSettingsRequest } from "../../services/api";
import "./superAdminEditWebsitePage.css";

const SECTION_ICONS = {
  contact: Users,
  "working-hours": Clock3,
  "app-downloads": Smartphone,
  "contact-center": MessageCircle,
};

function sectionVisible(settings, sectionId) {
  if (!settings) return true;
  if (sectionId === "contact") return coalesceFooterVisible(settings.contact?.visible, true);
  if (sectionId === "working-hours") return coalesceFooterVisible(settings.workingHours?.visible, true);
  if (sectionId === "app-downloads") return coalesceFooterVisible(settings.appDownload?.visible, true);
  if (sectionId === "contact-center") return coalesceFooterVisible(settings.contactCenter?.visible, true);
  return true;
}

export default function SuperAdminEditWebsiteFooterPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(null);

  const operationError = useCallback(
    (err) => err?.response?.data?.message || t("siteEditor.errors.operationFailed"),
    [t],
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getSuperAdminFooterSettingsRequest();
      setSettings(mergeFooterSettings(res?.data?.settings || null));
    } catch (err) {
      setError(operationError(err));
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [operationError]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("siteEditor.footerHub.pageTitle")}
        description={t("siteEditor.footerHub.pageDescription")}
        breadcrumbs={editWebsiteBreadcrumbs("dashboard.breadcrumbs.editFooter")}
      />

      <DashboardSection title={t("siteEditor.footerHub.sectionTitle")}>
        {loading ? <DashboardLoadingState label={t("siteEditor.common.loadingSectionStatus")} /> : null}
        {!loading && error ? (
          <DashboardErrorState
            message={error}
            actions={
              <Button type="button" variant="secondary" onClick={loadSettings}>
                {t("siteEditor.common.retry")}
              </Button>
            }
          />
        ) : null}

        {!loading && !error ? (
          <div className="oh-website-sections">
            {SUPER_ADMIN_FOOTER_SECTIONS.map((section) => {
              const Icon = SECTION_ICONS[section.id] || SquarePen;
              const visible = sectionVisible(settings, section.id);
              return (
                <article key={section.id} className="oh-website-section-card">
                  <div className="oh-website-section-card__top">
                    <div className="oh-website-section-card__icon-wrap" aria-hidden>
                      <Icon className="oh-website-section-card__icon-svg" strokeWidth={1.75} />
                    </div>
                    <div className="oh-website-section-card__head">
                      <h3 className="oh-website-section-card__title">{t(section.titleKey)}</h3>
                      <div className="oh-website-section-card__status">
                        <span
                          className={`oh-website-section-card__badge ${
                            visible
                              ? "oh-website-section-card__badge--on"
                              : "oh-website-section-card__badge--off"
                          }`}
                        >
                          {visible ? t("siteEditor.common.visible") : t("siteEditor.common.hidden")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="oh-website-section-card__desc">{t(section.descriptionKey)}</p>
                  <div className="oh-website-section-card__actions">
                    <Link to={section.path} className="btn btn-primary oh-website-section-card__btn">
                      <span className="oh-website-section-card__btn-label">
                        <SquarePen
                          className="oh-website-section-card__btn-icon"
                          size={16}
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span>{t(section.editLabelKey)}</span>
                      </span>
                      <ChevronLeft
                        className="oh-website-section-card__btn-arrow"
                        size={16}
                        strokeWidth={2}
                        aria-hidden
                      />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
