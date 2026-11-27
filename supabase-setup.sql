-- ============================================================================
-- VSTEP WRITING (TASK 01 & 02) — SUPABASE DATABASE SETUP
-- ============================================================================
-- An toàn khi chạy trên cùng dự án Supabase với Speaking Part 1:
-- - Giữ nguyên toàn bộ bảng teachers, profiles, speaking_attempts hiện có
-- - Bổ sung bảng public.writing_submissions & public.writing_ai_reviews
-- - Bảo mật 6 giờ ở tầng Database (RLS): học viên chỉ đọc được bài sửa
--   khi release_at <= now(), còn Giáo viên xem được ngay lập tức
--
-- Cách chạy:
-- 1. Mở Supabase Dashboard -> SQL Editor -> New query
-- 2. Dán toàn bộ file này và bấm nút RUN (nếu hiện cảnh báo drop/delete, bấm Run query)
-- 3. Vào Authentication -> URL Configuration -> Redirect URLs và thêm:
--    https://english-nana.github.io/viet-thu-minhtung/**
--    https://english-nana.github.io/viet-thu-minhtung/teacher.html
-- ============================================================================

-- 1. ĐẢM BẢO BẢNG GIÁO VIÊN & HÀM is_teacher() TỒN TẠI
create table if not exists public.teachers (
  email text primary key,
  full_name text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_teachers_lower_email
  on public.teachers (lower(email));

alter table public.teachers enable row level security;

insert into public.teachers (email, full_name)
values ('mtung0208@gmail.com', 'admin')
on conflict (email) do update set full_name = excluded.full_name;

create or replace function public.is_teacher()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists "Teachers can read own record" on public.teachers;
create policy "Teachers can read own record"
  on public.teachers for select
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- 2. ĐẢM BẢO BẢNG HỒ SƠ HỌC VIÊN (PROFILES) TỒN TẠI
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  avatar_url text not null default '',
  auth_provider text not null default 'email',
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index if not exists idx_profiles_last_active
  on public.profiles (last_active_at desc);

alter table public.profiles enable row level security;

drop policy if exists "Profiles: student read own or teacher read all" on public.profiles;
create policy "Profiles: student read own or teacher read all"
  on public.profiles for select
  using (auth.uid() = id or public.is_teacher());

drop policy if exists "Profiles: student insert own" on public.profiles;
create policy "Profiles: student insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Profiles: student update own or teacher update" on public.profiles;
create policy "Profiles: student update own or teacher update"
  on public.profiles for update
  using (auth.uid() = id or public.is_teacher())
  with check (auth.uid() = id or public.is_teacher());

drop policy if exists "Profiles: teacher delete any" on public.profiles;
create policy "Profiles: teacher delete any"
  on public.profiles for delete
  using (public.is_teacher());

create or replace function public.teacher_delete_student(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_teacher() then
    raise exception 'Permission denied: only teachers can delete accounts';
  end if;
  if target_user_id is null then
    raise exception 'Missing target_user_id';
  end if;
  if target_user_id = auth.uid() then
    raise exception 'Cannot delete your own active teacher account';
  end if;

  delete from auth.users where id = target_user_id;
end;
$$;

-- 3. BẢNG BÀI VIẾT CỦA HỌC VIÊN (TASK 01 VIẾT THƯ & TASK 02 VIẾT LUẬN)
create table if not exists public.writing_submissions (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_type text not null default 'task2',
  lesson_id text not null,
  lesson_title text not null default '',
  prompt_text text not null default '',
  content text not null default '',
  word_count int not null default 0,
  target_level text not null default 'B1',
  is_submitted boolean not null default true,
  submitted_at timestamptz not null default now(),
  teacher_feedback text not null default '',
  teacher_score text not null default '',
  ai_status text not null default '',
  ai_release_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

alter table public.writing_submissions
  add column if not exists ai_status text not null default '';

alter table public.writing_submissions
  add column if not exists ai_release_at timestamptz;

create index if not exists idx_writing_submissions_user on public.writing_submissions (user_id, lesson_id);
create index if not exists idx_writing_submissions_submitted on public.writing_submissions (is_submitted, submitted_at desc);
create index if not exists idx_writing_submissions_queue
  on public.writing_submissions (ai_release_at asc, submitted_at asc)
  where is_submitted = true and ai_status not in ('ready', 'scheduled', 'skipped');

alter table public.writing_submissions enable row level security;

drop policy if exists "Writing: student read own or teacher read all" on public.writing_submissions;
create policy "Writing: student read own or teacher read all"
  on public.writing_submissions for select
  using (auth.uid() = user_id or public.is_teacher());

drop policy if exists "Writing: student insert own" on public.writing_submissions;
create policy "Writing: student insert own"
  on public.writing_submissions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Writing: student update own or teacher grade" on public.writing_submissions;
create policy "Writing: student update own or teacher grade"
  on public.writing_submissions for update
  using (auth.uid() = user_id or public.is_teacher())
  with check (auth.uid() = user_id or public.is_teacher());

drop policy if exists "Writing: student delete own or teacher delete" on public.writing_submissions;
create policy "Writing: student delete own or teacher delete"
  on public.writing_submissions for delete
  using (auth.uid() = user_id or public.is_teacher());

-- Bảo vệ cột điểm, nhận xét giáo viên và tự động đưa bài mới/bài nộp lại vào hàng đợi chấm 6 giờ
create or replace function public.protect_writing_teacher_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_teacher() and coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.teacher_feedback := '';
      new.teacher_score := '';
      new.ai_status := 'pending';
      new.ai_release_at := coalesce(new.submitted_at, now()) + interval '6 hours';
    else
      new.teacher_feedback := old.teacher_feedback;
      new.teacher_score := old.teacher_score;
      if new.content is distinct from old.content
         or new.submitted_at is distinct from old.submitted_at
         or new.target_level is distinct from old.target_level then
        new.ai_status := 'pending';
        new.ai_release_at := coalesce(new.submitted_at, now()) + interval '6 hours';
        update public.writing_ai_reviews
        set status = 'pending',
            retry_count = 0,
            error_message = '',
            release_at = new.ai_release_at,
            student_seen_at = null,
            updated_at = now()
        where submission_id = new.id;
      else
        new.ai_status := old.ai_status;
        new.ai_release_at := old.ai_release_at;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_writing_teacher_fields on public.writing_submissions;
create trigger trg_protect_writing_teacher_fields
  before insert or update on public.writing_submissions
  for each row execute procedure public.protect_writing_teacher_fields();

-- 4. BẢNG BÀI SỬA CHI TIẾT & HẸN GIỜ TRẢ CHẬM NHẤT SAU 6 GIỜ + THÔNG BÁO
create table if not exists public.writing_ai_reviews (
  submission_id text primary key references public.writing_submissions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_type text not null default 'task2',
  lesson_id text not null,
  lesson_title text not null default '',
  target_level text not null default 'B1',
  status text not null default 'pending',
  release_at timestamptz not null default (now() + interval '6 hours'),
  review_json jsonb,
  error_message text not null default '',
  grade_count int not null default 1,
  retry_count int not null default 0,
  student_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.writing_ai_reviews
  add column if not exists retry_count int not null default 0;

alter table public.writing_ai_reviews
  alter column release_at set default (now() + interval '6 hours');

create index if not exists idx_writing_ai_reviews_user_release
  on public.writing_ai_reviews (user_id, release_at desc);

create index if not exists idx_writing_ai_reviews_status_updated
  on public.writing_ai_reviews (status, updated_at);

alter table public.writing_ai_reviews enable row level security;

-- Học viên CHỈ được đọc bài sửa khi đã tới hạn 6 giờ (release_at <= now()); Giáo viên đọc được ngay
drop policy if exists "AI Reviews: teacher read all or student read after release" on public.writing_ai_reviews;
create policy "AI Reviews: teacher read all or student read after release"
  on public.writing_ai_reviews for select
  using (
    public.is_teacher()
    or (
      auth.uid() = user_id
      and status = 'ready'
      and release_at <= now()
    )
  );

drop policy if exists "AI Reviews: teacher manage all" on public.writing_ai_reviews;
create policy "AI Reviews: teacher manage all"
  on public.writing_ai_reviews for all
  using (public.is_teacher())
  with check (public.is_teacher());

-- Học viên đánh dấu đã xem thông báo bài sửa (chỉ áp dụng cho bài đã tới giờ trả)
create or replace function public.mark_writing_review_seen(p_submission_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.writing_ai_reviews
  set student_seen_at = coalesce(student_seen_at, now())
  where submission_id = p_submission_id
    and user_id = auth.uid()
    and status = 'ready'
    and release_at <= now();
end;
$$;

-- Giáo viên có thể bấm trả bài sửa sớm hơn 6 giờ bất cứ lúc nào (chỉ áp dụng cho bài đã chấm xong)
create or replace function public.teacher_release_review_now(p_submission_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
begin
  if not public.is_teacher() then
    raise exception 'Permission denied: only teachers can release reviews early';
  end if;

  update public.writing_ai_reviews
  set release_at = now_ts,
      student_seen_at = null,
      updated_at = now_ts
  where submission_id = p_submission_id
    and status = 'ready';

  if not found then
    raise exception 'Bài viết này chưa có bài sửa hoàn tất để trả sớm.';
  end if;

  update public.writing_submissions
  set ai_release_at = now_ts,
      ai_status = 'ready',
      updated_at = now_ts
  where id = p_submission_id;
end;
$$;

-- Hàng đợi nguyên tử cho Edge Function (tránh chấm trùng khi có nhiều worker hoặc 50+ học viên nộp đồng thời)
create or replace function public.claim_pending_writing_submissions(
  p_batch_size int default 5,
  p_max_retries int default 20,
  p_cooldown_seconds int default 90,
  p_stale_lock_seconds int default 180,
  p_ignore_cooldown boolean default false
)
returns table (
  id text,
  user_id uuid,
  task_type text,
  lesson_id text,
  lesson_title text,
  prompt_text text,
  content text,
  word_count int,
  target_level text,
  submitted_at timestamptz,
  ai_release_at timestamptz,
  prev_grade_count int,
  prev_retry_count int,
  prev_release_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int := greatest(1, least(20, coalesce(p_batch_size, 5)));
  v_now timestamptz := now();
  rec record;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Forbidden';
  end if;

  for rec in
    select
      s.id,
      s.user_id,
      s.task_type,
      s.lesson_id,
      s.lesson_title,
      s.prompt_text,
      s.content,
      s.word_count,
      s.target_level,
      s.submitted_at,
      s.ai_release_at,
      coalesce(r.grade_count, 0) as prev_grade_count,
      coalesce(r.retry_count, 0) as prev_retry_count,
      r.release_at as prev_release_at
    from public.writing_submissions s
    left join public.writing_ai_reviews r on r.submission_id = s.id
    where s.is_submitted = true
      and coalesce(s.ai_status, '') not in ('ready', 'scheduled', 'skipped')
      and (
        r.submission_id is null
        or (
          r.status not in ('ready', 'skipped')
          and coalesce(r.retry_count, 0) < p_max_retries
        )
      )
      and (
        r.submission_id is null
        or r.status <> 'grading'
        or r.updated_at <= v_now - make_interval(secs => p_stale_lock_seconds)
      )
      and (
        p_ignore_cooldown
        or r.submission_id is null
        or r.status <> 'error'
        or r.updated_at <= v_now - make_interval(secs => p_cooldown_seconds)
      )
    order by coalesce(r.release_at, s.ai_release_at, s.submitted_at, v_now) asc, s.submitted_at asc
    limit v_limit
    for update of s skip locked
  loop
    insert into public.writing_ai_reviews (
      submission_id,
      user_id,
      task_type,
      lesson_id,
      lesson_title,
      target_level,
      status,
      release_at,
      error_message,
      grade_count,
      retry_count,
      updated_at
    )
    values (
      rec.id,
      rec.user_id,
      coalesce(nullif(rec.task_type, ''), 'task2'),
      rec.lesson_id,
      coalesce(nullif(rec.lesson_title, ''), rec.lesson_id),
      coalesce(nullif(rec.target_level, ''), 'B1'),
      'grading',
      coalesce(rec.prev_release_at, rec.ai_release_at, coalesce(rec.submitted_at, v_now) + interval '6 hours'),
      '',
      rec.prev_grade_count,
      rec.prev_retry_count,
      v_now
    )
    on conflict (submission_id) do update
      set status = 'grading',
          updated_at = v_now;

    update public.writing_submissions
    set ai_status = 'grading',
        updated_at = v_now
    where public.writing_submissions.id = rec.id;

    id := rec.id;
    user_id := rec.user_id;
    task_type := rec.task_type;
    lesson_id := rec.lesson_id;
    lesson_title := rec.lesson_title;
    prompt_text := rec.prompt_text;
    content := rec.content;
    word_count := rec.word_count;
    target_level := rec.target_level;
    submitted_at := rec.submitted_at;
    ai_release_at := rec.ai_release_at;
    prev_grade_count := rec.prev_grade_count;
    prev_retry_count := rec.prev_retry_count;
    prev_release_at := rec.prev_release_at;
    return next;
  end loop;
end;
$$;

-- 5. CẤP QUYỀN TRUY CẬP SCHEMA & BẢNG CHO TÀI KHOẢN ĐÃ ĐĂNG NHẬP & SERVICE_ROLE (EDGE FUNCTION)
grant usage on schema public to anon, authenticated, service_role;
grant select on table public.teachers to authenticated, service_role;
grant select, insert, update, delete on table public.profiles to authenticated, service_role;
grant select, insert, update, delete on table public.writing_submissions to authenticated, service_role;
grant select, insert, update, delete on table public.writing_ai_reviews to authenticated, service_role;
grant execute on function public.is_teacher() to anon, authenticated, service_role;
grant execute on function public.teacher_delete_student(uuid) to authenticated, service_role;
grant execute on function public.mark_writing_review_seen(text) to authenticated, service_role;
grant execute on function public.teacher_release_review_now(text) to authenticated, service_role;
revoke all on function public.claim_pending_writing_submissions(int, int, int, int, boolean) from public, anon, authenticated;
grant execute on function public.claim_pending_writing_submissions(int, int, int, int, boolean) to service_role;

-- 6. BẬT HÀNG ĐỢI TỰ ĐỘNG CHẤM LẠI MỖI 2 PHÚT (CHẠY RIÊNG SAU KHI CÀI CRON_SECRET)
-- Hướng dẫn:
--   Bước A: Vào Edge Functions -> Secrets -> thêm secret tên CRON_SECRET (ví dụ: vstep-retry-2026-secret)
--   Bước B: Thay ĐÚNG giá trị CRON_SECRET bên dưới rồi bấm RUN 1 lần duy nhất:

create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('vstep-grade-writing-queue') where exists (
  select 1 from cron.job where jobname = 'vstep-grade-writing-queue'
);
select cron.schedule(
  'vstep-grade-writing-queue',
  '*/2 * * * *',
  $$
  select net.http_post(
    url := 'https://isnwdcqglswkdtgtwiat.supabase.co/functions/v1/grade-writing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'THAY_BANG_CRON_SECRET_CUA_BAN'
    ),
    body := '{"mode":"process_queue","batch_size":4}'::jsonb
  );
  $$
);
