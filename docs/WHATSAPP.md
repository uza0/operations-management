# Sending the briefing over WhatsApp

There are two ways to get the briefing to the team, and the app offers both.
The difference is who presses send.

---

## 1. By hand, with "إرسال للكل" — works today, nothing to set up

On **تبليغ الفريق**, press **إرسال للكل**. The app opens the first member's
WhatsApp chat with the whole message already written, you press send, come
back, and press **التالي** for the next one. A bar at the top keeps your place
(`٣ / ٢٩`), so you never have to find the next name yourself, and each person
is marked as briefed as you go.

This uses the ordinary `wa.me` link, from your own WhatsApp, with your own
number. Nothing can be banned and nothing can go wrong.

### Why the app cannot press send for you on this route

Tools that "connect your WhatsApp" by scanning a QR code with your phone are
driving the consumer app through an unofficial channel. That breaks WhatsApp's
terms, and the number that gets banned is the one the whole team contacts you
on. They also need a server that stays running with a browser attached, which
this deployment does not have. So the app does not offer that route at all.

---

## 2. Fully automatic, through Meta's official Cloud API

One press sends to everyone, with no chat windows. It needs an account with
Meta first — the app is already built for it and starts working the moment the
keys are in place, with no change to the code.

### What you need from Meta

1. A **Meta Business** account, at <https://business.facebook.com>.
2. A **WhatsApp Business** app inside it, which gives you a **Phone number ID**
   and a test number; add your own number when you are ready to go live.
3. A **message template**, approved by Meta. Business-initiated messages — and
   a briefing always is — may only use an approved template. Approval usually
   takes a day or two.
4. A **permanent access token** for a system user with the
   `whatsapp_business_messaging` permission.

### The template

Create it under **WhatsApp Manager → Message templates**, category *Utility*,
language *Arabic*. The body must contain exactly six variables, in this order:

```
مرحباً {{1}} 👋

تبليغ مهمة — {{2}}
التاريخ: {{3}}
موقعك: {{4}}
وقت حضورك: {{5}}

تفاصيلك الكاملة: {{6}}
```

| Variable | What the app sends |
| --- | --- |
| `{{1}}` | the member's name |
| `{{2}}` | the event name |
| `{{3}}` | the date |
| `{{4}}` | their gate or working point (`احتياط` when they are on standby) |
| `{{5}}` | their arrival time |
| `{{6}}` | their personal link |

The full message — the map link, the shift, the main-gate detail, the gate
leader — stays on the personal link in `{{6}}`, because a template's wording is
fixed at approval time and those parts change per event.

### The keys

In **Vercel → Project → Settings → Environment Variables**, add:

| Name | Value |
| --- | --- |
| `WHATSAPP_PHONE_NUMBER_ID` | the Phone number ID from Meta |
| `WHATSAPP_TOKEN` | the permanent access token |
| `WHATSAPP_TEMPLATE_NAME` | the template's name, exactly as approved |
| `WHATSAPP_TEMPLATE_LANGUAGE` | optional — `ar` unless you registered another |
| `WHATSAPP_API_VERSION` | optional — defaults to a current version |

Redeploy. **تبليغ الفريق** will show *مربوط* and the automatic button becomes
live. Until then it shows exactly which variable is still missing.

### What the app does when you press it

It sends one message per person — WhatsApp has no bulk call for
business-initiated messages, and each message carries that person's own gate,
hours and private link anyway. People already briefed are skipped, so pressing
twice does not message the team twice. A wrong number fails on its own line and
the rest still go; the screen reports how many were sent and which failed.

Meta charges per conversation. Check the current rate for Iraq on their pricing
page before a large event.

### Security

The token is read from the environment on the server and never sent to the
browser, never written to the database, and never written to the activity log —
the log records how many messages went out, not what was in them or what key
sent them.
