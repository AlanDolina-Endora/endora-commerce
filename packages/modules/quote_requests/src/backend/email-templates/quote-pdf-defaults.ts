import type { EmailDefaults } from '@endora-commerce/contracts';
import { simpleEmailBodyTree } from '@endora-commerce/email-components/defaults/simple-email-body';

/**
 * The default subject and body of the *Quote request PDF* e-mail
 * (`specs/153-quote-request-pdf-template/`, owner answer Q4), in the two
 * languages the platform ships. An operator edits either, per language and
 * channel, or switches the e-mail off, on the e-mail templates screen; the
 * quote PDF is attached by the sender, never by the template.
 *
 * The personal message is printed as written; an empty one leaves an empty
 * line, which an operator who never wants one removes from the body.
 */
export const QUOTE_REQUEST_PDF_EMAIL_DEFAULT: EmailDefaults = {
  defaultSubject: {
    'en-US': 'Quote {{var quote.number}}',
    'pl-PL': 'Oferta {{var quote.number}}',
  },
  defaultContent: {
    schema_version: 1,
    languages: {
      'en-US': simpleEmailBodyTree({
        idPrefix: 'quote-request-pdf',
        heading: 'Your quote {{var quote.number}}',
        text: [
          'Hello {{var customer.name}},',
          '{{var message}}',
          'Please find our quote {{var quote.number}} attached as a PDF. It is valid until {{var quote.validUntil}}.',
          'Kind regards,',
          '{{var salesRep.name}} {{var salesRep.email}}',
        ].join('\n'),
      }),
      'pl-PL': simpleEmailBodyTree({
        idPrefix: 'quote-request-pdf',
        heading: 'Twoja oferta {{var quote.number}}',
        text: [
          'Dzień dobry {{var customer.name}},',
          '{{var message}}',
          'W załączniku przesyłamy ofertę {{var quote.number}} w formacie PDF. Oferta jest ważna do {{var quote.validUntil}}.',
          'Z poważaniem',
          '{{var salesRep.name}} {{var salesRep.email}}',
        ].join('\n'),
      }),
    },
  },
};
