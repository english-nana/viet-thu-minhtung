// ============================================================================
// VSTEP WRITING (TASK 01 & 02) — SHARED SUPABASE CLOUD CLIENT & UI UTILITIES
// ============================================================================

(function () {
  const CLASS_LIST = ["ONB204", "CB221"];
  const LESSONS_CATALOG = [
    { id: "advice-1", taskType: "task1", title: "Task 01 · Đề 1: Mua hàng online lần đầu (Jay)" },
    { id: "advice-2", taskType: "task1", title: "Task 01 · Đề 2: Thông tin hội thảo công ty (Carol)" },
    { id: "advice-3", taskType: "task1", title: "Task 01 · Đề 3: Kinh nghiệm du lịch Hà Nội (Jane)" },
    { id: "advice-4", taskType: "task1", title: "Task 01 · Đề 4: Kinh nghiệm chuyển nhà mới (Alex)" },
    { id: "advice-5", taskType: "task1", title: "Task 01 · Đề 5: Chọn hoạt động mùa hè (Harry)" },
    { id: "children-devices", taskType: "task2", title: "Task 02 · Chủ đề 1: Trẻ em & Thiết bị điện tử" },
    { id: "fast-fashion", taskType: "task2", title: "Task 02 · Chủ đề 2: Thời trang nhanh & Môi trường" },
    { id: "choosing-job", taskType: "task2", title: "Task 02 · Chủ đề 3: Lựa chọn công việc & Sự hài lòng" },
    { id: "self-employment", taskType: "task2", title: "Task 02 · Chủ đề 4: Tự kinh doanh / Tự làm chủ" },
    { id: "traffic-lights", taskType: "task2", title: "Task 02 · Chủ đề 5: Bỏ đèn giao thông tại ngã tư đông đúc" }
  ];

  let cachedClient = null;

  function getClient() {
    if (cachedClient) return cachedClient;
    const cfg = window.SUPABASE_CONFIG || {};
    const url = String(cfg.url || "").trim().replace(/\/+$/, "");
    const anonKey = String(cfg.anonKey || "").trim();
    if (!url || !anonKey || !window.supabase || typeof window.supabase.createClient !== "function") {
      return null;
    }
    cachedClient = window.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return cachedClient;
  }

  function getRedirectUrl() {
    return window.location.origin + window.location.pathname;
  }

  async function signInWithGoogle() {
    const client = getClient();
    if (!client) return { error: new Error("Chưa cấu hình Supabase.") };
    return client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getRedirectUrl(),
        queryParams: { prompt: "select_account" }
      }
    });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDateTime(isoOrText) {
    if (!isoOrText) return "";
    const d = new Date(isoOrText);
    if (isNaN(d.getTime())) return String(isoOrText);
    const pad = n => (n < 10 ? "0" + n : "" + n);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function parseFullNameAndClass(rawFullName) {
    const raw = String(rawFullName || "").trim();
    const match = raw.match(/^\[([A-Za-z0-9_-]+)\]\s*(.*)$/);
    if (match) {
      const candidateClass = match[1].toUpperCase();
      if (CLASS_LIST.includes(candidateClass)) {
        return {
          className: candidateClass,
          fullName: match[2].trim()
        };
      }
    }
    return {
      className: "",
      fullName: raw
    };
  }

  function formatStoredFullName(fullName, className) {
    const cleanName = String(fullName || "").trim();
    const upperClass = String(className || "").trim().toUpperCase();
    return upperClass && CLASS_LIST.includes(upperClass)
      ? `[${upperClass}] ${cleanName}`
      : cleanName;
  }

  function getInitials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return "HV";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function renderGoogleIconSvg(size) {
    const s = size || 18;
    return `
      <svg width="${s}" height="${s}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    `;
  }

  window.WritingCloud = {
    CLASS_LIST,
    LESSONS_CATALOG,
    getClient,
    getRedirectUrl,
    signInWithGoogle,
    escapeHtml,
    formatDateTime,
    parseFullNameAndClass,
    formatStoredFullName,
    getInitials,
    renderGoogleIconSvg
  };
})();
