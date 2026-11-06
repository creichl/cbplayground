import { Box, Button, Group, Modal, Paper, Stack, Text, Transition } from '@mantine/core'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker } from 'react-router'

/** The height the bar takes at the bottom of the window, kept free below the page so the bar covers nothing (and above it for the notifications, src/styles/app.css). */
const barHeight = 64

type SaveBarProps = {
  /** The form differs from the saved state. */
  dirty: boolean
  saving: boolean
  /** Puts the saved values back into the form. */
  onDiscard: () => void
}

/**
 * The save bar of an admin settings form, placed inside its form: fixed at the bottom of the window as soon as the form
 * differs from the saved state, with "Discard" and "Save" (a submit button). While there are unsaved changes, leaving the
 * page in the app (sidebar, back button) asks first, and closing or reloading the tab lets the browser warn.
 */
export function SaveBar({ dirty, saving, onDiscard }: SaveBarProps) {
  const { t } = useTranslation()
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    if (!dirty) {
      return
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return (
    <>
      {dirty && <Box h={barHeight} aria-hidden />}
      <Transition mounted={dirty} transition="slide-up" duration={150}>
        {(style) => (
          <Paper
            data-save-bar
            role="region"
            aria-label={t('unsavedChanges.bar')}
            shadow="md"
            radius={0}
            px="lg"
            withBorder
            style={{
              ...style,
              position: 'fixed',
              bottom: 0,
              left: 'var(--app-shell-navbar-offset, 0rem)',
              right: 0,
              height: barHeight,
              zIndex: 'var(--mantine-z-index-app)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Group justify="space-between" wrap="nowrap" gap="sm" w="100%">
              <Text fw={600} truncate>
                {t('unsavedChanges.bar')}
              </Text>
              <Group gap="xs" wrap="nowrap">
                <Button variant="default" onClick={onDiscard} disabled={saving}>
                  {t('unsavedChanges.discard')}
                </Button>
                <Button type="submit" loading={saving}>
                  {t('common.save')}
                </Button>
              </Group>
            </Group>
          </Paper>
        )}
      </Transition>

      <Modal opened={blocker.state === 'blocked'} onClose={() => blocker.reset?.()} title={t('unsavedChanges.leaveTitle')} centered>
        <Stack gap="lg">
          <Text size="sm">{t('unsavedChanges.leaveText')}</Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="light" color="red" onClick={() => blocker.proceed?.()}>
              {t('unsavedChanges.leave')}
            </Button>
            <Button onClick={() => blocker.reset?.()} data-autofocus>
              {t('unsavedChanges.stay')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
