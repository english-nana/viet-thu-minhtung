// ============================================================================
// SUPABASE EDGE FUNCTION: grade-writing
// Chấm & sửa bài viết VSTEP Task 01 (Thư/Email) & Task 02 (Luận) theo B1 / B2,
// hẹn trả bài sửa chậm nhất sau 6 giờ, và hỗ trợ hàng đợi tự động chấm lại (pg_cron)
// mỗi 5 phút khi AI quá tải (503 / 429) để đảm bảo 100% bài đều xong trước hạn!
//
// Triển khai trên Supabase Dashboard (không cần cài CLI):
// 1. Vào Edge Functions -> Secrets:
//    - GEMINI_API_KEY = <API key từ https://aistudio.google.com/apikey>
//    - CRON_SECRET    = <một chuỗi bí mật bất kỳ, VD: vstep-retry-2026-secret>
// 2. Vào Edge Functions -> grade-writing -> Code -> dán toàn bộ file này -> Deploy updates.
// 3. Tắt "Verify JWT with legacy secret" trong tab Settings / Details của grade-writing.
// ============================================================================

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const RELEASE_DELAY_HOURS = 6;
const MAX_STUDENT_GRADES_PER_LESSON = 5;
const MAX_AUTO_RETRIES = 20;
const RETRY_COOLDOWN_MS = 90 * 1000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
  });
}

function buildVstepGradingPrompt(params: {
  taskType: string;
  lessonTitle: string;
  promptText: string;
  content: string;
  targetLevel: string;
}) {
  const isTask1 = params.taskType === "task1";
  const level = params.targetLevel === "B2" ? "B2" : "B1";
  const taskLabel = isTask1
    ? "VSTEP Writing Task 1 (Viết Thư / Email, tối thiểu 120 từ)"
    : "VSTEP Writing Task 2 (Viết Luận / Essay, tối thiểu 250 từ)";

  const levelGuidance =
    level === "B2"
      ? `Mục tiêu của học viên là trình độ B2 (tương đương 6.0 - 8.0/10 VSTEP):
- Sửa các lỗi ngữ pháp, chính tả, dấu câu và dùng từ chưa chính xác/chưa tự nhiên.
- Nếu câu quá đơn giản hoặc lặp từ rõ rệt khiến bài khó chạm B2, có thể đề xuất cách sửa gọn, tự nhiên ở chuẩn B2 (nhưng KHÔNG viết lại thành văn C1/C2 quá hàn lâm).
- Nếu lập luận, giải thích hoặc ví dụ còn mỏng so với chuẩn B2, hãy đề xuất 1-2 câu tiếng Anh chuẩn B2 trong mục "idea_additions" để học viên mở rộng ý.`
      : `Mục tiêu của học viên là trình độ B1 (tương đương 4.0 - 5.5/10 VSTEP):
- Chỉ cần bài viết đúng ngữ pháp cơ bản, rõ nghĩa, đúng chính tả/dấu câu và trả lời đủ các yêu cầu của đề bài.
- KHÔNG ép học viên dùng từ vựng phức tạp hoặc cấu trúc B2/C1. Nếu câu học viên viết đơn giản nhưng đúng ngữ pháp và chấp nhận được ở mức B1 thì GIỮ NGUYÊN, KHÔNG SỬA.
- Chỉ thêm gợi ý trong "idea_additions" nếu học viên bỏ sót ý của đề bài hoặc viết quá cụt chưa rõ nghĩa.`;

  return `Bạn là giáo viên chấm bài VSTEP Writing giàu kinh nghiệm, sửa bài tận tâm, ngắn gọn, dễ hiểu cho học viên Việt Nam.

THÔNG TIN BÀI LÀM:
- Dạng bài: ${taskLabel}
- Đề / Chủ đề: ${params.lessonTitle}
- Trình độ mục tiêu học viên chọn: Level ${level}
- Đề bài gốc:
"""
${params.promptText || "(Không có mô tả đề bài)"}
"""

BÀI VIẾT CỦA HỌC VIÊN:
"""
${params.content}
"""

NGUYÊN TẮC SỬA BÀI BẮT BUỘC:
1. CHỈ SỬA những lỗi thực sự cần thiết thuộc 4 nhóm sau:
   - "Ngữ pháp": sai thì, chia động từ, mạo từ (a/an/the), giới từ, thiếu chủ ngữ/động từ, cấu trúc câu sai, nối câu sai (run-on/comma splice).
   - "Chính tả": sai chính tả tiếng Anh hoặc viết sai dạng từ rõ rệt.
   - "Dấu câu": thiếu/sai dấu chấm, dấu phẩy, viết hoa đầu câu gây ảnh hưởng đến câu.
   - "Từ vựng": dùng từ sai nghĩa, dịch từng từ (word-by-word), kết hợp từ sai, hoặc sai văn phong (quá suồng sã/quá cứng so với yêu cầu đề).
2. TUYỆT ĐỐI KHÔNG BẮT LỖI VẶT: Những lỗi quá nhỏ nhặt hoặc cách diễn đạt vẫn đúng và chấp nhận được ở trình độ ${level} thì KHÔNG ĐƯỢC SỬA. Không viết lại toàn bộ câu nếu chỉ sai 1-2 từ; hãy trích đoạn ngắn vừa đủ (2 đến 10 từ) để học viên thấy ngay chỗ sai.
3. Với mỗi lỗi trong mảng "corrections":
   - Trường "original" PHẢI trích CHÍNH XÁC từng ký tự (verbatim) từ bài viết của học viên để hệ thống có thể gạch lỗi trực tiếp trên bài gốc.
   - Trường "corrected" là cụm từ đã sửa chuẩn xác, tự nhiên theo đúng mức ${level}.
   - Trường "explanation_vi" giải thích rõ ràng, ngắn gọn bằng tiếng Việt TẠI SAO SAI và CÁCH NHỚ.
4. Về phần bổ sung ý ("idea_additions"):
   - Đối chiếu bài viết với đề bài gốc. Nếu học viên bỏ sót ý hoặc có ý viết còn sơ sài, chưa có giải thích/ví dụ rõ ràng, hãy liệt kê trong "idea_additions" (tối đa 3 mục). Nếu bài đã đủ ý tốt ở mức ${level}, trả về mảng rỗng [].
5. ${levelGuidance}
6. Trường "revised_version": Giữ nguyên cấu trúc đoạn và ý tưởng gốc của học viên, chỉ áp dụng các chỗ đã sửa và chèn tự nhiên các câu bổ sung ý (nếu có). Phân tách các đoạn bằng "\\n\\n".

TRẢ VỀ DUY NHẤT MỘT JSON HỢP LỆ (không thêm markdown hay văn bản ngoài JSON) theo đúng cấu trúc sau:
{
  "level_assessment": "Đánh giá ngắn gọn so với mục tiêu (VD: Đạt mức B1 / Gần đạt mức B2 - cần chỉnh vài lỗi ngữ pháp)",
  "estimated_band": "Ước lượng mức (VD: B1+ · 6.0/10 hoặc B2 · 7.0/10)",
  "overall_comment": "2-3 câu nhận xét tổng quan bằng tiếng Việt: khen điểm làm tốt trước, sau đó nêu 1-2 điểm quan trọng nhất cần khắc phục.",
  "criteria": {
    "task_fulfillment": "Nhận xét ngắn gọn tiếng Việt về mức độ hoàn thành các yêu cầu đề bài",
    "organization": "Nhận xét ngắn gọn về bố cục đoạn và liên kết câu",
    "vocabulary": "Nhận xét ngắn gọn về từ vựng & văn phong",
    "grammar": "Nhận xét ngắn gọn về ngữ pháp & độ chính xác"
  },
  "corrections": [
    {
      "id": 1,
      "original": "trích nguyên văn từ bài học viên",
      "corrected": "cách sửa chuẩn mức ${level}",
      "category": "Ngữ pháp",
      "explanation_vi": "Giải thích ngắn gọn tại sao sai và cách sửa đúng"
    }
  ],
  "idea_additions": [
    {
      "where_vi": "Vị trí nên bổ sung (VD: Đoạn thân bài 2 - phần giải pháp)",
      "issue_vi": "Ý này đang thiếu gì hoặc viết chưa tới chỗ nào",
      "suggested_sentences_en": "1-2 câu tiếng Anh đúng trình độ ${level} để học viên thêm vào",
      "meaning_vi": "Nghĩa tiếng Việt của câu gợi ý"
    }
  ],
  "revised_version": "Toàn bộ bài viết sau khi áp dụng các sửa đổi (giữ nguyên ý của học viên)"
}`;
}

function parseModelJson(rawText: string) {
  const trimmed = String(rawText || "").trim();
  const unfenced = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(unfenced);
}

interface SubmissionRow {
  id: string;
  user_id: string;
  task_type?: string;
  lesson_id: string;
  lesson_title?: string;
  prompt_text?: string;
  content?: string;
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

async function gradeSingleSubmission(
  admin: SupabaseClient,
  geminiApiKey: string,
  geminiModel: string,
  sub: SubmissionRow,
  existingReview: ReviewRow | null,
  options: { isTeacherOrCron: boolean; releaseNow: boolean }
) {
  const content = String(sub.content || "").trim();
  const words = content.split(/\s+/).filter(Boolean).length;
  if (words < 50) {
    return { ok: false, status: 400, error: "Bài viết quá ngắn để chấm sửa." };
  }

  const prevCount = existingReview?.grade_count || 0;
  const prevRetry = existingReview?.retry_count || 0;

  if (!options.isTeacherOrCron && prevCount >= MAX_STUDENT_GRADES_PER_LESSON) {
    return {
      ok: false,
      status: 429,
      error: `Bạn đã dùng hết ${MAX_STUDENT_GRADES_PER_LESSON} lượt sửa bài tự động cho đề này.`
    };
  }

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

  await admin
    .from("writing_submissions")
    .update({
      ai_status: "grading",
      ai_release_at: releaseAtIso
    })
    .eq("id", sub.id);

  const prompt = buildVstepGradingPrompt({
    taskType: sub.task_type || "task2",
    lessonTitle: sub.lesson_title || sub.lesson_id,
    promptText: sub.prompt_text || "",
    content,
    targetLevel: sub.target_level || "B1"
  });

  const fallbackModels = Array.from(
    new Set([geminiModel, "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"])
  );

  let geminiRes: Response | null = null;
  let lastStatus = 500;
  let lastErrText = "";

  for (const modelName of fallbackModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.25,
            responseMimeType: "application/json"
          }
        })
      });
      if (res.ok) {
        geminiRes = res;
        break;
      }
      lastStatus = res.status;
      lastErrText = await res.text().catch(() => "");
      if ((res.status === 503 || res.status === 429 || res.status === 500) && attempt === 0) {
        await new Promise(r => setTimeout(r, 1200));
        continue;
      }
      break;
    }
    if (geminiRes) break;
  }

  if (!geminiRes) {
    const nextRetry = prevRetry + 1;
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
        error_message: `Gemini API lỗi (${lastStatus}): ${lastErrText.slice(0, 220)}`,
        grade_count: prevCount,
        retry_count: nextRetry,
        updated_at: nowIso
      },
      { onConflict: "submission_id" }
    );
    await admin
      .from("writing_submissions")
      .update({ ai_status: "pending_retry", ai_release_at: releaseAtIso })
      .eq("id", sub.id);

    return {
      ok: false,
      status: 502,
      error: `AI tạm quá tải (${lastStatus}) — đã xếp hàng đợi tự chấm lại (lần ${nextRetry}/${MAX_AUTO_RETRIES}).`
    };
  }

  const geminiJson = await geminiRes.json();
  const rawCandidate = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsedReview = parseModelJson(rawCandidate);

  const normalizedReview = {
    level_assessment: String(parsedReview?.level_assessment || ""),
    estimated_band: String(parsedReview?.estimated_band || ""),
    overall_comment: String(parsedReview?.overall_comment || ""),
    criteria: {
      task_fulfillment: String(parsedReview?.criteria?.task_fulfillment || ""),
      organization: String(parsedReview?.criteria?.organization || ""),
      vocabulary: String(parsedReview?.criteria?.vocabulary || ""),
      grammar: String(parsedReview?.criteria?.grammar || "")
    },
    corrections: Array.isArray(parsedReview?.corrections)
      ? parsedReview.corrections
          .map((c: Record<string, unknown>, idx: number) => ({
            id: Number(c?.id) || idx + 1,
            original: String(c?.original || "").trim(),
            corrected: String(c?.corrected || "").trim(),
            category: String(c?.category || "Ngữ pháp").trim(),
            explanation_vi: String(c?.explanation_vi || "").trim()
          }))
          .filter((c: { original: string; corrected: string }) => c.original && c.corrected && c.original !== c.corrected)
      : [],
    idea_additions: Array.isArray(parsedReview?.idea_additions)
      ? parsedReview.idea_additions
          .map((it: Record<string, unknown>) => ({
            where_vi: String(it?.where_vi || "").trim(),
            issue_vi: String(it?.issue_vi || "").trim(),
            suggested_sentences_en: String(it?.suggested_sentences_en || "").trim(),
            meaning_vi: String(it?.meaning_vi || "").trim()
          }))
          .filter((it: { suggested_sentences_en: string; issue_vi: string }) => it.suggested_sentences_en || it.issue_vi)
      : [],
    revised_version: String(parsedReview?.revised_version || "").trim()
  };

  const nextCount = options.isTeacherOrCron ? Math.max(1, prevCount) : prevCount + 1;
  const isAlreadyReleased = new Date(releaseAtIso).getTime() <= Date.now();

  const { error: upsertRevErr } = await admin.from("writing_ai_reviews").upsert(
    {
      submission_id: sub.id,
      user_id: sub.user_id,
      task_type: sub.task_type || "task2",
      lesson_id: sub.lesson_id,
      lesson_title: sub.lesson_title || sub.lesson_id,
      target_level: sub.target_level || "B1",
      status: "ready",
      release_at: releaseAtIso,
      review_json: normalizedReview,
      error_message: "",
      grade_count: nextCount,
      retry_count: 0,
      student_seen_at: null,
      updated_at: nowIso
    },
    { onConflict: "submission_id" }
  );

  if (upsertRevErr) {
    return {
      ok: false,
      status: 500,
      error: `Lỗi lưu bài sửa vào writing_ai_reviews: ${upsertRevErr.message}`
    };
  }

  const { error: updSubErr } = await admin
    .from("writing_submissions")
    .update({
      ai_status: isAlreadyReleased ? "ready" : "scheduled",
      ai_release_at: releaseAtIso
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
    ai_status: isAlreadyReleased ? "ready" : "scheduled",
    release_at: releaseAtIso,
    review_json: normalizedReview
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || "";
    const geminiModel = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";
    const cronSecretEnv = Deno.env.get("CRON_SECRET") || "";

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse({ ok: false, error: "Thiếu cấu hình Supabase trên Edge Function." }, 500);
    }
    if (!geminiApiKey) {
      return jsonResponse({ ok: false, error: "Chưa cấu hình GEMINI_API_KEY trong Supabase Edge Functions Secrets." }, 500);
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "single").trim();

    // Kiểm tra xem cuộc gọi đến từ pg_cron (qua x-cron-secret) hay từ người dùng đăng nhập
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
      const { data: teacherRow } = await admin
        .from("teachers")
        .select("email")
        .ilike("email", callerEmail)
        .maybeSingle();
      isTeacher = Boolean(teacherRow) || callerEmail === "mtung0208@gmail.com";
    }

    // ========================================================================
    // MODE 1: HÀNG ĐỢI TỰ ĐỘNG CHẤM LẠI (pg_cron mỗi 5 phút hoặc Giáo viên bấm)
    // ========================================================================
    if (mode === "process_queue") {
      if (!isCronCall && !isTeacher) {
        return jsonResponse({ ok: false, error: "Chỉ hệ thống hoặc Giáo viên được chạy hàng đợi chấm bài." }, 403);
      }

      const batchSize = Math.max(1, Math.min(5, Number(body?.batch_size) || 3));

      const [{ data: allSubs, error: subsErr }, { data: allReviews }] = await Promise.all([
        admin
          .from("writing_submissions")
          .select("*")
          .eq("is_submitted", true)
          .order("submitted_at", { ascending: true })
          .limit(120),
        admin.from("writing_ai_reviews").select("submission_id, status, retry_count, grade_count, release_at, updated_at")
      ]);

      if (subsErr) {
        return jsonResponse({ ok: false, error: "Lỗi đọc danh sách bài chờ chấm: " + subsErr.message }, 500);
      }

      const reviewBySubId: Record<string, ReviewRow> = {};
      (allReviews || []).forEach((r: ReviewRow) => {
        if (r && r.submission_id) reviewBySubId[r.submission_id] = r;
      });

      const nowMs = Date.now();
      const pendingSubs = (allSubs || []).filter((sub: SubmissionRow) => {
        const rev = reviewBySubId[sub.id];
        if (rev && rev.status === "ready") return false;
        if (rev && (rev.retry_count || 0) >= MAX_AUTO_RETRIES) return false;
        if (rev && rev.updated_at && !isTeacher) {
          const lastTryMs = new Date(rev.updated_at).getTime();
          if (!isNaN(lastTryMs) && nowMs - lastTryMs < RETRY_COOLDOWN_MS) return false;
        }
        return true;
      });

      const slice = pendingSubs.slice(0, batchSize);
      const results: Array<{ id: string; ok: boolean; error?: string }> = [];

      for (let i = 0; i < slice.length; i++) {
        const sub = slice[i];
        const res = await gradeSingleSubmission(
          admin,
          geminiApiKey,
          geminiModel,
          sub,
          reviewBySubId[sub.id] || null,
          { isTeacherOrCron: true, releaseNow: false }
        );
        results.push({ id: sub.id, ok: res.ok, error: res.ok ? undefined : res.error });
        if (i < slice.length - 1) {
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      return jsonResponse({
        ok: true,
        mode: "process_queue",
        pending_total: pendingSubs.length,
        processed: results.length,
        succeeded: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
        results
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

    const gradeRes = await gradeSingleSubmission(admin, geminiApiKey, geminiModel, sub, existingReview || null, {
      isTeacherOrCron: isTeacher,
      releaseNow
    });

    if (!gradeRes.ok) {
      return jsonResponse({ ok: false, error: gradeRes.error }, gradeRes.status || 500);
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
