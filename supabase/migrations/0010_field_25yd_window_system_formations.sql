-- Update system formations to use the 25-yard display window:
--   fieldLengthYds = 25 (10 yds backfield + 15 yds downfield from LOS).
-- Player y-positions are normalized to this window with LOS at y=0.40:
--   y=0.38 ≈ on the line (0.5 yd back)
--   y=0.34 ≈ 1.5 yds back
--   y=0.28 ≈ 3 yds back
--   y=0.20 ≈ 5 yds back (shotgun QB depth)
--
-- Migrations run as the postgres superuser so RLS does not apply.

delete from public.formations where is_system = true;

insert into public.formations (is_system, semantic_key, params) values

-- ── Flag 5v5 ──────────────────────────────────────────────────────
(true, 'flag_5v5_base', jsonb_build_object(
  'displayName', '5v5 Base',
  'sportProfile', jsonb_build_object(
    'variant',                       'flag_5v5',
    'offensePlayerCount',             5,
    'fieldWidthYds',                  25,
    'fieldLengthYds',                 25,
    'motionMustNotAdvanceTowardGoal', true
  ),
  'players', jsonb_build_array(
    jsonb_build_object('id','p_qb','role','QB', 'label','Q','position',jsonb_build_object('x',0.50,'y',0.20),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_c', 'role','C',  'label','C','position',jsonb_build_object('x',0.50,'y',0.38),'eligible',false,'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_x', 'role','WR', 'label','X','position',jsonb_build_object('x',0.12,'y',0.38),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_y', 'role','WR', 'label','Y','position',jsonb_build_object('x',0.32,'y',0.38),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_z', 'role','WR', 'label','Z','position',jsonb_build_object('x',0.88,'y',0.38),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a'))
  )
)),

-- ── Flag 7v7 ──────────────────────────────────────────────────────
(true, 'flag_7v7_base', jsonb_build_object(
  'displayName', '7v7 Base',
  'sportProfile', jsonb_build_object(
    'variant',                       'flag_7v7',
    'offensePlayerCount',             7,
    'fieldWidthYds',                  30,
    'fieldLengthYds',                 25,
    'motionMustNotAdvanceTowardGoal', true
  ),
  'players', jsonb_build_array(
    jsonb_build_object('id','p_qb','role','QB', 'label','Q','position',jsonb_build_object('x',0.50,'y',0.20),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_c', 'role','C',  'label','C','position',jsonb_build_object('x',0.50,'y',0.38),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_s', 'role','WR', 'label','S','position',jsonb_build_object('x',0.28,'y',0.34),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_x', 'role','WR', 'label','X','position',jsonb_build_object('x',0.10,'y',0.38),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_y', 'role','WR', 'label','Y','position',jsonb_build_object('x',0.66,'y',0.34),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_z', 'role','WR', 'label','Z','position',jsonb_build_object('x',0.90,'y',0.38),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_f', 'role','RB', 'label','F','position',jsonb_build_object('x',0.50,'y',0.28),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a'))
  )
)),

-- ── 6-Man ─────────────────────────────────────────────────────────
(true, 'six_man_base', jsonb_build_object(
  'displayName', '6-Man Base',
  'sportProfile', jsonb_build_object(
    'variant',                       'six_man',
    'offensePlayerCount',             6,
    'fieldWidthYds',                  40,
    'fieldLengthYds',                 25,
    'motionMustNotAdvanceTowardGoal', false
  ),
  'players', jsonb_build_array(
    jsonb_build_object('id','p_qb', 'role','QB',    'label','Q','position',jsonb_build_object('x',0.50,'y',0.20),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_c',  'role','C',     'label','C','position',jsonb_build_object('x',0.50,'y',0.38),'eligible',false,'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_lt', 'role','OTHER', 'label','T','position',jsonb_build_object('x',0.38,'y',0.38),'eligible',false,'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_rt', 'role','OTHER', 'label','E','position',jsonb_build_object('x',0.62,'y',0.38),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_x',  'role','WR',    'label','X','position',jsonb_build_object('x',0.12,'y',0.34),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_z',  'role','WR',    'label','Z','position',jsonb_build_object('x',0.88,'y',0.34),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a'))
  )
)),

-- ── 11-Man Tackle ─────────────────────────────────────────────────
(true, 'tackle_11_pro_set', jsonb_build_object(
  'displayName', '11-Man Pro Set',
  'sportProfile', jsonb_build_object(
    'variant',                       'tackle_11',
    'offensePlayerCount',             11,
    'fieldWidthYds',                  53,
    'fieldLengthYds',                 25,
    'motionMustNotAdvanceTowardGoal', false
  ),
  'players', jsonb_build_array(
    jsonb_build_object('id','p_qb','role','QB',    'label','Q','position',jsonb_build_object('x',0.50,'y',0.34),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_c', 'role','C',     'label','C','position',jsonb_build_object('x',0.50,'y',0.38),'eligible',false,'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_lg','role','OTHER', 'label','G','position',jsonb_build_object('x',0.44,'y',0.38),'eligible',false,'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_rg','role','OTHER', 'label','G','position',jsonb_build_object('x',0.56,'y',0.38),'eligible',false,'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_lt','role','OTHER', 'label','T','position',jsonb_build_object('x',0.37,'y',0.38),'eligible',false,'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_rt','role','OTHER', 'label','T','position',jsonb_build_object('x',0.63,'y',0.38),'eligible',false,'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_te','role','TE',    'label','Y','position',jsonb_build_object('x',0.72,'y',0.38),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_x', 'role','WR',    'label','X','position',jsonb_build_object('x',0.05,'y',0.38),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_z', 'role','WR',    'label','Z','position',jsonb_build_object('x',0.90,'y',0.34),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_h', 'role','WR',    'label','H','position',jsonb_build_object('x',0.82,'y',0.30),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a')),
    jsonb_build_object('id','p_rb','role','RB',    'label','B','position',jsonb_build_object('x',0.50,'y',0.22),'eligible',true, 'style',jsonb_build_object('fill','#f8fafc','stroke','#0f172a','labelColor','#0f172a'))
  )
));
