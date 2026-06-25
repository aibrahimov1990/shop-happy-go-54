import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Link, Section,
} from '@react-email/components'
import * as s from './_styles'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your one-time sign-in link for Sellier Knightsbridge</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>SELLIER</Text>
        <Hr style={s.hr} />

        <Heading style={s.heading}>Your sign-in link</Heading>

        <Text style={s.paragraph}>Hello,</Text>
        <Text style={s.paragraph}>
          Tap the button below to securely sign in to your {siteName} account. This link
          will expire shortly and can only be used once.
        </Text>

        <Section style={s.buttonWrap}>
          <Button href={confirmationUrl} style={s.button}>Sign in</Button>
        </Section>

        <Text style={s.muted}>
          If you didn't request this, you can safely ignore this email — no changes will
          be made to your account.
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

export default MagicLinkEmail
