import { Group, Stack, Text, Title } from '@mantine/core'
import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: ReactNode
  /** One sentence of what the page is for. */
  description: ReactNode
  /** The page's main action, on the right. */
  action?: ReactNode
}

/** The header of every admin page: title, what the page is for and its main action on the right. */
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end" gap="sm">
      <Stack gap={4} style={{ flex: '1 1 320px' }}>
        <Title order={2}>{title}</Title>
        <Text c="dimmed">{description}</Text>
      </Stack>
      {action}
    </Group>
  )
}
