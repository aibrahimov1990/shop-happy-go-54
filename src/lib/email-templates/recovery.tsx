import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text, Hr,
} from '@react-email/components'
import * as s from './_styles'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your Sellier password</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>SELLIER</Text>
        <Hr style={s.hr} />

        <Heading style={s.heading}>Reset your password</Heading>
        <Text style={s.paragraph}>
          We received a request to reset your password for {siteName}. Tap the button
          below to choose a new one.
        </Text>

        <Section style={s.buttonWrap}>
          <Button href={confirmationUrl} style={s.button}>Reset password</Button>
        </Section>

        <Text style={s.muted}>
          If you didn't request this, you can safely ignore this email — your password
          will remain unchanged.
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

export default RecoveryEmail
