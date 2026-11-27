document.addEventListener('DOMContentLoaded', () => {
    // --- Global State for Highlighter ---
    let isHighlightModeActive = false;
    let justHighlighted = false;

    // --- Shared Runtime Helpers (Resizer, Countdown Timer, Debounced Draft Saver) ---
    function attachSplitResizer(resizerEl, workspaceEl, minPct, maxPct) {
        if (!resizerEl || !workspaceEl) return;
        let rafId = null;
        let latestX = 0;

        const applyWidth = () => {
            rafId = null;
            const rect = workspaceEl.getBoundingClientRect();
            if (rect.width <= 0) return;
            let pct = ((latestX - rect.left) / rect.width) * 100;
            pct = Math.max(minPct, Math.min(maxPct, pct));
            workspaceEl.style.setProperty('--left-pane-width', `${pct.toFixed(1)}%`);
        };

        const onMouseMove = (e) => {
            latestX = e.clientX;
            if (!rafId) {
                rafId = requestAnimationFrame(applyWidth);
            }
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            resizerEl.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        resizerEl.addEventListener('mousedown', (e) => {
            e.preventDefault();
            resizerEl.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        });
    }

    function bindCountdownTimer(btnEl, displayEl, defaultSec, warnSec) {
        if (!btnEl || !displayEl) return;
        let remainingSec = defaultSec;
        let timerInterval = null;

        const render = () => {
            const m = Math.floor(remainingSec / 60).toString().padStart(2, '0');
            const s = (remainingSec % 60).toString().padStart(2, '0');
            displayEl.textContent = `${m}:${s}`;
        };

        btnEl.addEventListener('click', () => {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
                btnEl.classList.remove('running');
                return;
            }
            if (remainingSec <= 0) {
                remainingSec = defaultSec;
                btnEl.classList.remove('warning');
            }
            btnEl.classList.add('running');
            timerInterval = setInterval(() => {
                if (remainingSec > 0) {
                    remainingSec--;
                    render();
                    if (remainingSec <= warnSec) {
                        btnEl.classList.remove('running');
                        btnEl.classList.add('warning');
                    }
                } else {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    displayEl.textContent = 'Hết giờ!';
                }
            }, 1000);
        });
    }

    const draftSaver = (() => {
        const pending = new Map();
        let timerId = null;

        const flush = () => {
            if (timerId) {
                clearTimeout(timerId);
                timerId = null;
            }
            if (pending.size === 0) return;
            pending.forEach((val, key) => {
                try {
                    localStorage.setItem(key, val);
                } catch (e) {}
            });
            pending.clear();
        };

        const schedule = (key, value) => {
            pending.set(key, value);
            if (!timerId) {
                timerId = setTimeout(flush, 400);
            }
        };

        const cancel = (key) => {
            pending.delete(key);
        };

        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flush();
        });

        return { schedule, flush, cancel };
    })();

    // --- 1. Interactive Phrases Translation Logic (Lazy Event Delegation) ---
    const activeInteractivePhrases = new Set();

    document.addEventListener('click', (e) => {
        if (e.target.closest('.fill-blank') || e.target.closest('.signoff-btn')) {
            return;
        }

        const phrase = e.target.closest('.interactive-phrase');
        if (!phrase) {
            if (activeInteractivePhrases.size > 0) {
                activeInteractivePhrases.forEach(p => p.classList.remove('active'));
                activeInteractivePhrases.clear();
            }
            return;
        }

        if (isHighlightModeActive && e.target.closest('.custom-highlight')) {
            return;
        }

        const translationText = phrase.getAttribute('data-vi');
        if (translationText && !phrase.querySelector('.translation-box')) {
            const transBox = document.createElement('div');
            transBox.className = 'translation-box';
            transBox.textContent = translationText;
            phrase.appendChild(transBox);
        }

        const isNowActive = phrase.classList.toggle('active');
        if (isNowActive) {
            activeInteractivePhrases.add(phrase);
        } else {
            activeInteractivePhrases.delete(phrase);
        }
    });

    // --- 2. Clean Minimal Topbar & History-Aware Multi-Level Navigation ---
    const tabContents = document.querySelectorAll('.tab-content');
    const appLayout = document.querySelector('.app-layout');
    const brandTagEl = document.getElementById('topbar-brand-tag');
    const brandTitleEl = document.getElementById('topbar-brand-title');
    const contextDividerEl = document.getElementById('topbar-context-divider');
    const contextLabelEl = document.getElementById('topbar-context-label');
    const topbarBackBtn = document.getElementById('topbar-back-btn');
    const topbarBackText = document.getElementById('topbar-back-text');

    // --- 2b. Supabase Cloud Auth & Writing Submissions Shared State ---
    const CLOUD = window.WritingCloud || null;
    let currentAccount = null;
    const authState = {
        authMode: 'login', // 'login' | 'register'
        authError: '',
        authInfo: '',
        authLoading: false,
        isTeacher: false,
        needsProfileSetup: false,
        profileFormName: '',
        profileFormClass: CLOUD && CLOUD.CLASS_LIST ? CLOUD.CLASS_LIST[0] : 'ONB204',
        profileFormError: '',
        profileSaving: false,
        regSelectedClass: CLOUD && CLOUD.CLASS_LIST ? CLOUD.CLASS_LIST[0] : 'ONB204',
        submissionsByLessonId: {},
        reviewsByLessonId: {},
        notifOpen: false,
        notifPollTimer: null,
        isSubmittingAdvice: false,
        isSubmittingInquiry: false,
        isSubmittingEssay: false
    };

    function getUserScopedKey(baseKey) {
        return currentAccount && currentAccount.id ? `${baseKey}__${currentAccount.id}` : baseKey;
    }

    const ADMIN_EMAIL = 'mtung0208@gmail.com';

    function isAdminEmail(email) {
        const lower = String(email || '').trim().toLowerCase();
        return lower === ADMIN_EMAIL || lower.startsWith('mtung0208@');
    }

    function isAdminAccount() {
        return Boolean(currentAccount && isAdminEmail(currentAccount.email));
    }

    function canPreviewSampleWithoutSubmit() {
        return isAdminAccount() || authState.isTeacher;
    }

    function getCloudSubmission(lessonId) {
        return (authState.submissionsByLessonId && authState.submissionsByLessonId[lessonId]) || null;
    }

    function getReleasedReview(lessonId) {
        const rev = (authState.reviewsByLessonId && authState.reviewsByLessonId[lessonId]) || null;
        if (!rev || rev.status !== 'ready' || !rev.review_json) return null;
        const relMs = new Date(rev.release_at || 0).getTime();
        if (!isNaN(relMs) && relMs > Date.now() && !authState.isTeacher) return null;
        return rev;
    }

    function getCatalogLessonTitle(lessonId, fallbackTitle) {
        if (CLOUD && Array.isArray(CLOUD.LESSONS_CATALOG)) {
            const found = CLOUD.LESSONS_CATALOG.find(item => item.id === lessonId);
            if (found && found.title) return found.title;
        }
        return fallbackTitle || lessonId;
    }

    function isLessonVisibleToStudent(lessonId) {
        if (!lessonId) return false;
        const layout = document.getElementById('main-app-layout');
        if (!layout || layout.style.display === 'none') return false;
        if (lessonId.startsWith('advice-')) {
            const tab = document.getElementById('khuyen-nghi');
            return Boolean(tab && tab.classList.contains('active') && getAdviceLessonId(currentAdvicePromptId) === lessonId);
        }
        if (lessonId.startsWith('inquiry-')) {
            const tab = document.getElementById('hoi-thong-tin');
            return Boolean(tab && tab.classList.contains('active') && getInquiryLessonId(currentInquiryPromptId) === lessonId);
        }
        const essayTab = document.getElementById('viet-luan');
        return Boolean(essayTab && essayTab.classList.contains('active') && currentEssayTopic === lessonId);
    }

    async function markReviewAsSeen(lessonId) {
        const rev = getReleasedReview(lessonId);
        if (!rev || rev.student_seen_at || !CLOUD) return;
        const client = CLOUD.getClient();
        if (!client) return;
        rev.student_seen_at = new Date().toISOString();
        if (typeof renderNotificationBell === 'function') {
            renderNotificationBell();
        }
        try {
            const { error } = await client.rpc('mark_writing_review_seen', { p_submission_id: rev.submission_id });
            if (error) {
                rev.student_seen_at = null;
                if (typeof renderNotificationBell === 'function') {
                    renderNotificationBell();
                }
            }
        } catch (e) {
            rev.student_seen_at = null;
            if (typeof renderNotificationBell === 'function') {
                renderNotificationBell();
            }
        }
    }

    function renderTeacherFeedbackBox(boxEl, sub) {
        if (!boxEl) return;
        if (!sub || !sub.is_submitted) {
            boxEl.style.display = 'none';
            boxEl.innerHTML = '';
            return;
        }
        const esc = CLOUD ? CLOUD.escapeHtml : (s => String(s || ''));
        const fmtTime = CLOUD ? CLOUD.formatDateTime : (s => String(s || ''));
        const submittedTime = fmtTime(sub.submitted_at || sub.updated_at || sub.created_at);
        const hasGrade = Boolean((sub.teacher_score && sub.teacher_score.trim()) || (sub.teacher_feedback && sub.teacher_feedback.trim()));
        const releasedReview = getReleasedReview(sub.lesson_id);

        const blocks = [];

        if (hasGrade) {
            blocks.push(`
                <div class="writing-teacher-feedback-box">
                    <div class="writing-tf-head">
                        <span class="writing-tf-title">👨‍🏫 Nhận xét từ Giáo viên${submittedTime ? ` · Đã nộp ${esc(submittedTime)}` : ''}</span>
                        ${sub.teacher_score ? `<span class="writing-tf-score">Điểm: ${esc(sub.teacher_score)}</span>` : ''}
                    </div>
                    ${sub.teacher_feedback ? `<p class="writing-tf-comment">${esc(sub.teacher_feedback)}</p>` : ''}
                </div>
            `);
        }

        if (releasedReview && CLOUD && typeof CLOUD.renderWritingReviewHtml === 'function') {
            const relTime = fmtTime(releasedReview.release_at);
            blocks.push(`
                <div class="writing-teacher-feedback-box">
                    <div class="writing-tf-head">
                        <span class="writing-tf-title">✅ Bài sửa chi tiết đã sẵn sàng${relTime ? ` · Trả lúc ${esc(relTime)}` : ''}</span>
                        <span class="writing-tf-score">${esc(String(sub.word_count || 0))} từ · Level ${esc(releasedReview.target_level || sub.target_level || 'B1')}</span>
                    </div>
                </div>
                ${CLOUD.renderWritingReviewHtml(sub.content || '', releasedReview.review_json, {
                    targetLevel: releasedReview.target_level || sub.target_level || 'B1'
                })}
            `);
            if (isLessonVisibleToStudent(sub.lesson_id)) {
                markReviewAsSeen(sub.lesson_id);
            }
        } else {
            const releaseAt = sub.ai_release_at || (sub.submitted_at ? new Date(new Date(sub.submitted_at).getTime() + 6 * 60 * 60 * 1000).toISOString() : '');
            const remainText = CLOUD && releaseAt ? CLOUD.formatRemainingTime(releaseAt) : '';
            const releaseFormatted = releaseAt ? fmtTime(releaseAt) : '';

            if (remainText) {
                blocks.push(`
                    <div class="writing-schedule-box">
                        <div class="writing-schedule-head">
                            <span class="writing-schedule-title">⏳ Đã nộp bài thành công${submittedTime ? ` lúc ${esc(submittedTime)}` : ''} · Đang chờ trả bài sửa</span>
                            <span class="writing-schedule-pill">Còn ${esc(remainText)}</span>
                        </div>
                        <p class="writing-schedule-desc">
                            Bài sửa chi tiết (ngữ pháp, chính tả, dấu câu, từ vựng &amp; bổ sung ý theo chuẩn <strong>Level ${esc(sub.target_level || 'B1')}</strong>) sẽ được gửi vào tài khoản của bạn chậm nhất sau 6 giờ — dự kiến lúc <strong>${esc(releaseFormatted)}</strong>. Bạn sẽ nhận được thông báo ở biểu tượng chuông 🔔 trên góc phải khi có bài sửa.
                        </p>
                    </div>
                `);
            } else if (!hasGrade) {
                blocks.push(`
                    <div class="writing-teacher-feedback-box">
                        <div class="writing-tf-head">
                            <span class="writing-tf-title">✓ Đã gửi bài viết thành công${submittedTime ? ` lúc ${esc(submittedTime)}` : ''}</span>
                            <span class="writing-tf-score">${esc(String(sub.word_count || 0))} từ · Level ${esc(sub.target_level || 'B1')}</span>
                        </div>
                        <p class="writing-tf-comment">Bài sửa chi tiết của bạn đang được hoàn tất. Thông báo sẽ tự động hiện ở biểu tượng chuông 🔔 trên góc phải ngay khi bài sửa sẵn sàng.</p>
                    </div>
                `);
            }
        }

        boxEl.innerHTML = blocks.join('');
        boxEl.style.display = 'block';
    }

    async function submitWritingToCloud({ taskType, lessonId, lessonTitle, promptText, content, wordCount, targetLevel }) {
        const client = CLOUD ? CLOUD.getClient() : null;
        if (!client || !currentAccount) {
            return { ok: false, error: 'Bạn cần đăng nhập tài khoản trước khi nộp bài cho Giáo viên.' };
        }
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const defaultReleaseIso = new Date(nowMs + 6 * 60 * 60 * 1000).toISOString();
        const rowId = `${currentAccount.id}__${lessonId}`;
        const existing = getCloudSubmission(lessonId);

        const resolvedTargetLevel =
            CLOUD && typeof CLOUD.inferTargetLevelFromClass === 'function'
                ? CLOUD.inferTargetLevelFromClass(currentAccount.className, targetLevel)
                : (targetLevel || 'B1');

        const payload = {
            id: rowId,
            user_id: currentAccount.id,
            task_type: taskType,
            lesson_id: lessonId,
            lesson_title: lessonTitle || lessonId,
            prompt_text: promptText || '',
            content: content || '',
            word_count: wordCount || 0,
            target_level: resolvedTargetLevel,
            is_submitted: true,
            submitted_at: nowIso,
            updated_at: nowIso
        };

        if (typeof CLOUD.getValidAccessToken === 'function') {
            const validToken = await CLOUD.getValidAccessToken(client, false);
            if (!validToken) {
                return { ok: false, error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại (bài viết nháp vẫn được giữ nguyên).' };
            }
        }

        let upsertResult = await client
            .from('writing_submissions')
            .upsert(payload, { onConflict: 'id' })
            .select('*')
            .maybeSingle();

        if (upsertResult.error) {
            // Tự động làm mới phiên và thử lưu lại 1 lần nếu mạng chập chờn hoặc JWT vừa hết hạn
            if (typeof CLOUD.getValidAccessToken === 'function') {
                await CLOUD.getValidAccessToken(client, true);
            }
            await new Promise(r => setTimeout(r, 1200));
            upsertResult = await client
                .from('writing_submissions')
                .upsert(payload, { onConflict: 'id' })
                .select('*')
                .maybeSingle();
        }

        const { data, error } = upsertResult;
        if (error) {
            return { ok: false, error: error.message || 'Không thể lưu bài lên Supabase.' };
        }

        try {
            await client
                .from('profiles')
                .update({ last_active_at: nowIso })
                .eq('id', currentAccount.id);
        } catch (e) {}

        // Xóa cache bài sửa cũ (nếu học viên nộp lại bản mới) để chờ đợt trả bài mới chậm nhất sau 6 giờ
        delete authState.reviewsByLessonId[lessonId];

        const savedRow = {
            ...(data || payload),
            teacher_score: (data && data.teacher_score) || (existing ? existing.teacher_score : ''),
            teacher_feedback: (data && data.teacher_feedback) || (existing ? existing.teacher_feedback : ''),
            ai_status: (data && data.ai_status) || 'pending',
            ai_release_at: (data && data.ai_release_at) || defaultReleaseIso
        };
        authState.submissionsByLessonId[lessonId] = savedRow;

        // Kích hoạt Edge Function chấm & hẹn trả bài sửa chậm nhất sau 6 giờ ở nền (kèm jitter giảm xung đột 50+ bài nộp cùng lúc)
        if (CLOUD && typeof CLOUD.invokeGradeWriting === 'function') {
            const jitterMs = 400 + Math.floor(Math.random() * 2600);
            setTimeout(() => {
                if (!currentAccount) return;
                CLOUD.invokeGradeWriting(rowId).then(gradeRes => {
                    if (gradeRes && gradeRes.ok && gradeRes.release_at) {
                        const currentSub = authState.submissionsByLessonId[lessonId];
                        if (currentSub && currentSub.submitted_at === savedRow.submitted_at) {
                            currentSub.ai_status = gradeRes.status || 'scheduled';
                            currentSub.ai_release_at = gradeRes.release_at;
                            if (lessonId === getAdviceLessonId(currentAdvicePromptId)) {
                                renderTeacherFeedbackBox(adviceTeacherFeedbackBox, currentSub);
                            } else if (lessonId === getInquiryLessonId(currentInquiryPromptId)) {
                                renderTeacherFeedbackBox(inquiryTeacherFeedbackBox, currentSub);
                            } else if (lessonId === currentEssayTopic) {
                                renderTeacherFeedbackBox(essayTeacherFeedbackBox, currentSub);
                            }
                        }
                    }
                }).catch(() => {});
            }, jitterMs);
        }

        if (typeof renderNotificationBell === 'function') {
            renderNotificationBell();
        }
        if (typeof renderMySubmissionsView === 'function') {
            renderMySubmissionsView();
        }
        if (typeof startNotificationPolling === 'function') {
            startNotificationPolling();
        }

        return { ok: true, row: savedRow };
    }

    const VIEW_META = {
        'home-dashboard': { mode: 'home', label: '', parent: null },
        'my-submissions': { mode: 'home', label: 'Lịch sử nộp bài', parent: 'home-dashboard' },
        'task1-hub': { mode: 'task1', label: 'Danh sách bài học Task 01', parent: 'home-dashboard' },
        'ly-thuyet': { mode: 'task1', label: 'Lý thuyết chung: Viết Thư & Email', parent: 'task1-hub' },
        'khuyen-nghi': { mode: 'task1', label: 'Thư khuyên / đề xuất', parent: 'task1-hub' },
        'hoi-thong-tin': { mode: 'task1', label: 'Thư hỏi thông tin', parent: 'task1-hub' },
        'cung-cap-thong-tin': { mode: 'task1', label: 'Thư cung cấp thông tin', parent: 'task1-hub' },
        'phan-nan': { mode: 'task1', label: 'Thư phàn nàn', parent: 'task1-hub' },
        'danh-gia': { mode: 'task1', label: 'Thư cho đánh giá', parent: 'task1-hub' },
        'xin-loi': { mode: 'task1', label: 'Thư xin lỗi', parent: 'task1-hub' },
        'xin-viec': { mode: 'task1', label: 'Thư xin việc', parent: 'task1-hub' },
        'task2-hub': { mode: 'task2', label: 'Danh sách bài học Task 02', parent: 'home-dashboard' },
        'task2-ly-thuyet': { mode: 'task2', label: 'Lý thuyết chung: Viết Luận', parent: 'task2-hub' },
        'viet-luan': { mode: 'task2', label: 'Chủ đề 1: Trẻ em & Thiết bị điện tử', parent: 'task2-hub' }
    };

    const DASHBOARD_SIDEBAR_VIEWS = new Set(['home-dashboard', 'task1-hub', 'task2-hub', 'my-submissions']);
    const sidebarCollapseBtn = document.getElementById('ej-sidebar-collapse-btn');
    const mobileMenuBtn = document.getElementById('ej-mobile-menu-btn');
    const sidebarBackdrop = document.getElementById('ej-sidebar-backdrop');
    const topbarSearchWrap = document.getElementById('ej-topbar-search-wrap');
    const focusNavGroup = document.getElementById('ej-focus-nav-group');
    const quickSearchInput = document.getElementById('ej-quick-search-input');
    const quickSearchDropdown = document.getElementById('ej-search-dropdown');
    const sidebarItems = document.querySelectorAll('.ej-sb-item[data-sb-view]');

    const viewHistory = ['home-dashboard'];

    function closeMobileSidebar() {
        if (appLayout) {
            appLayout.classList.remove('mobile-sidebar-open');
        }
    }

    // Restore collapsed sidebar preference on desktop
    try {
        if (appLayout && localStorage.getItem('vstep_sidebar_collapsed') === '1') {
            appLayout.classList.add('sidebar-collapsed');
        }
    } catch (e) {}

    if (sidebarCollapseBtn && appLayout) {
        sidebarCollapseBtn.addEventListener('click', () => {
            const isCollapsed = appLayout.classList.toggle('sidebar-collapsed');
            try {
                localStorage.setItem('vstep_sidebar_collapsed', isCollapsed ? '1' : '0');
            } catch (e) {}
        });
    }

    if (mobileMenuBtn && appLayout) {
        mobileMenuBtn.addEventListener('click', () => {
            appLayout.classList.toggle('mobile-sidebar-open');
        });
    }

    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener('click', closeMobileSidebar);
    }

    // Collapsible Task 01 / Task 02 accordion cards inside sidebar
    document.querySelectorAll('[data-sb-toggle]').forEach(toggleBtn => {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetId = toggleBtn.getAttribute('data-sb-toggle');
            const cardEl = targetId ? document.getElementById(targetId) : null;
            if (!cardEl) return;
            const collapsed = cardEl.classList.toggle('collapsed');
            toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        });
    });

    const dashboardCrumbEl = document.getElementById('vs-dashboard-crumb');

    function updateTopbarForView(viewId) {
        const meta = VIEW_META[viewId] || VIEW_META['home-dashboard'];
        const isDashboardView = DASHBOARD_SIDEBAR_VIEWS.has(viewId);

        // Toggle Focus Lesson Mode (hide sidebar when inside any specific lesson!)
        if (appLayout) {
            appLayout.classList.toggle('focus-lesson-mode', !isDashboardView);
        }

        if (topbarSearchWrap) {
            topbarSearchWrap.style.display = isDashboardView ? 'flex' : 'none';
        }
        if (focusNavGroup) {
            focusNavGroup.style.display = isDashboardView ? 'none' : 'flex';
        }

        if (dashboardCrumbEl) {
            if (viewId === 'task1-hub') {
                dashboardCrumbEl.textContent = 'Task 01 · 8 bài học';
            } else if (viewId === 'task2-hub') {
                dashboardCrumbEl.textContent = 'Task 02 · 13 mục';
            } else if (viewId === 'my-submissions') {
                dashboardCrumbEl.textContent = 'Bài viết đã nộp';
            } else {
                dashboardCrumbEl.textContent = 'Tổng quan · 2 Task';
            }
        }

        // Highlight active item in sidebar
        sidebarItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-sb-view') === viewId);
        });

        if (brandTagEl && brandTitleEl) {
            if (meta.mode === 'task1') {
                brandTagEl.textContent = 'VSTEP WRITING · TASK 01';
                brandTitleEl.textContent = 'Viết Thư & Email';
            } else if (meta.mode === 'task2') {
                brandTagEl.textContent = 'VSTEP WRITING · TASK 02';
                brandTitleEl.textContent = 'Viết Luận (Essay)';
            } else {
                brandTagEl.textContent = 'VSTEP WRITING · B1 – B2';
                brandTitleEl.textContent = 'Viết Thư & Viết Luận';
            }
        }

        if (contextDividerEl && contextLabelEl) {
            const showContext = !isDashboardView && Boolean(meta.label);
            contextDividerEl.style.display = showContext ? 'inline-block' : 'none';
            contextLabelEl.style.display = showContext ? 'inline-block' : 'none';
            contextLabelEl.textContent = showContext ? meta.label : '';
        }

        if (topbarBackBtn) {
            topbarBackBtn.style.display = isDashboardView ? 'none' : 'inline-flex';
            if (topbarBackText) {
                const prevView = viewHistory.length > 1
                    ? viewHistory[viewHistory.length - 2]
                    : (meta.parent || 'home-dashboard');
                if (prevView === 'task1-hub') {
                    topbarBackText.textContent = 'Danh sách Task 01';
                } else if (prevView === 'task2-hub') {
                    topbarBackText.textContent = 'Danh sách Task 02';
                } else if (prevView === 'my-submissions') {
                    topbarBackText.textContent = 'Lịch sử nộp bài';
                } else if (prevView === 'home-dashboard') {
                    topbarBackText.textContent = 'Tổng quan';
                } else {
                    topbarBackText.textContent = 'Quay lại';
                }
            }
        }
    }

    function navigateToView(targetView, options = {}) {
        if (!targetView) return;
        const { fromBack = false } = options;

        closeMobileSidebar();

        if (!fromBack) {
            if (targetView === 'home-dashboard') {
                viewHistory.length = 0;
                viewHistory.push('home-dashboard');
            } else if (viewHistory[viewHistory.length - 1] !== targetView) {
                viewHistory.push(targetView);
            }
        }

        updateTopbarForView(targetView);

        // Switch visible content section
        tabContents.forEach(tc => tc.classList.remove('active'));
        const activeContent = document.getElementById(targetView);
        if (activeContent) {
            activeContent.classList.add('active');
        }

        // Toggle split-pane full-height layout for split workspaces
        if (appLayout) {
            const isSplitView = targetView === 'khuyen-nghi' || targetView === 'hoi-thong-tin' || targetView === 'viet-luan';
            appLayout.classList.toggle('split-tab-active', isSplitView);
        }

        if (targetView === 'my-submissions' && typeof renderMySubmissionsView === 'function') {
            renderMySubmissionsView();
        } else if (targetView === 'khuyen-nghi' && typeof currentAdvicePromptId !== 'undefined') {
            markReviewAsSeen(getAdviceLessonId(currentAdvicePromptId));
        } else if (targetView === 'hoi-thong-tin' && typeof currentInquiryPromptId !== 'undefined') {
            markReviewAsSeen(getInquiryLessonId(currentInquiryPromptId));
        } else if (targetView === 'viet-luan' && typeof currentEssayTopic !== 'undefined') {
            markReviewAsSeen(currentEssayTopic);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- Quick Search (⌘K) across Task 01 & Task 02 lessons ---
    const QUICK_SEARCH_CATALOG = [
        { title: 'Lý thuyết chung: Viết Thư & Email', sub: 'Task 01 · Bố cục 3 phần, văn phong Formal/Informal', tag: 'Task 01', view: 'ly-thuyet' },
        { title: 'Thư khuyên / đề xuất (5 đề)', sub: 'Mua hàng online (Jay), Hội thảo (Carol), Du lịch Hà Nội, Chuyển nhà, Mùa hè', tag: 'Task 01', view: 'khuyen-nghi' },
        { title: 'Thư hỏi thông tin (4 đề)', sub: 'Vé xem hòa nhạc (Alex), mua thú cưng (Pet Shop), tiệc sinh nhật (Sarah), khóa tiếng Anh mùa hè (London)', tag: 'Task 01', view: 'hoi-thong-tin' },
        { title: 'Thư cung cấp thông tin (6 đề)', sub: 'Quê hương (John), Hoa (Emily), tiệc chào mừng, chuyến đi, thể thao, tuyển dụng', tag: 'Task 01', view: 'cung-cap-thong-tin' },
        { title: 'Thư phàn nàn (4 đề)', sub: 'Phòng thay đồ, thiết bị nhà bếp hỏng, đơn hàng Shopee, nhà hàng', tag: 'Task 01', view: 'phan-nan' },
        { title: 'Thư cho đánh giá / phản hồi (3 đề)', sub: 'Khách sạn, nhà sách, đánh giá sách cho Mia', tag: 'Task 01', view: 'danh-gia' },
        { title: 'Thư xin lỗi (4 đề)', sub: 'Nộp bài trễ, lỡ hẹn phỏng vấn, dịch vụ khách sạn, trả sách Anna', tag: 'Task 01', view: 'xin-loi' },
        { title: 'Thư xin việc (3 đề)', sub: 'Trợ lý bán hàng, tình nguyện viên thư viện, kỹ thuật viên phần mềm', tag: 'Task 01', view: 'xin-viec' },
        { title: 'Lý thuyết chung: Viết Luận (Task 2)', sub: 'Tổng quan 4 dạng bài luận VSTEP', tag: 'Task 02', view: 'task2-ly-thuyet' },
        { title: 'Chủ đề 1: Trẻ em & Thiết bị điện tử', sub: 'Children & Electronic Devices · Causes & Solutions', tag: 'Task 02', essay: 'children-devices' },
        { title: 'Chủ đề 2: Thời trang nhanh & Môi trường', sub: 'Fast Fashion & the Environment · Causes & Solutions', tag: 'Task 02', essay: 'fast-fashion' },
        { title: 'Chủ đề 3: Lựa chọn công việc & Sự hài lòng', sub: 'Choosing a Job & Job Satisfaction · Opinion', tag: 'Task 02', essay: 'choosing-job' },
        { title: 'Chủ đề 4: Tự kinh doanh / Tự làm chủ', sub: 'Self-Employment · Advantages & Disadvantages', tag: 'Task 02', essay: 'self-employment' },
        { title: 'Chủ đề 5: Bỏ đèn giao thông tại ngã tư đông đúc', sub: 'Removing Traffic Lights · Opinion', tag: 'Task 02', essay: 'traffic-lights' },
        { title: 'Chủ đề 6: Sự gia tăng lượng khách du lịch', sub: 'Growth in Tourist Numbers · Advantages & Disadvantages', tag: 'Task 02', essay: 'tourism-growth' },
        { title: 'Chủ đề 7: Người trẻ bỏ phố về quê', sub: 'Leaving Cities for Rural Hometowns · Advantages & Disadvantages', tag: 'Task 02', essay: 'leaving-cities' },
        { title: 'Chủ đề 8: Người trẻ thường xuyên nhảy việc', sub: 'Changing Jobs Frequently · Causes & Effects', tag: 'Task 02', essay: 'job-hopping' },
        { title: 'Chủ đề 9: Xung đột giữa cha mẹ và con tuổi teen', sub: 'Parent–Teenager Conflicts · Causes & Solutions', tag: 'Task 02', essay: 'parent-teen-conflicts' },
        { title: 'Chủ đề 10: Nguyên nhân gây căng thẳng ở người trẻ', sub: 'Stress Among Young People · Causes Essay', tag: 'Task 02', essay: 'youth-stress' },
        { title: 'Chủ đề 11: Người cao tuổi với Điện thoại & Internet', sub: 'Mobile Phones, the Internet & the Elderly · Two-Part Question', tag: 'Task 02', essay: 'elderly-technology' },
        { title: 'Chủ đề 12: Tác động của tòa nhà văn phòng kính', sub: 'Modern Glass Office Buildings · Effects Essay', tag: 'Task 02', essay: 'glass-office-buildings' }
    ];

    function normalizeSearchText(str) {
        return String(str || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd');
    }

    function renderQuickSearchResults(query) {
        if (!quickSearchDropdown) return;
        const normQ = normalizeSearchText(query).trim();
        const matches = normQ
            ? QUICK_SEARCH_CATALOG.filter(item =>
                normalizeSearchText(`${item.title} ${item.sub} ${item.tag}`).includes(normQ)
            )
            : QUICK_SEARCH_CATALOG.slice(0, 8);

        if (matches.length === 0) {
            quickSearchDropdown.innerHTML = `<div class="ej-search-empty">Không tìm thấy bài học khớp với “${CLOUD ? CLOUD.escapeHtml(query) : query}”.</div>`;
        } else {
            const esc = CLOUD ? CLOUD.escapeHtml : (s => String(s || ''));
            quickSearchDropdown.innerHTML = matches.map((item, idx) => `
                <button type="button" class="ej-search-result-btn" data-qs-idx="${idx}">
                    <div>
                        <div class="ej-search-res-title">${esc(item.title)}</div>
                        <div class="ej-search-res-sub">${esc(item.sub)}</div>
                    </div>
                    <span class="ej-search-res-tag">${esc(item.tag)}</span>
                </button>
            `).join('');

            quickSearchDropdown.querySelectorAll('[data-qs-idx]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const chosen = matches[parseInt(btn.getAttribute('data-qs-idx'), 10)];
                    if (!chosen) return;
                    quickSearchDropdown.style.display = 'none';
                    if (quickSearchInput) quickSearchInput.value = '';
                    if (chosen.essay && typeof selectEssayTopic === 'function') {
                        selectEssayTopic(chosen.essay);
                        navigateToView('viet-luan');
                    } else if (chosen.view) {
                        navigateToView(chosen.view);
                    }
                });
            });
        }
        quickSearchDropdown.style.display = 'block';
    }

    if (quickSearchInput && quickSearchDropdown) {
        quickSearchInput.addEventListener('focus', () => {
            renderQuickSearchResults(quickSearchInput.value);
        });
        quickSearchInput.addEventListener('input', () => {
            renderQuickSearchResults(quickSearchInput.value);
        });
        quickSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                quickSearchDropdown.style.display = 'none';
                quickSearchInput.blur();
            } else if (e.key === 'Enter') {
                const firstBtn = quickSearchDropdown.querySelector('.ej-search-result-btn');
                if (firstBtn) {
                    e.preventDefault();
                    firstBtn.click();
                }
            }
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#ej-topbar-search-wrap')) {
                quickSearchDropdown.style.display = 'none';
            }
        });
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                if (topbarSearchWrap && topbarSearchWrap.style.display !== 'none') {
                    e.preventDefault();
                    quickSearchInput.focus();
                    renderQuickSearchResults(quickSearchInput.value);
                }
            }
        });
    }

    function goBackView() {
        const currentView = viewHistory[viewHistory.length - 1] || 'home-dashboard';
        if (viewHistory.length > 1) {
            viewHistory.pop();
            const prevView = viewHistory[viewHistory.length - 1];
            navigateToView(prevView, { fromBack: true });
            return;
        }
        const fallbackParent = (VIEW_META[currentView] && VIEW_META[currentView].parent) || 'home-dashboard';
        navigateToView(fallbackParent, { fromBack: true });
    }

    if (topbarBackBtn) {
        topbarBackBtn.addEventListener('click', goBackView);
    }

    document.querySelectorAll('[data-open-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            navigateToView(btn.getAttribute('data-open-view'));
        });
    });

    // --- 2b. Jump-to-tab Cards & Level B1/B2 Switcher in Lý thuyết chung (#ly-thuyet) ---
    document.querySelectorAll('[data-jump-tab]').forEach(cardBtn => {
        cardBtn.addEventListener('click', () => {
            navigateToView(cardBtn.getAttribute('data-jump-tab'));
        });
    });

    // Initialize clean topbar state on load
    updateTopbarForView('home-dashboard');

    const theoryLevelBtns = document.querySelectorAll('[data-theory-level]');
    const theoryGridB1 = document.getElementById('theory-template-grid-B1');
    const theoryGridB2 = document.getElementById('theory-template-grid-B2');

    theoryLevelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const lv = btn.getAttribute('data-theory-level');
            theoryLevelBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (lv === 'B2') {
                if (theoryGridB1) theoryGridB1.style.display = 'none';
                if (theoryGridB2) theoryGridB2.style.display = 'grid';
            } else {
                if (theoryGridB1) theoryGridB1.style.display = 'grid';
                if (theoryGridB2) theoryGridB2.style.display = 'none';
            }
        });
    });

    // --- 3. Sub-tabs Logic for Bookstore/Hotel Feedback ---
    const promptDropdowns = document.querySelectorAll('.prompt-dropdown');
    promptDropdowns.forEach(dropdown => {
        dropdown.addEventListener('change', (e) => {
            e.stopPropagation();
            const targetPrompt = e.target.value;
            const container = dropdown.closest('.mock-exam-section');

            if (!container) return;

            // Remove active classes from all prompt contents
            container.querySelectorAll('.prompt-content').forEach(c => c.classList.remove('active'));

            // Set active class
            const activePromptContent = container.querySelector(`#${targetPrompt}`);
            if (activePromptContent) {
                activePromptContent.classList.add('active');
            }
        });
    });

    // --- 4. Independent Timers for Legacy Mock Exam Windows (Tabs 4–8) ---
    document.querySelectorAll('.mock-exam-window .mock-timer').forEach(timerElement => {
        let time = 20 * 60;
        let timerId = null;

        const updateTimerDisplay = () => {
            const minutes = Math.floor(time / 60).toString().padStart(2, '0');
            const seconds = (time % 60).toString().padStart(2, '0');
            timerElement.textContent = `${minutes}:${seconds}`;
        };

        const startTimer = () => {
            if (timerId) return;
            timerElement.style.background = '#10b981';

            timerId = setInterval(() => {
                if (time > 0) {
                    time--;
                    updateTimerDisplay();
                    if (time === 120) {
                        timerElement.style.background = '#f59e0b';
                    }
                } else {
                    clearInterval(timerId);
                    timerElement.textContent = 'Hết giờ!';
                    timerElement.style.background = '#ef4444';
                }
            }, 1000);
        };

        timerElement.addEventListener('click', startTimer, { once: true });
        timerElement.style.cursor = 'pointer';
        updateTimerDisplay();
    });

    // --- 5. Interactive fill-in-the-blanks logic ---
    document.addEventListener('click', (e) => {
        if (e.target.matches('.fill-blank')) {
            e.stopPropagation();
            const blank = e.target;
            blank.classList.toggle('revealed');
            blank.textContent = blank.classList.contains('revealed')
                ? (blank.getAttribute('data-text') || '____')
                : '____';
        }
    });

    window.changePromptFontSize = function(change) {
        document.querySelectorAll('.mock-content').forEach(container => {
            const currentSize = parseFloat(window.getComputedStyle(container).fontSize);
            const newSize = currentSize + change;
            if (newSize >= 12 && newSize <= 24) {
                container.style.fontSize = `${newSize}px`;
            }
        });
    };

    window.resetPromptFontSize = function() {
        document.querySelectorAll('.mock-content').forEach(container => {
            container.style.fontSize = '';
        });
    };

    // --- 11. Sign-off Buttons & Vocabulary Interactive Buttons (Delegated) ---
    document.addEventListener('click', (e) => {
        const signoffBtn = e.target.closest('.signoff-btn');
        if (signoffBtn) {
            e.stopPropagation();
            signoffBtn.classList.toggle('active');
            return;
        }
        const vocabBtn = e.target.closest('.vocab-btn');
        if (vocabBtn) {
            e.stopPropagation();
            if (!vocabBtn.dataset.en) {
                vocabBtn.dataset.en = vocabBtn.textContent;
            }
            const englishText = vocabBtn.dataset.en;
            const vietnameseText = vocabBtn.getAttribute('data-vi');
            vocabBtn.classList.toggle('active');
            vocabBtn.textContent = vocabBtn.classList.contains('active')
                ? `${englishText} (${vietnameseText})`
                : englishText;
        }
    });

    // --- 12. Highlight Text Mode Logic ---
    window.toggleHighlightMode = function() {
        isHighlightModeActive = !isHighlightModeActive;
        const btns = document.querySelectorAll('.highlight-toggle-btn');
        btns.forEach(b => {
            if (isHighlightModeActive) {
                b.classList.add('active');
                b.innerHTML = '<i class="fas fa-highlighter"></i> Bút nhớ: Bật';
            } else {
                b.classList.remove('active');
                b.innerHTML = '<i class="fas fa-highlighter"></i> Bút nhớ: Tắt';
            }
        });
        if (isHighlightModeActive) {
            document.body.classList.add('highlight-mode-active');
        } else {
            document.body.classList.remove('highlight-mode-active');
        }
    };

    function highlightSelection() {
        if (!isHighlightModeActive) return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);

        // Make sure the selection is inside a mock-content container and not inside controls/tooltips/existing highlights
        let container = range.commonAncestorContainer;
        if (container && container.nodeType === Node.TEXT_NODE) {
            container = container.parentNode;
        }
        if (!(container instanceof Element)) return;
        if (
            !container.closest('.mock-content') ||
            container.closest('.translation-box') ||
            container.closest('.font-size-controls') ||
            container.closest('.custom-highlight')
        ) {
            return;
        }

        try {
            const mark = document.createElement('mark');
            mark.className = 'custom-highlight';
            range.surroundContents(mark);
            selection.removeAllRanges();
            
            justHighlighted = true;
            setTimeout(() => { justHighlighted = false; }, 100);
        } catch (e) {
            // Fallback for complex crossed tag selections
            try {
                const mark = document.createElement('mark');
                mark.className = 'custom-highlight';
                mark.appendChild(range.extractContents());
                range.insertNode(mark);
                selection.removeAllRanges();
                
                justHighlighted = true;
                setTimeout(() => { justHighlighted = false; }, 100);
            } catch (err) {
                console.error("Highlight failed: ", err);
            }
        }
    }

    document.addEventListener('mouseup', highlightSelection);
    document.addEventListener('touchend', highlightSelection);

    // --- 13. Remove Highlight on Click when Highlight Mode is Active ---
    document.addEventListener('click', (e) => {
        if (!isHighlightModeActive) return;
        if (justHighlighted) return;

        const mark = e.target.closest('.custom-highlight');
        if (mark) {
            e.stopPropagation();
            e.preventDefault();
            
            const parent = mark.parentNode;
            if (!parent) return;
            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }
            parent.removeChild(mark);
            parent.normalize();
        }
    });

    // --- 16. Draft-Style Split-Screen Writing Workspace (Thư cho lời khuyên / gợi ý — 5 Đề) ---
    const adviceWorkspace = document.getElementById('advice-split-workspace');
    const adviceResizer = document.getElementById('advice-split-resizer');
    const adviceLevelBtns = document.querySelectorAll('[data-advice-level]');
    const advicePromptSelect = document.getElementById('advice-prompt-select');
    const advicePromptNumBtns = document.querySelectorAll('[data-advice-prompt]');
    const adviceGuideB1 = document.getElementById('advice-guide-B1');
    const adviceGuideB2 = document.getElementById('advice-guide-B2');
    const adviceCurrentLevelTag = document.getElementById('advice-current-level-tag');
    const adviceTheoryScrollPane = document.getElementById('advice-theory-scroll-pane');
    const adviceExNumPill = document.getElementById('advice-ex-num-pill');
    const adviceExTitle = document.getElementById('advice-ex-title');

    let currentAdvicePromptId = '1';
    let currentAdviceLevel = 'B1';

    const ADVICE_PROMPTS_DATA = {
        '1': {
            numLabel: 'Đề 1',
            taskTitle: 'Write an advice email to Jay',
            placeholder: 'Dear Jay,\n\nViết bài của bạn ở đây…',
            promptEn: 'Your friend Jay is planning to shop online for the first time. He knows that you have bought books and CDs online before, so he has written to ask for your advice. Write an email to Jay. In your email, you should say:',
            promptVi: 'Người bạn của bạn là Jay đang có kế hoạch mua sắm trực tuyến lần đầu tiên. Anh ấy biết rằng trước đây bạn đã từng mua sách và đĩa CD trực tuyến, vì vậy anh ấy đã viết thư để xin lời khuyên của bạn. Hãy viết một bức thư điện tử (email) cho Jay. Trong email, bạn nên nói rõ:',
            bullets: [
                {
                    en: 'how he should pay for his order',
                    vi: 'anh ấy nên thanh toán cho đơn hàng của mình bằng cách nào'
                },
                {
                    en: 'what he should do if there is a problem such as late delivery or a wrong order',
                    vi: 'anh ấy nên làm gì nếu có sự cố chẳng hạn như giao hàng trễ hoặc giao nhầm đơn hàng'
                },
                {
                    en: 'what he should do if the item is not what he expected or arrives damaged',
                    vi: 'anh ấy nên làm gì nếu món hàng không giống như anh ấy mong đợi hoặc bị hư hỏng khi đến nơi'
                }
            ],
            footerEn: 'Write at least 120 words. You do not need to include your name or addresses. Your response will be evaluated in terms of Task Fulfillment, Organization, Vocabulary and Grammar.',
            footerVi: 'Viết ít nhất 120 từ. Bạn không cần ghi tên hoặc địa chỉ của mình. Bài viết của bạn sẽ được đánh giá dựa trên các tiêu chí: Mức độ hoàn thành yêu cầu đề bài (Task Fulfillment), Bố cục (Organization), Từ vựng (Vocabulary) và Ngữ pháp (Grammar).',
            sampleB1: [
                '<strong>Dear Jay,</strong>',
                'How are you doing? I hope you’re doing well. I\'m happy to hear that you want to try online shopping. I have bought books and CDs online, so I can give you some advice.',
                'I think cash on delivery is a good choice because you can pay when your order arrives. It is safer for your first purchase. If you use a bank card, a well-known website is a better choice.',
                'Sometimes, there are problems with online orders. If your delivery is late or you receive the wrong item, you can contact the seller and explain the problem. You can also keep your order details.',
                'If the item is different from the pictures or arrives damaged, you can take some photos. Then, you can ask the seller for a refund or a new item.',
                'I hope these tips are useful!',
                '<strong>Best wishes,</strong>'
            ],
            sampleB2: [
                '<strong>Dear Jay,</strong>',
                'It’s been a long time since we last talked. How have you been? I\'m glad you\'re trying online shopping. I\'ve bought books and CDs online before, so I can share some advice.',
                'For your first order, cash on delivery is a safer choice because you only pay when the package arrives. If you prefer a bank transfer, it\'s better to use a reliable website and check the payment details carefully.',
                'Sometimes, orders do not go as planned. If your delivery is late or you receive the wrong item, you can contact the seller and explain the problem. Don’t forget to keep your order details.',
                'If the item looks different from the pictures or arrives damaged, you can take photos as evidence. Then, you can ask the seller for a refund or a replacement.',
                'I hope you enjoy your first online shopping experience!',
                '<strong>Best wishes,</strong>'
            ],
            b1: {
                titleEn: 'Online Shopping Advice — Level B1',
                titleVi: 'Gợi ý từ vựng, cấu trúc và dàn ý trình độ B1',
                intro: 'Ở trình độ <strong>Level B1</strong>, bạn cần viết một bức thư thân mật (informal email) giải quyết trọn vẹn 3 yêu cầu của đề bài bằng các câu đơn và câu ghép rõ ràng, liên kết mạch lạc với <em>because, so, if, or, then, also</em>.',
                stepsHeader: 'Bố cục bức thư khuyên Jay (Level B1) gồm 5 phần:',
                steps: [
                    '1. <strong>Mở thư:</strong> Chào Jay, hỏi thăm sức khỏe và nêu mục đích viết thư cho lời khuyên.',
                    '2. <strong>Đoạn 1 (Cách thanh toán):</strong> Khuyên chọn thanh toán khi nhận hàng (<em>cash on delivery</em>) hoặc dùng thẻ ngân hàng (<em>bank card</em>) trên trang web nổi tiếng (<em>well-known website</em>).',
                    '3. <strong>Đoạn 2 (Giao trễ / Giao nhầm):</strong> Khuyên liên hệ người bán (<em>contact the seller</em>), giải thích vấn đề (<em>explain the problem</em>) và giữ lại thông tin đơn hàng (<em>keep your order details</em>).',
                    '4. <strong>Đoạn 3 (Hàng khác ảnh / Bị hỏng):</strong> Khuyên chụp vài bức ảnh (<em>take some photos</em>) rồi yêu cầu hoàn tiền hoặc đổi món mới (<em>ask the seller for a refund or a new item</em>).',
                    '5. <strong>Kết thư:</strong> Chúc lời khuyên hữu ích và ký tên thân mật (<em>Best wishes,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư điện tử thân mật cho lời khuyên (Informal email giving advice).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Jay (người bạn chuẩn bị mua hàng trực tuyến lần đầu); giọng văn thân mật, gần gũi, dễ hiểu (được dùng viết tắt như <em>you’re, I\'m</em>).',
                    '<strong>3 yêu cầu bắt buộc trong đề:</strong><ul><li>Cách thanh toán đơn hàng (<em>how he should pay for his order</em>).</li><li>Cách xử lý khi gặp vấn đề như giao hàng trễ hoặc giao nhầm đơn (<em>late delivery or a wrong order</em>).</li><li>Cách xử lý khi món hàng không giống mong đợi hoặc bị hư hỏng khi nhận (<em>not what he expected or arrives damaged</em>).</li></ul>',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc khuyên bảo B1:</strong><ul><li>Đưa lời khuyên &amp; lý do: <code>I think + N + is a good choice because...</code> / <code>... is a better choice.</code></li><li>Câu điều kiện loại 1 với <em>If</em>: <code>If you use..., S + V</code> / <code>If your delivery is late or you receive..., you can + V</code>.</li><li>Bổ sung hành động: <code>You can also + V</code> / <code>Then, you can ask the seller for + N</code>.</li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Chào Jay, hỏi thăm sức khỏe, bày tỏ niềm vui khi nghe tin Jay muốn thử mua sắm online và dẫn vào việc đưa lời khuyên từ kinh nghiệm mua sách, đĩa CD.',
                    '<strong>2. Thân bài 1 — Cách thanh toán (Ý 1):</strong> Gợi ý trả tiền mặt khi nhận hàng (<em>cash on delivery</em>) vì an toàn hơn cho lần mua đầu; nếu dùng thẻ ngân hàng (<em>bank card</em>) thì nên chọn trang web nổi tiếng (<em>well-known website</em>).',
                    '<strong>3. Thân bài 2 — Sự cố giao trễ hoặc giao nhầm (Ý 2):</strong> Nhắc rằng đôi khi mua hàng online sẽ có sự cố. Nếu giao trễ hoặc nhận nhầm hàng, hãy liên hệ người bán để giải thích và giữ lại thông tin đơn hàng.',
                    '<strong>4. Thân bài 3 — Hàng khác ảnh hoặc bị hư hỏng (Ý 3):</strong> Nếu món hàng khác với hình ảnh hoặc bị hỏng khi nhận, hãy chụp vài bức ảnh rồi yêu cầu người bán hoàn tiền hoặc đổi món hàng mới.',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Hy vọng những mẹo trên hữu ích và gửi lời chúc thân mật (không ghi tên thật hay địa chỉ).'
                ],
                vocab: [
                    ['cash on delivery', 'n. phr.', 'thanh toán khi nhận hàng', 'I think cash on delivery is a good choice.'],
                    ['first purchase', 'n. phr.', 'lần mua hàng đầu tiên', 'It is safer for your first purchase.'],
                    ['bank card', 'n. phr.', 'thẻ ngân hàng', 'If you use a bank card, a well-known website is a better choice.'],
                    ['well-known website', 'n. phr.', 'trang web nổi tiếng, uy tín', 'A well-known website is a better choice.'],
                    ['receive the wrong item', 'v. phr.', 'nhận nhầm món hàng', 'If your delivery is late or you receive the wrong item...'],
                    ['contact the seller', 'v. phr.', 'liên hệ người bán', 'You can contact the seller and explain the problem.'],
                    ['order details', 'n. phr.', 'thông tin chi tiết đơn hàng', 'You can also keep your order details.'],
                    ['different from', 'adj. phr.', 'khác với', 'If the item is different from the pictures...'],
                    ['arrive damaged', 'v. phr.', 'đến nơi bị hư hỏng', '...or arrives damaged, you can take some photos.'],
                    ['ask for a refund', 'v. phr.', 'yêu cầu hoàn tiền', 'Then, you can ask the seller for a refund or a new item.']
                ],
                tipTitle: 'Mẹo viết thư Level B1 đạt điểm cao',
                tipText: 'Chia thân bài thành <strong>3 đoạn ngắn riêng biệt</strong> tương ứng với 3 yêu cầu của đề. Mỗi đoạn chỉ cần 2–3 câu rõ ràng, dùng câu điều kiện <em>If + hiện tại đơn, you can + V</em> để đưa hướng xử lý cho từng tình huống.'
            },
            b2: {
                titleEn: 'Online Shopping Advice — Level B2',
                titleVi: 'Gợi ý từ vựng nâng cao, cấu trúc tự nhiên và dàn ý trình độ B2',
                intro: 'Ở trình độ <strong>Level B2</strong>, bài viết giữ bố cục 5 phần rõ ràng nhưng nâng cấp độ tự nhiên trong cách mở/kết thư, kết hợp linh hoạt các cấu trúc khuyên bảo (<em>is a safer choice, If you prefer..., it\'s better to..., Don’t forget to...</em>) và các cụm từ cố định chuẩn xác (<em>go as planned, take photos as evidence, a replacement</em>).',
                stepsHeader: 'Các điểm nâng cấp giúp bài viết đạt chuẩn Level B2:',
                steps: [
                    '1. <strong>Mở thư tự nhiên hơn:</strong> Dùng thì hiện tại hoàn thành (<em>It’s been a long time since... / How have you been?</em>) và cụm <em>share some advice</em>.',
                    '2. <strong>Đoạn 1 (Cách thanh toán):</strong> Mở đoạn bằng <em>For your first order</em>, dùng <em>when the package arrives</em>, nâng cấp lên <em>prefer a bank transfer</em>, <em>reliable website</em> và <em>check the payment details carefully</em>.',
                    '3. <strong>Đoạn 2 (Giao trễ / Giao nhầm):</strong> Câu dẫn tự nhiên <em>orders do not go as planned</em> và cấu trúc nhắc nhở <em>Don’t forget to keep your order details</em>.',
                    '4. <strong>Đoạn 3 (Hàng khác ảnh / Bị hỏng):</strong> Nâng cấp lên <em>looks different from the pictures</em>, <em>take photos as evidence</em> (chụp ảnh làm bằng chứng) và <em>a refund or a replacement</em>.',
                    '5. <strong>Kết thư gắn với chủ đề:</strong> Chúc Jay có trải nghiệm mua sắm trực tuyến lần đầu thú vị và ký tên thân mật (<em>Best wishes,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư điện tử thân mật cho lời khuyên (Informal email giving advice).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Jay (bạn bè); giọng văn tự nhiên, trôi chảy, giàu tính kết nối (sử dụng tự nhiên các dạng rút gọn <em>It’s, I\'m, you\'re, I\'ve, it\'s, Don’t</em>).',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc ăn điểm Level B2:</strong><ul><li>Thì hiện tại hoàn thành mở thư: <code>It’s been a long time since...</code> / <code>I\'ve bought... before, so I can share some advice.</code></li><li>Tư vấn có so sánh &amp; điều kiện: <code>For your first order, ... is a safer choice because you only...</code> / <code>If you prefer..., it\'s better to + V and + V carefully.</code></li><li>Câu mệnh lệnh nhắc nhở: <code>Don’t forget to + V...</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Hỏi thăm tự nhiên sau một thời gian không trò chuyện, bày tỏ niềm vui khi Jay thử mua hàng online và chia sẻ lời khuyên từ kinh nghiệm từng mua sách, đĩa CD.',
                    '<strong>2. Thân bài 1 — Cách thanh toán (Ý 1):</strong> Nhấn mạnh với đơn hàng đầu tiên, thanh toán khi nhận hàng (<em>cash on delivery</em>) an toàn hơn vì chỉ trả tiền khi kiện hàng tới nơi (<em>when the package arrives</em>). Nếu thích chuyển khoản ngân hàng (<em>prefer a bank transfer</em>), nên dùng trang web đáng tin cậy (<em>reliable website</em>) và kiểm tra kỹ thông tin thanh toán.',
                    '<strong>3. Thân bài 2 — Sự cố giao trễ hoặc giao nhầm (Ý 2):</strong> Mở đoạn tự nhiên rằng đôi khi đơn hàng không diễn ra như dự tính (<em>do not go as planned</em>). Nếu giao trễ hoặc nhận nhầm hàng, hãy liên hệ người bán để giải thích và đừng quên giữ lại thông tin đơn hàng.',
                    '<strong>4. Thân bài 3 — Hàng khác ảnh hoặc bị hư hỏng (Ý 3):</strong> Nếu món hàng trông khác với hình ảnh hoặc bị hỏng khi nhận, hãy chụp ảnh làm bằng chứng (<em>take photos as evidence</em>), sau đó yêu cầu người bán hoàn tiền hoặc gửi sản phẩm thay thế (<em>a replacement</em>).',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Chúc Jay tận hưởng trải nghiệm mua sắm trực tuyến đầu tiên của mình và gửi lời chúc thân mật (không ghi tên thật hay địa chỉ).'
                ],
                vocab: [
                    ['package arrives', 'n. + v.', 'kiện hàng đến nơi', 'You only pay when the package arrives.'],
                    ['bank transfer', 'n. phr.', 'chuyển khoản ngân hàng', 'If you prefer a bank transfer...'],
                    ['reliable website', 'n. phr.', 'trang web đáng tin cậy', 'It\'s better to use a reliable website.'],
                    ['payment details', 'n. phr.', 'thông tin thanh toán', '...and check the payment details carefully.'],
                    ['go as planned', 'v. phr.', 'diễn ra như dự tính', 'Sometimes, orders do not go as planned.'],
                    ['look different from', 'v. phr.', 'trông khác với', 'If the item looks different from the pictures...'],
                    ['take photos as evidence', 'v. phr.', 'chụp ảnh làm bằng chứng', 'You can take photos as evidence.'],
                    ['replacement', 'n.', 'sản phẩm thay thế', 'You can ask the seller for a refund or a replacement.'],
                    ['shopping experience', 'n. phr.', 'trải nghiệm mua sắm', 'I hope you enjoy your first online shopping experience!']
                ],
                upgrades: [
                    ['Mở thư', 'How are you doing? / give you some advice', '<strong>It’s been a long time since we last talked. How have you been?</strong> / <strong>share some advice</strong>'],
                    ['Thanh toán', 'when your order arrives / bank card / well-known website', 'when the <strong>package arrives</strong> / <strong>prefer a bank transfer</strong> / <strong>reliable website</strong> &amp; <strong>check the payment details carefully</strong>'],
                    ['Sự cố đơn hàng', 'there are problems with online orders / You can also keep...', 'orders <strong>do not go as planned</strong> / <strong>Don’t forget to keep</strong>...'],
                    ['Hàng lỗi / hỏng', 'is different from / take some photos / a refund or a new item', '<strong>looks different from</strong> / <strong>take photos as evidence</strong> / a refund or <strong>a replacement</strong>'],
                    ['Kết thư', 'I hope these tips are useful!', '<strong>I hope you enjoy your first online shopping experience!</strong>']
                ],
                tipTitle: 'Mẹo nâng band điểm từ B1 lên B2',
                tipText: 'Thay vì lặp lại cấu trúc <em>is a good choice / you can</em> ở mọi câu, hãy kết hợp linh hoạt <strong>For your first order, ... is a safer choice</strong>, <strong>If you prefer ..., it\'s better to ...</strong>, và câu nhắc nhở <strong>Don’t forget to ...</strong> kèm các collocations như <em>go as planned, take photos as evidence, ask for a refund or a replacement</em>.'
            }
        },
        '2': {
            numLabel: 'Đề 2',
            taskTitle: 'Write an email to Carol about the seminar',
            placeholder: 'Dear Carol,\n\nViết bài của bạn ở đây…',
            promptEn: 'You are organising a two-day professional seminar for your company. Carol, a colleague from another branch, has written to ask for practical information about attending. Write an email to Carol. In your email, you should:',
            promptVi: 'Bạn đang tổ chức một hội thảo chuyên môn kéo dài hai ngày cho công ty của mình. Carol, một đồng nghiệp từ chi nhánh khác, đã viết thư để hỏi thông tin thực tế về việc tham dự. Hãy viết một email cho Carol. Trong email, bạn nên:',
            bullets: [
                {
                    en: 'recommend a suitable hotel and explain why it is convenient',
                    vi: 'gợi ý một khách sạn phù hợp và giải thích lý do tại sao khách sạn đó thuận tiện'
                },
                {
                    en: 'tell her the total cost and what it includes',
                    vi: 'cho cô ấy biết tổng chi phí và số tiền đó bao gồm những gì'
                },
                {
                    en: 'explain whether and how she can pay online',
                    vi: 'giải thích liệu cô ấy có thể thanh toán trực tuyến hay không và bằng cách nào'
                }
            ],
            footerEn: 'Write at least 120 words. You do not need to include your name or addresses. Your response will be evaluated in terms of Task Fulfillment, Organization, Vocabulary and Grammar.',
            footerVi: 'Viết ít nhất 120 từ. Bạn không cần ghi tên hoặc địa chỉ của mình. Bài viết của bạn sẽ được đánh giá dựa trên các tiêu chí: Mức độ hoàn thành yêu cầu đề bài (Task Fulfillment), Bố cục (Organization), Từ vựng (Vocabulary) và Ngữ pháp (Grammar).',
            sampleB1: [
                '<strong>Dear Carol,</strong>',
                'Thank you for your email. I am happy to hear that you can join our two-day seminar. Here is some information for your visit.',
                'For your stay, I recommend Green Hotel. It is only a ten-minute walk from the seminar venue, so you can get there easily without taking a taxi. There are also some restaurants near the hotel.',
                'As for the cost, the total price is $250. It includes one night at the hotel, breakfast, lunch on both days, and all seminar materials. So, you do not need to pay extra for these things.',
                'Regarding payment, you can pay online by bank transfer. You just need to visit the seminar website and follow the payment steps. After you make the payment, you will receive a confirmation email.',
                'I hope you find this information useful. I look forward to seeing you at the seminar.',
                '<strong>Kind regards,</strong>'
            ],
            sampleB2: [
                '<strong>Dear Carol,</strong>',
                'Thank you for your email. I am pleased to hear that you are joining our two-day professional seminar. I am writing to share some useful information to help you prepare for your visit.',
                'Regarding accommodation, I recommend Green Hotel. It is only a ten-minute walk from the seminar venue, so you can get there easily without taking a taxi. There are also several restaurants nearby.',
                'As for the cost, the total fee is $250. This includes one night at the hotel, breakfast, lunch on both days, and all seminar materials. Therefore, you will not have to pay extra for these services.',
                'In terms of payment, you can pay online by using bank transfer. You just need to visit the seminar registration page and follow the payment instructions. As soon as the payment is complete, you will receive a confirmation email.',
                'I hope this information helps you prepare for the seminar. I look forward to seeing you there.',
                '<strong>Kind regards,</strong>'
            ],
            b1: {
                titleEn: 'Professional Seminar Information — Level B1',
                titleVi: 'Gợi ý từ vựng, cấu trúc và dàn ý trình độ B1',
                intro: 'Ở trình độ <strong>Level B1</strong>, đây là email công việc gửi đồng nghiệp ở chi nhánh khác (semi-formal email). Bạn nên sử dụng giọng văn lịch sự, rõ ràng, không viết tắt và kết thư bằng <em>Kind regards,</em>.',
                stepsHeader: 'Bố cục bức thư gửi đồng nghiệp Carol (Level B1) gồm 5 phần:',
                steps: [
                    '1. <strong>Mở thư:</strong> Cảm ơn email của Carol, bày tỏ niềm vui khi cô ấy tham gia hội thảo 2 ngày và dẫn vào việc cung cấp thông tin.',
                    '2. <strong>Đoạn 1 (Khách sạn &amp; Sự thuận tiện):</strong> Gợi ý <em>Green Hotel</em> vì chỉ cách nơi tổ chức hội thảo 10 phút đi bộ (<em>a ten-minute walk from the seminar venue</em>), không cần đi taxi và gần nhiều nhà hàng.',
                    '3. <strong>Đoạn 2 (Tổng chi phí &amp; Quyền lợi):</strong> Nêu tổng chi phí $250 (<em>the total price is $250</em>), bao gồm 1 đêm khách sạn, bữa sáng, bữa trưa cả 2 ngày và tài liệu hội thảo (<em>seminar materials</em>), không cần trả thêm tiền (<em>pay extra</em>).',
                    '4. <strong>Đoạn 3 (Thanh toán trực tuyến):</strong> Cho biết có thể thanh toán online bằng chuyển khoản ngân hàng (<em>by bank transfer</em>) trên website hội thảo (<em>seminar website</em>) và nhận email xác nhận (<em>confirmation email</em>).',
                    '5. <strong>Kết thư:</strong> Hy vọng thông tin hữu ích, mong gặp Carol tại hội thảo và chào kết lịch sự (<em>Kind regards,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư công việc cung cấp thông tin và gợi ý thực tế (Semi-formal work email).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Carol (đồng nghiệp từ chi nhánh khác); giọng văn lịch sự, rõ ràng, hạn chế viết tắt (dùng <em>I am, you do not</em>).',
                    '<strong>3 yêu cầu bắt buộc trong đề:</strong><ul><li>Gợi ý khách sạn phù hợp và giải thích vì sao thuận tiện (<em>recommend a suitable hotel and explain why it is convenient</em>).</li><li>Nêu tổng chi phí và những gì được bao gồm (<em>tell her the total cost and what it includes</em>).</li><li>Giải thích có thể thanh toán trực tuyến không và bằng cách nào (<em>explain whether and how she can pay online</em>).</li></ul>',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc B1:</strong><ul><li>Từ nối mở đầu từng đoạn: <code>For your stay, I recommend...</code> / <code>As for the cost,...</code> / <code>Regarding payment,...</code></li><li>Liệt kê &amp; nêu kết quả: <code>It includes A, B, C, and D. So, you do not need to pay extra...</code></li><li>Hướng dẫn các bước: <code>You just need to + V... After you make the payment, you will receive...</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Cảm ơn Carol vì đã gửi email, bày tỏ niềm vui khi biết cô ấy có thể tham gia hội thảo 2 ngày và giới thiệu thông tin cho chuyến đi.',
                    '<strong>2. Thân bài 1 — Gợi ý khách sạn (Ý 1):</strong> Gợi ý <em>Green Hotel</em> vì chỉ cách địa điểm hội thảo 10 phút đi bộ nên dễ dàng đi lại mà không cần bắt taxi; gần khách sạn cũng có một số nhà hàng.',
                    '<strong>3. Thân bài 2 — Chi phí &amp; Các mục bao gồm (Ý 2):</strong> Cho biết tổng chi phí là $250, đã bao gồm 1 đêm nghỉ tại khách sạn, bữa sáng, bữa trưa cho cả 2 ngày và toàn bộ tài liệu hội thảo nên không cần trả thêm tiền.',
                    '<strong>4. Thân bài 3 — Cách thanh toán online (Ý 3):</strong> Giải thích có thể trả tiền trực tuyến qua chuyển khoản ngân hàng bằng cách truy cập website hội thảo và làm theo các bước thanh toán; sau khi thanh toán sẽ nhận được email xác nhận.',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Hy vọng thông tin hữu ích, mong được gặp Carol tại hội thảo và chào kết lịch sự (<em>Kind regards,</em>).'
                ],
                vocab: [
                    ['two-day seminar', 'n. phr.', 'hội thảo kéo dài 2 ngày', 'I am happy to hear that you can join our two-day seminar.'],
                    ['a ten-minute walk', 'n. phr.', '10 phút đi bộ', 'It is only a ten-minute walk from the seminar venue.'],
                    ['seminar venue', 'n. phr.', 'địa điểm tổ chức hội thảo', '...from the seminar venue, so you can get there easily.'],
                    ['without taking a taxi', 'prep. phr.', 'mà không cần đi taxi', 'You can get there easily without taking a taxi.'],
                    ['total price', 'n. phr.', 'tổng mức giá / chi phí', 'As for the cost, the total price is $250.'],
                    ['seminar materials', 'n. phr.', 'tài liệu hội thảo', 'It includes lunch on both days, and all seminar materials.'],
                    ['pay extra', 'v. phr.', 'trả thêm tiền', 'So, you do not need to pay extra for these things.'],
                    ['by bank transfer', 'prep. phr.', 'bằng chuyển khoản ngân hàng', 'Regarding payment, you can pay online by bank transfer.'],
                    ['payment steps', 'n. phr.', 'các bước thanh toán', 'You just need to visit the seminar website and follow the payment steps.'],
                    ['confirmation email', 'n. phr.', 'email xác nhận', 'After you make the payment, you will receive a confirmation email.']
                ],
                tipTitle: 'Mẹo viết thư công việc Level B1',
                tipText: 'Khi viết thư cho đồng nghiệp ở chi nhánh khác, hãy mở đầu từng đoạn bằng các cụm chuyển ý rõ ràng như <strong>For your stay</strong>, <strong>As for the cost</strong>, <strong>Regarding payment</strong> và dùng lời chào kết <strong>Kind regards,</strong> thay vì <em>Best wishes,</em>.'
            },
            b2: {
                titleEn: 'Professional Seminar Information — Level B2',
                titleVi: 'Gợi ý từ vựng nâng cao, cấu trúc chuyên nghiệp và dàn ý trình độ B2',
                intro: 'Ở trình độ <strong>Level B2</strong>, bức thư công việc trở nên chuyên nghiệp và mạch lạc hơn nhờ các từ vựng trang trọng (<em>pleased to hear, accommodation, total fee, registration page, payment instructions</em>) và các liên từ chuẩn mực (<em>Therefore, In terms of, As soon as</em>).',
                stepsHeader: 'Các điểm nâng cấp giúp bài viết đạt chuẩn Level B2:',
                steps: [
                    '1. <strong>Mở thư chuyên nghiệp:</strong> Dùng <em>I am pleased to hear that you are joining our two-day professional seminar</em> và nêu rõ mục đích <em>I am writing to share some useful information to help you prepare for your visit</em>.',
                    '2. <strong>Đoạn 1 (Lưu trú):</strong> Mở đoạn bằng <em>Regarding accommodation</em> và nâng cấp lên <em>several restaurants nearby</em>.',
                    '3. <strong>Đoạn 2 (Chi phí):</strong> Dùng <em>the total fee is $250</em> và câu kết luận trang trọng <em>Therefore, you will not have to pay extra for these services</em>.',
                    '4. <strong>Đoạn 3 (Thanh toán):</strong> Mở đoạn bằng <em>In terms of payment</em>, nâng cấp lên <em>seminar registration page</em>, <em>follow the payment instructions</em> và liên từ <em>As soon as the payment is complete</em>.',
                    '5. <strong>Kết thư lịch thiệp:</strong> <em>I hope this information helps you prepare for the seminar. I look forward to seeing you there. / Kind regards,</em>'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư điện tử công việc bán trang trọng / trang trọng gửi đồng nghiệp (Professional email to a colleague).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Carol (đồng nghiệp chi nhánh khác); giọng văn lịch thiệp, chuẩn mực, không dùng dạng viết tắt.',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc ăn điểm Level B2:</strong><ul><li>Mở thư trang trọng: <code>I am pleased to hear that...</code> / <code>I am writing to share some useful information to help you prepare for...</code></li><li>Từ nối &amp; giới từ học thuật/công sở: <code>Regarding accommodation,...</code> / <code>Therefore, you will not have to...</code> / <code>In terms of payment,...</code></li><li>Mệnh đề chỉ thời gian chính xác: <code>As soon as the payment is complete, you will receive...</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Cảm ơn email của Carol, bày tỏ sự vui mừng khi cô ấy tham gia hội thảo chuyên môn 2 ngày và nêu mục đích chia sẻ thông tin hữu ích giúp cô ấy chuẩn bị cho chuyến đi.',
                    '<strong>2. Thân bài 1 — Chỗ ở &amp; Sự thuận tiện (Ý 1):</strong> Về chỗ ở (<em>accommodation</em>), khuyên chọn <em>Green Hotel</em> vì chỉ cách địa điểm hội thảo 10 phút đi bộ, thuận tiện đi lại không cần taxi và có nhiều nhà hàng ở gần đó (<em>nearby</em>).',
                    '<strong>3. Thân bài 2 — Tổng lệ phí &amp; Dịch vụ đi kèm (Ý 2):</strong> Thông báo tổng chi phí (<em>total fee</em>) là $250, bao gồm 1 đêm khách sạn, bữa sáng, bữa trưa cả 2 ngày và toàn bộ tài liệu hội thảo; do đó (<em>Therefore</em>) không phải trả thêm phí cho các dịch vụ này.',
                    '<strong>4. Thân bài 3 — Hướng dẫn thanh toán trực tuyến (Ý 3):</strong> Về việc thanh toán (<em>In terms of payment</em>), hướng dẫn trả online qua chuyển khoản ngân hàng tại trang đăng ký hội thảo (<em>seminar registration page</em>) theo hướng dẫn thanh toán; ngay khi hoàn tất (<em>As soon as the payment is complete</em>) sẽ nhận được email xác nhận.',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Hy vọng thông tin giúp Carol chuẩn bị tốt cho hội thảo, mong gặp cô ấy tại đó và ký tên lịch sự (<em>Kind regards,</em>).'
                ],
                vocab: [
                    ['professional seminar', 'n. phr.', 'hội thảo chuyên môn', '...you are joining our two-day professional seminar.'],
                    ['regarding accommodation', 'prep. phr.', 'về vấn đề chỗ ở / lưu trú', 'Regarding accommodation, I recommend Green Hotel.'],
                    ['seminar venue', 'n. phr.', 'địa điểm tổ chức hội thảo', 'It is only a ten-minute walk from the seminar venue.'],
                    ['total fee', 'n. phr.', 'tổng lệ phí / chi phí', 'As for the cost, the total fee is $250.'],
                    ['pay extra for these services', 'v. phr.', 'trả thêm phí cho các dịch vụ này', 'Therefore, you will not have to pay extra for these services.'],
                    ['in terms of payment', 'prep. phr.', 'xét về mặt thanh toán', 'In terms of payment, you can pay online by using bank transfer.'],
                    ['registration page', 'n. phr.', 'trang đăng ký', 'You just need to visit the seminar registration page...'],
                    ['payment instructions', 'n. phr.', 'hướng dẫn thanh toán', '...and follow the payment instructions.'],
                    ['as soon as', 'conj.', 'ngay khi', 'As soon as the payment is complete, you will receive a confirmation email.']
                ],
                upgrades: [
                    ['Mở thư', 'I am happy to hear... / Here is some information', '<strong>I am pleased to hear...</strong> / <strong>I am writing to share some useful information to help you prepare...</strong>'],
                    ['Chỗ ở', 'For your stay / some restaurants near the hotel', '<strong>Regarding accommodation</strong> / <strong>several restaurants nearby</strong>'],
                    ['Chi phí', 'the total price is $250 / So, you do not need to pay extra for these things', '<strong>the total fee is $250</strong> / <strong>Therefore, you will not have to pay extra for these services</strong>'],
                    ['Thanh toán', 'Regarding payment / seminar website / payment steps / After you make the payment', '<strong>In terms of payment</strong> / <strong>seminar registration page</strong> / <strong>payment instructions</strong> / <strong>As soon as the payment is complete</strong>'],
                    ['Kết thư', 'I hope you find this information useful.', '<strong>I hope this information helps you prepare for the seminar.</strong>']
                ],
                tipTitle: 'Mẹo nâng band điểm từ B1 lên B2',
                tipText: 'Trong thư công việc (semi-formal / formal), việc thay các từ thông thường bằng thuật ngữ chuẩn công sở như <strong>accommodation</strong> (thay cho <em>stay</em>), <strong>total fee / services</strong> (thay cho <em>total price / things</em>), <strong>registration page / payment instructions</strong> (thay cho <em>website / payment steps</em>) giúp điểm Vocabulary tăng rõ rệt.'
            }
        },
        '3': {
            numLabel: 'Đề 3',
            taskTitle: 'Write an advice email to Jane about visiting Hanoi',
            placeholder: 'Dear Jane,\n\nViết bài của bạn ở đây…',
            promptEn: 'Your friend Jane will visit Hanoi and has asked for practical advice. Write an email to Jane. In your email, you should:',
            promptVi: 'Người bạn của bạn là Jane sẽ đến thăm Hà Nội và đã hỏi xin những lời khuyên thực tế. Hãy viết một email cho Jane. Trong email, bạn nên:',
            bullets: [
                {
                    en: 'recommend a suitable area or type of accommodation',
                    vi: 'gợi ý một khu vực hoặc loại hình lưu trú phù hợp'
                },
                {
                    en: 'describe the weather she should expect and what to pack',
                    vi: 'miêu tả thời tiết cô ấy nên dự kiến và những thứ cần mang theo'
                },
                {
                    en: 'suggest attractions she should not miss',
                    vi: 'đề xuất những địa điểm tham quan cô ấy không nên bỏ lỡ'
                }
            ],
            footerEn: 'Write at least 120 words. You do not need to include your name or addresses. Your response will be evaluated in terms of Task Fulfillment, Organization, Vocabulary and Grammar.',
            footerVi: 'Viết ít nhất 120 từ. Bạn không cần ghi tên hoặc địa chỉ của mình. Bài viết của bạn sẽ được đánh giá dựa trên các tiêu chí: Mức độ hoàn thành yêu cầu đề bài (Task Fulfillment), Bố cục (Organization), Từ vựng (Vocabulary) và Ngữ pháp (Grammar).',
            sampleB1: [
                '<strong>Dear Jane,</strong>',
                'How are you doing? I hope you’re doing well. I\'m happy to hear that you\'re coming to Hanoi. Here are a few tips for your trip.',
                'For your stay, I recommend the Old Quarter. There are many hotels, restaurants and shops in this area. It is also close to Hoan Kiem Lake, so you can visit many places on foot.',
                'As for the weather, there are 4 seasons in Hanoi. Summer is hot and rainy, while winter can be cold. If you visit in summer, you should bring light clothes and an umbrella. If you come in winter, you should bring a warm jacket. You should also wear comfortable shoes because you may walk a lot.',
                'Finally, there are some interesting places you should visit. Hoan Kiem Lake is a nice place to walk and relax. You can also visit the Old Quarter to try local food and the Temple of Literature to learn about Vietnamese history.',
                'I hope you have a great time in Hanoi!',
                '<strong>Best wishes,</strong>'
            ],
            sampleB2: [
                '<strong>Dear Jane,</strong>',
                'It’s been a long time since we last talked. How have you been? It\'s great to hear that you\'re planning a trip to Hanoi. I\'d like to share a few suggestions to help you prepare.',
                'For accommodation, I recommend staying in or near the Old Quarter. This area has plenty of hotels, cafés and restaurants, and it is within walking distance of Hoan Kiem Lake. It is also a good place to try local food.',
                'As for the weather, there are 4 seasons in Hanoi. Summer is usually hot and humid, with heavy rain, while winter can be quite cold. That’s why you should check the weather forecast before your trip. It’s better to pack light clothes and an umbrella in summer, while a jacket and warmer clothes are better for winter. Don’t forget to wear comfortable shoes because you may walk a lot.',
                'When it comes to sightseeing, you shouldn\'t miss Hoan Kiem Lake, the Old Quarter and the Temple of Literature. These places offer a good look at Hanoi\'s daily life and history.',
                'I hope you have a wonderful trip!',
                '<strong>Best wishes,</strong>'
            ],
            b1: {
                titleEn: 'Visiting Hanoi Advice — Level B1',
                titleVi: 'Gợi ý từ vựng, cấu trúc và dàn ý trình độ B1',
                intro: 'Ở trình độ <strong>Level B1</strong>, bạn viết thư thân mật tư vấn cho Jane về chuyến du lịch Hà Nội theo đúng 3 ý: khu vực nên ở, thời tiết &amp; hành lý cần mang theo mùa, và các địa điểm tham quan nổi bật.',
                stepsHeader: 'Bố cục bức thư khuyên Jane (Level B1) gồm 5 phần:',
                steps: [
                    '1. <strong>Mở thư:</strong> Chào Jane, hỏi thăm sức khỏe, bày tỏ niềm vui khi bạn sắp đến Hà Nội và giới thiệu vài mẹo cho chuyến đi.',
                    '2. <strong>Đoạn 1 (Khu vực lưu trú):</strong> Gợi ý khu Phố Cổ (<em>the Old Quarter</em>) vì có nhiều khách sạn, nhà hàng, cửa hàng và gần Hồ Hoàn Kiếm nên có thể đi bộ tham quan (<em>visit many places on foot</em>).',
                    '3. <strong>Đoạn 2 (Thời tiết &amp; Đồ mang theo):</strong> Nêu Hà Nội có 4 mùa (hè nóng và mưa, đông lạnh); khuyên mang đồ mỏng nhẹ và ô (<em>light clothes and an umbrella</em>) vào mùa hè, áo khoác ấm (<em>warm jacket</em>) vào mùa đông và giày êm chân (<em>comfortable shoes</em>).',
                    '4. <strong>Đoạn 3 (Điểm tham quan):</strong> Gợi ý Hồ Hoàn Kiếm để đi dạo, Phố Cổ để thử món ăn địa phương (<em>try local food</em>) và Văn Miếu (<em>Temple of Literature</em>) để tìm hiểu lịch sử.',
                    '5. <strong>Kết thư:</strong> Chúc Jane có khoảng thời gian tuyệt vời ở Hà Nội và ký tên (<em>Best wishes,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư điện tử thân mật tư vấn du lịch (Informal travel advice email).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Jane (bạn bè sắp đến thăm Hà Nội); giọng văn thân thiện, nhiệt tình, tự nhiên.',
                    '<strong>3 yêu cầu bắt buộc trong đề:</strong><ul><li>Gợi ý khu vực hoặc loại chỗ ở phù hợp (<em>recommend a suitable area or type of accommodation</em>).</li><li>Miêu tả thời tiết và những đồ cần mang theo (<em>describe the weather she should expect and what to pack</em>).</li><li>Gợi ý các điểm tham quan không nên bỏ lỡ (<em>suggest attractions she should not miss</em>).</li></ul>',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc khuyên bảo B1:</strong><ul><li>Gợi ý trực tiếp: <code>For your stay, I recommend...</code> / <code>You should bring...</code> / <code>You should also wear...</code></li><li>Đối lập thời tiết với <em>while</em>: <code>Summer is hot and rainy, while winter can be cold.</code></li><li>Câu điều kiện theo mùa: <code>If you visit in summer, you should...</code> / <code>If you come in winter, you should...</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Hỏi thăm sức khỏe Jane, bày tỏ niềm vui khi biết bạn sắp đến Hà Nội và dẫn vào các mẹo hữu ích cho chuyến đi.',
                    '<strong>2. Thân bài 1 — Khu vực lưu trú (Ý 1):</strong> Khuyên ở khu Phố Cổ (<em>the Old Quarter</em>) vì có nhiều khách sạn, nhà hàng, cửa hàng và nằm gần Hồ Hoàn Kiếm nên có thể đi bộ thăm nhiều nơi.',
                    '<strong>3. Thân bài 2 — Thời tiết &amp; Đồ cần chuẩn bị (Ý 2):</strong> Giới thiệu Hà Nội có 4 mùa (mùa hè nóng và mưa, mùa đông lạnh). Khuyên mang quần áo mỏng nhẹ và ô nếu đi mùa hè, mang áo khoác ấm nếu đi mùa đông, và đi giày thoải mái vì sẽ đi bộ nhiều.',
                    '<strong>4. Thân bài 3 — Điểm tham quan nổi bật (Ý 3):</strong> Gợi ý đi dạo thư giãn ở Hồ Hoàn Kiếm, ghé Phố Cổ thưởng thức ẩm thực địa phương và thăm Văn Miếu (<em>Temple of Literature</em>) để tìm hiểu lịch sử Việt Nam.',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Chúc Jane có khoảng thời gian tuyệt vời tại Hà Nội và chào thân mật (<em>Best wishes,</em>).'
                ],
                vocab: [
                    ['the Old Quarter', 'n. phr.', 'khu Phố Cổ', 'For your stay, I recommend the Old Quarter.'],
                    ['close to', 'adj. phr.', 'gần với', 'It is also close to Hoan Kiem Lake.'],
                    ['on foot', 'prep. phr.', 'bằng cách đi bộ', 'You can visit many places on foot.'],
                    ['hot and rainy', 'adj. phr.', 'nóng và có mưa', 'Summer is hot and rainy, while winter can be cold.'],
                    ['light clothes', 'n. phr.', 'quần áo mỏng nhẹ', 'If you visit in summer, you should bring light clothes and an umbrella.'],
                    ['warm jacket', 'n. phr.', 'áo khoác ấm', 'If you come in winter, you should bring a warm jacket.'],
                    ['comfortable shoes', 'n. phr.', 'giày êm chân, thoải mái', 'You should also wear comfortable shoes because you may walk a lot.'],
                    ['try local food', 'v. phr.', 'thử ẩm thực địa phương', 'You can also visit the Old Quarter to try local food.'],
                    ['Temple of Literature', 'n. phr.', 'Văn Miếu - Quốc Tử Giám', '...and the Temple of Literature to learn about Vietnamese history.']
                ],
                tipTitle: 'Mẹo viết thư tư vấn du lịch Level B1',
                tipText: 'Khi chưa biết chính xác bạn mình đi vào mùa nào, việc chia ra 2 trường hợp ngắn gọn với <strong>If you visit in summer... / If you come in winter...</strong> vừa giúp trả lời trọn vẹn câu hỏi về thời tiết &amp; hành lý, vừa đủ số từ một cách tự nhiên.'
            },
            b2: {
                titleEn: 'Visiting Hanoi Advice — Level B2',
                titleVi: 'Gợi ý từ vựng nâng cao, cấu trúc tự nhiên và dàn ý trình độ B2',
                intro: 'Ở trình độ <strong>Level B2</strong>, bài viết sử dụng các cụm từ miêu tả du lịch tự nhiên và chính xác hơn như <em>within walking distance of, hot and humid with heavy rain, check the weather forecast, When it comes to sightseeing, offer a good look at</em>.',
                stepsHeader: 'Các điểm nâng cấp giúp bài viết đạt chuẩn Level B2:',
                steps: [
                    '1. <strong>Mở thư tự nhiên:</strong> Dùng <em>It’s been a long time since we last talked. How have you been?</em> và <em>I\'d like to share a few suggestions to help you prepare</em>.',
                    '2. <strong>Đoạn 1 (Chỗ ở):</strong> Mở đoạn bằng <em>For accommodation, I recommend staying in or near the Old Quarter</em>, dùng <em>plenty of hotels, cafés and restaurants</em> và cụm <em>within walking distance of Hoan Kiem Lake</em>.',
                    '3. <strong>Đoạn 2 (Thời tiết &amp; Hành lý):</strong> Miêu tả <em>hot and humid, with heavy rain</em>, khuyên <em>check the weather forecast before your trip</em>, kết hợp cấu trúc <em>It’s better to pack... while ... are better for winter</em> và <em>Don’t forget to wear...</em>',
                    '4. <strong>Đoạn 3 (Tham quan):</strong> Mở đoạn bằng <em>When it comes to sightseeing, you shouldn\'t miss...</em> và nhận xét <em>These places offer a good look at Hanoi\'s daily life and history</em>.',
                    '5. <strong>Kết thư thân mật:</strong> <em>I hope you have a wonderful trip! / Best wishes,</em>'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư điện tử thân mật tư vấn du lịch (Informal travel advice email).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Jane (bạn thân); giọng văn tự nhiên, linh hoạt, giàu hình ảnh.',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc ăn điểm Level B2:</strong><ul><li>Giới thiệu chủ đề đoạn văn linh hoạt: <code>For accommodation, I recommend staying...</code> / <code>When it comes to sightseeing, you shouldn\'t miss...</code></li><li>So sánh &amp; đối chiếu trong một câu ghép: <code>It’s better to pack light clothes and an umbrella in summer, while a jacket and warmer clothes are better for winter.</code></li><li>Đánh giá giá trị điểm đến: <code>These places offer a good look at Hanoi\'s daily life and history.</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Hỏi thăm Jane sau một thời gian chưa nói chuyện, bày tỏ niềm vui khi bạn đang lên kế hoạch đi Hà Nội và chia sẻ một số gợi ý giúp bạn chuẩn bị.',
                    '<strong>2. Thân bài 1 — Khu vực lưu trú (Ý 1):</strong> Khuyên ở trong hoặc gần khu Phố Cổ (<em>the Old Quarter</em>) vì có rất nhiều khách sạn, quán cà phê, nhà hàng, nằm trong khoảng cách đi bộ tới Hồ Hoàn Kiếm (<em>within walking distance of Hoan Kiem Lake</em>) và rất tuyệt để thử món ăn địa phương.',
                    '<strong>3. Thân bài 2 — Thời tiết &amp; Hành lý (Ý 2):</strong> Nêu Hà Nội có 4 mùa: mùa hè thường nóng ẩm và mưa to (<em>hot and humid, with heavy rain</em>), mùa đông khá lạnh. Khuyên xem dự báo thời tiết (<em>check the weather forecast</em>) trước chuyến đi, mang đồ nhẹ và ô vào mùa hè hoặc áo khoác ấm vào mùa đông, và đừng quên đi giày thoải mái.',
                    '<strong>4. Thân bài 3 — Điểm tham quan không nên bỏ lỡ (Ý 3):</strong> Khi nói đến tham quan (<em>When it comes to sightseeing</em>), khuyên Jane không nên bỏ lỡ (<em>shouldn\'t miss</em>) Hồ Hoàn Kiếm, Phố Cổ và Văn Miếu vì những nơi này mang lại cái nhìn rõ nét về đời sống thường ngày và lịch sử Hà Nội.',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Chúc Jane có một chuyến đi tuyệt vời và ký tên thân mật (<em>Best wishes,</em>).'
                ],
                vocab: [
                    ['within walking distance of', 'prep. phr.', 'trong khoảng cách đi bộ tới', 'It is within walking distance of Hoan Kiem Lake.'],
                    ['plenty of', 'quantifier', 'rất nhiều', 'This area has plenty of hotels, cafés and restaurants.'],
                    ['hot and humid', 'adj. phr.', 'nóng và ẩm', 'Summer is usually hot and humid, with heavy rain.'],
                    ['weather forecast', 'n. phr.', 'dự báo thời tiết', 'That’s why you should check the weather forecast before your trip.'],
                    ['pack light clothes', 'v. phr.', 'xếp/mang theo quần áo mỏng nhẹ', 'It’s better to pack light clothes and an umbrella in summer.'],
                    ['when it comes to sightseeing', 'idiom/phr.', 'khi nói đến việc tham quan', 'When it comes to sightseeing, you shouldn\'t miss Hoan Kiem Lake...'],
                    ['shouldn\'t miss', 'v. phr.', 'không nên bỏ lỡ', '...you shouldn\'t miss Hoan Kiem Lake, the Old Quarter and the Temple of Literature.'],
                    ['offer a good look at', 'v. phr.', 'mang lại cái nhìn rõ nét về', 'These places offer a good look at Hanoi\'s daily life and history.']
                ],
                upgrades: [
                    ['Mở thư', 'Here are a few tips for your trip.', '<strong>I\'d like to share a few suggestions to help you prepare.</strong>'],
                    ['Lưu trú', 'close to Hoan Kiem Lake, so you can visit many places on foot', '<strong>within walking distance of Hoan Kiem Lake</strong>'],
                    ['Thời tiết &amp; Đồ đạc', 'hot and rainy / bring light clothes', '<strong>hot and humid, with heavy rain</strong> / <strong>check the weather forecast</strong> / <strong>It’s better to pack light clothes...</strong>'],
                    ['Tham quan', 'Finally, there are some interesting places you should visit.', '<strong>When it comes to sightseeing, you shouldn\'t miss...</strong> / <strong>offer a good look at Hanoi\'s daily life and history</strong>']
                ],
                tipTitle: 'Mẹo nâng band điểm từ B1 lên B2',
                tipText: 'Sử dụng cụm <strong>within walking distance of [địa điểm]</strong> (thay cho <em>close to ... so you can walk</em>) và mở đoạn bằng <strong>When it comes to sightseeing, you shouldn\'t miss...</strong> giúp bài viết tự nhiên và bám sát từ vựng trong đề bài.'
            }
        },
        '4': {
            numLabel: 'Đề 4',
            taskTitle: 'Write an email to your friend about moving to a new home',
            placeholder: 'Dear Alex,\n\nViết bài của bạn ở đây…',
            promptEn: 'Your friend is moving to a new home soon and has asked about your recent moving experience. Write an email to your friend. In your email, you should:',
            promptVi: 'Người bạn của bạn sắp chuyển đến một ngôi nhà mới và đã hỏi về kinh nghiệm chuyển nhà gần đây của bạn. Hãy viết một email cho người bạn của mình. Trong email, bạn nên:',
            bullets: [
                {
                    en: 'describe one difficulty you faced while moving',
                    vi: 'miêu tả một khó khăn mà bạn đã gặp phải trong quá trình chuyển nhà'
                },
                {
                    en: 'recommend a useful moving or transport service',
                    vi: 'gợi ý một dịch vụ chuyển nhà hoặc vận chuyển hữu ích'
                },
                {
                    en: 'give practical advice for making the move easier',
                    vi: 'đưa ra lời khuyên thực tế để giúp việc chuyển nhà dễ dàng hơn'
                }
            ],
            footerEn: 'Write at least 120 words. You do not need to include your name or addresses. Your response will be evaluated in terms of Task Fulfillment, Organization, Vocabulary and Grammar.',
            footerVi: 'Viết ít nhất 120 từ. Bạn không cần ghi tên hoặc địa chỉ của mình. Bài viết của bạn sẽ được đánh giá dựa trên các tiêu chí: Mức độ hoàn thành yêu cầu đề bài (Task Fulfillment), Bố cục (Organization), Từ vựng (Vocabulary) và Ngữ pháp (Grammar).',
            sampleB1: [
                '<strong>Dear Alex,</strong>',
                'How are you doing? I hope you’re doing well. I heard that you\'re moving to a new home soon. I’ve recently moved to a new house too, so I\'d like to share my experience with you.',
                'When I moved, my biggest problem was packing my belongings. I had too many things, and some boxes were very heavy. It took me a lot of time to prepare everything.',
                'For transport, I recommend using a local moving service. They can provide a truck and help you carry heavy furniture, so you don\'t have to do everything yourself.',
                'To make your move easier, you should start packing a few days early. You should also put similar items in the same box and write their names on the boxes. Finally, you should keep important things, such as clothes and personal documents, in a separate bag.',
                'I hope these tips are helpful. Good luck with your new home!',
                '<strong>Best wishes,</strong>'
            ],
            sampleB2: [
                '<strong>Dear Alex,</strong>',
                'It’s been a long time since we last talked. How have you been? I heard that you\'re moving to a new place soon. Since I moved house a few months ago, I\'d like to share some useful tips based on my experience.',
                'The biggest difficulty I faced was packing all my belongings. I had more things than I expected, and some boxes were too heavy to carry. As a result, the moving process took longer than planned.',
                'For transportation, I\'d recommend hiring a professional moving service. They provide a truck and workers to help you move large furniture and heavy boxes. This can save you a lot of time and effort.',
                'To make the process easier, you should start packing at least a few days in advance. It\'s also important to group similar items together and label each box clearly. Also, you should keep essential items, such as clothes and important documents, in a separate bag so you can find them easily.',
                'I hope everything goes smoothly. Enjoy your new home!',
                '<strong>Best wishes,</strong>'
            ],
            b1: {
                titleEn: 'Moving House Experience & Advice — Level B1',
                titleVi: 'Gợi ý từ vựng, cấu trúc và dàn ý trình độ B1',
                intro: 'Ở trình độ <strong>Level B1</strong>, bạn cần chú ý kết hợp đúng <strong>thì quá khứ đơn</strong> khi kể lại khó khăn mình đã gặp phải lúc chuyển nhà (<em>When I moved, my biggest problem was...</em>) và các cấu trúc khuyên bảo ở hiện tại (<em>I recommend + V-ing, you should + V</em>).',
                stepsHeader: 'Bố cục bức thư gửi bạn (Level B1) gồm 5 phần:',
                steps: [
                    '1. <strong>Mở thư:</strong> Chào Alex, hỏi thăm sức khỏe, nhắc tin bạn sắp chuyển nhà và cho biết mình cũng mới chuyển nhà gần đây để chia sẻ kinh nghiệm.',
                    '2. <strong>Đoạn 1 (Khó khăn đã gặp):</strong> Kể lại vấn đề lớn nhất là đóng gói đồ đạc (<em>packing my belongings</em>) vì có quá nhiều đồ, thùng nặng và mất nhiều thời gian chuẩn bị.',
                    '3. <strong>Đoạn 2 (Gợi ý dịch vụ vận chuyển):</strong> Khuyên dùng dịch vụ chuyển nhà địa phương (<em>a local moving service</em>) vì họ có xe tải (<em>provide a truck</em>) và giúp khiêng đồ nội thất nặng (<em>carry heavy furniture</em>).',
                    '4. <strong>Đoạn 3 (Lời khuyên thực tế):</strong> Khuyên đóng gói sớm vài ngày (<em>start packing a few days early</em>), xếp đồ giống nhau vào cùng thùng, ghi tên lên thùng và để đồ quan trọng như quần áo, giấy tờ cá nhân (<em>personal documents</em>) ở túi riêng (<em>in a separate bag</em>).',
                    '5. <strong>Kết thư:</strong> Chúc các mẹo hữu ích, chúc may mắn với ngôi nhà mới và ký tên (<em>Best wishes,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư thân mật chia sẻ trải nghiệm cá nhân và đưa lời khuyên (Informal advice email).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Bạn bè (đề không cho sẵn tên nên tự đặt một tên tiếng Anh như <em>Alex</em>); giọng văn thân mật, gần gũi.',
                    '<strong>3 yêu cầu bắt buộc trong đề:</strong><ul><li>Miêu tả một khó khăn đã gặp khi chuyển nhà (<em>describe one difficulty you faced while moving</em>) → dùng thì <strong>Quá khứ đơn</strong>.</li><li>Gợi ý dịch vụ chuyển nhà hoặc vận chuyển hữu ích (<em>recommend a useful moving or transport service</em>).</li><li>Đưa lời khuyên thực tế giúp việc chuyển nhà dễ hơn (<em>give practical advice for making the move easier</em>).</li></ul>',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc B1:</strong><ul><li>Kể lại khó khăn ở quá khứ: <code>When I moved, my biggest problem was + V-ing...</code> / <code>It took me a lot of time to + V...</code></li><li>Gợi ý dịch vụ: <code>For transport, I recommend using...</code></li><li>Đưa lời khuyên theo trình tự: <code>To make your move easier, you should...</code> / <code>You should also...</code> / <code>Finally, you should...</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Chào Alex, hỏi thăm sức khỏe, nhắc tin Alex sắp chuyển nhà và cho biết mình cũng mới chuyển sang nhà mới gần đây nên muốn chia sẻ kinh nghiệm.',
                    '<strong>2. Thân bài 1 — Khó khăn khi chuyển nhà (Ý 1):</strong> Kể lại khó khăn lớn nhất của mình là đóng gói đồ đạc vì có quá nhiều thứ và một số thùng rất nặng nên tốn rất nhiều thời gian để chuẩn bị mọi thứ.',
                    '<strong>3. Thân bài 2 — Gợi ý dịch vụ vận chuyển (Ý 2):</strong> Khuyên sử dụng dịch vụ chuyển nhà địa phương vì họ cung cấp xe tải và giúp khuân vác đồ nội thất nặng nên bạn không phải tự làm hết mọi việc.',
                    '<strong>4. Thân bài 3 — Lời khuyên thực tế (Ý 3):</strong> Khuyên bắt đầu đóng gói sớm vài ngày, xếp các món đồ tương tự vào cùng một thùng và ghi tên lên thùng; cuối cùng nên để các đồ quan trọng như quần áo và giấy tờ cá nhân trong một túi riêng.',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Hy vọng những mẹo trên hữu ích, chúc bạn may mắn với ngôi nhà mới và ký tên thân mật (<em>Best wishes,</em>).'
                ],
                vocab: [
                    ['pack my belongings', 'v. phr.', 'đóng gói đồ đạc cá nhân', 'When I moved, my biggest problem was packing my belongings.'],
                    ['local moving service', 'n. phr.', 'dịch vụ chuyển nhà địa phương', 'For transport, I recommend using a local moving service.'],
                    ['carry heavy furniture', 'v. phr.', 'khiêng đồ nội thất nặng', 'They can provide a truck and help you carry heavy furniture.'],
                    ['start packing early', 'v. phr.', 'bắt đầu đóng gói sớm', 'To make your move easier, you should start packing a few days early.'],
                    ['similar items', 'n. phr.', 'những món đồ tương tự nhau', 'You should also put similar items in the same box.'],
                    ['personal documents', 'n. phr.', 'giấy tờ cá nhân', '...keep important things, such as clothes and personal documents, in a separate bag.'],
                    ['separate bag', 'n. phr.', 'túi riêng biệt', '...in a separate bag.']
                ],
                tipTitle: 'Lưu ý quan trọng về thì của động từ ở Đề 4',
                tipText: 'Ý thứ nhất yêu cầu kể về khó khăn <strong>bạn đã gặp phải</strong> (<em>one difficulty you faced</em>), vì vậy đoạn thân bài 1 bắt buộc phải chia ở <strong>thì Quá khứ đơn</strong> (<em>moved, was, had, were, took</em>), sau đó đoạn 2 và 3 mới chuyển sang hiện tại để đưa lời khuyên.'
            },
            b2: {
                titleEn: 'Moving House Experience & Advice — Level B2',
                titleVi: 'Gợi ý từ vựng nâng cao, cấu trúc tự nhiên và dàn ý trình độ B2',
                intro: 'Ở trình độ <strong>Level B2</strong>, bài viết nâng cấp cách diễn đạt trải nghiệm và lời khuyên bằng các cụm từ tự nhiên, chuẩn xác như <em>based on my experience, too heavy to carry, took longer than planned, hiring a professional moving service, save you a lot of time and effort, in advance, label each box clearly</em>.',
                stepsHeader: 'Các điểm nâng cấp giúp bài viết đạt chuẩn Level B2:',
                steps: [
                    '1. <strong>Mở thư tự nhiên:</strong> Dùng mệnh đề chỉ nguyên nhân <em>Since I moved house a few months ago, I\'d like to share some useful tips based on my experience</em>.',
                    '2. <strong>Đoạn 1 (Khó khăn):</strong> Mở đoạn bằng <em>The biggest difficulty I faced was packing all my belongings</em>, dùng <em>more things than I expected</em>, <em>too heavy to carry</em> và <em>As a result, the moving process took longer than planned</em>.',
                    '3. <strong>Đoạn 2 (Dịch vụ vận chuyển):</strong> Nâng cấp lên <em>hiring a professional moving service</em> và nêu lợi ích <em>This can save you a lot of time and effort</em>.',
                    '4. <strong>Đoạn 3 (Mẹo thực tế):</strong> Dùng <em>at least a few days in advance</em>, <em>group similar items together and label each box clearly</em>, <em>keep essential items ... in a separate bag</em>.',
                    '5. <strong>Kết thư tự nhiên:</strong> <em>I hope everything goes smoothly. Enjoy your new home! / Best wishes,</em>'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư thân mật chia sẻ kinh nghiệm và lời khuyên thực tế (Informal advice email).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Bạn thân (Alex); giọng văn tự nhiên, mạch lạc, kết hợp nhuần nhuyễn quá khứ đơn và cấu trúc khuyên bảo.',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc ăn điểm Level B2:</strong><ul><li>Mệnh đề quan hệ rút gọn &amp; cấu trúc <em>too... to...</em>: <code>The biggest difficulty I faced was...</code> / <code>some boxes were too heavy to carry.</code></li><li>Liên từ chỉ nguyên nhân - kết quả: <code>Since I moved house a few months ago,...</code> / <code>As a result, the moving process took longer than planned.</code></li><li>Cấu trúc khuyên bảo đa dạng: <code>I\'d recommend hiring...</code> / <code>It\'s also important to group... and label...</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Hỏi thăm bạn sau một thời gian chưa trò chuyện, nhắc tin bạn sắp chuyển chỗ ở mới và chia sẻ những mẹo hữu ích dựa trên kinh nghiệm chuyển nhà vài tháng trước của mình.',
                    '<strong>2. Thân bài 1 — Khó khăn từng gặp phải (Ý 1):</strong> Nêu khó khăn lớn nhất từng đối mặt là đóng gói toàn bộ đồ đạc vì có nhiều đồ hơn dự kiến và một số thùng quá nặng để bê; kết quả là quá trình chuyển nhà mất nhiều thời gian hơn kế hoạch.',
                    '<strong>3. Thân bài 2 — Gợi ý dịch vụ vận chuyển (Ý 2):</strong> Khuyên thuê dịch vụ chuyển nhà chuyên nghiệp (<em>professional moving service</em>) vì họ cung cấp xe tải và nhân công giúp chuyển đồ nội thất lớn và thùng nặng, giúp tiết kiệm nhiều thời gian và công sức.',
                    '<strong>4. Thân bài 3 — Lời khuyên thực tế (Ý 3):</strong> Khuyên bắt đầu đóng gói trước ít nhất vài ngày (<em>in advance</em>), gom các món đồ tương tự lại với nhau và dán nhãn từng thùng rõ ràng (<em>label each box clearly</em>), đồng thời để các vật dụng thiết yếu như quần áo và giấy tờ quan trọng vào túi riêng để dễ tìm.',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Chúc mọi việc diễn ra suôn sẻ (<em>goes smoothly</em>), chúc bạn tận hưởng ngôi nhà mới và ký tên (<em>Best wishes,</em>).'
                ],
                vocab: [
                    ['based on my experience', 'prep. phr.', 'dựa trên kinh nghiệm của mình', 'I\'d like to share some useful tips based on my experience.'],
                    ['the moving process', 'n. phr.', 'quá trình chuyển nhà', 'As a result, the moving process took longer than planned.'],
                    ['hire a professional moving service', 'v. phr.', 'thuê dịch vụ chuyển nhà chuyên nghiệp', 'I\'d recommend hiring a professional moving service.'],
                    ['save time and effort', 'v. phr.', 'tiết kiệm thời gian và công sức', 'This can save you a lot of time and effort.'],
                    ['in advance', 'prep. phr.', 'trước (về mặt thời gian)', 'You should start packing at least a few days in advance.'],
                    ['group similar items together', 'v. phr.', 'gom các món đồ giống nhau lại', 'It\'s also important to group similar items together...'],
                    ['label each box clearly', 'v. phr.', 'dán nhãn từng thùng rõ ràng', '...and label each box clearly.'],
                    ['essential items', 'n. phr.', 'những vật dụng thiết yếu', 'You should keep essential items in a separate bag.'],
                    ['go smoothly', 'v. phr.', 'diễn ra suôn sẻ', 'I hope everything goes smoothly.']
                ],
                upgrades: [
                    ['Mở thư', 'share my experience with you', '<strong>share some useful tips based on my experience</strong>'],
                    ['Khó khăn', 'my biggest problem / It took me a lot of time', '<strong>The biggest difficulty I faced</strong> / <strong>As a result, the moving process took longer than planned</strong>'],
                    ['Dịch vụ', 'using a local moving service / so you don\'t have to do everything yourself', '<strong>hiring a professional moving service</strong> / <strong>This can save you a lot of time and effort</strong>'],
                    ['Đóng gói', 'a few days early / put similar items in the same box and write their names', '<strong>at least a few days in advance</strong> / <strong>group similar items together and label each box clearly</strong>'],
                    ['Kết thư', 'Good luck with your new home!', '<strong>I hope everything goes smoothly. Enjoy your new home!</strong>']
                ],
                tipTitle: 'Mẹo nâng band điểm từ B1 lên B2',
                tipText: 'Thay các động từ đơn giản bằng các cụm từ chính xác hơn như <strong>group similar items together</strong> (thay cho <em>put similar items in the same box</em>), <strong>label each box clearly</strong> (thay cho <em>write their names on the boxes</em>) và <strong>in advance</strong> (thay cho <em>early</em>) giúp bài viết đạt chuẩn từ vựng B2.'
            }
        },
        '5': {
            numLabel: 'Đề 5',
            taskTitle: 'Write an advice email to Harry about his summer holiday',
            placeholder: 'Dear Harry,\n\nViết bài của bạn ở đây…',
            promptEn: 'Your friend Harry is deciding how to spend his summer and is considering either learning a musical instrument or taking up a sport. Write an email to Harry. In your email, you should:',
            promptVi: 'Người bạn của bạn là Harry đang quyết định xem nên trải qua mùa hè của mình như thế nào và đang cân nhắc giữa việc học một nhạc cụ hoặc bắt đầu chơi một môn thể thao. Hãy viết một email cho Harry. Trong email, bạn nên:',
            bullets: [
                {
                    en: 'describe your own plans for the summer holiday',
                    vi: 'miêu tả kế hoạch của chính bạn cho kỳ nghỉ hè'
                },
                {
                    en: 'recommend one of the two choices and explain why',
                    vi: 'khuyên chọn một trong hai lựa chọn trên và giải thích lý do tại sao'
                },
                {
                    en: 'suggest how he can get started',
                    vi: 'gợi ý cách để anh ấy có thể bắt đầu'
                }
            ],
            footerEn: 'Write at least 120 words. You do not need to include your name or addresses. Your response will be evaluated in terms of Task Fulfillment, Organization, Vocabulary and Grammar.',
            footerVi: 'Viết ít nhất 120 từ. Bạn không cần ghi tên hoặc địa chỉ của mình. Bài viết của bạn sẽ được đánh giá dựa trên các tiêu chí: Mức độ hoàn thành yêu cầu đề bài (Task Fulfillment), Bố cục (Organization), Từ vựng (Vocabulary) và Ngữ pháp (Grammar).',
            sampleB1: [
                '<strong>Dear Harry,</strong>',
                'How are you doing? I hope you’re doing well. I heard that you\'re thinking about what to do this summer. I\'d like to share my plans and give you some advice.',
                'This summer, I plan to visit my grandparents in the countryside for a week. I will also spend some time with my friends and play badminton in the evenings.',
                'As for your choice, I think you should take up a sport, especially badminton. It is fun and good for your health. You can also play with your friends, so you won\'t feel bored or lonely.',
                'To get started, you should find a badminton court near your home. You can also ask a friend to play with you. In addition, you should buy a racket and some shuttlecocks. You don\'t need to play for long at first. Two or three sessions a week are enough.',
                'I hope you enjoy your summer holiday!',
                '<strong>Best wishes,</strong>'
            ],
            sampleB2: [
                '<strong>Dear Harry,</strong>',
                'It’s been a long time since we last talked. How have you been? I heard that you\'re still deciding how to spend your summer holiday. Let me share my plans and a few suggestions.',
                'As for me, I\'m planning to spend a week visiting my grandparents in the countryside. After that, I\'ll meet up with my friends and play badminton in the evenings. I think it\'s a great way to relax after a busy school year.',
                'Regarding your choice, I recommend taking up a sport, particularly badminton. It helps you feel refreshed, stay in shape and reduce stress. Not only that, you can enjoy the activity with your friends instead of spending too much time at home.',
                'To get started, you could look for a badminton court near your home. You should also get a racket and some shuttlecocks. It\'s better to start with two or three practice sessions a week and gradually improve your skills.',
                'I hope you find a hobby you really enjoy!',
                '<strong>Best wishes,</strong>'
            ],
            b1: {
                titleEn: 'Summer Holiday Plans & Advice — Level B1',
                titleVi: 'Gợi ý từ vựng, cấu trúc và dàn ý trình độ B1',
                intro: 'Ở trình độ <strong>Level B1</strong>, bạn cần chia sẻ kế hoạch nghỉ hè của bản thân (dùng <em>I plan to + V, I will + V</em>), sau đó khuyên Harry chọn một trong hai hoạt động (ví dụ: chơi thể thao / cầu lông) kèm lý do và hướng dẫn các bước cụ thể để bắt đầu.',
                stepsHeader: 'Bố cục bức thư gửi Harry (Level B1) gồm 5 phần:',
                steps: [
                    '1. <strong>Mở thư:</strong> Chào Harry, hỏi thăm sức khỏe, nhắc việc Harry đang suy nghĩ làm gì vào mùa hè và dẫn vào việc chia sẻ kế hoạch của mình kèm lời khuyên.',
                    '2. <strong>Đoạn 1 (Kế hoạch mùa hè của bạn):</strong> Dự định về quê thăm ông bà 1 tuần (<em>visit my grandparents in the countryside</em>), dành thời gian với bạn bè và chơi cầu lông vào buổi tối.',
                    '3. <strong>Đoạn 2 (Khuyên chọn môn thể thao &amp; Lý do):</strong> Khuyên Harry chơi một môn thể thao (<em>take up a sport</em>), đặc biệt là cầu lông vì vui, tốt cho sức khỏe và chơi được cùng bạn bè nên không thấy buồn chán hay cô đơn.',
                    '4. <strong>Đoạn 3 (Gợi ý cách bắt đầu):</strong> Khuyên tìm sân cầu lông gần nhà (<em>find a badminton court near your home</em>), rủ bạn chơi cùng, mua vợt và cầu (<em>buy a racket and some shuttlecocks</em>), chỉ cần tập 2–3 buổi một tuần.',
                    '5. <strong>Kết thư:</strong> Chúc Harry có kỳ nghỉ hè vui vẻ và ký tên (<em>Best wishes,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư điện tử thân mật chia sẻ kế hoạch và cho lời khuyên (Informal advice email).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Harry (bạn bè); giọng văn thân mật, hào hứng, khích lệ.',
                    '<strong>3 yêu cầu bắt buộc trong đề:</strong><ul><li>Miêu tả kế hoạch nghỉ hè của bản thân (<em>describe your own plans for the summer holiday</em>).</li><li>Khuyên chọn 1 trong 2 lựa chọn (học nhạc cụ hoặc chơi thể thao) và giải thích tại sao (<em>recommend one of the two choices and explain why</em>).</li><li>Gợi ý cách bắt đầu (<em>suggest how he can get started</em>).</li></ul>',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc B1:</strong><ul><li>Nêu kế hoạch tương lai: <code>This summer, I plan to + V...</code> / <code>I will also + V...</code></li><li>Đưa lời khuyên &amp; lý do: <code>As for your choice, I think you should take up a sport, especially...</code></li><li>Hướng dẫn cách bắt đầu: <code>To get started, you should...</code> / <code>You can also...</code> / <code>In addition, you should...</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Hỏi thăm sức khỏe Harry, nhắc tin bạn đang băn khoăn làm gì trong mùa hè này và nêu mục đích chia sẻ kế hoạch của mình kèm vài lời khuyên.',
                    '<strong>2. Thân bài 1 — Kế hoạch mùa hè của bản thân (Ý 1):</strong> Kể kế hoạch về quê thăm ông bà 1 tuần, sau đó dành thời gian đi chơi với bạn bè và đánh cầu lông vào các buổi tối.',
                    '<strong>3. Thân bài 2 — Khuyên chọn hoạt động &amp; Giải thích lý do (Ý 2):</strong> Khuyên Harry nên bắt đầu chơi một môn thể thao, đặc biệt là cầu lông vì môn này vui, tốt cho sức khỏe và có thể chơi cùng bạn bè nên sẽ không cảm thấy chán hay cô đơn.',
                    '<strong>4. Thân bài 3 — Cách bắt đầu (Ý 3):</strong> Gợi ý tìm một sân cầu lông gần nhà, rủ một người bạn chơi cùng, mua một cây vợt và vài quả cầu lông; thời gian đầu không cần chơi quá lâu, chỉ cần 2 hoặc 3 buổi một tuần là đủ.',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Chúc Harry tận hưởng kỳ nghỉ hè vui vẻ và ký tên thân mật (<em>Best wishes,</em>).'
                ],
                vocab: [
                    ['in the countryside', 'prep. phr.', 'ở vùng nông thôn / ở quê', 'I plan to visit my grandparents in the countryside for a week.'],
                    ['take up a sport', 'v. phr.', 'bắt đầu chơi một môn thể thao', 'I think you should take up a sport, especially badminton.'],
                    ['good for your health', 'adj. phr.', 'tốt cho sức khỏe', 'It is fun and good for your health.'],
                    ['feel bored or lonely', 'v. phr.', 'cảm thấy buồn chán hoặc cô đơn', 'You can also play with your friends, so you won\'t feel bored or lonely.'],
                    ['badminton court', 'n. phr.', 'sân cầu lông', 'To get started, you should find a badminton court near your home.'],
                    ['racket', 'n.', 'cây vợt (cầu lông, tennis)', 'In addition, you should buy a racket and some shuttlecocks.'],
                    ['shuttlecock', 'n.', 'quả cầu lông', '...buy a racket and some shuttlecocks.'],
                    ['sessions a week', 'n. phr.', 'buổi tập mỗi tuần', 'Two or three sessions a week are enough.']
                ],
                tipTitle: 'Mẹo kết nối ý thông minh ở Đề 5',
                tipText: 'Khi kể kế hoạch mùa hè của bạn ở đoạn 1 có nhắc đến việc chơi cầu lông vào buổi tối (<em>play badminton in the evenings</em>), bạn sẽ dẫn dắt sang đoạn 2 khuyên Harry chọn môn cầu lông một cách vô cùng tự nhiên và mạch lạc!'
            },
            b2: {
                titleEn: 'Summer Holiday Plans & Advice — Level B2',
                titleVi: 'Gợi ý từ vựng nâng cao, cấu trúc tự nhiên và dàn ý trình độ B2',
                intro: 'Ở trình độ <strong>Level B2</strong>, bài viết mở rộng vốn từ chỉ lợi ích thể chất &amp; tinh thần (<em>feel refreshed, stay in shape, reduce stress</em>), dùng cấu trúc nối câu tự nhiên (<em>As for me, Not only that, instead of spending too much time at home, gradually improve your skills</em>).',
                stepsHeader: 'Các điểm nâng cấp giúp bài viết đạt chuẩn Level B2:',
                steps: [
                    '1. <strong>Mở thư tự nhiên:</strong> Dùng <em>I heard that you\'re still deciding how to spend your summer holiday. Let me share my plans and a few suggestions</em>.',
                    '2. <strong>Đoạn 1 (Kế hoạch cá nhân):</strong> Mở đoạn bằng <em>As for me, I\'m planning to spend a week visiting...</em>, dùng <em>meet up with my friends</em> và thêm câu nhận xét <em>I think it\'s a great way to relax after a busy school year</em>.',
                    '3. <strong>Đoạn 2 (Đưa lời khuyên &amp; Lý do):</strong> Dùng <em>Regarding your choice, I recommend taking up a sport, particularly badminton</em>, nêu chuỗi lợi ích <em>feel refreshed, stay in shape and reduce stress</em> cùng cấu trúc <em>Not only that, you can... instead of...</em>',
                    '4. <strong>Đoạn 3 (Cách bắt đầu):</strong> Dùng <em>you could look for a badminton court</em> và <em>It\'s better to start with two or three practice sessions a week and gradually improve your skills</em>.',
                    '5. <strong>Kết thư ấn tượng:</strong> <em>I hope you find a hobby you really enjoy! / Best wishes,</em>'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư điện tử thân mật chia sẻ kế hoạch và tư vấn lựa chọn (Informal advice email).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Harry (bạn thân); giọng văn tự nhiên, giàu sức thuyết phục.',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc ăn điểm Level B2:</strong><ul><li>Diễn đạt kế hoạch tự nhiên: <code>As for me, I\'m planning to spend a week visiting...</code> / <code>After that, I\'ll meet up with...</code></li><li>Cấu trúc song song &amp; bổ sung: <code>It helps you feel refreshed, stay in shape and reduce stress. Not only that, you can... instead of + V-ing...</code></li><li>Khuyên bảo nhẹ nhàng: <code>To get started, you could look for...</code> / <code>It\'s better to start with... and gradually improve...</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Hỏi thăm Harry sau một thời gian chưa nói chuyện, nhắc việc bạn vẫn đang quyết định cách tận hưởng kỳ nghỉ hè và ngỏ ý chia sẻ kế hoạch của mình cùng vài gợi ý.',
                    '<strong>2. Thân bài 1 — Kế hoạch mùa hè của bản thân (Ý 1):</strong> Chia sẻ dự định dành 1 tuần về quê thăm ông bà, sau đó gặp gỡ bạn bè và chơi cầu lông vào buổi tối vì đó là cách tuyệt vời để thư giãn sau một năm học bận rộn.',
                    '<strong>3. Thân bài 2 — Khuyên chọn môn thể thao &amp; Lý do (Ý 2):</strong> Khuyên Harry chọn chơi một môn thể thao, đặc biệt là cầu lông vì giúp cảm thấy sảng khoái (<em>feel refreshed</em>), giữ dáng (<em>stay in shape</em>) và giảm căng thẳng (<em>reduce stress</em>); không những thế còn có thể vui chơi cùng bạn bè thay vì ở nhà quá nhiều.',
                    '<strong>4. Thân bài 3 — Gợi ý cách bắt đầu (Ý 3):</strong> Gợi ý tìm một sân cầu lông gần nhà, chuẩn bị vợt và cầu lông; tốt hơn hết là bắt đầu với 2–3 buổi tập mỗi tuần (<em>practice sessions a week</em>) và dần dần nâng cao kỹ năng (<em>gradually improve your skills</em>).',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Chúc Harry tìm được một sở thích mà bạn thực sự yêu thích và ký tên (<em>Best wishes,</em>).'
                ],
                vocab: [
                    ['spend a week visiting', 'v. phr.', 'dành một tuần để thăm', 'I\'m planning to spend a week visiting my grandparents.'],
                    ['meet up with', 'phr. v.', 'gặp gỡ, tụ tập với', 'After that, I\'ll meet up with my friends.'],
                    ['feel refreshed', 'v. phr.', 'cảm thấy sảng khoái, tươi mới', 'It helps you feel refreshed, stay in shape and reduce stress.'],
                    ['stay in shape', 'idiom/phr.', 'giữ dáng, duy trì thể lực', '...feel refreshed, stay in shape and reduce stress.'],
                    ['reduce stress', 'v. phr.', 'giảm căng thẳng', '...and reduce stress.'],
                    ['practice sessions', 'n. phr.', 'các buổi tập luyện', 'It\'s better to start with two or three practice sessions a week...'],
                    ['gradually improve your skills', 'v. phr.', 'dần dần cải thiện kỹ năng', '...and gradually improve your skills.']
                ],
                upgrades: [
                    ['Kế hoạch hè', 'plan to visit / spend some time with my friends', '<strong>planning to spend a week visiting</strong> / <strong>meet up with my friends</strong> / <strong>a great way to relax after a busy school year</strong>'],
                    ['Lý do chọn', 'fun and good for your health / won\'t feel bored or lonely', '<strong>feel refreshed, stay in shape and reduce stress</strong> / <strong>Not only that, you can enjoy the activity with your friends instead of spending too much time at home</strong>'],
                    ['Cách bắt đầu', 'Two or three sessions a week are enough.', '<strong>It\'s better to start with two or three practice sessions a week and gradually improve your skills.</strong>'],
                    ['Kết thư', 'I hope you enjoy your summer holiday!', '<strong>I hope you find a hobby you really enjoy!</strong>']
                ],
                tipTitle: 'Mẹo nâng band điểm từ B1 lên B2',
                tipText: 'Khi giải thích lý do chọn một môn thể thao, cụm 3 lợi ích song song <strong>feel refreshed, stay in shape and reduce stress</strong> kết hợp với liên từ <strong>Not only that, you can... instead of...</strong> sẽ giúp đoạn văn vừa giàu từ vựng vừa có điểm ngữ pháp cao.'
            }
        }
    };

    function buildLevelGuideHtml(levelKey, data) {
        const isB2 = levelKey === 'B2';
        const badgeClass = isB2 ? 'draft-part-badge badge-b2' : 'draft-part-badge';
        const secI = isB2 ? 'I. Phân tích đề bài &amp; Tiêu chí B2' : 'I. Phân tích đề bài';
        const secII = `II. Dàn ý chi tiết (Level ${levelKey})`;
        const secIII = isB2
            ? 'III. Từ vựng &amp; Collocations trọng tâm (Level B2)'
            : 'III. Từ vựng &amp; Cụm từ trọng tâm (Level B1)';

        const upgradesHtml = (isB2 && data.upgrades && data.upgrades.length > 0) ? `
            <div>
                <h3 class="draft-outline-sec-title">IV. Đối chiếu cách nâng cấp từ Level B1 lên Level B2</h3>
                <div class="draft-theory-table-wrap">
                    <table class="draft-theory-table">
                        <thead>
                            <tr>
                                <th>Phần</th>
                                <th>Cách diễn đạt Level B1</th>
                                <th>Nâng cấp lên Level B2</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.upgrades.map(row => `
                                <tr>
                                    <td class="cell-primary">${row[0]}</td>
                                    <td class="cell-secondary">${row[1]}</td>
                                    <td class="cell-secondary">${row[2]}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : '';

        return `
            <header class="draft-part-heading-block">
                <span class="${badgeClass}">${levelKey}</span>
                <div style="min-width:0;flex:1;">
                    <h2 class="draft-part-title-en">${data.titleEn}</h2>
                    <p class="draft-part-title-vi">${data.titleVi}</p>
                </div>
            </header>

            <div class="draft-theory-prose-block">
                <p class="draft-theory-intro-text">${data.intro}</p>
                <div class="draft-writing-steps-box">
                    <p class="draft-writing-steps-header">${data.stepsHeader}</p>
                    <div class="draft-writing-steps-list">
                        ${data.steps.map(s => `<p class="draft-writing-step-item">${s}</p>`).join('')}
                    </div>
                </div>
            </div>

            <details class="draft-outline-accordion" open>
                <summary class="draft-outline-summary">
                    <span>Gợi ý dàn bài Level ${levelKey}</span>
                </summary>
                <div class="draft-outline-body">
                    <div>
                        <h3 class="draft-outline-sec-title">${secI}</h3>
                        <ul class="draft-theory-bullet-list">
                            ${data.analysis.map(a => `<li>${a}</li>`).join('')}
                        </ul>
                    </div>

                    <div>
                        <h3 class="draft-outline-sec-title">${secII}</h3>
                        <ul class="draft-theory-bullet-list draft-outline-steps">
                            ${data.outline.map(o => `<li>${o}</li>`).join('')}
                        </ul>
                    </div>

                    <div>
                        <h3 class="draft-outline-sec-title">${secIII}</h3>
                        <div class="draft-theory-table-wrap">
                            <table class="draft-theory-table">
                                <thead>
                                    <tr>
                                        <th>Từ / Cụm từ</th>
                                        <th>Loại từ</th>
                                        <th>Nghĩa tiếng Việt</th>
                                        <th>${data.exampleColHeader || 'Ví dụ trong bài'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.vocab.map(row => `
                                        <tr>
                                            <td class="cell-primary">${row[0]}</td>
                                            <td class="cell-secondary">${row[1]}</td>
                                            <td class="cell-secondary">${row[2]}</td>
                                            <td class="cell-secondary">${row[3]}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    ${upgradesHtml}
                </div>
            </details>

            <div class="draft-callout-box">
                <p class="draft-callout-title">
                    <i class="far fa-lightbulb"></i>
                    <span>${data.tipTitle}</span>
                </p>
                <div>${data.tipText}</div>
            </div>
        `;
    }

    function getAdviceStorageKey(promptId) {
        const base = promptId === '1'
            ? 'vstep_advice_jay_online_shopping_draft'
            : `vstep_advice_draft_prompt_${promptId}`;
        return getUserScopedKey(base);
    }

    function getAdviceSubmittedKey(promptId) {
        return getUserScopedKey(`vstep_advice_submitted_prompt_${promptId}`);
    }

    function getAdviceLessonId(promptId) {
        return `advice-${String(promptId || currentAdvicePromptId)}`;
    }

    function updateAdviceHeaderTag() {
        const pData = ADVICE_PROMPTS_DATA[currentAdvicePromptId];
        if (adviceCurrentLevelTag && pData) {
            adviceCurrentLevelTag.textContent = ` · ${pData.numLabel} · Level ${currentAdviceLevel}`;
        }
    }

    // 16.1 Level B1 / Level B2 Switcher
    adviceLevelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const level = btn.getAttribute('data-advice-level');
            currentAdviceLevel = level === 'B2' ? 'B2' : 'B1';
            adviceLevelBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (currentAdviceLevel === 'B2') {
                if (adviceGuideB1) adviceGuideB1.style.display = 'none';
                if (adviceGuideB2) adviceGuideB2.style.display = 'flex';
            } else {
                if (adviceGuideB1) adviceGuideB1.style.display = 'flex';
                if (adviceGuideB2) adviceGuideB2.style.display = 'none';
            }

            updateAdviceHeaderTag();

            if (adviceTheoryScrollPane) {
                adviceTheoryScrollPane.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });

    // 16.2 Draggable Split-Screen Resizer
    attachSplitResizer(adviceResizer, adviceWorkspace, 30, 70);

    // 16.3 Toggle Prompt Translation
    const togglePromptTransBtn = document.getElementById('advice-toggle-prompt-trans-btn');
    const advicePromptCard = document.getElementById('advice-prompt-card');
    if (togglePromptTransBtn && advicePromptCard) {
        togglePromptTransBtn.addEventListener('click', () => {
            const isShown = advicePromptCard.classList.toggle('show-vi');
            togglePromptTransBtn.classList.toggle('active', isShown);
            const span = togglePromptTransBtn.querySelector('span');
            if (span) {
                span.textContent = isShown ? 'Ẩn dịch đề' : 'Dịch đề bài';
            }
        });
    }

    // 16.5 Countdown Timer (20:00)
    const adviceTimerBtn = document.getElementById('advice-timer-btn');
    const adviceTimerDisplay = document.getElementById('advice-timer-display');
    bindCountdownTimer(adviceTimerBtn, adviceTimerDisplay, 20 * 60, 120);

    // 16.6 Live Word Counter, Prompt Switcher (5 Đề), LocalStorage Draft & Submit / Sample Comparison
    const adviceTextarea = document.getElementById('advice-writing-textarea');
    const adviceWcEl = document.getElementById('advice-writing-wc');
    const adviceStatusEl = document.getElementById('advice-writing-status');
    const adviceSubmitBtn = document.getElementById('advice-submit-btn');
    const adviceResetBtn = document.getElementById('advice-reset-btn');
    const advicePeekSampleBtn = document.getElementById('advice-peek-sample-btn');
    const adviceFeedbackBox = document.getElementById('advice-writing-feedback');
    const adviceTeacherFeedbackBox = document.getElementById('advice-teacher-feedback-box');
    const adviceFeedbackTitle = document.getElementById('advice-feedback-title');
    const adviceFbTabs = document.querySelectorAll('[data-fb-level]');
    const adviceFbSampleB1 = document.getElementById('advice-fb-sample-B1');
    const adviceFbSampleB2 = document.getElementById('advice-fb-sample-B2');

    let isCurrentAdviceSubmitted = false;

    function countWordsClean(text) {
        const s = String(text || '');
        let count = 0;
        let inWord = false;
        for (let i = 0; i < s.length; i++) {
            const code = s.charCodeAt(i);
            const isWs = code === 32 || code === 10 || code === 13 || code === 9 || /\s/.test(s[i]);
            if (isWs) {
                inWord = false;
            } else if (!inWord) {
                inWord = true;
                count++;
            }
        }
        return count;
    }

    function getAdviceMinWords() {
        return parseInt((adviceTextarea && adviceTextarea.getAttribute('data-min-words')) || '120', 10);
    }

    function checkStoredAdviceSubmitted(promptId, draftText) {
        const minW = getAdviceMinWords();
        if (countWordsClean(draftText) < minW) return false;
        try {
            return localStorage.getItem(getAdviceSubmittedKey(promptId)) === '1';
        } catch (e) {
            return false;
        }
    }

    function populateAdviceSamples(promptId, allowShow) {
        const pData = ADVICE_PROMPTS_DATA[promptId];
        if (!allowShow || !pData) {
            if (adviceFbSampleB1) adviceFbSampleB1.innerHTML = '';
            if (adviceFbSampleB2) adviceFbSampleB2.innerHTML = '';
            return;
        }
        if (adviceFbSampleB1) {
            adviceFbSampleB1.innerHTML = pData.sampleB1.map(p => `<p>${p}</p>`).join('');
        }
        if (adviceFbSampleB2) {
            adviceFbSampleB2.innerHTML = pData.sampleB2.map(p => `<p>${p}</p>`).join('');
        }
    }

    function syncAdviceSampleUI(revealSample = false) {
        const canViewSample = isCurrentAdviceSubmitted || canPreviewSampleWithoutSubmit();
        if (!canViewSample) {
            populateAdviceSamples(currentAdvicePromptId, false);
            if (adviceFeedbackBox) {
                adviceFeedbackBox.style.display = 'none';
            }
            if (advicePeekSampleBtn) {
                advicePeekSampleBtn.disabled = true;
                advicePeekSampleBtn.classList.add('locked');
                advicePeekSampleBtn.innerHTML = '<i class="fas fa-lock"></i> Xem bài mẫu';
                advicePeekSampleBtn.title = 'Hãy viết đủ 120 từ và bấm Nộp bài để mở khóa bài mẫu';
            }
            if (adviceSubmitBtn && !authState.isSubmittingAdvice) {
                adviceSubmitBtn.textContent = 'Nộp bài';
            }
            return;
        }

        populateAdviceSamples(currentAdvicePromptId, true);
        const wc = countWordsClean(adviceTextarea ? adviceTextarea.value : '');
        if (adviceFeedbackTitle) {
            adviceFeedbackTitle.textContent = isCurrentAdviceSubmitted
                ? `✓ Đã nộp bài viết (${wc} từ)! Đối chiếu với bài mẫu chuẩn:`
                : '👁️ Chế độ Admin · Xem trước bài mẫu chuẩn:';
        }
        if (adviceFeedbackBox) {
            adviceFeedbackBox.style.display = revealSample ? 'block' : 'none';
        }
        if (advicePeekSampleBtn) {
            advicePeekSampleBtn.disabled = false;
            advicePeekSampleBtn.classList.remove('locked');
            advicePeekSampleBtn.innerHTML = revealSample
                ? '<i class="fas fa-eye-slash"></i> Ẩn bài mẫu'
                : '<i class="fas fa-eye"></i> Xem bài mẫu';
            advicePeekSampleBtn.title = isCurrentAdviceSubmitted
                ? 'Ẩn / Hiện bài mẫu đối chiếu'
                : 'Chế độ Admin: Xem trước bài mẫu không cần nộp bài';
        }
        if (adviceSubmitBtn && !authState.isSubmittingAdvice) {
            adviceSubmitBtn.textContent = isCurrentAdviceSubmitted ? 'Nộp lại' : 'Nộp bài';
        }
    }

    function updateAdviceWordState() {
        if (!adviceTextarea) return;
        const minW = getAdviceMinWords();
        const wc = countWordsClean(adviceTextarea.value);
        const needed = Math.max(0, minW - wc);
        const canSubmit = wc >= minW;
        const cloudSub = getCloudSubmission(getAdviceLessonId(currentAdvicePromptId));

        if (adviceWcEl) {
            adviceWcEl.textContent = `${wc} từ`;
        }
        if (adviceStatusEl) {
            if (cloudSub && cloudSub.is_submitted) {
                adviceStatusEl.textContent = canSubmit
                    ? `✓ Đã nộp cho Giáo viên (${wc} từ) · Đã mở khóa bài mẫu`
                    : `${wc}/${minW} từ · cần thêm ${needed} từ để nộp bản sửa mới`;
            } else if (isCurrentAdviceSubmitted) {
                adviceStatusEl.textContent = canSubmit
                    ? `✓ Đã nộp (${wc} từ) · Đã mở khóa bài mẫu`
                    : `${wc}/${minW} từ · cần thêm ${needed} từ để nộp lại`;
            } else if (canPreviewSampleWithoutSubmit()) {
                adviceStatusEl.textContent = canSubmit
                    ? `${wc}/${minW} từ · Đủ điều kiện nộp bài · Admin có thể xem trước bài mẫu`
                    : `${wc}/${minW} từ · Admin có thể xem trước bài mẫu không cần nộp bài`;
            } else {
                adviceStatusEl.textContent = canSubmit
                    ? `${wc}/${minW} từ · Đủ điều kiện — bấm Nộp bài để gửi Giáo viên & xem bài mẫu`
                    : `${wc}/${minW} từ · cần thêm ${needed} từ để nộp & xem bài mẫu`;
            }
            adviceStatusEl.classList.toggle('ready', canSubmit || isCurrentAdviceSubmitted || Boolean(cloudSub && cloudSub.is_submitted));
        }
        if (adviceSubmitBtn) {
            adviceSubmitBtn.disabled = !canSubmit || authState.isSubmittingAdvice;
            adviceSubmitBtn.classList.toggle('unanswered', !canSubmit);
        }
    }

    function selectAdvicePrompt(promptId, options = {}) {
        const { skipScroll = false } = options;
        const pData = ADVICE_PROMPTS_DATA[promptId];
        if (!pData) return;
        currentAdvicePromptId = String(promptId);

        // Sync dropdown & numbered pills
        if (advicePromptSelect) {
            advicePromptSelect.value = currentAdvicePromptId;
        }
        advicePromptNumBtns.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-advice-prompt') === currentAdvicePromptId);
        });

        // Update Left Pane B1 & B2 Guides
        if (adviceGuideB1) {
            adviceGuideB1.innerHTML = buildLevelGuideHtml('B1', pData.b1);
        }
        if (adviceGuideB2) {
            adviceGuideB2.innerHTML = buildLevelGuideHtml('B2', pData.b2);
        }

        // Update Right Pane Task Title & Prompt Card
        if (adviceExNumPill) {
            adviceExNumPill.textContent = pData.numLabel;
        }
        if (adviceExTitle) {
            adviceExTitle.textContent = pData.taskTitle;
        }
        if (advicePromptCard) {
            advicePromptCard.innerHTML = `
                <p class="draft-prompt-para">${pData.promptEn}</p>
                <p class="draft-prompt-vi">${pData.promptVi}</p>
                <ul class="draft-prompt-bullets">
                    ${pData.bullets.map(b => `
                        <li>
                            <span>${b.en}</span>
                            <span class="draft-prompt-vi">${b.vi}</span>
                        </li>
                    `).join('')}
                </ul>
                <p class="draft-prompt-footer-note">${pData.footerEn}</p>
                <p class="draft-prompt-vi">${pData.footerVi}</p>
            `;
        }

        // Load saved draft & cloud submission state for this prompt
        const cloudSub = getCloudSubmission(getAdviceLessonId(currentAdvicePromptId));
        let saved = '';
        if (adviceTextarea) {
            adviceTextarea.placeholder = pData.placeholder;
            try {
                saved = localStorage.getItem(getAdviceStorageKey(currentAdvicePromptId)) || '';
            } catch (e) {}
            if (!saved && cloudSub && cloudSub.content) {
                saved = cloudSub.content;
            }
            adviceTextarea.value = saved;
        }

        isCurrentAdviceSubmitted = Boolean(cloudSub && cloudSub.is_submitted) || checkStoredAdviceSubmitted(currentAdvicePromptId, saved);
        syncAdviceSampleUI(false);
        renderTeacherFeedbackBox(adviceTeacherFeedbackBox, cloudSub);
        updateAdviceWordState();
        updateAdviceHeaderTag();

        if (!skipScroll) {
            if (adviceTheoryScrollPane) {
                adviceTheoryScrollPane.scrollTo({ top: 0, behavior: 'smooth' });
            }
            const exScrollPane = document.getElementById('advice-exercises-scroll-pane');
            if (exScrollPane) {
                exScrollPane.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }

    if (advicePromptSelect) {
        advicePromptSelect.addEventListener('change', (e) => {
            draftSaver.flush();
            selectAdvicePrompt(e.target.value);
        });
    }

    advicePromptNumBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            draftSaver.flush();
            selectAdvicePrompt(btn.getAttribute('data-advice-prompt'));
        });
    });

    if (adviceTextarea) {
        adviceTextarea.addEventListener('input', () => {
            updateAdviceWordState();
            draftSaver.schedule(getAdviceStorageKey(currentAdvicePromptId), adviceTextarea.value);
        });
        adviceTextarea.addEventListener('blur', () => draftSaver.flush());
    }

    if (adviceSubmitBtn && adviceFeedbackBox) {
        adviceSubmitBtn.addEventListener('click', async () => {
            const minW = getAdviceMinWords();
            const content = adviceTextarea ? adviceTextarea.value.trim() : '';
            const wc = countWordsClean(content);
            if (wc < minW || authState.isSubmittingAdvice) return;

            const submittedPromptId = currentAdvicePromptId;
            const submittedLevel =
                CLOUD && typeof CLOUD.inferTargetLevelFromClass === 'function'
                    ? CLOUD.inferTargetLevelFromClass(currentAccount && currentAccount.className, currentAdviceLevel)
                    : currentAdviceLevel;
            const pData = ADVICE_PROMPTS_DATA[submittedPromptId];
            const lessonId = getAdviceLessonId(submittedPromptId);
            const existingSub = getCloudSubmission(lessonId);
            if (
                existingSub &&
                existingSub.is_submitted &&
                String(existingSub.content || '').trim() === content &&
                String(existingSub.target_level || 'B1').toUpperCase() === submittedLevel &&
                existingSub.ai_status !== 'error' &&
                existingSub.ai_status !== 'skipped'
            ) {
                if (adviceStatusEl) {
                    adviceStatusEl.textContent = `✓ Bài viết và trình độ Level ${submittedLevel} không thay đổi so với lần nộp trước.`;
                    adviceStatusEl.classList.add('ready');
                }
                return;
            }

            const lessonTitle = getCatalogLessonTitle(
                lessonId,
                pData ? `Task 01 · ${pData.numLabel}: ${pData.taskTitle}` : lessonId
            );
            const promptText = pData
                ? `${pData.promptEn}\n${(pData.bullets || []).map(b => `- ${b.en}`).join('\n')}`
                : '';

            authState.isSubmittingAdvice = true;
            adviceSubmitBtn.disabled = true;
            adviceSubmitBtn.textContent = 'Đang nộp...';

            const res = await submitWritingToCloud({
                taskType: 'task1',
                lessonId,
                lessonTitle,
                promptText,
                content,
                wordCount: wc,
                targetLevel: submittedLevel
            });

            authState.isSubmittingAdvice = false;
            const stillSamePrompt = currentAdvicePromptId === submittedPromptId;

            if (!res.ok) {
                if (stillSamePrompt) {
                    adviceSubmitBtn.disabled = false;
                    adviceSubmitBtn.textContent = isCurrentAdviceSubmitted ? 'Nộp lại' : 'Nộp bài';
                    if (adviceStatusEl) {
                        adviceStatusEl.textContent = `⚠️ Lỗi gửi bài lên Giáo viên: ${res.error}`;
                        adviceStatusEl.classList.remove('ready');
                    }
                }
                return;
            }

            try {
                localStorage.setItem(getAdviceSubmittedKey(submittedPromptId), '1');
            } catch (e) {}

            if (!stillSamePrompt) return;

            isCurrentAdviceSubmitted = true;
            syncAdviceSampleUI(true);
            renderTeacherFeedbackBox(adviceTeacherFeedbackBox, res.row);
            updateAdviceWordState();
            if (adviceTeacherFeedbackBox && adviceTeacherFeedbackBox.style.display !== 'none') {
                adviceTeacherFeedbackBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                adviceFeedbackBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    if (advicePeekSampleBtn && adviceFeedbackBox) {
        advicePeekSampleBtn.addEventListener('click', () => {
            if (!isCurrentAdviceSubmitted && !canPreviewSampleWithoutSubmit()) return;
            const isHidden = adviceFeedbackBox.style.display === 'none' || adviceFeedbackBox.style.display === '';
            syncAdviceSampleUI(isHidden);
            if (isHidden) {
                adviceFeedbackBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    if (adviceResetBtn && adviceTextarea) {
        adviceResetBtn.addEventListener('click', () => {
            if (adviceTextarea.value.trim().length > 0) {
                if (!confirm('Bạn có chắc muốn xoá nội dung đang viết để viết lại từ đầu?')) {
                    return;
                }
            }
            adviceTextarea.value = '';
            const cloudSub = getCloudSubmission(getAdviceLessonId(currentAdvicePromptId));
            isCurrentAdviceSubmitted = Boolean(cloudSub && cloudSub.is_submitted);
            const adviceKey = getAdviceStorageKey(currentAdvicePromptId);
            draftSaver.cancel(adviceKey);
            try {
                localStorage.removeItem(adviceKey);
                localStorage.removeItem(getAdviceSubmittedKey(currentAdvicePromptId));
            } catch (e) {}
            syncAdviceSampleUI(false);
            updateAdviceWordState();
            adviceTextarea.focus();
        });
    }

    adviceFbTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const lv = tab.getAttribute('data-fb-level');
            adviceFbTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (lv === 'B2') {
                if (adviceFbSampleB1) adviceFbSampleB1.style.display = 'none';
                if (adviceFbSampleB2) adviceFbSampleB2.style.display = 'block';
            } else {
                if (adviceFbSampleB1) adviceFbSampleB1.style.display = 'block';
                if (adviceFbSampleB2) adviceFbSampleB2.style.display = 'none';
            }
        });
    });

    // Populate initial Advice Prompt 1 (Jay) from single source of truth
    selectAdvicePrompt('1', { skipScroll: true });

    // --- 16b. Thư Hỏi Thông Tin (#hoi-thong-tin) — Split-Screen Workspace (4 Đề) ---
    const inquiryWorkspace = document.getElementById('inquiry-split-workspace');
    const inquiryResizer = document.getElementById('inquiry-split-resizer');
    const inquiryLevelBtns = document.querySelectorAll('[data-inquiry-level]');
    const inquiryGuideB1 = document.getElementById('inquiry-guide-B1');
    const inquiryGuideB2 = document.getElementById('inquiry-guide-B2');
    const inquiryCurrentLevelTag = document.getElementById('inquiry-current-level-tag');
    const inquiryTheoryScrollPane = document.getElementById('inquiry-theory-scroll-pane');
    const inquiryPromptSelect = document.getElementById('inquiry-prompt-select');
    const inquiryPromptNumBtns = document.querySelectorAll('[data-inquiry-prompt]');
    const inquiryExNumPill = document.getElementById('inquiry-ex-num-pill');
    const inquiryExTitle = document.getElementById('inquiry-ex-title');
    const inquiryTogglePromptTransBtn = document.getElementById('inquiry-toggle-prompt-trans-btn');
    const inquiryPromptCard = document.getElementById('inquiry-prompt-card');
    const inquiryTimerBtn = document.getElementById('inquiry-timer-btn');
    const inquiryTimerDisplay = document.getElementById('inquiry-timer-display');
    const inquiryTextarea = document.getElementById('inquiry-writing-textarea');
    const inquiryWcEl = document.getElementById('inquiry-writing-wc');
    const inquiryStatusEl = document.getElementById('inquiry-writing-status');
    const inquirySubmitBtn = document.getElementById('inquiry-submit-btn');
    const inquiryResetBtn = document.getElementById('inquiry-reset-btn');
    const inquiryPeekSampleBtn = document.getElementById('inquiry-peek-sample-btn');
    const inquiryFeedbackBox = document.getElementById('inquiry-writing-feedback');
    const inquiryTeacherFeedbackBox = document.getElementById('inquiry-teacher-feedback-box');
    const inquiryFeedbackTitle = document.getElementById('inquiry-feedback-title');
    const inquiryFbTabs = document.querySelectorAll('[data-inquiry-fb-level]');
    const inquiryFbSampleB1 = document.getElementById('inquiry-fb-sample-B1');
    const inquiryFbSampleB2 = document.getElementById('inquiry-fb-sample-B2');

    let currentInquiryPromptId = '1';
    let currentInquiryLevel = 'B1';
    let isCurrentInquirySubmitted = false;

    const INQUIRY_PROMPTS_DATA = {
        '1': {
            numLabel: 'Đề 1',
            taskTitle: 'Write an inquiry email to Alex about a concert ticket',
            placeholder: 'Dear Alex,\n\nViết bài của bạn ở đây…',
            promptEn: 'Your friend bought a concert ticket but now wants to pass it on to you. Write an email to your friend. In your email, you should:',
            promptVi: 'Người bạn của bạn đã mua một vé xem hòa nhạc nhưng hiện muốn nhượng lại cho bạn. Hãy viết một email cho bạn của mình. Trong email, bạn nên:',
            bullets: [
                {
                    en: 'Ask for details about the ticket (price, seat, and performer)',
                    vi: 'Hỏi chi tiết về chiếc vé (giá vé, vị trí ghế ngồi và nghệ sĩ biểu diễn)'
                },
                {
                    en: 'Ask how you can receive the ticket',
                    vi: 'Hỏi cách bạn có thể nhận chiếc vé'
                },
                {
                    en: 'Ask what is included in the program besides the music show',
                    vi: 'Hỏi xem chương trình còn bao gồm những gì ngoài buổi biểu diễn âm nhạc'
                }
            ],
            footerEn: 'Write at least 120 words. You do not need to include your name or addresses. Your response will be evaluated in terms of Task Fulfillment, Organization, Vocabulary and Grammar.',
            footerVi: 'Viết ít nhất 120 từ. Bạn không cần ghi tên hoặc địa chỉ của mình. Bài viết của bạn sẽ được đánh giá dựa trên các tiêu chí: Mức độ hoàn thành yêu cầu đề bài (Task Fulfillment), Bố cục (Organization), Từ vựng (Vocabulary) và Ngữ pháp (Grammar).',
            sampleB1: [
                '<strong>Dear Alex,</strong>',
                'How are you doing? I hope you’re doing well. Thanks for thinking of me! I’d be happy to take the concert ticket because I’m free that evening. Before I make a decision, could you tell me a few more details about it? For example, how much did you pay for the ticket, where is the seat, and who is performing?',
                'I’d also like to know how I can get the ticket from you. Could you give it to me at school, or would it be easier to send it to me by email? Oh … and one more thing, could you tell me what is included in the program besides the music show? Are there any games, food stalls, or special activities?',
                'Thanks again for offering me the ticket. Let me know when you are free.',
                '<strong>Best wishes,</strong>'
            ],
            sampleB2: [
                '<strong>Dear Alex,</strong>',
                'It’s been a long time since we last talked. How have you been? Thanks so much for offering me your concert ticket. I’d love to go, especially because I haven’t been to a live concert for a long time. Before I confirm, could you tell me how much you paid for it, where the seat is located, and which singer or band will be performing?',
                'I’d also like to know how I can receive the ticket. Would it be possible for you to send me the e-ticket, or should I meet you to collect a printed one? Finally, could you let me know whether the program includes anything besides the music performance, such as food stalls, games, or a chance to meet the performers? It would be useful to know what to expect and when to arrive.',
                'Thanks again for thinking of me. I’m looking forward to your reply.',
                '<strong>Best wishes,</strong>'
            ],
            b1: {
                titleEn: 'Concert Ticket Inquiry — Level B1',
                titleVi: 'Gợi ý từ vựng, cấu trúc và dàn ý trình độ B1',
                exampleColHeader: 'Ví dụ minh họa',
                intro: 'Ở trình độ <strong>Level B1</strong>, bạn viết một bức thư điện tử thân mật (informal email) gửi bạn bè để cảm ơn lời nhượng vé và hỏi rõ 3 nhóm thông tin theo đề bằng các câu hỏi lịch sự, dễ hiểu (<em>Could you tell me..., I’d also like to know..., Are there any...?</em>).',
                stepsHeader: 'Bố cục bức thư hỏi thông tin gửi Alex (Level B1) gồm 4 phần:',
                steps: [
                    '1. <strong>Mở thư &amp; Ý 1 (Chi tiết vé):</strong> Chào Alex, hỏi thăm sức khỏe, cảm ơn vì đã nghĩ đến mình và tỏ ý sẵn sàng lấy vé; hỏi 3 thông tin cụ thể: giá vé (<em>price</em>), vị trí ghế (<em>seat</em>) và nghệ sĩ biểu diễn (<em>performer</em>).',
                    '2. <strong>Ý 2 (Cách nhận vé):</strong> Hỏi cách lấy vé trực tiếp (ví dụ gặp ở trường) hay nhận qua email để tiện hơn.',
                    '3. <strong>Ý 3 (Hoạt động đi kèm):</strong> Chuyển ý tự nhiên (<em>Oh ... and one more thing</em>) để hỏi thêm ngoài buổi diễn âm nhạc còn có trò chơi, quầy đồ ăn hay hoạt động đặc biệt nào không.',
                    '4. <strong>Kết thư:</strong> Cảm ơn một lần nữa vì lời nhượng vé, hẹn bạn báo lịch rảnh và ký tên thân mật (<em>Best wishes,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư điện tử thân mật hỏi thông tin (Informal email asking for information).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Bạn bè (đề không nêu tên nên đặt một tên tiếng Anh thân quen như <em>Alex</em>); giọng văn tự nhiên, nhiệt tình, có thể dùng dạng viết tắt (<em>you’re, I’d, I’m</em>).',
                    '<strong>3 yêu cầu bắt buộc trong đề:</strong><ul><li>Hỏi chi tiết về vé: giá tiền, vị trí ghế ngồi và nghệ sĩ biểu diễn (<em>price, seat, and performer</em>).</li><li>Hỏi cách nhận vé từ bạn (<em>how you can receive the ticket</em>).</li><li>Hỏi những hoạt động có trong chương trình ngoài phần biểu diễn âm nhạc (<em>what is included in the program besides the music show</em>).</li></ul>',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc hỏi thông tin B1:</strong><ul><li>Hỏi lịch sự: <code>Before I make a decision, could you tell me...?</code></li><li>Hỏi nối tiếp bằng câu gián tiếp: <code>I’d also like to know how I can + V...</code></li><li>Đưa 2 phương án để bạn dễ trả lời: <code>Could you + V..., or would it be easier to + V...?</code></li><li>Chuyển sang câu hỏi cuối thân mật: <code>Oh ... and one more thing, could you tell me what is included in...?</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Chào Alex, hỏi thăm sức khỏe, cảm ơn bạn đã nhớ tới mình và nói mình rất vui nhận vé vì tối hôm đó rảnh.',
                    '<strong>2. Hỏi chi tiết về vé (Ý 1):</strong> Nêu rằng trước khi quyết định, bạn muốn hỏi thêm vài chi tiết: bạn ấy mua vé bao nhiêu tiền, ghế ngồi ở khu vực nào và ai sẽ biểu diễn.',
                    '<strong>3. Hỏi cách nhận vé (Ý 2):</strong> Hỏi xem có thể nhận vé bằng cách nào — đưa trực tiếp ở trường hay gửi qua email sẽ tiện hơn.',
                    '<strong>4. Hỏi các hoạt động khác trong chương trình (Ý 3):</strong> Hỏi thêm ngoài phần biểu diễn âm nhạc, chương trình còn có trò chơi, quầy đồ ăn hay hoạt động đặc biệt nào đi kèm không.',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Cảm ơn bạn lần nữa, nhắn bạn báo lúc rảnh và ký tên thân mật (<em>Best wishes,</em>).'
                ],
                vocab: [
                    ['make a decision', 'v. phr.', 'đưa ra quyết định', 'I need a few minutes to make a decision about the trip.'],
                    ['concert ticket', 'n. phr.', 'vé xem hòa nhạc', 'She bought two concert tickets for Saturday night.'],
                    ['perform', 'v.', 'biểu diễn', 'A famous rock group will perform at the city stadium.'],
                    ['send by email', 'v. phr.', 'gửi qua email', 'The organizer will send the schedule by email tomorrow.'],
                    ['be included in', 'v. phr.', 'được bao gồm trong', 'Breakfast is included in the hotel room price.'],
                    ['besides', 'prep.', 'ngoài ra, bên cạnh', 'Besides swimming, the resort offers yoga classes.'],
                    ['food stalls', 'n. phr.', 'các quầy bán đồ ăn', 'There are many local food stalls around the night market.'],
                    ['special activities', 'n. phr.', 'các hoạt động đặc biệt', 'The festival has special activities for young visitors.']
                ],
                tipTitle: 'Mẹo viết thư hỏi thông tin Level B1 đạt điểm cao',
                tipText: 'Khi hỏi bạn bè về vé hoặc sự kiện, đừng chỉ hỏi cộc lốc 3 câu ngắn — hãy đưa thêm <strong>1–2 gợi ý cụ thể</strong> (như <em>at school or by email</em>; <em>games, food stalls, or special activities</em>) để câu hỏi tự nhiên, sinh động và dễ đạt trên 120 từ.'
            },
            b2: {
                titleEn: 'Concert Ticket Inquiry — Level B2',
                titleVi: 'Gợi ý từ vựng nâng cao, cấu trúc tự nhiên và dàn ý trình độ B2',
                exampleColHeader: 'Ví dụ minh họa',
                intro: 'Ở trình độ <strong>Level B2</strong>, bài viết nâng cấp rõ nét độ mượt của câu hỏi gián tiếp (<em>could you tell me how much you paid / where the seat is located / whether the program includes...</em>), kết hợp lý do cá nhân tự nhiên (<em>especially because I haven’t been to a live concert...</em>) và vốn từ chính xác (<em>e-ticket, collect a printed one, music performance, what to expect</em>).',
                stepsHeader: 'Các điểm nâng cấp giúp bài viết đạt chuẩn Level B2:',
                steps: [
                    '1. <strong>Mở thư &amp; Ý 1 (Chi tiết vé):</strong> Mở thư tự nhiên bằng thì hiện tại hoàn thành (<em>It’s been a long time... / haven’t been to a live concert</em>), dùng cụm <em>Before I confirm</em> và lồng ghép mượt 3 câu hỏi gián tiếp (<em>how much you paid, where the seat is located, which singer or band will be performing</em>).',
                    '2. <strong>Ý 2 (Cách nhận vé):</strong> Nâng cấp bằng cấu trúc lịch sự <em>Would it be possible for you to send me the e-ticket, or should I meet you to collect a printed one?</em>',
                    '3. <strong>Ý 3 (Hoạt động đi kèm):</strong> Dùng câu hỏi gián tiếp với <em>whether</em> (<em>let me know whether the program includes anything besides the music performance</em>) + liệt kê ví dụ thực tế và thêm câu giải thích mục đích (<em>It would be useful to know what to expect and when to arrive</em>).',
                    '4. <strong>Kết thư tự nhiên:</strong> Cảm ơn vì đã nghĩ tới mình, bày tỏ mong đợi phản hồi và ký tên thân mật (<em>Best wishes,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư điện tử thân mật hỏi thông tin chi tiết (Informal inquiry email).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Alex (bạn thân); giọng văn thân mật nhưng trôi chảy, câu ghép đa dạng và chú ý đúng trật tự từ trong câu hỏi gián tiếp.',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc ăn điểm Level B2:</strong><ul><li>Câu hỏi gián tiếp chuẩn trật tự S + V (KHÔNG đảo ngữ): <code>could you tell me how much you paid, where the seat is located, and which singer or band will be performing?</code></li><li>Đề nghị phương án lịch sự: <code>Would it be possible for you to + V..., or should I + V...?</code></li><li>Câu hỏi <em>Yes/No</em> gián tiếp với <em>whether</em>: <code>could you let me know whether the program includes anything besides...?</code></li><li>Bổ sung lý do hợp lý sau câu hỏi: <code>It would be useful to know what to expect and when to arrive.</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Hỏi thăm sau một thời gian chưa trò chuyện, cảm ơn Alex đã nhượng vé và bày tỏ sự hào hứng vì lâu rồi chưa đi xem hòa nhạc trực tiếp.',
                    '<strong>2. Hỏi chi tiết về vé (Ý 1):</strong> Trước khi xác nhận (<em>Before I confirm</em>), gộp 3 ý giá vé, vị trí ghế ngồi (<em>where the seat is located</em>) và ca sĩ/ban nhạc biểu diễn vào một câu hỏi gián tiếp mạch lạc.',
                    '<strong>3. Hỏi cách nhận vé (Ý 2):</strong> Hỏi cách nhận vé và đưa hai phương án rõ ràng: gửi vé điện tử (<em>e-ticket</em>) hay gặp trực tiếp để lấy vé giấy (<em>collect a printed one</em>).',
                    '<strong>4. Hỏi các hoạt động khác trong chương trình (Ý 3):</strong> Dùng <em>whether</em> hỏi liệu chương trình có hoạt động gì khác ngoài buổi diễn âm nhạc (quầy đồ ăn, trò chơi, cơ hội gặp gỡ nghệ sĩ), kèm lý do muốn biết trước để chủ động giờ đến.',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Cảm ơn bạn lần nữa, bày tỏ mong sớm nhận hồi âm và ký tên (<em>Best wishes,</em>).'
                ],
                vocab: [
                    ['live concert', 'n. phr.', 'buổi hòa nhạc trực tiếp', 'Attending a live concert is much more exciting than watching videos online.'],
                    ['confirm', 'v.', 'xác nhận', 'Please check the schedule before you confirm your attendance.'],
                    ['be located', 'v. phr.', 'nằm ở vị trí', 'The exhibition hall is located on the third floor.'],
                    ['e-ticket', 'n.', 'vé điện tử', 'Passengers can show their e-ticket on a smartphone at the gate.'],
                    ['collect a printed one', 'v. phr.', 'nhận một bản vé in', 'You can go to the box office to collect a printed one.'],
                    ['music performance', 'n. phr.', 'buổi biểu diễn âm nhạc', 'Everyone applauded loudly at the end of the music performance.'],
                    ['a chance to meet', 'n. phr.', 'cơ hội được gặp gỡ', 'Workshop guests had a chance to meet the author after the talk.'],
                    ['what to expect', 'phr.', 'những gì sẽ diễn ra / cần chuẩn bị', 'Reading the event guide helps visitors know what to expect.']
                ],
                upgrades: [
                    ['Mở thư', 'I’d be happy to take the concert ticket because I’m free that evening.', '<strong>I’d love to go, especially because I haven’t been to a live concert for a long time.</strong>'],
                    ['Hỏi chi tiết vé', 'Before I make a decision... how much did you pay, where is the seat, and who is performing?', '<strong>Before I confirm</strong>, could you tell me <strong>how much you paid for it, where the seat is located, and which singer or band will be performing?</strong>'],
                    ['Hỏi cách nhận vé', 'Could you give it to me at school, or would it be easier to send it to me by email?', '<strong>Would it be possible for you to send me the e-ticket, or should I meet you to collect a printed one?</strong>'],
                    ['Hoạt động đi kèm', 'Oh … and one more thing, could you tell me what is included in the program besides the music show?', '<strong>Finally, could you let me know whether the program includes anything besides the music performance... It would be useful to know what to expect and when to arrive.</strong>']
                ],
                tipTitle: 'Mẹo nâng band điểm từ B1 lên B2',
                tipText: 'Lỗi phổ biến nhất của thí sinh B1 khi hỏi thông tin là đảo ngữ sai trong câu hỏi gián tiếp (ví dụ viết nhầm <em>could you tell me where is the seat</em>). Ở mức B2, hãy giữ đúng trật tự <strong>S + V</strong> (<em>where the seat is located / how much you paid</em>) và dùng <strong>whether</strong> cho câu hỏi Có/Không!'
            }
        },
        '2': {
            numLabel: 'Đề 2',
            taskTitle: 'Write an inquiry letter to a local pet shop about buying a pet',
            placeholder: 'Dear Sir/Madam,\n\nViết bài của bạn ở đây…',
            promptEn: 'You want to buy a pet from a local pet shop. Write a letter to the pet shop. In your letter, you should:',
            promptVi: 'Bạn muốn mua một thú cưng từ một cửa hàng thú cưng địa phương. Hãy viết một bức thư cho cửa hàng thú cưng đó. Trong thư, bạn nên:',
            bullets: [
                {
                    en: 'Say what kind of pet you are interested in',
                    vi: 'Nói rõ loại thú cưng mà bạn đang quan tâm'
                },
                {
                    en: 'Ask about the price and the necessary care for this pet',
                    vi: 'Hỏi về giá cả và cách chăm sóc cần thiết cho thú cưng này'
                },
                {
                    en: 'Inquire about the shop\'s services, such as delivery or health check-ups',
                    vi: 'Hỏi về các dịch vụ của cửa hàng, chẳng hạn như giao hàng hoặc kiểm tra sức khỏe'
                }
            ],
            footerEn: 'Write at least 120 words. You do not need to include your name or addresses. Your response will be evaluated in terms of Task Fulfillment, Organization, Vocabulary and Grammar.',
            footerVi: 'Viết ít nhất 120 từ. Bạn không cần ghi tên hoặc địa chỉ của mình. Bài viết của bạn sẽ được đánh giá dựa trên các tiêu chí: Mức độ hoàn thành yêu cầu đề bài (Task Fulfillment), Bố cục (Organization), Từ vựng (Vocabulary) và Ngữ pháp (Grammar).',
            sampleB1: [
                '<strong>Dear Sir/Madam,</strong>',
                'I am writing to ask for some information about the pets available at your shop. I am interested in buying a small dog. If possible, I prefer a friendly breed that is suitable for living in an apartment.',
                'Could you tell me how much a puppy costs? I would also like to know what food it should eat, how often it needs to be fed, and what daily care it requires.',
                'In addition, could you let me know what services your shop offers? For example, do you provide home delivery, and can I bring the dog back for regular health check-ups? I would also be grateful if you could tell me whether the first health check is included in the price.',
                'Thank you for your time. I look forward to hearing from you.',
                '<strong>Kind regards,</strong>'
            ],
            sampleB2: [
                '<strong>Dear Sir/Madam,</strong>',
                'I am writing to ask about buying a pet from your shop. I have been thinking of getting a small dog because I live in an apartment and would like a friendly companion. I am particularly interested in a breed that does not need too much space.',
                'Could you tell me the price of a puppy and whether the cost includes basic items, such as vaccinations or a health record? I’d also like to know what kind of food it should eat, how often it needs exercise, and what daily care is required.',
                'In addition, could you let me know whether your shop offers home delivery or regular health check-ups? As this would be my first pet, some advice after purchase would be very helpful.',
                'Thank you for your time. I look forward to hearing from you.',
                '<strong>Kind regards,</strong>'
            ],
            b1: {
                titleEn: 'Buying a Pet Inquiry — Level B1 (Formal)',
                titleVi: 'Gợi ý từ vựng, cấu trúc và dàn ý trình độ B1 (Văn phong lịch sự)',
                exampleColHeader: 'Ví dụ minh họa',
                intro: 'Đây là bức thư hỏi thông tin lịch sự/trang trọng (<strong>Formal / Semi-formal letter</strong>) gửi cửa hàng thú cưng địa phương. Ở trình độ <strong>Level B1</strong>, bạn mở thư bằng <em>Dear Sir/Madam,</em>, tránh dùng từ viết tắt (<em>I am, I would like</em>) và triển khai gọn gàng 3 đoạn thân bài ứng với đúng 3 yêu cầu đề bài.',
                stepsHeader: 'Bố cục bức thư gửi cửa hàng thú cưng (Level B1) gồm 5 phần:',
                steps: [
                    '1. <strong>Mở thư &amp; Ý 1 (Loại thú cưng quan tâm):</strong> Chào <em>Dear Sir/Madam,</em>, nêu mục đích hỏi thông tin thú cưng tại cửa hàng; nói rõ muốn mua một chú chó nhỏ (<em>a small dog</em>), ưu tiên giống thân thiện phù hợp sống ở căn hộ (<em>suitable for living in an apartment</em>).',
                    '2. <strong>Đoạn 2 (Giá cả &amp; Cách chăm sóc):</strong> Hỏi giá một chú chó con (<em>how much a puppy costs</em>), loại thức ăn cần ăn, tần suất cho ăn (<em>how often it needs to be fed</em>) và việc chăm sóc hàng ngày (<em>daily care</em>).',
                    '3. <strong>Đoạn 3 (Dịch vụ cửa hàng):</strong> Hỏi các dịch vụ cửa hàng cung cấp như giao hàng tận nhà (<em>home delivery</em>), khám sức khỏe định kỳ (<em>regular health check-ups</em>) và liệu lần khám đầu tiên có nằm trong giá bán không.',
                    '4. <strong>Kết thư:</strong> Cảm ơn thời gian của cửa hàng, mong nhận phản hồi và chào lịch sự (<em>Kind regards,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư hỏi thông tin trang trọng/bán trang trọng gửi cửa hàng (Formal inquiry letter).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Chủ/nhân viên cửa hàng thú cưng (không biết tên) → dùng <em>Dear Sir/Madam,</em> và kết bằng <em>Kind regards,</em>; giọng văn lịch sự, rõ ràng.',
                    '<strong>3 yêu cầu bắt buộc trong đề:</strong><ul><li>Nêu rõ loại thú cưng bạn đang quan tâm (<em>Say what kind of pet you are interested in</em>).</li><li>Hỏi về giá cả và cách chăm sóc cần thiết (<em>Ask about the price and the necessary care for this pet</em>).</li><li>Hỏi về dịch vụ của cửa hàng như giao hàng hoặc kiểm tra sức khỏe (<em>Inquire about the shop\'s services, such as delivery or health check-ups</em>).</li></ul>',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc B1:</strong><ul><li>Nêu mục đích &amp; sở thích: <code>I am writing to ask for some information about...</code> / <code>I am interested in buying...</code></li><li>Câu hỏi gián tiếp lịch sự: <code>Could you tell me how much + S + V?</code> / <code>I would also like to know what..., how often..., and what...</code></li><li>Câu hỏi trang trọng với <em>whether</em>: <code>I would also be grateful if you could tell me whether...</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư + Loại thú cưng (Ý 1):</strong> Chào <em>Dear Sir/Madam,</em>, nêu mục đích hỏi thông tin thú cưng ở cửa hàng; cho biết bạn muốn mua một chú chó nhỏ, giống thân thiện và phù hợp sống trong căn hộ.',
                    '<strong>2. Thân bài 1 — Giá cả &amp; Cách chăm sóc (Ý 2):</strong> Hỏi giá một chú chó con là bao nhiêu; hỏi thêm nên cho ăn thức ăn gì, cho ăn mấy lần một ngày và cần chăm sóc hàng ngày thế nào.',
                    '<strong>3. Thân bài 2 — Dịch vụ của cửa hàng (Ý 3):</strong> Dùng <em>In addition</em> để hỏi cửa hàng có những dịch vụ nào, chẳng hạn giao hàng tận nhà hay khám sức khỏe định kỳ, và lần khám sức khỏe đầu tiên có tính trong giá mua không.',
                    '<strong>4. Kết thư &amp; Ký tên:</strong> Cảm ơn thời gian của cửa hàng, bày tỏ mong đợi hồi âm và ký tên (<em>Kind regards,</em>).'
                ],
                vocab: [
                    ['available', 'adj.', 'hiện có, sẵn có', 'Please let me know which rooms are available next weekend.'],
                    ['breed', 'n.', 'giống (chó/mèo/vật nuôi)', 'Poodles are a popular breed for families with children.'],
                    ['suitable for', 'adj. phr.', 'phù hợp với', 'This quiet café is suitable for studying or reading.'],
                    ['puppy', 'n.', 'chó con', 'Training a young puppy takes patience and kindness.'],
                    ['be fed', 'v. (passive)', 'được cho ăn', 'Aquarium fish should be fed twice a day in small amounts.'],
                    ['daily care', 'n. phr.', 'việc chăm sóc hàng ngày', 'Indoor plants need simple daily care to stay green.'],
                    ['home delivery', 'n. phr.', 'dịch vụ giao hàng tận nhà', 'The bookstore provides free home delivery within the city.'],
                    ['regular health check-ups', 'n. phr.', 'khám sức khỏe định kỳ', 'Veterinarians recommend regular health check-ups every six months.']
                ],
                tipTitle: 'Mẹo viết thư hỏi mua thú cưng Level B1 đạt điểm cao',
                tipText: 'Khi nhắc tới <strong>necessary care</strong> (cách chăm sóc cần thiết), hãy tách thành 3 chi tiết cụ thể trong cùng một câu: <em>what food it should eat</em> (ăn gì), <em>how often it needs to be fed</em> (cho ăn bao nhiêu lần) và <em>what daily care it requires</em> (chăm sóc hàng ngày).'
            },
            b2: {
                titleEn: 'Buying a Pet Inquiry — Level B2 (Formal / Semi-formal)',
                titleVi: 'Gợi ý từ vựng nâng cao, cấu trúc tự nhiên và dàn ý trình độ B2',
                exampleColHeader: 'Ví dụ minh họa',
                intro: 'Ở trình độ <strong>Level B2</strong>, bài viết mở rộng chi tiết thực tế hơn khi mua thú cưng lần đầu: dùng thì <strong>hiện tại hoàn thành tiếp diễn</strong> (<em>I have been thinking of getting...</em>), hỏi kỹ các hạng mục đi kèm giá mua (<em>vaccinations, health record</em>), hỏi về nhu cầu vận động (<em>needs exercise</em>) và khéo léo xin tư vấn sau khi mua (<em>some advice after purchase</em>).',
                stepsHeader: 'Các điểm nâng cấp giúp bài viết đạt chuẩn Level B2:',
                steps: [
                    '1. <strong>Mở thư &amp; Ý 1 (Loại thú cưng):</strong> Dùng <em>I have been thinking of getting a small dog</em>, nêu rõ lý do (<em>live in an apartment / would like a friendly companion</em>) và cụm <em>particularly interested in a breed that does not need too much space</em>.',
                    '2. <strong>Đoạn 2 (Giá cả &amp; Chăm sóc):</strong> Gộp câu hỏi giá kèm chi tiết <em>whether the cost includes basic items, such as vaccinations or a health record</em>; hỏi rõ <em>what kind of food, how often it needs exercise, and what daily care is required</em> (bị động).',
                    '3. <strong>Đoạn 3 (Dịch vụ cửa hàng):</strong> Dùng câu hỏi gián tiếp với <em>whether</em> về <em>home delivery or regular health check-ups</em>, kết hợp bối cảnh cá nhân <em>As this would be my first pet, some advice after purchase would be very helpful</em>.',
                    '4. <strong>Kết thư lịch sự:</strong> <em>Thank you for your time. I look forward to hearing from you. / Kind regards,</em>'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư hỏi thông tin bán trang trọng / trang trọng gửi cửa hàng (Inquiry letter).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Cửa hàng thú cưng (<em>Dear Sir/Madam,</em> → <em>Kind regards,</em>); lịch sự, mạch lạc, giàu từ vựng đúng chủ đề.',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc ăn điểm Level B2:</strong><ul><li>Thì hiện tại hoàn thành tiếp diễn nêu dự định đã ấp ủ: <code>I have been thinking of getting... because...</code></li><li>Câu hỏi gián tiếp kết hợp danh từ &amp; mệnh đề <em>whether</em>: <code>Could you tell me the price of a puppy and whether the cost includes basic items, such as...?</code></li><li>Mệnh đề nguyên nhân + câu điều kiện ẩn lịch sự: <code>As this would be my first pet, some advice after purchase would be very helpful.</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư + Loại thú cưng (Ý 1):</strong> Chào <em>Dear Sir/Madam,</em>, nêu mục đích hỏi mua thú cưng; giải thích đã cân nhắc nuôi một chú chó nhỏ làm bạn đồng hành vì sống ở căn hộ và đặc biệt quan tâm giống không cần quá nhiều không gian.',
                    '<strong>2. Thân bài 1 — Giá cả &amp; Cách chăm sóc (Ý 2):</strong> Hỏi giá chó con và liệu mức giá đã gồm các mục cơ bản như tiêm phòng (<em>vaccinations</em>) hay sổ sức khỏe (<em>health record</em>) chưa; hỏi thêm về chế độ ăn, tần suất vận động và chăm sóc hàng ngày.',
                    '<strong>3. Thân bài 2 — Dịch vụ &amp; Hỗ trợ sau mua (Ý 3):</strong> Hỏi liệu cửa hàng có dịch vụ giao tận nhà hay kiểm tra sức khỏe định kỳ không; chia sẻ đây là thú cưng đầu tiên nên rất cần thêm lời khuyên tư vấn sau khi mua.',
                    '<strong>4. Kết thư &amp; Ký tên:</strong> Cảm ơn cửa hàng đã dành thời gian, mong sớm nhận phản hồi và chào lịch sự (<em>Kind regards,</em>).'
                ],
                vocab: [
                    ['companion', 'n.', 'người bạn đồng hành', 'A loyal cat can be a wonderful companion for elderly people.'],
                    ['particularly interested in', 'adj. phr.', 'đặc biệt quan tâm đến', 'I am particularly interested in adopting a rescue animal.'],
                    ['vaccinations', 'n. (pl.)', 'các mũi tiêm phòng', 'Kittens should receive all necessary vaccinations before going outdoors.'],
                    ['health record', 'n. phr.', 'hồ sơ / sổ theo dõi sức khỏe', 'Always keep your pet’s health record ready for clinic visits.'],
                    ['need exercise', 'v. phr.', 'cần vận động', 'Active dog breeds need exercise outdoors every morning.'],
                    ['be required', 'v. (passive)', 'được yêu cầu, cần thiết', 'Special grooming tools are required for long-haired cats.'],
                    ['after purchase', 'prep. phr.', 'sau khi mua hàng', 'The electronics store offers free support after purchase.'],
                    ['basic items', 'n. phr.', 'những vật dụng / hạng mục cơ bản', 'The starter kit comes with basic items like a bowl and a leash.']
                ],
                upgrades: [
                    ['Loại thú cưng', 'I am interested in buying a small dog... suitable for living in an apartment.', '<strong>I have been thinking of getting a small dog because I live in an apartment and would like a friendly companion. I am particularly interested in a breed that does not need too much space.</strong>'],
                    ['Giá &amp; hạng mục đi kèm', 'Could you tell me how much a puppy costs?', '<strong>Could you tell me the price of a puppy and whether the cost includes basic items, such as vaccinations or a health record?</strong>'],
                    ['Cách chăm sóc', 'how often it needs to be fed, and what daily care it requires', '<strong>how often it needs exercise, and what daily care is required</strong>'],
                    ['Dịch vụ &amp; hỗ trợ', 'whether the first health check is included in the price', '<strong>As this would be my first pet, some advice after purchase would be very helpful.</strong>']
                ],
                tipTitle: 'Mẹo nâng band điểm từ B1 lên B2',
                tipText: 'Thêm các từ vựng chuyên biệt đúng chủ đề nuôi thú cưng như <strong>friendly companion</strong>, <strong>vaccinations</strong>, <strong>health record</strong>, <strong>needs exercise</strong> và câu lý do tự nhiên <strong>As this would be my first pet, some advice after purchase would be very helpful</strong> sẽ giúp bài viết thuyết phục và ghi điểm cao ở tiêu chí Vocabulary &amp; Task Fulfillment.'
            }
        },
        '3': {
            numLabel: 'Đề 3',
            taskTitle: 'Write a letter to Sarah asking for advice on a birthday party',
            placeholder: 'Dear Sarah,\n\nViết bài của bạn ở đây…',
            promptEn: 'You want to organize a birthday party but are not sure about the details. Write a letter to your friend to ask for advice. In your letter, you should:',
            promptVi: 'Bạn muốn tổ chức một bữa tiệc sinh nhật nhưng vẫn chưa chắc chắn về các chi tiết. Hãy viết một bức thư cho người bạn của mình để xin lời khuyên. Trong thư, bạn nên:',
            bullets: [
                {
                    en: 'Ask for suggestions about a suitable time for the party',
                    vi: 'Xin gợi ý về thời gian phù hợp cho bữa tiệc'
                },
                {
                    en: 'Ask for ideas about the location of the party',
                    vi: 'Xin ý tưởng về địa điểm tổ chức bữa tiệc'
                },
                {
                    en: 'Ask what kind of gift you should suggest to guests',
                    vi: 'Hỏi xem bạn nên gợi ý loại quà tặng nào cho khách mời'
                }
            ],
            footerEn: 'Write at least 120 words. You do not need to include your name or addresses. Your response will be evaluated in terms of Task Fulfillment, Organization, Vocabulary and Grammar.',
            footerVi: 'Viết ít nhất 120 từ. Bạn không cần ghi tên hoặc địa chỉ của mình. Bài viết của bạn sẽ được đánh giá dựa trên các tiêu chí: Mức độ hoàn thành yêu cầu đề bài (Task Fulfillment), Bố cục (Organization), Từ vựng (Vocabulary) và Ngữ pháp (Grammar).',
            sampleB1: [
                '<strong>Dear Sarah,</strong>',
                'How are you doing? I hope you’re doing well. I’m planning to have a birthday party next month, but I haven’t decided on the details yet. Since you are good at organizing parties, I’d love to hear your advice.',
                'First, could you suggest a suitable time for the party? I’m thinking about Saturday evening, but I’m not sure whether people will be busy. What do you think? I’d also like to ask for some ideas about the location. Should I have the party at my house, in a café, or at a small restaurant?',
                'Finally, could you tell me what kind of gift I should suggest to my guests? I don’t want them to spend too much money, so maybe something simple would be best.',
                'Thanks for your help. I hope to hear from you soon.',
                '<strong>Best wishes,</strong>'
            ],
            sampleB2: [
                '<strong>Dear Sarah,</strong>',
                'It’s been a long time since we last talked. How have you been? I’m planning a birthday party for a small group of friends next month, but I haven’t made any final decisions yet. You organised a lovely party last year, so I’d really appreciate your advice.',
                'Could you suggest a suitable time for it? I was thinking of Saturday evening, as most people are free then, but some guests may have work or family plans. Do you think an afternoon would be better?',
                'I’d also like to know where I should hold it. Would my house be comfortable enough, or would a café or small restaurant be more convenient? Finally, could you let me know what kind of gift I should suggest? I’d rather ask for something simple and useful so nobody feels they have to spend too much.',
                'Thanks for your help. I hope to hear from you soon.',
                '<strong>Best wishes,</strong>'
            ],
            b1: {
                titleEn: 'Birthday Party Advice Inquiry — Level B1',
                titleVi: 'Gợi ý từ vựng, cấu trúc và dàn ý trình độ B1',
                exampleColHeader: 'Ví dụ minh họa',
                intro: 'Ở trình độ <strong>Level B1</strong>, đây là bức thư thân mật (informal letter) gửi bạn thân để <strong>xin lời khuyên &amp; ý tưởng</strong> cho bữa tiệc sinh nhật. Điểm hay của đề này là bạn vừa đặt câu hỏi, vừa đưa ra <strong>phương án mình đang phân vân</strong> (ví dụ: tối thứ Bảy, tổ chức ở nhà hay quán cà phê, quà đơn giản) để bức thư tự nhiên và đủ độ dài.',
                stepsHeader: 'Bố cục bức thư xin lời khuyên gửi Sarah (Level B1) gồm 4 phần:',
                steps: [
                    '1. <strong>Mở thư:</strong> Chào Sarah, hỏi thăm sức khỏe, chia sẻ dự định tổ chức tiệc sinh nhật tháng tới nhưng chưa chốt chi tiết, khen bạn tổ chức tiệc khéo nên muốn xin lời khuyên.',
                    '2. <strong>Đoạn 1 (Thời gian &amp; Địa điểm):</strong> Xin gợi ý thời gian phù hợp (đang cân nhắc tối thứ Bảy nhưng sợ mọi người bận) và xin ý tưởng địa điểm (tổ chức ở nhà, quán cà phê hay nhà hàng nhỏ).',
                    '3. <strong>Đoạn 2 (Gợi ý quà tặng cho khách):</strong> Hỏi nên gợi ý loại quà nào cho khách mời vì không muốn mọi người tốn quá nhiều tiền — có lẽ món gì đó đơn giản là hợp lý nhất.',
                    '4. <strong>Kết thư:</strong> Cảm ơn sự giúp đỡ của bạn, mong sớm nhận hồi âm và ký tên thân mật (<em>Best wishes,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư thân mật hỏi ý kiến / xin lời khuyên (Informal letter asking for advice).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Sarah (bạn thân); giọng văn gần gũi, tự nhiên, được dùng dạng viết tắt (<em>you’re, I’m, haven’t, I’d, don’t</em>).',
                    '<strong>3 yêu cầu bắt buộc trong đề:</strong><ul><li>Xin gợi ý thời gian phù hợp cho bữa tiệc (<em>suitable time for the party</em>).</li><li>Xin ý tưởng về địa điểm tổ chức (<em>ideas about the location</em>).</li><li>Hỏi nên gợi ý loại quà gì cho khách mời (<em>what kind of gift to suggest to guests</em>).</li></ul>',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc hỏi ý kiến B1:</strong><ul><li>Nêu lý do hỏi bạn: <code>Since you are good at + V-ing..., I’d love to hear your advice.</code></li><li>Xin gợi ý &amp; nêu băn khoăn: <code>First, could you suggest...? I’m thinking about..., but I’m not sure whether...</code></li><li>Hỏi chọn phương án: <code>Should I + V at A, in B, or at C?</code></li><li>Hỏi gián tiếp: <code>Finally, could you tell me what kind of gift I should suggest to...?</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Chào Sarah, hỏi thăm sức khỏe, báo tin dự định tổ chức tiệc sinh nhật tháng tới nhưng chưa chốt chi tiết và muốn xin lời khuyên vì bạn rất khéo tổ chức tiệc.',
                    '<strong>2. Thân bài 1 — Thời gian &amp; Địa điểm (Ý 1 &amp; 2):</strong> Hỏi thời gian phù hợp (đang nghĩ tối thứ Bảy nhưng lo mọi người bận, hỏi ý bạn); nối tiếp hỏi ý tưởng địa điểm: nên làm ở nhà, quán cà phê hay nhà hàng nhỏ.',
                    '<strong>3. Thân bài 2 — Quà tặng cho khách (Ý 3):</strong> Hỏi nên gợi ý loại quà nào cho khách vì không muốn họ tốn quá nhiều tiền nên món quà đơn giản có lẽ là tốt nhất.',
                    '<strong>4. Kết thư &amp; Ký tên:</strong> Cảm ơn Sarah đã giúp đỡ, mong sớm nhận thư trả lời và ký tên (<em>Best wishes,</em>).'
                ],
                vocab: [
                    ['decide on', 'phr. v.', 'quyết định chọn', 'We still need to decide on the menu for the dinner.'],
                    ['be good at', 'adj. phr.', 'giỏi về việc gì', 'My sister is really good at decorating rooms for events.'],
                    ['suitable time', 'n. phr.', 'thời gian phù hợp', 'Let’s pick a suitable time when everyone can attend.'],
                    ['location', 'n.', 'địa điểm', 'The riverside park is a lovely location for a picnic.'],
                    ['small restaurant', 'n. phr.', 'nhà hàng nhỏ ấm cúng', 'They booked a table at a small restaurant downtown.'],
                    ['guests', 'n. (pl.)', 'khách mời', 'Around twenty guests came to celebrate her graduation.'],
                    ['spend too much money', 'v. phr.', 'chi tiêu quá nhiều tiền', 'Students try not to spend too much money on eating out.'],
                    ['something simple', 'n. phr.', 'một món gì đó đơn giản', 'He prefers something simple like a book or a mug.']
                ],
                tipTitle: 'Mẹo viết thư xin lời khuyên Level B1 tự nhiên',
                tipText: 'Khi xin ý kiến bạn bè, hãy kết hợp công thức <strong>Đặt câu hỏi + Đưa sẵn 2–3 lựa chọn bạn đang phân vân</strong> (ví dụ: <em>Saturday evening? / at my house, in a café, or at a small restaurant?</em>). Cách này giúp bài viết vừa chân thực như thư thật, vừa dễ dàng mở rộng đủ từ.'
            },
            b2: {
                titleEn: 'Birthday Party Advice Inquiry — Level B2',
                titleVi: 'Gợi ý từ vựng nâng cao, cấu trúc tự nhiên và dàn ý trình độ B2',
                exampleColHeader: 'Ví dụ minh họa',
                intro: 'Ở trình độ <strong>Level B2</strong>, bài viết nâng cấp mạch diễn đạt bằng các cụm từ tự nhiên và đa dạng hơn: <em>make any final decisions, really appreciate your advice, hold a party, comfortable enough vs. more convenient, I’d rather ask for something simple and useful so nobody feels they have to...</em>',
                stepsHeader: 'Các điểm nâng cấp giúp bài viết đạt chuẩn Level B2:',
                steps: [
                    '1. <strong>Mở thư tự nhiên, giàu ngữ cảnh:</strong> Dùng <em>It’s been a long time... / How have you been?</em>, cụ thể hóa <em>a small group of friends</em>, dùng <em>haven’t made any final decisions yet</em> và nhắc kỷ niệm thực tế <em>You organised a lovely party last year, so I’d really appreciate your advice</em>.',
                    '2. <strong>Đoạn 1 (Thời gian):</strong> Dùng quá khứ tiếp diễn mang sắc thái cân nhắc lịch sự (<em>I was thinking of Saturday evening, as most people are free then</em>), nêu rõ lý do băn khoăn (<em>work or family plans</em>) và hỏi phương án thay thế (<em>Do you think an afternoon would be better?</em>).',
                    '3. <strong>Đoạn 2 (Địa điểm &amp; Quà tặng):</strong> Dùng động từ <em>hold it</em> thay cho <em>have the party</em>, so sánh tiêu chí bằng <em>Would ... be comfortable enough, or would ... be more convenient?</em>, và diễn đạt tinh tế với <em>I’d rather ask for something simple and useful so nobody feels they have to spend too much</em>.',
                    '4. <strong>Kết thư thân mật:</strong> Cảm ơn sự giúp đỡ, hẹn sớm nhận hồi âm và ký tên (<em>Best wishes,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư thân mật hỏi ý kiến / xin lời khuyên chi tiết (Informal letter asking for advice).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Sarah (bạn thân); giọng văn tự nhiên, mạch lạc, có cân nhắc các khía cạnh thực tế.',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc ăn điểm Level B2:</strong><ul><li>Quá khứ tiếp diễn nêu dự định chưa chốt: <code>I was thinking of Saturday evening, as most people are free then, but...</code></li><li>Câu hỏi so sánh bằng <em>Would</em>: <code>Would my house be comfortable enough, or would a café or small restaurant be more convenient?</code></li><li>Cấu trúc ưu tiên <em>would rather</em> + mệnh đề mục đích: <code>I’d rather ask for something simple and useful so nobody feels they have to spend too much.</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Hỏi thăm Sarah sau thời gian lâu chưa trò chuyện, báo kế hoạch tổ chức tiệc sinh nhật cho nhóm bạn nhỏ tháng tới nhưng chưa chốt quyết định cuối cùng, nhắc năm ngoái Sarah tổ chức tiệc rất đẹp nên muốn xin lời khuyên.',
                    '<strong>2. Thân bài 1 — Thời gian tổ chức (Ý 1):</strong> Xin gợi ý thời điểm phù hợp; chia sẻ đang cân nhắc tối thứ Bảy vì đa số rảnh nhưng sợ một vài khách vướng việc công ty hoặc gia đình, hỏi xem buổi chiều có ổn hơn không.',
                    '<strong>3. Thân bài 2 — Địa điểm &amp; Gợi ý quà (Ý 2 &amp; 3):</strong> Hỏi nên tổ chức ở đâu — ở nhà liệu có đủ thoải mái hay quán cà phê / nhà hàng nhỏ sẽ tiện hơn; cuối cùng hỏi nên gợi ý loại quà gì để mọi người chọn đồ đơn giản, hữu ích mà không áp lực chi tiêu.',
                    '<strong>4. Kết thư &amp; Ký tên:</strong> Cảm ơn sự hỗ trợ của bạn, mong sớm nhận phản hồi và ký tên (<em>Best wishes,</em>).'
                ],
                vocab: [
                    ['make a final decision', 'v. phr.', 'đưa ra quyết định cuối cùng', 'We will compare both quotes before we make a final decision.'],
                    ['appreciate someone’s advice', 'v. phr.', 'rất trân trọng lời khuyên của ai', 'New graduates often appreciate their mentor’s advice.'],
                    ['family plans', 'n. phr.', 'kế hoạch riêng với gia đình', 'Several colleagues have family plans over the long holiday.'],
                    ['hold an event / party', 'v. phr.', 'tổ chức một sự kiện / bữa tiệc', 'The community center can hold an event for up to fifty people.'],
                    ['comfortable enough', 'adj. phr.', 'đủ thoải mái', 'Is the meeting room comfortable enough for a three-hour workshop?'],
                    ['more convenient', 'adj. phr.', 'thuận tiện hơn', 'Taking the metro is often more convenient than driving downtown.'],
                    ['would rather + V', 'modal phr.', 'thích / muốn làm gì hơn', 'I would rather stay indoors when the weather turns stormy.'],
                    ['simple and useful', 'adj. phr.', 'đơn giản và hữu ích', 'A notebook is a simple and useful gift for any student.']
                ],
                upgrades: [
                    ['Mở thư', 'haven’t decided on the details yet / good at organizing parties, I’d love to hear your advice', '<strong>haven’t made any final decisions yet</strong> / <strong>You organised a lovely party last year, so I’d really appreciate your advice.</strong>'],
                    ['Thời gian', 'I’m thinking about Saturday evening... whether people will be busy.', '<strong>I was thinking of Saturday evening, as most people are free then, but some guests may have work or family plans. Do you think an afternoon would be better?</strong>'],
                    ['Địa điểm', 'Should I have the party at my house, in a café, or at a small restaurant?', '<strong>where I should hold it. Would my house be comfortable enough, or would a café or small restaurant be more convenient?</strong>'],
                    ['Quà tặng', 'I don’t want them to spend too much money, so maybe something simple would be best.', '<strong>I’d rather ask for something simple and useful so nobody feels they have to spend too much.</strong>']
                ],
                tipTitle: 'Mẹo nâng band điểm từ B1 lên B2',
                tipText: 'Thay vì chỉ hỏi <em>Should I...?</em>, hãy dùng cặp câu hỏi giả định <strong>Would [A] be comfortable enough, or would [B] be more convenient?</strong> kết hợp cấu trúc <strong>I’d rather ask for... so nobody feels they have to...</strong> để câu văn tự nhiên và đạt điểm cao tiêu chí Grammar &amp; Vocabulary.'
            }
        },
        '4': {
            numLabel: 'Đề 4',
            taskTitle: 'Write a formal inquiry email to the Course Director in London',
            placeholder: 'Dear Sir/Madam,\n\nViết bài của bạn ở đây…',
            promptEn: 'You want to attend a summer English course in London next month. Write an email to the course director at the school to ask for information. In your email, you should:',
            promptVi: 'Bạn muốn tham gia một khóa học tiếng Anh mùa hè tại London vào tháng tới. Hãy viết một email cho giám đốc khóa học tại trường để hỏi thông tin. Trong email, bạn nên:',
            bullets: [
                {
                    en: 'Ask about the exact dates of the courses and the class schedules',
                    vi: 'Hỏi về ngày chính xác của các khóa học và lịch học trên lớp'
                },
                {
                    en: 'Inquire about tuition fees and potential discounts',
                    vi: 'Hỏi về học phí và các khoản giảm giá có thể có'
                },
                {
                    en: 'Ask about accommodation options provided by the school',
                    vi: 'Hỏi về các lựa chọn chỗ ở do nhà trường cung cấp'
                }
            ],
            footerEn: 'Write an email to the course director asking for these details. You should write at least 120 words. Do not include your name or address.',
            footerVi: 'Viết một email cho giám đốc khóa học để hỏi những chi tiết này. Bạn nên viết ít nhất 120 từ. Không ghi tên hoặc địa chỉ của bạn.',
            sampleB1: [
                '<strong>Dear Sir/Madam,</strong>',
                'I am writing to ask for some information about the summer English course at your school next month. I am interested in joining the course because I want to improve my English and practise speaking with other students.',
                'Could you tell me the exact dates of the course and the class schedule? I would also like to know how many hours students study each day and whether classes are held in the morning or afternoon.',
                'In addition, could you let me know how much the course costs? Are there any discounts for students who register early?',
                'Finally, I would like to ask about accommodation. Does your school provide a place to stay, such as a student residence or a room with a local family? Could you also tell me how much it costs?',
                'Thank you for your help. I look forward to hearing from you.',
                '<strong>Kind regards,</strong>'
            ],
            sampleB2: [
                '<strong>Dear Sir/Madam,</strong>',
                'I am writing to ask for some information about the summer English course at your school next month. I am interested in joining the programme because I would like to improve my speaking skills and become more confident when using English in everyday situations.',
                'Could you tell me the exact starting and finishing dates of the course, as well as the class schedule? I would also like to know how many hours of lessons students have each day and whether classes are held in the morning or afternoon.',
                'In addition, could you let me know the tuition fees and whether any discounts are available for early registration or international students? Finally, I would appreciate some information about the accommodation options provided by the school. Are there student residences or host families, and how much do they cost?',
                'Thank you for your time. I look forward to hearing from you.',
                '<strong>Kind regards,</strong>'
            ],
            b1: {
                titleEn: 'Summer English Course in London — Level B1 (Formal)',
                titleVi: 'Gợi ý từ vựng, cấu trúc và dàn ý trình độ B1 (Văn phong trang trọng)',
                exampleColHeader: 'Ví dụ minh họa',
                intro: 'Đây là bức thư điện tử trang trọng (<strong>Formal email</strong>) gửi Giám đốc khóa học (<em>Course Director</em>). Ở trình độ <strong>Level B1</strong>, bạn mở thư bằng <em>Dear Sir/Madam,</em>, <strong>không dùng dạng viết tắt</strong> (<em>I am, I would like</em>) và chia 3 đoạn thân bài rành mạch ứng với 3 yêu cầu của đề.',
                stepsHeader: 'Bố cục bức thư trang trọng gửi Giám đốc khóa học (Level B1) gồm 5 phần:',
                steps: [
                    '1. <strong>Mở thư:</strong> Chào <em>Dear Sir/Madam,</em>, nêu mục đích hỏi thông tin về khóa tiếng Anh mùa hè tháng tới và lý do tham gia (cải thiện tiếng Anh và luyện nói cùng các học viên khác).',
                    '2. <strong>Đoạn 1 (Ngày học &amp; Lịch học):</strong> Hỏi ngày chính xác của khóa học, lịch học, số giờ học mỗi ngày và lớp học tổ chức vào buổi sáng hay buổi chiều.',
                    '3. <strong>Đoạn 2 (Học phí &amp; Giảm giá):</strong> Hỏi tổng chi phí khóa học và xem có giảm giá cho học viên đăng ký sớm không.',
                    '4. <strong>Đoạn 3 (Chỗ ở):</strong> Hỏi trường có cung cấp chỗ ở (ký túc xá sinh viên hoặc phòng ở cùng gia đình bản xứ) không và mức chi phí là bao nhiêu.',
                    '5. <strong>Kết thư:</strong> Cảm ơn sự giúp đỡ, bày tỏ mong đợi hồi âm và chào trang trọng (<em>Kind regards,</em>).'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư điện tử trang trọng hỏi thông tin khóa học (Formal inquiry email).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Giám đốc khóa học (không biết tên) → dùng <em>Dear Sir/Madam,</em> và kết bằng <em>Kind regards,</em>; không viết tắt.',
                    '<strong>3 yêu cầu bắt buộc trong đề:</strong><ul><li>Hỏi về ngày chính xác của khóa học và lịch học (<em>exact dates of the courses and the class schedules</em>).</li><li>Hỏi về học phí và các khoản giảm giá có thể có (<em>tuition fees and potential discounts</em>).</li><li>Hỏi về các lựa chọn chỗ ở do trường cung cấp (<em>accommodation options provided by the school</em>).</li></ul>',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc Formal B1:</strong><ul><li>Mở thư trực tiếp: <code>I am writing to ask for some information about... I am interested in joining... because...</code></li><li>Hỏi lịch học với bị động: <code>whether classes are held in the morning or afternoon.</code></li><li>Đưa ví dụ làm rõ ý hỏi: <code>provide a place to stay, such as a student residence or a room with a local family?</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Chào <em>Dear Sir/Madam,</em>, nêu mục đích hỏi thông tin khóa tiếng Anh mùa hè tháng tới và lý do muốn cải thiện tiếng Anh cũng như thực hành nói cùng các bạn học khác.',
                    '<strong>2. Thân bài 1 — Ngày học &amp; Lịch học (Ý 1):</strong> Hỏi ngày chính xác và lịch học của khóa, số giờ học mỗi ngày và lớp học diễn ra buổi sáng hay buổi chiều.',
                    '<strong>3. Thân bài 2 — Học phí &amp; Giảm giá (Ý 2):</strong> Dùng <em>In addition</em> để hỏi chi phí khóa học và liệu có giảm giá cho học viên đăng ký sớm hay không.',
                    '<strong>4. Thân bài 3 — Chỗ ở (Ý 3):</strong> Dùng <em>Finally</em> để hỏi trường có cung cấp chỗ ở (như ký túc xá sinh viên hoặc ở cùng gia đình địa phương) không và giá bao nhiêu.',
                    '<strong>5. Kết thư &amp; Ký tên:</strong> Cảm ơn sự hỗ trợ, mong nhận hồi âm và ký tên trang trọng (<em>Kind regards,</em>).'
                ],
                vocab: [
                    ['practise speaking', 'v. phr.', 'luyện tập kỹ năng nói', 'Learners can practise speaking in small discussion groups.'],
                    ['exact dates', 'n. phr.', 'ngày chính xác', 'Please confirm the exact dates of the orientation week.'],
                    ['class schedule', 'n. phr.', 'lịch học trên lớp', 'The new class schedule will be posted on Monday morning.'],
                    ['be held', 'v. (passive)', 'được tổ chức', 'Weekly workshops are held in the main auditorium.'],
                    ['register early', 'v. phr.', 'đăng ký sớm', 'Visitors who register early receive priority seating.'],
                    ['accommodation', 'n. (uncountable)', 'chỗ ở, nơi lưu trú', 'Affordable accommodation is easy to find near the campus.'],
                    ['student residence', 'n. phr.', 'ký túc xá sinh viên', 'The student residence is only ten minutes away by bus.'],
                    ['local family', 'n. phr.', 'gia đình bản xứ / địa phương', 'Staying with a local family helps travelers learn daily customs.']
                ],
                tipTitle: 'Lưu ý quan trọng khi viết Formal Email Level B1',
                tipText: 'Từ <strong>accommodation</strong> trong tiếng Anh-Anh là <strong>danh từ không đếm được</strong> (không thêm <em>-s</em>, không dùng <em>an accommodation</em>). Ngoài ra nhớ không dùng dạng viết tắt (<em>I am / I would</em>) trong thư gửi Giám đốc khóa học.'
            },
            b2: {
                titleEn: 'Summer English Course in London — Level B2 (Formal)',
                titleVi: 'Gợi ý từ vựng nâng cao, cấu trúc trang trọng và dàn ý trình độ B2',
                exampleColHeader: 'Ví dụ minh họa',
                intro: 'Ở trình độ <strong>Level B2</strong>, bài viết nâng cấp diễn đạt tự nhiên và chuẩn học thuật hơn thông qua các cụm từ chính xác: <em>programme, everyday situations, starting and finishing dates, as well as, tuition fees, early registration, international students, I would appreciate some information about, host families</em>.',
                stepsHeader: 'Các điểm nâng cấp giúp bài viết đạt chuẩn Level B2:',
                steps: [
                    '1. <strong>Mở thư cụ thể mục tiêu:</strong> Dùng <em>joining the programme</em>, <em>improve my speaking skills</em> và <em>become more confident when using English in everyday situations</em>.',
                    '2. <strong>Đoạn 1 (Ngày học &amp; Lịch học):</strong> Hỏi cụ thể <em>the exact starting and finishing dates, as well as the class schedule</em> và <em>how many hours of lessons students have each day</em>.',
                    '3. <strong>Đoạn 2 (Học phí, Giảm giá &amp; Chỗ ở):</strong> Gộp mạch lạc <em>the tuition fees and whether any discounts are available for early registration or international students</em>; nâng cấp sang mẫu câu lịch sự <em>I would appreciate some information about the accommodation options provided by the school</em> và cụm <em>host families</em>.',
                    '4. <strong>Kết thư trang trọng:</strong> <em>Thank you for your time. I look forward to hearing from you. / Kind regards,</em>'
                ],
                analysis: [
                    '<strong>Dạng bài:</strong> Thư điện tử trang trọng hỏi thông tin khóa học (Formal inquiry email).',
                    '<strong>Người đọc &amp; giọng văn:</strong> Giám đốc khóa học (<em>Dear Sir/Madam,</em> → <em>Kind regards,</em>); lịch sự, chuẩn mực, không viết tắt.',
                    '<strong>Độ dài:</strong> Tối thiểu 120 từ.',
                    '<strong>Ngữ pháp &amp; Cấu trúc ăn điểm Level B2:</strong><ul><li>Mở rộng đối tượng bằng liên từ ghép: <code>the exact starting and finishing dates of the course, as well as the class schedule?</code></li><li>Câu hỏi gián tiếp gộp danh từ + mệnh đề <em>whether</em>: <code>could you let me know the tuition fees and whether any discounts are available for...?</code></li><li>Cấu trúc yêu cầu lịch sự cao: <code>I would appreciate some information about + N + V-ed (reduced relative clause).</code></li></ul>'
                ],
                outline: [
                    '<strong>1. Lời chào &amp; Mở thư:</strong> Chào <em>Dear Sir/Madam,</em>, nêu mục đích hỏi thông tin khóa tiếng Anh mùa hè tháng tới và lý do muốn nâng cao kỹ năng nói cũng như tự tin hơn khi dùng tiếng Anh trong các tình huống hàng ngày.',
                    '<strong>2. Thân bài 1 — Ngày học &amp; Lịch học (Ý 1):</strong> Hỏi ngày bắt đầu – kết thúc chính xác cùng lịch học, số giờ học mỗi ngày và thời gian tổ chức lớp (sáng hay chiều).',
                    '<strong>3. Thân bài 2 — Học phí, Giảm giá &amp; Chỗ ở (Ý 2 &amp; 3):</strong> Hỏi mức học phí và các ưu đãi giảm giá cho đăng ký sớm hoặc sinh viên quốc tế; cuối cùng bày tỏ mong muốn nhận thông tin về các lựa chọn chỗ ở trường cung cấp (ký túc xá sinh viên hoặc gia đình bản xứ) cùng chi phí.',
                    '<strong>4. Kết thư &amp; Ký tên:</strong> Cảm ơn thời gian của giám đốc khóa học, mong nhận hồi âm và chào trang trọng (<em>Kind regards,</em>).'
                ],
                vocab: [
                    ['programme', 'n.', 'chương trình đào tạo / khóa học', 'The exchange programme welcomes undergraduates every July.'],
                    ['everyday situations', 'n. phr.', 'các tình huống thường ngày', 'Role-play activities prepare learners for everyday situations.'],
                    ['starting and finishing dates', 'n. phr.', 'ngày bắt đầu và ngày kết thúc', 'Check the starting and finishing dates before booking flights.'],
                    ['as well as', 'conj. phr.', 'cũng như là', 'The brochure lists course fees as well as exam deadlines.'],
                    ['tuition fees', 'n. phr.', 'học phí', 'Students can pay their tuition fees in two installments.'],
                    ['early registration', 'n. phr.', 'việc đăng ký sớm', 'Conference organizers encourage early registration to save costs.'],
                    ['international students', 'n. phr.', 'sinh viên / học viên quốc tế', 'Orientation sessions help international students settle in quickly.'],
                    ['host families', 'n. phr.', 'các gia đình bản xứ nhận học sinh ở ghép', 'Many summer schools match teenagers with friendly host families.']
                ],
                upgrades: [
                    ['Mở thư', 'joining the course... improve my English and practise speaking', '<strong>joining the programme... improve my speaking skills and become more confident when using English in everyday situations</strong>'],
                    ['Ngày &amp; Lịch học', 'the exact dates of the course and the class schedule / how many hours students study', '<strong>the exact starting and finishing dates of the course, as well as the class schedule</strong> / <strong>how many hours of lessons students have</strong>'],
                    ['Học phí &amp; Giảm giá', 'how much the course costs / students who register early', '<strong>the tuition fees and whether any discounts are available for early registration or international students</strong>'],
                    ['Chỗ ở', 'I would like to ask about accommodation / a room with a local family', '<strong>I would appreciate some information about the accommodation options provided by the school</strong> / <strong>host families</strong>']
                ],
                tipTitle: 'Mẹo nâng band điểm Formal Email từ B1 lên B2',
                tipText: 'Biến mệnh đề động từ dài thành cụm danh từ học thuật (<em>students who register early</em> → <strong>early registration</strong>; <em>a room with a local family</em> → <strong>host families</strong>; <em>how much the course costs</em> → <strong>the tuition fees</strong>) và dùng <strong>I would appreciate some information about...</strong> sẽ giúp văn phong chuyên nghiệp hơn rõ rệt.'
            }
        }
    };

    function getInquiryStorageKey(promptId) {
        return getUserScopedKey(`vstep_inquiry_draft_prompt_${promptId}`);
    }

    function getInquirySubmittedKey(promptId) {
        return getUserScopedKey(`vstep_inquiry_submitted_prompt_${promptId}`);
    }

    function getInquiryLessonId(promptId) {
        return `inquiry-${String(promptId || currentInquiryPromptId)}`;
    }

    function updateInquiryHeaderTag() {
        const pData = INQUIRY_PROMPTS_DATA[currentInquiryPromptId];
        if (inquiryCurrentLevelTag && pData) {
            inquiryCurrentLevelTag.textContent = ` · ${pData.numLabel} · Level ${currentInquiryLevel}`;
        }
    }

    // 16b.1 Level B1 / Level B2 Switcher
    inquiryLevelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const level = btn.getAttribute('data-inquiry-level');
            currentInquiryLevel = level === 'B2' ? 'B2' : 'B1';
            inquiryLevelBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (currentInquiryLevel === 'B2') {
                if (inquiryGuideB1) inquiryGuideB1.style.display = 'none';
                if (inquiryGuideB2) inquiryGuideB2.style.display = 'flex';
            } else {
                if (inquiryGuideB1) inquiryGuideB1.style.display = 'flex';
                if (inquiryGuideB2) inquiryGuideB2.style.display = 'none';
            }

            updateInquiryHeaderTag();

            if (inquiryTheoryScrollPane) {
                inquiryTheoryScrollPane.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });

    // 16b.2 Draggable Split-Screen Resizer
    attachSplitResizer(inquiryResizer, inquiryWorkspace, 30, 70);

    // 16b.3 Toggle Prompt Translation
    if (inquiryTogglePromptTransBtn && inquiryPromptCard) {
        inquiryTogglePromptTransBtn.addEventListener('click', () => {
            const isShown = inquiryPromptCard.classList.toggle('show-vi');
            inquiryTogglePromptTransBtn.classList.toggle('active', isShown);
            const span = inquiryTogglePromptTransBtn.querySelector('span');
            if (span) {
                span.textContent = isShown ? 'Ẩn dịch đề' : 'Dịch đề bài';
            }
        });
    }

    // 16b.4 Countdown Timer (20:00)
    bindCountdownTimer(inquiryTimerBtn, inquiryTimerDisplay, 20 * 60, 120);

    // 16b.5 Word Counter, Prompt Switcher (4 Đề), LocalStorage Draft, Cloud Submit & Sample Comparison
    function getInquiryMinWords() {
        return parseInt((inquiryTextarea && inquiryTextarea.getAttribute('data-min-words')) || '120', 10);
    }

    function checkStoredInquirySubmitted(promptId, draftText) {
        const minW = getInquiryMinWords();
        if (countWordsClean(draftText) < minW) return false;
        try {
            return localStorage.getItem(getInquirySubmittedKey(promptId)) === '1';
        } catch (e) {
            return false;
        }
    }

    function populateInquirySamples(promptId, allowShow) {
        const pData = INQUIRY_PROMPTS_DATA[promptId];
        if (!allowShow || !pData) {
            if (inquiryFbSampleB1) inquiryFbSampleB1.innerHTML = '';
            if (inquiryFbSampleB2) inquiryFbSampleB2.innerHTML = '';
            return;
        }
        if (inquiryFbSampleB1) {
            inquiryFbSampleB1.innerHTML = pData.sampleB1.map(p => `<p>${p}</p>`).join('');
        }
        if (inquiryFbSampleB2) {
            inquiryFbSampleB2.innerHTML = pData.sampleB2.map(p => `<p>${p}</p>`).join('');
        }
    }

    function syncInquirySampleUI(revealSample = false) {
        const canViewSample = isCurrentInquirySubmitted || canPreviewSampleWithoutSubmit();
        if (!canViewSample) {
            populateInquirySamples(currentInquiryPromptId, false);
            if (inquiryFeedbackBox) {
                inquiryFeedbackBox.style.display = 'none';
            }
            if (inquiryPeekSampleBtn) {
                inquiryPeekSampleBtn.disabled = true;
                inquiryPeekSampleBtn.classList.add('locked');
                inquiryPeekSampleBtn.innerHTML = '<i class="fas fa-lock"></i> Xem bài mẫu';
                inquiryPeekSampleBtn.title = 'Hãy viết đủ 120 từ và bấm Nộp bài để mở khóa bài mẫu';
            }
            if (inquirySubmitBtn && !authState.isSubmittingInquiry) {
                inquirySubmitBtn.textContent = 'Nộp bài';
            }
            return;
        }

        populateInquirySamples(currentInquiryPromptId, true);
        const wc = countWordsClean(inquiryTextarea ? inquiryTextarea.value : '');
        if (inquiryFeedbackTitle) {
            inquiryFeedbackTitle.textContent = isCurrentInquirySubmitted
                ? `✓ Đã nộp bài viết (${wc} từ)! Đối chiếu với bài mẫu chuẩn:`
                : '👁️ Chế độ Admin · Xem trước bài mẫu chuẩn:';
        }
        if (inquiryFeedbackBox) {
            inquiryFeedbackBox.style.display = revealSample ? 'block' : 'none';
        }
        if (inquiryPeekSampleBtn) {
            inquiryPeekSampleBtn.disabled = false;
            inquiryPeekSampleBtn.classList.remove('locked');
            inquiryPeekSampleBtn.innerHTML = revealSample
                ? '<i class="fas fa-eye-slash"></i> Ẩn bài mẫu'
                : '<i class="fas fa-eye"></i> Xem bài mẫu';
            inquiryPeekSampleBtn.title = isCurrentInquirySubmitted
                ? 'Ẩn / Hiện bài mẫu đối chiếu'
                : 'Chế độ Admin: Xem trước bài mẫu không cần nộp bài';
        }
        if (inquirySubmitBtn && !authState.isSubmittingInquiry) {
            inquirySubmitBtn.textContent = isCurrentInquirySubmitted ? 'Nộp lại' : 'Nộp bài';
        }
    }

    function updateInquiryWordState() {
        if (!inquiryTextarea) return;
        const minW = getInquiryMinWords();
        const wc = countWordsClean(inquiryTextarea.value);
        const needed = Math.max(0, minW - wc);
        const canSubmit = wc >= minW;
        const cloudSub = getCloudSubmission(getInquiryLessonId(currentInquiryPromptId));

        if (inquiryWcEl) {
            inquiryWcEl.textContent = `${wc} từ`;
        }
        if (inquiryStatusEl) {
            if (cloudSub && cloudSub.is_submitted) {
                inquiryStatusEl.textContent = canSubmit
                    ? `✓ Đã nộp cho Giáo viên (${wc} từ) · Đã mở khóa bài mẫu`
                    : `${wc}/${minW} từ · cần thêm ${needed} từ để nộp bản sửa mới`;
            } else if (isCurrentInquirySubmitted) {
                inquiryStatusEl.textContent = canSubmit
                    ? `✓ Đã nộp (${wc} từ) · Đã mở khóa bài mẫu`
                    : `${wc}/${minW} từ · cần thêm ${needed} từ để nộp lại`;
            } else if (canPreviewSampleWithoutSubmit()) {
                inquiryStatusEl.textContent = canSubmit
                    ? `${wc}/${minW} từ · Đủ điều kiện nộp bài · Admin có thể xem trước bài mẫu`
                    : `${wc}/${minW} từ · Admin có thể xem trước bài mẫu không cần nộp bài`;
            } else {
                inquiryStatusEl.textContent = canSubmit
                    ? `${wc}/${minW} từ · Đủ điều kiện — bấm Nộp bài để gửi Giáo viên & xem bài mẫu`
                    : `${wc}/${minW} từ · cần thêm ${needed} từ để nộp & xem bài mẫu`;
            }
            inquiryStatusEl.classList.toggle('ready', canSubmit || isCurrentInquirySubmitted || Boolean(cloudSub && cloudSub.is_submitted));
        }
        if (inquirySubmitBtn) {
            inquirySubmitBtn.disabled = !canSubmit || authState.isSubmittingInquiry;
            inquirySubmitBtn.classList.toggle('unanswered', !canSubmit);
        }
    }

    function selectInquiryPrompt(promptId, options = {}) {
        const { skipScroll = false } = options;
        const pData = INQUIRY_PROMPTS_DATA[promptId];
        if (!pData) return;
        currentInquiryPromptId = String(promptId);

        if (inquiryPromptSelect) {
            inquiryPromptSelect.value = currentInquiryPromptId;
        }
        inquiryPromptNumBtns.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-inquiry-prompt') === currentInquiryPromptId);
        });

        if (inquiryGuideB1) {
            inquiryGuideB1.innerHTML = buildLevelGuideHtml('B1', pData.b1);
        }
        if (inquiryGuideB2) {
            inquiryGuideB2.innerHTML = buildLevelGuideHtml('B2', pData.b2);
        }

        if (inquiryExNumPill) {
            inquiryExNumPill.textContent = pData.numLabel;
        }
        if (inquiryExTitle) {
            inquiryExTitle.textContent = pData.taskTitle;
        }
        if (inquiryPromptCard) {
            inquiryPromptCard.innerHTML = `
                <p class="draft-prompt-para">${pData.promptEn}</p>
                <p class="draft-prompt-vi">${pData.promptVi}</p>
                <ul class="draft-prompt-bullets">
                    ${pData.bullets.map(b => `
                        <li>
                            <span>${b.en}</span>
                            <span class="draft-prompt-vi">${b.vi}</span>
                        </li>
                    `).join('')}
                </ul>
                <p class="draft-prompt-footer-note">${pData.footerEn}</p>
                <p class="draft-prompt-vi">${pData.footerVi}</p>
            `;
        }

        const cloudSub = getCloudSubmission(getInquiryLessonId(currentInquiryPromptId));
        let saved = '';
        if (inquiryTextarea) {
            inquiryTextarea.placeholder = pData.placeholder;
            try {
                saved = localStorage.getItem(getInquiryStorageKey(currentInquiryPromptId)) || '';
            } catch (e) {}
            if (!saved && cloudSub && cloudSub.content) {
                saved = cloudSub.content;
            }
            inquiryTextarea.value = saved;
        }

        isCurrentInquirySubmitted = Boolean(cloudSub && cloudSub.is_submitted) || checkStoredInquirySubmitted(currentInquiryPromptId, saved);
        syncInquirySampleUI(false);
        renderTeacherFeedbackBox(inquiryTeacherFeedbackBox, cloudSub);
        updateInquiryWordState();
        updateInquiryHeaderTag();

        if (!skipScroll) {
            if (inquiryTheoryScrollPane) {
                inquiryTheoryScrollPane.scrollTo({ top: 0, behavior: 'smooth' });
            }
            const exScrollPane = document.getElementById('inquiry-exercises-scroll-pane');
            if (exScrollPane) {
                exScrollPane.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }

    if (inquiryPromptSelect) {
        inquiryPromptSelect.addEventListener('change', (e) => {
            draftSaver.flush();
            selectInquiryPrompt(e.target.value);
        });
    }

    inquiryPromptNumBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            draftSaver.flush();
            selectInquiryPrompt(btn.getAttribute('data-inquiry-prompt'));
        });
    });

    if (inquiryTextarea) {
        inquiryTextarea.addEventListener('input', () => {
            updateInquiryWordState();
            draftSaver.schedule(getInquiryStorageKey(currentInquiryPromptId), inquiryTextarea.value);
        });
        inquiryTextarea.addEventListener('blur', () => draftSaver.flush());
    }

    if (inquirySubmitBtn && inquiryFeedbackBox) {
        inquirySubmitBtn.addEventListener('click', async () => {
            const minW = getInquiryMinWords();
            const content = inquiryTextarea ? inquiryTextarea.value.trim() : '';
            const wc = countWordsClean(content);
            if (wc < minW || authState.isSubmittingInquiry) return;

            const submittedPromptId = currentInquiryPromptId;
            const submittedLevel =
                CLOUD && typeof CLOUD.inferTargetLevelFromClass === 'function'
                    ? CLOUD.inferTargetLevelFromClass(currentAccount && currentAccount.className, currentInquiryLevel)
                    : currentInquiryLevel;
            const pData = INQUIRY_PROMPTS_DATA[submittedPromptId];
            const lessonId = getInquiryLessonId(submittedPromptId);
            const existingSub = getCloudSubmission(lessonId);
            if (
                existingSub &&
                existingSub.is_submitted &&
                String(existingSub.content || '').trim() === content &&
                String(existingSub.target_level || 'B1').toUpperCase() === submittedLevel &&
                existingSub.ai_status !== 'error' &&
                existingSub.ai_status !== 'skipped'
            ) {
                if (inquiryStatusEl) {
                    inquiryStatusEl.textContent = `✓ Bài viết và trình độ Level ${submittedLevel} không thay đổi so với lần nộp trước.`;
                    inquiryStatusEl.classList.add('ready');
                }
                return;
            }

            const lessonTitle = getCatalogLessonTitle(
                lessonId,
                pData ? `Task 01 · Hỏi thông tin ${submittedPromptId}: ${pData.taskTitle}` : lessonId
            );
            const promptText = pData
                ? `${pData.promptEn}\n${(pData.bullets || []).map(b => `- ${b.en}`).join('\n')}`
                : '';

            authState.isSubmittingInquiry = true;
            inquirySubmitBtn.disabled = true;
            inquirySubmitBtn.textContent = 'Đang nộp...';

            const res = await submitWritingToCloud({
                taskType: 'task1',
                lessonId,
                lessonTitle,
                promptText,
                content,
                wordCount: wc,
                targetLevel: submittedLevel
            });

            authState.isSubmittingInquiry = false;
            const stillSamePrompt = currentInquiryPromptId === submittedPromptId;

            if (!res.ok) {
                if (stillSamePrompt) {
                    inquirySubmitBtn.disabled = false;
                    inquirySubmitBtn.textContent = isCurrentInquirySubmitted ? 'Nộp lại' : 'Nộp bài';
                    if (inquiryStatusEl) {
                        inquiryStatusEl.textContent = `⚠️ Lỗi gửi bài lên Giáo viên: ${res.error}`;
                        inquiryStatusEl.classList.remove('ready');
                    }
                }
                return;
            }

            try {
                localStorage.setItem(getInquirySubmittedKey(submittedPromptId), '1');
            } catch (e) {}

            if (!stillSamePrompt) return;

            isCurrentInquirySubmitted = true;
            syncInquirySampleUI(true);
            renderTeacherFeedbackBox(inquiryTeacherFeedbackBox, res.row);
            updateInquiryWordState();
            if (inquiryTeacherFeedbackBox && inquiryTeacherFeedbackBox.style.display !== 'none') {
                inquiryTeacherFeedbackBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                inquiryFeedbackBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    if (inquiryPeekSampleBtn && inquiryFeedbackBox) {
        inquiryPeekSampleBtn.addEventListener('click', () => {
            if (!isCurrentInquirySubmitted && !canPreviewSampleWithoutSubmit()) return;
            const isHidden = inquiryFeedbackBox.style.display === 'none' || inquiryFeedbackBox.style.display === '';
            syncInquirySampleUI(isHidden);
            if (isHidden) {
                inquiryFeedbackBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    if (inquiryResetBtn && inquiryTextarea) {
        inquiryResetBtn.addEventListener('click', () => {
            if (inquiryTextarea.value.trim().length > 0) {
                if (!confirm('Bạn có chắc muốn xoá nội dung đang viết để viết lại từ đầu?')) {
                    return;
                }
            }
            inquiryTextarea.value = '';
            const cloudSub = getCloudSubmission(getInquiryLessonId(currentInquiryPromptId));
            isCurrentInquirySubmitted = Boolean(cloudSub && cloudSub.is_submitted);
            const inquiryKey = getInquiryStorageKey(currentInquiryPromptId);
            draftSaver.cancel(inquiryKey);
            try {
                localStorage.removeItem(inquiryKey);
                localStorage.removeItem(getInquirySubmittedKey(currentInquiryPromptId));
            } catch (e) {}
            syncInquirySampleUI(false);
            updateInquiryWordState();
            inquiryTextarea.focus();
        });
    }

    inquiryFbTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const lv = tab.getAttribute('data-inquiry-fb-level');
            inquiryFbTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (lv === 'B2') {
                if (inquiryFbSampleB1) inquiryFbSampleB1.style.display = 'none';
                if (inquiryFbSampleB2) inquiryFbSampleB2.style.display = 'block';
            } else {
                if (inquiryFbSampleB1) inquiryFbSampleB1.style.display = 'block';
                if (inquiryFbSampleB2) inquiryFbSampleB2.style.display = 'none';
            }
        });
    });

    // Populate initial Inquiry Prompt 1 (Concert Ticket — Alex) immediately on load
    selectInquiryPrompt('1', { skipScroll: true });

    // --- 17. Task 2 Essay Writing Workspace (#viet-luan) — Multi-Topic ---
    const essayWorkspace = document.getElementById('essay-split-workspace');
    const essayResizer = document.getElementById('essay-split-resizer');
    const essayLevelBtns = document.querySelectorAll('[data-essay-level]');
    const essayTopicContainers = document.querySelectorAll('.essay-topic-guides[data-essay-topic]');
    const essayCurrentLevelTag = document.getElementById('essay-current-level-tag');
    const essayTheoryScrollPane = document.getElementById('essay-theory-scroll-pane');
    const essayExercisesScrollPane = document.getElementById('essay-exercises-scroll-pane');
    const essayPromptTextEl = document.getElementById('essay-prompt-text');
    const essayTimerBtn = document.getElementById('essay-timer-btn');
    const essayTimerDisplay = document.getElementById('essay-timer-display');
    const essayTextarea = document.getElementById('essay-writing-textarea');
    const essayWcEl = document.getElementById('essay-writing-wc');
    const essayStatusEl = document.getElementById('essay-writing-status');
    const essaySubmitBtn = document.getElementById('essay-submit-btn');
    const essayResetBtn = document.getElementById('essay-reset-btn');
    const essayTeacherFeedbackBox = document.getElementById('essay-teacher-feedback-box');

    const ESSAY_TOPICS = {
        'children-devices': {
            title: 'Chủ đề 1: Trẻ em & Thiết bị điện tử',
            storageKey: 'vstep_essay_children_devices_draft',
            prompt: "Nowadays, an increasing number of children spend a great deal of time using electronic devices such as smartphones, tablets, and video games instead of engaging in traditional activities like playing outdoors or reading books. This growing dependence on technology has raised concerns among parents and educators about its impact on children's physical health and social development. Discuss the causes of this problem and suggest possible solutions."
        },
        'fast-fashion': {
            title: 'Chủ đề 2: Thời trang nhanh & Môi trường',
            storageKey: 'vstep_essay_fast_fashion_draft',
            prompt: "The rapid growth of the fast fashion industry has been identified as one of the major contributors to global carbon emissions, reportedly accounting for around 10% of the world's total emissions. This growing trend is causing serious damage to the environment through pollution, resource depletion and textile waste. Discuss the causes of this problem and suggest possible solutions to reduce it."
        },
        'choosing-job': {
            title: 'Chủ đề 3: Lựa chọn công việc & Sự hài lòng',
            storageKey: 'vstep_essay_choosing_job_draft',
            prompt: "When choosing a job, people consider a wide range of factors, from salary and working environment to personal interests and career growth opportunities. While some believe that salary is the most important factor, others argue that job satisfaction and future prospects matter more. In your opinion, what is the most important factor when choosing a job? Give reasons and examples to support your answer."
        },
        'self-employment': {
            title: 'Chủ đề 4: Tự kinh doanh / Tự làm chủ',
            storageKey: 'vstep_essay_self_employment_draft',
            prompt: "In recent years, an increasing number of people have chosen to become self-employed rather than work for a company. While self-employment offers greater flexibility and independence, it also comes with certain risks and challenges that traditional employees do not usually face. Discuss the advantages and disadvantages of self-employment."
        },
        'traffic-lights': {
            title: 'Chủ đề 5: Bỏ đèn giao thông tại ngã tư đông đúc',
            storageKey: 'vstep_essay_traffic_lights_draft',
            prompt: "A pilot programme of removing traffic lights at busy intersections has recently been introduced in some cities as a new approach to traffic management. Some people believe that this measure can reduce traffic congestion, while others argue that it increases the risk of accidents at these intersections. What is your opinion on removing traffic lights at busy intersections?"
        },
        'tourism-growth': {
            title: 'Chủ đề 6: Sự gia tăng lượng khách du lịch',
            storageKey: 'vstep_essay_tourism_growth_draft',
            prompt: "In recent years, many popular destinations around the world have experienced a significant rise in the number of tourists visiting each year. While this growth in tourism brings notable economic benefits to local communities, it also raises a number of concerns regarding the environment and the quality of life for residents. Discuss the advantages and disadvantages of this increase in tourist numbers."
        },
        'leaving-cities': {
            title: 'Chủ đề 7: Người trẻ bỏ phố về quê',
            storageKey: 'vstep_essay_leaving_cities_draft',
            prompt: "In recent years, an increasing number of young people have chosen to leave big cities and return to their rural hometowns to live and work. This growing trend has sparked debate about whether moving back to the countryside truly benefits young people or creates new challenges for them. Discuss the advantages and disadvantages of young people leaving cities to return to their hometowns."
        },
        'job-hopping': {
            title: 'Chủ đề 8: Người trẻ thường xuyên nhảy việc',
            storageKey: 'vstep_essay_job_hopping_draft',
            prompt: "In recent years, it has become increasingly common for young people to change jobs frequently rather than staying with one employer for a long period. This trend can be attributed to several factors, and it brings about a number of consequences for both individuals and organizations. Analyze the causes of this trend among young people and its effects."
        },
        'parent-teen-conflicts': {
            title: 'Chủ đề 9: Xung đột giữa cha mẹ và con tuổi teen',
            storageKey: 'vstep_essay_parent_teen_conflicts_draft',
            prompt: "Conflicts between parents and their teenage children have become increasingly common in modern families, often arising from generational differences and miscommunication. These conflicts can affect family relationships significantly if not addressed properly, making it important to understand their root causes and find effective ways to resolve them. Discuss the causes of conflicts between parents and their teenage children and suggest possible solutions."
        },
        'youth-stress': {
            title: 'Chủ đề 10: Nguyên nhân gây căng thẳng ở người trẻ',
            storageKey: 'vstep_essay_youth_stress_draft',
            prompt: "Nowadays, many young people experience stress in their daily lives. What are the main causes of stress among young people?"
        },
        'elderly-technology': {
            title: 'Chủ đề 11: Người cao tuổi với Điện thoại & Internet',
            storageKey: 'vstep_essay_elderly_technology_draft',
            prompt: "Mobile phones and the internet are now very useful for old people. However, this part of the population is the fewer users of mobile phones and the Internet. In which ways can mobile phones and the Internet be useful for old people? How can old people be encouraged to use this new technology?"
        },
        'glass-office-buildings': {
            title: 'Chủ đề 12: Tác động của tòa nhà văn phòng kính',
            storageKey: 'vstep_essay_glass_office_buildings_draft',
            prompt: "In recent years, working in modern glass office buildings has become increasingly common in many cities. However, this type of working environment can have several effects on workers and the environment. It may consume a large amount of energy, cause light pollution, and increase stress among office workers. Write an essay discussing the effects of working in modern glass office buildings."
        }
    };

    let currentEssayTopic = 'children-devices';
    let currentEssayLevel = 'B1';
    let essayRemainingSec = 40 * 60;
    let essayTimerInterval = null;

    function getCurrentEssayStorageKey() {
        const base = (ESSAY_TOPICS[currentEssayTopic] && ESSAY_TOPICS[currentEssayTopic].storageKey)
            || 'vstep_essay_children_devices_draft';
        return getUserScopedKey(base);
    }

    function renderEssayTimer() {
        if (!essayTimerDisplay) return;
        const m = Math.floor(essayRemainingSec / 60).toString().padStart(2, '0');
        const s = (essayRemainingSec % 60).toString().padStart(2, '0');
        essayTimerDisplay.textContent = `${m}:${s}`;
    }

    function resetEssayTimer() {
        if (essayTimerInterval) {
            clearInterval(essayTimerInterval);
            essayTimerInterval = null;
        }
        essayRemainingSec = 40 * 60;
        if (essayTimerBtn) {
            essayTimerBtn.classList.remove('running', 'warning');
        }
        renderEssayTimer();
    }

    const essayTopicMap = new Map();
    essayTopicContainers.forEach(container => {
        const key = container.getAttribute('data-essay-topic');
        if (key) essayTopicMap.set(key, container);
    });

    function applyEssayLevel(lv) {
        currentEssayLevel = lv === 'B2' ? 'B2' : 'B1';
        essayLevelBtns.forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-essay-level') === currentEssayLevel);
        });

        const activeContainer = essayTopicMap.get(currentEssayTopic);
        if (activeContainer) {
            const b1Sec = activeContainer.querySelector('[data-topic-level="B1"]');
            const b2Sec = activeContainer.querySelector('[data-topic-level="B2"]');
            if (b1Sec) b1Sec.style.display = currentEssayLevel === 'B1' ? 'flex' : 'none';
            if (b2Sec) b2Sec.style.display = currentEssayLevel === 'B2' ? 'flex' : 'none';
        }

        if (essayCurrentLevelTag) {
            essayCurrentLevelTag.textContent = currentEssayLevel === 'B2' ? ' · Level B2' : ' · Level B1';
        }
    }

    function updateEssayWordState() {
        if (!essayTextarea) return;
        const minW = parseInt(essayTextarea.getAttribute('data-min-words') || '250', 10);
        const wc = countWordsClean(essayTextarea.value);
        const needed = Math.max(0, minW - wc);
        const canSubmit = wc >= minW;
        const cloudSub = getCloudSubmission(currentEssayTopic);
        const hasSubmitted = Boolean(cloudSub && cloudSub.is_submitted);

        if (essayWcEl) {
            essayWcEl.textContent = `${wc} từ`;
        }
        if (essayStatusEl) {
            if (hasSubmitted) {
                essayStatusEl.textContent = canSubmit
                    ? `✓ Đã nộp cho Giáo viên (${wc} từ)`
                    : `${wc}/${minW} từ · cần thêm ${needed} từ để nộp bản sửa mới`;
            } else {
                essayStatusEl.textContent = canSubmit
                    ? `✓ ${wc}/${minW} từ · Đủ độ dài — bấm Nộp bài để gửi Giáo viên`
                    : `${wc}/${minW} từ · cần thêm ${needed} từ`;
            }
            essayStatusEl.classList.toggle('ready', canSubmit || hasSubmitted);
        }
        if (essaySubmitBtn) {
            essaySubmitBtn.disabled = !canSubmit || authState.isSubmittingEssay;
            essaySubmitBtn.classList.toggle('unanswered', !canSubmit);
            if (!authState.isSubmittingEssay) {
                essaySubmitBtn.textContent = hasSubmitted ? 'Nộp lại' : 'Nộp bài';
            }
        }
    }

    function selectEssayTopic(topicId, options = {}) {
        const { skipResetTimer = false, skipScroll = false } = options;
        const topic = ESSAY_TOPICS[topicId] || ESSAY_TOPICS['children-devices'];
        currentEssayTopic = ESSAY_TOPICS[topicId] ? topicId : 'children-devices';

        // Show matching topic guide container
        essayTopicContainers.forEach(container => {
            const isMatch = container.getAttribute('data-essay-topic') === currentEssayTopic;
            container.style.display = isMatch ? 'block' : 'none';
        });

        // Update prompt text & topbar label metadata
        if (essayPromptTextEl) {
            essayPromptTextEl.textContent = topic.prompt;
        }
        if (VIEW_META['viet-luan']) {
            VIEW_META['viet-luan'].label = topic.title;
        }

        // Default to Level B1 when opening a topic
        if (!skipResetTimer) {
            applyEssayLevel('B1');
        }

        // Load saved draft or cloud submission for this specific topic
        const cloudSub = getCloudSubmission(currentEssayTopic);
        if (essayTextarea) {
            let savedDraft = '';
            try {
                savedDraft = localStorage.getItem(getCurrentEssayStorageKey()) || '';
            } catch (e) {}
            if (!savedDraft && cloudSub && cloudSub.content) {
                savedDraft = cloudSub.content;
            }
            essayTextarea.value = savedDraft;
            updateEssayWordState();
        }

        renderTeacherFeedbackBox(essayTeacherFeedbackBox, cloudSub);

        if (!skipResetTimer) {
            resetEssayTimer();
        }

        if (!skipScroll) {
            if (essayTheoryScrollPane) essayTheoryScrollPane.scrollTop = 0;
            if (essayExercisesScrollPane) essayExercisesScrollPane.scrollTop = 0;
        }
    }

    // Bind topic opener cards/buttons
    document.querySelectorAll('[data-open-essay]').forEach(btn => {
        btn.addEventListener('click', () => {
            draftSaver.flush();
            const topicId = btn.getAttribute('data-open-essay');
            selectEssayTopic(topicId);
            navigateToView('viet-luan');
        });
    });

    // 17.1 Level B1 / Level B2 Switcher
    essayLevelBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            applyEssayLevel(btn.getAttribute('data-essay-level'));
            if (essayTheoryScrollPane) {
                essayTheoryScrollPane.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });

    // 17.2 Draggable Split-Screen Resizer for Essay Tab
    attachSplitResizer(essayResizer, essayWorkspace, 32, 72);

    // 17.3 Toggle Sample Essay (Show / Hide) for B1 & B2 (Delegated)
    if (essayTheoryScrollPane) {
        essayTheoryScrollPane.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-essay-sample-toggle]');
            if (!btn) return;
            const targetId = btn.getAttribute('data-essay-sample-toggle');
            const body = targetId ? document.getElementById(targetId) : null;
            if (!body) return;
            const isHidden = body.style.display === 'none' || window.getComputedStyle(body).display === 'none';
            body.style.display = isHidden ? 'block' : 'none';
            btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = isHidden ? 'far fa-eye-slash' : 'far fa-eye';
            }
            const label = btn.querySelector('span');
            if (label) {
                label.textContent = isHidden ? 'Ẩn bài mẫu' : 'Hiện bài mẫu';
            }
        });
    }

    // 17.5 Countdown Timer (40:00 for VSTEP Essay Task 2)
    if (essayTimerBtn && essayTimerDisplay) {
        essayTimerBtn.addEventListener('click', () => {
            if (essayTimerInterval) {
                clearInterval(essayTimerInterval);
                essayTimerInterval = null;
                essayTimerBtn.classList.remove('running');
                return;
            }
            if (essayRemainingSec <= 0) {
                essayRemainingSec = 40 * 60;
                essayTimerBtn.classList.remove('warning');
            }
            essayTimerBtn.classList.add('running');
            essayTimerInterval = setInterval(() => {
                if (essayRemainingSec > 0) {
                    essayRemainingSec--;
                    renderEssayTimer();
                    if (essayRemainingSec <= 300) {
                        essayTimerBtn.classList.remove('running');
                        essayTimerBtn.classList.add('warning');
                    }
                } else {
                    clearInterval(essayTimerInterval);
                    essayTimerInterval = null;
                    essayTimerDisplay.textContent = 'Hết giờ!';
                }
            }, 1000);
        });
    }

    // 17.6 Essay Writing Textarea & Word Count
    if (essayTextarea) {
        try {
            const savedEssay = localStorage.getItem(getCurrentEssayStorageKey()) || '';
            if (savedEssay) {
                essayTextarea.value = savedEssay;
            }
        } catch (e) {}
        updateEssayWordState();

        essayTextarea.addEventListener('input', () => {
            updateEssayWordState();
            draftSaver.schedule(getCurrentEssayStorageKey(), essayTextarea.value);
        });
        essayTextarea.addEventListener('blur', () => draftSaver.flush());
    }

    if (essaySubmitBtn) {
        essaySubmitBtn.addEventListener('click', async () => {
            const content = essayTextarea ? essayTextarea.value.trim() : '';
            const wc = countWordsClean(content);
            if (wc < 250 || authState.isSubmittingEssay) return;

            const submittedTopicId = currentEssayTopic;
            const submittedLevel =
                CLOUD && typeof CLOUD.inferTargetLevelFromClass === 'function'
                    ? CLOUD.inferTargetLevelFromClass(currentAccount && currentAccount.className, currentEssayLevel)
                    : currentEssayLevel;
            const topic = ESSAY_TOPICS[submittedTopicId] || ESSAY_TOPICS['children-devices'];
            const lessonId = submittedTopicId;
            const existingSub = getCloudSubmission(lessonId);
            if (
                existingSub &&
                existingSub.is_submitted &&
                String(existingSub.content || '').trim() === content &&
                String(existingSub.target_level || 'B1').toUpperCase() === submittedLevel &&
                existingSub.ai_status !== 'error' &&
                existingSub.ai_status !== 'skipped'
            ) {
                if (essayStatusEl) {
                    essayStatusEl.textContent = `✓ Bài viết và trình độ Level ${submittedLevel} không thay đổi so với lần nộp trước.`;
                    essayStatusEl.classList.add('ready');
                }
                return;
            }

            const lessonTitle = getCatalogLessonTitle(lessonId, `Task 02 · ${topic.title}`);

            authState.isSubmittingEssay = true;
            essaySubmitBtn.disabled = true;
            essaySubmitBtn.textContent = 'Đang nộp...';

            const res = await submitWritingToCloud({
                taskType: 'task2',
                lessonId,
                lessonTitle,
                promptText: topic.prompt || '',
                content,
                wordCount: wc,
                targetLevel: submittedLevel
            });

            authState.isSubmittingEssay = false;
            const stillSameTopic = currentEssayTopic === submittedTopicId;

            if (!stillSameTopic) return;

            if (!res.ok) {
                essaySubmitBtn.disabled = false;
                essaySubmitBtn.textContent = getCloudSubmission(lessonId) ? 'Nộp lại' : 'Nộp bài';
                if (essayStatusEl) {
                    essayStatusEl.textContent = `⚠️ Lỗi gửi bài lên Giáo viên: ${res.error}`;
                    essayStatusEl.classList.remove('ready');
                }
                return;
            }

            renderTeacherFeedbackBox(essayTeacherFeedbackBox, res.row);
            updateEssayWordState();
            if (essayTeacherFeedbackBox && essayTeacherFeedbackBox.style.display !== 'none') {
                essayTeacherFeedbackBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    if (essayResetBtn && essayTextarea) {
        essayResetBtn.addEventListener('click', () => {
            if (essayTextarea.value.trim().length > 0) {
                if (!confirm('Bạn có chắc muốn xoá nội dung đang viết để viết lại từ đầu?')) {
                    return;
                }
            }
            essayTextarea.value = '';
            const essayKey = getCurrentEssayStorageKey();
            draftSaver.cancel(essayKey);
            try {
                localStorage.removeItem(essayKey);
            } catch (e) {}
            updateEssayWordState();
            essayTextarea.focus();
        });
    }

    // --- 18. Supabase Auth Gate, Mandatory Profile Setup, Notifications & Session Bootstrap ---
    const authGateEl = document.getElementById('writing-auth-gate');
    const mainAppLayout = document.getElementById('main-app-layout');
    const topbarTeacherLink = document.getElementById('topbar-teacher-link');
    const topbarNotifWrap = document.getElementById('topbar-notif-wrap');
    const topbarNotifBtn = document.getElementById('topbar-notif-btn');
    const topbarNotifBadge = document.getElementById('topbar-notif-badge');
    const topbarNotifDropdown = document.getElementById('topbar-notif-dropdown');
    const topbarNotifList = document.getElementById('topbar-notif-list');
    const topbarAccountPill = document.getElementById('topbar-account-pill');
    const topbarUserInitials = document.getElementById('topbar-user-initials');
    const topbarUserName = document.getElementById('topbar-user-name');

    function openLessonFromNotification(lessonId) {
        if (!lessonId) return;
        if (lessonId.startsWith('advice-')) {
            const promptNum = lessonId.replace('advice-', '');
            selectAdvicePrompt(promptNum);
            navigateToView('khuyen-nghi');
            setTimeout(() => {
                if (adviceTeacherFeedbackBox && adviceTeacherFeedbackBox.style.display !== 'none') {
                    adviceTeacherFeedbackBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 120);
        } else if (lessonId.startsWith('inquiry-')) {
            const promptNum = lessonId.replace('inquiry-', '');
            selectInquiryPrompt(promptNum);
            navigateToView('hoi-thong-tin');
            setTimeout(() => {
                if (inquiryTeacherFeedbackBox && inquiryTeacherFeedbackBox.style.display !== 'none') {
                    inquiryTeacherFeedbackBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 120);
        } else if (ESSAY_TOPICS[lessonId]) {
            selectEssayTopic(lessonId);
            navigateToView('viet-luan');
            setTimeout(() => {
                if (essayTeacherFeedbackBox && essayTeacherFeedbackBox.style.display !== 'none') {
                    essayTeacherFeedbackBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 120);
        }
    }

    function renderNotificationBell() {
        if (!topbarNotifWrap || !CLOUD) return;
        if (!currentAccount) {
            topbarNotifWrap.style.display = 'none';
            return;
        }
        topbarNotifWrap.style.display = 'inline-flex';

        const esc = CLOUD.escapeHtml;
        const fmtTime = CLOUD.formatDateTime;

        const releasedList = Object.values(authState.reviewsByLessonId || {})
            .filter(r => r && r.status === 'ready' && r.review_json && (authState.isTeacher || new Date(r.release_at || 0).getTime() <= Date.now()))
            .sort((a, b) => new Date(b.release_at || 0).getTime() - new Date(a.release_at || 0).getTime());

        const pendingList = Object.values(authState.submissionsByLessonId || {})
            .filter(sub => sub && sub.is_submitted && !getReleasedReview(sub.lesson_id) && sub.ai_release_at && new Date(sub.ai_release_at).getTime() > Date.now())
            .sort((a, b) => new Date(a.ai_release_at || 0).getTime() - new Date(b.ai_release_at || 0).getTime());

        const unreadCount = releasedList.filter(r => !r.student_seen_at).length;

        if (topbarNotifBadge) {
            topbarNotifBadge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
            topbarNotifBadge.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
        }
        if (topbarNotifBtn) {
            topbarNotifBtn.classList.toggle('has-unread', unreadCount > 0);
        }

        if (topbarNotifList) {
            if (releasedList.length === 0 && pendingList.length === 0) {
                topbarNotifList.innerHTML = `
                    <div class="notif-empty-state">
                        Chưa có bài sửa nào.<br />Khi bạn nộp bài Task 01 hoặc Task 02, bài sửa chi tiết sẽ tự động được gửi vào đây chậm nhất sau 6 giờ.
                    </div>
                `;
            } else {
                const releasedHtml = releasedList.map(r => {
                    const isUnread = !r.student_seen_at;
                    const title = getCatalogLessonTitle(r.lesson_id, r.lesson_title || r.lesson_id);
                    const errCount = Array.isArray(r.review_json && r.review_json.corrections) ? r.review_json.corrections.length : 0;
                    const bandText = (r.review_json && r.review_json.estimated_band) ? ` · ${r.review_json.estimated_band}` : '';
                    return `
                        <button type="button" class="notif-item-btn ${isUnread ? 'unread' : ''}" data-open-review-lesson="${esc(r.lesson_id)}">
                            <div class="notif-item-top">
                                <span class="notif-item-tag ${isUnread ? 'new-dot' : ''}">${isUnread ? 'Mới · Đã có bài sửa' : '✓ Đã trả bài sửa'}</span>
                                <span class="notif-item-time">${esc(fmtTime(r.release_at))}</span>
                            </div>
                            <div class="notif-item-title">${esc(title)}</div>
                            <div class="notif-item-sub">Level ${esc(r.target_level || 'B1')}${esc(bandText)} · ${errCount} điểm cần chỉnh · Xem chi tiết →</div>
                        </button>
                    `;
                }).join('');

                const pendingHtml = pendingList.map(sub => {
                    const title = getCatalogLessonTitle(sub.lesson_id, sub.lesson_title || sub.lesson_id);
                    const remain = CLOUD.formatRemainingTime(sub.ai_release_at);
                    return `
                        <button type="button" class="notif-item-btn" data-open-review-lesson="${esc(sub.lesson_id)}">
                            <div class="notif-item-top">
                                <span class="notif-item-tag" style="background:#FEF3C7;color:#92400E;">⏳ Đang chờ trả bài</span>
                                <span class="notif-item-time">Còn ${esc(remain)}</span>
                            </div>
                            <div class="notif-item-title">${esc(title)}</div>
                            <div class="notif-item-sub">Dự kiến trả lúc ${esc(fmtTime(sub.ai_release_at))}</div>
                        </button>
                    `;
                }).join('');

                topbarNotifList.innerHTML = releasedHtml + pendingHtml;
                topbarNotifList.querySelectorAll('[data-open-review-lesson]').forEach(btn => {
                    btn.onclick = () => {
                        const targetLesson = btn.getAttribute('data-open-review-lesson');
                        authState.notifOpen = false;
                        if (topbarNotifDropdown) topbarNotifDropdown.style.display = 'none';
                        if (topbarNotifBtn) topbarNotifBtn.setAttribute('aria-expanded', 'false');
                        openLessonFromNotification(targetLesson);
                    };
                });
            }
        }
    }

    let lastReviewsRefreshMs = 0;
    let reviewsRefreshInFlight = false;

    function hasPendingSubmittedReviews() {
        return Object.values(authState.submissionsByLessonId || {}).some(sub => {
            if (!sub || !sub.is_submitted) return false;
            return !getReleasedReview(sub.lesson_id);
        });
    }

    async function refreshStudentReviews(force = false) {
        const client = CLOUD ? CLOUD.getClient() : null;
        if (!client || !currentAccount || reviewsRefreshInFlight) return;
        const now = Date.now();
        if (!force && now - lastReviewsRefreshMs < 30000) return;

        reviewsRefreshInFlight = true;
        try {
            const [reviewsRes, subsSyncRes] = await Promise.all([
                client.from('writing_ai_reviews').select('*').eq('user_id', currentAccount.id),
                client
                    .from('writing_submissions')
                    .select('lesson_id, teacher_score, teacher_feedback, ai_status, ai_release_at, updated_at')
                    .eq('user_id', currentAccount.id)
            ]);
            lastReviewsRefreshMs = Date.now();

            let changed = false;
            if (Array.isArray(reviewsRes.data)) {
                const map = {};
                reviewsRes.data.forEach(row => {
                    if (row && row.lesson_id) map[row.lesson_id] = row;
                });
                authState.reviewsByLessonId = map;
                changed = true;
            }
            if (Array.isArray(subsSyncRes.data)) {
                subsSyncRes.data.forEach(row => {
                    if (!row || !row.lesson_id) return;
                    const existing = authState.submissionsByLessonId[row.lesson_id];
                    if (existing) {
                        existing.teacher_score = row.teacher_score || '';
                        existing.teacher_feedback = row.teacher_feedback || '';
                        existing.ai_status = row.ai_status || existing.ai_status;
                        existing.ai_release_at = row.ai_release_at || existing.ai_release_at;
                        existing.updated_at = row.updated_at || existing.updated_at;
                    }
                });
                changed = true;
            }
            if (changed) {
                renderNotificationBell();
                renderMySubmissionsView();
                renderTeacherFeedbackBox(adviceTeacherFeedbackBox, getCloudSubmission(getAdviceLessonId(currentAdvicePromptId)));
                renderTeacherFeedbackBox(inquiryTeacherFeedbackBox, getCloudSubmission(getInquiryLessonId(currentInquiryPromptId)));
                renderTeacherFeedbackBox(essayTeacherFeedbackBox, getCloudSubmission(currentEssayTopic));
            }
        } catch (e) {} finally {
            reviewsRefreshInFlight = false;
        }
    }

    function startNotificationPolling() {
        if (authState.notifPollTimer) {
            clearTimeout(authState.notifPollTimer);
            authState.notifPollTimer = null;
        }
        if (!currentAccount) return;
        const scheduleNext = () => {
            if (!currentAccount) return;
            const hasPending = hasPendingSubmittedReviews();
            const baseDelay = hasPending ? 75000 : 180000;
            const jitter = Math.floor(Math.random() * 30000);
            authState.notifPollTimer = setTimeout(async () => {
                if (currentAccount && document.visibilityState === 'visible') {
                    await refreshStudentReviews(false);
                }
                scheduleNext();
            }, baseDelay + jitter);
        };
        scheduleNext();
    }

    if (topbarNotifBtn && topbarNotifDropdown) {
        topbarNotifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            authState.notifOpen = !authState.notifOpen;
            topbarNotifDropdown.style.display = authState.notifOpen ? 'block' : 'none';
            topbarNotifBtn.setAttribute('aria-expanded', authState.notifOpen ? 'true' : 'false');
            if (authState.notifOpen) {
                refreshStudentReviews(true);
            }
        });

        document.addEventListener('click', (e) => {
            if (authState.notifOpen && !e.target.closest('#topbar-notif-wrap')) {
                authState.notifOpen = false;
                topbarNotifDropdown.style.display = 'none';
                topbarNotifBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    window.addEventListener('focus', () => {
        if (currentAccount) {
            refreshStudentReviews(false);
        }
    });

    function renderMySubmissionsView() {
        const listEl = document.getElementById('my-submissions-list');
        const headingEl = document.getElementById('my-submissions-heading');
        const sbCountEl = document.getElementById('sb-submissions-count');
        const subs = Object.values(authState.submissionsByLessonId || {})
            .filter(s => s && s.is_submitted)
            .sort((a, b) => new Date(b.submitted_at || b.updated_at || 0).getTime() - new Date(a.submitted_at || a.updated_at || 0).getTime());

        if (sbCountEl) {
            sbCountEl.textContent = String(subs.length);
            sbCountEl.style.display = subs.length > 0 ? 'inline-block' : 'none';
        }

        // Update Sidebar Progress Widget & Submitted Lesson Checkmarks
        const totalLessons = (CLOUD && Array.isArray(CLOUD.LESSONS_CATALOG) && CLOUD.LESSONS_CATALOG.length) || 10;
        const progressRatioEl = document.getElementById('sb-progress-ratio');
        const progressFillEl = document.getElementById('sb-progress-fill');
        const pct = Math.min(100, Math.round((subs.length / totalLessons) * 100));
        if (progressRatioEl) {
            progressRatioEl.textContent = `${subs.length}/${totalLessons}`;
        }
        if (progressFillEl) {
            progressFillEl.style.width = `${pct}%`;
        }
        document.querySelectorAll('[data-sb-lesson-id]').forEach(btn => {
            const lid = btn.getAttribute('data-sb-lesson-id');
            const isSub = Boolean(lid && authState.submissionsByLessonId && authState.submissionsByLessonId[lid] && authState.submissionsByLessonId[lid].is_submitted);
            btn.classList.toggle('submitted', isSub);
        });

        if (headingEl) {
            headingEl.textContent = `Bài viết đã nộp · ${subs.length} bài`;
        }
        if (!listEl || !CLOUD) return;

        if (subs.length === 0) {
            listEl.innerHTML = `
                <div class="ej-history-empty">
                    <p style="font-size:15.5px;font-weight:700;color:#18181B;margin-bottom:6px;">Bạn chưa nộp bài viết nào.</p>
                    <p style="font-size:13.5px;margin-bottom:16px;">Hãy chọn một đề ở Task 01 (Viết Thư) hoặc Task 02 (Viết Luận) để viết và nộp bài nhé!</p>
                    <button type="button" class="nb-back-btn" id="btn-empty-go-task1">Vào luyện Task 01 →</button>
                </div>
            `;
            const emptyBtn = document.getElementById('btn-empty-go-task1');
            if (emptyBtn) {
                emptyBtn.onclick = () => navigateToView('task1-hub');
            }
            return;
        }

        const esc = CLOUD.escapeHtml;
        const fmtTime = CLOUD.formatDateTime;

        listEl.innerHTML = subs.map(sub => {
            const title = getCatalogLessonTitle(sub.lesson_id, sub.lesson_title || sub.lesson_id);
            const rev = getReleasedReview(sub.lesson_id);
            const isTask1 = sub.task_type === 'task1';
            const taskBadgeStyle = isTask1
                ? 'background:#FEF3C7;color:#92400E;border:1px solid #F59E0B;'
                : 'background:#EEF2FF;color:#3730A3;border:1px solid #818CF8;';
            const hasTeacherGrade = Boolean((sub.teacher_score && sub.teacher_score.trim()) || (sub.teacher_feedback && sub.teacher_feedback.trim()));

            let statusPillHtml = '';
            if (rev) {
                const isUnread = !rev.student_seen_at;
                statusPillHtml = isUnread
                    ? `<span class="notif-item-tag new-dot">Mới · Đã có bài sửa</span>`
                    : `<span class="notif-item-tag">✅ Đã có bài sửa</span>`;
            } else {
                const relAt = sub.ai_release_at || (sub.submitted_at ? new Date(new Date(sub.submitted_at).getTime() + 6 * 60 * 60 * 1000).toISOString() : '');
                const remain = relAt ? CLOUD.formatRemainingTime(relAt) : '';
                statusPillHtml = remain
                    ? `<span class="notif-item-tag" style="background:#FEF3C7;color:#92400E;">⏳ Trả bài sửa sau ${esc(remain)}</span>`
                    : `<span class="notif-item-tag" style="background:#F4F4F5;color:#3F3F46;">Đang xử lý bài sửa</span>`;
            }

            return `
                <div class="ej-history-card">
                    <div class="ej-history-left">
                        <div class="ej-history-badges">
                            <span style="font-size:11px;font-weight:700;padding:2px 8px;${taskBadgeStyle}">${isTask1 ? 'Task 01' : 'Task 02'}</span>
                            <span style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;padding:2px 7px;background:#F4F4F5;color:#18181B;">Level ${esc(sub.target_level || 'B1')} · ${sub.word_count || 0} từ</span>
                            ${statusPillHtml}
                            ${hasTeacherGrade ? `<span class="notif-item-tag">👨‍🏫 GV đã nhận xét${sub.teacher_score ? ` (${esc(sub.teacher_score)})` : ''}</span>` : ''}
                        </div>
                        <div class="ej-history-title">${esc(title)}</div>
                        <div class="ej-history-meta">Đã nộp lúc ${esc(fmtTime(sub.submitted_at || sub.updated_at))}</div>
                    </div>
                    <button type="button" class="nb-back-btn" data-history-open-lesson="${esc(sub.lesson_id)}">
                        <span>${rev ? 'Xem bài sửa' : 'Mở bài viết'}</span>
                        <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('[data-history-open-lesson]').forEach(btn => {
            btn.onclick = () => openLessonFromNotification(btn.getAttribute('data-history-open-lesson'));
        });
    }

    function syncTopbarAccountUI() {
        if (!currentAccount) {
            if (topbarTeacherLink) topbarTeacherLink.style.display = 'none';
            if (topbarNotifWrap) topbarNotifWrap.style.display = 'none';
            if (topbarAccountPill) topbarAccountPill.style.display = 'none';
            return;
        }
        if (topbarTeacherLink) {
            topbarTeacherLink.style.display = authState.isTeacher ? 'inline-flex' : 'none';
        }
        if (topbarAccountPill) {
            topbarAccountPill.style.display = 'inline-flex';
        }
        if (topbarUserInitials && CLOUD) {
            topbarUserInitials.textContent = isAdminAccount() ? 'AD' : CLOUD.getInitials(currentAccount.name);
        }
        if (topbarUserName) {
            topbarUserName.textContent = isAdminAccount() ? 'admin' : (currentAccount.name || currentAccount.email);
        }
        renderNotificationBell();
        renderMySubmissionsView();
    }

    function hydrateWritingViewsFromCloud() {
        selectAdvicePrompt(currentAdvicePromptId, { skipScroll: true });
        selectInquiryPrompt(currentInquiryPromptId, { skipScroll: true });
        selectEssayTopic(currentEssayTopic, { skipResetTimer: true, skipScroll: true });
        renderMySubmissionsView();
    }

    function resetLocalSessionState() {
        currentAccount = null;
        loadingStudentUserId = null;
        lastReviewsRefreshMs = 0;
        authState.isTeacher = false;
        authState.needsProfileSetup = false;
        authState.submissionsByLessonId = {};
        authState.reviewsByLessonId = {};
        authState.notifOpen = false;
        if (authState.notifPollTimer) {
            clearTimeout(authState.notifPollTimer);
            authState.notifPollTimer = null;
        }
        if (topbarNotifDropdown) topbarNotifDropdown.style.display = 'none';
        authState.authMode = 'login';
        authState.authError = '';
        authState.authInfo = '';
        authState.authLoading = false;
        if (adviceTextarea) adviceTextarea.value = '';
        if (inquiryTextarea) inquiryTextarea.value = '';
        if (essayTextarea) essayTextarea.value = '';
        isCurrentAdviceSubmitted = false;
        isCurrentInquirySubmitted = false;
        syncAdviceSampleUI(false);
        syncInquirySampleUI(false);
        updateAdviceWordState();
        updateInquiryWordState();
        renderTeacherFeedbackBox(adviceTeacherFeedbackBox, null);
        renderTeacherFeedbackBox(inquiryTeacherFeedbackBox, null);
        renderTeacherFeedbackBox(essayTeacherFeedbackBox, null);
        navigateToView('home-dashboard');
        renderAuthGate();
    }

    async function handleSignOut(askConfirm = false) {
        if (askConfirm && !confirm('Bạn có muốn đăng xuất khỏi tài khoản hiện tại?')) {
            return;
        }
        const client = CLOUD ? CLOUD.getClient() : null;
        draftSaver.flush();
        if (client) {
            try {
                await client.auth.signOut();
            } catch (e) {}
        }
        resetLocalSessionState();
    }

    if (topbarAccountPill) {
        topbarAccountPill.addEventListener('click', () => {
            handleSignOut(true);
        });
    }

    function renderAuthCardHtml() {
        const esc = CLOUD.escapeHtml;
        const isReg = authState.authMode === 'register';
        return `
            <div class="auth-wrapper">
                <div class="auth-card-box">
                    <div style="margin-bottom:10px;">
                        <span class="auth-badge-tag">VSTEP WRITING · TÀI KHOẢN HỌC VIÊN</span>
                    </div>

                    <h1 style="font-size:22px;font-weight:900;color:#18181B;margin-bottom:6px;">
                        ${isReg ? 'Tạo tài khoản học viên' : 'Đăng nhập học tập'}
                    </h1>
                    <p style="font-size:13.5px;color:#52525B;line-height:1.5;margin-bottom:16px;">
                        ${isReg
                            ? 'Đăng nhập nhanh bằng Google hoặc tạo tài khoản để luyện viết Task 01 & Task 02 và nộp bài trực tiếp cho Giáo viên.'
                            : 'Đăng nhập bằng tài khoản Google hoặc email của bạn để tiếp tục luyện viết và xem nhận xét từ Giáo viên.'}
                    </p>

                    <button type="button" class="google-auth-btn" id="btn-google-login" ${authState.authLoading ? 'disabled' : ''}>
                        ${CLOUD.renderGoogleIconSvg(19)}
                        <span>${authState.authLoading ? 'Đang kết nối tới Google...' : 'Tiếp tục với Google'}</span>
                    </button>

                    <div class="auth-or-divider">
                        <span>Hoặc dùng tài khoản Email</span>
                    </div>

                    <div class="auth-tabs-row">
                        <button type="button" class="auth-tab ${!isReg ? 'active' : ''}" id="btn-tab-login">Đăng nhập</button>
                        <button type="button" class="auth-tab ${isReg ? 'active' : ''}" id="btn-tab-register">Tạo tài khoản mới</button>
                    </div>

                    ${authState.authError
                        ? `<div style="padding:8px 12px;border:1.5px solid #DC2626;background:#FEF2F2;color:#B91C1C;font-size:12.5px;font-weight:700;margin-bottom:12px;">⚠️ ${esc(authState.authError)}</div>`
                        : ''}
                    ${authState.authInfo
                        ? `<div style="padding:8px 12px;border:1.5px solid #16A34A;background:#F0FDF4;color:#166534;font-size:12.5px;font-weight:700;margin-bottom:12px;">✓ ${esc(authState.authInfo)}</div>`
                        : ''}

                    <form id="auth-form" onsubmit="return false;">
                        ${isReg
                            ? `
                                <div class="form-field">
                                    <label class="form-label" for="inp-auth-name">Họ và tên đầy đủ</label>
                                    <input type="text" id="inp-auth-name" class="form-input" placeholder="Ví dụ: Nguyễn Minh Tùng" required />
                                </div>

                                <div class="form-field">
                                    <label class="form-label">Chọn lớp học của bạn *</label>
                                    <div class="class-select-grid">
                                        ${CLOUD.CLASS_LIST.map(cls => `
                                            <button
                                                type="button"
                                                class="class-option-btn ${authState.regSelectedClass === cls ? 'active' : ''}"
                                                data-reg-class="${cls}"
                                            >Lớp ${cls}</button>
                                        `).join('')}
                                    </div>
                                </div>
                            `
                            : ''}

                        <div class="form-field">
                            <label class="form-label" for="inp-auth-email">Email</label>
                            <input type="email" id="inp-auth-email" class="form-input" placeholder="Nhập email của bạn..." required />
                        </div>

                        <div class="form-field">
                            <label class="form-label" for="inp-auth-pass">Mật khẩu</label>
                            <input type="password" id="inp-auth-pass" class="form-input" placeholder="Nhập mật khẩu..." required />
                        </div>

                        <button type="submit" class="form-submit-btn" ${authState.authLoading ? 'disabled' : ''}>
                            ${isReg ? 'Tạo tài khoản & Vào học →' : 'Đăng nhập →'}
                        </button>
                    </form>
                </div>
            </div>
        `;
    }

    function renderProfileSetupHtml() {
        const esc = CLOUD.escapeHtml;
        return `
            <div class="auth-wrapper">
                <div class="auth-card-box">
                    <div style="margin-bottom:10px;">
                        <span class="auth-badge-tag">THÔNG TIN HỌC VIÊN · BẮT BUỘC</span>
                    </div>

                    <h1 style="font-size:21px;font-weight:900;color:#18181B;margin-bottom:6px;">
                        Hoàn tất thông tin học viên
                    </h1>
                    <p style="font-size:13.5px;color:#52525B;line-height:1.5;margin-bottom:16px;">
                        Vui lòng nhập đầy đủ <strong>Họ và tên</strong> và chọn đúng <strong>Lớp</strong> của bạn để Giáo viên nhận diện và chấm bài viết chính xác.
                    </p>

                    ${authState.isTeacher
                        ? `
                            <div style="margin-bottom:14px;">
                                <a href="./teacher.html" class="top-pill-btn teacher-nav-pill" style="width:100%;justify-content:center;height:38px;">
                                    👨‍🏫 Vào thẳng Trang Giáo viên →
                                </a>
                            </div>
                        `
                        : ''}

                    ${authState.profileFormError
                        ? `<div style="padding:8px 12px;border:1.5px solid #DC2626;background:#FEF2F2;color:#B91C1C;font-size:12.5px;font-weight:700;margin-bottom:12px;">⚠️ ${esc(authState.profileFormError)}</div>`
                        : ''}

                    <form id="profile-setup-form" onsubmit="return false;">
                        <div class="form-field">
                            <label class="form-label" for="inp-setup-fullname">Họ và tên đầy đủ *</label>
                            <input
                                type="text"
                                id="inp-setup-fullname"
                                class="form-input"
                                placeholder="Ví dụ: Nguyễn Văn An"
                                value="${esc(authState.profileFormName)}"
                                required
                            />
                        </div>

                        <div class="form-field" style="margin-bottom:16px;">
                            <label class="form-label">Chọn lớp của bạn *</label>
                            <div class="class-select-grid">
                                ${CLOUD.CLASS_LIST.map(cls => `
                                    <button
                                        type="button"
                                        class="class-option-btn ${authState.profileFormClass === cls ? 'active' : ''}"
                                        data-setup-class="${cls}"
                                    >Lớp ${cls}</button>
                                `).join('')}
                            </div>
                        </div>

                        <button type="submit" class="form-submit-btn" ${authState.profileSaving ? 'disabled' : ''}>
                            ${authState.profileSaving ? 'Đang lưu thông tin...' : 'Lưu thông tin & Vào học →'}
                        </button>

                        <button
                            type="button"
                            id="btn-logout-account"
                            style="width:100%;height:36px;margin-top:8px;border:none;background:transparent;color:#71717A;font-weight:600;font-size:12.5px;cursor:pointer;"
                        >
                            Đăng xuất tài khoản khác
                        </button>
                    </form>
                </div>
            </div>
        `;
    }

    function bindAuthGateEvents() {
        const btnTabLogin = document.getElementById('btn-tab-login');
        if (btnTabLogin) {
            btnTabLogin.onclick = () => {
                authState.authMode = 'login';
                authState.authError = '';
                renderAuthGate();
            };
        }

        const btnTabReg = document.getElementById('btn-tab-register');
        if (btnTabReg) {
            btnTabReg.onclick = () => {
                authState.authMode = 'register';
                authState.authError = '';
                renderAuthGate();
            };
        }

        const btnGoogleLogin = document.getElementById('btn-google-login');
        if (btnGoogleLogin) {
            btnGoogleLogin.onclick = async () => {
                authState.authError = '';
                authState.authInfo = '';
                authState.authLoading = true;
                renderAuthGate();
                const { error } = await CLOUD.signInWithGoogle();
                if (error) {
                    authState.authLoading = false;
                    authState.authError = 'Không thể mở đăng nhập Google: ' + (error.message || 'Lỗi kết nối');
                    renderAuthGate();
                }
            };
        }

        document.querySelectorAll('[data-reg-class]').forEach(btn => {
            btn.onclick = () => {
                authState.regSelectedClass = btn.getAttribute('data-reg-class');
                document.querySelectorAll('[data-reg-class]').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });
            };
        });

        document.querySelectorAll('[data-setup-class]').forEach(btn => {
            btn.onclick = () => {
                authState.profileFormClass = btn.getAttribute('data-setup-class');
                document.querySelectorAll('[data-setup-class]').forEach(b => {
                    b.classList.toggle('active', b === btn);
                });
            };
        });

        const authForm = document.getElementById('auth-form');
        if (authForm) {
            authForm.onsubmit = async e => {
                e.preventDefault();
                const client = CLOUD.getClient();
                if (!client) {
                    authState.authError = 'Chưa cấu hình kết nối Supabase.';
                    renderAuthGate();
                    return;
                }
                const nameEl = document.getElementById('inp-auth-name');
                const emailEl = document.getElementById('inp-auth-email');
                const passEl = document.getElementById('inp-auth-pass');
                const name = (nameEl ? nameEl.value : '').trim();
                const email = (emailEl ? emailEl.value : '').trim().toLowerCase();
                const password = (passEl ? passEl.value : '').trim();
                const chosenClass = authState.regSelectedClass || CLOUD.CLASS_LIST[0];

                if (!email || !password) {
                    authState.authError = 'Vui lòng nhập đầy đủ Email và Mật khẩu.';
                    authState.authInfo = '';
                    renderAuthGate();
                    return;
                }

                authState.authLoading = true;
                authState.authError = '';
                authState.authInfo = '';
                renderAuthGate();

                if (authState.authMode === 'register') {
                    if (!name) {
                        authState.authLoading = false;
                        authState.authError = 'Vui lòng nhập đầy đủ họ và tên của bạn.';
                        renderAuthGate();
                        return;
                    }
                    if (password.length < 6) {
                        authState.authLoading = false;
                        authState.authError = 'Mật khẩu cần tối thiểu 6 ký tự.';
                        renderAuthGate();
                        return;
                    }
                    const { data, error } = await client.auth.signUp({
                        email,
                        password,
                        options: {
                            data: {
                                full_name: CLOUD.formatStoredFullName(name, chosenClass),
                                class_name: chosenClass
                            },
                            emailRedirectTo: CLOUD.getRedirectUrl()
                        }
                    });
                    authState.authLoading = false;
                    if (error) {
                        authState.authError = error.message || 'Không thể tạo tài khoản. Vui lòng thử lại.';
                        renderAuthGate();
                        return;
                    }
                    if (data && data.session && data.user) {
                        await loadCloudStudentData(data.user);
                    } else {
                        authState.authInfo =
                            "Đăng ký thành công! Vui lòng mở hộp thư Email để xác nhận tài khoản, hoặc bấm 'Tiếp tục với Google' để vào học ngay.";
                        authState.authMode = 'login';
                        renderAuthGate();
                    }
                } else {
                    const { data, error } = await client.auth.signInWithPassword({ email, password });
                    authState.authLoading = false;
                    if (error) {
                        authState.authError = 'Email hoặc mật khẩu chưa đúng (hoặc tài khoản chưa xác nhận email).';
                        renderAuthGate();
                        return;
                    }
                    if (data && data.user) {
                        await loadCloudStudentData(data.user);
                    }
                }
            };
        }

        const profileSetupForm = document.getElementById('profile-setup-form');
        if (profileSetupForm) {
            profileSetupForm.onsubmit = async e => {
                e.preventDefault();
                const client = CLOUD.getClient();
                if (!client || !currentAccount) return;

                const nameInp = document.getElementById('inp-setup-fullname');
                const cleanName = (nameInp ? nameInp.value : authState.profileFormName).trim();
                const chosenClass = String(authState.profileFormClass || '').trim().toUpperCase();

                authState.profileFormName = cleanName;
                if (!cleanName) {
                    authState.profileFormError = 'Vui lòng nhập đầy đủ họ và tên của bạn.';
                    renderAuthGate();
                    return;
                }
                if (!CLOUD.CLASS_LIST.includes(chosenClass)) {
                    authState.profileFormError = `Vui lòng chọn lớp của bạn (${CLOUD.CLASS_LIST.join(', ')}).`;
                    renderAuthGate();
                    return;
                }

                const storedFullName = CLOUD.formatStoredFullName(cleanName, chosenClass);
                authState.profileSaving = true;
                authState.profileFormError = '';
                renderAuthGate();

                const { error: profErr } = await client.from('profiles').upsert(
                    {
                        id: currentAccount.id,
                        email: currentAccount.email,
                        full_name: storedFullName,
                        last_active_at: new Date().toISOString()
                    },
                    { onConflict: 'id' }
                );

                authState.profileSaving = false;
                if (profErr) {
                    authState.profileFormError = 'Không lưu được thông tin: ' + profErr.message;
                    renderAuthGate();
                    return;
                }

                try {
                    await client.auth.updateUser({
                        data: { full_name: storedFullName, class_name: chosenClass }
                    });
                } catch (err) {}

                currentAccount.name = cleanName;
                currentAccount.className = chosenClass;
                authState.needsProfileSetup = false;
                renderAuthGate();
            };
        }

        const btnLogout = document.getElementById('btn-logout-account');
        if (btnLogout) {
            btnLogout.onclick = () => handleSignOut(false);
        }
    }

    function renderAuthGate() {
        if (!authGateEl || !mainAppLayout) return;
        if (!CLOUD) {
            authGateEl.style.display = 'none';
            mainAppLayout.style.display = '';
            return;
        }
        if (currentAccount && !authState.needsProfileSetup) {
            authGateEl.style.display = 'none';
            authGateEl.innerHTML = '';
            mainAppLayout.style.display = '';
            syncTopbarAccountUI();
            return;
        }
        mainAppLayout.style.display = 'none';
        authGateEl.style.display = 'block';
        authGateEl.innerHTML = currentAccount && authState.needsProfileSetup
            ? renderProfileSetupHtml()
            : renderAuthCardHtml();
        bindAuthGateEvents();
    }

    let loadingStudentUserId = null;

    async function loadCloudStudentData(sessionUser) {
        const client = CLOUD ? CLOUD.getClient() : null;
        if (!client || !sessionUser) return;

        const uid = sessionUser.id;
        if (loadingStudentUserId === uid) return;
        loadingStudentUserId = uid;

        try {
            const email = String(sessionUser.email || '').trim().toLowerCase();
            const wantsPracticeMode = new URLSearchParams(window.location.search).get('mode') === 'practice';
            const isPrimaryTeacherEmail = isAdminEmail(email);

            // Tự động chuyển thẳng tài khoản Giáo viên (mtung0208@gmail.com) vào Trang Giáo viên
            if (isPrimaryTeacherEmail && !wantsPracticeMode) {
                window.location.replace('./teacher.html');
                return;
            }

            const meta = sessionUser.user_metadata || {};
            const appMeta = sessionUser.app_metadata || {};
            const fallbackName =
                String(meta.full_name || meta.name || '').trim() ||
                email
                    .split('@')[0]
                    .replace(/[._-]+/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase());
            const avatarUrl = meta.avatar_url || meta.picture || '';
            const provider = appMeta.provider || 'email';

            authState.authLoading = true;
            renderAuthGate();

            const [profileRes, subsRes, reviewsRes, teacherRes] = await Promise.all([
                client.from('profiles').select('*').eq('id', uid).maybeSingle(),
                client.from('writing_submissions').select('*').eq('user_id', uid),
                client.from('writing_ai_reviews').select('*').eq('user_id', uid),
                client.rpc('is_teacher')
            ]);

            authState.isTeacher = Boolean(teacherRes && !teacherRes.error && teacherRes.data === true) || isPrimaryTeacherEmail;

            if (authState.isTeacher && !wantsPracticeMode) {
                window.location.replace('./teacher.html');
                return;
            }

            // Prefer existing full_name in profiles table so Google login metadata never overwrites student edits
            const rawStoredName =
                profileRes && profileRes.data && profileRes.data.full_name
                    ? profileRes.data.full_name
                    : fallbackName;
            const parsed = CLOUD.parseFullNameAndClass(rawStoredName);
            const metaClass = String(meta.class_name || '').trim().toUpperCase();
            const resolvedClass = isPrimaryTeacherEmail
                ? ''
                : (parsed.className || (CLOUD.CLASS_LIST.includes(metaClass) ? metaClass : ''));
            const resolvedName = isPrimaryTeacherEmail ? 'admin' : (parsed.fullName || fallbackName);
            const storedFullName = isPrimaryTeacherEmail ? 'admin' : CLOUD.formatStoredFullName(resolvedName, resolvedClass);

            try {
                await client.from('profiles').upsert(
                    {
                        id: uid,
                        email: email,
                        full_name: storedFullName,
                        avatar_url: avatarUrl,
                        auth_provider: provider,
                        last_active_at: new Date().toISOString()
                    },
                    { onConflict: 'id' }
                );
            } catch (e) {}

            const subsMap = {};
            if (Array.isArray(subsRes.data)) {
                subsRes.data.forEach(row => {
                    if (row && row.lesson_id) {
                        subsMap[row.lesson_id] = row;
                    }
                });
            }

            const reviewsMap = {};
            if (Array.isArray(reviewsRes.data)) {
                reviewsRes.data.forEach(row => {
                    if (row && row.lesson_id) {
                        reviewsMap[row.lesson_id] = row;
                    }
                });
            }

            currentAccount = {
                id: uid,
                name: resolvedName,
                className: resolvedClass,
                email: email
            };

            authState.submissionsByLessonId = subsMap;
            authState.reviewsByLessonId = reviewsMap;
            authState.needsProfileSetup = !resolvedClass && !authState.isTeacher;
            authState.profileFormName = resolvedName;
            authState.profileFormClass = resolvedClass || CLOUD.CLASS_LIST[0];
            authState.profileFormError = '';
            authState.authError = '';
            authState.authInfo = '';
            authState.authLoading = false;

            hydrateWritingViewsFromCloud();
            renderAuthGate();
            startNotificationPolling();
        } finally {
            if (loadingStudentUserId === uid) {
                loadingStudentUserId = null;
            }
        }
    }

    (async function bootstrapWritingAuth() {
        if (!CLOUD) {
            renderAuthGate();
            return;
        }
        const client = CLOUD.getClient();
        if (!client) {
            authState.authError = 'Chưa cấu hình kết nối Supabase.';
            renderAuthGate();
            return;
        }

        renderAuthGate();
        const { data } = await client.auth.getSession();
        if (data && data.session && data.session.user) {
            await loadCloudStudentData(data.session.user);
        }

        client.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session && session.user) {
                if (!currentAccount || currentAccount.id !== session.user.id) {
                    await loadCloudStudentData(session.user);
                }
            } else if (event === 'SIGNED_OUT') {
                resetLocalSessionState();
            }
        });
    })();
});

// --- 14. Sample Essay Toggle and Font Size Adjustment ---
window.toggleSampleEssay = function(button) {
    const section = button.closest('.sample-essay-section');
    const content = section.querySelector('.sample-essay-content');
    if (content.style.display === 'none' || content.style.display === '') {
        content.style.display = 'block';
        button.innerHTML = '<i class="fas fa-eye-slash"></i> Ẩn bài mẫu';
        button.classList.add('active');
    } else {
        content.style.display = 'none';
        button.innerHTML = '<i class="fas fa-eye"></i> Hiện bài mẫu';
        button.classList.remove('active');
    }
};

window.changeEssayFontSize = function(change) {
    const essayContainers = document.querySelectorAll('.sample-essay-content');
    essayContainers.forEach(container => {
        let currentSize = parseFloat(window.getComputedStyle(container).fontSize);
        let newSize = currentSize + change;
        if (newSize >= 12 && newSize <= 24) {
            container.style.fontSize = newSize + 'px';
        }
    });
};

window.resetEssayFontSize = function() {
    const essayContainers = document.querySelectorAll('.sample-essay-content');
    essayContainers.forEach(container => {
        container.style.fontSize = ''; // Revert to CSS default
    });
};
