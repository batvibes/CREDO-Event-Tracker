-- Event type series codes for future AAR sequence numbering

alter table public.event_types
  add column if not exists series_code text not null default '';

update public.event_types
set series_code = '01'
where name = 'Marriage Enrichment Retreat';

update public.event_types
set series_code = '02'
where name = 'Dinner Date Night';

update public.event_types
set series_code = '03'
where name = 'Marriage Enrichment Workshop';

update public.event_types
set series_code = '04'
where name = 'Family Enrichment Retreat';

update public.event_types
set series_code = '05'
where name in ('Personal Growth Workshop', 'Personal Growth Retreat');

update public.event_types
set series_code = '06'
where name = 'ASIST Workshop';

update public.event_types
set series_code = '07'
where name = 'SafeTalk Workshop';

update public.event_types
set series_code = '08'
where name = 'SafeTalk T4T';

update public.event_types
set series_code = '09'
where name = 'ASIST T4T';

update public.event_types
set series_code = '10'
where name = 'Leadership Development';
