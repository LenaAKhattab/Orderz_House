import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import {
  createSuperAdminAdminRequest,
  listSuperAdminAdminPermissionsRequest,
  listSuperAdminAdminsRequest,
  updateSuperAdminAdminRequest,
} from "../../services/api";
import { useAuth } from "../../context/useAuth";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/opsAdminResources";
import "./superAdminAdminsPage.css";

function formatJoDate(value, locale) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  const tag = locale === "ar" ? "ar-JO-u-nu-latn" : "en-GB";
  return new Intl.DateTimeFormat(tag, {
    timeZone: "Asia/Amman",
    dateStyle: "medium",
  }).format(d);
}

function resolvePermissionLabel(perm, t) {
  if (perm?.labelKey) return t(perm.labelKey);
  return perm?.label || perm?.key || "";
}

function PermissionsChecklist({ groups, selected, onChange, disabled }) {
  const { t } = useTranslation();
  const set = useMemo(() => new Set(selected), [selected]);
  const toggle = (key) => {
    if (disabled) return;
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next]);
  };

  return (
    <div className="oh-admins-perms">
      {(groups || []).map((group) => (
        <div key={group.id} className="oh-admins-perms__group">
          <div className="oh-admins-perms__group-title">
            {group.labelKey ? t(group.labelKey) : group.label}
          </div>
          <ul className="oh-admins-perms__list">
            {(group.permissions || []).map((perm) => (
              <li key={perm.key}>
                <label className="oh-admins-perms__item">
                  <input
                    type="checkbox"
                    checked={set.has(perm.key)}
                    disabled={disabled}
                    onChange={() => toggle(perm.key)}
                  />
                  <span>{resolvePermissionLabel(perm, t)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function AdminFormModal({ mode, open, onClose, groups, initial, onSaved, currentUserId, onSelfPermissionsSaved }) {
  const { t } = useTranslation();
  const isEdit = mode === "edit";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const errorMessage = useCallback(
    (err) => err?.response?.data?.message || t("opsAdmin.common.genericError"),
    [t],
  );

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || "");
    setEmail(initial?.email || "");
    setPassword("");
    setPermissions(Array.isArray(initial?.permissions) ? [...initial.permissions] : []);
    setError("");
  }, [open, initial]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateSuperAdminAdminRequest(initial.id, { name, email, permissions });
        if (currentUserId && String(initial.id) === String(currentUserId)) {
          await onSelfPermissionsSaved?.();
        }
      } else {
        await createSuperAdminAdminRequest({ name, email, password, permissions });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="oh-admins-modal" role="dialog" aria-modal="true" aria-labelledby="oh-admins-modal-title">
      <button type="button" className="oh-admins-modal__backdrop" aria-label={t("opsAdmin.common.closeDialog")} onClick={onClose} />
      <div className="oh-admins-modal__panel">
        <header className="oh-admins-modal__header">
          <h2 id="oh-admins-modal-title">
            {isEdit ? t("opsAdmin.admins.modalEditTitle") : t("opsAdmin.admins.modalCreateTitle")}
          </h2>
          <button type="button" className="oh-admins-modal__close" onClick={onClose} aria-label={t("opsAdmin.common.closeDialog")}>
            ×
          </button>
        </header>
        <form className="oh-admins-modal__body" onSubmit={submit}>
          {error ? <div className="oh-admins-modal__error">{error}</div> : null}
          <label className="oh-admins-field">
            <span>{t("opsAdmin.admins.fieldName")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80} />
          </label>
          <label className="oh-admins-field">
            <span>{t("opsAdmin.admins.fieldEmail")}</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {!isEdit ? (
            <label className="oh-admins-field">
              <span>{t("opsAdmin.admins.fieldPassword")}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
          ) : null}
          <div className="oh-admins-field">
            <span>{t("opsAdmin.admins.fieldPagePermissions")}</span>
            <PermissionsChecklist groups={groups} selected={permissions} onChange={setPermissions} disabled={submitting} />
          </div>
          <footer className="oh-admins-modal__footer">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {t("opsAdmin.common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? t("opsAdmin.admins.saving")
                : isEdit
                  ? t("opsAdmin.admins.saveChanges")
                  : t("opsAdmin.admins.createAdmin")}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}

export default function SuperAdminAdminsPage() {
  const { user, refreshUser } = useAuth();
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [admins, setAdmins] = useState([]);
  const [groups, setGroups] = useState([]);
  const [modalMode, setModalMode] = useState(null);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const errorMessage = useCallback(
    (err) => err?.response?.data?.message || t("opsAdmin.common.genericError"),
    [t],
  );

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [adminsRes, permsRes] = await Promise.all([
        listSuperAdminAdminsRequest(),
        listSuperAdminAdminPermissionsRequest(),
      ]);
      setAdmins(adminsRes?.data?.admins || []);
      setGroups(permsRes?.data?.groups || []);
    } catch (err) {
      setError(errorMessage(err));
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  }, [errorMessage]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingAdmin(null);
    setModalMode("create");
  };

  const openEdit = (admin) => {
    setEditingAdmin(admin);
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingAdmin(null);
  };

  const toggleActive = async (admin) => {
    setTogglingId(admin.id);
    setError("");
    try {
      await updateSuperAdminAdminRequest(admin.id, { isActive: !admin.isActive });
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("opsAdmin.admins.title")}
        description={t("opsAdmin.admins.description")}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.admins")}
        actions={
          <Button type="button" onClick={openCreate}>
            {t("opsAdmin.admins.addAdmin")}
          </Button>
        }
      />

      {error && !loading ? <DashboardErrorState message={error} onRetry={load} /> : null}

      <DashboardSection title={t("opsAdmin.admins.sectionAccounts")}>
        {loading ? (
          <DashboardLoadingState label={t("opsAdmin.admins.loading")} />
        ) : admins.length === 0 ? (
          <DashboardEmptyState
            title={t("opsAdmin.admins.emptyTitle")}
            description={t("opsAdmin.admins.emptyDescription")}
            actionLabel={t("opsAdmin.admins.emptyAction")}
            onAction={openCreate}
          />
        ) : (
          <div className="oh-admins-table-wrap">
            <table className="oh-admins-table">
              <thead>
                <tr>
                  <th>{t("opsAdmin.admins.colName")}</th>
                  <th>{t("opsAdmin.admins.colEmail")}</th>
                  <th>{t("opsAdmin.admins.colStatus")}</th>
                  <th>{t("opsAdmin.admins.colPermissions")}</th>
                  <th>{t("opsAdmin.admins.colCreated")}</th>
                  <th>{t("opsAdmin.admins.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td>{admin.name}</td>
                    <td dir="ltr" style={{ textAlign: "right" }}>
                      {admin.email}
                    </td>
                    <td>
                      <StatusBadge tone={admin.isActive ? "success" : "inactive"}>
                        {admin.isActive ? t("opsAdmin.admins.statusActive") : t("opsAdmin.admins.statusDisabled")}
                      </StatusBadge>
                    </td>
                    <td>{admin.permissionCount ?? admin.permissions?.length ?? 0}</td>
                    <td>{formatJoDate(admin.createdAt, locale)}</td>
                    <td>
                      <div className="oh-admins-table__actions">
                        <Button type="button" variant="secondary" onClick={() => openEdit(admin)}>
                          {t("opsAdmin.admins.editPermissions")}
                        </Button>
                        <Button
                          type="button"
                          variant={admin.isActive ? "secondary" : "primary"}
                          disabled={togglingId === admin.id}
                          onClick={() => toggleActive(admin)}
                        >
                          {togglingId === admin.id
                            ? "…"
                            : admin.isActive
                              ? t("opsAdmin.admins.disable")
                              : t("opsAdmin.admins.enable")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardSection>

      <AdminFormModal
        mode={modalMode}
        open={Boolean(modalMode)}
        onClose={closeModal}
        groups={groups}
        initial={editingAdmin}
        onSaved={load}
        currentUserId={user?.id}
        onSelfPermissionsSaved={refreshUser}
      />
    </DashboardShell>
  );
}
