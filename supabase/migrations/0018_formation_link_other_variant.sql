-- Add formation_id + formation_tag to plays
ALTER TABLE public.plays
  ADD COLUMN IF NOT EXISTS formation_id UUID REFERENCES public.formations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS formation_tag TEXT;

-- Add player_count to playbooks (only meaningful when sport_variant = 'other')
ALTER TABLE public.playbooks
  ADD COLUMN IF NOT EXISTS player_count INT;

-- Migrate six_man → other in playbooks
UPDATE public.playbooks
  SET sport_variant = 'other', player_count = 6
  WHERE sport_variant = 'six_man';

-- Migrate six_man → other in teams
UPDATE public.teams
  SET sport_variant = 'other'
  WHERE sport_variant = 'six_man';

-- Remove stale six_man system formations
DELETE FROM public.formations
  WHERE is_system = true
  AND (params->'sportProfile'->>'variant') = 'six_man';

COMMENT ON COLUMN public.plays.formation_id IS
  'FK to formations.id; NULL means no specific formation linked.';
COMMENT ON COLUMN public.plays.formation_tag IS
  'Short modifier tag describing how this play differs from the base formation (e.g. "Under Center", "Open").';
COMMENT ON COLUMN public.playbooks.player_count IS
  'Offensive player count; only used when sport_variant = ''other''.';
