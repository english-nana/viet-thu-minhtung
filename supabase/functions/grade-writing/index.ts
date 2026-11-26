// ============================================================================
// SUPABASE EDGE FUNCTION: grade-writing
// Chấm & sửa bài viết VSTEP Task 01 (Thư/Email) & Task 02 (Luận) theo B1 / B2,
// hẹn trả bài sửa chậm nhất sau 6 giờ, kiểm soát tải đồng thời (50+ học viên)
// và hỗ trợ hàng đợi tự động chấm lại (pg_cron + self-draining tail)
// để đảm bảo 100% bài đều hoàn tất ổn định trước hạn!
//
// Triển khai trên Supabase Dashboard (không cần cài CLI):
// 1. Vào Edge Functions -> Secrets:
//    - GEMINI_API_KEY  = <API key từ https://aistudio.google.com/apikey>
//    - GEMINI_API_KEYS = <(Tùy chọn) danh sách nhiều API key cách nhau dấu phẩy để xoay vòng khi quá tải>
//    - CRON_SECRET     = <một chuỗi bí mật bất kỳ, VD: vstep-retry-2026-secret>
// 2. Vào Edge Functions -> grade-writing -> Code -> dán toàn bộ file này -> Deploy updates.
// 3. Tắt "Verify JWT with legacy secret" trong tab Settings / Details của grade-writing.
// ============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void } | undefined;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const RELEASE_DELAY_HOURS = 6;
const MAX_STUDENT_GRADES_PER_LESSON = 5;
const MAX_AUTO_RETRIES = 20;
const RETRY_COOLDOWN_MS = 90 * 1000;
const STALE_LOCK_MS = 180 * 1000;
const GEMINI_TIMEOUT_MS = 25000;
const QUEUE_WALL_BUDGET_MS = 42000;

function getMaxConcurrentGrades(): number {
  const raw = Number(Deno.env.get("MAX_CONCURRENT_GRADES") || 5);
  if (!Number.isFinite(raw)) return 5;
  return Math.max(1, Math.min(12, Math.floor(raw)));
}

function parseGeminiApiKeys(): string[] {
  const poolRaw = Deno.env.get("GEMINI_API_KEYS") || "";
  const singleRaw = Deno.env.get("GEMINI_API_KEY") || "";
  const parts = `${poolRaw},${singleRaw}`
    .split(/[\n,;]+/)
    .map(k => k.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
  });
}

function inferTargetLevelFromClass(
  rawFullNameOrClass: string | undefined,
  fallbackLevel?: string
): "B1" | "B2" | "C1" {
  const raw = String(rawFullNameOrClass || "").trim();
  const bracketMatch = raw.match(/^\[([A-Za-z0-9_-]+)\]/);
  const classToken = (bracketMatch ? bracketMatch[1] : raw).toUpperCase();
  if (classToken.startsWith("CB")) return "B1";
  if (classToken.includes("C1")) return "C1";
  if (classToken.includes("B2")) return "B2";
  if (classToken.includes("B1")) return "B1";
  const fb = String(fallbackLevel || "").trim().toUpperCase();
  if (fb === "C1" || fb === "B2" || fb === "B1") return fb;
  return "B1";
}

function buildVstepGradingPrompt(params: {
  taskType: string;
  lessonTitle: string;
  promptText: string;
  content: string;
  targetLevel: string;
}) {
  const isTask1 = params.taskType === "task1";
  const rawLv = String(params.targetLevel || "").trim().toUpperCase();
  const level: "B1" | "B2" | "C1" = rawLv === "C1" ? "C1" : rawLv === "B2" ? "B2" : "B1";
  const taskLabel = isTask1
    ? "VSTEP Writing Task 1 (Viết Thư / Email — tối thiểu 120 từ, chiếm 1/3 tổng điểm Writing)"
    : "VSTEP Writing Task 2 (Viết Luận / Essay — tối thiểu 250 từ, chiếm 2/3 tổng điểm Writing)";

  const scaleGuide = `THANG ĐIỂM & QUY ĐỔI TRÌNH ĐỘ VSTEP CHÍNH THỨC (làm tròn theo bước 0.25):
- Dưới 4.0/10: Không đạt
- 4.0 – 5.5/10: Trình độ B1
- 6.0 – 8.5/10: Trình độ B2
- 9.0 – 9.5/10 (và 10.0): Trình độ C1
- Công thức bài thi tổng hợp: Điểm Writing = (Task 1 + Task 2 × 2) ÷ 3.`;

  const taskScoringRubric = isTask1
    ? `THANG ĐIỂM CHÍNH THỨC VSTEP WRITING TASK 1 (RATING SCALE FOR VSTEP WRITING TASK 1 — Band 0–10):
${scaleGuide}
- Đánh giá theo đúng 4 tiêu chí chính thức (Task Fulfilment, Organization, Vocabulary, Grammar):
  * Band 9.0–10.0 (C1): Hoàn thành hiệu quả mọi yêu cầu & mục đích giao tiếp, giọng văn nhất quán & phù hợp; phát triển đầy đủ ý chính với chi tiết sát; tổ chức logic, liên kết & chia đoạn linh hoạt; từ vựng phong phú gồm từ ít phổ biến, kiểm soát tốt văn phong & collocation; câu đơn/phức đa dạng chính xác, đa số câu không lỗi, lỗi (nếu có) không mang tính hệ thống và không cản trở giao tiếp.
  * Band 6.0–8.5 (B2 — 6.0–6.5 B2 cơ bản | 7.0–7.75 B2 vững | 8.0–8.5 B2+): Hoàn thành tất cả (hoặc hầu hết) yêu cầu đề; mục đích giao tiếp rõ ràng (đôi chỗ có thể còn vài bất nhất nhỏ về giọng văn/format); trình bày được các ý chính, tổ chức mạch lạc với từ nối & liên kết phù hợp; vốn từ đủ đến tốt (từ 7.0 trở lên có collocation & thử dùng từ ít phổ biến); dùng câu đơn và câu phức hiệu quả (từ 8.0 trở lên đa số câu không lỗi); lỗi ngữ pháp/từ vựng (nếu có) HIẾM KHI gây hiểu nhầm và KHÔNG cản trở giao tiếp.
  * Band 4.0–5.5 (B1): Chỉ hoàn thành một phần yêu cầu đề; mục đích giao tiếp đôi chỗ chưa rõ hoặc sai giọng văn nhẹ; ý chính còn hạn chế/dễ sa vào chi tiết; tổ chức khá mạch lạc với từ nối quen thuộc; vốn từ đủ dùng mức cơ bản nhưng hay lặp từ; kiểm soát tốt câu đơn nhưng câu phức thử nghiệm thường sai; lỗi có thể gây khó hiểu nhẹ ở một vài chỗ.
  * Dưới 4.0 (Không đạt): Không giải quyết được yêu cầu đề, tổ chức rời rạc, vốn từ rất hạn chế và lỗi ngữ pháp/chính tả dày đặc làm sai lệch nghĩa.
- Lưu ý văn phong Task 1: Thư thân mật gửi bạn bè (informal) ưu tiên sự tự nhiên, gần gũi; KHÔNG bắt lỗi vì không dùng từ trang trọng kiểu "ensure/purchase".`
    : `THANG ĐIỂM & TIÊU CHÍ CHẤM VSTEP WRITING TASK 2 (Tham chiếu "Band Descriptor Writing Task 2", quy đổi sát thang điểm VSTEP 0–10):
${scaleGuide}
- Quy đổi tham khảo 4 tiêu chí (Task Response, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy):
  * Mức 9.0–9.5/10 (C1): Giải quyết trọn vẹn và sâu sắc mọi phần đề; lập trường sắc nét xuyên suốt; ý tưởng phát triển đầy đủ, có luận cứ & ví dụ thuyết phục; liên kết tự nhiên mượt mà, chia đoạn chuẩn mực; từ vựng phong phú chính xác, dùng từ ít phổ biến & collocation tự nhiên; câu phức đa dạng linh hoạt, đa số câu không lỗi (lỗi nếu có chỉ là sơ suất hiếm gặp).
  * Mức 6.0–8.5/10 (B2 — 6.0–6.75 B2 cơ bản | 7.0–7.75 B2 vững | 8.0–8.5 B2+): Giải quyết đầy đủ các phần đề, có quan điểm rõ ràng; tổ chức thông tin logic, mỗi đoạn có chủ đề rõ và liên kết mạch lạc; vốn từ đủ đến linh hoạt cho chủ đề học thuật (ở mức 7.0–8.5 có ý thức về style/collocation và từ ít phổ biến); kết hợp tốt câu đơn và câu phức — lỗi nhỏ thỉnh thoảng xuất hiện nhưng HIẾM KHI làm giảm hiệu quả giao tiếp.
  * Mức 4.0–5.5/10 (B1): Trả lời được một phần hoặc ở mức tối thiểu, phát triển ý còn hạn chế/thiếu ví dụ; có bố cục nhưng mạch tiến triển chưa đều, từ nối còn lặp; từ vựng cơ bản đủ truyền đạt; dùng chủ yếu câu đơn, câu phức hay mắc lỗi nhưng vẫn hiểu được ý chính.
  * Dưới 4.0/10 (Không đạt): Lạc đề hoặc không giải quyết được yêu cầu đề, thiếu mạch lạc, từ vựng quá hạn chế và lỗi ngữ pháp/chính tả dày đặc gây biến dạng nghĩa.`;

  const levelGuidance =
    level === "C1"
      ? `Mục tiêu lớp của học viên là trình độ C1 VSTEP (mốc đạt: 9.0 – 9.5/10):
- Đọc bài theo kỳ vọng chuẩn C1 (độ chính xác ngữ pháp cao, từ vựng học thuật/collocation tự nhiên, văn phong chuẩn xác, lập luận có chiều sâu), nhưng VẪN phải công tâm, động viên, KHÔNG sửa nát bài và KHÔNG bắt lỗi vặt vô lý.
- Trong "corrections": ưu tiên sửa các lỗi sai thật sự (ngữ pháp, chính tả, sai sắc thái/collocation, diễn đạt lủng củng ảnh hưởng band C1). Chỉ trích cụm ngắn 1–6 từ, gộp các lỗi giống nhau thành 1 mục.
- Trong "idea_additions" (tối đa 2–3 mục): gợi ý 1–2 câu chuẩn C1 (sắc sảo, collocation tự nhiên, lập luận sâu) để học viên nâng bài lên chạm mốc 9.0–9.5/10.`
      : level === "B2"
        ? `Mục tiêu lớp của học viên là trình độ B2 VSTEP (mốc đạt: 6.0 – 8.5/10):
- Chỉ sửa những lỗi ngữ pháp, chính tả, dấu câu, dùng từ thực sự sai hoặc gây lủng củng/sai sắc thái rõ rệt so với chuẩn B2.
- KHÔNG ép viết lại câu đang đúng thành văn C1/C2 quá hàn lâm. Nếu câu đã tự nhiên ở mức B2 thì GIỮ NGUYÊN.
- Trong "idea_additions" (tối đa 2–3 mục): chỉ thêm gợi ý chuẩn B2 khi ý trả lời đề còn thiếu hoặc lập luận/ví dụ còn mỏng so với chuẩn 6.0–8.5.`
        : `Mục tiêu lớp của học viên là trình độ B1 VSTEP (mốc đạt: 4.0 – 5.5/10):
- Chỉ cần đúng ngữ pháp cơ bản, rõ nghĩa, đúng chính tả/dấu câu và trả lời đủ ý đề bài.
- TUYỆT ĐỐI KHÔNG ép dùng từ vựng hay cấu trúc B2/C1. Câu đơn giản nhưng đúng ngữ pháp ở mức B1 thì GIỮ NGUYÊN, KHÔNG SỬA.
- Trong "idea_additions": chỉ gợi ý câu tiếng Anh đơn giản chuẩn B1 nếu học viên bỏ sót yêu cầu đề hoặc viết quá cụt chưa rõ nghĩa.`;

  return `Bạn là giáo viên chấm bài VSTEP Writing tận tâm, công tâm và giàu kinh nghiệm tại Việt Nam. Hãy chấm điểm sát thực tế kỳ thi VSTEP và sửa bài mang tính xây dựng, động viên để học viên thấy rõ điểm mạnh lẫn chỗ cần cải thiện mà không bị nản lòng.

THÔNG TIN BÀI LÀM:
- Dạng bài: ${taskLabel}
- Đề / Chủ đề: ${params.lessonTitle}
- Trình độ mục tiêu (suy từ mã lớp của học viên): Level ${level} VSTEP
- Đề bài gốc:
"""
${params.promptText || "(Không có mô tả đề bài)"}
"""

BÀI VIẾT CỦA HỌC VIÊN:
"""
${params.content}
"""

${taskScoringRubric}

NGUYÊN TẮC CHẤM ĐIỂM & SỬA BÀI BẮT BUỘC:
1. CHẤM ĐIỂM CÔNG TÂM, LÀM TRÒN BƯỚC 0.25 & SÁT THỰC TẾ:
   - Mọi con số điểm PHẢI làm tròn theo bội số 0.25 (ví dụ: 3.5, 4.75, 5.25, 6.75, 7.5, 8.25, 9.0, 9.25).
   - Quy đổi bắt buộc: Dưới 4.0 = Không đạt | 4.0–5.5 = B1 | 6.0–8.5 = B2 | 9.0–9.5 = C1.
   - Đưa ra KHOẢNG ĐIỂM hợp lý (biên độ khoảng 0.5 điểm) kèm trình độ tương ứng trong "estimated_band", ví dụ: "Không đạt · 3.25 – 3.75/10", "B1 · 4.75 – 5.25/10", "B2 · 7.5 – 8.0/10", "C1 · 9.0 – 9.25/10".
   - Đánh giá tổng thể theo mức độ hoàn thành nhiệm vụ và khả năng truyền đạt hiệu quả, không chấm quá gắt gao vì 1–2 sơ suất nhỏ.
2. NGUYÊN TẮC "KHÔNG SỬA NÁT BÀI" & KHÔNG BẮT LỖI VẶT:
   - CHỈ sửa lỗi thực sự sai thuộc 4 nhóm: "Ngữ pháp" (chia động từ, thì, giới từ/mạo từ sai rõ, thiếu thành phần câu, lặp chủ ngữ sai như "or you contact"), "Chính tả" (sai chính tả tiếng Anh/dạng từ), "Dấu câu" (thiếu/sai gây đứt gãy câu), "Từ vựng" (dùng sai nghĩa/sai ngữ cảnh rõ rệt, VD "reliable bank" thay vì "reliable website/platform").
   - TUYỆT ĐỐI KHÔNG sửa theo sở thích cá nhân khi câu của học viên đã đúng ngữ pháp và tự nhiên ở văn phong tương ứng (VD: KHÔNG sửa bỏ "who" trong "a seller who you have never dealt with", KHÔNG ép đổi "some books" thành "books", KHÔNG ép đổi "make sure" thành "ensure" trong thư thân mật gửi bạn bè, KHÔNG đổi số ít/số nhiều nếu cả hai đều chấp nhận được).
   - Chọn lọc tối đa 3–6 lỗi giá trị nhất cho bài khá/tốt (và tối đa 7–8 lỗi quan trọng nhất cho bài yếu hơn) để học viên dễ tiếp thu.
3. GẠCH SỬA TỐI GIẢN — TUYỆT ĐỐI KHÔNG GẠCH CẢ CÂU DÀI:
   - Với mỗi mục trong "corrections", trường "original" CHỈ được trích ĐÚNG CỤM TỪ CHỨA LỖI (thường 1 đến 6 từ, chỉ kèm thêm 1–2 từ liền kề nếu cần ngữ cảnh; ví dụ: "shoping" -> "shopping", "a reliable bank" -> "a reliable website", "or you contact" -> "or contact").
   - TUYỆT ĐỐI CẤM đưa cả một câu 15–30 từ vào "original" nếu lỗi chỉ nằm ở 1–2 từ trong câu đó.
   - "original" phải trích chính xác từng ký tự từ bài học viên để hệ thống gạch đúng vị trí.
4. GỘP CÁC LỖI GIỐNG NHAU THÀNH 1 LỖI:
   - Nếu cùng một loại lỗi lặp lại nhiều lần trong bài (VD: lặp lỗi chính tả tương tự, lặp lỗi chia động từ số ít/số nhiều, lặp cùng 1 lỗi mạo từ), CHỈ TÍNH LÀ 1 LỖI: tạo 1 mục đại diện trong "corrections", giải thích cách khắc phục chung và ghi chú ngắn trong "explanation_vi" (VD: "Lỗi tương tự cũng xuất hiện ở một vài chỗ khác trong bài"), KHÔNG tạo nhiều mục trùng lặp và KHÔNG trừ điểm nhiều lần cho cùng 1 lỗi.
5. GIỌNG VĂN XÂY DỰNG & ĐỘNG VIÊN:
   - "overall_comment" luôn bắt đầu bằng 1–2 câu khen ngợi cụ thể điểm làm tốt của bài viết (bố cục, hoàn thành yêu cầu đề, cấu trúc câu hay, từ vựng tự nhiên...), rồi mới gợi ý nhẹ nhàng 1–2 điểm ưu tiên phù hợp với mục tiêu Level ${level} của học viên.
6. ${levelGuidance}
7. Trường "revised_version": Giữ nguyên giọng văn, bố cục đoạn và ý tưởng gốc của học viên, chỉ áp dụng các chỗ đã sửa (và chèn nhẹ câu bổ sung nếu thực sự cần). Phân tách các đoạn bằng "\\n\\n".

TRẢ VỀ DUY NHẤT MỘT JSON HỢP LỆ (không thêm markdown hay văn bản ngoài JSON) theo đúng cấu trúc sau:
{
  "level_assessment": "Đánh giá ngắn gọn, tích cực so với mục tiêu Level ${level} (VD: Đạt mục tiêu B2 / Gần chạm mốc C1 - diễn đạt tự nhiên và mạch lạc)",
  "estimated_band": "Khoảng điểm làm tròn 0.25 & trình độ VSTEP (VD: B2 · 7.5 – 8.0/10 hoặc C1 · 9.0 – 9.25/10)",
  "score_note": "Quy đổi bài thi VSTEP: Điểm Writing = (Task 1 + Task 2 × 2) ÷ 3 (${isTask1 ? "Task 1 chiếm 1/3 trọng số" : "Task 2 chiếm 2/3 trọng số"}) · Làm tròn 0.25",
  "overall_comment": "2-3 câu nhận xét mang tính xây dựng & động viên: khen cụ thể điểm làm tốt trước, sau đó gợi ý 1-2 điểm quan trọng nhất phù hợp mục tiêu Level ${level}.",
  "criteria": {
    "task_fulfillment": "Nhận xét ngắn gọn tiếng Việt về mức độ hoàn thành yêu cầu đề & văn phong",
    "organization": "Nhận xét ngắn gọn về bố cục đoạn và liên kết câu",
    "vocabulary": "Nhận xét ngắn gọn về từ vựng & độ tự nhiên",
    "grammar": "Nhận xét ngắn gọn về ngữ pháp & độ chính xác"
  },
  "corrections": [
    {
      "id": 1,
      "original": "cụm từ ngắn 1-6 từ trích nguyên văn từ bài học viên",
      "corrected": "cách sửa chuẩn và tự nhiên",
      "category": "Ngữ pháp",
      "explanation_vi": "Giải thích ngắn gọn, dễ hiểu tại sao cần sửa và cách nhớ"
    }
  ],
  "idea_additions": [
    {
      "where_vi": "Vị trí nên bổ sung (nếu cần)",
      "issue_vi": "Ý này đang thiếu gì hoặc có thể mở rộng thêm điểm nào cho mục tiêu Level ${level}",
      "suggested_sentences_en": "1-2 câu tiếng Anh đúng trình độ ${level} để học viên tham khảo",
      "meaning_vi": "Nghĩa tiếng Việt của câu gợi ý"
    }
  ],
  "revised_version": "Toàn bộ bài viết sau khi áp dụng các sửa đổi (giữ nguyên ý và giọng văn của học viên)"
}`;
}

function parseModelJson(rawText: string): Record<string, unknown> {
  const trimmed = String(rawText || "").trim();
  if (!trimmed) {
    throw new Error("AI trả về nội dung rỗng.");
  }

  const unfenced = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    const firstBrace = unfenced.indexOf("{");
    const lastBrace = unfenced.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      parsed = JSON.parse(unfenced.slice(firstBrace, lastBrace + 1));
    } else {
      throw new Error("AI không trả về JSON hợp lệ.");
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Cấu trúc JSON từ AI không hợp lệ.");
  }

  const obj = parsed as Record<string, unknown>;
  const hasMeaningfulField =
    String(obj.overall_comment || "").trim() ||
    String(obj.revised_version || "").trim() ||
    String(obj.level_assessment || "").trim();

  if (!hasMeaningfulField) {
    throw new Error("Kết quả JSON từ AI thiếu nội dung đánh giá.");
  }

  return obj;
}

interface SubmissionRow {
  id: string;
  user_id: string;
  task_type?: string;
  lesson_id: string;
  lesson_title?: string;
  prompt_text?: string;
  content?: string;
  word_count?: number;
  target_level?: string;
  submitted_at?: string;
  ai_release_at?: string;
}

interface ReviewRow {
  submission_id: string;
  grade_count?: number;
  retry_count?: number;
  release_at?: string;
  status?: string;
  updated_at?: string;
}

interface ClaimedRow extends SubmissionRow {
  prev_grade_count?: number;
  prev_retry_count?: number;
  prev_release_at?: string;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(3000, timeoutMs));
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const DISCOVERED_MODELS_TTL_MS = 10 * 60 * 1000;
const discoveredModelsCache = new Map<string, { models: string[]; fetchedAt: number }>();

function rankFlashModelId(id: string): number {
  const lower = id.toLowerCase();
  const verMatch = lower.match(/^gemini-(\d+)(?:\.(\d+))?/);
  const major = verMatch ? Number(verMatch[1]) : 0;
  const minor = verMatch && verMatch[2] ? Number(verMatch[2]) : 0;
  let score = major * 100 + minor * 10;
  if (lower.includes("lite")) score -= 3;
  if (lower.includes("preview") || lower.includes("exp")) score -= 2;
  if (lower === "gemini-flash-latest") score = 350;
  return score;
}

async function discoverActiveFlashModels(apiKey: string, timeoutMs: number): Promise<string[]> {
  const cacheKey = apiKey.slice(-8);
  const cached = discoveredModelsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < DISCOVERED_MODELS_TTL_MS) {
    return cached.models;
  }

  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { method: "GET" },
      Math.min(6000, Math.max(2500, timeoutMs))
    );
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const rawModels = Array.isArray(data?.models) ? data.models : [];

    const filtered = rawModels
      .filter((m: Record<string, unknown>) => {
        const methods = Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
        if (!methods.includes("generateContent")) return false;
        const id = String(m?.name || "").replace(/^models\//, "").trim();
        if (!id) return false;
        if (/^gemini-(?:1\.|2\.0)/i.test(id)) return false;
        if (/(?:tts|audio|image|live|embedding|robotics|computer-use|vision|thinking-exp|native-audio)/i.test(id)) {
          return false;
        }
        return /^gemini-[0-9]+(?:\.[0-9]+)*-flash(?:-[a-z0-9.]+)?$/i.test(id) || /^gemini-flash-latest$/i.test(id);
      })
      .map((m: Record<string, unknown>) => String(m?.name || "").replace(/^models\//, "").trim());

    const uniqueSorted = Array.from(new Set<string>(filtered)).sort(
      (a, b) => rankFlashModelId(b) - rankFlashModelId(a)
    );
    if (uniqueSorted.length > 0) {
      discoveredModelsCache.set(cacheKey, { models: uniqueSorted, fetchedAt: Date.now() });
    }
    return uniqueSorted;
  } catch {
    return [];
  }
}

async function callGeminiWithFallback(params: {
  apiKeys: string[];
  geminiModel: string;
  prompt: string;
  deadlineMs?: number;
}): Promise<
  | { ok: true; parsedReview: Record<string, unknown>; modelUsed: string }
  | { ok: false; status: number; error: string }
> {
  const staticModels = Array.from(
    new Set([params.geminiModel, "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter(Boolean))
  );

  let lastStatus = 500;
  let lastErrText = "";
  const errorSummaries: string[] = [];

  for (let keyIdx = 0; keyIdx < params.apiKeys.length; keyIdx++) {
    const apiKey = params.apiKeys[keyIdx];
    let keyExhaustedOrInvalid = false;
    const triedModels = new Set<string>();

    const runOneModel = async (
      modelName: string
    ): Promise<{ ok: true; parsedReview: Record<string, unknown>; modelUsed: string } | { ok: false; timedOut?: boolean }> => {
      if (triedModels.has(modelName)) return { ok: false };
      triedModels.add(modelName);

      if (params.deadlineMs && Date.now() >= params.deadlineMs - 2500) {
        return { ok: false, timedOut: true };
      }

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      let includeThinking = /^gemini-2\.5-flash$/i.test(modelName);

      for (let attempt = 0; attempt < 2; attempt++) {
        const remainingBudget = params.deadlineMs ? params.deadlineMs - Date.now() : GEMINI_TIMEOUT_MS;
        if (remainingBudget < 3000) {
          return { ok: false, timedOut: true };
        }

        const generationConfig: Record<string, unknown> = {
          temperature: 0.25,
          responseMimeType: "application/json",
          maxOutputTokens: 8192
        };
        if (includeThinking) {
          generationConfig.thinkingConfig = { thinkingBudget: 512 };
        }

        const timeoutMs = Math.min(GEMINI_TIMEOUT_MS, remainingBudget);

        try {
          const res = await fetchWithTimeout(
            endpoint,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: params.prompt }] }],
                generationConfig
              })
            },
            timeoutMs
          );

          if (res.ok) {
            const geminiJson = await res.json().catch(() => null);
            const candidate = geminiJson?.candidates?.[0];
            const finishReason = String(candidate?.finishReason || "");
            const rawCandidate = String(candidate?.content?.parts?.[0]?.text || "");

            if (!rawCandidate) {
              lastStatus = 502;
              lastErrText = `AI (${modelName}) trả về rỗng (${finishReason || "NO_TEXT"}).`;
              errorSummaries.push(`${modelName}:EMPTY`);
            } else {
              try {
                const parsedReview = parseModelJson(rawCandidate);
                return { ok: true, parsedReview, modelUsed: modelName };
              } catch (parseErr) {
                lastStatus = 502;
                lastErrText =
                  `AI (${modelName}, ${finishReason || "OK"}) JSON lỗi: ` +
                  (parseErr instanceof Error ? parseErr.message : String(parseErr));
                errorSummaries.push(`${modelName}:JSON`);
              }
            }

            if (attempt === 0) {
              await new Promise(r => setTimeout(r, 800 + Math.floor(Math.random() * 600)));
              continue;
            }
            break;
          }

          lastStatus = res.status;
          lastErrText = (await res.text().catch(() => "")).slice(0, 240);
          errorSummaries.push(`${modelName}:${res.status}`);

          if (res.status === 400 && includeThinking && attempt === 0) {
            // Thử lại ngay cùng model nhưng bỏ thinkingConfig nếu payload bị từ chối
            includeThinking = false;
            continue;
          }
          if (res.status === 401 || res.status === 403) {
            keyExhaustedOrInvalid = true;
            break;
          }
          if (res.status === 400 || res.status === 404) {
            break;
          }
          if (res.status === 429) {
            if (params.apiKeys.length > 1 && keyIdx < params.apiKeys.length - 1) {
              keyExhaustedOrInvalid = true;
              break;
            }
          }
          if ((res.status === 503 || res.status === 429 || res.status === 500 || res.status === 502 || res.status === 504) && attempt === 0) {
            const retryAfterSec = Number(res.headers.get("retry-after") || "0");
            const baseDelay = retryAfterSec > 0 && retryAfterSec <= 4 ? retryAfterSec * 1000 : 1000;
            const jitter = Math.floor(Math.random() * 900);
            await new Promise(r => setTimeout(r, baseDelay + jitter));
            continue;
          }
          break;
        } catch (err) {
          const isAbort = err instanceof Error && err.name === "AbortError";
          lastStatus = isAbort ? 504 : 502;
          lastErrText = isAbort
            ? `AI (${modelName}) quá thời gian chờ (${Math.round(timeoutMs / 1000)}s).`
            : err instanceof Error
              ? err.message
              : "Lỗi kết nối tới Gemini API.";
          errorSummaries.push(`${modelName}:${lastStatus}`);
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 900 + Math.floor(Math.random() * 600)));
            continue;
          }
          break;
        }
      }

      return { ok: false };
    };

    for (const modelName of staticModels) {
      const outcome = await runOneModel(modelName);
      if (outcome.ok) return outcome;
      if (outcome.timedOut) {
        return {
          ok: false,
          status: 504,
          error: `[${errorSummaries.join(", ")}] ${lastErrText || "Hết thời gian chờ phản hồi từ AI."}`
        };
      }
      if (keyExhaustedOrInvalid) break;
    }

    if (!keyExhaustedOrInvalid) {
      const remainingBudget = params.deadlineMs ? params.deadlineMs - Date.now() : GEMINI_TIMEOUT_MS;
      if (remainingBudget > 4000) {
        const discovered = await discoverActiveFlashModels(apiKey, remainingBudget);
        const candidates = discovered.filter(m => !triedModels.has(m)).slice(0, 3);
        for (const modelName of candidates) {
          const outcome = await runOneModel(modelName);
          if (outcome.ok) return outcome;
          if (outcome.timedOut) {
            return {
              ok: false,
              status: 504,
              error: `[${errorSummaries.join(", ")}] ${lastErrText || "Hết thời gian chờ phản hồi từ AI."}`
            };
          }
          if (keyExhaustedOrInvalid) break;
        }
      }
    }
  }

  const hasRateLimit = errorSummaries.some(s => s.endsWith(":429"));
  const summaryPrefix = errorSummaries.length > 0 ? `[${errorSummaries.join(", ")}] ` : "";
  const effectiveStatus = hasRateLimit ? 429 : lastStatus;
  const friendlyHint = hasRateLimit
    ? "API tạm hết hạn mức (429) — có thể thêm API key dự phòng vào GEMINI_API_KEYS. "
    : "";

  return {
    ok: false,
    status: effectiveStatus,
    error: `Gemini API lỗi (${effectiveStatus}): ${summaryPrefix}${friendlyHint}${lastErrText}`
  };
}

async function markSubmissionSkipped(
  admin: SupabaseClient,
  sub: SubmissionRow,
  releaseAtIso: string,
  prevCount: number,
  reason: string
) {
  const nowIso = new Date().toISOString();
  await admin.from("writing_ai_reviews").upsert(
    {
      submission_id: sub.id,
      user_id: sub.user_id,
      task_type: sub.task_type || "task2",
      lesson_id: sub.lesson_id,
      lesson_title: sub.lesson_title || sub.lesson_id,
      target_level: sub.target_level || "B1",
      status: "skipped",
      release_at: releaseAtIso,
      error_message: reason,
      grade_count: prevCount,
      retry_count: MAX_AUTO_RETRIES,
      updated_at: nowIso
    },
    { onConflict: "submission_id" }
  );
  await admin
    .from("writing_submissions")
    .update({ ai_status: "skipped", ai_release_at: releaseAtIso, updated_at: nowIso })
    .eq("id", sub.id);
}

async function markSubmissionError(
  admin: SupabaseClient,
  sub: SubmissionRow,
  releaseAtIso: string,
  prevCount: number,
  nextRetry: number,
  errMsg: string
) {
  const nowIso = new Date().toISOString();
  await admin.from("writing_ai_reviews").upsert(
    {
      submission_id: sub.id,
      user_id: sub.user_id,
      task_type: sub.task_type || "task2",
      lesson_id: sub.lesson_id,
      lesson_title: sub.lesson_title || sub.lesson_id,
      target_level: sub.target_level || "B1",
      status: "error",
      release_at: releaseAtIso,
      error_message: errMsg.slice(0, 260),
      grade_count: prevCount,
      retry_count: nextRetry,
      updated_at: nowIso
    },
    { onConflict: "submission_id" }
  );
  await admin
    .from("writing_submissions")
    .update({ ai_status: "pending_retry", ai_release_at: releaseAtIso, updated_at: nowIso })
    .eq("id", sub.id);
}

async function gradeSingleSubmission(
  admin: SupabaseClient,
  apiKeys: string[],
  geminiModel: string,
  sub: SubmissionRow,
  existingReview: ReviewRow | null,
  options: {
    isTeacherOrCron: boolean;
    forceTeacher?: boolean;
    releaseNow: boolean;
    alreadyClaimed?: boolean;
    deadlineMs?: number;
    studentFullName?: string;
  }
) {
  const effectiveTargetLevel = inferTargetLevelFromClass(options.studentFullName, sub.target_level);
  const subForReview: SubmissionRow = {
    ...sub,
    target_level: effectiveTargetLevel
  };
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const submittedMs = new Date(sub.submitted_at || nowMs).getTime();
  const baseSubmitMs = isNaN(submittedMs) ? nowMs : submittedMs;
  const maxReleaseMs = baseSubmitMs + RELEASE_DELAY_HOURS * 60 * 60 * 1000;
  const maxReleaseIso = new Date(maxReleaseMs).toISOString();

  let releaseAtIso = maxReleaseIso;
  if (options.isTeacherOrCron && options.releaseNow) {
    releaseAtIso = nowIso;
  } else if (existingReview?.release_at) {
    const existingMs = new Date(existingReview.release_at).getTime();
    releaseAtIso = !isNaN(existingMs) && existingMs <= maxReleaseMs ? existingReview.release_at : maxReleaseIso;
  } else if (sub.ai_release_at) {
    const subRelMs = new Date(sub.ai_release_at).getTime();
    releaseAtIso = !isNaN(subRelMs) && subRelMs <= maxReleaseMs ? sub.ai_release_at : maxReleaseIso;
  }

  const prevCount = existingReview?.grade_count || 0;
  const prevRetry = existingReview?.retry_count || 0;
  const content = String(sub.content || "").trim();
  const words = content.split(/\s+/).filter(Boolean).length;

  if (words < 50) {
    await markSubmissionSkipped(
      admin,
      subForReview,
      releaseAtIso,
      prevCount,
      "Bài viết quá ngắn (< 50 từ) nên không chấm tự động."
    );
    return { ok: false, status: 400, error: "Bài viết quá ngắn để chấm sửa (tối thiểu 50 từ)." };
  }

  if (!options.isTeacherOrCron && prevCount >= MAX_STUDENT_GRADES_PER_LESSON) {
    return {
      ok: false,
      status: 429,
      error: `Bạn đã dùng hết ${MAX_STUDENT_GRADES_PER_LESSON} lượt sửa bài tự động cho đề này.`
    };
  }

  // Chống chấm trùng nếu bài đang được worker khác giữ khóa còn hiệu lực
  if (!options.alreadyClaimed && !options.forceTeacher && existingReview?.status === "grading") {
    const lockUpdatedMs = new Date(existingReview.updated_at || 0).getTime();
    if (!isNaN(lockUpdatedMs) && nowMs - lockUpdatedMs < STALE_LOCK_MS) {
      return {
        ok: true,
        status: 200,
        ai_status: "grading",
        release_at: releaseAtIso
      };
    }
  }

  // Giới hạn số lượt gọi AI đồng thời khi 50+ học viên nộp bài cùng lúc; bài vượt ngưỡng xếp vào hàng đợi để pg_cron/tail xử lý mượt
  if (!options.isTeacherOrCron && !options.alreadyClaimed) {
    const maxConcurrent = getMaxConcurrentGrades();
    const staleCutoffIso = new Date(nowMs - STALE_LOCK_MS).toISOString();
    const { count: activeGradingCount } = await admin
      .from("writing_ai_reviews")
      .select("submission_id", { count: "exact", head: true })
      .eq("status", "grading")
      .gte("updated_at", staleCutoffIso);

    if (typeof activeGradingCount === "number" && activeGradingCount >= maxConcurrent) {
      if (existingReview) {
        await admin
          .from("writing_ai_reviews")
          .update({
            target_level: effectiveTargetLevel,
            status: "pending",
            release_at: releaseAtIso,
            retry_count: 0,
            error_message: "",
            updated_at: nowIso
          })
          .eq("submission_id", sub.id);
      } else {
        await admin.from("writing_ai_reviews").insert({
          submission_id: sub.id,
          user_id: sub.user_id,
          task_type: sub.task_type || "task2",
          lesson_id: sub.lesson_id,
          lesson_title: sub.lesson_title || sub.lesson_id,
          target_level: effectiveTargetLevel,
          status: "pending",
          release_at: releaseAtIso,
          error_message: "",
          grade_count: prevCount,
          retry_count: 0,
          updated_at: nowIso
        });
      }
      await admin
        .from("writing_submissions")
        .update({ ai_status: "pending", ai_release_at: releaseAtIso, target_level: effectiveTargetLevel, updated_at: nowIso })
        .eq("id", sub.id);

      return {
        ok: true,
        status: 200,
        ai_status: "queued",
        release_at: releaseAtIso
      };
    }
  }

  // Đặt khóa "grading" (giữ nguyên review_json cũ nếu đang chấm lại)
  if (!options.alreadyClaimed) {
    if (existingReview) {
      await admin
        .from("writing_ai_reviews")
        .update({
          task_type: sub.task_type || "task2",
          lesson_title: sub.lesson_title || sub.lesson_id,
          target_level: effectiveTargetLevel,
          status: "grading",
          release_at: releaseAtIso,
          error_message: "",
          updated_at: nowIso
        })
        .eq("submission_id", sub.id);
    } else {
      await admin.from("writing_ai_reviews").insert({
        submission_id: sub.id,
        user_id: sub.user_id,
        task_type: sub.task_type || "task2",
        lesson_id: sub.lesson_id,
        lesson_title: sub.lesson_title || sub.lesson_id,
        target_level: effectiveTargetLevel,
        status: "grading",
        release_at: releaseAtIso,
        error_message: "",
        grade_count: prevCount,
        retry_count: prevRetry,
        updated_at: nowIso
      });
    }

    await admin
      .from("writing_submissions")
      .update({
        ai_status: "grading",
        ai_release_at: releaseAtIso,
        updated_at: nowIso
      })
      .eq("id", sub.id);
  }

  try {
    const prompt = buildVstepGradingPrompt({
      taskType: sub.task_type || "task2",
      lessonTitle: sub.lesson_title || sub.lesson_id,
      promptText: sub.prompt_text || "",
      content,
      targetLevel: effectiveTargetLevel
    });

    const geminiOut = await callGeminiWithFallback({
      apiKeys,
      geminiModel,
      prompt,
      deadlineMs: options.deadlineMs
    });

    if (!geminiOut.ok) {
      const nextRetry = prevRetry + 1;
      await markSubmissionError(admin, subForReview, releaseAtIso, prevCount, nextRetry, geminiOut.error);
      return {
        ok: false,
        status: 502,
        error: `AI tạm quá tải (${geminiOut.status}) — đã xếp hàng đợi tự chấm lại (lần ${nextRetry}/${MAX_AUTO_RETRIES}).`
      };
    }

    const parsedReview = geminiOut.parsedReview as Record<string, unknown>;
    const criteriaObj = (parsedReview.criteria && typeof parsedReview.criteria === "object"
      ? parsedReview.criteria
      : {}) as Record<string, unknown>;

    const trimCorrectionSpan = (rawOriginal: string, rawCorrected: string) => {
      const orig = String(rawOriginal || "").trim();
      const corr = String(rawCorrected || "").trim();
      if (!orig || !corr || orig === corr) return { original: orig, corrected: corr };

      const origWords = orig.split(/\s+/);
      const corrWords = corr.split(/\s+/);
      if (origWords.length <= 6 && corrWords.length <= 6) {
        return { original: orig, corrected: corr };
      }

      let prefix = 0;
      while (
        prefix < origWords.length &&
        prefix < corrWords.length &&
        origWords[prefix] === corrWords[prefix]
      ) {
        prefix++;
      }

      let suffix = 0;
      while (
        prefix + suffix < origWords.length &&
        prefix + suffix < corrWords.length &&
        origWords[origWords.length - 1 - suffix] === corrWords[corrWords.length - 1 - suffix]
      ) {
        suffix++;
      }

      // Giữ ít nhất 1 từ ngữ cảnh nếu một bên bị rỗng (VD: xoá hoặc chèn 1 từ)
      if (prefix + suffix >= origWords.length || prefix + suffix >= corrWords.length) {
        if (prefix > 0) prefix--;
        else if (suffix > 0) suffix--;
      }

      const trimmedOrig = origWords.slice(prefix, origWords.length - suffix).join(" ").trim();
      const trimmedCorr = corrWords.slice(prefix, corrWords.length - suffix).join(" ").trim();
      if (!trimmedOrig || !trimmedCorr || trimmedOrig === trimmedCorr) {
        return { original: orig, corrected: corr };
      }
      return { original: trimmedOrig, corrected: trimmedCorr };
    };

    const normalizedReview = {
      level_assessment: String(parsedReview.level_assessment || ""),
      estimated_band: String(parsedReview.estimated_band || ""),
      score_note: String(parsedReview.score_note || "").trim(),
      overall_comment: String(parsedReview.overall_comment || ""),
      criteria: {
        task_fulfillment: String(criteriaObj.task_fulfillment || ""),
        organization: String(criteriaObj.organization || ""),
        vocabulary: String(criteriaObj.vocabulary || ""),
        grammar: String(criteriaObj.grammar || "")
      },
      corrections: Array.isArray(parsedReview.corrections)
        ? parsedReview.corrections
            .map((c: Record<string, unknown>, idx: number) => {
              const span = trimCorrectionSpan(String(c?.original || ""), String(c?.corrected || ""));
              return {
                id: Number(c?.id) || idx + 1,
                original: span.original,
                corrected: span.corrected,
                category: String(c?.category || "Ngữ pháp").trim(),
                explanation_vi: String(c?.explanation_vi || "").trim()
              };
            })
            .filter((c: { original: string; corrected: string }) => c.original && c.corrected && c.original !== c.corrected)
        : [],
      idea_additions: Array.isArray(parsedReview.idea_additions)
        ? parsedReview.idea_additions
            .map((it: Record<string, unknown>) => ({
              where_vi: String(it?.where_vi || "").trim(),
              issue_vi: String(it?.issue_vi || "").trim(),
              suggested_sentences_en: String(it?.suggested_sentences_en || "").trim(),
              meaning_vi: String(it?.meaning_vi || "").trim()
            }))
            .filter((it: { suggested_sentences_en: string; issue_vi: string }) => it.suggested_sentences_en || it.issue_vi)
        : [],
      revised_version: String(parsedReview.revised_version || "").trim()
    };

    // Kiểm tra học viên có vừa nộp bản mới hơn hoặc bài có bị xoá trong lúc AI đang chấm không
    const { data: latestSub } = await admin
      .from("writing_submissions")
      .select("id, submitted_at, content")
      .eq("id", sub.id)
      .maybeSingle();

    if (!latestSub) {
      return { ok: false, status: 404, error: "Bài viết đã bị xoá trong lúc đang chấm." };
    }

    const latestContent = String(latestSub.content || "").trim();
    const isSuperseded =
      (sub.submitted_at && latestSub.submitted_at && latestSub.submitted_at !== sub.submitted_at) ||
      latestContent !== content;

    if (isSuperseded) {
      return {
        ok: true,
        status: 200,
        ai_status: "superseded",
        release_at: releaseAtIso
      };
    }

    const doneIso = new Date().toISOString();
    const nextCount = prevCount + 1;
    const isAlreadyReleased = new Date(releaseAtIso).getTime() <= Date.now();
    const finalStatus = isAlreadyReleased ? "ready" : "scheduled";

    const { error: upsertRevErr } = await admin.from("writing_ai_reviews").upsert(
      {
        submission_id: sub.id,
        user_id: sub.user_id,
        task_type: sub.task_type || "task2",
        lesson_id: sub.lesson_id,
        lesson_title: sub.lesson_title || sub.lesson_id,
        target_level: effectiveTargetLevel,
        status: "ready",
        release_at: releaseAtIso,
        review_json: normalizedReview,
        error_message: "",
        grade_count: nextCount,
        retry_count: 0,
        student_seen_at: null,
        updated_at: doneIso
      },
      { onConflict: "submission_id" }
    );

    if (upsertRevErr) {
      await markSubmissionError(admin, subForReview, releaseAtIso, prevCount, prevRetry + 1, upsertRevErr.message);
      return {
        ok: false,
        status: 500,
        error: `Lỗi lưu bài sửa vào writing_ai_reviews: ${upsertRevErr.message}`
      };
    }

    const { error: updSubErr } = await admin
      .from("writing_submissions")
      .update({
        ai_status: finalStatus,
        ai_release_at: releaseAtIso,
        target_level: effectiveTargetLevel,
        updated_at: doneIso
      })
      .eq("id", sub.id);

    if (updSubErr) {
      return {
        ok: false,
        status: 500,
        error: `Lỗi cập nhật trạng thái writing_submissions: ${updSubErr.message}`
      };
    }

    return {
      ok: true,
      status: 200,
      ai_status: finalStatus,
      release_at: releaseAtIso,
      review_json: normalizedReview
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định khi chấm bài.";
    const nextRetry = prevRetry + 1;
    await markSubmissionError(admin, subForReview, releaseAtIso, prevCount, nextRetry, msg).catch(() => {});
    return { ok: false, status: 500, error: msg };
  }
}

async function claimQueueBatch(
  admin: SupabaseClient,
  batchSize: number,
  ignoreCooldown: boolean
): Promise<{
  items: Array<{ sub: SubmissionRow; review: ReviewRow | null; claimed: boolean }>;
  error?: string;
}> {
  const { data: rpcRows, error: rpcErr } = await admin.rpc("claim_pending_writing_submissions", {
    p_batch_size: batchSize,
    p_max_retries: MAX_AUTO_RETRIES,
    p_cooldown_seconds: Math.round(RETRY_COOLDOWN_MS / 1000),
    p_stale_lock_seconds: Math.round(STALE_LOCK_MS / 1000),
    p_ignore_cooldown: ignoreCooldown
  });

  if (!rpcErr && Array.isArray(rpcRows)) {
    const items = (rpcRows as ClaimedRow[]).map(row => ({
      sub: {
        id: row.id,
        user_id: row.user_id,
        task_type: row.task_type,
        lesson_id: row.lesson_id,
        lesson_title: row.lesson_title,
        prompt_text: row.prompt_text,
        content: row.content,
        word_count: row.word_count,
        target_level: row.target_level,
        submitted_at: row.submitted_at,
        ai_release_at: row.ai_release_at
      },
      review: {
        submission_id: row.id,
        grade_count: row.prev_grade_count || 0,
        retry_count: row.prev_retry_count || 0,
        release_at: row.prev_release_at || row.ai_release_at,
        status: "grading"
      },
      claimed: true
    }));
    return { items };
  }

  const rpcErrMsg = rpcErr?.message || "";
  const isMissingRpc =
    rpcErr?.code === "PGRST202" ||
    rpcErr?.code === "42883" ||
    rpcErrMsg.includes("claim_pending_writing_submissions");

  if (rpcErr && !isMissingRpc) {
    return { items: [], error: `Lỗi đọc hàng đợi (RPC): ${rpcErr.message}` };
  }

  // Fallback tương thích ngược nếu chưa chạy lại supabase-setup.sql mới nhất
  const { data: candidateSubs, error: subsErr } = await admin
    .from("writing_submissions")
    .select("*")
    .eq("is_submitted", true)
    .not("ai_status", "in", '("ready","scheduled","skipped")')
    .order("ai_release_at", { ascending: true, nullsFirst: false })
    .order("submitted_at", { ascending: true })
    .limit(60);

  if (subsErr) {
    return { items: [], error: "Lỗi đọc danh sách bài chờ chấm: " + subsErr.message };
  }

  const subsList = (candidateSubs || []) as SubmissionRow[];
  if (subsList.length === 0) {
    return { items: [] };
  }

  const subIds = subsList.map(s => s.id);
  const { data: revRows } = await admin
    .from("writing_ai_reviews")
    .select("submission_id, status, retry_count, grade_count, release_at, updated_at")
    .in("submission_id", subIds);

  const reviewBySubId: Record<string, ReviewRow> = {};
  (revRows || []).forEach((r: ReviewRow) => {
    if (r && r.submission_id) reviewBySubId[r.submission_id] = r;
  });

  const nowMs = Date.now();
  const filtered = subsList.filter(sub => {
    const rev = reviewBySubId[sub.id];
    if (rev && (rev.status === "ready" || rev.status === "skipped")) return false;
    if (rev && (rev.retry_count || 0) >= MAX_AUTO_RETRIES) return false;
    if (rev && rev.status === "grading" && rev.updated_at) {
      const lockMs = new Date(rev.updated_at).getTime();
      if (!isNaN(lockMs) && nowMs - lockMs < STALE_LOCK_MS) return false;
    }
    if (!ignoreCooldown && rev && rev.status === "error" && rev.updated_at) {
      const lastTryMs = new Date(rev.updated_at).getTime();
      if (!isNaN(lastTryMs) && nowMs - lastTryMs < RETRY_COOLDOWN_MS) return false;
    }
    return true;
  });

  return {
    items: filtered.slice(0, batchSize).map(sub => ({
      sub,
      review: reviewBySubId[sub.id] || null,
      claimed: false
    }))
  };
}

async function releaseUnfinishedClaims(
  admin: SupabaseClient,
  items: Array<{ sub: SubmissionRow; claimed: boolean }>
) {
  const claimedIds = items.filter(it => it.claimed).map(it => it.sub.id);
  if (claimedIds.length === 0) return;
  const nowIso = new Date().toISOString();
  await Promise.all([
    admin
      .from("writing_ai_reviews")
      .update({ status: "pending", updated_at: nowIso })
      .in("submission_id", claimedIds)
      .eq("status", "grading"),
    admin
      .from("writing_submissions")
      .update({ ai_status: "pending", updated_at: nowIso })
      .in("id", claimedIds)
      .eq("ai_status", "grading")
  ]).catch(() => {});
}

async function runQueueBatch(
  admin: SupabaseClient,
  apiKeys: string[],
  geminiModel: string,
  batchSize: number,
  ignoreCooldown: boolean,
  startMs: number
) {
  const deadlineMs = startMs + QUEUE_WALL_BUDGET_MS;
  const claimRes = await claimQueueBatch(admin, batchSize, ignoreCooldown);
  if (claimRes.error) {
    return { ok: false, error: claimRes.error };
  }

  const items = claimRes.items;
  const fullNameByUserId: Record<string, string> = {};
  const uniqueUserIds = Array.from(new Set(items.map(it => it.sub.user_id).filter(Boolean)));
  if (uniqueUserIds.length > 0) {
    const { data: profRows } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", uniqueUserIds);
    (profRows || []).forEach((p: { id?: string; full_name?: string }) => {
      if (p && p.id) fullNameByUserId[p.id] = String(p.full_name || "");
    });
  }

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (let i = 0; i < items.length; i++) {
    if (Date.now() >= deadlineMs - 4000) {
      await releaseUnfinishedClaims(admin, items.slice(i));
      break;
    }

    const item = items[i];
    try {
      const res = await gradeSingleSubmission(admin, apiKeys, geminiModel, item.sub, item.review, {
        isTeacherOrCron: true,
        forceTeacher: false,
        releaseNow: false,
        alreadyClaimed: item.claimed,
        deadlineMs,
        studentFullName: fullNameByUserId[item.sub.user_id]
      });
      results.push({ id: item.sub.id, ok: res.ok, error: res.ok ? undefined : res.error });
      if (i < items.length - 1 && Date.now() < deadlineMs - 5000) {
        const pauseMs = res.ok ? 900 : 2200;
        await new Promise(r => setTimeout(r, pauseMs));
      }
    } catch (err) {
      results.push({
        id: item.sub.id,
        ok: false,
        error: err instanceof Error ? err.message : "Lỗi xử lý hàng đợi"
      });
    }
  }

  const { count: pendingRemaining } = await admin
    .from("writing_submissions")
    .select("id", { count: "exact", head: true })
    .eq("is_submitted", true)
    .not("ai_status", "in", '("ready","scheduled","skipped")');

  return {
    ok: true,
    pending_remaining: typeof pendingRemaining === "number" ? pendingRemaining : 0,
    processed: results.length,
    succeeded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const requestStartMs = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const apiKeys = parseGeminiApiKeys();
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const cronSecretEnv = Deno.env.get("CRON_SECRET") || "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({ ok: false, error: "Thiếu cấu hình Supabase trên Edge Function." }, 500);
    }
    if (apiKeys.length === 0) {
      return jsonResponse({ ok: false, error: "Chưa cấu hình GEMINI_API_KEY trong Supabase Edge Functions Secrets." }, 500);
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "single").trim();

    const incomingCronSecret = req.headers.get("x-cron-secret") || "";
    const isCronCall = Boolean(cronSecretEnv && incomingCronSecret && incomingCronSecret === cronSecretEnv);

    let callerId = "";
    let callerEmail = "";
    let isTeacher = false;

    if (!isCronCall) {
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader.startsWith("Bearer ")) {
        return jsonResponse({ ok: false, error: "Chưa đăng nhập." }, 401);
      }
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      const { data: authData, error: authErr } = await admin.auth.getUser(jwt);
      if (authErr || !authData?.user) {
        return jsonResponse({ ok: false, error: "Phiên đăng nhập không hợp lệ: " + (authErr?.message || "") }, 401);
      }
      callerId = authData.user.id;
      callerEmail = String(authData.user.email || "").trim().toLowerCase();

      const { data: teacherRows } = await admin.from("teachers").select("email");
      const matchedTeacher = Array.isArray(teacherRows)
        ? teacherRows.some(row => String(row?.email || "").trim().toLowerCase() === callerEmail)
        : false;
      isTeacher = matchedTeacher || callerEmail === "mtung0208@gmail.com";
    }

    // ========================================================================
    // MODE 1: HÀNG ĐỢI TỰ ĐỘNG CHẤM LẠI (pg_cron hoặc Giáo viên bấm)
    // ========================================================================
    if (mode === "process_queue") {
      if (!isCronCall && !isTeacher) {
        return jsonResponse({ ok: false, error: "Chỉ hệ thống hoặc Giáo viên được chạy hàng đợi chấm bài." }, 403);
      }

      const defaultBatch = isTeacher ? 5 : 4;
      const batchSize = Math.max(1, Math.min(8, Number(body?.batch_size) || defaultBatch));
      const queueRes = await runQueueBatch(admin, apiKeys, geminiModel, batchSize, isTeacher, requestStartMs);

      if (!queueRes.ok) {
        return jsonResponse({ ok: false, error: queueRes.error }, 500);
      }

      return jsonResponse({
        ok: true,
        mode: "process_queue",
        pending_total: queueRes.pending_remaining,
        pending_remaining: queueRes.pending_remaining,
        processed: queueRes.processed,
        succeeded: queueRes.succeeded,
        failed: queueRes.failed,
        results: queueRes.results
      });
    }

    // ========================================================================
    // MODE 2: CHẤM 1 BÀI CỤ THỂ (Học viên vừa nộp hoặc Giáo viên bấm chấm)
    // ========================================================================
    const submissionId = String(body?.submission_id || "").trim();
    const releaseNow = Boolean(body?.release_now);

    if (!submissionId) {
      return jsonResponse({ ok: false, error: "Thiếu submission_id." }, 400);
    }

    const [{ data: sub, error: subErr }, { data: existingReview }] = await Promise.all([
      admin.from("writing_submissions").select("*").eq("id", submissionId).maybeSingle(),
      admin
        .from("writing_ai_reviews")
        .select("submission_id, grade_count, retry_count, release_at, status, updated_at")
        .eq("submission_id", submissionId)
        .maybeSingle()
    ]);

    if (subErr) {
      return jsonResponse(
        { ok: false, error: `Lỗi đọc writing_submissions (${subErr.code || "DB"}): ${subErr.message}` },
        500
      );
    }
    if (!sub) {
      return jsonResponse({ ok: false, error: `Không tìm thấy bài viết trên hệ thống (id: ${submissionId}).` }, 404);
    }
    if (sub.user_id !== callerId && !isTeacher) {
      return jsonResponse({ ok: false, error: "Bạn không có quyền chấm bài viết này." }, 403);
    }

    const { data: studentProfile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", sub.user_id)
      .maybeSingle();

    const gradeRes = await gradeSingleSubmission(admin, apiKeys, geminiModel, sub, existingReview || null, {
      isTeacherOrCron: isTeacher,
      forceTeacher: isTeacher && Boolean(body?.force_teacher),
      releaseNow,
      deadlineMs: requestStartMs + 36000,
      studentFullName: studentProfile?.full_name || ""
    });

    if (!gradeRes.ok) {
      return jsonResponse({ ok: false, error: gradeRes.error }, gradeRes.status || 500);
    }

    // Tự động giải tỏa thêm 1-2 bài đang chờ trong hàng đợi khi có đợt nộp bài ồ ạt (50+ học viên)
    if (
      !isTeacher &&
      gradeRes.ok &&
      Date.now() - requestStartMs < 22000 &&
      typeof EdgeRuntime !== "undefined" &&
      typeof EdgeRuntime.waitUntil === "function"
    ) {
      EdgeRuntime.waitUntil(
        (async () => {
          try {
            await new Promise(r => setTimeout(r, 1200));
            await runQueueBatch(admin, apiKeys, geminiModel, 2, false, requestStartMs);
          } catch {
            // Bỏ qua lỗi nền; pg_cron sẽ tiếp tục xử lý
          }
        })()
      );
    }

    return jsonResponse({
      ok: true,
      status: gradeRes.ai_status,
      release_at: gradeRes.release_at,
      review_json: isTeacher ? gradeRes.review_json : undefined
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lỗi không xác định khi chấm bài.";
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
