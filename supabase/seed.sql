-- Dev-only seed. Safe to run repeatedly — no-op if data exists.
-- Do not ship to production.

insert into public.buildings (city, street, building_number)
values ('תל אביב', 'דיזנגוף', '22')
on conflict do nothing;
