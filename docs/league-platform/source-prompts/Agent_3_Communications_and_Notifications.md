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
- Football is first. Soccer, baseball, volleyball, basketball, and future sports should not be painted into a corner.# Agent 3 — Communications and Notifications

## Mission
Implement league communication tools for admins, coaches, parents, and players where appropriate.

## Product Goal
League operators need to communicate quickly and clearly with the right audience. Examples include tournament announcements, next game reminders, weather delays, reschedules, special events, and coach instructions.

## MVP Channels
- In-app notifications
- Email

SMS is not MVP.

## Sender/Branding Expectations
Messages should clearly appear to come from the league or league-branded context.

Practical MVP approach:
- Send from the platform/system address if needed.
- Use league branding and sender display conventions where available.
- Support reply-to or contact instructions if feasible.
- Do not attempt to become a full email hosting provider.

## Targeting Requirements
Admins should be able to target:
- Entire league
- Specific season
- Specific division
- Specific team
- Coaches only
- Parents only
- Players/parents associated with specific teams
- Registered but unrostered families where relevant

## Message Types
Support or scaffold:
- General announcement
- Schedule update
- Weather delay/cancellation
- Event promotion
- Registration reminder
- Coach-only message
- Team assignment update

## AI-Assisted Communication Requirement
AI should help draft messages, especially:
- Weather delay/cancellation wording
- Event announcement
- Registration reminder
- Coach instruction
- Parent update

Human review and send approval required.

## Admin UX Requirements
The admin should be able to:
- Compose a message.
- Select audience.
- Preview message.
- Send/publish.
- See delivery/send status where possible.
- See message history.

## Architecture Guidance
Inspect existing notification, email, messaging, calendar, and scheduling capabilities before implementation. Reuse what exists where appropriate.

## Required Deliverables
- League communication compose/send experience.
- Targeting model.
- Message history.
- In-app notification behavior.
- Email sending behavior or clear integration point.
- AI draft support where feasible.
- Manual test plan.

## Acceptance Criteria
- League admin can send an announcement to a targeted audience.
- Parents/coaches receive communication through in-app and/or email.
- Messages are clearly associated with the league.
- AI can draft but not send without human approval.