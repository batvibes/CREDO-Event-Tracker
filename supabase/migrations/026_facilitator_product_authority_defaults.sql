-- 026: Verified product-level qualification authority defaults.
-- Sets facilitator_products.governing_source for seven verified active products.
-- Does not insert or rename products.
-- Does not write a qualification record.
-- Does not change functions, grants, policies, or product rule families.
-- Re-running sets the same seven values again.
-- Does not apply itself; review and run manually.

do $$
declare
  v_count integer;
begin
  update public.facilitator_products as product
  set governing_source = catalog.governing_source
  from (values
    ('gottman_seven_principles', 'Gottman, Seven Principles of Making Marriage Work', 'The Gottman Institute'),
    ('prep_8_0', 'PREP 8.0', 'PREP Educational Products, Inc.'),
    ('four_lenses', '4 Lenses', 'Four Lenses / Shipley Communication'),
    ('safetalk', 'safeTALK', 'LivingWorks'),
    ('asist', 'ASIST', 'LivingWorks'),
    ('safetalk_t4t', 'safeTALK T4T', 'LivingWorks'),
    ('asist_t4t', 'ASIST T4T', 'LivingWorks')
  ) as catalog(code, name, governing_source)
  where product.code = catalog.code
    and product.name = catalog.name;

  get diagnostics v_count = row_count;
  if v_count <> 7 then
    raise exception
      'Expected governing_source on 7 verified facilitator products, updated %.',
      v_count;
  end if;
end;
$$;
