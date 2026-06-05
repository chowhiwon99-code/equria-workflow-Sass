-- 028: 세금계산서 초안 삭제 허용 — tax_invoices DELETE RLS(작성자 본인). 멱등·additive.
--   tax_select(전직원)·tax_insert(전직원)·tax_update(작성자)는 있었으나 DELETE 정책 부재로
--   삭제가 RLS deny였음(초안 삭제 불가). tax_update와 동일하게 작성자 본인만 삭제 허용.
drop policy if exists "tax_delete" on public.tax_invoices;
create policy "tax_delete" on public.tax_invoices for delete using (auth.uid() = created_by);
