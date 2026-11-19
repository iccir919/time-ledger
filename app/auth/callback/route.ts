import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Google only sends this at sign-in, so save it now
      const session = data.session;
      if (session?.provider_refresh_token) {
        const admin = createAdminClient();
        const { error: tokenError } = await admin.from("google_tokens").upsert({
          user_id: session.user.id,
          refresh_token: session.provider_refresh_token,
          updated_at: new Date().toISOString(),
        });

        if (tokenError) {
          console.error("Could not save Google token:", tokenError.message);
        }
      }

      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth`);
}