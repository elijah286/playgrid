-- Clear the auto-assigned default "01" wristband code that leaked onto every
-- new play. Users who actually need a wristband code will set one explicitly.
update public.plays
set wristband_code = ''
where wristband_code = '01';
