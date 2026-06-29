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
- Football is first. Soccer, baseball, volleyball, basketball, and future sports should not be painted into a corner.# Agent 1 — League Operator Console

## Mission
Implement the league administrator experience.

The league operator should be able to run a youth sports league from a dedicated admin experience. This should feel like a control center for registrations, teams, coaches, parents, players, communications, merchandise, and coaching resources.

## User Experience Goals
A league admin should be able to:
- Set up a league-branded experience.
- Create or manage a season.
- Organize divisions or age groups.
- Review registered players.
- Track parents, players, coaches, and teams.
- Create teams.
- Assign coaches.
- Assign players to teams.
- See players who are registered but not yet rostered.
- See orders and registration details.
- Send league-wide or targeted announcements.
- Push league-approved playbooks, practice plans, drills, and curriculum to coaches.

## Key States
A player/registration may be:
- Registered but not approved
- Approved but not rostered
- Rostered to a team
- Waitlisted
- Inactive/withdrawn

A coach may be:
- Invited
- Active
- Assigned to one or more teams
- Removed/inactive

A team may be:
- Draft/unpublished
- Active
- Archived/completed

## Core Workflows to Implement
1. League admin dashboard.
2. League profile and branding.
3. Season/division management.
4. Registration review.
5. Team creation.
6. Coach assignment.
7. Player/team assignment.
8. Roster overview.
9. Unassigned player queue.
10. Basic reporting/visibility.

## Important UX Detail
The admin needs to see operational gaps immediately:
- Players registered but not rostered
- Teams without coaches
- Divisions with uneven roster sizes
- Registrations with incomplete information
- Orders requiring attention
- Communications that failed or need review

## Architecture Guidance
Inspect the current codebase before making implementation decisions. Do not assume entity names or existing patterns. Use existing conventions where possible.

Prefer additive work that protects the current coach experience.

## Required Deliverables
- Implement or scaffold the league admin console.
- Add any required navigation entry points behind an appropriate account/role/feature gate.
- Create the core screens and flows needed for league administration.
- Document what is fully implemented, what is scaffolded, and what remains blocked by missing decisions.
- Include acceptance criteria and manual test steps.

## Acceptance Criteria
- A league admin can access a league admin area without affecting normal coach users.
- A league admin can view league, season, team, coach, player, and registration-oriented information.
- The system explicitly represents players who are registered but not assigned to a team.
- The experience clearly supports the Waco football pilot.