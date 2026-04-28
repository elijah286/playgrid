-- Point seeded opex_services.website at each provider's billing/admin page
-- so the Opex tab links land directly where invoices/usage live.
-- Only touches rows whose website still matches the original 0162 seed URL,
-- so admin-customized values are preserved.

update public.opex_services set website = 'https://console.anthropic.com/settings/billing'
  where slug = 'claude' and website = 'https://console.anthropic.com';

update public.opex_services set website = 'https://platform.openai.com/settings/organization/billing/overview'
  where slug = 'openai' and website = 'https://platform.openai.com';

update public.opex_services set website = 'https://supabase.com/dashboard/project/_/settings/billing'
  where slug = 'supabase' and website = 'https://supabase.com/dashboard';

update public.opex_services set website = 'https://railway.com/account/billing'
  where slug = 'railway' and website = 'https://railway.app';

update public.opex_services set website = 'https://dash.cloudflare.com/?to=/:account/billing'
  where slug = 'cloudflare' and website = 'https://dash.cloudflare.com';

update public.opex_services set website = 'https://console.cloud.google.com/billing'
  where slug = 'google_maps' and website = 'https://console.cloud.google.com';

update public.opex_services set website = 'https://dashboard.stripe.com/balance/overview'
  where slug = 'stripe' and website = 'https://dashboard.stripe.com';

update public.opex_services set website = 'https://resend.com/settings/billing'
  where slug = 'resend' and website = 'https://resend.com';

update public.opex_services set website = 'https://mailadmin.zoho.com'
  where slug = 'zoho' and website = 'https://mail.zoho.com';

update public.opex_services set website = 'https://account.godaddy.com/billing'
  where slug = 'godaddy' and website = 'https://godaddy.com';

update public.opex_services set website = 'https://developer.apple.com/account'
  where slug = 'apple_developer' and website = 'https://developer.apple.com';
