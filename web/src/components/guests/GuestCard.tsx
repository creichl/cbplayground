import { Alert, Anchor, Badge, Button, Chip, Group, Paper, SimpleGrid, Skeleton, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { guestErrorMessage } from '../../api/guestErrors.ts'
import { type GuestDetail, guestProfileMaxLengths, useGuest, useUpdateGuest } from '../../api/guests.ts'
import type { GuestTag, Reservation } from '../../api/reservations.ts'
import { formatShortDate } from '../../i18n/format.ts'
import { ErrorAlert } from '../ErrorAlert.tsx'
import { isFirstVisit } from './firstVisit.ts'
import { guestTags, tagLabels } from './labels.ts'

/**
 * The guest's profile in the reservation drawer: the figures (visits, no-shows, cancellations, last visit), the tags, the notes and
 * the allergies, which the staff edit here; and the way to the guest in the directory. A reservation without a phone number and
 * email address has no profile, which the card says.
 */
export function GuestCard({ reservation }: { reservation: Reservation }) {
  const { t } = useTranslation()
  const guest = useGuest(reservation.guestId)

  if (reservation.guestId === null) {
    return (
      <Text size="sm" c="dimmed">
        {t('guests.card.noProfile')}
      </Text>
    )
  }
  return (
    <Paper withBorder radius="md" p="md" component="section" aria-label={t('guests.card.title')}>
      {guest.isPending ? (
        <Skeleton h={120} radius="md" />
      ) : guest.isError ? (
        <ErrorAlert error={guest.error} onRetry={() => void guest.refetch()} />
      ) : (
        <ProfileView guest={guest.data} firstVisit={isFirstVisit(reservation)} />
      )}
    </Paper>
  )
}

function ProfileView({ guest, firstVisit }: { guest: GuestDetail; firstVisit: boolean }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? 'en'
  const [editing, setEditing] = useState(false)
  const { figures } = guest

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2}>
          <Text fw={650}>{t('guests.card.title')}</Text>
          <Anchor component={Link} to={`/frontdesk/guests/${encodeURIComponent(guest.id)}`} size="sm">
            {t('guests.card.openInDirectory', { name: guest.name })}
          </Anchor>
        </Stack>
        {firstVisit && (
          <Badge variant="light" color="gray">
            {t('guests.markers.firstVisit')}
          </Badge>
        )}
      </Group>

      <SimpleGrid cols={{ base: 2, xs: 4 }} spacing="xs">
        <Figure label={t('guests.figures.visits')} value={String(figures.visits)} />
        <Figure label={t('guests.figures.noShows')} value={String(figures.noShows)} />
        <Figure label={t('guests.figures.cancellations')} value={String(figures.cancellations)} />
        <Figure
          label={t('guests.figures.lastVisit')}
          value={figures.lastVisit === null ? t('guests.figures.never') : formatShortDate(figures.lastVisit, language)}
        />
      </SimpleGrid>

      {editing ? (
        <ProfileForm guest={guest} onDone={() => setEditing(false)} />
      ) : (
        <>
          {guest.tags.length > 0 && (
            <Group gap={6}>
              {guest.tags.map((tag) => (
                <Badge key={tag} variant="light" color={tag === 'Vip' ? 'yellow' : tag === 'Difficult' ? 'red' : 'blue'}>
                  {t(tagLabels[tag])}
                </Badge>
              ))}
            </Group>
          )}
          {guest.allergyNotes !== null && (
            <Alert color="red" variant="light" title={t('guests.fields.allergyNotes')} p="xs">
              {guest.allergyNotes}
            </Alert>
          )}
          {guest.notes !== null && (
            <Stack gap={2}>
              <Text size="sm" fw={500}>
                {t('guests.fields.notes')}
              </Text>
              <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
                {guest.notes}
              </Text>
            </Stack>
          )}
          <Group>
            <Button variant="default" size="sm" onClick={() => setEditing(true)}>
              {t('guests.card.edit')}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={600} className="tabular-nums">
        {value}
      </Text>
    </Stack>
  )
}

/** Tags, notes and allergies of the profile; name and contact stay as they are (they are changed in the directory). */
function ProfileForm({ guest, onDone }: { guest: GuestDetail; onDone: () => void }) {
  const { t } = useTranslation()
  const updateGuest = useUpdateGuest()
  const [tags, setTags] = useState<string[]>(guest.tags)
  const [notes, setNotes] = useState(guest.notes ?? '')
  const [allergyNotes, setAllergyNotes] = useState(guest.allergyNotes ?? '')

  const save = () => {
    updateGuest.mutate(
      {
        id: guest.id,
        name: guest.name,
        phone: guest.phone,
        email: guest.email,
        notes: notes.trim() || null,
        allergyNotes: allergyNotes.trim() || null,
        tags: guestTags.filter((tag) => tags.includes(tag)),
      },
      {
        onSuccess: (saved) => {
          notifications.show({ color: 'green', message: t('guests.saved', { name: saved.name }) })
          onDone()
        },
      },
    )
  }

  return (
    <Stack gap="sm">
      <Stack gap={6}>
        <Text size="sm" fw={500} id={`guest-tags-${guest.id}`}>
          {t('guests.fields.tags')}
        </Text>
        <Chip.Group multiple value={tags} onChange={setTags}>
          <Group gap={6} role="group" aria-labelledby={`guest-tags-${guest.id}`}>
            {guestTags.map((tag: GuestTag) => (
              <Chip key={tag} value={tag} size="sm">
                {t(tagLabels[tag])}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </Stack>
      <Textarea
        label={t('guests.fields.allergyNotes')}
        autosize
        minRows={1}
        maxLength={guestProfileMaxLengths.allergyNotes}
        value={allergyNotes}
        onChange={(event) => setAllergyNotes(event.currentTarget.value)}
      />
      <Textarea
        label={t('guests.fields.notes')}
        autosize
        minRows={2}
        maxLength={guestProfileMaxLengths.notes}
        value={notes}
        onChange={(event) => setNotes(event.currentTarget.value)}
      />
      {updateGuest.error !== null && (
        <Alert color="red" variant="light" title={t('guests.notSaved')}>
          {guestErrorMessage(updateGuest.error, t)}
        </Alert>
      )}
      <Group justify="flex-end">
        <Button variant="default" size="sm" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button size="sm" onClick={save} loading={updateGuest.isPending}>
          {t('guests.card.save')}
        </Button>
      </Group>
    </Stack>
  )
}
