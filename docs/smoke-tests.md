# Smoke tests (operators)

These exercises hit **authenticated internal routes** — use a throwaway token and local/staging only. Never commit real secrets.

## Staging row + workflow start

After `AGENT_Z_INTERNAL_SECRET`, `AGENT_Z_APP_BASE_URL`, and DB are configured:

```bash
curl -sS -X POST "$AGENT_Z_APP_BASE_URL/api/internal/staged/start" \
  -H "Authorization: Bearer $AGENT_Z_INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "pa_deadbeef_testtoken00000000001",
    "invokerUserId": "123456789012345678",
    "guildId": "987654321098765432",
    "channelId": "876543210987654321",
    "capability": "smoke_test_capability",
    "summary": "Smoke test pending action",
    "input": {"note": "discard"},
    "expiresInSeconds": 120,
    "interactionToken": "",
    "interactionApplicationId": ""
  }'
```

Expect `{"ok":true,"token":"…"}`. Rows appear under **/admin → Observability → Recent staged actions**.

## Pending summary PATCH (Discord card refresh optional)

Requires an existing **pending** `pa_…` token:

```bash
curl -sS -X POST "$AGENT_Z_APP_BASE_URL/api/internal/pending-actions/edit-reason" \
  -H "Authorization: Bearer $AGENT_Z_INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"token":"pa_xxxxxxxx","summary":"Updated via internal route smoke test"}'
```

Expect `{"ok":true,"refreshed":true|false}`. `refreshed` is `true` only when the pending row stores `interactionToken` + `interactionApplicationId` from a live Discord interaction.
