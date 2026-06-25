import * as React from 'react'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text, Hr,
} from '@react-email/components'
import * as s from './_styles'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to Sellier Knightsbridge</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.brand}>SELLIER</Text>
        <Hr style={s.hr} />

        <Heading style={s.heading}>You're invited</Heading>
        <Text style={s.paragraph}>
          You've been invited to join {siteName}. Accept your invitation below to set up
          your account.
        </Text>

        <Section style={s.buttonWrap}>
          <Button href={confirmationUrl} style={s.button}>Accept invitation</Button>
        </Section>

        <Text style={s.muted}>
          If you weren't expecting this, you can safely ignore this email.
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

export default InviteEmail
