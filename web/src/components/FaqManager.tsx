import { ActionIcon, Alert, Button, Group, Modal, Paper, Skeleton, Stack, Text, Textarea, TextInput, Tooltip } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import type { ParseKeys } from 'i18next'
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.ts'
import {
  type Faq,
  type FaqError,
  maxAnswerLength,
  maxFaqs,
  maxQuestionLength,
  useDeleteFaq,
  useFaqs,
  useReorderFaqs,
  useSaveFaq,
} from '../api/restaurantDetails.ts'
import { ErrorAlert } from './ErrorAlert.tsx'

/** The API's error codes of a question and their texts. */
const faqErrors: Record<FaqError, ParseKeys> = {
  invalid_question: 'restaurantDetails.admin.errors.invalidQuestion',
  invalid_answer: 'restaurantDetails.admin.errors.invalidAnswer',
  faq_full: 'restaurantDetails.admin.errors.faqFull',
}

/**
 * The restaurant's frequently asked questions on the profile page: the list in its order with "Move up", "Move down", "Edit"
 * (in a dialog) and "Delete" (after asking), and "Add question" up to the limit. Every change is saved right away, without
 * the page's save bar.
 */
export function FaqManager() {
  const { t } = useTranslation()
  const faqs = useFaqs()
  const reorder = useReorderFaqs()
  const remove = useDeleteFaq()
  // null: no dialog; 'new': a new question.
  const [editing, setEditing] = useState<Faq | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Faq | null>(null)

  if (faqs.isPending) {
    return (
      <Stack gap="xs">
        <Skeleton h={56} />
        <Skeleton h={56} />
      </Stack>
    )
  }
  if (faqs.isError) {
    return <ErrorAlert error={faqs.error} onRetry={() => void faqs.refetch()} />
  }

  const list = faqs.data
  const full = list.length >= maxFaqs

  function move(index: number, direction: -1 | 1) {
    const ids = list.map((faq) => faq.id)
    ;[ids[index], ids[index + direction]] = [ids[index + direction], ids[index]]
    reorder.mutate(ids)
  }

  return (
    <Stack gap="md">
      {list.length === 0 ? (
        <Text c="dimmed">{t('restaurantDetails.admin.faq.empty')}</Text>
      ) : (
        <Stack gap="xs" component="ol" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {list.map((faq, index) => (
            <Paper key={faq.id} component="li" withBorder radius="md" p="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Text fw={600} style={{ overflowWrap: 'anywhere' }}>
                    {faq.question}
                  </Text>
                  <Text size="sm" c="dimmed" lineClamp={2} style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>
                    {faq.answer}
                  </Text>
                </Stack>
                <Group gap={4} wrap="nowrap">
                  <Tooltip label={t('restaurantDetails.admin.faq.moveUp', { question: faq.question })}>
                    <ActionIcon
                      variant="default"
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                      aria-label={t('restaurantDetails.admin.faq.moveUp', { question: faq.question })}
                    >
                      <ChevronUpIcon size={16} aria-hidden="true" />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t('restaurantDetails.admin.faq.moveDown', { question: faq.question })}>
                    <ActionIcon
                      variant="default"
                      disabled={index === list.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                      aria-label={t('restaurantDetails.admin.faq.moveDown', { question: faq.question })}
                    >
                      <ChevronDownIcon size={16} aria-hidden="true" />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t('restaurantDetails.admin.faq.edit', { question: faq.question })}>
                    <ActionIcon variant="subtle" onClick={() => setEditing(faq)} aria-label={t('restaurantDetails.admin.faq.edit', { question: faq.question })}>
                      <PencilIcon size={16} aria-hidden="true" />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t('restaurantDetails.admin.faq.delete', { question: faq.question })}>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => {
                        remove.reset()
                        setDeleting(faq)
                      }}
                      aria-label={t('restaurantDetails.admin.faq.delete', { question: faq.question })}
                    >
                      <Trash2Icon size={16} aria-hidden="true" />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      {reorder.error !== null && <ErrorAlert error={reorder.error} />}

      <Group justify="space-between" gap="sm">
        <Button variant="light" disabled={full} onClick={() => setEditing('new')}>
          {t('restaurantDetails.admin.faq.add')}
        </Button>
        <Text size="sm" c="dimmed">
          {full ? t('restaurantDetails.admin.faq.full', { max: maxFaqs }) : t('restaurantDetails.admin.faq.count', { used: list.length, max: maxFaqs })}
        </Text>
      </Group>

      {editing !== null && <FaqModal faq={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      <Modal opened={deleting !== null} onClose={() => setDeleting(null)} title={t('restaurantDetails.admin.faq.deleteTitle')}>
        <Stack gap="md">
          {deleting !== null && <Text size="sm">{t('restaurantDetails.admin.faq.deleteText', { question: deleting.question })}</Text>}
          {remove.error !== null && <ErrorAlert error={remove.error} />}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button color="red" loading={remove.isPending} onClick={() => deleting !== null && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>
              {t('restaurantDetails.admin.faq.deleteConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

/** Adds a question (`faq` null) or changes one; saved when the dialog is confirmed. */
function FaqModal({ faq, onClose }: { faq: Faq | null; onClose: () => void }) {
  const { t } = useTranslation()
  const save = useSaveFaq()
  const form = useForm({
    mode: 'controlled',
    initialValues: { question: faq?.question ?? '', answer: faq?.answer ?? '' },
    validate: {
      question: (value) => (value.trim() === '' ? t('restaurantDetails.admin.errors.invalidQuestion') : null),
      answer: (value) => (value.trim() === '' ? t('restaurantDetails.admin.errors.invalidAnswer') : null),
    },
  })

  const errorCode = save.error instanceof ApiError ? save.error.code : null
  const saveError = errorCode !== null && errorCode in faqErrors ? faqErrors[errorCode as FaqError] : null

  const submit = form.onSubmit((values) =>
    save.mutate(
      { id: faq?.id ?? null, question: values.question.trim(), answer: values.answer.trim() },
      {
        onSuccess: () => {
          notifications.show({ color: 'green', message: t('restaurantDetails.admin.faq.saved') })
          onClose()
        },
      },
    ),
  )

  return (
    <Modal opened onClose={onClose} title={faq === null ? t('restaurantDetails.admin.faq.addTitle') : t('restaurantDetails.admin.faq.editTitle')} size="lg">
      <form onSubmit={submit} noValidate>
        <Stack gap="md">
          <TextInput
            label={t('restaurantDetails.admin.faq.question')}
            maxLength={maxQuestionLength}
            description={t('restaurantDetails.admin.counter', { length: form.values.question.length, max: maxQuestionLength })}
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            data-autofocus
            {...form.getInputProps('question')}
          />
          <Textarea
            label={t('restaurantDetails.admin.faq.answer')}
            autosize
            minRows={3}
            maxLength={maxAnswerLength}
            description={t('restaurantDetails.admin.counter', { length: form.values.answer.length, max: maxAnswerLength })}
            inputWrapperOrder={['label', 'input', 'description', 'error']}
            {...form.getInputProps('answer')}
          />

          {save.error !== null &&
            (saveError !== null ? (
              <Alert color="red" variant="light">
                {t(saveError)}
              </Alert>
            ) : (
              <ErrorAlert error={save.error} />
            ))}

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
