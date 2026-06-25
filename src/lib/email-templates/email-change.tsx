import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text, Hr,
} from '@react-email/components'
import * as s from './_styles'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName, oldEmail, newEmail, confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your new email for {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>SELLIER</Text>
        <Hr style={s.hr} />

        <Heading style={s.heading}>Confirm your new email</Heading>
        <Text style={s.paragraph}>
          We received a request to change the email on your {siteName} account
          from <strong>{oldEmail}</strong> to <strong>{newEmail}</strong>.
        </Text>
        <Text style={s.paragraph}>
          Confirm the change by tapping the button below.
        </Text>

        <Section style={s.buttonWrap}>
          <Button href={confirmationUrl} style={s.button}>Confirm change</Button>
        </Section>

        <Text style={s.muted}>
          If you didn't request this, you can safely ignore this email.
        </Text>

        <Hr style={s.hr} />
        <Text style={s.footer}>
          Sellier Knightsbridge ·{' '}
          <Link href="https://sellierknightsbridge.com" style={s.footerLink}>
            sellierknightsbridge.com
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
