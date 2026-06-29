# Shared Context for All Agents

You are working on XO GridMaker.

XO GridMaker is an existing, in-market, revenue-generating product. The current product is coach-first and already has meaningful playbook/design functionality. The goal is to expand XO GridMaker into a league-operator platform without breaking or degrading the existing product.

The new target customer is a youth sports league operator. The pilot target is Waco-area football leagues for next spring, with football first but multi-sport foundations considered from the beginning.

Important business context:
- The league operator wants one platform for registration, payments, team formation, coach assignment, parent communication, player/parent data visibility, merchandise/equipment ordering, league branding, and distribution of coaching resources.
- The operator currently pays approximately $30K/year for registration software, so this platform is intended to become a serious operating system, not a small add-on.
- Existing XO GridMaker coach workflows must be protected. Do not casually rewrite core flows unless necessary. Prefer additive, gated, reversible work.
- Where architecture is needed, inspect the existing codebase and propose the safest implementation path based on the actual system.
- Do not assume the current architecture. Discover it.
- Do not only write a plan. Begin implementation where the scope is clear, and document any blockers or required decisions.

Global product principles:
- League admins need operational control and visibility.
- Parents need a simple, trusted registration and communication experience.
- Coaches need structured help: playbooks, practice plans, drills, and curriculum.
- AI should assist, draft, recommend, and populate — but human admins approve consequential changes.
- Payments should use Stripe or existing external payment infrastructure. Do not store card data.
- MVP channels for communication are in-app notifications and email. SMS is future scope.
- Branding matters: parents should clearly feel they are interacting with the specific league, not a generic product experience.
- Football is first. Soccer, baseball, volleyball, basketball, and future sports should not be painted into a corner.# Agent 4 — Coach Curriculum, Playbooks, and Practice Plans

## Mission
Improve the coach enablement experience so leagues can give coaches a strong starting point: playbooks, practice plans, drills, and curriculum.

## Product Goal
Most youth coaches are volunteers or inexperienced. They need practical guidance so they can teach concepts, develop players, and run better practices.

The existing XO GridMaker playbook surface is a strength. The practice plan experience needs significantly more investment and should become more visual, structured, and useful.

## League-to-Coach Content Distribution
League admins should be able to provide coaches with:
- League-approved playbooks
- Practice plans
- Drills
- Skill progressions
- Age-appropriate curriculum
- Teaching notes
- Game/practice preparation materials

Coaches should receive this as a starting point, not a locked prison. They may need to adapt it for their team.

## Practice Plan Requirements
Practice plans should support:
- Time blocks
- Drill assignments
- Teaching objectives
- Required equipment
- Player grouping
- Coaching points
- Related playbook concepts
- Visual explanations where possible
- Progressions from beginner to advanced

## Visual/Graphical Requirements
The practice plan should be less text-heavy.

Explore and implement where feasible:
- Visual drill diagrams
- Step-by-step drill progressions
- Animated or progression-style diagrams
- Sport-specific layout primitives
- Reuse of playbook-style visual concepts where appropriate

Avoid relying on unreliable AI-generated image/video output for core correctness. Prefer structured drill/play data that the product can render consistently.

## Football First
Football is the pilot sport and should receive the deepest treatment.

Football curriculum should support:
- Playbook install
- Practice scripting
- Position groups
- Concepts/schemes
- Skill development
- Game prep

## Multi-Sport Foundation
Do not make football-specific choices that prevent future support for:
- Soccer
- Baseball
- Volleyball
- Basketball
- Other sports

## AI-Assisted Curriculum Requirement
AI may help generate:
- Draft practice plans
- Drill suggestions
- Coaching points
- Age-appropriate teaching progressions
- Structured content that can be reviewed and edited

Human approval/editing required before league-wide distribution.

## Architecture Guidance
Inspect the existing playbook and practice plan implementation before changing it. Protect the current production playbook experience. If changes are risky, create additive or gated experiences.

## Required Deliverables
- Improved practice plan requirements and implementation/scaffold.
- League content distribution flow for coaches.
- Coach-facing experience for receiving assigned content.
- AI-assisted practice/curriculum draft workflow where feasible.
- Clear separation between existing playbook functionality and new/gated enhancements if needed.
- Manual test plan.

## Acceptance Criteria
- A coach assigned to a team can access league-provided coaching resources.
- A practice plan can be more than plain text; it supports structured drills and teaching objectives.
- League admins can assign or distribute coaching materials.
- Existing playbook workflows are not broken.