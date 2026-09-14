/**
 * POST /api/contact
 *
 * Takes a message from the chat sheet (site/ChatSheet.astro) or the contact
 * page and mails it to the studio through Resend's REST API — a single fetch,
 * no SDK. Validation and the honeypot are Velocity's; the email is ours.
 *
 * Server-rendered (the one route on the site that is), which is what the
 * Vercel adapter in astro.config.mjs is for. Without RESEND_API_KEY the
 * message is logged in dev and accepted, so the form can be worked on
 * without sending anything; in production a missing key is a 500, not a
 * silent success.
 */
import type { APIRoute } from 'astro';
import { z } from 'astro/zod';
import { RESEND_API_KEY, CONTACT_TO, CONTACT_FROM } from 'astro:env/server';

export const prerender = false;

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.email('Please enter a valid email address'),
  subject: z.string().max(200).optional(),
  message: z.string().min(10, 'Message must be at least 10 characters').max(5000),
  /** Where it came from: the chat sheet or the contact page. */
  source: z.enum(['chat', 'contact']).optional(),
  honeypot: z.string().max(0), // Anti-spam: must be empty
});

type Contact = z.infer<typeof contactSchema>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c
  );

async function sendMail(data: Contact): Promise<void> {
  if (!RESEND_API_KEY) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[contact] RESEND_API_KEY not set — would have sent:', data);
      return;
    }
    throw new Error('RESEND_API_KEY is not set');
  }

  const via = data.source === 'chat' ? 'the chat sheet' : 'the contact page';
  const subject = data.subject?.trim() || `${data.name} — via ${via}`;
  const text = [`From: ${data.name} <${data.email}>`, `Via: ${via}`, '', data.message].join('\n');
  const html = `
    <p><strong>${escapeHtml(data.name)}</strong> &lt;${escapeHtml(data.email)}&gt;<br>
    <span style="color:#6b7280">via ${via}</span></p>
    <p style="white-space:pre-wrap;font-size:16px;line-height:1.5">${escapeHtml(data.message)}</p>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: CONTACT_FROM,
      to: [CONTACT_TO],
      reply_to: data.email,
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend ${response.status}: ${detail}`);
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();

    const data = {
      name: formData.get('name')?.toString() || '',
      email: formData.get('email')?.toString() || '',
      subject: formData.get('subject')?.toString() || '',
      message: formData.get('message')?.toString() || '',
      source: formData.get('source')?.toString() || undefined,
      honeypot: formData.get('honeypot')?.toString() || '',
    };

    const result = contactSchema.safeParse(data);

    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const error of result.error.issues) {
        const field = error.path[0] as string;
        (fieldErrors[field] ??= []).push(error.message);
      }
      return json({ success: false, errors: fieldErrors }, 400);
    }

    // Honeypot: a bot filled it in. Pretend success and drop it.
    if (result.data.honeypot) return json({ success: true });

    await sendMail(result.data);
    return json({ success: true });
  } catch (error) {
    console.error('Contact form error:', error);
    return json({ success: false, errors: { form: ['An unexpected error occurred'] } }, 500);
  }
};
