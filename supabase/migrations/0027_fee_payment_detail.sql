-- ===========================================================================
-- 0027_fee_payment_detail.sql — record_fee_payment keeps the transaction,
-- not just the new total.
--
-- WHY THIS EXISTS
-- 0006_fee_payments.sql added a `payments jsonb` column to fee_items so each
-- payment keeps its own method (cash / telebirr / cbe_birr / bank_transfer /
-- cheque), a reference number, and — for bank transfers — which bank it came
-- through. The UI (FeesPage.recordPayment) has always collected all of that.
--
-- But 0026_write_api.sql's record_fee_payment(fee_item_id, amount, note) only
-- ever touched the `paid` running total — it never appended to `payments`.
-- There was no server-side way to save the method/reference/bank at all, so
-- receipts and audit trails would have shown a number with no transaction
-- behind it. This replaces that function with one that does both, in the
-- same row-locked transaction.
--
-- The 3-argument signature is dropped rather than left as a second overload:
-- both versions accept (text, numeric, text) as their first three
-- parameters, and PostgREST/PostgreSQL can pick either when called by
-- argument name, so keeping both risks calling the wrong one silently.
-- ===========================================================================

drop function if exists public.record_fee_payment(text, numeric, text);

create or replace function public.record_fee_payment(
  p_fee_item_id text,
  p_amount numeric,
  p_method text default 'cash',
  p_reference text default null,
  p_bank text default null,
  p_note text default null)
returns jsonb language plpgsql security definer as $$
declare
  f public.fee_items;
  new_paid numeric;
  entry jsonb;
  recorder text;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;
  if p_method not in ('cash','telebirr','cbe_birr','bank_transfer','cheque') then
    raise exception 'unknown payment method %', p_method;
  end if;
  if p_method <> 'cash' and coalesce(btrim(p_reference), '') = '' then
    raise exception '% requires a transaction reference', p_method;
  end if;

  -- Row lock: two bursars posting against the same fee at the same moment
  -- would otherwise both read the old `paid` and the second would overwrite
  -- the first. This is exactly the class of bug snapshot-diffing produced.
  select * into f from public.fee_items where id = p_fee_item_id for update;
  if f.id is null then raise exception 'unknown fee item %', p_fee_item_id; end if;
  if not public.year_is_open(f.year_id) then
    raise exception 'academic year % is closed', f.year_id using errcode = '42501';
  end if;

  new_paid := f.paid + p_amount;
  if new_paid > f.amount then
    raise exception 'payment of % exceeds the % outstanding', p_amount, f.amount - f.paid;
  end if;

  select full_name into recorder from public.profiles where id = auth.uid();

  entry := jsonb_build_object(
    'id', 'pay-' || replace(gen_random_uuid()::text, '-', ''),
    'amount', p_amount,
    'method', p_method,
    'reference', nullif(btrim(coalesce(p_reference, '')), ''),
    'bank', case when p_method = 'bank_transfer' then p_bank else null end,
    'date', to_char(now(), 'YYYY-MM-DD'),
    'recordedBy', recorder);

  update public.fee_items
     set paid = new_paid,
         payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(entry)
   where id = f.id;

  perform public.log_action('fees.payment', f.id,
    format('%s recorded against %s%s', p_amount, f.label,
           case when p_note is null then '' else ' — ' || p_note end));

  return jsonb_build_object(
    'feeItemId', f.id, 'paid', new_paid,
    'outstanding', f.amount - new_paid, 'entry', entry);
end $$;
grant execute on function public.record_fee_payment(text,numeric,text,text,text,text) to authenticated;
