/* ---------------------------------------------------------------------
   0041 — fee_payment_requests had no way to actually create one

   Found while checking why fees "aren't working correctly." The bank-
   transfer flow (0015_fee_payment_requests.sql) has a review RPC
   (review_fee_payment_request, 0030) for approving/rejecting an existing
   request, and syncPaymentRequests() (backend.ts) correctly calls it —
   but nothing has ever covered *creating* one. syncPaymentRequests()
   only acts when a request's status changes to 'approved' or 'rejected';
   a brand-new request is still sitting at its default 'pending' status,
   so that same guard (`if (r.status !== "approved" && r.status !== "rejected") continue;`)
   silently skips it. A guardian filling out GuardianFeesPage's "submit a
   bank transfer" form (people.tsx) gets a success toast — the object is
   real in their own browser's memory — but it was never sent to the
   server at all. It quietly disappears on the next reload, and no admin
   ever sees it to review, because it never existed server-side to begin
   with.

   This adds the missing half: a guardian (or admin) can file a request
   for a fee item that actually belongs to their own linked child,
   matching exactly what the existing RLS insert policy already requires
   (fee_payment_requests_ins, 0015) — this RPC exists so the client has a
   real operation to call, not because RLS needed loosening.
   --------------------------------------------------------------------- */

create or replace function public.submit_fee_payment_request(
  p_student_id text, p_fee_item_id text, p_amount numeric,
  p_bank_account_id text, p_bank_name text, p_reference text default null,
  p_receipt_path text default null, p_receipt_name text default null)
returns jsonb language plpgsql security definer as $$
declare
  fid text := 'payreq-' || replace(gen_random_uuid()::text, '-', '');
  f public.fee_items;
  submitter text;
begin
  if not public.is_admin() and not exists (
    select 1 from public.guardian_students g where g.guardian_id = auth.uid() and g.student_id = p_student_id
  ) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  select * into f from public.fee_items where id = p_fee_item_id and student_id = p_student_id;
  if f.id is null then raise exception 'that fee item does not belong to this student'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_amount > (f.amount - f.paid) then raise exception 'amount exceeds the % outstanding', f.amount - f.paid; end if;
  if coalesce(btrim(p_bank_account_id), '') = '' or coalesce(btrim(p_bank_name), '') = '' then
    raise exception 'a bank account is required';
  end if;

  select full_name into submitter from public.profiles where id = auth.uid();

  insert into public.fee_payment_requests (
    id, student_id, fee_item_id, amount, bank_account_id, bank_name, reference,
    receipt_path, receipt_name, submitted_by, submitted_by_name, status)
  values (
    fid, p_student_id, p_fee_item_id, p_amount, btrim(p_bank_account_id), btrim(p_bank_name),
    nullif(btrim(coalesce(p_reference, '')), ''), p_receipt_path, p_receipt_name,
    auth.uid(), submitter, 'pending');

  perform public.log_action('fees.payment_request', fid, format('%s via %s', p_amount, p_bank_name));
  return jsonb_build_object('id', fid);
end $$;
grant execute on function public.submit_fee_payment_request(text,text,numeric,text,text,text,text,text) to authenticated;
