-- Backfill legacy Bouwmaat imports created before payment metadata existed.
-- This is intentionally conservative: ambiguous rows remain unknown.

with classified as (
  select
    id,
    date,
    supplier_name,
    description,
    offerte_id,
    payment_type as current_payment_type,
    payment_status as current_payment_status,
    due_date as current_due_date,
    supplier_invoice_number as current_invoice_number,
    reconciliation_group_id as current_group_id,
    case
      when lower(coalesce(description, '')) ~ '(contant|bon|aankoopbon|kassabon|betaald per pin|betaalautomaat|eigen verbruik)'
        then 'bon'
      when lower(coalesce(description, '')) like '%factuur%'
        or lower(coalesce(description, '')) like '%betalingsopdracht%'
        then 'factuur'
      else 'unknown'
    end as derived_payment_type,
    substring(coalesce(description, '') from '([0-9]{4,}VF[0-9]+|[0-9]{5,})') as extracted_invoice_number,
    regexp_replace(
      regexp_replace(
        lower(coalesce(description, '')),
        '\\s+\\([^)]*\\)\\s*$',
        ''
      ),
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_description
  from public.project_costs
  where supplier_name ilike '%bouwmaat%'
),
prepared as (
  select
    *,
    case
      when derived_payment_type = 'bon' then
        'bouwmaat:bon:' || md5(
          coalesce(date::text, '') || ':' ||
          coalesce(supplier_name, '') || ':' ||
          coalesce(offerte_id, '') || ':' ||
          normalized_description
        )
      when derived_payment_type = 'factuur' then
        'bouwmaat:factuur:' || coalesce(
          extracted_invoice_number,
          md5(
            coalesce(date::text, '') || ':' ||
            coalesce(supplier_name, '') || ':' ||
            coalesce(offerte_id, '') || ':' ||
            normalized_description
          )
        )
      else null
    end as derived_group_id
  from classified
)
update public.project_costs as costs
set
  payment_type = case
    when costs.payment_type is null or costs.payment_type = 'unknown' then prepared.derived_payment_type
    else costs.payment_type
  end,
  payment_status = case
    when costs.payment_status is null or costs.payment_status = 'unknown' then
      case
        when prepared.derived_payment_type = 'bon' then 'paid'
        when prepared.derived_payment_type = 'factuur' then 'openstaand'
        else 'unknown'
      end
    else costs.payment_status
  end,
  due_date = case
    when costs.due_date is null
      and prepared.derived_payment_type = 'factuur'
      then (prepared.date + interval '14 days')::date
    else costs.due_date
  end,
  supplier_invoice_number = case
    when (costs.supplier_invoice_number is null or costs.supplier_invoice_number = '')
      then prepared.extracted_invoice_number
    else costs.supplier_invoice_number
  end,
  reconciliation_group_id = case
    when (costs.reconciliation_group_id is null or costs.reconciliation_group_id = '')
      then prepared.derived_group_id
    else costs.reconciliation_group_id
  end
from prepared
where costs.id = prepared.id
  and (
    costs.payment_type is null
    or costs.payment_type = 'unknown'
    or costs.reconciliation_group_id is null
    or costs.reconciliation_group_id = ''
  );
