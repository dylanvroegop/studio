-- Bevestigde eigen overboekingen bewaren zonder deze als kosten te tellen.
ALTER TABLE public.bank_transaction_category_overrides
  DROP CONSTRAINT bank_transaction_category_overrides_category_check;
ALTER TABLE public.bank_transaction_category_overrides
  ADD CONSTRAINT bank_transaction_category_overrides_category_check
  CHECK (category IN ('materiaal', 'autokosten', 'boetes', 'schulden', 'afval',
    'brandstof', 'gereedschap', 'eigen_verbruik', 'hotel', 'telefoon',
    'leadkosten', 'storage', 'overig', 'profit'));
