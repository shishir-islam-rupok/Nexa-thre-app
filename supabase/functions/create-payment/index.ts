import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { amount_cents, receiver_id, note } = await req.json();

    if (!amount_cents || amount_cents <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!receiver_id) {
      return new Response(
        JSON.stringify({ error: "Missing recipient" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the authenticated user from the JWT
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const parts = token.split(".");
    if (parts.length !== 3) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const payload = JSON.parse(atob(parts[1]));
    const senderId = payload.sub;

    if (!senderId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for DB writes
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Create a transaction record with status 'pending'
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .insert({
        sender_id: senderId,
        receiver_id,
        amount_cents,
        note: note || "",
        status: "pending",
      })
      .select()
      .single();

    if (txError || !tx) {
      return new Response(
        JSON.stringify({ error: "Failed to create transaction" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to process via Stripe if a secret key is configured
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (stripeKey) {
      // Create a PaymentIntent
      const stripeResponse = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          amount: String(amount_cents),
          currency: "usd",
          "metadata[transaction_id]": tx.id,
          "metadata[sender_id]": senderId,
          "metadata[receiver_id]": receiver_id,
          "metadata[note]": note || "",
        }),
      });

      const stripeData = await stripeResponse.json();

      if (!stripeResponse.ok) {
        // Mark transaction as failed
        await supabase
          .from("transactions")
          .update({
            status: "failed",
            stripe_payment_intent_id: stripeData.id || "",
          })
          .eq("id", tx.id);

        return new Response(
          JSON.stringify({ error: stripeData.error?.message || "Payment failed" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update transaction with Stripe PaymentIntent ID
      await supabase
        .from("transactions")
        .update({
          status: "completed",
          stripe_payment_intent_id: stripeData.id,
        })
        .eq("id", tx.id);

      return new Response(
        JSON.stringify({
          success: true,
          transaction_id: tx.id,
          client_secret: stripeData.client_secret,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No Stripe key configured — simulate a successful payment for demo
    await supabase
      .from("transactions")
      .update({ status: "completed" })
      .eq("id", tx.id);

    return new Response(
      JSON.stringify({
        success: true,
        transaction_id: tx.id,
        demo: true,
        message: "Payment recorded (demo mode — add Stripe secret key to process real charges)",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
