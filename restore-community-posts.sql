-- The Audio Vault: กู้การมองเห็นโพสต์และคำตอบชุมชน
-- ไม่ลบโพสต์หรือคำตอบเดิม

begin;

alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.community_posts to anon, authenticated;
grant select on table public.community_replies to anon, authenticated;
grant insert, update, delete on table public.community_posts to authenticated;
grant insert, update, delete on table public.community_replies to authenticated;

-- ทุกคนเปิดอ่านโพสต์ได้
drop policy if exists "ทุกคนอ่านโพสต์ได้" on public.community_posts;
create policy "ทุกคนอ่านโพสต์ได้"
on public.community_posts
for select
to anon, authenticated
using (true);

-- สมาชิกที่ล็อกอินสร้างโพสต์ของตัวเองได้
drop policy if exists "สมาชิกสร้างโพสต์ได้" on public.community_posts;
create policy "สมาชิกสร้างโพสต์ได้"
on public.community_posts
for insert
to authenticated
with check (
  auth.uid() is not null
  and auth.uid()::text = user_id::text
);

-- เจ้าของแก้ไขโพสต์ของตัวเองได้
drop policy if exists "เจ้าของแก้ไขโพสต์ได้" on public.community_posts;
create policy "เจ้าของแก้ไขโพสต์ได้"
on public.community_posts
for update
to authenticated
using (auth.uid()::text = user_id::text)
with check (auth.uid()::text = user_id::text);

-- เจ้าของลบโพสต์ของตัวเองได้
drop policy if exists "เจ้าของลบโพสต์ได้" on public.community_posts;
create policy "เจ้าของลบโพสต์ได้"
on public.community_posts
for delete
to authenticated
using (auth.uid()::text = user_id::text);

-- ทุกคนเปิดอ่านคำตอบได้
drop policy if exists "ทุกคนอ่านคำตอบได้" on public.community_replies;
create policy "ทุกคนอ่านคำตอบได้"
on public.community_replies
for select
to anon, authenticated
using (true);

-- สมาชิกที่ล็อกอินตอบกลับด้วยบัญชีตัวเองได้
drop policy if exists "สมาชิกตอบกลับได้" on public.community_replies;
create policy "สมาชิกตอบกลับได้"
on public.community_replies
for insert
to authenticated
with check (
  auth.uid() is not null
  and auth.uid()::text = user_id::text
);

-- เจ้าของแก้ไขคำตอบของตัวเองได้
drop policy if exists "เจ้าของแก้ไขคำตอบได้" on public.community_replies;
create policy "เจ้าของแก้ไขคำตอบได้"
on public.community_replies
for update
to authenticated
using (auth.uid()::text = user_id::text)
with check (auth.uid()::text = user_id::text);

-- เจ้าของลบคำตอบของตัวเองได้
drop policy if exists "เจ้าของลบคำตอบได้" on public.community_replies;
create policy "เจ้าของลบคำตอบได้"
on public.community_replies
for delete
to authenticated
using (auth.uid()::text = user_id::text);

commit;

-- ตรวจจำนวนข้อมูลเดิมหลังรัน
select
  (select count(*) from public.community_posts) as community_posts_count,
  (select count(*) from public.community_replies) as community_replies_count;
