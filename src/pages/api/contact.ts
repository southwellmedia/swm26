/**
 * POST /api/contact
 *
 * Takes a message from the chat sheet (site/ChatSheet.astro) or the brief on
 * /contact and mails it to the studio through Resend's REST API — a single
 * fetch, no SDK. Validation and the honeypot are Velocity's; the email is ours.
 * A plain form post (no JavaScript) is redirected rather than answered in JSON.
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

const answer = z.string().max(200).optional();

const contactSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.email('Please enter a valid email address'),
    subject: z.string().max(200).optional(),
    message: z.string().max(5000),
    /** Where it came from: the chat sheet or the brief on /contact. */
    source: z.enum(['chat', 'brief']).optional(),
    honeypot: z.string().max(0), // Anti-spam: must be empty
    // The brief's answers, as the visitor read them.
    company: answer,
    need: answer,
    detail: answer,
    stage: answer,
    timeline: answer,
    budget: answer,
  })
  .superRefine((data, context) => {
    // "What's in the way?" is optional in the brief; the answers carry it.
    if (data.source !== 'brief' && data.message.trim().length < 10) {
      context.addIssue({
        code: 'custom',
        path: ['message'],
        message: 'Message must be at least 10 characters',
      });
    }
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

  const via = data.source === 'chat' ? 'the chat sheet' : 'the brief';
  const who = data.company ? `${data.name}, ${data.company}` : data.name;
  const subject =
    data.subject?.trim() ||
    (data.source === 'brief' ? `New brief: ${who}` : `${data.name} — via ${via}`);
  const answers = Object.entries({
    Company: data.company,
    'Looking for': data.need,
    Detail: data.detail,
    Stage: data.stage,
    Timeline: data.timeline,
    Budget: data.budget,
  }).flatMap(([label, value]) => (value ? [[label, value] as const] : []));
  const text = [
    `From: ${data.name} <${data.email}>`,
    `Via: ${via}`,
    '',
    ...answers.map(([label, value]) => `${label}: ${value}`),
    ...(answers.length ? [''] : []),
    data.message,
  ].join('\n');
  const rows = answers
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#6b7280">${label}</td>` +
        `<td style="padding:4px 0">${escapeHtml(value)}</td></tr>`
    )
    .join('');
  const html = `
    <p><strong>${escapeHtml(data.name)}</strong> &lt;${escapeHtml(data.email)}&gt;<br>
    <span style="color:#6b7280">via ${via}</span></p>
    ${rows ? `<table style="font-size:16px;line-height:1.5;border-collapse:collapse">${rows}</table>` : ''}
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

export const POST: APIRoute = async ({ request, redirect }) => {
  // A browser posting the form itself, with no script to read a JSON answer.
  const plain = request.headers.get('accept')?.includes('text/html') ?? false;
  try {
    const formData = await request.formData();

    const data = {
      name: formData.get('name')?.toString() || '',
      email: formData.get('email')?.toString() || '',
      subject: formData.get('subject')?.toString() || '',
      message: formData.get('message')?.toString() || '',
      source: formData.get('source')?.toString() || undefined,
      honeypot: formData.get('honeypot')?.toString() || '',
      company: formData.get('company')?.toString() || undefined,
      need: formData.get('need')?.toString() || undefined,
      detail: formData.get('detail')?.toString() || undefined,
      stage: formData.get('stage')?.toString() || undefined,
      timeline: formData.get('timeline')?.toString() || undefined,
      budget: formData.get('budget')?.toString() || undefined,
    };

    const result = contactSchema.safeParse(data);

    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const error of result.error.issues) {
        const field = error.path[0] as string;
        (fieldErrors[field] ??= []).push(error.message);
      }
      if (plain) return redirect('/contact', 303);
      return json({ success: false, errors: fieldErrors }, 400);
    }

    // Honeypot: a bot filled it in. Pretend success and drop it.
    if (result.data.honeypot) return json({ success: true });

    await sendMail(result.data);
    if (plain) return redirect('/contact/thanks', 303);
    return json({ success: true });
  } catch (error) {
    console.error('Contact form error:', error);
    return json({ success: false, errors: { form: ['An unexpected error occurred'] } }, 500);
  }
};
