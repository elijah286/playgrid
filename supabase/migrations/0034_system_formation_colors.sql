-- Recolor system formations so skill positions are visually distinct.
-- Mapping (applied by role first, then label, skipping anything already
-- painted by a previous migration):
--   role=C         → black fill, white label
--   role=OTHER     → gray fill (OL in 11-man)
--   label Q        → white fill, black label
--   label X        → red
--   label Y,TE     → green
--   label Z        → blue
--   label S,A      → yellow
--   label H,F,B,RB → orange

do $$
declare
  f record;
begin
  for f in select id, params from public.formations where is_system loop
    update public.formations
    set params = jsonb_set(
      f.params,
      '{players}',
      (
        select jsonb_agg(
          jsonb_set(
            p,
            '{style}',
            case
              when (p->>'role') = 'C' then
                jsonb_build_object('fill','#1C1C1E','stroke','#0f172a','labelColor','#FFFFFF')
              when (p->>'role') = 'OTHER' then
                jsonb_build_object('fill','#94A3B8','stroke','#0f172a','labelColor','#1C1C1E')
              when (p->>'label') = 'Q' then
                jsonb_build_object('fill','#FFFFFF','stroke','#0f172a','labelColor','#1C1C1E')
              when (p->>'label') = 'X' then
                jsonb_build_object('fill','#EF4444','stroke','#7f1d1d','labelColor','#FFFFFF')
              when (p->>'label') in ('Y','TE') then
                jsonb_build_object('fill','#22C55E','stroke','#166534','labelColor','#FFFFFF')
              when (p->>'label') = 'Z' then
                jsonb_build_object('fill','#3B82F6','stroke','#1e3a8a','labelColor','#FFFFFF')
              when (p->>'label') in ('S','A') then
                jsonb_build_object('fill','#FACC15','stroke','#854d0e','labelColor','#1C1C1E')
              when (p->>'label') in ('H','F','B') then
                jsonb_build_object('fill','#F26522','stroke','#7c2d12','labelColor','#FFFFFF')
              else
                jsonb_build_object('fill','#FFFFFF','stroke','#0f172a','labelColor','#1C1C1E')
            end,
            true
          )
        )
        from jsonb_array_elements(f.params->'players') as p
      )
    )
    where id = f.id;
  end loop;
end $$;
