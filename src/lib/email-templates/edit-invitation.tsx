import React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface EditItem {
  title: string
  imageUrl?: string | null
  priceFormatted?: string
}

interface Props {
  clientName?: string
  shopperName?: string
  editTitle?: string
  note?: string | null
  items?: EditItem[]
  viewUrl?: string
}

const EditInvitation = ({
  clientName,
  shopperName = 'Your Sellier shopper',
  editTitle = 'A personal edit for you',
  note,
  items = [],
  viewUrl = 'https://sellierknightsbridge.com',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{shopperName} has curated an edit for you</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>SELLIER</Text>
        <Hr style={hr} />

        <Heading style={heading}>{editTitle}</Heading>

        <Text style={paragraph}>
          {clientName ? `Dear ${clientName},` : 'Hello,'}
        </Text>
        <Text style={paragraph}>
          {shopperName} has personally selected the following pieces with you in mind.
        </Text>

        {note ? (
          <Section style={noteSection}>
            <Text style={noteText}>"{note}"</Text>
            <Text style={noteAuthor}>— {shopperName}</Text>
          </Section>
        ) : null}

        {items.length > 0 ? (
          <Section style={itemsSection}>
            {items.map((item, i) => (
              <Section key={i} style={itemRow}>
                {item.imageUrl ? (
                  <Img
                    src={item.imageUrl}
                    alt={item.title}
                    width="100"
                    height="120"
                    style={itemImg}
                  />
                ) : null}
                <Text style={itemTitle}>{item.title}</Text>
                {item.priceFormatted ? (
                  <Text style={itemPrice}>{item.priceFormatted}</Text>
                ) : null}
              </Section>
            ))}
          </Section>
        ) : null}

        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button href={viewUrl} style={button}>
            View your edit
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          Sellier Knightsbridge ·{' '}
          <Link href="https://sellierknightsbridge.com" style={footerLink}>
            sellierknightsbridge.com
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: EditInvitation,
  subject: ({ editTitle }: { editTitle?: string }) =>
    editTitle ? `${editTitle} — a personal edit from Sellier` : 'A personal edit from Sellier',
  displayName: 'Personal edit invitation',
  previewData: {
    clientName: 'Madeleine',
    shopperName: 'Charlotte at Sellier',
    editTitle: 'Spring picks for you',
    note: 'Saw this Birkin and immediately thought of you.',
    items: [
      { title: 'Hermès Birkin 30 Togo', priceFormatted: '£18,500' },
      { title: 'Chanel Classic Flap Medium', priceFormatted: '£7,200' },
    ],
    viewUrl: 'https://sellierknightsbridge.com',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Georgia, "Times New Roman", serif',
}
const container = { padding: '32px 28px', maxWidth: '560px' }
const brand = {
  fontFamily: 'Helvetica, Arial, sans-serif',
  letterSpacing: '0.3em',
  fontSize: '12px',
  color: '#111',
  margin: 0,
}
const hr = { borderColor: '#e5e5e5', margin: '16px 0' }
const heading = {
  fontSize: '28px',
  fontWeight: 400 as const,
  color: '#111',
  margin: '24px 0 16px',
}
const paragraph = { fontSize: '15px', lineHeight: '24px', color: '#333' }
const noteSection = {
  backgroundColor: '#f7f5f1',
  padding: '20px 24px',
  margin: '24px 0',
  borderLeft: '2px solid #111',
}
const noteText = { fontSize: '15px', fontStyle: 'italic' as const, color: '#333', margin: 0 }
const noteAuthor = {
  fontSize: '11px',
  letterSpacing: '0.15em',
  textTransform: 'uppercase' as const,
  color: '#666',
  marginTop: '12px',
}
const itemsSection = { margin: '24px 0' }
const itemRow = { padding: '12px 0', borderBottom: '1px solid #eee' }
const itemImg = { display: 'block', marginBottom: '8px', objectFit: 'cover' as const }
const itemTitle = { fontSize: '14px', color: '#111', margin: '4px 0' }
const itemPrice = { fontSize: '13px', color: '#666', margin: 0 }
const button = {
  backgroundColor: '#111',
  color: '#fff',
  padding: '14px 32px',
  fontSize: '11px',
  letterSpacing: '0.25em',
  textTransform: 'uppercase' as const,
  textDecoration: 'none',
  fontFamily: 'Helvetica, Arial, sans-serif',
}
const footer = {
  fontSize: '11px',
  color: '#999',
  textAlign: 'center' as const,
  fontFamily: 'Helvetica, Arial, sans-serif',
}
const footerLink = { color: '#999', textDecoration: 'underline' }
