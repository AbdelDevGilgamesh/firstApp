# AI Provider Setup

The Expo app never calls AI providers directly. It only calls these Supabase Edge Functions:

- `ai-meal-estimate`
- `ai-food-autofill`

The Edge Functions choose the provider from Supabase secrets:

```bash
supabase secrets set AI_PROVIDER=gemini
```

Supported values:

- `gemini`
- `openrouter`
- `groq`
- `demo`

After changing secrets or function code, redeploy:

```bash
supabase functions deploy ai-meal-estimate
supabase functions deploy ai-food-autofill
```

## Gemini

Default provider.

```bash
supabase secrets set AI_PROVIDER=gemini
supabase secrets set GEMINI_API_KEY=your_gemini_key
supabase secrets set GEMINI_MODEL=gemini-3.1-flash-lite
```

If `GEMINI_MODEL` is not set, the function uses `gemini-3.1-flash-lite`.

## OpenRouter

Uses the OpenRouter chat completions API.

```bash
supabase secrets set AI_PROVIDER=openrouter
supabase secrets set OPENROUTER_API_KEY=your_openrouter_key
supabase secrets set OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free
```

If `OPENROUTER_MODEL` is not set, the function uses `meta-llama/llama-3.1-8b-instruct:free`.
OpenRouter free model availability can change, so update this secret if that model is no longer available.

## Groq

Uses Groq's OpenAI-compatible chat completions API.

```bash
supabase secrets set AI_PROVIDER=groq
supabase secrets set GROQ_API_KEY=your_groq_key
supabase secrets set GROQ_MODEL=llama-3.1-8b-instant
```

If `GROQ_MODEL` is not set, the function uses `llama-3.1-8b-instant`.

## Demo

Demo mode returns local JSON without calling any external AI provider. Use it to test the Expo UI when provider quota is unavailable.

```bash
supabase secrets set AI_PROVIDER=demo
```

Demo mode still returns a successful estimate to the app. The current Expo token rule spends 1 token after any successful AI result.

## Errors

The functions return structured JSON errors:

```json
{
  "error": "AI usage limit reached. Please try again later.",
  "code": "AI_QUOTA_EXCEEDED"
}
```

Codes:

- `MISSING_AI_PROVIDER_KEY`
- `INVALID_INPUT`
- `GEMINI_ERROR`
- `AI_PROVIDER_ERROR`
- `AI_QUOTA_EXCEEDED`
- `AI_TEMPORARILY_UNAVAILABLE`
- `INVALID_AI_RESPONSE`
- `UNKNOWN_ERROR`

Provider logs include provider name, model name, and status code. API keys are never logged.
