import { Anchor, Badge, Group } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

type BrandProps = {
  /** Where the product name links to. */
  to: string
  /** Name of the area (e.g. Admin), shown as a badge from the "xs" breakpoint on. */
  area?: string
}

export function Brand({ to, area }: BrandProps) {
  const { t } = useTranslation()

  return (
    <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
      <Anchor component={Link} to={to} underline="never" fw={700} size="md" c="brand.9">
        {t('app.name')}
      </Anchor>
      {area !== undefined && (
        <Badge variant="light" visibleFrom="xs">
          {area}
        </Badge>
      )}
    </Group>
  )
}
