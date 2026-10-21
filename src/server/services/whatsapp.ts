import 'server-only';

/**
 * Sending the briefing through WhatsApp's official Cloud API.
 *
 * Why this and not a library that logs in by scanning a QR code with a
 * personal phone: those drive the consumer app through an unofficial channel,
 * which breaks WhatsApp's terms and gets the number banned — and the number
 * that gets banned here is the one the whole team is contacted on. It also
 * needs a long-lived process with a browser attached, which a serverless
 * deployment does not have. So: the official API, or the supervisor presses
 * send himself. Both are offered; neither risks the company's number.
 *
 * Nothing is configured in the database. The token is a credential, and the
 * project's own rule is that credentials live in environment variables and
 * never reach the browser — so this module reads the environment, runs only on
 * the server, and never returns the token to anything that renders.
 *
 * Meta requires business-initiated messages to use a TEMPLATE approved in
 * advance; free text is only allowed inside a 24-hour window opened by the
 * member writing first. A briefing is always business-initiated, so a template
 * is what gets sent, with the variable parts passed as parameters.
 */

export type WhatsAppConfig = {
  phoneNumberId: string;
  token: string;
  templateName: string;
  /** The language the approved template was registered under, e.g. ar. */
  templateLanguage: string;
  apiVersion: string;
};

export type WhatsAppStatus =
  | { configured: true; phoneNumberId: string; templateName: string; templateLanguage: string }
  | { configured: false; missing: string[] };

const ENV = {
  phoneNumberId: 'WHATSAPP_PHONE_NUMBER_ID',
  token: 'WHATSAPP_TOKEN',
  templateName: 'WHATSAPP_TEMPLATE_NAME',
} as const;

export function readConfig(): WhatsAppConfig | null {
  const phoneNumberId = process.env[ENV.phoneNumberId]?.trim();
  const token = process.env[ENV.token]?.trim();
  const templateName = process.env[ENV.templateName]?.trim();
  if (!phoneNumberId || !token || !templateName) return null;
  return {
    phoneNumberId,
    token,
    templateName,
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'ar',
    apiVersion: process.env.WHATSAPP_API_VERSION?.trim() || 'v21.0',
  };
}

/** What the screen is allowed to know: whether it works, never the token. */
export function readStatus(): WhatsAppStatus {
  const config = readConfig();
  if (config) {
    return {
      configured: true,
      phoneNumberId: config.phoneNumberId,
      templateName: config.templateName,
      templateLanguage: config.templateLanguage,
    };
  }
  const missing = Object.entries(ENV)
    .filter(([, name]) => !process.env[name]?.trim())
    .map(([, name]) => name);
  return { configured: false, missing };
}

export type SendResult = {
  eventMemberId: string;
  name: string;
  ok: boolean;
  /** Meta's own error text when it refused, for the screen to show as-is. */
  error?: string;
};

/**
 * The template's variables, in order.
 *
 * Kept to six because a template's body is fixed at approval time and every
 * variable has to appear in it; these are the six facts a member needs and
 * the ones that change per person. The personal link is last so the template
 * can end with it.
 */
export type BriefingVariables = [
  name: string,
  event: string,
  date: string,
  place: string,
  time: string,
  link: string,
];

/**
 * One message. Returns Meta's error rather than throwing, because a roster of
 * ninety will always contain one wrong number and the other eighty-nine must
 * still go out.
 */
export async function sendTemplate(
  config: WhatsAppConfig,
  to: string,
  variables: BriefingVariables,
): Promise<{ ok: boolean; error?: string }> {
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: config.templateName,
          language: { code: config.templateLanguage },
          components: [
            {
              type: 'body',
              parameters: variables.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
      // A hung request must not hold the whole run; one slow number is one
      // failed line in the result, not a stuck screen.
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) return { ok: true };

    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    return {
      ok: false,
      error: body?.error?.message ?? `HTTP ${response.status}`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
