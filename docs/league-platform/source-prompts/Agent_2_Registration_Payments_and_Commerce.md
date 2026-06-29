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
- Football is first. Soccer, baseball, volleyball, basketball, and future sports should not be painted into a corner.# Agent 2 — Registration, Payments, and Commerce

## Mission
Implement the parent-facing registration, payment, and merchandise/equipment purchase experience, along with the league admin visibility needed to manage it.

## Product Goal
A parent should be able to scan a QR code or open a league-specific link, clearly understand which league they are registering for, register a child, pay registration fees, purchase required or optional items, and receive confirmation.

The league operator should be able to see registration details, payment/order status, and player-specific purchases.

## Parent Registration Requirements
The parent flow should support:
- League-specific landing/registration experience.
- Parent account or parent identity capture.
- One or more player registrations.
- Player name and basic details.
- Age/date-of-birth or age group.
- Sport/division/season selection where applicable.
- Waivers/acknowledgments.
- Emergency/contact fields if appropriate.
- Coach request.
- Friend/teammate request.
- Merchandise/equipment purchases.
- Payment.
- Confirmation.

## Commerce Requirements
Support league-defined merchandise/equipment items such as:
- Jerseys
- Mouthguards
- Socks
- Headwear
- Other league-defined items

Product details may include:
- Name
- Description
- Price
- Photo
- Size
- Color
- Required/optional flag
- Sport/division/season applicability

## AI-Assisted Catalog Requirement
The league admin should have AI assistance for populating the merchandise catalog.

The admin can provide:
- A product photo
- Pricing information
- Notes or rough description

AI should draft:
- Product title
- Product description
- Variant suggestions
- Metadata/options

Human approval is required before publishing.

## Payment Requirements
Use Stripe or the existing external payment infrastructure where appropriate.
Do not store card data.
Registration fees and merchandise purchases should be combinable in one checkout when practical.

## Admin Visibility Requirements
League admins need to see:
- Who registered
- Which player each registration belongs to
- Parent/contact info
- Payment status
- Order details
- Items purchased
- Outstanding/incomplete registrations
- Players not yet assigned to teams

## Architecture Guidance
Inspect the current app and payment setup before implementation. Use existing payment conventions if present. Do not assume Apple in-app purchase applies to physical goods or real-world league registration unless the app’s existing commercial design requires special handling.

## Required Deliverables
- Parent registration workflow.
- League-specific registration entry point.
- Basic merchandise catalog management.
- Combined registration/order visibility for admins.
- AI-assisted catalog draft workflow if feasible, or a well-scaffolded version with clear integration points.
- Manual test plan.

## Acceptance Criteria
- Parent can register a child for a specific league/season.
- Parent can pay registration fee.
- Parent can add merchandise/equipment to registration.
- League admin can view registration and order details.
- Catalog items can be created manually.
- AI assistance can draft catalog data but does not publish without approval.