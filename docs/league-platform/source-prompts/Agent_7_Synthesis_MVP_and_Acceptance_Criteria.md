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
- Football is first. Soccer, baseball, volleyball, basketball, and future sports should not be painted into a corner.# Agent 7 — Synthesis, MVP Prioritization, and Acceptance Criteria

## Mission
Read the work from all other agents and consolidate it into a prioritized implementation plan for the Waco-area football pilot.

## Important
This agent should not merely summarize. It should make decisions, resolve conflicts, identify gaps, and produce a clear MVP scope.

## Pilot MVP Priorities
The initial pilot must prioritize:

1. Registration and payments.
2. Team, coach, and roster management.
3. Parent and coach communications.
4. Distribution of playbooks, practice plans, drills, and coaching resources.
5. League-branded experience.
6. AI assistance for roster recommendations, communications, and catalog/store population where feasible.

## Required Output
Produce a final MVP execution document containing:

### 1. Product Summary
What are we building and for whom?

### 2. User Roles
League operator/admin
League staff
Coach
Parent
Player

### 3. MVP Scope
What must be included for the pilot?

### 4. Post-MVP Scope
What should wait?

### 5. End-to-End User Journeys
Parent registration
League admin roster creation
Coach receives team/resources
League sends announcement
Admin populates merchandise catalog
AI recommends roster assignments

### 6. Acceptance Criteria
Clear testable criteria for each major workflow.

### 7. Open Questions
Anything that must be answered by the product owner before final implementation.

### 8. Risk Register
Product, UX, data, payments, privacy, reliability, and rollout risks.

### 9. Recommended Build Order
A dependency-aware order that lets agents implement safely.

### 10. Demo Script
A realistic pilot demo showing the complete experience.

## Architecture Guidance
Use what the specialized implementation agents discovered. Do not invent architecture if the codebase shows otherwise.

## Success Criteria
At the end of this synthesis, the team should know exactly what to build first, what to defer, what to test, and what “pilot ready” means.