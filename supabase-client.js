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
    { id: "traffic-lights", taskType: "task2", title: "Task 02 · Chủ đề 5: Bỏ đèn giao thông tại ngã tư đông đúc" },
    { id: "tourism-growth", taskType: "task2", title: "Task 02 · Chủ đề 6: Sự gia tăng lượng khách du lịch" },
    { id: "leaving-cities", taskType: "task2", title: "Task 02 · Chủ đề 7: Người trẻ bỏ phố về quê" }
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

  function formatRemainingTime(isoReleaseAt) {
    if (!isoReleaseAt) return "";
    const targetMs = new Date(isoReleaseAt).getTime();
    if (isNaN(targetMs)) return "";
    const diffMs = targetMs - Date.now();
    if (diffMs <= 0) return "";
    const totalMins = Math.ceil(diffMs / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0 && mins > 0) return `${hours} giờ ${mins} phút`;
    if (hours > 0) return `${hours} giờ`;
    return `${Math.max(1, mins)} phút`;
  }

  async function invokeGradeWriting(submissionId, options) {
    const client = getClient();
    const cfg = window.SUPABASE_CONFIG || {};
    const baseUrl = String(cfg.url || "").trim().replace(/\/+$/, "");
    const anonKey = String(cfg.anonKey || "").trim();
    if (!client || !baseUrl || !anonKey || !submissionId) {
      return { ok: false, error: "Chưa kết nối Supabase." };
    }
    const opts = options || {};
    try {
      const { data: sessionData } = await client.auth.getSession();
      const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : "";
      if (!accessToken) {
        return { ok: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
      }

      const res = await fetch(`${baseUrl}/functions/v1/grade-writing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          submission_id: submissionId,
          force_teacher: Boolean(opts.forceTeacher),
          release_now: Boolean(opts.releaseNow)
        })
      });

      const rawText = await res.text().catch(() => "");
      let parsed = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch (e) {}

      if (!res.ok || !parsed || parsed.ok !== true) {
        const detail =
          (parsed && (parsed.error || parsed.message || parsed.msg)) ||
          (rawText ? rawText.slice(0, 220) : `HTTP ${res.status}`);
        return {
          ok: false,
          error: `[HTTP ${res.status}] ${detail}`
        };
      }
      return parsed;
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : "Lỗi kết nối hệ thống chấm bài." };
    }
  }

  async function invokeProcessQueue(batchSize) {
    const client = getClient();
    const cfg = window.SUPABASE_CONFIG || {};
    const baseUrl = String(cfg.url || "").trim().replace(/\/+$/, "");
    const anonKey = String(cfg.anonKey || "").trim();
    if (!client || !baseUrl || !anonKey) {
      return { ok: false, error: "Chưa kết nối Supabase." };
    }
    try {
      const { data: sessionData } = await client.auth.getSession();
      const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : "";
      if (!accessToken) {
        return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
      }
      const res = await fetch(`${baseUrl}/functions/v1/grade-writing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          mode: "process_queue",
          batch_size: batchSize || 5
        })
      });
      const rawText = await res.text().catch(() => "");
      let parsed = null;
      try {
        parsed = rawText ? JSON.parse(rawText) : null;
      } catch (e) {}
      if (!res.ok || !parsed || parsed.ok !== true) {
        const detail = (parsed && (parsed.error || parsed.message)) || rawText.slice(0, 200) || `HTTP ${res.status}`;
        return { ok: false, error: `[HTTP ${res.status}] ${detail}` };
      }
      return parsed;
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : "Lỗi chạy hàng đợi chấm bài." };
    }
  }

  function getCategoryBadgeClass(cat) {
    const lower = String(cat || "").toLowerCase();
    if (lower.includes("chính tả") || lower.includes("spell")) return "cat-spelling";
    if (lower.includes("dấu câu") || lower.includes("punct")) return "cat-punct";
    if (lower.includes("từ vựng") || lower.includes("văn phong") || lower.includes("vocab")) return "cat-vocab";
    return "cat-grammar";
  }

  function buildInlineHighlightedEssay(originalText, corrections) {
    const text = String(originalText || "");
    const list = Array.isArray(corrections) ? corrections : [];
    if (!text) return "";
    if (list.length === 0) return escapeHtml(text);

    const lowerText = text.toLowerCase();
    const occupied = [];
    const matches = [];

    const overlaps = (start, end) =>
      occupied.some(r => start < r.end && end > r.start);

    list.forEach((c, idx) => {
      const needle = String(c.original || "").trim();
      if (!needle) return;
      const num = c.id || idx + 1;
      let startIdx = -1;
      let searchFrom = 0;

      while (searchFrom < text.length) {
        let pos = text.indexOf(needle, searchFrom);
        if (pos === -1) {
          pos = lowerText.indexOf(needle.toLowerCase(), searchFrom);
        }
        if (pos === -1) break;
        const endPos = pos + needle.length;
        if (!overlaps(pos, endPos)) {
          startIdx = pos;
          occupied.push({ start: pos, end: endPos });
          matches.push({
            start: pos,
            end: endPos,
            num,
            original: text.slice(pos, endPos),
            corrected: String(c.corrected || ""),
            explanation: String(c.explanation_vi || "")
          });
          break;
        }
        searchFrom = pos + 1;
      }
    });

    if (matches.length === 0) return escapeHtml(text);
    matches.sort((a, b) => a.start - b.start);

    let out = "";
    let cursor = 0;
    matches.forEach(m => {
      if (m.start > cursor) {
        out += escapeHtml(text.slice(cursor, m.start));
      }
      out += `<span class="ai-inline-fix" title="${escapeHtml(`#${m.num}: ${m.explanation}`)}"><del class="ai-del">${escapeHtml(m.original)}</del><ins class="ai-ins">${escapeHtml(m.corrected)}</ins><sup class="ai-sup">[${m.num}]</sup></span>`;
      cursor = m.end;
    });
    if (cursor < text.length) {
      out += escapeHtml(text.slice(cursor));
    }
    return out;
  }

  function renderWritingReviewHtml(originalContent, reviewJson, meta) {
    if (!reviewJson || typeof reviewJson !== "object") return "";
    const info = meta || {};
    const targetLevel = info.targetLevel || "B1";
    const corrections = Array.isArray(reviewJson.corrections) ? reviewJson.corrections : [];
    const ideaAdditions = Array.isArray(reviewJson.idea_additions) ? reviewJson.idea_additions : [];
    const criteria = reviewJson.criteria || {};
    const revisedVersion = String(reviewJson.revised_version || "").trim();

    const criteriaItems = [
      { key: "task_fulfillment", label: "Hoàn thành yêu cầu đề" },
      { key: "organization", label: "Bố cục & Liên kết" },
      { key: "vocabulary", label: "Từ vựng & Văn phong" },
      { key: "grammar", label: "Ngữ pháp & Chính xác" }
    ].filter(item => criteria[item.key]);

    return `
      <div class="ai-review-panel">
        <div class="ai-review-summary">
          <div class="ai-review-badges">
            <span class="ai-level-badge">Mục tiêu Level ${escapeHtml(targetLevel)}</span>
            ${reviewJson.estimated_band ? `<span class="ai-band-badge">${escapeHtml(reviewJson.estimated_band)}</span>` : ""}
            ${reviewJson.level_assessment ? `<span class="ai-assess-text">${escapeHtml(reviewJson.level_assessment)}</span>` : ""}
          </div>
          ${reviewJson.overall_comment ? `<p class="ai-overall-comment">${escapeHtml(reviewJson.overall_comment)}</p>` : ""}

          ${
            criteriaItems.length > 0
              ? `
              <div class="ai-criteria-grid">
                ${criteriaItems
                  .map(
                    item => `
                    <div class="ai-criteria-item">
                      <div class="ai-criteria-label">${escapeHtml(item.label)}</div>
                      <div class="ai-criteria-text">${escapeHtml(criteria[item.key])}</div>
                    </div>
                  `
                  )
                  .join("")}
              </div>
            `
              : ""
          }
        </div>

        <div class="ai-review-block">
          <div class="ai-block-title">1. Bài viết đã đánh dấu lỗi trực tiếp</div>
          <div class="ai-inline-essay">${buildInlineHighlightedEssay(originalContent, corrections)}</div>
        </div>

        <div class="ai-review-block">
          <div class="ai-block-title">2. Chi tiết các lỗi cần sửa (${corrections.length} mục)</div>
          ${
            corrections.length === 0
              ? `<p class="ai-clean-note">✓ Bài viết không có lỗi ngữ pháp, chính tả, dấu câu hay dùng từ đáng kể ở mức Level ${escapeHtml(targetLevel)}.</p>`
              : `
              <div class="ai-corr-table-wrap">
                <table class="ai-corr-table">
                  <thead>
                    <tr>
                      <th style="width:36px;">#</th>
                      <th style="width:34%;">Chỗ sai → Sửa thành</th>
                      <th style="width:110px;">Loại lỗi</th>
                      <th>Giải thích tại sao sai</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${corrections
                      .map((c, idx) => {
                        const num = c.id || idx + 1;
                        return `
                          <tr>
                            <td class="ai-col-num">${num}</td>
                            <td class="ai-col-diff">
                              <div class="ai-diff-orig">${escapeHtml(c.original)}</div>
                              <div class="ai-diff-fix">→ ${escapeHtml(c.corrected)}</div>
                            </td>
                            <td>
                              <span class="ai-cat-pill ${getCategoryBadgeClass(c.category)}">${escapeHtml(c.category || "Ngữ pháp")}</span>
                            </td>
                            <td class="ai-col-why">${escapeHtml(c.explanation_vi || "")}</td>
                          </tr>
                        `;
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>
            `
          }
        </div>

        ${
          ideaAdditions.length > 0
            ? `
            <div class="ai-review-block">
              <div class="ai-block-title">3. Gợi ý bổ sung ý cho đầy đủ hơn (chuẩn Level ${escapeHtml(targetLevel)})</div>
              <div class="ai-ideas-list">
                ${ideaAdditions
                  .map(
                    it => `
                    <div class="ai-idea-card">
                      ${it.where_vi ? `<div class="ai-idea-where">${escapeHtml(it.where_vi)}</div>` : ""}
                      ${it.issue_vi ? `<p class="ai-idea-issue">${escapeHtml(it.issue_vi)}</p>` : ""}
                      ${it.suggested_sentences_en ? `<div class="ai-idea-en">“${escapeHtml(it.suggested_sentences_en)}”</div>` : ""}
                      ${it.meaning_vi ? `<div class="ai-idea-vi">${escapeHtml(it.meaning_vi)}</div>` : ""}
                    </div>
                  `
                  )
                  .join("")}
              </div>
            </div>
          `
            : ""
        }

        ${
          revisedVersion
            ? `
            <details class="ai-revised-details">
              <summary class="ai-revised-summary">Xem bài viết hoàn chỉnh sau khi sửa (giữ nguyên ý của bạn)</summary>
              <div class="ai-revised-body">${escapeHtml(revisedVersion)}</div>
            </details>
          `
            : ""
        }
      </div>
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
    formatRemainingTime,
    parseFullNameAndClass,
    formatStoredFullName,
    getInitials,
    renderGoogleIconSvg,
    invokeGradeWriting,
    invokeProcessQueue,
    renderWritingReviewHtml
  };
})();
