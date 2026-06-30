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

    // --- 2. Sidebar Tab Navigation Logic ---
    const tabs = document.querySelectorAll('.nav-tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');

            // Set active class on buttons
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Set active class on content sections
            tabContents.forEach(tc => tc.classList.remove('active'));
            const activeContent = document.getElementById(targetTab);
            if (activeContent) {
                activeContent.classList.add('active');
            }

            // Smooth scroll content area or window to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
