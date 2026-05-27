/**
 * @file mailer.ts
 * @module helpers/mailer
 * @summary Centralized email sending utility using Nodemailer.
 */

import nodemailer from 'nodemailer';
import { configGet } from '@helpers/config';

// Create a reusable transporter using SMTP settings from the environment
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: configGet('SMTP_HOST'),
            port: Number(configGet('SMTP_PORT')),
            secure: Number(configGet('SMTP_PORT')) === 465, // true for 465, false for other ports
            auth: {
                user: configGet('SMTP_USER'),
                pass: configGet('SMTP_PASS'),
            },
        });
    }
    return transporter;
}

export async function sendEmail(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
}): Promise<void> {
    const { to, subject, text, html } = params;
    const from = configGet('SMTP_FROM_EMAIL');

    const mailOptions = {
        from,
        to,
        subject,
        text,
        html,
    };

    const mailer = getTransporter();

    try {
        const info = await mailer.sendMail(mailOptions);
        console.log(`Email sent to ${to}: ${info.messageId}`);

        // If using Ethereal email for testing, this prints a URL to view the email
        if (configGet('SMTP_HOST').includes('ethereal')) {
            console.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        }
    } catch (error) {
        console.error('Error sending email:', error);
        // Depending on your requirements, you might want to throw this error
        // or just log it so the user registration doesn't fail if the mailer is down.
        throw new Error('Failed to send email');
    }
}
