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
- Football is first. Soccer, baseball, volleyball, basketball, and future sports should not be painted into a corner.# Agent 5 — AI-Assisted League Operations

## Mission
Implement AI-assisted workflows that help league operators save time while preserving human control.

## Core Principle
AI recommends, drafts, organizes, and populates.
Humans approve consequential changes.

## Required AI Use Cases

### 1. Roster and Team Assignment Recommendations
When registrations come in, AI should help recommend team placement.

Inputs may include:
- Player age
- Division
- Coach request
- Friend request
- Existing roster sizes
- Skill/experience if captured
- Sibling/family context if available

Outputs:
- Recommended team assignment
- Explanation/reasoning
- Conflict flags
- Balance warnings
- Admin approval workflow

### 2. Communication Drafting
AI should draft:
- Weather delay messages
- Reschedule notices
- Event announcements
- Registration reminders
- Coach communications
- Parent updates

Outputs must be editable and require send approval.

### 3. Catalog/Store Population
AI should help admins create merchandise/equipment catalog entries.

Inputs:
- Photo
- Price
- Notes

Outputs:
- Product title
- Product description
- Variants/options
- Metadata suggestions

Requires approval before publishing.

### 4. Coaching/Curriculum Assistance
AI should help generate or refine:
- Practice plans
- Drill descriptions
- Coaching points
- Teaching progressions
- League curriculum drafts

Requires review before publishing to coaches.

### 5. Administrative Assistant
AI can help answer admin questions and surface operational issues, such as:
- Which players are not rostered?
- Which teams have no coach?
- Which divisions are uneven?
- Which registrations are incomplete?
- What communications should go out this week?

## UX Requirements
AI should feel like an assistant embedded in the admin workflow, not a separate chatbot that loses context.

Prefer experiences like:
- “Draft this”
- “Suggest teams”
- “Populate from photo”
- “Explain why”
- “Apply changes after approval”

## Safety and Trust Requirements
- Show rationale for recommendations.
- Require approval.
- Maintain audit trail where appropriate.
- Make undo/revert possible when feasible.
- Avoid hidden autonomous changes.

## Architecture Guidance
Inspect existing AI infrastructure in XO GridMaker before implementation. Reuse existing patterns where appropriate. If no pattern exists, scaffold cleanly and document assumptions.

## Required Deliverables
- AI-assisted roster recommendation workflow.
- AI-assisted communication drafting.
- AI-assisted catalog creation.
- AI-assisted curriculum/practice planning where feasible.
- Approval/review UX patterns.
- Manual test plan.

## Acceptance Criteria
- AI can propose roster/team assignments with explanations.
- AI can draft admin communications.
- AI can help populate catalog entries.
- No AI-generated consequential change is applied without human approval.