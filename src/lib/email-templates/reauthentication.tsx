import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Link, Preview, Text, Hr,
} from '@react-email/components'
import * as s from './_styles'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Sellier verification code</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>SELLIER</Text>
        <Hr style={s.hr} />

        <Heading style={s.heading}>Verification code</Heading>
        <Text style={s.paragraph}>
          Enter the code below to confirm your identity.
        </Text>

        <Text style={s.code}>{token}</Text>

        <Text style={s.muted}>
          This code expires shortly. If you didn't request it, you can safely ignore
          this email.
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

export default ReauthenticationEmail
