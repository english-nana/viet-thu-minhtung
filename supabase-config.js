// ============================================================================
// CẤU HÌNH SUPABASE CHO GITHUB PAGES (https://english-nana.github.io/viet-thu-minhtung/)
// ============================================================================
// Dùng chung dự án Supabase với project Speaking Part 1 để đồng bộ tài khoản
// học viên, danh sách lớp (ONB204, CB221) và tài khoản giáo viên.
// Khóa Publishable (anonKey) là khóa công khai dành cho trình duyệt, an toàn
// khi đưa lên GitHub nhờ Row Level Security (RLS) trong supabase-setup.sql.
// ============================================================================

window.SUPABASE_CONFIG = {
  url: "https://isnwdcqglswkdtgtwiat.supabase.co",
  anonKey: "sb_publishable_dSoyq_B8Nb6UmzReaiFvgQ_bGDkQEbW"
};
