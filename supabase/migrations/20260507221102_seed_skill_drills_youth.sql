-- Coach AI KB — variant-agnostic SKILL-ISOLATION drills, weighted toward youth.
--
-- Existing drill seeds (0172-0177) are play-context drills: pursuit angles,
-- no-huddle tempo, route releases vs cushion, etc. They assume the kid can
-- already catch, can already cut, can already track a ball. For 3rd-grade
-- (and most rec-league teams) that's a big assumption.
--
-- This batch fills the gap: catching progressions, hand-eye, ladder/cone
-- footwork, agility, conditioning, QB throwing mechanics, and game-form
-- youth drills. All variant-agnostic (sport_variant=null). Most heavily
-- tagged tier1_5_8 / tier2_9_11.

insert into public.rag_documents (
  scope, scope_id, topic, subtopic, title, content,
  sport_variant, sanctioning_body, source, source_note,
  age_tier, authoritative, needs_review
) values

-- ============ CATCHING PROGRESSIONS ============
-- Foundation skill. Most missed catches at the youth level are eyes-off
-- problems, not hands problems. Build the eyes first.

('global', null, 'drill', 'catching_2hand_basket',
 'Two-hand basket catch (foundation)',
 'Setup: pairs 5 yards apart, one ball per pair. Tier1 (5-8): start with a foam or rubber ball. Tier2+: regulation.
Reps: 20 catches each. Receiver holds hands in a "diamond" or "triangle" pocket: thumbs together for high balls (above the chest), pinkies together for low balls (below the chest). Coach calls "high" or "low" before each throw so the receiver pre-sets the hands.
Coaching points: eyes follow the ball ALL the way into the hands. Most drops at this age are head-turn drops — the kid looks upfield before the catch. Train "see it, squeeze it, THEN look." Soft hands: pull the ball into the chest as you catch (don''t bat at it).
Common errors: clapping at the ball with stiff hands; turning the head pre-catch; one hand reaching out instead of two. Fix by saying "two thumbs" or "two pinkies" out loud as you catch.',
 null, null, 'seed', 'youth catching fundamentals',
 'tier1_5_8', false, true),

('global', null, 'drill', 'catching_eyes_through',
 'Eyes-through-the-catch drill',
 'Setup: pairs 7 yards apart. Each receiver wears a hat or visor (or coach taps the brim of the helmet). Cone behind the receiver as a "look-up" target.
Reps: 15 catches. After EVERY catch, the receiver freezes for 1 second with the ball still in the hands and eyes on the ball, THEN snaps eyes upfield to the cone and tucks. Coach grades: did eyes leave the ball before it was secured?
Coaching points: this builds the habit "catch the ball BEFORE you run with it." 80% of youth drops are caused by looking upfield 0.1 seconds early. The freeze is exaggerated on purpose — at game speed it shrinks to a natural beat.
Why it matters: a quick "eyes through" habit converts 3-5 drops per game into catches. That''s the difference between a frustrated team and a confident one.',
 null, null, 'seed', 'youth catching fundamentals',
 'tier1_5_8', false, true),

('global', null, 'drill', 'catching_high_low_left_right',
 'High-low-left-right catching grid',
 'Setup: receiver stands 5 yards from coach. Coach has a small pile of foam balls. 4 cones around the receiver mark the four quadrants.
Reps: coach throws 20 balls — 5 high, 5 low, 5 left, 5 right (random order). Receiver must catch with proper hand position (thumbs together / pinkies together / web of left hand for left throws / web of right hand for right). Score: 16+ out of 20 = passed.
Coaching points: hand position changes with ball location, not the other way around. A high ball with pinkies-together hands almost always becomes a face mask or a chest pop-out.
Why it matters: in a real game, throws are NOT all chest-high. A receiver who only catches at chest height is going to drop everything else.',
 null, null, 'seed', 'youth catching progressions',
 'tier1_5_8', false, true),

('global', null, 'drill', 'catching_over_shoulder',
 'Over-the-shoulder catch (deep ball / fade)',
 'Setup: receiver starts 5 yards from coach, faces away. On "go" the receiver sprints forward and looks back over the inside shoulder.
Reps: 8 catches each shoulder. Coach throws a soft arc 12-15 yards downfield. Receiver tracks the ball over the shoulder, gathers it with hands "scooping up" (pinkies almost touching), pulls into the chest.
Coaching points: look back EARLY — the moment your second step hits, snap the head around. Late head-turn = ball goes over the helmet. Hands scoop UP, not out — over-the-shoulder catches are made with the hands above the eyes, not in front of the chest.
Common errors: "alligator arms" (pulling the hands back into the chest before the ball arrives); peeking at the defender instead of tracking the ball. Both are concentration problems — drill until the eyes never leave the ball.',
 null, null, 'seed', 'youth catching progressions',
 'tier2_9_11', false, true),

('global', null, 'drill', 'catching_off_hip_flag',
 'Off-hip catch with flag awareness',
 'Setup: receiver runs a 5-yard out. Coach throws to the OUTSIDE hip (away from defender, toward the sideline). Tier2+: add a defender 3 yards away.
Reps: 10 each side. After the catch, the receiver immediately turns the OPPOSITE shoulder toward the defender (hides the flag) and sprints upfield.
Coaching points: in flag, every catch is a flag-protection moment. The instant you secure the ball, the flag becomes the priority. Train the catch + turn as ONE motion, not two. Tier1: skip the defender — focus only on catch + turn-and-go.
Why it matters: 90% of YAC in flag football is decided in the first step after the catch. A flag-aware turn beats raw speed.',
 null, null, 'seed', 'youth catching + flag awareness',
 'tier2_9_11', false, true),

('global', null, 'drill', 'catching_drops_pushups',
 'Drops = pushups (catch accountability)',
 'Setup: any catching drill. Pre-announce the rule.
Reps: every dropped ball during the drill = 3 pushups (tier1: 3 jumping jacks instead — pushups are too hard). Drops include "balls you should have caught" — coach has discretion on bad throws.
Coaching points: this is NOT punishment for missing — it''s focus accountability. Frame it as "drops cost reps in a game; here they cost effort." Most youth coaches over-praise everything; a tiny consequence for drops snaps focus back on the catch.
Common errors: coaches calling EVERY drop a punishment-eligible drop. Bad throws don''t count. Communicate the standard: only "right at your hands, eyes on it, dropped it anyway" earns the reps. Otherwise it stops being about focus.',
 null, null, 'seed', 'youth catching focus + accountability',
 'tier2_9_11', false, true),

('global', null, 'drill', 'catching_contested_spot',
 'Contested-catch spot drill',
 'Setup: receiver and defender 3 yards apart, ball on a tee 5 yards in front of both. Coach blows whistle.
Reps: 8 reps. On whistle, both burst to the ball and try to gain possession. Whoever has BOTH hands on the ball with control wins. Tier3+ only — body contact is part of this drill, so use older athletes.
Coaching points: hand placement matters more than size. Receiver wants hands ABOVE the defender''s hands (high-pointing the ball). Defender wants the hands UNDER (rip up). Work hand position, not just speed.
Why it matters: in tackle and 7v7+ flag, contested spots happen on every deep ball. Teaches receivers that the ball is theirs to take, not the defender''s.',
 null, null, 'seed', 'tackle / 7v7 contested catch work',
 'tier3_12_14', false, true),

-- ============ HAND-EYE / REACTION ============
-- Catching is downstream of hand-eye coordination. Build the input.

('global', null, 'drill', 'hands_tennis_ball_drops',
 'Tennis-ball partner drops',
 'Setup: pairs 3 feet apart. One partner holds a tennis ball at shoulder height in each hand, arms extended. Other partner stands ready.
Reps: dropper releases ONE ball at random. Catcher must catch it before it bounces. 20 reps each role. Variation: dropper releases BOTH balls; catcher must catch one of them with EACH hand (cross-body) before they bounce.
Coaching points: this builds reaction time and hand-eye in 30 seconds of work that feels like a game. Eyes scan BOTH hands of the dropper — kids who lock onto one hand miss every cross-body rep.
Why it matters: in a real game, the ball is in the air for ~0.5 seconds before contact. A receiver with sharp hand-eye catches balls that "average hands" don''t see in time. Tennis ball + 3-foot distance = the reaction speed of a 15-yard slant.',
 null, null, 'seed', 'youth hand-eye coordination',
 'tier1_5_8', false, true),

('global', null, 'drill', 'hands_reaction_ball',
 'Reaction-ball wall bounce',
 'Setup: a reaction ball (rubber ball with bumps that bounces unpredictably) and a flat wall. Receiver stands 5 feet from the wall.
Reps: receiver throws the ball AT the wall, reacts to wherever it bounces, catches it before the second bounce. 30 reps. Variation: pairs — partner throws the wall-bounce so the receiver doesn''t know where it''ll go.
Coaching points: feet stay light, knees bent. The kid who plants flat-footed never catches it; the kid who stays on the balls of the feet does. Hands relaxed and ready.
Why it matters: ball deflections in a game (tipped passes, batted balls, fumbles) reward the same skill. The receivers and DBs who recover those balls win games.',
 null, null, 'seed', 'youth hand-eye + reaction',
 'tier2_9_11', false, true),

('global', null, 'drill', 'hands_alphabet_ball',
 'Alphabet ball (letter-call catch)',
 'Setup: pairs 5 yards apart, receiver has a football. Coach has a list of letters or numbers visible to the THROWER but not the receiver.
Reps: thrower calls a letter loudly, then throws. Receiver must repeat the letter back AS they catch. 15 reps. Variation: thrower writes a letter on the ball with a marker; receiver must read and call out the letter at the moment of catch.
Coaching points: forces the receiver to look at the ball — you can''t read the letter or remember the call without eye discipline. A receiver who always catches "by feel" gets exposed here.
Why it matters: same skill as eyes-through-the-catch, but disguised as a game. Tier1 kids will play this for 10 minutes without realizing they''re working on focus.',
 null, null, 'seed', 'youth hand-eye + focus, gamified',
 'tier1_5_8', false, true),

('global', null, 'drill', 'hands_pre_practice_warmup',
 'Pre-practice hands warm-up routine',
 'Setup: pairs, every player has a partner and a ball. Same setup at the start of EVERY practice.
Reps: 4-minute routine — 30 sec each: (1) 2-hand chest catches at 5 yds, (2) high catches (above eyes), (3) low catches (below knees), (4) right-hand only at 3 yds, (5) left-hand only at 3 yds, (6) over-shoulder soft tosses, (7) reaction-ball or tennis-ball drops, (8) one knee throws (each player throws from a knee — strengthens arm + frees the upper body).
Coaching points: same routine every practice = grooved technique by week 4. Coach circulates and corrects hand position only — let the reps build the rest.
Why it matters: warm-up time is "free" practice time most teams waste on jogging. 4 minutes of hands work × 12 practices = 48 extra minutes of catching reps per season, with zero schedule impact.',
 null, null, 'seed', 'youth practice routine',
 null, false, true),

-- ============ FOOTWORK — AGILITY LADDER ============
-- Cheap equipment ($20 ladder), high reps, scales from tier1 to tier4.

('global', null, 'drill', 'footwork_ladder_run_through',
 'Agility ladder — run-through (intro)',
 'Setup: agility ladder flat on the ground. Line of players at one end.
Reps: each player runs through the ladder one foot per square, full speed. 4 trips. Knees high, arms drive forward (hands chest-high, opposite hand-opposite knee).
Coaching points: this is the FIRST ladder drill — feet hit ONE square, ONE foot at a time. No skipping, no two-feet-in-one. Eyes UP, not on the ladder. The kid staring at the rungs is the kid tripping over them at game speed.
Why it matters: every other ladder pattern starts here. Don''t skip ahead — tier1/tier2 kids who can''t run-through cleanly will turn an icky-shuffle into a fall.',
 null, null, 'seed', 'agility ladder fundamentals',
 'tier1_5_8', false, true),

('global', null, 'drill', 'footwork_ladder_2in2out',
 'Agility ladder — 2 in, 2 out',
 'Setup: ladder flat on ground.
Reps: TWO feet land in the first square, then TWO feet land OUTSIDE the ladder (straddling the next square), then two in, two out... all the way down. 4 trips each direction.
Coaching points: feet stay low (1 inch off the ground) and quick. The pattern is rhythmic — ta-ta, ta-ta, ta-ta. Slow rhythm = walking; quick rhythm = drilling. Use a stopwatch for tier3+ and target sub-3 seconds for a 10-rung ladder.
Why it matters: develops lateral foot speed needed for shaking a defender on a slant or mirroring a receiver in coverage. Same skill, both sides of the ball.',
 null, null, 'seed', 'agility ladder lateral foot speed',
 'tier2_9_11', false, true),

('global', null, 'drill', 'footwork_ladder_icky_shuffle',
 'Agility ladder — icky shuffle',
 'Setup: ladder flat on ground.
Reps: the icky shuffle pattern — left foot in, right foot in, left foot OUT (lateral), right foot in next square... Sounds complicated, looks rhythmic. 4 trips.
Coaching points: hips face forward the entire drill — DO NOT turn the hips sideways. Arms swing in opposition like running. Tier2+ only; tier1 kids will bind up trying to remember the sequence.
Why it matters: best single ladder drill for cutting fluidity. Receivers who master the icky shuffle have noticeably crisper breaks at the top of routes (out, in, comeback). DBs have noticeably tighter mirror coverage.',
 null, null, 'seed', 'agility ladder cut quickness',
 'tier2_9_11', false, true),

('global', null, 'drill', 'footwork_ladder_lateral',
 'Agility ladder — lateral run-through',
 'Setup: ladder flat. Player starts at one END, perpendicular to the rungs (sideways).
Reps: side-shuffle through the ladder — one foot per square, hips facing the SIDELINE not the ladder. 4 trips each direction (don''t neglect the weak side).
Coaching points: stay LOW — knees bent, hips down. Most kids stand straight up and the drill becomes slow and useless. Coach should be able to put a hand on the kid''s head and feel that the hips are below it. Quick-shuffle, no crossover steps.
Why it matters: lateral movement is half of football. Practicing it sideways (in addition to forward) doubles the value of every ladder session.',
 null, null, 'seed', 'lateral foot speed for cuts and pursuit',
 'tier2_9_11', false, true),

('global', null, 'drill', 'footwork_ladder_hopscotch',
 'Agility ladder — hopscotch',
 'Setup: ladder flat. Single-leg start.
Reps: one foot in square 1, two feet in square 2, one foot in square 3, two in square 4... like the playground game. 3 trips each lead leg.
Coaching points: ankle stiffness — the single-foot landings should be quiet and quick. Loud, slappy landings = the kid is "falling" between rungs instead of pushing off. Land-stick, push-up, land-stick.
Why it matters: builds ankle and calf strength + single-leg balance. Reduces ankle rolls during cuts, which is the #1 youth football injury that ends a kid''s season.',
 null, null, 'seed', 'single-leg ankle stiffness for injury prevention',
 'tier2_9_11', false, true),

-- ============ FOOTWORK — CONES / SHUTTLES ============

('global', null, 'drill', 'footwork_5_10_5_shuttle',
 '5-10-5 pro agility shuttle',
 'Setup: 3 cones in a line, 5 yards apart. Player starts at the middle cone in a 3-point or 2-point stance.
Reps: on "go" — sprint 5 yds right, touch the cone, sprint 10 yds left, touch the cone, sprint 5 yds back through the start. Time it. 3 reps each starting direction. Tier3+ targets: 4.8 sec, tier2 6.0 sec, tier1 7.0 sec (these are youth-scaled, NOT NFL combine times).
Coaching points: drop the inside hand to TOUCH the cone — it''s a hand-touch shuttle, not a foot-touch. This is part of why the drill is so revealing: kids who stand straight up at the turn lose 0.5 sec. Drop the hips, drop the hand, push off the OUTSIDE foot.
Why it matters: the most predictive single drill of football athleticism. Used at every level from youth to NFL. Track times — kids who improve their 5-10-5 by 0.3 sec across a season will SHOW it on the field.',
 null, null, 'seed', 'pro agility / change-of-direction',
 'tier2_9_11', false, true),

('global', null, 'drill', 'footwork_t_drill',
 'T-drill (multi-direction shuttle)',
 'Setup: 4 cones in a T shape — start cone, cone 10 yds straight ahead, then cones 5 yds left and 5 yds right of the top cone.
Reps: sprint forward to top cone, shuffle left to left cone (touch), shuffle right past start to right cone (touch), shuffle back to top cone, BACKPEDAL to start. Time it. 3 reps.
Coaching points: NO crossover steps during the shuffle phases — penalize crossover. The backpedal at the end is huge; most kids turn and run. Make them backpedal — eyes upfield is part of the drill.
Why it matters: combines linear speed, lateral shuffle, and backpedal — all three transitions a defender (or returner) makes in a single play. One drill, three skills.',
 null, null, 'seed', 'multi-direction agility for DBs and RBs',
 'tier2_9_11', false, true),

('global', null, 'drill', 'footwork_lateral_mirror',
 'Lateral mirror drill (1v1)',
 'Setup: pairs in a 5-yard square. One leader, one mirror. Hips low, hands ready.
Reps: leader shuffles left, right, forward, back at random. Mirror tracks every move with NO contact, hips low, never crossing the feet. 30 sec each role. 3 rounds.
Coaching points: mirror''s eyes on the leader''s WAIST, not the feet. Feet are the fake; the waist tells you where the leader is going. Hips MUST stay low — every time the mirror stands up, the leader scores a "win".
Why it matters: this is the single best skill drill for DBs. The kid who masters this can mirror a receiver on a slant or a comeback all day. Also great for offensive players learning to shake defenders — being on the leader side teaches the moves that beat coverage.',
 null, null, 'seed', 'mirror coverage / shake-the-defender',
 'tier2_9_11', false, true),

-- ============ AGILITY / CHANGE-OF-DIRECTION ============

('global', null, 'drill', 'agility_triangle',
 'Triangle change-of-direction drill',
 'Setup: 3 cones in a triangle, 5 yds per side.
Reps: sprint to cone 1, plant outside foot, sprint to cone 2, plant outside foot, sprint to cone 3, finish back at start. 4 reps each direction (clockwise + counter-clockwise).
Coaching points: PLANT and DRIVE — the cut is on the outside foot (right cone = plant left foot, drive right). Body lowers through the cut, then explodes out. Kids who run through the cone with no plant are "rounding off" — penalize that with a re-rep.
Why it matters: every cut in football happens like this. A receiver running a comeback, a DB breaking on a slant, an RB hitting a hole. Train the plant, the cut becomes automatic.',
 null, null, 'seed', 'change-of-direction fundamentals',
 'tier2_9_11', false, true),

('global', null, 'drill', 'agility_chase_the_rabbit',
 'Chase-the-rabbit (open-field pursuit)',
 'Setup: 20-yard open space. One runner ("rabbit"), one chaser. Chaser starts 5 yds behind.
Reps: rabbit runs full speed with random cuts (changes direction every 2-3 sec). Chaser tries to stay within 1 yard. 30 sec, switch roles. 4 rounds.
Coaching points: chaser''s eyes on the rabbit''s HIPS — when the hips drop, the cut is coming. Take the SHORTEST angle to the rabbit (not the longest). Tier1: cap at 15 sec rounds — gas tank is shorter.
Why it matters: open-field pursuit is mostly read-and-react, which can''t be taught with cones. This drill builds the eyes + the angles together. Both sides of the ball benefit (rabbit learns to shake; chaser learns to track).',
 null, null, 'seed', 'open-field pursuit + read-and-react',
 'tier2_9_11', false, true),

('global', null, 'drill', 'agility_reactive_shuffle',
 'Reactive shuffle (coach-call lateral)',
 'Setup: player 5 yds from coach, hips low, hands up, balls of feet.
Reps: coach POINTS left or right; player shuffles 2 steps that direction, then waits for next call. Random tempo. 30 sec rounds, 3 rounds. Variation: coach calls "snap!" and player sprints 5 yds forward.
Coaching points: NO ANTICIPATION — the player must REACT, not guess. Coach should occasionally fake a point to bust the guessers. Hips stay low the WHOLE rep — no standing up between calls.
Why it matters: trains the reactive movement that game film calls "instincts." Instincts are reps. A kid who does this 5 minutes a practice for a season looks twice as fast in games.',
 null, null, 'seed', 'reactive movement / read-and-go',
 'tier2_9_11', false, true),

-- ============ QB THROWING MECHANICS (variant-agnostic) ============

('global', null, 'drill', 'qb_throwing_knee_throw',
 'QB knee-throw (upper-body isolation)',
 'Setup: QB on ONE knee (front knee down, back foot planted). Partner 8 yds away.
Reps: 15 throws. Isolates upper body — torque comes from torso rotation only, not stride. Elbow at 90 degrees, ball up by the ear, follow through with the throwing thumb pointing at the OPPOSITE pocket.
Coaching points: this drill exposes EVERY upper-body flaw — sidearm release, no hip rotation, lazy follow-through. Coach should see the throwing-side hip rotate around. If the hip stays still, it''s an arm-throw and the ball will float.
Why it matters: most youth QBs throw with the legs only because they''ve never trained the upper body in isolation. After 2 weeks of knee throws, the standing throws have noticeably more zip and accuracy.',
 null, null, 'seed', 'QB upper-body throwing mechanics',
 'tier2_9_11', false, true),

('global', null, 'drill', 'qb_throwing_partner_ladder',
 'QB partner ladder warm-up',
 'Setup: QB and partner start 5 yds apart. After every 2 throws each, BOTH back up 2 yds.
Reps: throw at 5, 7, 9, 11, 13, 15, 17 yds. 14 throws total per QB. Each round forces a slightly higher arc and more torque.
Coaching points: progression reveals which range the QB falls apart at — most youth QBs are clean inside 10 yds and fall apart at 15+. That''s the range to drill more. Track the distance of the FIRST throw that wobbles or short-arms — that''s the QB''s working ceiling and the goal is to push it 2 yds per month.
Why it matters: pre-practice routine that warms up the arm AND diagnoses the range ceiling in 4 minutes. Better than "play catch" with no progression.',
 null, null, 'seed', 'QB warm-up + range progression',
 null, false, true),

('global', null, 'drill', 'qb_throwing_target_net',
 'QB target-net accuracy work',
 'Setup: a portable QB net with target holes (or a tarp with circles cut at 4 levels). QB at 10 yds.
Reps: 5 throws to each target (high-right, high-left, low-right, low-left, center). 25 throws total. Score: 18+ in target = passed.
Coaching points: target practice EXPOSES whether the QB has REAL accuracy or just lucky completions. A QB who can only hit the center is a "checkdown only" QB — drill the corners.
Why it matters: in a game, the throw window is 2 feet wide between defenders. A QB who can hit a 4-foot target on a net needs to hit a 2-foot target on the field. Accuracy is the trainable skill — arm strength matters less than people think.',
 null, null, 'seed', 'QB accuracy and throw-location training',
 'tier3_12_14', false, true),

('global', null, 'drill', 'qb_throwing_one_step_drop',
 'QB 1-step drop accuracy (rhythm timing)',
 'Setup: QB in shotgun, receiver runs a 5-yd hitch. Coach holds a snap timer.
Reps: 12 reps. QB takes ONE step back at the snap, plants, throws on rhythm. Ball must arrive in receiver''s hands BEFORE the receiver turns around. If the receiver has to wait, the throw is too late.
Coaching points: no second-step drops on a 5-yd hitch — that timing is built for slants and hitches at 1-step. Train the QB to TRUST the timing instead of waiting for the receiver to come open. Hitch routes look "open" by design — the QB just has to put it on time.
Why it matters: rhythm-timing throws are the bread and butter of youth football. A QB who can deliver on a 1-step drop completes 70% of the playbook''s pass game.',
 null, null, 'seed', 'QB rhythm-timing throws',
 'tier2_9_11', false, true),

-- ============ CONDITIONING (age-scaled) ============

('global', null, 'drill', 'conditioning_age_scaled_gassers',
 'Age-scaled gassers (end-of-practice)',
 'Setup: open field with sideline-to-sideline distance marked. Tier1: 20 yds. Tier2: 30 yds. Tier3+: full 53 yds (or 40 if practice field is short).
Reps: ONE gasser = sprint to the far sideline, sprint back. Tier1: 2 gassers. Tier2: 3-4. Tier3+: 4-6. Always at the END of practice — never as warm-up, never as punishment.
Coaching points: explicitly NOT a punishment. Frame it as "earning the win" — the team that can run in the 4th quarter wins. Walk-through how to PACE the gasser (hard out, harder back). Kids who go all-out on rep 1 are useless on rep 2 — teach the pacing.
Why it matters: youth football games come down to who has gas in the 2nd half. Especially in flag (no subs) and 6/8-man. Conditioning is decisive at lower levels. AVOID using running as a discipline tool — it teaches kids to associate running with punishment, which destroys long-term work ethic.',
 null, null, 'seed', 'youth conditioning + game-fitness',
 null, false, true),

('global', null, 'drill', 'conditioning_interval_shuttles',
 'Interval shuttles (work-rest 1:1)',
 'Setup: cones at 10 yds and 20 yds.
Reps: sprint to 10, back. Sprint to 20, back. Sprint to 10, back. = 1 set (60 yds total). Rest 30 sec. Tier2: 3 sets. Tier3+: 5 sets. Tier1: skip — use age-scaled gassers instead.
Coaching points: hit the line with a foot — no half-touches. Rest in a controlled walk, not laying down. Kids who lie down between intervals are training "I''m done" muscle memory; kids who walk are training "I recover" muscle memory.
Why it matters: 1:1 work-rest mimics the rhythm of a football game (5-7 sec play, 30 sec huddle/rest). Better simulation than steady-state running. Interval-trained teams visibly outlast continuous-run-trained teams in 4th quarters.',
 null, null, 'seed', 'football-specific interval conditioning',
 'tier2_9_11', false, true),

-- ============ YOUTH GAME-FORM DRILLS (tier1 magic) ============
-- For ages 5-8, drills disguised as games are 10x more effective than
-- "stand here and do this." Coach disguises the skill in the game.

('global', null, 'drill', 'youth_game_red_light_green_light',
 'Red light / green light (footwork)',
 'Setup: line of kids at one sideline, coach 30 yds away. Coach faces the kids.
Reps: coach yells "GREEN LIGHT!" — kids sprint forward. Coach yells "RED LIGHT!" — kids must STOP IMMEDIATELY in a balanced football stance (knees bent, hands up). Anyone moving when coach turns around goes back to start. First to reach the coach wins.
Coaching points: the football lesson is the STOP, not the run. Reward kids who stop in a perfect athletic position; correct the kids who stop standing straight up. Variation: "yellow light" = side-shuffle.
Why it matters: tier1 kids think they''re playing a game; they''re actually drilling 50+ change-of-direction stops in 5 minutes. Same skill that a defender uses to break on a route, dressed as recess.',
 null, null, 'seed', 'tier1 game-form footwork',
 'tier1_5_8', false, true),

('global', null, 'drill', 'youth_game_sharks_minnows',
 'Sharks and minnows (agility + flag pulling)',
 'Setup: 30 x 20 yard rectangle. 1-2 "sharks" (defenders) in the middle. All other kids ("minnows") line up at one end.
Reps: minnows wear flags. On "go!" they try to cross to the other side without losing a flag. Sharks pull flags. Anyone whose flag is pulled becomes a shark. Last minnow standing wins.
Coaching points: this drills 4 skills at once — minnows: agility cuts, flag awareness, sprint discipline. Sharks: pursuit angles, flag-pull form, communication. Coaches grade form as it happens — a flag-pull with a tackle = no count. A minnow who runs straight = teach them a juke after the round.
Why it matters: tier1 kids will play this for 30 minutes without complaint. Best drill for ages 5-8 because every kid is engaged every rep, regardless of skill level. The "you become a shark when caught" mechanic keeps slow kids from being permanently eliminated.',
 null, null, 'seed', 'tier1 game-form agility + flag work',
 'tier1_5_8', false, true),

('global', null, 'drill', 'youth_game_freeze_tag_release',
 'Freeze tag (release / first-step)',
 'Setup: 20x20 yard square. 2 taggers. Everyone else inside the square.
Reps: on "go!" taggers try to tag everyone. Tagged players FREEZE in place with feet shoulder-width and hands up. Free players can un-freeze a teammate by running THROUGH their stance (high-five and shout "release!"). Last unfrozen wins. 4 minutes per round.
Coaching points: emphasize the START — the first 2 steps to escape a tagger are the same as the first 2 steps off the line at the snap. Push off the back foot, low and explosive. Coaches grade releases between rounds.
Why it matters: ages 5-8 don''t respond to "drill release work" but they''ll play freeze tag forever. Same first-step mechanics, embedded in a game. Easiest way to teach a clean release at the youngest tier.',
 null, null, 'seed', 'tier1 release / first-step',
 'tier1_5_8', false, true),

('global', null, 'drill', 'youth_game_treasure_island',
 'Treasure island (catching + ball security)',
 'Setup: pile of footballs at one end (the "island"). Players line up at the other end, 20 yds away. Coach in the middle with foam balls.
Reps: on "go!" players sprint toward the island. Coach throws foam balls AT them — players must catch each one (or get hit). Each catch earns 1 "treasure" (poker chip / cone / token). Player can ALSO grab a football from the pile and run it back. Goal: most treasures + most footballs returned. 5 rounds.
Coaching points: catches with two hands score double. Anyone who drops a football on the way back loses ALL their treasure. Two skills layered in: catching the foam balls + ball security on the run-back. Tier1 kids understand "drop = lose" instantly.
Why it matters: ties catching to consequences in a way youth kids feel. They learn that a clean catch + secure carry MATTERS in a way that feels like a game, not a lecture.',
 null, null, 'seed', 'tier1 catching + ball security',
 'tier1_5_8', false, true);
