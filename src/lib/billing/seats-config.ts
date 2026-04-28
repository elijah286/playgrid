/** Default seats included with Team Coach. Owners can also be granted more
 *  via the `owner_seat_grants.included_seats` column (e.g. comp/PR
 *  arrangements). Per-seat add-ons live in `purchased_seats`. */
export const DEFAULT_INCLUDED_SEATS = 3;
/** USD price per extra seat per month. Single source of truth for UI copy
 *  and any docs that mention the number. */
export const SEAT_PRICE_USD_PER_MONTH = 3;
/** Coach Pro add-on: extra Coach Cal messages, sold in packs. Display-only
 *  for now — checkout wiring lives in a follow-up. */
export const MESSAGE_PACK_SIZE = 100;
export const MESSAGE_PACK_PRICE_USD_PER_MONTH = 5;
