/**
 * The brief on /contact: one question at a time, written up as you go.
 *
 * The page is a complete form without this file. Here it becomes a sequence:
 * each answer fills its slot in the running sentence, a tap moves on, and any
 * slot jumps back to its question. Answers live in this tab's sessionStorage
 * so a refresh loses nothing; they leave the browser only on send.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * Hands an event to Google's tag, if the page has one (Analytics.astro). The
 * tag only reads the Arguments object, so rest params won't do.
 */
function gtag(..._args: unknown[]) {
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer?.push(arguments);
}

const KEY = 'sw-brief';
/** Long enough to see the choice land before the next question arrives. */
const ADVANCE_MS = 280;

export function initBrief(root: HTMLElement): VoidFunction {
  const form = root.querySelector<HTMLFormElement>('[data-brief-form]');
  if (!form) return () => {};

  const listeners = new AbortController();
  const { signal } = listeners;
  const steps = [...form.querySelectorAll<HTMLElement>('[data-brief-step]')];
  const stepOf = (id: string) => steps.find((step) => step.dataset.briefStep === id);
  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);

  const back = q<HTMLButtonElement>('[data-brief-back]');
  const next = q<HTMLButtonElement>('[data-brief-next]');
  const send = q<HTMLButtonElement>('[data-brief-send]');
  const error = q<HTMLElement>('[data-brief-error]');
  const fail = q<HTMLElement>('[data-brief-fail]');
  const count = q<HTMLElement>('[data-brief-count]');
  const name = form.elements.namedItem('name') as HTMLInputElement;
  const email = form.elements.namedItem('email') as HTMLInputElement;
  const company = form.elements.namedItem('company') as HTMLInputElement;
  const message = form.elements.namedItem('message') as HTMLTextAreaElement;

  let current = 'need';
  /** Came from the review to change one answer: go straight back after it. */
  let returning = false;
  let pointered = false;
  let advance = 0;
  let sending = false;

  form.noValidate = true;

  const checked = (field: string) =>
    form.querySelector<HTMLInputElement>(`input[name="${field}"]:checked`);
  const needValue = () => checked('need')?.dataset.value ?? '';

  /** The steps this visitor actually gets, given their first answer. */
  const route = () =>
    steps.filter((step) => !step.dataset.when || step.dataset.when === needValue());

  const fill = (slot: string, text: string) => {
    root.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`).forEach((el) => {
      el.textContent = text || (el.dataset.blank ?? '');
      el.toggleAttribute('data-empty', !text);
    });
  };
  const part = (id: string, show: boolean) => {
    root.querySelectorAll<HTMLElement>(`[data-part="${id}"]`).forEach((el) => {
      el.hidden = !show;
    });
  };

  const render = () => {
    const companyName = company.value.trim();
    fill('name', name.value.trim());
    fill('company', companyName);
    for (const field of ['need', 'detail', 'stage', 'timeline', 'budget']) {
      fill(field, checked(field)?.dataset.phrase ?? '');
    }
    fill('message', message.value.trim());
    part('company', Boolean(companyName) || !name.value.trim());
    part('detail', Boolean(needValue()) && needValue() !== 'unsure');
    part('message', Boolean(message.value.trim()));
  };

  const save = () => {
    try {
      const answers: Record<string, string> = {};
      new FormData(form).forEach((value, field) => {
        if (field !== 'honeypot' && field !== 'source') answers[field] = String(value);
      });
      sessionStorage.setItem(KEY, JSON.stringify({ step: current, answers }));
    } catch {
      /* Private mode: the page works, it just won't survive a refresh. */
    }
  };

  const say = (text: string) => {
    if (!error) return;
    error.textContent = text;
    error.hidden = !text;
  };

  const go = (id: string, moveFocus = true) => {
    window.clearTimeout(advance);
    const target = stepOf(id);
    if (!target) return;
    current = id;
    root.dataset.step = id;
    say('');
    if (fail) fail.hidden = true;
    steps.forEach((step) => step.toggleAttribute('data-active', step === target));

    const path = route();
    const questions = path.filter((step) => step.dataset.briefStep !== 'review');
    const at = questions.indexOf(target);
    const reviewing = id === 'review';
    const total = needValue() ? questions.length : questions.length + 1;
    if (count) count.textContent = reviewing ? 'Your brief' : `Question ${at + 1} of ${total}`;
    root.style.setProperty('--brief-progress', String(reviewing ? 1 : (at + 1) / (total + 1)));

    if (back) back.hidden = path.indexOf(target) === 0;
    if (next) next.hidden = reviewing;
    if (send) send.hidden = !reviewing;
    save();

    if (!moveFocus) return;
    if (window.scrollY > 0) {
      if (window.__lenis) window.__lenis.scrollTo(0, { immediate: true });
      else window.scrollTo(0, 0);
    }
    const field = target.querySelector<HTMLElement>('input:not([type="radio"]), textarea');
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    // On a phone a focused field throws the keyboard over the question.
    (field && fine ? field : target.querySelector<HTMLElement>('legend'))?.focus({
      preventScroll: true,
    });
  };

  const valid = () => {
    const step = stepOf(current);
    if (!step) return false;
    const radio = step.querySelector<HTMLInputElement>('input[type="radio"]');
    if (radio && !checked(radio.name)) {
      say('Pick the closest one.');
      return false;
    }
    if (current === 'you') {
      if (name.value.trim().length < 2) {
        say('I’ll need your name.');
        name.focus();
        return false;
      }
      if (!email.value.trim() || !email.validity.valid) {
        say('That email doesn’t look right, and it’s how I’ll reply.');
        email.focus();
        return false;
      }
    }
    return true;
  };

  const forward = () => {
    window.clearTimeout(advance);
    if (!valid()) return;
    const path = route();
    const following = path[path.indexOf(stepOf(current) as HTMLElement) + 1];
    const followUp = current === 'need' && following?.dataset.when && !checked('detail');
    if (returning && !followUp) {
      returning = false;
      go('review');
    } else if (following?.dataset.briefStep) {
      go(following.dataset.briefStep);
    }
  };

  const backward = () => {
    const path = route();
    const previous = path[path.indexOf(stepOf(current) as HTMLElement) - 1];
    returning = false;
    if (previous?.dataset.briefStep) go(previous.dataset.briefStep);
  };

  const submit = async () => {
    if (sending) return;
    sending = true;
    say('');
    if (fail) fail.hidden = true;
    const label = send?.querySelector('[data-brief-send-label]');
    const idle = label?.textContent ?? '';
    if (send) send.disabled = true;
    if (label) label.textContent = 'Sending…';

    let sent = false;
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        errors?: Record<string, string[]>;
      } | null;
      sent = response.ok && Boolean(data?.success);
      if (!sent && response.status === 400 && data?.errors) {
        sending = false;
        if (send) send.disabled = false;
        if (label) label.textContent = idle;
        go('you');
        say(Object.values(data.errors).flat()[0] ?? 'Something there needs another look.');
        return;
      }
    } catch {
      /* Offline or blocked: `sent` stays false and the page says so. */
    }

    sending = false;
    if (send) send.disabled = false;
    if (label) label.textContent = idle;

    if (!sent) {
      // The answers stay on the page and in the tab, so nothing is lost.
      if (fail) fail.hidden = false;
      return;
    }

    // The form's name only: nothing the visitor typed goes to Google.
    gtag('event', 'generate_lead', { form_name: 'brief' });

    root.querySelectorAll<HTMLElement>('[data-done-name]').forEach((el) => {
      el.textContent = name.value.trim().split(/\s+/)[0] ?? '';
    });
    root.querySelectorAll<HTMLElement>('[data-done-email]').forEach((el) => {
      el.textContent = email.value.trim();
    });
    root.dataset.step = 'done';
    root.style.setProperty('--brief-progress', '1');
    if (count) count.textContent = 'Sent';
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* Nothing was stored. */
    }
    q<HTMLElement>('[data-brief-done-title]')?.focus({ preventScroll: true });
  };

  // --- input ---------------------------------------------------------------
  form.addEventListener(
    'input',
    (event) => {
      const target = event.target as HTMLInputElement;
      if (target.name === 'need') {
        form
          .querySelectorAll<HTMLInputElement>('input[name="detail"]')
          .forEach((radio) => (radio.checked = false));
      }
      say('');
      render();
      save();
    },
    { signal }
  );

  // A tap moves on; arrowing through the options doesn't, or a keyboard user
  // could never get past the first one. Enter moves on for them.
  form.addEventListener('pointerdown', () => (pointered = true), { signal });
  form.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLInputElement;
      if (target.type !== 'radio' || !pointered) return;
      pointered = false;
      window.clearTimeout(advance);
      advance = window.setTimeout(forward, ADVANCE_MS);
    },
    { signal }
  );

  form.addEventListener(
    'keydown',
    (event) => {
      pointered = false;
      const target = event.target as HTMLElement;
      const typing = target instanceof HTMLTextAreaElement || target.matches('input:not([type="radio"])');
      if (event.key === 'Enter') {
        if (target instanceof HTMLButtonElement) return;
        if (target instanceof HTMLTextAreaElement && !(event.metaKey || event.ctrlKey)) return;
        event.preventDefault();
        if (current === 'review') void submit();
        else forward();
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      // Number keys pick an option, matching the numbers on the rows.
      const index = Number(event.key) - 1;
      const radios = stepOf(current)?.querySelectorAll<HTMLInputElement>('input[type="radio"]');
      const radio = Number.isInteger(index) ? radios?.[index] : undefined;
      if (!radio) return;
      radio.checked = true;
      radio.dispatchEvent(new Event('input', { bubbles: true }));
      window.clearTimeout(advance);
      advance = window.setTimeout(forward, ADVANCE_MS);
    },
    { signal }
  );

  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      // Motion's failsafe may have dropped to the plain form: one page, one send.
      const sequence = document.documentElement.classList.contains('js');
      if (sequence && current !== 'review') forward();
      else void submit();
    },
    { signal }
  );

  next?.addEventListener('click', forward, { signal });
  back?.addEventListener('click', backward, { signal });

  root.querySelectorAll<HTMLElement>('[data-go]').forEach((slot) => {
    slot.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        if (root.dataset.step === 'done') return;
        const wanted = slot.dataset.go ?? '';
        const id = wanted === 'detail' ? route().find((s) => s.dataset.when)?.dataset.briefStep : wanted;
        if (!id) return;
        returning = current === 'review';
        go(id);
      },
      { signal }
    );
  });

  // --- pick up where they left off -----------------------------------------
  let start = 'need';
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as {
      step?: string;
      answers?: Record<string, string>;
    } | null;
    for (const [field, value] of Object.entries(saved?.answers ?? {})) {
      const control = form.elements.namedItem(field);
      if (control instanceof RadioNodeList) control.value = value;
      else if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        control.value = value;
      }
    }
    if (saved?.step && route().some((step) => step.dataset.briefStep === saved.step)) {
      start = saved.step;
    }
  } catch {
    /* Nothing usable saved: start at the top. */
  }

  render();
  go(start, false);
  delete root.dataset.restoring;

  return () => {
    listeners.abort();
    window.clearTimeout(advance);
  };
}
