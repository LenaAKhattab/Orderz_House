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
import CourseFileUploadField from "../../admin/courses/CourseFileUploadField";
import CourseUrlField from "../../admin/courses/CourseUrlField";
import "../../admin/courses/adminCourseComposer.css";
import "../../admin/courses/courseAssetFields.css";
import { formatCompletionDuration, formatLearningTimestamp } from "../../utils/courseLearningDuration";
import "./adminCoursesPage.css";

function fmtCourseDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ar");
  } catch {
    return "—";
  }
}

function courseListStatusPresentation(course) {
  if (course?.isActive) {
    return { label: "منشورة", tone: "active" };
  }
  return { label: "مسودة", tone: "inactive" };
}

function formatLessonChipCount(count) {
  return `${Number(count) || 0} درس`;
}

function formatAccessChipCount(count, isGlobal) {
  const n = Number(count) || 0;
  return isGlobal ? `${n} مستقل` : `${n} مسند`;
}

const COURSES_LOAD_ERROR_MSG = "تعذر تحميل الدورات.";
const FREELANCERS_LOAD_ERROR_MSG = "تعذر تحميل المستقلين.";
const COURSE_DETAILS_LOAD_ERROR_MSG = "تعذر تحميل تفاصيل الدورة.";

const EMPTY_CREATE_FORM = {
  title: "",
  description: "",
  coverImage: "",
  youtubeSourceUrl: "",
  isActive: false,
  isTestingEnabled: false,
  testFileUrl: "",
  testPromptFileUrl: "",
  testModelAnswerFileUrl: "",
  testQuestionCount: "",
};

function cloneCreateForm(form) {
  return JSON.parse(JSON.stringify(form ?? EMPTY_CREATE_FORM));
}

export default function AdminCoursesPage() {
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

  const coursesFetchGenRef = useRef(0);
  const freelancersFetchGenRef = useRef(0);
  const courseDetailsGenRef = useRef(0);

  const isSuperAdmin = (user?.primaryRole || user?.role) === "super_admin";
  const pageTitle = "إدارة الكورسات";

  const COURSE_FILE_UPLOAD_ERROR = "تعذر رفع الملف. تأكد أن الملف PDF وحاول مرة أخرى.";

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
    return patch;
  }, []);

  const fetchCoursesList = useCallback(async () => {
    const gen = ++coursesFetchGenRef.current;
    setLoading(true);
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
      toast.clearSessionErrorToast(COURSES_LOAD_ERROR_MSG);
    } catch (err) {
      if (gen !== coursesFetchGenRef.current) return;
      const msg = err?.response?.data?.message || COURSES_LOAD_ERROR_MSG;
      setCoursesLoadError(msg);
      toast.error(msg);
    } finally {
      if (gen === coursesFetchGenRef.current) setLoading(false);
    }
  }, [toast, courseSearch, statusFilter]);

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
        toast.clearSessionErrorToast(COURSE_DETAILS_LOAD_ERROR_MSG);
      } catch (err) {
        if (gen !== courseDetailsGenRef.current) return;
        const msg = err?.response?.data?.message || COURSE_DETAILS_LOAD_ERROR_MSG;
        toast.error(msg);
        setSelectedCourse(null);
      } finally {
        if (gen === courseDetailsGenRef.current) setCourseDetailsLoading(false);
      }
    },
    [toast, editingCourseId, syncServerFileUrls],
  );

  const loadFreelancers = useCallback(async () => {
    const gen = ++freelancersFetchGenRef.current;
    try {
      const res = await adminListCourseFreelancersRequest({ q: "", limit: 200 });
      if (gen !== freelancersFetchGenRef.current) return;
      setFreelancers(res?.data?.freelancers || []);
      setFreelancersLoadError(null);
      toast.clearSessionErrorToast(FREELANCERS_LOAD_ERROR_MSG);
    } catch (err) {
      if (gen !== freelancersFetchGenRef.current) return;
      const msg = err?.response?.data?.message || FREELANCERS_LOAD_ERROR_MSG;
      setFreelancersLoadError(msg);
      toast.error(msg);
    }
  }, [toast]);

  const retryCoursesLoad = useCallback(() => {
    toast.clearSessionErrorToast(COURSES_LOAD_ERROR_MSG);
    void fetchCoursesList();
  }, [toast, fetchCoursesList]);

  const retryFreelancersLoad = useCallback(() => {
    toast.clearSessionErrorToast(FREELANCERS_LOAD_ERROR_MSG);
    void loadFreelancers();
  }, [toast, loadFreelancers]);

  useEffect(() => {
    void loadFreelancers();
  }, [loadFreelancers]);

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
        throw new Error(COURSE_FILE_UPLOAD_ERROR);
      }
      syncCourseFileFieldsFromServer(courseId, course);
      toast.success("تم رفع ملف الاختبار بنجاح.");
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) await loadCourseDetails(courseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || COURSE_FILE_UPLOAD_ERROR);
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
        throw new Error(COURSE_FILE_UPLOAD_ERROR);
      }
      syncCourseFileFieldsFromServer(courseId, course);
      toast.success("تم رفع ملف المطالبة بنجاح.");
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) await loadCourseDetails(courseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || COURSE_FILE_UPLOAD_ERROR);
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
        throw new Error(COURSE_FILE_UPLOAD_ERROR);
      }
      syncCourseFileFieldsFromServer(courseId, course);
      toast.success("تم رفع ملف الإجابة النموذجية بنجاح.");
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) await loadCourseDetails(courseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || COURSE_FILE_UPLOAD_ERROR);
    } finally {
      setModelAnswerFileUploading(false);
    }
  };

  const onStartEditCourse = useCallback((course) => {
    const formState = {
      title: course.title || "",
      description: course.description || "",
      coverImage: course.coverImage || "",
      youtubeSourceUrl: course.youtubeSourceUrl || "",
      isActive: Boolean(course.isActive),
      isTestingEnabled: Boolean(course.isTestingEnabled),
      testFileUrl: course.testFileUrl || "",
      testPromptFileUrl: course.testPromptFileUrl || "",
      testModelAnswerFileUrl: course.testModelAnswerFileUrl || "",
      testQuestionCount:
        course.testQuestionCount != null && !Number.isNaN(Number(course.testQuestionCount))
          ? String(course.testQuestionCount)
          : "",
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
    setCreating(true);
    try {
      if (editingCourseId) {
        const patch = buildCourseMetadataPatch({
          title: createForm.title,
          description: createForm.description,
          coverImage: createForm.coverImage,
          isActive: createForm.isActive,
          isTestingEnabled: createForm.isTestingEnabled,
          testFileUrl: createForm.testFileUrl,
          testPromptFileUrl: createForm.testPromptFileUrl,
          testModelAnswerFileUrl: createForm.testModelAnswerFileUrl,
          testQuestionCount: createForm.testQuestionCount,
        });
        const res = await adminUpdateCourseRequest(editingCourseId, patch);
        if (res?.data?.course) syncCourseFileFieldsFromServer(editingCourseId, res.data.course);
        toast.success("تم تحديث بيانات الكورس.");
        composerSnapshotRef.current = cloneCreateForm(createForm);
      } else {
        const res = await adminCreateCourseRequest(createForm);
        const newCourseId = res?.data?.course?.id;
        if (newCourseId && createPendingTestFile) {
          await onUploadCourseTestFile(newCourseId, createPendingTestFile);
        }
        if (newCourseId && createPendingPromptFile) {
          await onUploadCoursePromptFile(newCourseId, createPendingPromptFile);
        }
        if (newCourseId && createPendingModelAnswerFile) {
          await onUploadCourseModelAnswerFile(newCourseId, createPendingModelAnswerFile);
        }
        toast.success("تم إنشاء الدورة وإضافة الدروس بنجاح.");
        setComposerOpen(false);
        resetComposer();
      }
      await fetchCoursesList();
    } catch (err) {
      toast.error(err?.response?.data?.message || (editingCourseId ? "تعذر تحديث الكورس." : "فشل إنشاء الكورس."));
    } finally {
      setCreating(false);
    }
  };

  const onPublishCourse = async (courseId) => {
    setLoading(true);
    try {
      await adminPublishCourseRequest(courseId);
      toast.success("تم نشر الكورس بنجاح.");
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) await loadCourseDetails(courseId);
    } catch (err) {
      const labels = err?.response?.data?.missingLabels;
      const base = err?.response?.data?.message || "لا يمكن نشر الكورس قبل اكتمال البيانات.";
      toast.error(labels?.length ? `${base} (${labels.join("، ")})` : base);
    } finally {
      setLoading(false);
    }
  };

  const onArchiveCourse = async (courseId) => {
    setLoading(true);
    try {
      await adminArchiveCourseRequest(courseId);
      toast.success("تم أرشفة الكورس (إيقاف النشر).");
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) await loadCourseDetails(courseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر أرشفة الكورس.");
    } finally {
      setLoading(false);
    }
  };

  const onUpdateCourse = async (e) => {
    e.preventDefault();
    if (!selectedCourseId || !selectedCourse?.course) return;
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
      });
      const res = await adminUpdateCourseRequest(selectedCourseId, patch);
      if (res?.data?.course) syncCourseFileFieldsFromServer(selectedCourseId, res.data.course);
      toast.success("تم تحديث بيانات الدورة.");
      await fetchCoursesList();
      await loadCourseDetails(selectedCourseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر تحديث الدورة.");
    } finally {
      setLoading(false);
    }
  };

  const onImportLessons = async () => {
    if (!selectedCourseId || !importUrl.trim()) return;
    setLoading(true);
    try {
      await adminImportCourseLessonsRequest(selectedCourseId, { youtubeSourceUrl: importUrl.trim(), replaceExisting: false });
      toast.success("تم استيراد الدروس.");
      setImportUrl("");
      await loadCourseDetails(selectedCourseId);
      await fetchCoursesList();
    } catch (err) {
      toast.error(err?.response?.data?.message || "فشل استيراد الدروس.");
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
      toast.success("تم تحديث الدروس.");
      await loadCourseDetails(selectedCourseId);
    } catch (err) {
      toast.error(err?.response?.data?.message || "فشل تحديث الدروس.");
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
      toast.success(assignAll ? "تم إسناد الدورة لجميع المستقلين." : "تم تحديث إسناد الدورة.");
      await loadCourseDetails(selectedCourseId);
      await fetchCoursesList();
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر حفظ الإسناد.");
    } finally {
      setLoading(false);
    }
  };

  const onDeleteCourse = async (courseId) => {
    if (!courseId) return;
    const ok = window.confirm("هل أنت متأكد من حذف الدورة؟ سيتم حذف الدروس والإسنادات المرتبطة بها.");
    if (!ok) return;
    setLoading(true);
    try {
      await adminDeleteCourseRequest(courseId);
      toast.success("تم حذف الدورة بنجاح.");
      if (String(selectedCourseId) === String(courseId)) {
        setSelectedCourseId("");
        setSelectedCourse(null);
        setSelectedFreelancerIds([]);
        setManageModalOpen(false);
      }
      await fetchCoursesList();
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر حذف الدورة.");
    } finally {
      setLoading(false);
    }
  };

  const onToggleGlobalVisibility = async (course, nextValue) => {
    if (!course?.id) return;
    setVisibilityTogglingId(String(course.id));
    try {
      await adminUpdateCourseRequest(course.id, { isVisibleToAllFreelancers: Boolean(nextValue) });
      toast.success(
        nextValue ? "أصبح الكورس متاحاً لجميع المستقلين الحاليين والمستقبليين." : "تم إيقاف الإظهار لجميع المستقلين.",
      );
      await fetchCoursesList();
      if (String(selectedCourseId) === String(course.id)) {
        await loadCourseDetails(course.id);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر تحديث إعداد الوصول.");
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
    `${f.firstName || ""} ${f.fatherName || ""} ${f.familyName || ""}`.trim() || f.email || f.accountId || "المستقل";

  const onSendCourseToFreelancer = async (courseId, freelancerId, displayName) => {
    const fid = Number(freelancerId);
    if (!courseId || !Number.isInteger(fid) || fid < 1) {
      toast.error("معرف المستقل غير صالح.");
      return;
    }
    setSendRowLoadingId(String(fid));
    try {
      await adminAddCourseFreelancerRequest(courseId, fid);
      setSendAssignedIds((prev) => new Set([...prev, String(fid)]));
      toast.success(`تم إرسال الدورة إلى ${displayName || "المستقل"}.`);
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
      const msg = err?.response?.data?.message || "تعذر إرسال الدورة.";
      toast.error(msg);
    } finally {
      setSendRowLoadingId(null);
    }
  };

  const onUnassignCourseFromFreelancer = async (courseId, freelancerId, displayName) => {
    const fid = Number(freelancerId);
    if (!courseId || !Number.isInteger(fid) || fid < 1) {
      toast.error("معرف المستقل غير صالح.");
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
      toast.success(`تم إلغاء إرسال الدورة عن ${displayName || "المستقل"}.`);
      await fetchCoursesList();
      if (String(selectedCourseId) === String(courseId)) {
        await loadCourseDetails(courseId);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر إلغاء الإرسال.");
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
          eyebrow="لوحة التحكم"
          title={pageTitle}
          description={
            isSuperAdmin
              ? "إنشاء الكورسات واستيراد الدروس من يوتيوب، النشر الآمن، وإدارة المستقلين."
              : "إنشاء الكورسات واستيراد الدروس من يوتيوب، النشر الآمن، وإدارة المستقلين المسجلين."
          }
          breadcrumbs={[
            { label: "الرئيسية", href: breadcrumbHomeFromUser(user) },
            { label: "الكورسات" },
          ]}
          actions={
            <button type="button" className="btn btn-primary" onClick={openCreateComposerModal}>
              إنشاء دورة جديدة
            </button>
          }
        />

        <DashboardSection title="قائمة الكورسات" description="بحث، تصفية، نشر، وإدارة الدروس والإسناد.">
          <div className="oh-admin-courses__toolbar">
            <input
              className="oh-admin-courses__input"
              type="search"
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              placeholder="ابحث بالعنوان أو الوصف…"
              aria-label="بحث في الكورسات"
            />
            <select
              className="oh-admin-courses__input oh-admin-courses__filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="تصفية الحالة"
            >
              <option value="all">كل الحالات</option>
              <option value="published">منشورة</option>
              <option value="draft">مسودة / معطّلة</option>
            </select>
            <button type="button" className="btn btn-secondary" onClick={() => void fetchCoursesList()} disabled={loading}>
              تحديث
            </button>
          </div>

          {coursesLoadError ? (
            <WidgetLoadError message={coursesLoadError} onRetry={retryCoursesLoad} />
          ) : null}

          {loading && !courses.length ? (
            <DashboardLoadingState label="جاري تحميل الكورسات…" />
          ) : null}

          {!loading && !courses.length ? (
            <DashboardEmptyState
              title="لا توجد كورسات بعد"
              description="ابدأ بإضافة أول كورس من زر «إنشاء دورة جديدة»."
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
            <DashboardTable caption="قائمة الكورسات" className="oh-admin-courses__table-wrap">
              <thead>
                <tr>
                  <th className="oh-admin-courses__col-course">الدورة</th>
                  <th className="oh-admin-courses__col-status">الحالة</th>
                  <th className="oh-admin-courses__col-access">الوصول</th>
                  <th className="oh-admin-courses__col-date">آخر تحديث</th>
                  <th className="oh-admin-courses__col-visibility">الظهور للجميع</th>
                  <th className="oh-admin-courses__col-actions">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => {
                  const isGlobal = Boolean(c.isVisibleToAllFreelancers);
                  const visibilityBusy = visibilityTogglingId === String(c.id);
                  const status = courseListStatusPresentation(c);
                  return (
                  <tr key={c.id} className="oh-admin-courses__table-row">
                    <td className="oh-admin-courses__col-course">
                      <div className="oh-admin-courses__course-anchor">
                        <p className="oh-admin-courses__course-title">{c.title}</p>
                        <div className="oh-admin-courses__course-meta" aria-label="ملخص الدورة">
                          <span className="oh-admin-courses__meta-chip">{formatLessonChipCount(c.lessonsCount)}</span>
                          <span
                            className="oh-admin-courses__meta-chip oh-admin-courses__meta-chip--muted"
                            title={
                              isGlobal
                                ? "عدد المستقلين النشطين الذين يمكنهم الوصول لهذه الدورة"
                                : "عدد المستقلين المسندين يدوياً"
                            }
                          >
                            {formatAccessChipCount(c.assignedCount, isGlobal)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="oh-admin-courses__col-status">
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </td>
                    <td className="oh-admin-courses__col-access">
                      <StatusBadge tone={isGlobal ? "active" : "neutral"}>
                        {isGlobal ? "جميع المستقلين" : "مخصص"}
                      </StatusBadge>
                    </td>
                    <td className="oh-admin-courses__col-date">
                      <time dateTime={c.updatedAt || undefined}>{fmtCourseDate(c.updatedAt)}</time>
                    </td>
                    <td className="oh-admin-courses__col-visibility">
                      <label
                        className="oh-admin-courses__row-toggle"
                        title={
                          isGlobal
                            ? "الدورة متاحة تلقائياً لكل المستقلين. ألغِ التفعيل للإسناد اليدوي."
                            : "اجعل الدورة تظهر لجميع المستقلين الحاليين والجدد."
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isGlobal}
                          disabled={loading || visibilityBusy}
                          onChange={(e) => void onToggleGlobalVisibility(c, e.target.checked)}
                          aria-label="إظهار الدورة لجميع المستقلين"
                        />
                        <span className="oh-admin-courses__row-toggle-label">
                          {isGlobal ? "مفعّل للجميع" : "إظهار للجميع"}
                        </span>
                      </label>
                    </td>
                    <td className="oh-admin-courses__col-actions">
                      <div className="oh-admin-courses__table-actions">
                        <button
                          type="button"
                          className="btn btn-primary oh-admin-courses__row-btn oh-admin-courses__row-btn--primary"
                          onClick={() => openManageModal(c, "lessons")}
                          disabled={loading}
                        >
                          إدارة الدروس
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary oh-admin-courses__row-btn"
                          onClick={() => onStartEditCourse(c)}
                          disabled={loading}
                        >
                          تعديل
                        </button>
                        {!c.isActive ? (
                          <button
                            type="button"
                            className="btn btn-secondary oh-admin-courses__row-btn"
                            onClick={() => void onPublishCourse(c.id)}
                            disabled={loading}
                          >
                            نشر
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary oh-admin-courses__row-btn"
                            onClick={() => void onArchiveCourse(c.id)}
                            disabled={loading}
                          >
                            أرشفة
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary oh-admin-courses__row-btn oh-admin-courses__row-btn--quiet"
                          onClick={() => onOpenSendModal(c)}
                          disabled={loading || isGlobal}
                          title={
                            isGlobal
                              ? "الدورة متاحة لجميع المستقلين — لا حاجة للإسناد اليدوي."
                              : "إسناد الدورة لمستقل محدد"
                          }
                        >
                          إسناد إلى مستقل
                        </button>
                        <button
                          type="button"
                          className="btn oh-admin-courses__row-btn oh-admin-courses__row-btn--danger"
                          onClick={() => onDeleteCourse(c.id)}
                          disabled={loading}
                        >
                          حذف
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
        title="تغييرات غير محفوظة"
        body="لديك تغييرات لم يتم حفظها. هل تريد إغلاق النافذة بدون حفظ؟"
        cancelLabel="متابعة التعديل"
        confirmLabel="إغلاق بدون حفظ"
        confirmVariant="danger"
        layerClassName="z-[1300]"
        onCancel={cancelDiscardComposerModal}
        onConfirm={confirmDiscardComposerModal}
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
                {editingCourseId ? "تعديل الكورس" : "إنشاء دورة جديدة"}
              </h2>
              <button
                type="button"
                className="oh-admin-courses__modal-close"
                onClick={requestCloseComposerModal}
                disabled={creating}
                aria-label="إغلاق"
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
                إدارة الدورة: {courseDetailsLoading ? "…" : manageCourseTitle}
              </h2>
              <button
                type="button"
                className="oh-admin-courses__modal-close"
                onClick={closeManageModal}
                disabled={loading}
                aria-label="إغلاق"
              >
                ×
              </button>
            </header>

            <div className="oh-admin-courses__modal-tabs" role="tablist" aria-label="أقسام إدارة الدورة">
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "details"}
                className={`oh-admin-courses__modal-tab ${manageTab === "details" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("details")}
              >
                بيانات الدورة
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "lessons"}
                className={`oh-admin-courses__modal-tab ${manageTab === "lessons" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("lessons")}
              >
                الدروس
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "assign"}
                className={`oh-admin-courses__modal-tab ${manageTab === "assign" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("assign")}
              >
                الإسناد
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={manageTab === "progress"}
                className={`oh-admin-courses__modal-tab ${manageTab === "progress" ? "oh-admin-courses__modal-tab--active" : ""}`}
                onClick={() => setManageTab("progress")}
              >
                التقدم
              </button>
            </div>

            <div className="oh-admin-courses__modal-body">
              {courseDetailsLoading ? (
                <p className="oh-admin-courses__modal-loading">جاري تحميل بيانات الدورة…</p>
              ) : selectedCourse?.course ? (
                <>
                  {manageTab === "details" ? (
                    <div className="oh-admin-courses__modal-panel" role="tabpanel">
                      {selectedCourse.publishReadiness && !selectedCourse.publishReadiness.ok ? (
                        <p className="oh-admin-courses__readiness-warn" role="status">
                          لا يمكن نشر الكورس قبل اكتمال: {(selectedCourse.publishReadiness.missingLabels || []).join("، ")}
                        </p>
                      ) : null}
                      <form className="oh-admin-courses__form" onSubmit={onUpdateCourse}>
                        <label className="oh-admin-courses__field">
                          <span>العنوان</span>
                          <input
                            className="oh-admin-courses__input"
                            value={selectedCourse.course.title || ""}
                            onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, title: e.target.value } }))}
                          />
                        </label>
                        <label className="oh-admin-courses__field">
                          <span>الوصف</span>
                          <textarea
                            className="oh-admin-courses__textarea"
                            rows={4}
                            value={selectedCourse.course.description || ""}
                            onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, description: e.target.value } }))}
                          />
                        </label>
                        <CourseUrlField
                          label="رابط صورة الغلاف"
                          optional
                          value={selectedCourse.course.coverImage || ""}
                          onChange={(e) =>
                            setSelectedCourse((s) => ({ ...s, course: { ...s.course, coverImage: e.target.value } }))
                          }
                          updatedAt={selectedCourse.course.updatedAt}
                          linkTitle="رابط الغلاف الحالي"
                        />
                        {selectedCourse.course.youtubeSourceUrl ? (
                          <CourseUrlField
                            label="رابط يوتيوب المحفوظ"
                            value={selectedCourse.course.youtubeSourceUrl}
                            readOnly
                            updatedAt={selectedCourse.course.updatedAt}
                            linkTitle="مصدر الدورة (يوتيوب)"
                          />
                        ) : null}
                        <label className="oh-admin-courses__toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedCourse.course.isActive)}
                            onChange={(e) => setSelectedCourse((s) => ({ ...s, course: { ...s.course, isActive: e.target.checked } }))}
                          />
                          <span>حالة الدورة (نشطة)</span>
                        </label>
                        <div className="oh-admin-courses__modal-divider" />
                        <h3 className="oh-admin-courses__modal-subheading">اختبار / تدقيق ما بعد الدورة</h3>
                        <p className="oh-admin-courses__modal-hint">
                          عند التفعيل، يُطلب من المستقل إرسال استجابة ChatGPT بعد إكمال الدروس.
                        </p>
                        <label className="oh-admin-courses__toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(selectedCourse.course.isTestingEnabled)}
                            onChange={(e) =>
                              setSelectedCourse((s) => ({ ...s, course: { ...s.course, isTestingEnabled: e.target.checked } }))
                            }
                          />
                          <span>تفعيل اختبار/تدقيق ما بعد الدورة</span>
                        </label>
                        {selectedCourse.course.isTestingEnabled ? (
                          <>
                            <CourseFileUploadField
                              label="ملف الاختبار / التكليف"
                              fileUrl={selectedCourse.course.testFileUrl}
                              updatedAt={selectedCourse.course.updatedAt}
                              disabled={loading}
                              uploading={testFileUploading}
                              isEdit
                              courseId={selectedCourseId}
                              fileKind="test"
                              onFileSelected={(f) => {
                                if (selectedCourseId) void onUploadCourseTestFile(selectedCourseId, f);
                              }}
                              onValidationError={(msg) => toast.error(msg)}
                            />
                            <CourseUrlField
                              label="أو رابط ملف الاختبار"
                              optional
                              value={selectedCourse.course.testFileUrl || ""}
                              onChange={(e) =>
                                setSelectedCourse((s) => ({ ...s, course: { ...s.course, testFileUrl: e.target.value } }))
                              }
                              updatedAt={selectedCourse.course.updatedAt}
                              linkTitle="رابط ملف الاختبار الحالي"
                            />
                            <CourseFileUploadField
                              label="ملف مطالبة ChatGPT للمستقل"
                              fileUrl={selectedCourse.course.testPromptFileUrl}
                              updatedAt={selectedCourse.course.updatedAt}
                              disabled={loading}
                              uploading={promptFileUploading}
                              isEdit
                              courseId={selectedCourseId}
                              fileKind="prompt"
                              onFileSelected={(f) => {
                                if (selectedCourseId) void onUploadCoursePromptFile(selectedCourseId, f);
                              }}
                              onValidationError={(msg) => toast.error(msg)}
                            />
                            <div className="oh-admin-courses__exam-block">
                              <h4 className="oh-admin-courses__exam-block-title">ملف الإجابة النموذجية</h4>
                              <CourseFileUploadField
                                label="رفع ملف من الجهاز"
                                fileUrl={selectedCourse.course.testModelAnswerFileUrl}
                                updatedAt={selectedCourse.course.updatedAt}
                                disabled={loading}
                                uploading={modelAnswerFileUploading}
                                isEdit
                                courseId={selectedCourseId}
                                fileKind="model-answer"
                                onFileSelected={(f) => {
                                  if (selectedCourseId) void onUploadCourseModelAnswerFile(selectedCourseId, f);
                                }}
                                onValidationError={(msg) => toast.error(msg)}
                              />
                              <CourseUrlField
                                label="أو رابط ملف الإجابة النموذجية"
                                optional
                                value={selectedCourse.course.testModelAnswerFileUrl || ""}
                                onChange={(e) =>
                                  setSelectedCourse((s) => ({
                                    ...s,
                                    course: { ...s.course, testModelAnswerFileUrl: e.target.value },
                                  }))
                                }
                                updatedAt={selectedCourse.course.updatedAt}
                                linkTitle="رابط ملف الإجابة النموذجية"
                              />
                            </div>
                            <label className="oh-admin-courses__field">
                              <span>عدد أسئلة الاختبار</span>
                              <input
                                className="oh-admin-courses__input"
                                type="number"
                                min={1}
                                step={1}
                                value={
                                  selectedCourse.course.testQuestionCount != null
                                    ? String(selectedCourse.course.testQuestionCount)
                                    : ""
                                }
                                onChange={(e) =>
                                  setSelectedCourse((s) => ({
                                    ...s,
                                    course: {
                                      ...s.course,
                                      testQuestionCount: e.target.value === "" ? null : Number(e.target.value),
                                    },
                                  }))
                                }
                                placeholder="مثال: 5"
                              />
                              <span className="oh-admin-courses__field-hint">
                                يحدد عدد حقول إدخال الدرجات (سؤال 1، سؤال 2، …) عند التسليم.
                              </span>
                            </label>
                          </>
                        ) : null}
                        <div className="oh-admin-courses__submit-row">
                          <button className="btn btn-primary oh-admin-courses__btn-primary" type="submit" disabled={loading}>
                            حفظ بيانات الدورة
                          </button>
                        </div>
                      </form>

                      <div className="oh-admin-courses__modal-divider" />
                      <h3 className="oh-admin-courses__modal-subheading">استيراد دروس جديدة</h3>
                      <div className="oh-admin-courses__form">
                        <label className="oh-admin-courses__field">
                          <span>رابط يوتيوب جديد</span>
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
                            استيراد دروس
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {manageTab === "lessons" ? (
                    <div className="oh-admin-courses__modal-panel oh-admin-courses__modal-panel--lessons" role="tabpanel">
                      <p className="oh-admin-courses__modal-hint">عدّل عناوين الدروس والترتيب والتفعيل، ثم احفظ التغييرات.</p>
                      <div className="oh-admin-courses__lesson-scroll">
                        <div className="oh-admin-courses__lesson-grid">
                          {(selectedCourse.lessons || []).map((lesson, idx) => (
                            <div key={lesson.id} className="oh-admin-courses__lesson-card">
                              <label className="oh-admin-courses__field">
                                <span>عنوان الدرس</span>
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
                                  وصف الدرس <span className="oh-admin-courses__optional">(اختياري)</span>
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
                                  <span>الترتيب</span>
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
                                  <span>نشط</span>
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {!selectedCourse.lessons?.length ? <p className="help">لا توجد دروس بعد. استخدم تبويب «بيانات الدورة» لاستيراد الدروس.</p> : null}
                      <div className="oh-admin-courses__modal-footer-actions">
                        <button className="btn btn-primary" type="button" onClick={onSaveLessons} disabled={loading || !selectedCourse?.lessons?.length}>
                          حفظ الدروس
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {manageTab === "assign" ? (
                    <div className="oh-admin-courses__modal-panel oh-admin-courses__modal-panel--assign" role="tabpanel">
                      {selectedCourse.course.isVisibleToAllFreelancers ? (
                        <p className="oh-admin-courses__global-info" role="status">
                          هذا الكورس متاح لجميع المستقلين، لذلك لا تحتاج إلى إرساله يدويًا.
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
                          placeholder="ابحث باسم المستقل أو رقم الحساب..."
                          aria-label="ابحث باسم المستقل أو رقم الحساب أو البريد"
                          autoComplete="off"
                        />
                        <div className="oh-admin-courses__tab-meta" aria-live="polite">
                          <span>عدد النتائج: {filteredFreelancers.length}</span>
                          <span className="oh-admin-courses__tab-meta-sep" aria-hidden>
                            ·
                          </span>
                          <span>المحدد: {selectedFreelancerIds.length}</span>
                        </div>
                      </div>
                      <div className="oh-admin-courses__field-label-muted">قائمة المستقلين</div>
                      <div className="oh-admin-courses__checkbox-list oh-admin-courses__checkbox-list--scroll">
                        {freelancers.length > 0 && freelancerQuery.trim() && filteredFreelancers.length === 0 ? (
                          <p className="help oh-admin-courses__tab-empty-msg">لا توجد نتائج مطابقة</p>
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
                          تحديد الكل
                        </button>
                        <button className="btn btn-secondary oh-admin-courses__btn-outline" type="button" onClick={() => setSelectedFreelancerIds([])}>
                          إزالة الكل
                        </button>
                        <button className="btn btn-primary" type="button" onClick={() => onAssign(false)} disabled={loading}>
                          حفظ الإسناد المحدد
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
                          placeholder="ابحث باسم المستقل أو رقم الحساب..."
                          aria-label="ابحث في تقدم المستقلين"
                          autoComplete="off"
                        />
                        <div className="oh-admin-courses__tab-meta" aria-live="polite">
                          <span>عدد النتائج: {filteredAssignments.length}</span>
                          {(selectedCourse.assignments || []).length > 0 ? (
                            <>
                              <span className="oh-admin-courses__tab-meta-sep" aria-hidden>
                                ·
                              </span>
                              <span>إجمالي المسند: {(selectedCourse.assignments || []).length}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <p className="oh-admin-courses__modal-hint">تقدم المستقلين المسند إليهم هذه الدورة.</p>
                      {!selectedCourse.assignments?.length ? (
                        <p className="help oh-admin-courses__tab-empty-msg">لا يوجد مسند إليهم بعد.</p>
                      ) : progressQuery.trim() && filteredAssignments.length === 0 ? (
                        <p className="help oh-admin-courses__tab-empty-msg">لا توجد نتائج مطابقة</p>
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
                                <div className="oh-admin-courses__progress-meta">الحساب: {a.accountId || "—"}</div>
                                <div className="oh-admin-courses__progress-bar-wrap" aria-hidden>
                                  <div
                                    className="oh-admin-courses__progress-bar"
                                    style={{ width: `${Math.min(100, Math.max(0, Number(a.progress?.percentage) || 0))}%` }}
                                  />
                                </div>
                                <div className="oh-admin-courses__progress-stats">
                                  التقدم: {a.progress?.completedLessons ?? 0}/{a.progress?.totalLessons ?? 0} ({a.progress?.percentage ?? 0}%)
                                </div>
                                <dl className="oh-admin-courses__learning-duration">
                                  <div className="oh-admin-courses__learning-duration-row">
                                    <dt>بدء التعلّم</dt>
                                    <dd>{formatLearningTimestamp(a.learning?.startedLearningAt)}</dd>
                                  </div>
                                  <div className="oh-admin-courses__learning-duration-row">
                                    <dt>انتهاء التعلّم</dt>
                                    <dd>{formatLearningTimestamp(a.learning?.finishedLearningAt)}</dd>
                                  </div>
                                  <div className="oh-admin-courses__learning-duration-row">
                                    <dt>مدة الإكمال</dt>
                                    <dd>{formatCompletionDuration(a.learning?.completionDurationSeconds)}</dd>
                                  </div>
                                </dl>
                                {a.examFinalGrade != null ? (
                                  <div className="oh-admin-courses__exam-grade-block">
                                    <div className="oh-admin-courses__exam-grade-head">
                                      <strong>الدرجة النهائية: {a.examFinalGrade}%</strong>
                                      {a.examSubmittedAt ? (
                                        <span className="oh-admin-courses__exam-grade-date">
                                          تاريخ التسليم:{" "}
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
                                            س{idx + 1}: {mark}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                ) : selectedCourse.course.isTestingEnabled &&
                                  (a.progress?.completedLessons ?? 0) >= (a.progress?.totalLessons ?? 0) &&
                                  (a.progress?.totalLessons ?? 0) > 0 ? (
                                  <p className="oh-admin-courses__exam-grade-pending">بانتظار تسليم الاختبار النهائي</p>
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
                <p className="help">تعذر تحميل الدورة.</p>
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
              إرسال الدورة: {sendModal.course.title}
            </h3>
            <label className="auth-field">
              <span>ابحث عن المستقل (الاسم أو الإيميل)</span>
              <input
                value={sendQuery}
                onChange={(e) => setSendQuery(e.target.value)}
                placeholder="اكتب الاسم أو الإيميل..."
                disabled={sendModalBusy}
              />
            </label>
            <div className="admin-dash-inline-dialog__search-panel">
              {sendLoading ? (
                <div className="help">جارٍ البحث...</div>
              ) : sortedSendResults.length === 0 ? (
                <div className="help">لا يوجد نتائج.</div>
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
                          <span className="oh-admin-courses__send-assigned-label">مسندة مسبقاً</span>
                          <button
                            type="button"
                            className="btn btn-secondary oh-admin-courses__send-row-btn-unassign"
                            disabled={rowActionsLocked}
                            onClick={() => onUnassignCourseFromFreelancer(sendModal.course.id, f.id, freelancerDisplayName(f))}
                          >
                            {unassignLoading ? "جارٍ الإلغاء..." : "إلغاء الإرسال"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={rowLoading || rowActionsLocked}
                          onClick={() => onSendCourseToFreelancer(sendModal.course.id, f.id, freelancerDisplayName(f))}
                        >
                          {rowLoading ? "جارٍ الإرسال..." : "إرسال لهذا المستقل"}
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
                إغلاق
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
