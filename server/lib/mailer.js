// Transporte de correo institucional. Se usa SMTP real cuando está
// configurado; si no hay transporte disponible, el llamador debe registrar
// el estado como "Error de envío" y jamás como "notificado".
import config from '../config.js';

let transportPromise = null;

async function getTransport() {
  if (!config.mail.enabled || !config.mail.host) {
    throw new Error('SMTP no configurado. Defina MAIL_ENABLED=true y SMTP_HOST en .env.');
  }
  if (!transportPromise) {
    transportPromise = import('nodemailer').then(({ default: nodemailer }) => nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user
        ? { user: config.mail.user, pass: config.mail.password }
        : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000
    })).catch(error => {
      transportPromise = null;
      throw new Error(`No se pudo inicializar el transporte SMTP: ${error.message}`);
    });
  }
  return transportPromise;
}

export function mailConfigured() {
  return Boolean(config.mail.enabled && config.mail.host);
}

export function normalizeError(error) {
  const message = String(error?.message || error || 'Error desconocido al enviar el correo.');
  return message.slice(0, 500);
}

export async function sendMail({ to, subject, text, html }) {
  const transport = await getTransport();
  const info = await transport.sendMail({
    from: config.mail.from,
    to,
    subject: `${config.mail.subjectPrefix}${subject}`,
    text,
    html: html || `<p>${String(text || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`
  });
  return { messageId: info?.messageId || null, accepted: info?.accepted || [] };
}

// Permite inyectar un transporte en pruebas sin depender de SMTP externo.
export function __setTransportForTests(transport) {
  transportPromise = Promise.resolve(transport);
}
