document.addEventListener('DOMContentLoaded', () => {
    // --- Global State for Highlighter ---
    let isHighlightModeActive = false;
    let justHighlighted = false;

    // --- 1. Interactive Phrases Translation Logic ---
    const phrases = document.querySelectorAll('.interactive-phrase');

    phrases.forEach(phrase => {
        // Create the translation box inside each phrase
        const translationText = phrase.getAttribute('data-vi');
        if (translationText) {
            // Check if it already has one to prevent duplicate appends
            if (!phrase.querySelector('.translation-box')) {
                const transBox = document.createElement('div');
                transBox.className = 'translation-box';
                transBox.textContent = translationText;
                
                // Append to the phrase element
                phrase.appendChild(transBox);
            }
        }

        // Add click event to toggle visibility
        phrase.addEventListener('click', function(e) {
            // If the user clicked a blank inside the phrase, do not toggle the translation box
            if (e.target.closest('.fill-blank') || e.target.closest('.identity-inline-btn') || e.target.closest('.thanks-inline-btn') || e.target.closest('.signoff-btn')) {
                return;
            }
            
            // If highlight mode is active and they clicked on a highlight, do not toggle translation
            if (isHighlightModeActive && e.target.closest('.custom-highlight')) {
                return;
            }
            
            // Prevent event bubbling in case phrases are nested
            e.stopPropagation();
            
            this.classList.toggle('active');
        });
    });

    // Close open translations if clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.interactive-phrase')) {
            phrases.forEach(p => p.classList.remove('active'));
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
        isSubmittingEssay: false
    };

    function getUserScopedKey(baseKey) {
        return currentAccount && currentAccount.id ? `${baseKey}__${currentAccount.id}` : baseKey;
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
            await client.rpc('mark_writing_review_seen', { p_submission_id: rev.submission_id });
        } catch (e) {}
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
            const releaseAt = sub.ai_release_at || (sub.submitted_at ? new Date(new Date(sub.submitted_at).getTime() + 12 * 60 * 60 * 1000).toISOString() : '');
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
                            Bài sửa chi tiết (ngữ pháp, chính tả, dấu câu, từ vựng &amp; bổ sung ý theo chuẩn <strong>Level ${esc(sub.target_level || 'B1')}</strong>) sẽ được gửi vào tài khoản của bạn sau 12 tiếng — dự kiến lúc <strong>${esc(releaseFormatted)}</strong>. Bạn sẽ nhận được thông báo ở biểu tượng chuông 🔔 trên góc phải khi có bài sửa.
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
        const defaultReleaseIso = new Date(nowMs + 12 * 60 * 60 * 1000).toISOString();
        const rowId = `${currentAccount.id}__${lessonId}`;
        const existing = getCloudSubmission(lessonId);

        const payload = {
            id: rowId,
            user_id: currentAccount.id,
            task_type: taskType,
            lesson_id: lessonId,
            lesson_title: lessonTitle || lessonId,
            prompt_text: promptText || '',
            content: content || '',
            word_count: wordCount || 0,
            target_level: targetLevel || 'B1',
            is_submitted: true,
            submitted_at: nowIso,
            updated_at: nowIso
        };

        const { data, error } = await client
            .from('writing_submissions')
            .upsert(payload, { onConflict: 'id' })
            .select('*')
            .maybeSingle();

        if (error) {
            return { ok: false, error: error.message || 'Không thể lưu bài lên Supabase.' };
        }

        try {
            await client
                .from('profiles')
                .update({ last_active_at: nowIso })
                .eq('id', currentAccount.id);
        } catch (e) {}

        // Xóa cache bài sửa cũ (nếu học viên nộp lại bản mới) để chờ đợt trả bài mới sau 12 tiếng
        delete authState.reviewsByLessonId[lessonId];

        const savedRow = {
            ...(data || payload),
            teacher_score: (data && data.teacher_score) || (existing ? existing.teacher_score : ''),
            teacher_feedback: (data && data.teacher_feedback) || (existing ? existing.teacher_feedback : ''),
            ai_status: 'scheduled',
            ai_release_at: defaultReleaseIso
        };
        authState.submissionsByLessonId[lessonId] = savedRow;

        // Kích hoạt Edge Function chấm & hẹn trả bài sửa sau 12 tiếng ở nền
        if (CLOUD && typeof CLOUD.invokeGradeWriting === 'function') {
            CLOUD.invokeGradeWriting(rowId).then(gradeRes => {
                if (gradeRes && gradeRes.ok && gradeRes.release_at) {
                    const currentSub = authState.submissionsByLessonId[lessonId];
                    if (currentSub) {
                        currentSub.ai_status = gradeRes.status || 'scheduled';
                        currentSub.ai_release_at = gradeRes.release_at;
                        if (lessonId === getAdviceLessonId(currentAdvicePromptId)) {
                            renderTeacherFeedbackBox(adviceTeacherFeedbackBox, currentSub);
                        } else if (lessonId === currentEssayTopic) {
                            renderTeacherFeedbackBox(essayTeacherFeedbackBox, currentSub);
                        }
                    }
                }
            }).catch(() => {});
        }

        if (typeof renderNotificationBell === 'function') {
            renderNotificationBell();
        }
        if (typeof renderMySubmissionsView === 'function') {
            renderMySubmissionsView();
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
                dashboardCrumbEl.textContent = 'Task 02 · 8 mục';
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
            appLayout.classList.remove('sidebar-open');
            if (targetView === 'khuyen-nghi' || targetView === 'viet-luan') {
                appLayout.classList.add('split-tab-active');
            } else {
                appLayout.classList.remove('split-tab-active');
            }
        }

        const adviceMenuBtn = document.getElementById('advice-toggle-sidebar-btn');
        if (adviceMenuBtn) {
            adviceMenuBtn.classList.remove('active');
        }

        if (targetView === 'my-submissions' && typeof renderMySubmissionsView === 'function') {
            renderMySubmissionsView();
        } else if (targetView === 'khuyen-nghi' && typeof currentAdvicePromptId !== 'undefined') {
            markReviewAsSeen(getAdviceLessonId(currentAdvicePromptId));
        } else if (targetView === 'viet-luan' && typeof currentEssayTopic !== 'undefined') {
            markReviewAsSeen(currentEssayTopic);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- Quick Search (⌘K) across Task 01 & Task 02 lessons ---
    const QUICK_SEARCH_CATALOG = [
        { title: 'Lý thuyết chung: Viết Thư & Email', sub: 'Task 01 · Bố cục 3 phần, văn phong Formal/Informal', tag: 'Task 01', view: 'ly-thuyet' },
        { title: 'Thư khuyên / đề xuất (5 đề)', sub: 'Mua hàng online (Jay), Hội thảo (Carol), Du lịch Hà Nội, Chuyển nhà, Mùa hè', tag: 'Task 01', view: 'khuyen-nghi' },
        { title: 'Thư hỏi thông tin (3 đề)', sub: 'Rainbow Language Center, khóa tiếng Anh mùa hè, kỹ năng mềm', tag: 'Task 01', view: 'hoi-thong-tin' },
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
        { title: 'Chủ đề 7: Người trẻ bỏ phố về quê', sub: 'Leaving Cities for Rural Hometowns · Advantages & Disadvantages', tag: 'Task 02', essay: 'leaving-cities' }
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

    // --- 4. Interactive Mock Exam Word Count & Independent Timers ---
    const mockExamWindows = document.querySelectorAll('.mock-exam-window');
    
    mockExamWindows.forEach(windowEl => {
        const textarea = windowEl.querySelector('.mock-textarea');
        const wordCountElement = windowEl.querySelector('.word-count strong');
        const timerElement = windowEl.querySelector('.mock-timer');

        // Dynamic Word Counter
        if (textarea && wordCountElement) {
            textarea.addEventListener('input', () => {
                const text = textarea.value.trim();
                // Split by whitespace and filter empty strings
                const words = text.length > 0 ? text.split(/\s+/).length : 0;
                wordCountElement.textContent = words;
            });
        }

        // Independent Countdown Timer (triggers once on click of the timer element)
        if (timerElement) {
            let time = 20 * 60; // 20 minutes default
            let timerId = null;

            const updateTimerDisplay = () => {
                const minutes = Math.floor(time / 60).toString().padStart(2, '0');
                const seconds = (time % 60).toString().padStart(2, '0');
                timerElement.textContent = `${minutes}:${seconds}`;
            };

            const startTimer = () => {
                if (timerId) return;
                
                // Visual change to indicate timer is active
                timerElement.style.background = '#10b981'; // Active Green
                
                timerId = setInterval(() => {
                    if (time > 0) {
                        time--;
                        updateTimerDisplay();
                        
                        // Alert when 2 minutes left
                        if (time === 120) {
                            timerElement.style.background = '#f59e0b'; // Warn Orange
                        }
                    } else {
                        clearInterval(timerId);
                        timerElement.textContent = "Hết giờ!";
                        timerElement.style.background = '#ef4444'; // Red
                    }
                }, 1000);
            };

            // Trigger when first clicked
            timerElement.addEventListener('click', startTimer, { once: true });
            timerElement.style.cursor = 'pointer';
            
            // Set initial state
            updateTimerDisplay();
        }
    });

    // --- 5. Interactive fill-in-the-blanks logic ---
    document.addEventListener('click', (e) => {
        if (e.target.matches('.fill-blank')) {
            e.stopPropagation(); // prevent triggering the parent interactive-phrase translation
            const blank = e.target;
            blank.classList.toggle('revealed');
            if (blank.classList.contains('revealed')) {
                blank.textContent = blank.getAttribute('data-text') || '____';
            } else {
                blank.textContent = '____';
            }
        }
    });

    // --- 6. Purpose buttons selection logic ---
    const purposeButtons = document.querySelectorAll('.purpose-btn');
    purposeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const templatePart = btn.closest('.template-part');
            const inlineResult = templatePart ? templatePart.querySelector('.purpose-inline-result') : null;
            const selectorContainer = btn.closest('.purpose-selector');
            
            if (!inlineResult || !selectorContainer) return;
            
            const isAlreadyActive = btn.classList.contains('active');
            
            // Remove active from all buttons in this group
            selectorContainer.querySelectorAll('.purpose-btn').forEach(b => b.classList.remove('active'));
            
            if (isAlreadyActive) {
                // Toggle off
                inlineResult.innerHTML = '____';
                inlineResult.classList.remove('revealed-purpose');
            } else {
                // Activate
                btn.classList.add('active');
                inlineResult.innerHTML = btn.getAttribute('data-html') || '____';
                inlineResult.classList.add('revealed-purpose');
            }
        });
    });

    // --- 7. Identity inline buttons logic ---
    const identityInlineButtons = document.querySelectorAll('.identity-inline-btn');
    identityInlineButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent toggling the parent translation box
            const parent = btn.parentElement;
            const isAlreadyActive = btn.classList.contains('active');
            
            // Deactivate all buttons in this group
            parent.querySelectorAll('.identity-inline-btn').forEach(b => b.classList.remove('active'));
            
            if (!isAlreadyActive) {
                btn.classList.add('active');
            }
        });
    });

    window.changePromptFontSize = function(change) {
        const promptContainers = document.querySelectorAll('.mock-content');
        promptContainers.forEach(container => {
            let currentSize = parseFloat(window.getComputedStyle(container).fontSize);
            let newSize = currentSize + change;
            if (newSize >= 12 && newSize <= 24) {
                container.style.fontSize = newSize + 'px';
            }
        });
    };
    window.resetPromptFontSize = function() {
        const promptContainers = document.querySelectorAll('.mock-content');
        promptContainers.forEach(container => {
            container.style.fontSize = ''; // Revert to CSS default
        });
    };

    // --- 10. Thanks Inline Buttons Choice Logic ---
    const thanksButtons = document.querySelectorAll('.thanks-inline-btn');
    thanksButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const parent = btn.closest('.thanks-btn-group');
            if (!parent) return;
            const isAlreadyActive = btn.classList.contains('active');
            
            // Remove active state from all buttons in this group
            parent.querySelectorAll('.thanks-inline-btn').forEach(b => b.classList.remove('active'));
            
            if (!isAlreadyActive) {
                btn.classList.add('active');
            }
        });
    });

    // --- 11. Sign-off Buttons Toggle Logic ---
    const signoffButtons = document.querySelectorAll('.signoff-btn');
    signoffButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            btn.classList.toggle('active');
        });
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
        if (selection.isCollapsed || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);

        // Make sure the selection is inside a mock-content container
        let container = range.commonAncestorContainer;
        if (container.nodeType === Node.TEXT_NODE) {
            container = container.parentNode;
        }
        if (!container.closest('.mock-content')) {
            return;
        }

        try {
            const mark = document.createElement('mark');
            mark.className = 'custom-highlight';
            range.surroundContents(mark);
            selection.removeAllRanges(); // Clear selection after highlighting
            
            // Set flag to prevent immediate deletion click event
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
                
                // Set flag to prevent immediate deletion click event
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
            // Restore original text by replacing mark with its children
            while (mark.firstChild) {
                parent.insertBefore(mark.firstChild, mark);
            }
            parent.removeChild(mark);
            parent.normalize(); // Merge adjacent text nodes
        }
    });

    // --- 15. Vocabulary Interactive Buttons Logic ---
    const vocabButtons = document.querySelectorAll('.vocab-btn');
    vocabButtons.forEach(btn => {
        const englishText = btn.textContent;
        const vietnameseText = btn.getAttribute('data-vi');
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            btn.classList.toggle('active');
            if (btn.classList.contains('active')) {
                btn.textContent = `${englishText} (${vietnameseText})`;
            } else {
                btn.textContent = englishText;
            }
        });
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
                                        <th>Ví dụ trong bài</th>
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
    if (adviceResizer && adviceWorkspace) {
        let isDraggingSplit = false;

        adviceResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDraggingSplit = true;
            adviceResizer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingSplit) return;
            const rect = adviceWorkspace.getBoundingClientRect();
            if (rect.width <= 0) return;
            let pct = ((e.clientX - rect.left) / rect.width) * 100;
            pct = Math.max(30, Math.min(70, pct));
            adviceWorkspace.style.setProperty('--left-pane-width', `${pct.toFixed(1)}%`);
        });

        window.addEventListener('mouseup', () => {
            if (!isDraggingSplit) return;
            isDraggingSplit = false;
            adviceResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

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

    // 16.4 Sidebar Drawer Toggle (Hidden by default in split-screen writing mode)
    const toggleSidebarBtn = document.getElementById('advice-toggle-sidebar-btn');
    if (toggleSidebarBtn && appLayout) {
        toggleSidebarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = appLayout.classList.toggle('sidebar-open');
            toggleSidebarBtn.classList.toggle('active', isOpen);
        });

        // Close sidebar overlay when clicking outside of it
        document.addEventListener('click', (e) => {
            if (!appLayout.classList.contains('sidebar-open')) return;
            if (!e.target.closest('.sidebar') && !e.target.closest('#advice-toggle-sidebar-btn')) {
                appLayout.classList.remove('sidebar-open');
                toggleSidebarBtn.classList.remove('active');
            }
        });
    }

    // 16.5 Countdown Timer (20:00)
    const adviceTimerBtn = document.getElementById('advice-timer-btn');
    const adviceTimerDisplay = document.getElementById('advice-timer-display');
    if (adviceTimerBtn && adviceTimerDisplay) {
        let remainingSec = 20 * 60;
        let timerInterval = null;

        const renderTimer = () => {
            const m = Math.floor(remainingSec / 60).toString().padStart(2, '0');
            const s = (remainingSec % 60).toString().padStart(2, '0');
            adviceTimerDisplay.textContent = `${m}:${s}`;
        };

        adviceTimerBtn.addEventListener('click', () => {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
                adviceTimerBtn.classList.remove('running');
                return;
            }
            if (remainingSec <= 0) {
                remainingSec = 20 * 60;
            }
            adviceTimerBtn.classList.add('running');
            timerInterval = setInterval(() => {
                if (remainingSec > 0) {
                    remainingSec--;
                    renderTimer();
                    if (remainingSec <= 120) {
                        adviceTimerBtn.classList.remove('running');
                        adviceTimerBtn.classList.add('warning');
                    }
                } else {
                    clearInterval(timerInterval);
                    timerInterval = null;
                    adviceTimerDisplay.textContent = 'Hết giờ!';
                }
            }, 1000);
        });
    }

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
        const cleaned = String(text || '').trim();
        if (!cleaned) return 0;
        return cleaned.split(/\s+/).filter(Boolean).length;
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
        if (!isCurrentAdviceSubmitted) {
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
            adviceFeedbackTitle.textContent = `✓ Đã nộp bài viết (${wc} từ)! Đối chiếu với bài mẫu chuẩn:`;
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
            advicePeekSampleBtn.title = 'Ẩn / Hiện bài mẫu đối chiếu';
        }
        if (adviceSubmitBtn && !authState.isSubmittingAdvice) {
            adviceSubmitBtn.textContent = 'Nộp lại';
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
            selectAdvicePrompt(e.target.value);
        });
    }

    advicePromptNumBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectAdvicePrompt(btn.getAttribute('data-advice-prompt'));
        });
    });

    if (adviceTextarea) {
        let initialDraft = '';
        try {
            initialDraft = localStorage.getItem(getAdviceStorageKey(currentAdvicePromptId)) || '';
            if (initialDraft) {
                adviceTextarea.value = initialDraft;
            }
        } catch (e) {}

        isCurrentAdviceSubmitted = checkStoredAdviceSubmitted(currentAdvicePromptId, initialDraft);
        syncAdviceSampleUI(isCurrentAdviceSubmitted);
        updateAdviceWordState();

        adviceTextarea.addEventListener('input', () => {
            updateAdviceWordState();
            try {
                localStorage.setItem(getAdviceStorageKey(currentAdvicePromptId), adviceTextarea.value);
            } catch (e) {}
        });
    }

    if (adviceSubmitBtn && adviceFeedbackBox) {
        adviceSubmitBtn.addEventListener('click', async () => {
            const minW = getAdviceMinWords();
            const content = adviceTextarea ? adviceTextarea.value.trim() : '';
            const wc = countWordsClean(content);
            if (wc < minW || authState.isSubmittingAdvice) return;

            const pData = ADVICE_PROMPTS_DATA[currentAdvicePromptId];
            const lessonId = getAdviceLessonId(currentAdvicePromptId);
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
                targetLevel: currentAdviceLevel
            });

            authState.isSubmittingAdvice = false;

            if (!res.ok) {
                adviceSubmitBtn.disabled = false;
                adviceSubmitBtn.textContent = isCurrentAdviceSubmitted ? 'Nộp lại' : 'Nộp bài';
                if (adviceStatusEl) {
                    adviceStatusEl.textContent = `⚠️ Lỗi gửi bài lên Giáo viên: ${res.error}`;
                    adviceStatusEl.classList.remove('ready');
                }
                return;
            }

            isCurrentAdviceSubmitted = true;
            try {
                localStorage.setItem(getAdviceSubmittedKey(currentAdvicePromptId), '1');
            } catch (e) {}
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
            if (!isCurrentAdviceSubmitted) return;
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
            try {
                localStorage.removeItem(getAdviceStorageKey(currentAdvicePromptId));
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

    function applyEssayLevel(lv) {
        currentEssayLevel = lv === 'B2' ? 'B2' : 'B1';
        essayLevelBtns.forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-essay-level') === currentEssayLevel);
        });

        const activeContainer = document.querySelector(`.essay-topic-guides[data-essay-topic="${currentEssayTopic}"]`);
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
    if (essayResizer && essayWorkspace) {
        let isDraggingEssaySplit = false;

        essayResizer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDraggingEssaySplit = true;
            essayResizer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDraggingEssaySplit) return;
            const rect = essayWorkspace.getBoundingClientRect();
            if (rect.width <= 0) return;
            let pct = ((e.clientX - rect.left) / rect.width) * 100;
            pct = Math.max(32, Math.min(72, pct));
            essayWorkspace.style.setProperty('--left-pane-width', `${pct.toFixed(1)}%`);
        });

        window.addEventListener('mouseup', () => {
            if (!isDraggingEssaySplit) return;
            isDraggingEssaySplit = false;
            essayResizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });
    }

    // 17.3 Toggle Sample Essay (Show / Hide) for B1 & B2
    const essaySampleToggleBtns = document.querySelectorAll('[data-essay-sample-toggle]');
    essaySampleToggleBtns.forEach(btn => {
        btn.addEventListener('click', () => {
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
    });

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
            try {
                localStorage.setItem(getCurrentEssayStorageKey(), essayTextarea.value);
            } catch (e) {}
        });
    }

    if (essaySubmitBtn) {
        essaySubmitBtn.addEventListener('click', async () => {
            const content = essayTextarea ? essayTextarea.value.trim() : '';
            const wc = countWordsClean(content);
            if (wc < 250 || authState.isSubmittingEssay) return;

            const topic = ESSAY_TOPICS[currentEssayTopic] || ESSAY_TOPICS['children-devices'];
            const lessonId = currentEssayTopic;
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
                targetLevel: currentEssayLevel
            });

            authState.isSubmittingEssay = false;

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
            try {
                localStorage.removeItem(getCurrentEssayStorageKey());
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
                        Chưa có bài sửa nào.<br />Khi bạn nộp bài Task 01 hoặc Task 02, bài sửa chi tiết sẽ tự động được gửi vào đây sau 12 tiếng.
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

    async function refreshStudentReviews() {
        const client = CLOUD ? CLOUD.getClient() : null;
        if (!client || !currentAccount) return;
        try {
            const { data } = await client
                .from('writing_ai_reviews')
                .select('*')
                .eq('user_id', currentAccount.id);
            if (Array.isArray(data)) {
                const map = {};
                data.forEach(row => {
                    if (row && row.lesson_id) map[row.lesson_id] = row;
                });
                authState.reviewsByLessonId = map;
                renderNotificationBell();
                renderMySubmissionsView();
                renderTeacherFeedbackBox(adviceTeacherFeedbackBox, getCloudSubmission(getAdviceLessonId(currentAdvicePromptId)));
                renderTeacherFeedbackBox(essayTeacherFeedbackBox, getCloudSubmission(currentEssayTopic));
            }
        } catch (e) {}
    }

    function startNotificationPolling() {
        if (authState.notifPollTimer) {
            clearInterval(authState.notifPollTimer);
            authState.notifPollTimer = null;
        }
        authState.notifPollTimer = setInterval(() => {
            if (currentAccount && document.visibilityState === 'visible') {
                refreshStudentReviews();
            }
        }, 60000);
    }

    if (topbarNotifBtn && topbarNotifDropdown) {
        topbarNotifBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            authState.notifOpen = !authState.notifOpen;
            topbarNotifDropdown.style.display = authState.notifOpen ? 'block' : 'none';
            topbarNotifBtn.setAttribute('aria-expanded', authState.notifOpen ? 'true' : 'false');
            if (authState.notifOpen) {
                refreshStudentReviews();
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
            refreshStudentReviews();
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
                const relAt = sub.ai_release_at || (sub.submitted_at ? new Date(new Date(sub.submitted_at).getTime() + 12 * 60 * 60 * 1000).toISOString() : '');
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
            topbarUserInitials.textContent = CLOUD.getInitials(currentAccount.name);
        }
        if (topbarUserName) {
            topbarUserName.textContent = currentAccount.name || currentAccount.email;
        }
        renderNotificationBell();
        renderMySubmissionsView();
    }

    function hydrateWritingViewsFromCloud() {
        selectAdvicePrompt(currentAdvicePromptId, { skipScroll: true });
        selectEssayTopic(currentEssayTopic, { skipResetTimer: true, skipScroll: true });
        renderMySubmissionsView();
    }

    async function handleSignOut(askConfirm = false) {
        if (askConfirm && !confirm('Bạn có muốn đăng xuất khỏi tài khoản hiện tại?')) {
            return;
        }
        const client = CLOUD ? CLOUD.getClient() : null;
        if (client) {
            try {
                await client.auth.signOut();
            } catch (e) {}
        }
        currentAccount = null;
        authState.isTeacher = false;
        authState.needsProfileSetup = false;
        authState.submissionsByLessonId = {};
        authState.reviewsByLessonId = {};
        authState.notifOpen = false;
        if (authState.notifPollTimer) {
            clearInterval(authState.notifPollTimer);
            authState.notifPollTimer = null;
        }
        if (topbarNotifDropdown) topbarNotifDropdown.style.display = 'none';
        authState.authMode = 'login';
        authState.authError = '';
        authState.authInfo = '';
        authState.authLoading = false;
        if (adviceTextarea) adviceTextarea.value = '';
        if (essayTextarea) essayTextarea.value = '';
        renderTeacherFeedbackBox(adviceTeacherFeedbackBox, null);
        renderTeacherFeedbackBox(essayTeacherFeedbackBox, null);
        navigateToView('home-dashboard');
        renderAuthGate();
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
                    authState.profileFormError = 'Vui lòng chọn lớp của bạn (ONB204 hoặc CB221).';
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

    async function loadCloudStudentData(sessionUser) {
        const client = CLOUD ? CLOUD.getClient() : null;
        if (!client || !sessionUser) return;

        const uid = sessionUser.id;
        const email = String(sessionUser.email || '').trim().toLowerCase();
        const wantsPracticeMode = new URLSearchParams(window.location.search).get('mode') === 'practice';
        const isPrimaryTeacherEmail = email === 'mtung0208@gmail.com';

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
        const resolvedClass = parsed.className || (CLOUD.CLASS_LIST.includes(metaClass) ? metaClass : '');
        const resolvedName = parsed.fullName || fallbackName;
        const storedFullName = CLOUD.formatStoredFullName(resolvedName, resolvedClass);

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
                currentAccount = null;
                authState.isTeacher = false;
                authState.needsProfileSetup = false;
                authState.submissionsByLessonId = {};
                renderAuthGate();
            }
        });
    })();
});

// --- 9. Collapsible Prompt List ---
window.togglePromptList = function(element) {
    element.classList.toggle('collapsed');
};

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
