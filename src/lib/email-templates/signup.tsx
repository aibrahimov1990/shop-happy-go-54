import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text, Hr,
} from '@react-email/components'
import * as s from './_styles'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, confirmationUrl }: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email for Sellier Knightsbridge</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>SELLIER</Text>
        <Hr style={s.hr} />

        <Heading style={s.heading}>Welcome to Sellier</Heading>
        <Text style={s.paragraph}>
          Please confirm your email address to complete your {siteName} account and start
          discovering hand-picked pieces from our edit.
        </Text>

        <Section style={s.buttonWrap}>
          <Button href={confirmationUrl} style={s.button}>Confirm email</Button>
        </Section>

        <Text style={s.muted}>
          If you didn't create an account, you can safely ignore this email.
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

export default SignupEmail
