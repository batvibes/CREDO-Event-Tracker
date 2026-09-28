-- 022: Event Type to facilitator product mappings (Stage 3C)
-- Inserts the nine approved rows in public.facilitator_event_type_products.
-- Event Types are resolved by exact name. Products are resolved by exact code.
-- Does not create Event Types, facilitator products, qualifications, people, or aliases.
-- Does not write Events, team_members, or personnel roles.
-- Does not change the Stage 3B experience views.
-- Does not apply itself; review and run manually.
--
-- Intentionally unmapped Event Types: Dinner Date Night, Leadership Development.
-- No Event Type exists for Gottman Method, Seven Principles for Making Marriage Work,
-- PREP 8.0, Five Love Languages, Four Lenses, Strengths Discovery Encounter,
-- CliftonStrengths, or Navigating Your Next Chapter.

do $$
declare
  v_event_type_name text;
  v_product_code text;
  v_event_type_count integer;
  v_product_count integer;
  v_event_type_id uuid;
  v_product_id uuid;
  v_existing_product_id uuid;
  v_applied integer := 0;
begin
  for v_event_type_name, v_product_code in
    select approved.event_type_name, approved.product_code
    from (values
      ('Marriage Enrichment Retreat', 'marriage_enrichment_retreat'),
      ('Marriage Enrichment Workshop', 'marriage_enrichment_workshop'),
      ('Family Enrichment Retreat', 'family_enrichment_retreat'),
      ('Personal Growth Retreat', 'personal_growth_retreat'),
      ('Personal Growth Workshop', 'personal_growth_workshop'),
      ('ASIST T4T', 'asist_t4t'),
      ('ASIST Workshop', 'asist'),
      ('SafeTalk Workshop', 'safetalk'),
      ('SafeTalk T4T', 'safetalk_t4t')
    ) as approved(event_type_name, product_code)
  loop
    select count(*)::integer
    into v_event_type_count
    from public.event_types
    where name = v_event_type_name;

    if v_event_type_count <> 1 then
      raise exception
        'Expected exactly one Event Type named "%", found %.',
        v_event_type_name, v_event_type_count;
    end if;

    select event_type.id
    into strict v_event_type_id
    from public.event_types event_type
    where event_type.name = v_event_type_name;

    select count(*)::integer
    into v_product_count
    from public.facilitator_products
    where code = v_product_code;

    if v_product_count <> 1 then
      raise exception
        'Expected exactly one facilitator product with code "%", found %.',
        v_product_code, v_product_count;
    end if;

    select product.id
    into strict v_product_id
    from public.facilitator_products product
    where product.code = v_product_code;

    select mapping.product_id
    into v_existing_product_id
    from public.facilitator_event_type_products mapping
    where mapping.event_type_id = v_event_type_id;

    if found then
      if v_existing_product_id is distinct from v_product_id then
        raise exception
          'Event Type "%" is already mapped to a different facilitator product.',
          v_event_type_name;
      end if;
    else
      insert into public.facilitator_event_type_products (event_type_id, product_id)
      values (v_event_type_id, v_product_id);
    end if;

    v_applied := v_applied + 1;
  end loop;

  if v_applied <> 9 then
    raise exception 'Expected 9 Event Type mappings, processed %.', v_applied;
  end if;
end;
$$;
