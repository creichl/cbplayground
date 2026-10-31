import { Anchor, Button, Card, Code, CopyButton, Group, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCurrentUser } from '../api/auth.ts'
import { type Language, languages } from '../i18n/index.ts'
import { heightMessageType } from '../layouts/EmbedLayout.tsx'

/** Height of the iframe until the embed reports its own, and for websites that leave out the script. */
const defaultHeight = 720

/** Escapes a value for an HTML attribute in double quotes. */
function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** The snippet for the restaurant's website: the iframe plus a short script that fits its height to the booking. */
function embedSnippet(origin: string, slug: string, embedUrl: string, title: string) {
  const id = `cbplayground-${slug}`
  return `<iframe id="${id}" src="${embedUrl}" title="${escapeAttribute(title)}" style="width: 100%; height: ${defaultHeight}px; border: 0;"></iframe>
<script>
  window.addEventListener('message', function (event) {
    var frame = document.getElementById('${id}');
    if (frame && event.source === frame.contentWindow && event.origin === '${origin}' &&
        event.data && event.data.type === '${heightMessageType}' && typeof event.data.height === 'number') {
      frame.style.height = event.data.height + 'px';
    }
  });
</script>`
}

/** Admin page "Website embed": the snippet in the chosen language to copy, the direct link and a live preview. */
export function EmbedSnippetPage() {
  const { t, i18n } = useTranslation()
  const currentUser = useCurrentUser()
  // The admin area is only shown to a signed-in Tenant Admin, who always has a restaurant.
  const tenant = currentUser.data?.tenant ?? null
  const [language, setLanguage] = useState<Language>((i18n.resolvedLanguage ?? 'en') as Language)

  if (tenant === null) {
    return null
  }

  const origin = window.location.origin
  const slug = encodeURIComponent(tenant.slug)
  const embedUrl = `${origin}/embed/${slug}?lang=${language}`
  const bookingUrl = `${origin}/r/${slug}`
  // The title names the booking for screen readers on the restaurant's website, in the language of the embed.
  const frameTitle = i18n.getFixedT(language)('embed.admin.frameTitle', { name: tenant.name })
  const snippet = embedSnippet(origin, slug, embedUrl, frameTitle)

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2}>{t('embed.admin.title')}</Title>
        <Text c="dimmed">{t('embed.admin.intro')}</Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Stack gap="lg">
          <Card>
            <Stack gap="md">
              <Select
                label={t('embed.admin.language')}
                description={t('embed.admin.languageDescription')}
                data={languages.map((option) => ({ value: option, label: t(`language.names.${option}`) }))}
                value={language}
                onChange={(value) => {
                  if (value !== null) {
                    setLanguage(value as Language)
                  }
                }}
                allowDeselect={false}
                maw={280}
              />
              <Stack gap={4}>
                <Text fw={500} size="sm">
                  {t('embed.admin.snippet')}
                </Text>
                <Code block style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {snippet}
                </Code>
                <Text size="xs" c="dimmed">
                  {t('embed.admin.snippetHint', { height: defaultHeight })}
                </Text>
              </Stack>
              <Group>
                <CopyButton value={snippet}>
                  {({ copied, copy }) => (
                    <Button onClick={copy} color={copied ? 'green' : undefined}>
                      {copied ? t('embed.admin.copied') : t('embed.admin.copy')}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </Stack>
          </Card>

          <Card>
            <Stack gap={4}>
              <Text fw={500} size="sm">
                {t('embed.admin.directLink')}
              </Text>
              <Text size="sm" c="dimmed">
                {t('embed.admin.directLinkHint')}
              </Text>
              <Anchor href={bookingUrl} target="_blank" rel="noopener" style={{ wordBreak: 'break-all' }}>
                {bookingUrl}
              </Anchor>
            </Stack>
          </Card>
        </Stack>

        <Stack gap="xs">
          <Title order={3} size="h4">
            {t('embed.admin.preview')}
          </Title>
          <Text size="sm" c="dimmed">
            {t('embed.admin.previewHint')}
          </Text>
          <Card padding="md">
            <EmbedPreview src={embedUrl} title={frameTitle} />
          </Card>
        </Stack>
      </SimpleGrid>
    </Stack>
  )
}

/** The embed as a real iframe, with the same height fitting as the snippet's script. */
function EmbedPreview({ src, title }: { src: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(defaultHeight)

  useEffect(() => {
    const onMessage = (event: MessageEvent<unknown>) => {
      const data = event.data
      if (
        event.source === frameRef.current?.contentWindow &&
        event.origin === window.location.origin &&
        typeof data === 'object' &&
        data !== null &&
        'type' in data &&
        data.type === heightMessageType &&
        'height' in data &&
        typeof data.height === 'number'
      ) {
        setHeight(data.height)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return <iframe ref={frameRef} src={src} title={title} style={{ display: 'block', width: '100%', height, border: 0 }} />
}
