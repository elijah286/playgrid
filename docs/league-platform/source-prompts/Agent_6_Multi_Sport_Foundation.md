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
- Football is first. Soccer, baseball, volleyball, basketball, and future sports should not be painted into a corner.# Agent 6 — Multi-Sport Foundation

## Mission
Help XO GridMaker evolve from football-first into a multi-sport platform while still shipping the football pilot.

## Product Goal
Football is first and must be strong. But the league operator’s facility and vision include soccer, baseball, volleyball, and other sports. The platform should avoid hard-coding assumptions that make multi-sport expansion painful.

## Sports to Consider
- Football
- Soccer
- Baseball
- Volleyball
- Basketball
- Future sports

## Universal Concepts Across Sports
Identify and support concepts likely to apply broadly:
- League
- Season
- Division
- Team
- Coach
- Player
- Parent
- Registration
- Roster
- Schedule
- Practice
- Drill
- Skill
- Curriculum
- Communication
- Equipment/merchandise
- Field/court/location
- Age group

## Sport-Specific Differences
Consider how sports differ in:
- Field/court layout
- Positions
- Team size
- Rotations/substitutions
- Play diagrams
- Practice drills
- Scoring/game structure
- Equipment needs
- Player development progression
- Coaching concepts

## Requirements
Where implementation touches domain concepts, consider whether the concept should be sport-agnostic or sport-specific.

Do not block the football pilot by overengineering. But do avoid obvious dead ends.

## Specific Product Experiences to Support
- Football playbooks and practice plans in MVP.
- Future soccer drills and spacing concepts.
- Future baseball practice stations and position work.
- Future volleyball rotations and skill drills.
- Future basketball spacing/plays/drills.

## Architecture Guidance
Inspect the current product before implementation. If current functionality is deeply football-specific, identify the safest incremental abstraction path rather than forcing a rewrite.

## Required Deliverables
- Sport concept inventory.
- Recommendations for what to generalize now vs later.
- Any implementation needed to prevent football-only dead ends.
- Multi-sport UX implications for league admins and coaches.
- Manual test plan for football-first behavior.

## Acceptance Criteria
- Football pilot remains the priority.
- New league/registration/team concepts are not unnecessarily football-only.
- Practice/curriculum concepts can plausibly support future sports.
- Any multi-sport work is additive and pragmatic.