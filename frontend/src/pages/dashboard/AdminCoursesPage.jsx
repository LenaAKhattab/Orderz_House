import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/useAuth";
import {
  adminAddCourseFreelancerRequest,
  adminRemoveCourseFreelancerRequest,
  adminArchiveCourseRequest,
  adminAssignCourseFreelancersRequest,
  adminCreateCourseRequest,
  adminDeleteCourseRequest,
  adminGetCourseByIdRequest,
  adminImportCourseLessonsRequest,
  adminListCourseFreelancersRequest,
  adminListCoursesRequest,
  adminPublishCourseRequest,
  adminUpdateCourseLessonsRequest,
  adminUpdateCourseRequest,
  adminUploadCourseTestFileRequest,
  adminUploadCoursePromptFileRequest,
  adminUploadCourseModelAnswerFileRequest,
  listAssignablePlansAdminRequest,
  getMarketplaceEconomySettingsRequest,
} from "../../services/api";
import CourseProgressFreelancerActions from "../../admin/courses/CourseProgressFreelancerActions";
import { useToast } from "../../components/ui/toastContext";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { breadcrumbHomeFromUser } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardTable from "../../components/dashboard/DashboardTable";
import StatusBadge from "../../components/dashboard/StatusBadge";
import ConfirmDialog from "../../components/dashboard/ConfirmDialog";
import WidgetLoadError from "../../components/dashboard/hub/controlCenter/WidgetLoadError";
import AdminCourseCreateComposer from "../../admin/courses/AdminCourseCreateComposer";
import ExamQuestionsEditor, { isExamQuestionsEditorValid } from "../../admin/courses/ExamQuestionsEditor";
import { parseExamQuestions } from "../../utils/courseExamQuestions";
import CourseTextAdsModal from "../../admin/courses/CourseTextAdsModal";
import CourseFileManagerSection from "../../admin/courses/CourseFileManagerSection";
import CourseUrlField from "../../admin/courses/CourseUrlField";
import "../../admin/courses/adminCourseComposer.css";
import "../../admin/courses/courseAssetFields.css";
import { formatCompletionDuration, formatLearningTimestamp } from "../../utils/courseLearningDuration";
import "../../i18n/coursesResources";
import { useTranslation } from "../../i18n/LanguageProvider";
import "./adminCoursesPage.css";

function fmtCourseDate(iso, locale) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const loc = locale === "en" ? "en-JO-u-nu-latn" : "ar-JO-u-nu-latn";
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(loc);
  } catch {
    return "—";
  }
}

function courseListStatusPresentation(course, t) {
  if (course?.isActive) {
    return { label: t("courses.status.published"), tone: "active" };
  }
  return { label: t("courses.status.draft"), tone: "inactive" };
}

function formatLessonChipCount(count, t) {
  return t("courses.admin.lessonCount", { count: Number(count) || 0 });
}

function formatAccessChipCount(count, isGlobal, t) {
  const n = Number(count) || 0;
  return isGlobal
    ? t("courses.admin.freelancerCountGlobal", { count: n })
    : t("courses.admin.assignedCount", { count: n });
}

const EMPTY_CREATE_FORM = {
  title: "",
  description: "",
  coverImage: "",
  youtubeSourceUrl: "",
  isActive: false,
  isTestingEnabled: false,
  requiredTierCode: "silver",
  testFileUrl: "",
  testPromptFileUrl: "",
  testModelAnswerFileUrl: "",
  testQuestionCount: "",
  examQuestions: [],
};

function cloneCreateForm(form) {
  return JSON.parse(JSON.stringify(form ?? EMPTY_CREATE_FORM));
}

export default function AdminCoursesPage() {
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [freelancers, setFreelancers] = useState([]);
  const [freelancerQuery, setFreelancerQuery] = useState("");
  const [selectedFreelancerIds, setSelectedFreelancerIds] = useState([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerUnsavedConfirmOpen, setComposerUnsavedConfirmOpen] = useState(false);
  const [deleteConfirmCourseId, setDeleteConfirmCourseId] = useState("");
  /** After discard confirm: close only, or close then open a fresh create modal. */
  const [composerDiscardIntent, setComposerDiscardIntent] = useState(null);
  const [editingCourseId, setEditingCourseId] = useState("");
  const [editingCourseMeta, setEditingCourseMeta] = useState(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createForm, setCreateForm] = useState(() => ({ ...EMPTY_CREATE_FORM }));
  const [testFileUploading, setTestFileUploading] = useState(false);
  const [promptFileUploading, setPromptFileUploading] = useState(false);
  const [modelAnswerFileUploading, setModelAnswerFileUploading] = useState(false);
  const [courseTextAdsModalOpen, setCourseTextAdsModalOpen] = useState(false);
  const [fileRemoveBusy, setFileRemoveBusy] = useState(false);
  /** PDF files chosen during create — uploaded right after the course is created. */
  const [createPendingTestFile, setCreatePendingTestFile] = useState(null);
  const [createPendingPromptFile, setCreatePendingPromptFile] = useState(null);
  const [createPendingModelAnswerFile, setCreatePendingModelAnswerFile] = useState(null);
  const [importUrl, setImportUrl] = useState("");
  const [sendModal, setSendModal] = useState({ open: false, course: null });
  const [sendQuery, setSendQuery] = useState("");
  const [sendResults, setSendResults] = useState([]);
  const [sendLoading, setSendLoading] = useState(false);
  /** Single-row send in progress (freelancer user id as string). */
  const [sendRowLoadingId, setSendRowLoadingId] = useState(null);
  const [unassignRowLoadingId, setUnassignRowLoadingId] = useState(null);
  /** Freelancers already assigned to the course open in the send modal (for sort + grey state). */
  const [sendAssignedIds, setSendAssignedIds] = useState(() => new Set());
  /** False until GET course details finishes for the send modal (avoid wrong grey/active state). */
  const [sendAssignedReady, setSendAssignedReady] = useState(false);
  const [visibilityTogglingId, setVisibilityTogglingId] = useState("");
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [manageTab, setManageTab] = useState("details");
  const [courseDetailsLoading, setCourseDetailsLoading] = useState(false);
  const [progressQuery, setProgressQuery] = useState("");
  const [assignablePlans, setAssignablePlans] = useState([]);
  const [assignablePlansLoading, setAssignablePlansLoading] = useState(false);
  const [coursesLoadError, setCoursesLoadError] = useState(null);
  const [freelancersLoadError, setFreelancersLoadError] = useState(null);
  const [membershipRequiredCourseId, setMembershipRequiredCourseId] = useState("");

  const coursesFetchGenRef = useRef(0);
  const freelancersFetchGenRef = useRef(0);
  const courseDetailsGenRef = useRef(0);

  const isSuperAdmin = (user?.primaryRole || user?.role) === "super_admin";
  /** Server truth for file URLs — PATCH only sends file URLs when they differ from this snapshot. */
  const serverFileUrlsRef = useRef({ testFileUrl: "", testPromptFileUrl: "", testModelAnswerFileUrl: "" });
  /** Form snapshot when composer modal opens — used for unsaved-close confirmation. */
  const composerSnapshotRef = useRef(null);

  const syncServerFileUrls = useCallback((course) => {
    if (!course) return;
    serverFileUrlsRef.current = {
      testFileUrl: String(course.testFileUrl || "").trim(),
      testPromptFileUrl: String(course.testPromptFileUrl || "").trim(),
      testModelAnswerFileUrl: String(course.testModelAnswerFileUrl || "").trim(),
    };
  }, []);

  const syncCourseFileFieldsFromServer = useCallback(
    (courseId, course) => {
      if (!course) return;
      syncServerFileUrls(course);
      const testFileUrl = course.testFileUrl || "";
      const testPromptFileUrl = course.testPromptFileUrl || "";
      const testModelAnswerFileUrl = course.testModelAnswerFileUrl || "";
      if (String(editingCourseId) === String(courseId)) {
        setCreateForm((s) => ({ ...s, testFileUrl, testPromptFileUrl, testModelAnswerFileUrl }));
      }
      if (String(selectedCourseId) === String(courseId)) {
        setSelectedCourse((prev) =>
          prev?.course
            ? { ...prev, course: { ...prev.course, testFileUrl, testPromptFileUrl, testModelAnswerFileUrl } }
            : prev,
        );
      }
    },
    [editingCourseId, selectedCourseId, syncServerFileUrls],
  );

  const buildCourseMetadataPatch = useCallback((fields) => {
    const patch = {
      title: fields.title,
      description: fields.description,
      coverImage: fields.coverImage,
      isActive: fields.isActive,
      isTestingEnabled: fields.isTestingEnabled,
    };
    if (fields.requiredTierCode !== undefined) {
      patch.requiredTierCode = fields.requiredTierCode;
    }
    if (fields.isVisibleToAllFreelancers !== undefined) {
      patch.isVisibleToAllFreelancers = fields.isVisibleToAllFreelancers;
    }
    const server = serverFileUrlsRef.current;
    const test = String(fields.testFileUrl ?? "").trim();
    const prompt = String(fields.testPromptFileUrl ?? "").trim();
    const modelAnswer = String(fields.testModelAnswerFileUrl ?? "").trim();
    if (test !== String(server.testFileUrl || "").trim()) {
      patch.testFileUrl = test || null;
    }
    if (prompt !== String(server.testPromptFileUrl || "").trim()) {
      patch.testPromptFileUrl = prompt || null;
    }
    if (modelAnswer !== String(server.testModelAnswerFileUrl || "").trim()) {
      patch.testModelAnswerFileUrl = modelAnswer || null;
    }
    if (fields.testQuestionCount !== undefined) {
      const raw = String(fields.testQuestionCount ?? "").trim();
      patch.testQuestionCount = raw === "" ? null : Number(raw);
    }
    if (fields.examQuestions !== undefined) {
      const rows = parseExamQuestions(fields.examQuestions);
      patch.examQuestions = rows.length ? rows : null;
    }
    return patch;
  }, []);

  const fetchCoursesList = useCallback(async ({ silent = false } = {}) => {
    const gen = ++coursesFetchGenRef.current;
    if (!silent) setLoading(true);
    try {
      const params = {};
      const q = courseSearch.trim();
      if (q) params.q = q;
      if (statusFilter === "published") params.isActive = true;
      if (statusFilter === "draft") params.isActive = false;
      const res = await adminListCoursesRequest(params);
      if (gen !== coursesFetchGenRef.current) return;
      setCourses(res?.data?.courses || []);
      setCoursesLoadError(null);
      toast.clearSessionErrorToast(t("courses.errors.loadCourses"));
    } catch (err) {
      if (gen !== coursesFetchGenRef.current) return;
      const msg = err?.response?.data?.message || t("courses.errors.loadCourses");
      setCoursesLoadError(msg);
      if (!silent) toast.error(msg);
    } finally {
      if (gen === coursesFetchGenRef.current && !silent) setLoading(false);
    }
  }, [toast, courseSearch, statusFilter]);

  const patchCourseListRow = useCallback((courseId, patch) => {
    setCourses((prev) =>
      prev.map((c) => (String(c.id) === String(courseId) ? { ...c, ...patch } : c)),
    );
  }, []);

  const loadCourseDetails = useCallback(
    async (courseId) => {
      if (!courseId) return;
      const gen = ++courseDetailsGenRef.current;
      setCourseDetailsLoading(true);
      try {
        const res = await adminGetCourseByIdRequest(courseId);
        if (gen !== courseDetailsGenRef.current) return;
        const details = res?.data || null;
        setSelectedCourse(details);
        if (details?.course) {
          syncServerFileUrls(details.course);
          if (String(editingCourseId) === String(courseId)) {
            setCreateForm((s) => ({
              ...s,
              testFileUrl: details.course.testFileUrl || "",
              testPromptFileUrl: details.course.testPromptFileUrl || "",
              testModelAnswerFileUrl: details.course.testModelAnswerFileUrl || "",
            }));
          }
        }
        setSelectedFreelancerIds((details?.assignments || []).map((x) => x.freelancerId));
        toast.clearSessionErrorToast(t("courses.errors.loadCourseDetails"));
      } catch (err) {
        if (gen !== courseDetailsGenRef.current) return;
        const msg = err?.response?.data?.message || t("courses.errors.loadCourseDetails");
        toast.error(msg);
        setSelectedCourse(null);
      } finally {
        if (gen === courseDetailsGenRef.current) setCourseDetailsLoading(false);
      }
    },
    [toast, editingCourseId, syncServerFileUrls],
  );

  const loadFreelancers = useCallback(async ({ silent = true } = {}) => {
    const gen = ++freelancersFetchGenRef.current;
    try {
      const res = await adminListCourseFreelancersRequest({ q: "", limit: 200 });
      if (gen !== freelancersFetchGenRef.current) return;
      setFreelancers(res?.data?.freelancers || []);
      setFreelancersLoadError(null);
      toast.clearSessionErrorToast(t("courses.errors.loadFreelancers"));
    } catch (err) {
      if (gen !== freelancersFetchGenRef.current) return;
      const msg = err?.response?.data?.message || t("courses.errors.loadFreelancers");
      setFreelancersLoadError(msg);
      if (!silent) toast.error(msg);
    }
  }, [toast]);

  const retryCoursesLoad = useCallback(() => {
    toast.clearSessionErrorToast(t("courses.errors.loadCourses"));
    void fetchCoursesList();
  }, [toast, fetchCoursesList]);

  const retryFreelancersLoad = useCallback(() => {
    toast.clearSessionErrorToast(t("courses.errors.loadFreelancers"));
    void loadFreelancers({ silent: false });
  }, [toast, loadFreelancers]);

  useEffect(() => {
    if (!manageModalOpen || manageTab !== "assign") return undefined;
    if (selectedCourse?.course?.isVisibleToAllFreelancers) return undefined;
    void loadFreelancers({ silent: false });
    return () => {
      freelancersFetchGenRef.current += 1;
    };
  }, [manageModalOpen, manageTab, selectedCourse?.course?.isVisibleToAllFreelancers, loadFreelancers]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchCoursesList();
    }, 300);
    return () => {
      window.clearTimeout(timer);
      coursesFetchGenRef.current += 1;
    };
  }, [fetchCoursesList]);

  useEffect(() => {
    if (!isSuperAdmin) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await getMarketplaceEconomySettingsRequest();
        const courseId = res?.data?.settings?.marketplaceMembershipRequiredCourseId;
        if (!cancelled && courseId != null) {
          setMembershipRequiredCourseId(String(courseId));
        }
      } catch {
        /* optional helper only */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!selectedCourseId) return undefined;
    void loadCourseDetails(selectedCourseId);
    return () => {
      courseDetailsGenRef.current += 1;
    };
  }, [selectedCourseId, loadCourseDetails]);

  useEffect(() => {
    let cancelled = false;
    if (!sendModal.open) return undefined;
    const timer = window.setTimeout(async () => {
      setSendLoading(true);
      try {
        const res = await adminListCourseFreelancersRequest({ q: sendQuery.trim(), limit: 30 });
        if (!cancelled) setSendResults(res?.data?.freelancers || []);
      } catch {
        if (!cancelled) setSendResults([]);
      } finally {
        if (!cancelled) setSendLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sendModal.open, sendQuery]);

  useEffect(() => {
    if (!sendModal.open || !sendModal.course?.id) return undefined;
    let cancelled = false;
    setSendAssignedReady(false);
    setSendAssignedIds(new Set());
    (async () => {
      try {
        const res = await adminGetCourseByIdRequest(sendModal.course.id);
        const ids = new Set((res?.data?.assignments || []).map((x) => String(x.freelancerId)));
        if (!cancelled) {
          setSendAssignedIds(ids);
          setSendAssignedReady(true);
        }
      } catch {
        if (!cancelled) {
          setSendAssignedIds(new Set());
          setSendAssignedReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sendModal.open, sendModal.course?.id]);

  const sortedSendResults = useMemo(() => {
    const list = [...sendResults];
    if (sendAssignedReady) {
      list.sort((a, b) => {
        const aAs = sendAssignedIds.has(String(a.id));
        const bAs = sendAssignedIds.has(String(b.id));
        if (aAs !== bAs) return aAs ? -1 : 1;
        return 0;
      });
    }
    return list;
  }, [sendResults, sendAssignedIds, sendAssignedReady]);

  const sendModalBusy =
    sendRowLoadingId !== null || unassignRowLoadingId !== null;

  const filteredFreelancers = useMemo(() => {
    if (!freelancerQuery.trim()) return freelancers;
    const q = freelancerQuery.trim().toLowerCase();
    return freelancers.filter((f) => {
      const text = `${f.firstName || ""} ${f.fatherName || ""} ${f.familyName || ""} ${f.accountId || ""} ${f.email || ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [freelancers, freelancerQuery]);

  const filteredAssignments = useMemo(() => {
    const list = selectedCourse?.assignments || [];
    const q = progressQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) => {
      const name = `${a.firstName || ""} ${a.fatherName || ""} ${a.familyName || ""}`.toLowerCase();
      const account = String(a.accountId || "").toLowerCase();
      return name.includes(q) || account.includes(q);
    });
  }, [selectedCourse?.assignments, progressQuery]);

  const patchAssignmentSubscription = useCallback((freelancerId, subscription) => {
    setSelectedCourse((prev) => {
      if (!prev?.assignments) return prev;
      return {
        ...prev,
        assignments: prev.assignments.map((a) =>
          String(a.freelancerId) === String(freelancerId) ? { ...a, subscription: subscription ?? null } : a,
        ),
      };
    });
  }, []);

  useEffect(() => {
    if (!manageModalOpen || manageTab !== "progress") return undefined;
    let cancelled = false;
    setAssignablePlansLoading(true);
    listAssignablePlansAdminRequest()
      .then((res) => {
        if (!cancelled) setAssignablePlans(res?.data?.plans || []);
      })
      .catch(() => {
        if (!cancelled) setAssignablePlans([]);
      })
      .finally(() => {
        if (!cancelled) setAssignablePlansLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [manageModalOpen, manageTab]);

  const resetComposer = useCallback(() => {
    setEditingCourseId("");
    setEditingCourseMeta(null);
    setCreateForm({ ...EMPTY_CREATE_FORM });
    setCreatePendingTestFile(null);
    setCreatePendingPromptFile(null);
    setCreatePendingModelAnswerFile(null);
    composerSnapshotRef.current = null;
  }, []);

  const isComposerDirty = useCallback(() => {
    const snap = composerSnapshotRef.current;
    if (!snap) return false;
    return (
      JSON.stringify(createForm) !== JSON.stringify(snap) ||
      Boolean(createPendingTestFile) ||
      Boolean(createPendingPromptFile)
    );
  }, [createForm, createPendingTestFile, createPendingPromptFile]);

  const finishCloseComposerModal = useCallback(() => {
    setComposerUnsavedConfirmOpen(false);
    setComposerDiscardIntent(null);
    setComposerOpen(false);
    resetComposer();
  }, [resetComposer]);

  const openFreshCreateComposerModal = useCallback(() => {
    const empty = cloneCreateForm(EMPTY_CREATE_FORM);
    setCreateForm(empty);
    composerSnapshotRef.current = empty;
    setComposerOpen(true);
  }, []);

  const requestCloseComposerModal = useCallback(() => {
    if (creating) return;
    if (isComposerDirty()) {
      setComposerDiscardIntent("close");
      setComposerUnsavedConfirmOpen(true);
      return;
    }
    finishCloseComposerModal();
  }, [creating, isComposerDirty, finishCloseComposerModal]);

  const confirmDiscardComposerModal = useCallback(() => {
    const intent = composerDiscardIntent;
    setComposerUnsavedConfirmOpen(false);
    setComposerDiscardIntent(null);
    setComposerOpen(false);
    resetComposer();
    if (intent === "reopen-create") {
      openFreshCreateComposerModal();
    }
  }, [composerDiscardIntent, resetComposer, openFreshCreateComposerModal]);

  const cancelDiscardComposerModal = useCallback(() => {
    setComposerUnsavedConfirmOpen(false);
    setComposerDiscardIntent(null);
  }, []);

  const onPendingCreateTestFile = useCallback((file) => {
    setCreatePendingTestFile(file);
    if (file) {
      setCreateForm((s) => ({ ...s, testFileUrl: "" }));
    }
  }, []);

  const onPendingCreatePromptFile = useCallback((file) => {
    setCreatePendingPromptFile(file);
    if (file) {
      setCreateForm((s) => ({ ...s, testPromptFileUrl: "" }));
    }
  }, []);

  const onPendingCreateModelAnswerFile = useCallback((file) => {
    setCreatePendingModelAnswerFile(file);
    if (file) {
      setCreateForm((s) => ({ ...s, testModelAnswerFileUrl: "" }));
    }
  }, []);

  const openCreateComposerModal = useCallback(() => {
    if (composerOpen) {
      if (isComposerDirty()) {
        setComposerDiscardIntent("reopen-create");
        setComposerUnsavedConfirmOpen(true);
        return;
      }
      finishCloseComposerModal();
    }
    openFreshCreateComposerModal();
  }, [composerOpen, isComposerDirty, finishCloseComposerModal, openFreshCreateComposerModal]);

  const onUploadCourseTestFile = async (courseId, file) => {
    if (!courseId || !file) return;
    setTestFileUploading(true);
    try {
      const res = await adminUploadCourseTestFileRequest(courseId, file);
      const course = res?.data?.course;
      if (!course?.testFileUrl?.startsWith("http")) {
        throw new Error(t("courses.errors.fileUpload"));
      }
      syncCourseFileFieldsFromServer(courseId, course);
      toast.success(t("courses.toast.testFileUploaded"));
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) await loadCourseDetails(courseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || t("courses.errors.fileUpload"));
    } finally {
      setTestFileUploading(false);
    }
  };

  const onUploadCoursePromptFile = async (courseId, file) => {
    if (!courseId || !file) return;
    setPromptFileUploading(true);
    try {
      const res = await adminUploadCoursePromptFileRequest(courseId, file);
      const course = res?.data?.course;
      if (!course?.testPromptFileUrl?.startsWith("http")) {
        throw new Error(t("courses.errors.fileUpload"));
      }
      syncCourseFileFieldsFromServer(courseId, course);
      toast.success(t("courses.toast.promptFileUploaded"));
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) await loadCourseDetails(courseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || t("courses.errors.fileUpload"));
    } finally {
      setPromptFileUploading(false);
    }
  };

  const onUploadCourseModelAnswerFile = async (courseId, file) => {
    if (!courseId || !file) return;
    setModelAnswerFileUploading(true);
    try {
      const res = await adminUploadCourseModelAnswerFileRequest(courseId, file);
      const course = res?.data?.course;
      if (!course?.testModelAnswerFileUrl?.startsWith("http")) {
        throw new Error(t("courses.errors.fileUpload"));
      }
      syncCourseFileFieldsFromServer(courseId, course);
      toast.success(t("courses.toast.modelAnswerUploaded"));
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) await loadCourseDetails(courseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || t("courses.errors.fileUpload"));
    } finally {
      setModelAnswerFileUploading(false);
    }
  };

  const removeCourseFileByField = useCallback(
    async ({ field, courseId, clearPending }) => {
      setFileRemoveBusy(true);
      try {
        if (courseId) {
          const res = await adminUpdateCourseRequest(courseId, { [field]: null });
          if (res?.data?.course) syncCourseFileFieldsFromServer(courseId, res.data.course);
          toast.success(t("courses.toast.fileRemoved"));
          await fetchCoursesList();
          if (String(selectedCourseId) === String(courseId)) await loadCourseDetails(courseId);
        } else {
          setCreateForm((s) => ({ ...s, [field]: "" }));
          clearPending?.();
          toast.success(t("courses.toast.fileRemoved"));
        }
      } catch (err) {
        toast.error(err?.response?.data?.message || t("courses.errors.removeFile"));
        throw err;
      } finally {
        setFileRemoveBusy(false);
      }
    },
    [fetchCoursesList, loadCourseDetails, selectedCourseId, syncCourseFileFieldsFromServer, toast],
  );

  const onRemoveComposerTestFile = useCallback(
    () =>
      removeCourseFileByField({
        field: "testFileUrl",
        courseId: editingCourseId || null,
        clearPending: () => onPendingCreateTestFile(null),
      }),
    [editingCourseId, onPendingCreateTestFile, removeCourseFileByField],
  );

  const onRemoveComposerPromptFile = useCallback(
    () =>
      removeCourseFileByField({
        field: "testPromptFileUrl",
        courseId: editingCourseId || null,
        clearPending: () => onPendingCreatePromptFile(null),
      }),
    [editingCourseId, onPendingCreatePromptFile, removeCourseFileByField],
  );

  const onRemoveComposerModelAnswerFile = useCallback(
    () =>
      removeCourseFileByField({
        field: "testModelAnswerFileUrl",
        courseId: editingCourseId || null,
        clearPending: () => onPendingCreateModelAnswerFile(null),
      }),
    [editingCourseId, onPendingCreateModelAnswerFile, removeCourseFileByField],
  );

  const onRemoveManageTestFile = useCallback(
    () => removeCourseFileByField({ field: "testFileUrl", courseId: selectedCourseId }),
    [removeCourseFileByField, selectedCourseId],
  );

  const onRemoveManagePromptFile = useCallback(
    () => removeCourseFileByField({ field: "testPromptFileUrl", courseId: selectedCourseId }),
    [removeCourseFileByField, selectedCourseId],
  );

  const onRemoveManageModelAnswerFile = useCallback(
    () => removeCourseFileByField({ field: "testModelAnswerFileUrl", courseId: selectedCourseId }),
    [removeCourseFileByField, selectedCourseId],
  );

  const onStartEditCourse = useCallback((course) => {
    const formState = {
      title: course.title || "",
      description: course.description || "",
      coverImage: course.coverImage || "",
      youtubeSourceUrl: course.youtubeSourceUrl || "",
      isActive: Boolean(course.isActive),
      isTestingEnabled: Boolean(course.isTestingEnabled),
      requiredTierCode: course.requiredTierCode || "silver",
      testFileUrl: course.testFileUrl || "",
      testPromptFileUrl: course.testPromptFileUrl || "",
      testModelAnswerFileUrl: course.testModelAnswerFileUrl || "",
      testQuestionCount:
        course.testQuestionCount != null && !Number.isNaN(Number(course.testQuestionCount))
          ? String(course.testQuestionCount)
          : "",
      examQuestions: parseExamQuestions(course.examQuestions),
    };
    setEditingCourseId(String(course.id));
    setEditingCourseMeta({
      lessonsCount: course.lessonsCount,
      youtubeSourceUrl: course.youtubeSourceUrl || "",
      updatedAt: course.updatedAt || null,
    });
    setCreateForm(formState);
    composerSnapshotRef.current = cloneCreateForm(formState);
    syncServerFileUrls(course);
    setComposerOpen(true);
  }, [syncServerFileUrls]);

  const onComposerSubmit = async (e) => {
    e.preventDefault();
    if (
      createForm.isTestingEnabled &&
      !isExamQuestionsEditorValid(createForm.testQuestionCount, createForm.examQuestions)
    ) {
      toast.error(t("courses.toast.examMarksTotal"));
      return;
    }
    setCreating(true);
    try {
      if (editingCourseId) {
        const patch = buildCourseMetadataPatch({
          title: createForm.title,
          description: createForm.description,
          coverImage: createForm.coverImage,
          isActive: createForm.isActive,
          isTestingEnabled: createForm.isTestingEnabled,
          requiredTierCode: createForm.requiredTierCode || "silver",
          testFileUrl: createForm.testFileUrl,
          testPromptFileUrl: createForm.testPromptFileUrl,
          testModelAnswerFileUrl: createForm.testModelAnswerFileUrl,
          testQuestionCount: createForm.testQuestionCount,
          examQuestions: createForm.examQuestions,
        });
        const res = await adminUpdateCourseRequest(editingCourseId, patch);
        if (res?.data?.course) syncCourseFileFieldsFromServer(editingCourseId, res.data.course);
        toast.success(t("courses.toast.courseUpdated"));
        composerSnapshotRef.current = cloneCreateForm(createForm);
      } else {
        const pendingTest = createPendingTestFile;
        const pendingPrompt = createPendingPromptFile;
        const pendingModelAnswer = createPendingModelAnswerFile;
        const res = await adminCreateCourseRequest(createForm);
        const newCourseId = res?.data?.course?.id;

        toast.success(t("courses.toast.courseCreated"));
        finishCloseComposerModal();

        if (newCourseId && pendingTest) {
          await onUploadCourseTestFile(newCourseId, pendingTest);
        }
        if (newCourseId && pendingPrompt) {
          await onUploadCoursePromptFile(newCourseId, pendingPrompt);
        }
        if (newCourseId && pendingModelAnswer) {
          await onUploadCourseModelAnswerFile(newCourseId, pendingModelAnswer);
        }
      }
      await fetchCoursesList();
    } catch (err) {
      toast.error(err?.response?.data?.message || (editingCourseId ? t("courses.errors.updateCourse") : t("courses.errors.createCourse")));
    } finally {
      setCreating(false);
    }
  };

  const onPublishCourse = async (courseId) => {
    setLoading(true);
    try {
      await adminPublishCourseRequest(courseId);
      toast.success(t("courses.toast.coursePublished"));
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) await loadCourseDetails(courseId);
    } catch (err) {
      const labels = err?.response?.data?.missingLabels;
      const base = err?.response?.data?.message || t("courses.toast.publishBlocked");
      toast.error(labels?.length ? `${base} (${labels.join(locale === "en" ? ", " : "، ")})` : base);
    } finally {
      setLoading(false);
    }
  };

  const onArchiveCourse = async (courseId) => {
    setLoading(true);
    try {
      await adminArchiveCourseRequest(courseId);
      toast.success(t("courses.toast.courseArchived"));
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) await loadCourseDetails(courseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || t("courses.errors.archiveCourse"));
    } finally {
      setLoading(false);
    }
  };

  const onUpdateCourse = async (e) => {
    e.preventDefault();
    if (!selectedCourseId || !selectedCourse?.course) return;
    if (
      selectedCourse.course.isTestingEnabled &&
      !isExamQuestionsEditorValid(
        selectedCourse.course.testQuestionCount,
        parseExamQuestions(selectedCourse.course.examQuestions),
      )
    ) {
      toast.error(t("courses.toast.examMarksTotal"));
      return;
    }
    setLoading(true);
    try {
      const patch = buildCourseMetadataPatch({
        title: selectedCourse.course.title,
        description: selectedCourse.course.description,
        coverImage: selectedCourse.course.coverImage,
        isActive: selectedCourse.course.isActive,
        isTestingEnabled: Boolean(selectedCourse.course.isTestingEnabled),
        testFileUrl: selectedCourse.course.testFileUrl || "",
        testPromptFileUrl: selectedCourse.course.testPromptFileUrl || "",
        testModelAnswerFileUrl: selectedCourse.course.testModelAnswerFileUrl || "",
        testQuestionCount:
          selectedCourse.course.testQuestionCount != null &&
          !Number.isNaN(Number(selectedCourse.course.testQuestionCount))
            ? selectedCourse.course.testQuestionCount
            : "",
        examQuestions: parseExamQuestions(selectedCourse.course.examQuestions),
      });
      const res = await adminUpdateCourseRequest(selectedCourseId, patch);
      if (res?.data?.course) syncCourseFileFieldsFromServer(selectedCourseId, res.data.course);
      toast.success(t("courses.toast.courseDetailsUpdated"));
      await fetchCoursesList();
      await loadCourseDetails(selectedCourseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || t("courses.errors.updateCourseDetails"));
    } finally {
      setLoading(false);
    }
  };

  const onImportLessons = async () => {
    if (!selectedCourseId || !importUrl.trim()) return;
    setLoading(true);
    try {
      await adminImportCourseLessonsRequest(selectedCourseId, { youtubeSourceUrl: importUrl.trim(), replaceExisting: false });
      toast.success(t("courses.toast.lessonsImported"));
      setImportUrl("");
      await loadCourseDetails(selectedCourseId);
      await fetchCoursesList();
    } catch (err) {
      toast.error(err?.response?.data?.message || t("courses.errors.importLessons"));
    } finally {
      setLoading(false);
    }
  };

  const onSaveLessons = async () => {
    if (!selectedCourseId || !selectedCourse?.lessons?.length) return;
    setLoading(true);
    try {
      await adminUpdateCourseLessonsRequest(selectedCourseId, {
        lessons: selectedCourse.lessons.map((l, idx) => ({
          id: l.id,
          title: l.title,
          description: l.description ?? "",
          sortOrder: Number(l.sortOrder || idx + 1),
          isActive: Boolean(l.isActive),
        })),
      });
      toast.success(t("courses.toast.lessonsUpdated"));
      await loadCourseDetails(selectedCourseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || t("courses.errors.updateLessons"));
    } finally {
      setLoading(false);
    }
  };

  const onAssign = async (assignAll = false) => {
    if (!selectedCourseId) return;
    setLoading(true);
    try {
      await adminAssignCourseFreelancersRequest(selectedCourseId, {
        assignAll,
        freelancerIds: assignAll ? [] : selectedFreelancerIds.map((x) => Number(x)),
      });
      toast.success(assignAll ? t("courses.toast.assignedAll") : t("courses.toast.assignmentUpdated"));
      await loadCourseDetails(selectedCourseId);
      await fetchCoursesList();
    } catch (err) {
      toast.error(err?.response?.data?.message || t("courses.errors.saveAssignment"));
    } finally {
      setLoading(false);
    }
  };

  const requestDeleteCourse = (courseId) => {
    if (!courseId || loading) return;
    setDeleteConfirmCourseId(String(courseId));
  };

  const cancelDeleteCourse = () => {
    if (loading) return;
    setDeleteConfirmCourseId("");
  };

  const confirmDeleteCourse = async () => {
    const courseId = deleteConfirmCourseId;
    if (!courseId || loading) return;
    setLoading(true);
    try {
      await adminDeleteCourseRequest(courseId);
      toast.success(t("courses.toast.courseDeleted"));
      if (String(selectedCourseId) === String(courseId)) {
        setSelectedCourseId("");
        setSelectedCourse(null);
        setSelectedFreelancerIds([]);
        setManageModalOpen(false);
      }
      setDeleteConfirmCourseId("");
      await fetchCoursesList();
    } catch (err) {
      toast.error(err?.response?.data?.message || t("courses.errors.deleteCourse"));
    } finally {
      setLoading(false);
    }
  };

  const onToggleGlobalVisibility = async (course, nextValue) => {
    if (!course?.id) return;
    const courseId = String(course.id);
    const nextVisible = Boolean(nextValue);
    const previousVisible = Boolean(course.isVisibleToAllFreelancers);
    setVisibilityTogglingId(courseId);
    patchCourseListRow(courseId, { isVisibleToAllFreelancers: nextVisible });
    if (String(selectedCourseId) === courseId) {
      setSelectedCourse((s) =>
        s?.course ? { ...s, course: { ...s.course, isVisibleToAllFreelancers: nextVisible } } : s,
      );
    }
    try {
      const res = await adminUpdateCourseRequest(course.id, { isVisibleToAllFreelancers: nextVisible });
      const updatedCourse = res?.data?.course;
      const publishReadiness = res?.data?.publishReadiness;
      patchCourseListRow(courseId, {
        isVisibleToAllFreelancers: nextVisible,
        ...(updatedCourse?.isActive !== undefined ? { isActive: updatedCourse.isActive } : {}),
        ...(updatedCourse?.updatedAt ? { updatedAt: updatedCourse.updatedAt } : {}),
      });
      if (String(selectedCourseId) === courseId && updatedCourse) {
        setSelectedCourse((s) =>
          s?.course
            ? {
                ...s,
                course: {
                  ...s.course,
                  isVisibleToAllFreelancers: nextVisible,
                  ...(updatedCourse.isActive !== undefined ? { isActive: updatedCourse.isActive } : {}),
                  ...(updatedCourse.updatedAt ? { updatedAt: updatedCourse.updatedAt } : {}),
                },
              }
            : s,
        );
      }
      if (nextVisible) {
        if (updatedCourse?.isActive) {
          toast.success(t("courses.toast.publishedGlobal"));
        } else {
          const missing = publishReadiness?.missingLabels?.filter(Boolean).join(locale === "en" ? ", " : "، ");
          toast.error(
            missing
              ? t("courses.toast.visibilityGlobalDraftMissing", { missing })
              : t("courses.toast.visibilityGlobalDraft"),
          );
        }
      } else {
        const assignedCount = Number(course.assignedCount) || 0;
        toast.success(
          assignedCount > 0
            ? t("courses.toast.visibilityOffWithAssign", { count: assignedCount })
            : t("courses.toast.visibilityOff"),
        );
      }
      void fetchCoursesList({ silent: true });
      if (String(selectedCourseId) === courseId) {
        void loadCourseDetails(course.id);
      }
    } catch (err) {
      patchCourseListRow(courseId, { isVisibleToAllFreelancers: previousVisible });
      if (String(selectedCourseId) === courseId) {
        setSelectedCourse((s) =>
          s?.course ? { ...s, course: { ...s.course, isVisibleToAllFreelancers: previousVisible } } : s,
        );
      }
      toast.error(err?.response?.data?.message || t("courses.errors.updateAccess"));
    } finally {
      setVisibilityTogglingId("");
    }
  };

  const onOpenSendModal = (course) => {
    if (course?.isVisibleToAllFreelancers) return;
    setSendRowLoadingId(null);
    setUnassignRowLoadingId(null);
    setSendAssignedReady(false);
    setSendModal({ open: true, course });
    setSendQuery("");
    setSendResults([]);
  };

  const freelancerDisplayName = (f) =>
    `${f.firstName || ""} ${f.fatherName || ""} ${f.familyName || ""}`.trim() || f.email || f.accountId || t("courses.admin.freelancerFallback");

  const onSendCourseToFreelancer = async (courseId, freelancerId, displayName) => {
    const fid = Number(freelancerId);
    if (!courseId || !Number.isInteger(fid) || fid < 1) {
      toast.error(t("courses.errors.invalidFreelancerId"));
      return;
    }
    setSendRowLoadingId(String(fid));
    try {
      await adminAddCourseFreelancerRequest(courseId, fid);
      setSendAssignedIds((prev) => new Set([...prev, String(fid)]));
      toast.success(t("courses.toast.sentToFreelancer", { name: displayName || t("courses.admin.freelancerFallback") }));
      setSendModal({ open: false, course: null });
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) {
        await loadCourseDetails(courseId);
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 409) {
        setSendAssignedIds((prev) => new Set([...prev, String(fid)]));
      }
      const msg = err?.response?.data?.message || t("courses.errors.sendCourse");
      toast.error(msg);
    } finally {
      setSendRowLoadingId(null);
    }
  };

  const onUnassignCourseFromFreelancer = async (courseId, freelancerId, displayName) => {
    const fid = Number(freelancerId);
    if (!courseId || !Number.isInteger(fid) || fid < 1) {
      toast.error(t("courses.errors.invalidFreelancerId"));
      return;
    }
    setUnassignRowLoadingId(String(fid));
    try {
      await adminRemoveCourseFreelancerRequest(courseId, fid);
      setSendAssignedIds((prev) => {
        const next = new Set(prev);
        next.delete(String(fid));
        return next;
      });
      toast.success(t("courses.toast.unassignedFromFreelancer", { name: displayName || t("courses.admin.freelancerFallback") }));
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) {
        await loadCourseDetails(courseId);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t("courses.errors.unassignCourse"));
    } finally {
      setUnassignRowLoadingId(null);
    }
  };

  const openManageModal = useCallback((course, initialTab = "details") => {
    setManageTab(initialTab);
    setSelectedCourse(null);
    setCourseDetailsLoading(true);
    setSelectedCourseId(course.id);
    setManageModalOpen(true);
  }, []);

  const closeManageModal = useCallback(() => {
    setManageModalOpen(false);
    setManageTab("details");
    setSelectedCourseId("");
    setSelectedCourse(null);
    setSelectedFreelancerIds([]);
    setImportUrl("");
    setCourseDetailsLoading(false);
    setFreelancerQuery("");
    setProgressQuery("");
  }, []);

  useEffect(() => {
    if (!manageModalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !loading) closeManageModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [manageModalOpen, loading, closeManageModal]);

  useEffect(() => {
    if (!composerOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !creating && !composerUnsavedConfirmOpen) requestCloseComposerModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composerOpen, creating, composerUnsavedConfirmOpen, requestCloseComposerModal]);

  /** Lock page scroll while composer is open (body + admin outlet scroll container). */
  useEffect(() => {
    if (!composerOpen) return undefined;
    const outlet = document.querySelector(".oh-sa-outlet");
    const prevBodyOverflow = document.body.style.overflow;
    const prevOutletOverflow = outlet instanceof HTMLElement ? outlet.style.overflow : "";
    document.body.style.overflow = "hidden";
    if (outlet instanceof HTMLElement) outlet.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      if (outlet instanceof HTMLElement) outlet.style.overflow = prevOutletOverflow;
    };
  }, [composerOpen]);

  useEffect(() => {
    if (!composerUnsavedConfirmOpen) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") cancelDiscardComposerModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [composerUnsavedConfirmOpen, cancelDiscardComposerModal]);

  const manageCourseTitle = selectedCourse?.course?.title || "";

  return (
    <>
      <DashboardShell className="oh-admin-courses">
        <DashboardPageHeader
          eyebrow={t("courses.admin.eyebrow")}
          title={t("courses.admin.pageTitle")}
          description={
            isSuperAdmin
              ? t("courses.admin.descriptionSuper")
              : t("courses.admin.descriptionAdmin")
          }
          breadcrumbs={[
            { label: t("courses.admin.breadcrumbHome"), href: breadcrumbHomeFromUser(user) },
            { label: t("courses.admin.breadcrumbCourses") },
          ]}
          actions={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setCourseTextAdsModalOpen(true)}>
                {t("courses.admin.manageTextAds")}
              </button>
              <button type="button" className="btn btn-primary" onClick={openCreateComposerModal}>
                {t("courses.admin.createCourse")}
              </button>
            </>
          }
        />

        <DashboardSection title={t("courses.admin.listTitle")} description={t("courses.admin.listDescription")}>
          <div className="oh-admin-courses__toolbar">
            <input
              className="oh-admin-courses__input"
              type="search"
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              placeholder={t("courses.admin.searchPlaceholder")}
              aria-label={t("courses.admin.searchAria")}
            />
            <select
              className="oh-admin-courses__input oh-admin-courses__filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t("courses.admin.filterStatusAria")}
            >
              <option value="all">{t("courses.status.allStatuses")}</option>
              <option value="published">{t("courses.status.published")}</option>
              <option value="draft">{t("courses.status.draftDisabled")}</option>
            </select>
            <button type="button" className="btn btn-secondary" onClick={() => void fetchCoursesList()} disabled={loading}>
              {t("courses.common.refresh")}
            </button>
          </div>

          {coursesLoadError ? (
            <WidgetLoadError message={coursesLoadError} onRetry={retryCoursesLoad} />
          ) : null}

          {loading && !courses.length ? (
            <DashboardLoadingState label={t("courses.admin.loadingCourses")} />
          ) : null}

          {!loading && !courses.length ? (
            <DashboardEmptyState
              title={t("courses.admin.emptyTitle")}
              description={t("courses.admin.emptyDescription")}
              icon={
                <svg
                  className="h-12 w-12 text-slate-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden
                >
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <path d="M8 7h8M8 11h6" strokeLinecap="round" />
                </svg>
              }
            />
          ) : null}

          {courses.length > 0 ? (
            <DashboardTable caption={t("courses.admin.tableCaption")} className="oh-admin-courses__table-wrap">
              <thead>
                <tr>
                  <th className="oh-admin-courses__col-course">{t("courses.textAds.course")}</th>
                  <th className="oh-admin-courses__col-status">{t("courses.admin.learningStatus")}</th>
                  <th className="oh-admin-courses__col-access">{t("courses.admin.colAccess")}</th>
                  <th className="oh-admin-courses__col-date">{t("courses.admin.colUpdated")}</th>
                  <th className="oh-admin-courses__col-visibility">{t("courses.admin.colVisibility")}</th>
                  <th className="oh-admin-courses__col-actions">{t("courses.admin.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => {
                  const isGlobal = Boolean(c.isVisibleToAllFreelancers);
                  const visibilityBusy = visibilityTogglingId === String(c.id);
                  const status = courseListStatusPresentation(c, t);
                  return (
                  <tr key={c.id} className="oh-admin-courses__table-row">
                    <td className="oh-admin-courses__col-course">
                      <div className="oh-admin-courses__course-anchor">
                        <p className="oh-admin-courses__course-title">{c.title}</p>
                        <div className="oh-admin-courses__course-meta" aria-label={t("courses.admin.courseSummaryAria")}>
                          <span className="oh-admin-courses__meta-chip">{formatLessonChipCount(c.lessonsCount, t)}</span>
                          <span
                            className="oh-admin-courses__meta-chip oh-admin-courses__meta-chip--muted"
                            title={
                              isGlobal
                                ? t("courses.admin.tooltipGlobalFreelancers")
                                : t("courses.admin.tooltipAssignedFreelancers")
                            }
                          >
                            {formatAccessChipCount(c.assignedCount, isGlobal, t)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="oh-admin-courses__col-status">
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </td>
                    <td className="oh-admin-courses__col-access">
                      <div className="oh-admin-courses__access-cell">
                        <StatusBadge tone={isGlobal ? "active" : "neutral"}>
                          {isGlobal ? t("courses.admin.accessGlobalChip") : t("courses.admin.accessCustom")}
                        </StatusBadge>
                        {!isGlobal && Number(c.assignedCount) > 0 ? (
                          <span className="oh-admin-courses__access-hint" title={t("courses.admin.hintAssignedOnly")}>
                            {formatAccessChipCount(c.assignedCount, false, t)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="oh-admin-courses__col-date">
                      <time dateTime={c.updatedAt || undefined}>{fmtCourseDate(c.updatedAt, locale)}</time>
                    </td>
                    <td className="oh-admin-courses__col-visibility">
                      <label
                        className="oh-admin-courses__row-toggle"
                        title={
                          isGlobal
                            ? t("courses.admin.visibilityTitleGlobal")
                            : Number(c.assignedCount) > 0
                              ? t("courses.admin.visibilityTitlePartial")
                              : t("courses.admin.visibilityTitleEnable")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isGlobal}
                          disabled={loading || visibilityBusy}
                          onChange={(e) => void onToggleGlobalVisibility(c, e.target.checked)}
                          aria-label={t("courses.admin.visibilityAria")}
                        />
                        <span className="oh-admin-courses__row-toggle-label">
                          {isGlobal ? t("courses.admin.visibilityOnLabel") : t("courses.admin.visibilityOffLabel")}
                        </span>
                      </label>
                    </td>
                    <td className="oh-admin-courses__col-actions">
                      <div className="oh-admin-courses__table-actions">
                        <button
                          type="button"
                          className="btn btn-primary oh-admin-courses__row-btn oh-admin-courses__row-btn--primary"
                          onClick={() => openManageModal(c)}
                          disabled={loading}
                        >
                          {t("courses.admin.manageLessons")}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary oh-admin-courses__row-btn"
                          onClick={() => onStartEditCourse(c)}
                          disabled={loading}
                        >
                          {t("courses.common.edit")}
                        </button>
                        {!c.isActive ? (
                          <button
                            type="button"
                            className="btn btn-secondary oh-admin-courses__row-btn"
                            onClick={() => void onPublishCourse(c.id)}
                            disabled={loading}
                          >
                            {t("courses.admin.publish")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary oh-admin-courses__row-btn"
                            onClick={() => void onArchiveCourse(c.id)}
                            disabled={loading}
                          >
                            {t("courses.admin.archive")}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary oh-admin-courses__row-btn oh-admin-courses__row-btn--quiet"
                          onClick={() => onOpenSendModal(c)}
                          disabled={loading || isGlobal}
                          title={
                            isGlobal
                              ? t("courses.admin.assignTitleGlobal")
                              : t("courses.admin.assignTitleManual")
                          }
                        >
                          {t("courses.admin.assignToFreelancer")}
                        </button>
                        <button
                          type="button"
                          className="btn oh-admin-courses__row-btn oh-admin-courses__row-btn--danger"
                          onClick={() => requestDeleteCourse(c.id)}
                          disabled={loading}
                        >
                          {t("courses.common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </DashboardTable>
          ) : null}
        </DashboardSection>
      </DashboardShell>

      <ConfirmDialog
        open={composerUnsavedConfirmOpen}
        title={t("courses.admin.unsavedTitle")}
        body={t("courses.admin.unsavedBody")}
        cancelLabel={t("courses.admin.unsavedContinue")}
        confirmLabel={t("courses.admin.unsavedDiscard")}
        confirmVariant="danger"
        layerClassName="z-[1300]"
        onCancel={cancelDiscardComposerModal}
        onConfirm={confirmDiscardComposerModal}
      />

      <ConfirmDialog
        open={Boolean(deleteConfirmCourseId)}
        title={t("courses.admin.deleteTitle")}
        body={t("courses.admin.deleteBody")}
        cancelLabel={t("courses.common.cancel")}
        confirmLabel={t("courses.admin.deleteConfirm")}
        confirmVariant="danger"
        confirmBusy={loading}
        onCancel={cancelDeleteCourse}
        onConfirm={confirmDeleteCourse}
      />

      {composerOpen ? (
        <div
          className="oh-admin-courses__modal-backdrop oh-admin-courses__modal-backdrop--composer"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !creating && !composerUnsavedConfirmOpen) requestCloseComposerModal();
          }}
        >
          <div
            className="oh-admin-courses__modal oh-admin-courses__modal--composer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="composer-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="oh-admin-courses__modal-header">
              <h2 id="composer-modal-title" className="oh-admin-courses__modal-title">
                {editingCourseId ? t("courses.admin.composerEditTitle") : t("courses.admin.createCourse")}
              </h2>
              <button
                type="button"
                className="oh-admin-courses__modal-close"
                onClick={requestCloseComposerModal}
                disabled={creating}
                aria-label={t("courses.common.close")}
              >
                ×
              </button>
            </header>

            <AdminCourseCreateComposer
              mode={editingCourseId ? "edit" : "create"}
              form={createForm}
              setForm={setCreateForm}
              creating={creating}
              editingCourseId={editingCourseId}
              editMeta={editingCourseMeta}
              onSubmit={onComposerSubmit}
              onCancelEdit={requestCloseComposerModal}
              onUploadCourseTestFile={onUploadCourseTestFile}
              onUploadCoursePromptFile={onUploadCoursePromptFile}
              onUploadCourseModelAnswerFile={onUploadCourseModelAnswerFile}
              onUploadError={(msg) => toast.error(msg)}
              testFileUploading={testFileUploading}
              promptFileUploading={promptFileUploading}
              modelAnswerFileUploading={modelAnswerFileUploading}
              pendingCreateTestFile={createPendingTestFile}
              pendingCreatePromptFile={createPendingPromptFile}
              pendingCreateModelAnswerFile={createPendingModelAnswerFile}
              onPendingCreateTestFile={onPendingCreateTestFile}
              onPendingCreatePromptFile={onPendingCreatePromptFile}
              onPendingCreateModelAnswerFile={onPendingCreateModelAnswerFile}
              onRemoveCourseTestFile={onRemoveComposerTestFile}
              onRemoveCoursePromptFile={onRemoveComposerPromptFile}
              onRemoveCourseModelAnswerFile={onRemoveComposerModelAnswerFile}
              fileRemoveBusy={fileRemoveBusy}
              membershipRequiredCourseId={membershipRequiredCourseId}
            />
          </div>
        </div>
      ) : null}

      {manageModalOpen ? (
        <div
          className="oh-admin-courses__modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !loading) closeManageModal();
          }}
        >
          <div
            className="oh-admin-courses__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-course-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="oh-admin-courses__modal-header">
              <h2 id="manage-course-modal-title" className="oh-admin-courses__modal-title">
                {t("courses.admin.manageCourseTitle", { title: courseDetailsLoading ? "…" : manageCourseTitle })}
              </h2>
              <button
                type="button"
                className="oh-admin-courses__modal-close"
                onClick={closeManageModal}
                disabled={loading}
                aria-label={t("courses.common.close")}
              >
                ×
              </button>
            </header>

            <div className="oh-admin-courses__modal-tabs" role="tablist" aria-label={t("courses.admin.manageTabsAria")}>
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "details"}
                className={`oh-admin-courses__modal-tab ${manageTab === "details" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("details")}
              >
                {t("courses.admin.tabDetails")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "lessons"}
                className={`oh-admin-courses__modal-tab ${manageTab === "lessons" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("lessons")}
              >
                {t("courses.admin.tabLessons")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "assign"}
                className={`oh-admin-courses__modal-tab ${manageTab === "assign" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("assign")}
              >
                {t("courses.admin.tabAssign")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "progress"}
                className={`oh-admin-courses__modal-tab ${manageTab === "progress" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("progress")}
              >
                {t("courses.admin.tabProgress")}
              </button>
            </div>

            <div className="oh-admin-courses__modal-body">
              {courseDetailsLoading ? (
                <p className="oh-admin-courses__modal-loading">{t("courses.admin.loadingCourseDetails")}</p>
              ) : selectedCourse?.course ? (
                <>
                  {manageTab === "details" ? (
                    <div className="oh-admin-courses__modal-panel" role="tabpanel">
                      {selectedCourse.publishReadiness && !selectedCourse.publishReadiness.ok ? (
                        <p className="oh-admin-courses__readiness-warn" role="status">
                          {t("courses.admin.publishBlockedPrefix")} {(selectedCourse.publishReadiness.missingLabels || []).join(", ")}
                        </p>
                      ) : null}
                      <form className="oh-admin-courses__form" onSubmit={onUpdateCourse}>
                        <label className="oh-admin-courses__field">
                          <span>{t("courses.admin.fieldTitle")}</span>
                          <input
                            className="oh-admin-courses__input"
                            value={selectedCourse.course.title || ""}
                            onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, title: e.target.value } }))}
                          />
                        </label>
                        <label className="oh-admin-courses__field">
                          <span>{t("courses.admin.fieldDescription")}</span>
                          <textarea
                            className="oh-admin-courses__textarea"
                            rows={4}
                            value={selectedCourse.course.description || ""}
                            onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, description: e.target.value } }))}
                          />
                        </label>
                        <CourseUrlField
                          label={t("courses.admin.coverImageUrl")}
                          optional
                          value={selectedCourse.course.coverImage || ""}
                          onChange={(e) =>
                            setSelectedCourse((s) => ({ ...s, course: { ...s.course, coverImage: e.target.value } }))
                          }
                          updatedAt={selectedCourse.course.updatedAt}
                          linkTitle={t("courses.admin.coverLinkTitle")}
                        />
                        {selectedCourse.course.youtubeSourceUrl ? (
                          <CourseUrlField
                            label={t("courses.composer.youtubeSavedLabel")}
                            value={selectedCourse.course.youtubeSourceUrl}
                            readOnly
                            updatedAt={selectedCourse.course.updatedAt}
                            linkTitle={t("courses.admin.courseSourceYoutube")}
                          />
                        ) : null}
                        <label className="oh-admin-courses__toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedCourse.course.isActive)}
                            onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, isActive: e.target.checked } }))}
                          />
                          <span>{t("courses.admin.courseActiveState")}</span>
                        </label>
                        <div className="oh-admin-courses__modal-divider" />
                        <h3 className="oh-admin-courses__modal-subheading">{t("courses.admin.postCourseExam")}</h3>
                        <p className="oh-admin-courses__modal-hint">
                          {t("courses.admin.postCourseExamHint")}
                        </p>
                        <label className="oh-admin-courses__toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedCourse.course.isTestingEnabled)}
                            onChange={(e) =>
                              setSelectedCourse((s) => ({ ...s, course: { ...s.course, isTestingEnabled: e.target.checked } }))
                            }
                          />
                          <span>{t("courses.admin.enablePostCourseExam")}</span>
                        </label>
                        {selectedCourse.course.isTestingEnabled ? (
                          <>
                            <CourseFileManagerSection
                              label={t("courses.composer.testFileLabel")}
                              description={t("courses.assets.finalExamHint")}
                              value={selectedCourse.course.testFileUrl || ""}
                              onChangeUrl={(next) =>
                                setSelectedCourse((s) => ({ ...s, course: { ...s.course, testFileUrl: next } }))
                              }
                              fileKind="test"
                              courseId={selectedCourseId}
                              updatedAt={selectedCourse.course.updatedAt}
                              disabled={loading}
                              uploading={testFileUploading}
                              removing={fileRemoveBusy}
                              isEdit
                              onFileSelected={(f) => {
                                if (selectedCourseId) void onUploadCourseTestFile(selectedCourseId, f);
                              }}
                              onValidationError={(msg) => toast.error(msg)}
                              onRemove={onRemoveManageTestFile}
                            />
                            <CourseFileManagerSection
                              label={t("courses.composer.promptFileLabel")}
                              description={t("courses.composer.promptFileDesc")}
                              value={selectedCourse.course.testPromptFileUrl || ""}
                              onChangeUrl={(next) =>
                                setSelectedCourse((s) => ({ ...s, course: { ...s.course, testPromptFileUrl: next } }))
                              }
                              fileKind="prompt"
                              courseId={selectedCourseId}
                              updatedAt={selectedCourse.course.updatedAt}
                              disabled={loading}
                              uploading={promptFileUploading}
                              removing={fileRemoveBusy}
                              isEdit
                              onFileSelected={(f) => {
                                if (selectedCourseId) void onUploadCoursePromptFile(selectedCourseId, f);
                              }}
                              onValidationError={(msg) => toast.error(msg)}
                              onRemove={onRemoveManagePromptFile}
                            />
                            <CourseFileManagerSection
                              label={t("courses.assets.modelAnswerTitle")}
                              description={t("courses.composer.modelAnswerDesc")}
                              value={selectedCourse.course.testModelAnswerFileUrl || ""}
                              onChangeUrl={(next) =>
                                setSelectedCourse((s) => ({
                                  ...s,
                                  course: { ...s.course, testModelAnswerFileUrl: next },
                                }))
                              }
                              fileKind="model-answer"
                              courseId={selectedCourseId}
                              updatedAt={selectedCourse.course.updatedAt}
                              disabled={loading}
                              uploading={modelAnswerFileUploading}
                              removing={fileRemoveBusy}
                              isEdit
                              onFileSelected={(f) => {
                                if (selectedCourseId) void onUploadCourseModelAnswerFile(selectedCourseId, f);
                              }}
                              onValidationError={(msg) => toast.error(msg)}
                              onRemove={onRemoveManageModelAnswerFile}
                            />
                            <ExamQuestionsEditor
                              disabled={loading}
                              questionCount={
                                selectedCourse.course.testQuestionCount != null
                                  ? String(selectedCourse.course.testQuestionCount)
                                  : ""
                              }
                              examQuestions={parseExamQuestions(selectedCourse.course.examQuestions)}
                              onQuestionCountChange={(next) =>
                                setSelectedCourse((s) => ({
                                  ...s,
                                  course: {
                                    ...s.course,
                                    testQuestionCount: next === "" ? null : Number(next),
                                  },
                                }))
                              }
                              onExamQuestionsChange={(next) =>
                                setSelectedCourse((s) => ({
                                  ...s,
                                  course: { ...s.course, examQuestions: next },
                                }))
                              }
                            />
                          </>
                        ) : null}
                        <div className="oh-admin-courses__submit-row">
                          <button
                            className="btn btn-primary oh-admin-courses__btn-primary"
                            type="submit"
                            disabled={
                              loading ||
                              (selectedCourse.course.isTestingEnabled &&
                                !isExamQuestionsEditorValid(
                                  selectedCourse.course.testQuestionCount,
                                  parseExamQuestions(selectedCourse.course.examQuestions),
                                ))
                            }
                          >
                            {t("courses.admin.saveCourseDetails")}
                          </button>
                        </div>
                      </form>

                      <div className="oh-admin-courses__modal-divider" />
                      <h3 className="oh-admin-courses__modal-subheading">{t("courses.admin.importNewLessons")}</h3>
                      <div className="oh-admin-courses__form">
                        <label className="oh-admin-courses__field">
                          <span>{t("courses.admin.newYoutubeUrl")}</span>
                          <input
                            className="oh-admin-courses__input"
                            dir="ltr"
                            value={importUrl}
                            onChange={(e) => setImportUrl(e.target.value)}
                            placeholder="https://..."
                          />
                        </label>
                        <div className="oh-admin-courses__submit-row">
                          <button
                            className="btn btn-secondary oh-admin-courses__btn-outline"
                            type="button"
                            onClick={onImportLessons}
                            disabled={loading || !importUrl.trim()}
                          >
                            {t("courses.admin.importLessonsBtn")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {manageTab === "lessons" ? (
                    <div className="oh-admin-courses__modal-panel oh-admin-courses__modal-panel--lessons" role="tabpanel">
                      <p className="oh-admin-courses__modal-hint">{t("courses.admin.lessonsEditHint")}</p>
                      <div className="oh-admin-courses__lesson-scroll">
                        <div className="oh-admin-courses__lesson-grid">
                          {(selectedCourse.lessons || []).map((lesson, idx) => (
                            <div key={lesson.id} className="oh-admin-courses__lesson-card">
                              <label className="oh-admin-courses__field">
                                <span>{t("courses.admin.lessonTitle")}</span>
                                <input
                                  className="oh-admin-courses__input"
                                  value={lesson.title || ""}
                                  onChange={(e) =>
                                    setSelectedCourse((s) => ({
                                      ...s,
                                      lessons: s.lessons.map((x) => (x.id === lesson.id ? { ...x, title: e.target.value } : x)),
                                    }))
                                  }
                                />
                              </label>
                              <label className="oh-admin-courses__field">
                                <span>
                                  {t("courses.admin.lessonDescription")}{" "}
                                  <span className="oh-admin-courses__optional">{t("courses.common.optional")}</span>
                                </span>
                                <textarea
                                  className="oh-admin-courses__textarea"
                                  rows={2}
                                  value={lesson.description || ""}
                                  onChange={(e) =>
                                    setSelectedCourse((s) => ({
                                      ...s,
                                      lessons: s.lessons.map((x) =>
                                        x.id === lesson.id ? { ...x, description: e.target.value } : x,
                                      ),
                                    }))
                                  }
                                />
                              </label>
                              <div className="oh-admin-courses__lesson-row">
                                <label className="oh-admin-courses__field">
                                  <span>{t("courses.admin.sortOrder")}</span>
                                  <input
                                    className="oh-admin-courses__input"
                                    type="number"
                                    min={1}
                                    value={lesson.sortOrder || idx + 1}
                                    onChange={(e) =>
                                      setSelectedCourse((s) => ({
                                        ...s,
                                        lessons: s.lessons.map((x) => (x.id === lesson.id ? { ...x, sortOrder: Number(e.target.value) } : x)),
                                      }))
                                    }
                                  />
                                </label>
                                <label className="oh-admin-courses__toggle oh-admin-courses__toggle--inline">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(lesson.isActive)}
                                    onChange={(e) =>
                                      setSelectedCourse((s) => ({
                                        ...s,
                                        lessons: s.lessons.map((x) => (x.id === lesson.id ? { ...x, isActive: e.target.checked } : x)),
                                      }))
                                    }
                                  />
                                  <span>{t("courses.status.active")}</span>
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {!selectedCourse.lessons?.length ? <p className="help">{t("courses.admin.noLessonsYet")}</p> : null}
                      <div className="oh-admin-courses__modal-footer-actions">
                        <button className="btn btn-primary" type="button" onClick={onSaveLessons} disabled={loading || !selectedCourse?.lessons?.length}>
                          {t("courses.admin.saveLessons")}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {manageTab === "assign" ? (
                    <div className="oh-admin-courses__modal-panel oh-admin-courses__modal-panel--assign" role="tabpanel">
                      {selectedCourse.course.isVisibleToAllFreelancers ? (
                        <p className="oh-admin-courses__global-info" role="status">
                          {t("courses.admin.globalAssignInfo")}
                        </p>
                      ) : (
                      <>
                      {freelancersLoadError ? (
                        <WidgetLoadError message={freelancersLoadError} onRetry={retryFreelancersLoad} />
                      ) : null}
                      <div className="oh-admin-courses__tab-top">
                        <input
                          className="oh-admin-courses__input"
                          type="search"
                          value={freelancerQuery}
                          onChange={(e) => setFreelancerQuery(e.target.value)}
                          placeholder={t("courses.admin.searchProgressPlaceholder")}
                          aria-label={t("courses.admin.searchFreelancerAria")}
                          autoComplete="off"
                        />
                        <div className="oh-admin-courses__tab-meta" aria-live="polite">
                          <span>{t("courses.admin.resultCount", { count: filteredFreelancers.length })}</span>
                          <span className="oh-admin-courses__tab-meta-sep" aria-hidden>
                            ·
                          </span>
                          <span>{t("courses.admin.selectedCount", { count: selectedFreelancerIds.length })}</span>
                        </div>
                      </div>
                      <div className="oh-admin-courses__field-label-muted">{t("courses.admin.freelancerListLabel")}</div>
                      <div className="oh-admin-courses__checkbox-list oh-admin-courses__checkbox-list--scroll">
                        {freelancers.length > 0 && freelancerQuery.trim() && filteredFreelancers.length === 0 ? (
                          <p className="help oh-admin-courses__tab-empty-msg">{t("courses.admin.noMatchingResults")}</p>
                        ) : (
                          filteredFreelancers.map((f) => {
                            const checked = selectedFreelancerIds.includes(f.id);
                            return (
                              <label key={f.id} className="oh-admin-courses__checkbox-row">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setSelectedFreelancerIds((prev) =>
                                      e.target.checked ? [...new Set([...prev, f.id])] : prev.filter((x) => x !== f.id),
                                    )
                                  }
                                />
                                <span>
                                  {f.firstName} {f.fatherName} {f.familyName} ({f.accountId || "-"}){f.email ? ` · ${f.email}` : ""}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                      <div className="oh-admin-courses__assign-actions oh-admin-courses__assign-actions--sticky">
                        <button
                          className="btn btn-secondary oh-admin-courses__btn-outline"
                          type="button"
                          onClick={() => setSelectedFreelancerIds(filteredFreelancers.map((f) => f.id))}
                        >
                          {t("courses.admin.selectAll")}
                        </button>
                        <button className="btn btn-secondary oh-admin-courses__btn-outline" type="button" onClick={() => setSelectedFreelancerIds([])}>
                          {t("courses.admin.clearAll")}
                        </button>
                        <button className="btn btn-primary" type="button" onClick={() => onAssign(false)} disabled={loading}>
                          {t("courses.admin.saveSelectedAssignment")}
                        </button>
                      </div>
                      </>
                      )}
                    </div>
                  ) : null}

                  {manageTab === "progress" ? (
                    <div className="oh-admin-courses__modal-panel oh-admin-courses__modal-panel--progress" role="tabpanel">
                      <div className="oh-admin-courses__tab-top">
                        <input
                          className="oh-admin-courses__input"
                          type="search"
                          value={progressQuery}
                          onChange={(e) => setProgressQuery(e.target.value)}
                          placeholder={t("courses.admin.searchProgressPlaceholder")}
                          aria-label={t("courses.admin.searchProgressAria")}
                          autoComplete="off"
                        />
                        <div className="oh-admin-courses__tab-meta" aria-live="polite">
                          <span>{t("courses.admin.resultCount", { count: filteredAssignments.length })}</span>
                          {(selectedCourse.assignments || []).length > 0 ? (
                            <>
                              <span className="oh-admin-courses__tab-meta-sep" aria-hidden>
                                ·
                              </span>
                              <span>{t("courses.admin.totalAssigned", { count: (selectedCourse.assignments || []).length })}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <p className="oh-admin-courses__modal-hint">{t("courses.admin.progressHint")}</p>
                      {!selectedCourse.assignments?.length ? (
                        <p className="help oh-admin-courses__tab-empty-msg">{t("courses.admin.noAssigneesYet")}</p>
                      ) : progressQuery.trim() && filteredAssignments.length === 0 ? (
                        <p className="help oh-admin-courses__tab-empty-msg">{t("courses.admin.noMatchingResults")}</p>
                      ) : (
                        <div className="oh-admin-courses__progress-scroll">
                          <div className="oh-admin-courses__progress-grid">
                            {filteredAssignments.map((a) => (
                              <div key={a.freelancerId} className="oh-admin-courses__progress-card">
                                <div className="oh-admin-courses__progress-card-head">
                                  <div className="oh-admin-courses__progress-name">
                                    {a.firstName} {a.fatherName} {a.familyName}
                                  </div>
                                  <CourseProgressFreelancerActions
                                    assignment={a}
                                    assignablePlans={assignablePlans}
                                    assignablePlansLoading={assignablePlansLoading}
                                    onSubscriptionUpdate={patchAssignmentSubscription}
                                  />
                                </div>
                                <div className="oh-admin-courses__progress-meta">{t("courses.admin.accountLabel", { id: a.accountId || t("courses.common.dash") })}</div>
                                <div className="oh-admin-courses__progress-bar-wrap" aria-hidden>
                                  <div
                                    className="oh-admin-courses__progress-bar"
                                    style={{ width: `${Math.min(100, Math.max(0, Number(a.progress?.percentage) || 0))}%` }}
                                  />
                                </div>
                                <div className="oh-admin-courses__progress-stats">
                                  {t("courses.admin.progressStats", { completed: a.progress?.completedLessons ?? 0, total: a.progress?.totalLessons ?? 0, percent: a.progress?.percentage ?? 0 })}
                                </div>
                                <dl className="oh-admin-courses__learning-duration">
                                  <div className="oh-admin-courses__learning-duration-row">
                                    <dt>{t("courses.admin.learningStatus")}</dt>
                                    <dd>{a.learning?.learningStatusLabel || "—"}</dd>
                                  </div>
                                  <div className="oh-admin-courses__learning-duration-row">
                                    <dt>{t("courses.admin.learningStarted")}</dt>
                                    <dd>{formatLearningTimestamp(a.learning?.startedLearningAt)}</dd>
                                  </div>
                                  {a.learning?.finishedLearningAt ? (
                                    <div className="oh-admin-courses__learning-duration-row">
                                      <dt>{t("courses.admin.learningFinished")}</dt>
                                      <dd>{formatLearningTimestamp(a.learning.finishedLearningAt)}</dd>
                                    </div>
                                  ) : null}
                                  {a.learning?.canShowCompletionDuration ? (
                                    <div className="oh-admin-courses__learning-duration-row">
                                      <dt>{t("courses.admin.completionDuration")}</dt>
                                      <dd>{formatCompletionDuration(a.learning?.completionDurationSeconds)}</dd>
                                    </div>
                                  ) : null}
                                </dl>
                                {a.examFinalGrade != null ? (
                                  <div className="oh-admin-courses__exam-grade-block">
                                    <div className="oh-admin-courses__exam-grade-head">
                                      <strong>{t("courses.admin.finalGrade", { grade: a.examFinalGrade })}</strong>
                                      {a.examSubmittedAt ? (
                                        <span className="oh-admin-courses__exam-grade-date">
{t("courses.admin.submittedAt")}{" "}
                                          {new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
                                            dateStyle: "medium",
                                          }).format(new Date(a.examSubmittedAt))}
                                        </span>
                                      ) : null}
                                    </div>
                                    {Array.isArray(a.examQuestionMarks) && a.examQuestionMarks.length > 0 ? (
                                      <ul className="oh-admin-courses__exam-marks-list">
                                        {a.examQuestionMarks.map((mark, idx) => (
                                          <li key={`${a.freelancerId}-q-${idx}`}>
                                            {t("courses.admin.questionMark", { num: idx + 1, mark })}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                ) : selectedCourse.course.isTestingEnabled &&
                                  (a.progress?.completedLessons ?? 0) >= (a.progress?.totalLessons ?? 0) &&
                                  (a.progress?.totalLessons ?? 0) > 0 ? (
                                  <p className="oh-admin-courses__exam-grade-pending">{t("courses.admin.awaitingFinalExam")}</p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="help">{t("courses.errors.loadCourseFailed")}</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {sendModal.open && sendModal.course && !sendModal.course.isVisibleToAllFreelancers ? (
        <div
          className="oh-admin-courses__send-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !sendModalBusy) {
              setSendModal({ open: false, course: null });
            }
          }}
        >
          <div
            className="card admin-dash-inline-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-course-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="send-course-modal-title" className="admin-dash-inline-dialog__title">
              {t("courses.admin.sendCourseTitle", { title: sendModal.course.title })}
            </h3>
            <label className="auth-field">
              <span>{t("courses.admin.searchFreelancerSend")}</span>
              <input
                value={sendQuery}
                onChange={(e) => setSendQuery(e.target.value)}
                placeholder={t("courses.admin.searchFreelancerSendPlaceholder")}
                disabled={sendModalBusy}
              />
            </label>
            <div className="admin-dash-inline-dialog__search-panel">
              {sendLoading ? (
                <div className="help">{t("courses.admin.searching")}</div>
              ) : sortedSendResults.length === 0 ? (
                <div className="help">{t("courses.admin.noResults")}</div>
              ) : (
                sortedSendResults.map((f) => {
                  const idStr = String(f.id);
                  const isAssigned = sendAssignedIds.has(idStr);
                  const rowLoading = sendRowLoadingId === idStr;
                  const unassignLoading = unassignRowLoadingId === idStr;
                  const rowActionsLocked =
                    !sendAssignedReady || sendRowLoadingId !== null || unassignRowLoadingId !== null;
                  return (
                    <div
                      key={f.id}
                      className={
                        isAssigned
                          ? "oh-admin-courses__send-row oh-admin-courses__send-row--assigned"
                          : "oh-admin-courses__send-row"
                      }
                    >
                      <div>
                        <strong>{`${f.firstName || ""} ${f.fatherName || ""} ${f.familyName || ""}`.trim() || "—"}</strong>
                        <div className="help">{f.email || "—"} {f.accountId ? `• ${f.accountId}` : ""}</div>
                      </div>
                      {isAssigned ? (
                        <div className="oh-admin-courses__send-row-actions">
                          <span className="oh-admin-courses__send-assigned-label">{t("courses.admin.alreadyAssigned")}</span>
                          <button
                            type="button"
                            className="btn btn-secondary oh-admin-courses__send-row-btn-unassign"
                            disabled={rowActionsLocked}
                            onClick={() => onUnassignCourseFromFreelancer(sendModal.course.id, f.id, freelancerDisplayName(f))}
                          >
                            {unassignLoading ? t("courses.admin.cancellingSend") : t("courses.admin.cancelSend")}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={rowLoading || rowActionsLocked}
                          onClick={() => onSendCourseToFreelancer(sendModal.course.id, f.id, freelancerDisplayName(f))}
                        >
                          {rowLoading ? t("courses.admin.sending") : t("courses.admin.sendToFreelancer")}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="admin-dash-inline-dialog__actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={sendModalBusy}
                onClick={() => setSendModal({ open: false, course: null })}
              >
                {t("courses.common.close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CourseTextAdsModal
        open={courseTextAdsModalOpen}
        onClose={() => setCourseTextAdsModalOpen(false)}
        courses={courses}
      />
    </>
  );
}
